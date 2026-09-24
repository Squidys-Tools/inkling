//! Loopback capture receiver for the browser extension (Option B transport).
//!
//! The app binds `127.0.0.1` (ephemeral unless the last successful port is
//! free) and exposes `POST /v1/captures` plus `GET /v1/health` to the local
//! browser extension. Authentication is a per-install bearer token generated
//! with the OS RNG and persisted beside the library; the token is never
//! logged. The last bound port is also persisted beside the library so the
//! extension's stored base URL survives restarts.
//!
//! Security posture, in one place:
//! - Loopback only. The socket binds `127.0.0.1` explicitly, so no LAN peer
//!   can reach it. `Origin` is checked against extension / null / Tauri
//!   schemes as a second gate, but the bearer token is the real credential.
//! - The receiver socket itself is loopback-exempt from the SSRF guards used
//!   for outbound fetches: binding `127.0.0.1` is the point, and any URL the
//!   extension submits is only *stored*, never fetched by this module. If a
//!   future consumer re-fetches a submitted URL, that fetch must go through
//!   the same `parseHttpUrl`-style guards (http/https only, no credentials,
//!   no private-network hosts) before any request is issued.
//! - Extension-supplied HTML is untrusted input. The receiver scrubs the
//!   executable subset (scripts, handlers, javascript: URLs, srcdoc,
//!   plugins, non-allowlisted embeds) before storage, mirroring the
//!   dangerous-subset rules of `sanitizeHtml`; the TypeScript pass stays
//!   authoritative for the finer rules and must still run on any path that
//!   re-processes this HTML (see `packages/ingestion-shared` trust contract).
//!
//! Implementation notes: plain `std::net` + one thread per connection. That
//! is deliberately the smallest fit for the existing Cargo tree (no new HTTP
//! framework), and capture traffic is one request per user save.

use std::{
    collections::HashMap,
    fs,
    io::{BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

/// Cap for a single capture JSON body. Extension payloads carry extracted
/// article HTML, so this is generous; anything larger is rejected with 413.
pub const MAX_JSON_BYTES: usize = 5 * 1024 * 1024;
/// Cap for the HTTP head (request line + headers). Bodies stream separately.
const MAX_HEAD_BYTES: usize = 64 * 1024;
/// Basic rate limit: at most this many requests per window per loopback peer.
const RATE_LIMIT_MAX: usize = 60;
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);
const READ_TIMEOUT: Duration = Duration::from_secs(10);

const TOKEN_FILE_NAME: &str = "pairing_token";
/// Last successful loopback port, beside the library. Rebinding it on boot
/// keeps the extension's stored `inkling.base-url` valid across restarts.
const PORT_FILE_NAME: &str = "capture_port";

/// Request pairs (method, path) served by the receiver.
const HEALTH_PATH: &str = "/v1/health";
const CAPTURES_PATH: &str = "/v1/captures";

#[derive(Default)]
pub struct CaptureServerState {
    port: Mutex<Option<u16>>,
    pairing_token: Mutex<String>,
    request_times: Mutex<Vec<Instant>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub health_url: Option<String>,
    /// `http://127.0.0.1:{port}` for the extension options "App address" field.
    pub base_url: Option<String>,
}

/// Request body: `PageCapturePayloadV1` from `packages/ingestion-shared`
/// (version, kind, url, title, defuddledHtml, text, author?, publishedDate?,
/// imageUrls). Field rules mirror its `parsePageCapturePayload` so both sides
/// reject the same shapes; capture stays forgiving where the schema is
/// (blank title falls back to the hostname, partial content is kept).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureRequest {
    version: u8,
    kind: String,
    url: String,
    #[serde(default)]
    title: String,
    /// Untrusted page content. Scrubbed by `scrub_extension_html` before
    /// storage; never stored or rendered raw.
    #[serde(default)]
    defuddled_html: String,
    #[serde(default)]
    text: String,
    author: Option<String>,
    published_date: Option<String>,
    #[serde(default)]
    image_urls: Vec<String>,
    /// Absolute http(s) favicon URL for the card seal; stored only when valid.
    #[serde(default)]
    favicon: Option<String>,
}

/// Upper bound from `packages/ingestion-shared` (`MAX_DEFUDDLED_HTML_BYTES`);
/// must match that file exactly.
const MAX_DEFUDDLED_HTML_BYTES: usize = 2 * 1024 * 1024;
const MAX_IMAGE_URLS: usize = 200;

// ---------------------------------------------------------------------------
// Pairing token: OS RNG, persisted beside the library, never logged.
// ---------------------------------------------------------------------------

/// A 256-bit bearer token rendered as 64 hex chars. `Uuid::new_v4` draws from
/// the OS RNG (getrandom), so two v4 UUIDs concatenated give 244 bits of
/// entropy without adding a randomness crate.
fn generate_pairing_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn token_looks_valid(token: &str) -> bool {
    let token = token.trim();
    (32..=128).contains(&token.len()) && token.chars().all(|c| c.is_ascii_alphanumeric())
}

fn token_file_path(app: &AppHandle) -> Option<PathBuf> {
    // Sibling of library.sqlite3 via the same resolver storage uses. Never
    // probes for the database file: if the library is moved or deleted the
    // token must stay in the same directory family or pairing silently flips.
    crate::storage::library_directory(app)
        .ok()
        .map(|dir| dir.join(TOKEN_FILE_NAME))
}

fn load_or_generate_token(app: &AppHandle) -> String {
    if let Some(path) = token_file_path(app) {
        if let Ok(raw) = fs::read_to_string(&path) {
            if token_looks_valid(&raw) {
                return raw.trim().to_owned();
            }
        }
        let token = generate_pairing_token();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        // A failed write is non-fatal: the in-memory token still gates this
        // run, and generation is retried on the next launch.
        let _ = fs::write(&path, &token);
        return token;
    }
    generate_pairing_token()
}

fn persist_token(app: &AppHandle, token: &str) -> Result<(), String> {
    // Same resolver as load: a successful persist always writes beside the
    // library, never into a one-off fallback directory.
    let path =
        token_file_path(app).ok_or_else(|| "cannot determine the library directory".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create library directory: {e}"))?;
    }
    fs::write(&path, token).map_err(|e| format!("cannot persist pairing token: {e}"))?;
    Ok(())
}

fn port_file_path(app: &AppHandle) -> Option<PathBuf> {
    crate::storage::library_directory(app)
        .ok()
        .map(|dir| dir.join(PORT_FILE_NAME))
}

/// Last successful port from a previous run, if it is still a usable number.
fn load_preferred_port(app: &AppHandle) -> Option<u16> {
    let path = port_file_path(app)?;
    let raw = fs::read_to_string(path).ok()?;
    raw.trim().parse::<u16>().ok().filter(|port| *port != 0)
}

/// Best-effort: a failed write only means the next launch may pick a new port.
fn persist_port(app: &AppHandle, port: u16) {
    if let Some(path) = port_file_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(path, port.to_string());
    }
}

// ---------------------------------------------------------------------------
// Request guards: auth, origin, rate limit. All pure and unit-tested.
// ---------------------------------------------------------------------------

fn bearer_token(headers: &HashMap<String, String>) -> Option<&str> {
    let value = headers.get("authorization")?;
    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty())
}

/// Constant-time comparison so token mismatches leak nothing via timing.
fn tokens_equal(left: &str, right: &str) -> bool {
    let left = left.as_bytes();
    let right = right.as_bytes();
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

/// The bearer token is the real gate; Origin is defense in depth against a
/// hostile web page reaching the loopback socket from the user's own browser.
/// Extension schemes, `null` (extension sandbox pages), and the Tauri webview
/// schemes are allowed. Absent Origin (curl, native clients) passes here and
/// still needs the bearer token.
fn origin_allowed(origin: Option<&str>) -> bool {
    let Some(origin) = origin.map(str::trim).filter(|o| !o.is_empty()) else {
        return true;
    };
    if origin == "null" {
        return true;
    }
    // Extension and app custom schemes: scheme prefix is sufficient.
    if [
        "chrome-extension://",
        "moz-extension://",
        "safari-web-extension://",
        "tauri://",
        "inkling://",
    ]
    .iter()
    .any(|prefix| origin.starts_with(prefix))
    {
        return true;
    }
    // Tauri webview http(s) origin: exact scheme+host (optional :port digits).
    // A starts_with check would also accept https://tauri.localhost.evil.com.
    fn tauri_localhost_http(origin: &str, scheme: &str) -> bool {
        let Some(rest) = origin.strip_prefix(scheme) else {
            return false;
        };
        rest == "tauri.localhost"
            || rest
                .strip_prefix("tauri.localhost:")
                .is_some_and(|port| !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()))
    }
    tauri_localhost_http(origin, "https://") || tauri_localhost_http(origin, "http://")
}

fn check_rate_limit(state: &CaptureServerState) -> bool {
    let mut times = state
        .request_times
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    times.retain(|t| now.duration_since(*t) < RATE_LIMIT_WINDOW);
    if times.len() >= RATE_LIMIT_MAX {
        return false;
    }
    times.push(now);
    true
}

// ---------------------------------------------------------------------------
// Capture URL validation. Mirrors the frontend `parseHttpUrl` guards for
// stored URLs: http/https only, host required, no credentials, sane length.
// Private-network hosts are *accepted* here on purpose: the user explicitly
// captured that page, and this module never fetches the URL (see module docs
// for the re-fetch rule). The loopback receiver socket itself is likewise
// exempt: binding 127.0.0.1 is the design, not a bypass.
// ---------------------------------------------------------------------------

fn validate_capture_url(input: &str) -> Result<String, String> {
    const MAX_URL_LENGTH: usize = 8_192;
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_URL_LENGTH {
        return Err("url must be 1-8192 characters".into());
    }
    let parsed = url::Url::parse(trimmed).map_err(|_| "url could not be parsed".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("only HTTP and HTTPS URLs can be saved".into());
    }
    if parsed.host_str().map_or(true, |h| h.is_empty()) {
        return Err("url must include a host".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("url must not contain credentials".into());
    }
    Ok(parsed.to_string())
}

fn capped_string(value: Option<String>, max: usize, field: &str) -> Result<Option<String>, String> {
    match value.map(|v| v.trim().to_owned()) {
        Some(v) if v.len() > max => Err(format!("{field} must be at most {max} characters")),
        Some(v) if v.is_empty() => Ok(None),
        other => Ok(other),
    }
}

fn validate_capture_payload(body: &[u8]) -> Result<crate::storage::CreateUrlInput, String> {
    let request: CaptureRequest = serde_json::from_slice(body)
        .map_err(|_| "request body must be a JSON capture object".to_string())?;
    if request.version != 1 {
        return Err("unsupported payload version".into());
    }
    if request.kind != "page" {
        return Err("unsupported payload kind".into());
    }
    let source_url = validate_capture_url(&request.url)?;
    if request.defuddled_html.len() > MAX_DEFUDDLED_HTML_BYTES {
        return Err("content exceeds the payload size limit".into());
    }
    let hostname = url::Url::parse(&source_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_default();
    // Forgiving like the rest of capture: a blank title falls back to the
    // hostname instead of failing the save.
    let title = {
        let trimmed = request.title.trim();
        if trimmed.is_empty() {
            hostname.clone()
        } else {
            truncate_chars(trimmed, 500)
        }
    };
    let author = capped_string(request.author, 240, "author")?;
    let published_date = capped_string(request.published_date, 64, "publishedDate")?;
    // Server-side scrub of the untrusted extension HTML. This mirrors the
    // dangerous-subset rules of `sanitizeHtml` (no scripts, handlers,
    // javascript: URLs, srcdoc, plugins, or non-allowlisted embeds); the TS
    // pass stays authoritative for the finer rules and must still run on any
    // path that re-processes this HTML.
    let html = scrub_extension_html(&request.defuddled_html, &source_url);
    let text = truncate_chars(request.text.trim(), 200_000);
    let image_urls = clean_image_urls(request.image_urls);
    let favicon = clean_favicon(request.favicon);

    let mut metadata = serde_json::Map::new();
    metadata.insert(
        "sourceUrl".into(),
        serde_json::Value::String(source_url.clone()),
    );
    metadata.insert("text".into(), serde_json::Value::String(text.clone()));
    metadata.insert("html".into(), serde_json::Value::String(html));
    metadata.insert(
        "imageUrls".into(),
        serde_json::Value::Array(
            image_urls
                .into_iter()
                .map(serde_json::Value::String)
                .collect(),
        ),
    );
    if let Some(favicon) = favicon {
        metadata.insert("favicon".into(), serde_json::Value::String(favicon));
    }
    metadata.insert("safeEmbeds".into(), serde_json::Value::Array(Vec::new()));
    if let Some(author) = author.clone() {
        metadata.insert("author".into(), serde_json::Value::String(author));
    }
    if let Some(published_date) = published_date {
        metadata.insert(
            "publishedDate".into(),
            serde_json::Value::String(published_date),
        );
    }
    // Marker for downstream readers: this HTML bypassed server-side fetch, so
    // it never passed through extraction. It passed the receiver scrub, and
    // any re-processing must still route through `sanitizeHtml`.
    metadata.insert(
        "origin".into(),
        serde_json::Value::String("browser-extension".into()),
    );
    metadata.insert("payloadVersion".into(), serde_json::Value::from(1));
    Ok(crate::storage::CreateUrlInput {
        source_url,
        title: (!title.is_empty()).then_some(title),
        description: None,
        body: text,
        metadata: Some(serde_json::Value::Object(metadata)),
    })
}

// ---------------------------------------------------------------------------
// Server-side scrub of untrusted extension HTML.
//
// Stored article HTML renders through `dangerouslySetInnerHTML` downstream,
// so the receiver removes the executable subset before storage: comments,
// script/style/template/object/applet/embed/form/frame content, link/meta/
// base tags, event-handler/style/srcdoc/srcset attributes, non-http(s) URL
// schemes, and iframes from non-allowlisted hosts (same host list as
// `SAFE_IFRAME_HOSTS` in html-safety.ts). The TypeScript `sanitizeHtml` pass
// stays authoritative for the finer rules (URL resolution, media filtering);
// any path that re-processes this HTML must run it.
// ---------------------------------------------------------------------------

/// Truncate to a character count (never splits UTF-8). Used for forgiving
/// fields where keeping a prefix beats rejecting the capture.
fn truncate_chars(value: &str, max: usize) -> String {
    if value.len() <= max {
        return value.to_owned();
    }
    value.chars().take(max).collect()
}

fn clean_image_urls(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for entry in values {
        let entry = entry.trim().to_owned();
        if entry.is_empty() || !seen.insert(entry.clone()) {
            continue;
        }
        let Ok(parsed) = url::Url::parse(&entry) else {
            continue;
        };
        if !matches!(parsed.scheme(), "http" | "https") {
            continue;
        }
        out.push(parsed.to_string());
        if out.len() >= MAX_IMAGE_URLS {
            break;
        }
    }
    out
}

/// Forgiving single-URL cleaner for the card seal favicon (http/https only).
fn clean_favicon(value: Option<String>) -> Option<String> {
    let entry = value?.trim().to_owned();
    if entry.is_empty() {
        return None;
    }
    let parsed = url::Url::parse(&entry).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }
    Some(parsed.to_string())
}

/// Iframe/embed hosts allowed by `SAFE_IFRAME_HOSTS` in html-safety.ts.
const SAFE_IFRAME_HOSTS: &[&str] = &[
    "loom.com",
    "open.spotify.com",
    "player.twitch.tv",
    "player.vimeo.com",
    "soundcloud.com",
    "w.soundcloud.com",
    "vimeo.com",
    "www.loom.com",
    "www.youtube-nocookie.com",
    "www.youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "youtube.com",
];

/// Elements whose whole subtree is dropped (scripts, plugins, forms).
const SKIP_CONTENT_TAGS: &[&str] = &[
    "script", "style", "template", "object", "applet", "embed", "form", "frame", "frameset",
    "noembed", "noframes",
];

/// Tags dropped without children (`<link>`, `<meta>`, `<base>` have none in a
/// fragment; their attributes alone can preload or redirect).
const DROP_TAGS: &[&str] = &["link", "meta", "base"];

/// Attributes treated as URLs and kept only for http(s) or relative values.
const URL_ATTRS: &[&str] = &[
    "href",
    "src",
    "poster",
    "cite",
    "action",
    "formaction",
    "data",
    "background",
    "xlink:href",
];

fn find_insensitive(haystack: &str, needle: &str, from: usize) -> Option<usize> {
    if needle.is_empty() || from >= haystack.len() {
        return None;
    }
    let hay = haystack.as_bytes();
    let ndl = needle.as_bytes();
    hay.get(from..)?
        .windows(ndl.len())
        .position(|w| w.eq_ignore_ascii_case(ndl))
        .map(|pos| from + pos)
}

fn tag_name(tag: &str) -> &str {
    let inner = tag.strip_prefix('<').unwrap_or(tag);
    let inner = inner.strip_prefix('/').unwrap_or(inner);
    let end = inner
        .find(|c: char| c.is_whitespace() || c == '/' || c == '>')
        .unwrap_or(inner.len());
    &inner[..end]
}

/// Byte index just past the tag ending at or after `from`, respecting quoted
/// attribute values. `None` when the tag never terminates.
fn tag_end(html: &str, from: usize) -> Option<usize> {
    let bytes = html.as_bytes();
    let mut i = from;
    let mut quote: Option<u8> = None;
    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = quote {
            if b == q {
                quote = None;
            }
        } else if b == b'"' || b == b'\'' {
            quote = Some(b);
        } else if b == b'>' {
            return Some(i + 1);
        }
        i += 1;
    }
    None
}

fn iframe_host_allowed(src: Option<&str>) -> bool {
    let Some(src) = src.map(str::trim).filter(|s| !s.is_empty()) else {
        return false;
    };
    let host = src
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or(""))
        .unwrap_or("");
    let host = host
        .split('@')
        .next_back()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    SAFE_IFRAME_HOSTS
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
}

/// Keep the attribute only when its URL value has no scheme or an http(s)
/// one; `javascript:`, `data:`, and friends are dropped with the attribute.
fn safe_url_attr(value: &str) -> bool {
    let value = value.trim_start_matches(|c: char| c.is_whitespace() || c.is_control());
    if value.is_empty() || value.starts_with('#') {
        return false;
    }
    match value.split_once(':') {
        None => true,
        Some((scheme, _)) if scheme.contains('/') => true,
        Some((scheme, _)) => {
            let scheme = scheme.trim().to_ascii_lowercase();
            scheme == "http" || scheme == "https"
        }
    }
}

fn scrub_tag(tag: &str) -> Option<String> {
    let bytes = tag.as_bytes();
    let mut out = String::with_capacity(tag.len());
    let mut i = 0;
    // Copy `<name` verbatim, then filter attributes.
    out.push('<');
    i += 1;
    while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'/' && bytes[i] != b'>'
    {
        out.push(bytes[i] as char);
        i += 1;
    }
    let is_iframe = tag_name(tag).eq_ignore_ascii_case("iframe");
    loop {
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            if !out.ends_with(' ') && !out.ends_with('<') {
                out.push(' ');
            }
            i += 1;
        }
        if i >= bytes.len() || bytes[i] == b'>' {
            while out.ends_with(' ') {
                out.pop();
            }
            out.push('>');
            break;
        }
        if bytes[i] == b'/' {
            out.push('/');
            i += 1;
            continue;
        }
        let name_start = i;
        while i < bytes.len()
            && !bytes[i].is_ascii_whitespace()
            && bytes[i] != b'='
            && bytes[i] != b'/'
            && bytes[i] != b'>'
        {
            i += 1;
        }
        let name = tag[name_start..i].to_ascii_lowercase();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        let mut value: Option<String> = None;
        if i < bytes.len() && bytes[i] == b'=' {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < bytes.len() && (bytes[i] == b'"' || bytes[i] == b'\'') {
                let quote = bytes[i];
                i += 1;
                let value_start = i;
                while i < bytes.len() && bytes[i] != quote {
                    i += 1;
                }
                value = Some(tag[value_start..i].to_owned());
                i += 1;
            } else {
                let value_start = i;
                while i < bytes.len()
                    && !bytes[i].is_ascii_whitespace()
                    && bytes[i] != b'>'
                    && !(bytes[i] == b'/' && bytes.get(i + 1) == Some(&b'>'))
                {
                    i += 1;
                }
                value = Some(tag[value_start..i].to_owned());
            }
        }
        // Drop event handlers, inline styles, srcdoc, and srcset outright.
        if name.starts_with("on") && name.len() > 2
            || name == "style"
            || name == "srcdoc"
            || name == "srcset"
        {
            continue;
        }
        if is_iframe && (name == "allow" || name == "allowfullscreen") {
            continue;
        }
        if URL_ATTRS.contains(&name.as_str()) {
            let keep = value.as_deref().is_some_and(safe_url_attr);
            if !keep {
                continue;
            }
        }
        out.push(' ');
        out.push_str(&name);
        if let Some(value) = value {
            out.push_str("=\"");
            out.push_str(&value.replace('"', "&quot;"));
            out.push('"');
        }
    }
    Some(out)
}

fn scrub_extension_html(html: &str, _page_url: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while i < html.len() {
        // Comments go unconditionally.
        if html[i..].starts_with("<!--") {
            if let Some(end) = find_insensitive(html, "-->", i + 4) {
                i = end + 3;
                continue;
            }
            break;
        }
        let Some(tag_start) = html[i..].find('<') else {
            out.push_str(&html[i..]);
            break;
        };
        out.push_str(&html[i..i + tag_start]);
        i += tag_start;
        if html[i..].starts_with("</") {
            let Some(end) = tag_end(html, i) else { break };
            // `</noscript>` is dropped with its opener (content unwraps).
            if tag_name(&html[i..end]).eq_ignore_ascii_case("noscript") {
                i = end;
                continue;
            }
            out.push_str(&html[i..end]);
            i = end;
            continue;
        }
        let Some(end) = tag_end(html, i) else { break };
        let tag = &html[i..end];
        let name = tag_name(tag).to_ascii_lowercase();
        if name.is_empty() || name.starts_with('!') {
            i = end;
            continue;
        }
        if DROP_TAGS.contains(&name.as_str()) {
            i = end;
            continue;
        }
        // `<noscript>` unwraps: the tags go, the content stays.
        if name == "noscript" {
            i = end;
            continue;
        }
        if SKIP_CONTENT_TAGS.contains(&name.as_str()) {
            let close = format!("</{name}");
            if let Some(close_at) = find_insensitive(html, &close, end) {
                i = tag_end(html, close_at).unwrap_or(html.len());
            } else {
                i = end;
            }
            continue;
        }
        if name == "iframe" {
            let src = attribute_value(tag, "src");
            if !iframe_host_allowed(src.as_deref()) {
                if let Some(close_at) = find_insensitive(html, "</iframe", end) {
                    i = tag_end(html, close_at).unwrap_or(html.len());
                } else {
                    i = end;
                }
                continue;
            }
        }
        if let Some(cleaned) = scrub_tag(tag) {
            out.push_str(&cleaned);
        }
        i = end;
    }
    out
}

fn attribute_value(tag: &str, wanted: &str) -> Option<String> {
    let bytes = tag.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len()
            && (bytes[i].is_ascii_whitespace() || bytes[i] == b'<' || bytes[i] == b'/')
        {
            i += 1;
        }
        let name_start = i;
        while i < bytes.len()
            && !bytes[i].is_ascii_whitespace()
            && bytes[i] != b'='
            && bytes[i] != b'/'
            && bytes[i] != b'>'
        {
            i += 1;
        }
        if name_start == i {
            i += 1;
            continue;
        }
        let name = tag[name_start..i].to_ascii_lowercase();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i < bytes.len() && bytes[i] == b'=' {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            let value = if i < bytes.len() && (bytes[i] == b'"' || bytes[i] == b'\'') {
                let quote = bytes[i];
                i += 1;
                let start = i;
                while i < bytes.len() && bytes[i] != quote {
                    i += 1;
                }
                let value = tag[start..i].to_owned();
                i += 1;
                value
            } else {
                let start = i;
                while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'>' {
                    i += 1;
                }
                tag[start..i].to_owned()
            };
            if name == wanted {
                return Some(value);
            }
        } else if name == wanted {
            return Some(String::new());
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Minimal HTTP/1.1 handling over std TcpStream.
// ---------------------------------------------------------------------------

struct ParsedHead {
    method: String,
    path: String,
    headers: HashMap<String, String>,
}

fn parse_head(head: &str) -> Result<ParsedHead, String> {
    let mut lines = head.split("\r\n");
    let request_line = lines.next().ok_or_else(|| "empty request".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().ok_or_else(|| "missing method".to_string())?;
    let target = parts.next().ok_or_else(|| "missing target".to_string())?;
    if parts.next().is_none() {
        return Err("malformed request line".into());
    }
    // Absolute-form targets (proxies) reduce to origin-form path.
    let path = target
        .split_once("://")
        .and_then(|(_, rest)| rest.split_once('/').map(|(_, p)| format!("/{p}")))
        .unwrap_or_else(|| target.to_owned());
    let path = path.split(['?', '#']).next().unwrap_or("/").to_owned();
    let mut headers = HashMap::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let (name, value) = line
            .split_once(':')
            .ok_or_else(|| "malformed header".to_string())?;
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_owned());
    }
    Ok(ParsedHead {
        method: method.to_ascii_uppercase(),
        path,
        headers,
    })
}

fn cors_headers(origin: Option<&str>) -> Vec<(&'static str, String)> {
    // Echo only allowed origins; `null` cannot be echoed usefully, so named
    // extension/Tauri origins get a match and everything else gets nothing.
    let allow = origin
        .map(str::trim)
        .filter(|o| !o.is_empty() && *o != "null" && origin_allowed(Some(*o)))
        .map(str::to_owned);
    let mut out = vec![("Vary", "Origin".to_owned())];
    if let Some(origin) = allow {
        out.push(("Access-Control-Allow-Origin", origin));
    }
    out
}

fn preflight_cors_headers(origin: Option<&str>) -> Vec<(&'static str, String)> {
    let mut headers = cors_headers(origin);
    headers.push((
        "Access-Control-Allow-Methods".into(),
        "GET, POST, OPTIONS".into(),
    ));
    headers.push((
        "Access-Control-Allow-Headers".into(),
        "Authorization, Content-Type".into(),
    ));
    headers.push(("Access-Control-Max-Age".into(), "600".into()));
    headers.push(("Access-Control-Allow-Private-Network".into(), "true".into()));
    headers
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    extra: &[(&str, String)],
    body: &str,
) {
    let mut head = format!("HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n", body.len());
    for (name, value) in extra {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str("\r\n");
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();
}

fn read_head(reader: &mut BufReader<&TcpStream>) -> Result<String, String> {
    let mut head = Vec::new();
    loop {
        let mut byte = [0u8; 1];
        reader
            .read_exact(&mut byte)
            .map_err(|_| "connection closed while reading request".to_string())?;
        head.push(byte[0]);
        if head.len() > MAX_HEAD_BYTES {
            return Err("request head too large".into());
        }
        if head.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    String::from_utf8(head).map_err(|_| "request head is not valid UTF-8".into())
}

fn handle_connection(stream: TcpStream, app: AppHandle) {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let _ = stream.set_write_timeout(Some(READ_TIMEOUT));
    let mut stream = stream;
    let reader_stream = stream.try_clone().and_then(|s| {
        s.set_read_timeout(Some(READ_TIMEOUT))?;
        Ok(s)
    });
    let Ok(reader_stream) = reader_stream else {
        return;
    };
    let mut reader = BufReader::new(&reader_stream);

    let head_text = match read_head(&mut reader) {
        Ok(head) => head,
        Err(_) => {
            write_response(
                &mut stream,
                400,
                "Bad Request",
                &[],
                r#"{"error":"bad-request"}"#,
            );
            return;
        }
    };
    let head = match parse_head(&head_text) {
        Ok(head) => head,
        Err(_) => {
            write_response(
                &mut stream,
                400,
                "Bad Request",
                &[],
                r#"{"error":"bad-request"}"#,
            );
            return;
        }
    };
    let origin = head.headers.get("origin").map(String::as_str);
    let cors = cors_headers(origin);

    // CORS preflight never carries Authorization; answer the handshake and
    // let the real request authenticate itself.
    if head.method == "OPTIONS" {
        let extra = preflight_cors_headers(origin);
        write_response(&mut stream, 204, "No Content", &extra, "");
        return;
    }
    let cors_ref: Vec<(&str, String)> = cors.iter().map(|(k, v)| (*k, v.clone())).collect();

    if !origin_allowed(origin) {
        write_response(
            &mut stream,
            403,
            "Forbidden",
            &cors_ref,
            r#"{"error":"origin-not-allowed"}"#,
        );
        return;
    }

    let state: State<'_, CaptureServerState> = app.state();
    let expected = state
        .pairing_token
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let authed = bearer_token(&head.headers).is_some_and(|got| tokens_equal(got, &expected));
    if !authed {
        write_response(
            &mut stream,
            401,
            "Unauthorized",
            &cors_ref,
            r#"{"error":"unauthorized"}"#,
        );
        return;
    }

    if !check_rate_limit(&state) {
        let mut extra = cors_ref.clone();
        extra.push(("Retry-After", "60".into()));
        write_response(
            &mut stream,
            429,
            "Too Many Requests",
            &extra,
            r#"{"error":"rate-limited"}"#,
        );
        return;
    }

    match (head.method.as_str(), head.path.as_str()) {
        ("GET", HEALTH_PATH) => {
            write_response(&mut stream, 200, "OK", &cors_ref, r#"{"status":"ok"}"#);
        }
        ("POST", CAPTURES_PATH) => {
            let content_type = head.headers.get("content-type").map(|v| {
                v.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_ascii_lowercase()
            });
            if content_type.as_deref() != Some("application/json") {
                write_response(
                    &mut stream,
                    415,
                    "Unsupported Media Type",
                    &cors_ref,
                    r#"{"error":"json-only"}"#,
                );
                return;
            }
            let content_length: usize = head
                .headers
                .get("content-length")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            if content_length == 0 || content_length > MAX_JSON_BYTES {
                write_response(
                    &mut stream,
                    413,
                    "Payload Too Large",
                    &cors_ref,
                    r#"{"error":"body-too-large"}"#,
                );
                return;
            }
            let mut body = vec![0u8; content_length];
            if reader.read_exact(&mut body).is_err() {
                write_response(
                    &mut stream,
                    400,
                    "Bad Request",
                    &cors_ref,
                    r#"{"error":"bad-request"}"#,
                );
                return;
            }
            let input = match validate_capture_payload(&body) {
                Ok(input) => input,
                Err(message) => {
                    let body =
                        serde_json::json!({ "error": "invalid-capture", "message": message })
                            .to_string();
                    write_response(&mut stream, 422, "Unprocessable Entity", &cors_ref, &body);
                    return;
                }
            };
            match store_capture(&app, input) {
                Ok(id) => {
                    let body = serde_json::json!({ "id": id }).to_string();
                    write_response(&mut stream, 201, "Created", &cors_ref, &body);
                }
                Err(status) => {
                    write_response(
                        &mut stream,
                        status,
                        "Unavailable",
                        &cors_ref,
                        r#"{"error":"storage-unavailable"}"#,
                    );
                }
            }
        }
        _ => {
            write_response(
                &mut stream,
                404,
                "Not Found",
                &cors_ref,
                r#"{"error":"not-found"}"#,
            );
        }
    }
}

/// Capture creates the item immediately (same rule as every other capture
/// path); embeddings and indexing follow on the persisted job queue.
fn store_capture(app: &AppHandle, input: crate::storage::CreateUrlInput) -> Result<String, u16> {
    let storage_state: State<'_, crate::storage::StorageState> = app.state();
    let processing: State<'_, crate::jobs::ProcessingState> = app.state();
    let guard = storage_state.lock().map_err(|_| 503u16)?;
    let storage = guard.as_ref().ok_or(503u16)?;
    let item = storage.create_url(input).map_err(|_| 503u16)?;
    let _ = crate::jobs::enqueue_embedding_for_item(&storage.connection, &item.id);
    let id = item.id.clone();
    let favicon = item
        .metadata
        .get("favicon")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    drop(guard);
    processing.enqueue_and_wake(&id, crate::jobs::JobKind::GenerateEmbedding);
    if let Some(url) = favicon {
        let app = app.clone();
        let item_id = id.clone();
        std::thread::spawn(move || {
            let _ = crate::storage::cache_favicon_in_background(&app, &item_id, &url);
        });
    }
    Ok(id)
}

// ---------------------------------------------------------------------------
// Lifecycle + Tauri commands.
// ---------------------------------------------------------------------------

/// Bind loopback-ephemeral and serve captures in the background. Runs once
/// from `setup`; a second call is a no-op. Failures leave `port` unset so
/// `get_capture_status` reports `running: false` instead of crashing boot.
pub fn start_capture_server(app: &AppHandle) {
    let state: State<'_, CaptureServerState> = app.state();
    if state
        .port
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_some()
    {
        return;
    }
    let token = load_or_generate_token(app);
    *state
        .pairing_token
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = token;

    // Prefer the last successful port so the extension's stored base URL
    // survives restarts; fall back to ephemeral if that port is taken.
    let preferred = load_preferred_port(app);
    let listener = match preferred.and_then(|port| TcpListener::bind(("127.0.0.1", port)).ok()) {
        Some(listener) => listener,
        None => match TcpListener::bind(("127.0.0.1", 0)) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("capture server unavailable: {error}");
                return;
            }
        },
    };
    let port = listener.local_addr().map(|addr| addr.port()).unwrap_or(0);
    if port == 0 {
        eprintln!("capture server unavailable: no local port");
        return;
    }
    *state.port.lock().unwrap_or_else(|e| e.into_inner()) = Some(port);
    persist_port(app, port);

    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("capture-server".into())
        .spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        // Only loopback can arrive here (bound to 127.0.0.1),
                        // but refuse anything unexpected before parsing.
                        let loopback = stream
                            .peer_addr()
                            .map(|addr| addr.ip().is_loopback())
                            .unwrap_or(false);
                        if !loopback {
                            continue;
                        }
                        let app = app.clone();
                        let _ = std::thread::Builder::new()
                            .name("capture-server-conn".into())
                            .spawn(move || handle_connection(stream, app));
                    }
                    Err(error) => {
                        eprintln!("capture server accept error: {error}");
                    }
                }
            }
        });
    // Port (not token) is safe to note: it is ephemeral and useless without
    // the bearer credential.
    eprintln!("capture server listening on 127.0.0.1:{port}");
}

#[tauri::command]
pub fn get_capture_status(state: State<'_, CaptureServerState>) -> CaptureStatus {
    let port = state.port.lock().unwrap_or_else(|e| e.into_inner());
    CaptureStatus {
        running: port.is_some(),
        port: *port,
        health_url: port.map(|port| format!("http://127.0.0.1:{port}{HEALTH_PATH}")),
        base_url: port.map(|port| format!("http://127.0.0.1:{port}")),
    }
}

#[tauri::command]
pub fn test_capture_connection(state: State<'_, CaptureServerState>) -> Result<(), String> {
    let port = state
        .port
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .ok_or_else(|| "capture receiver is not running".to_owned())?;
    let token = state
        .pairing_token
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|error| format!("receiver connection failed: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("receiver timeout setup failed: {error}"))?;
    let request = format!(
        "GET {HEALTH_PATH} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("receiver request failed: {error}"))?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("receiver response failed: {error}"))?;
    if response.starts_with("HTTP/1.1 200") {
        Ok(())
    } else {
        Err(response
            .lines()
            .next()
            .unwrap_or("receiver returned an invalid response")
            .to_owned())
    }
}

#[tauri::command]
pub fn get_pairing_token(
    app: AppHandle,
    state: State<'_, CaptureServerState>,
) -> Result<String, String> {
    let cached = state
        .pairing_token
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    if !cached.is_empty() {
        return Ok(cached);
    }
    // Server thread may not have populated the cache yet (storage-less boot
    // in tests); fall back to the persisted value.
    let token = load_or_generate_token(&app);
    *state
        .pairing_token
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = token.clone();
    Ok(token)
}

#[tauri::command]
pub fn regenerate_pairing_token(
    app: AppHandle,
    state: State<'_, CaptureServerState>,
) -> Result<String, String> {
    let token = generate_pairing_token();
    persist_token(&app, &token)?;
    *state
        .pairing_token
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = token.clone();
    Ok(token)
}

// ---------------------------------------------------------------------------
// Tests: guards and parsing only. No sockets, no library writes.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_ascii_lowercase(), v.to_string()))
            .collect()
    }

    #[test]
    fn bearer_tokens_must_match_exactly() {
        let h = headers(&[("Authorization", "Bearer abc123")]);
        assert_eq!(bearer_token(&h), Some("abc123"));
        assert!(tokens_equal("abc123", "abc123"));
        assert!(!tokens_equal("abc123", "abc124"));
        assert!(!tokens_equal("abc123", "abc1234"));
        assert_eq!(
            bearer_token(&headers(&[("Authorization", "Basic abc")])),
            None
        );
        assert_eq!(bearer_token(&headers(&[])), None);
    }

    #[test]
    fn only_extension_null_and_tauri_origins_pass() {
        for allowed in [
            None,
            Some("null"),
            Some("chrome-extension://abcdef"),
            Some("moz-extension://1234-uuid"),
            Some("safari-web-extension://com.example.clip"),
            Some("tauri://localhost"),
            Some("https://tauri.localhost"),
            Some("http://tauri.localhost"),
            Some("inkling://capture?url=https://example.com"),
        ] {
            assert!(origin_allowed(allowed), "should allow {allowed:?}");
        }
        for denied in [
            Some("https://example.com"),
            Some("http://127.0.0.1:1420"),
            Some("file://"),
            Some("nullified"),
            Some("chrome-extension-fake://x"),
            Some("https://tauri.localhost.evil.com"),
            Some("http://tauri.localhost.evil.com"),
            Some("https://tauri.localhost.evil.com/path"),
            Some("https://not-tauri.localhost"),
        ] {
            assert!(!origin_allowed(denied), "should deny {denied:?}");
        }
        // Non-default port on the real host is still the Tauri origin.
        assert!(origin_allowed(Some("https://tauri.localhost:4433")));
        assert!(origin_allowed(Some("http://tauri.localhost:8080")));
        // Scheme-relative / userinfo tricks must not pass.
        assert!(!origin_allowed(Some("https://tauri.localhost:4433x")));
        assert!(!origin_allowed(Some("https://user:pass@tauri.localhost")));
    }

    #[test]
    fn capture_urls_follow_storage_guards_with_loopback_exempt() {
        // The receiver socket itself is loopback: a submitted localhost URL is
        // user intent (they captured that page), accepted here. Only outbound
        // re-fetches must apply private-network SSRF rejection.
        assert!(validate_capture_url("http://127.0.0.1:3000/dev-notes").is_ok());
        assert!(validate_capture_url("https://example.com/article?q=1").is_ok());
        assert!(validate_capture_url("ftp://example.com/file").is_err());
        assert!(validate_capture_url("https://user:pass@example.com/").is_err());
        assert!(validate_capture_url("not a url").is_err());
        assert!(validate_capture_url("").is_err());
        assert!(
            validate_capture_url(&format!("https://example.com/{}", "a".repeat(9000))).is_err()
        );
    }

    #[test]
    fn capture_payload_accepts_v1_and_scrubs_html() {
        let good = serde_json::json!({
            "version": 1,
            "kind": "page",
            "url": "https://example.com/article",
            "title": "A quiet page",
            "defuddledHtml": "<p>kept</p><script>alert(1)</script>",
            "text": "kept text",
            "author": "A Writer",
            "publishedDate": "2026-01-02T00:00:00Z",
            "imageUrls": ["https://example.com/img.jpg", "javascript:evil()", "https://example.com/img.jpg"],
        });
        let input = validate_capture_payload(&serde_json::to_vec(&good).unwrap()).unwrap();
        assert_eq!(input.source_url, "https://example.com/article");
        assert_eq!(input.title.as_deref(), Some("A quiet page"));
        let metadata = input.metadata.as_ref().unwrap();
        assert_eq!(metadata["origin"], "browser-extension");
        assert_eq!(metadata["payloadVersion"], 1);
        assert_eq!(metadata["author"], "A Writer");
        assert_eq!(
            metadata["imageUrls"],
            serde_json::json!(["https://example.com/img.jpg"])
        );
        // The executable subset is gone before storage; readable markup stays.
        assert!(!metadata["html"].as_str().unwrap().contains("script"));
        assert!(metadata["html"].as_str().unwrap().contains("<p>kept</p>"));

        // Blank titles fall back to the hostname instead of failing capture.
        let blank_title = serde_json::json!({
            "version": 1, "kind": "page",
            "url": "https://www.example.com/post",
            "title": "  ", "defuddledHtml": "", "text": "words",
        });
        let input = validate_capture_payload(&serde_json::to_vec(&blank_title).unwrap()).unwrap();
        assert_eq!(input.title.as_deref(), Some("www.example.com"));

        // Overlong titles truncate; wrong version/kind/URL shapes reject.
        let long_title = serde_json::json!({
            "version": 1, "kind": "page",
            "url": "https://example.com/", "title": "t".repeat(600),
            "defuddledHtml": "", "text": "",
        });
        let input = validate_capture_payload(&serde_json::to_vec(&long_title).unwrap()).unwrap();
        assert_eq!(input.title.as_deref().unwrap().len(), 500);

        for bad in [
            serde_json::json!({ "title": "no url" }),
            serde_json::json!({ "version": 1, "kind": "page", "url": "javascript:alert(1)" }),
            serde_json::json!({ "version": 2, "kind": "page", "url": "https://example.com/" }),
            serde_json::json!({ "version": 1, "kind": "selection", "url": "https://example.com/" }),
        ] {
            assert!(
                validate_capture_payload(&serde_json::to_vec(&bad).unwrap()).is_err(),
                "should reject {bad}"
            );
        }

        assert!(validate_capture_payload(b"not json").is_err());
    }

    #[test]
    fn clean_favicon_keeps_only_absolute_http_urls() {
        assert_eq!(
            clean_favicon(Some("  https://example.com/favicon.ico  ".into())),
            Some("https://example.com/favicon.ico".into())
        );
        assert_eq!(
            clean_favicon(Some("http://example.com/icon.png".into())),
            Some("http://example.com/icon.png".into())
        );
        assert_eq!(clean_favicon(Some("".into())), None);
        assert_eq!(clean_favicon(Some("   ".into())), None);
        assert_eq!(clean_favicon(None), None);
        assert_eq!(clean_favicon(Some("data:image/png;base64,xx".into())), None);
        assert_eq!(clean_favicon(Some("javascript:alert(1)".into())), None);
        assert_eq!(clean_favicon(Some("/favicon.ico".into())), None);
        assert_eq!(clean_favicon(Some("not a url".into())), None);
    }

    #[test]
    fn scrubber_removes_the_executable_subset() {
        let page = "https://example.com/article";
        let dirty = concat!(
            "<!-- a comment -->",
            "<p onclick=\"evil()\" style=\"color:red\">Hi <a href=\"javascript:alert(1)\">x</a></p>",
            "<script>alert(1)</script>",
            "<style>p{}</style>",
            "<form action=\"https://example.com/submit\"><input></form>",
            "<iframe src=\"https://evil.example/x\"></iframe>",
            "<iframe src=\"https://www.youtube-nocookie.com/embed/abc123\" allowfullscreen></iframe>",
            "<img src=\"https://example.com/a.jpg\" srcset=\"a 1x\" onerror=\"e()\">",
            "<a href=\"/relative/path\">rel</a>",
            "<a href=\"https://example.com/abs\">abs</a>",
        );
        let clean = scrub_extension_html(dirty, page);
        for banned in [
            "<script",
            "onclick",
            "style=",
            "javascript:",
            "<form",
            "evil.example",
            "allowfullscreen",
            "srcset",
            "onerror",
            "<!--",
        ] {
            assert!(
                !clean.contains(banned),
                "scrubbed output contains {banned:?}: {clean}"
            );
        }
        for kept in [
            "<p>Hi",
            "https://www.youtube-nocookie.com/embed/abc123",
            "https://example.com/a.jpg",
            "/relative/path",
            "https://example.com/abs",
        ] {
            assert!(
                clean.contains(kept),
                "scrubbed output lost {kept:?}: {clean}"
            );
        }
    }

    #[test]
    fn generated_tokens_are_hex_and_sized() {
        for _ in 0..5 {
            let token = generate_pairing_token();
            assert_eq!(token.len(), 64);
            assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
            assert!(token_looks_valid(&token));
        }
        assert!(!token_looks_valid("short"));
        assert!(!token_looks_valid("has spaces in it yes indeed 1234567890"));
    }

    #[test]
    fn preferred_port_parses_only_nonzero_u16() {
        // Mirrors load_preferred_port's parse rules without touching the disk.
        let parse = |raw: &str| raw.trim().parse::<u16>().ok().filter(|port| *port != 0);
        assert_eq!(parse("53176"), Some(53176));
        assert_eq!(parse(" 53176\n"), Some(53176));
        assert_eq!(parse("0"), None);
        assert_eq!(parse(""), None);
        assert_eq!(parse("not-a-port"), None);
        assert_eq!(parse("65536"), None);
        assert_eq!(parse("-1"), None);
    }

    #[test]
    fn rate_limiter_caps_a_burst_then_recovers() {
        let state = CaptureServerState::default();
        for _ in 0..RATE_LIMIT_MAX {
            assert!(check_rate_limit(&state));
        }
        assert!(!check_rate_limit(&state));
        // Aged-out entries free the bucket again.
        state
            .request_times
            .lock()
            .unwrap()
            .iter_mut()
            .for_each(|t| *t -= RATE_LIMIT_WINDOW + Duration::from_secs(1));
        assert!(check_rate_limit(&state));
    }

    #[test]
    fn preflight_allows_private_network_requests() {
        let headers = preflight_cors_headers(Some("chrome-extension://abc"));
        assert!(headers.iter().any(|(name, value)| {
            *name == "Access-Control-Allow-Private-Network" && value == "true"
        }));
    }

    #[test]
    fn request_heads_parse_origin_and_absolute_form() {
        let head = parse_head(
            "POST /v1/captures HTTP/1.1\r\nHost: 127.0.0.1:1\r\nAuthorization: Bearer x\r\nOrigin: chrome-extension://abc\r\nContent-Length: 12\r\n\r\n",
        )
        .unwrap();
        assert_eq!(head.method, "POST");
        assert_eq!(head.path, "/v1/captures");
        assert_eq!(
            head.headers.get("origin").map(String::as_str),
            Some("chrome-extension://abc")
        );

        let absolute =
            parse_head("GET http://127.0.0.1:1/v1/health?x=1 HTTP/1.1\r\nHost: y\r\n\r\n").unwrap();
        assert_eq!(absolute.path, "/v1/health");

        assert!(parse_head("GARBAGE\r\n\r\n").is_err());
        assert!(parse_head("GET /no-version\r\n\r\n").is_err());
        assert!(parse_head("GET /x HTTP/1.1\r\nno-colon\r\n\r\n").is_err());
    }

    #[test]
    fn json_size_cap_is_five_megabytes() {
        assert_eq!(MAX_JSON_BYTES, 5 * 1024 * 1024);
    }
}
