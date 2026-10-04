use std::collections::HashMap;
use std::io::Read;
use std::time::Duration;

use serde::Serialize;
use ureq::unversioned::resolver::{DefaultResolver, ResolvedSocketAddrs, Resolver};
use ureq::unversioned::transport::{DefaultConnector, NextTimeout};
use url::Url;

const MAX_URL_LENGTH: usize = 8_192;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchHttpResult {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

fn private_ipv4(octets: [u8; 4]) -> bool {
    let [first, second, ..] = octets;
    first == 0
        || first == 10
        || (first == 100 && (64..=127).contains(&second))
        || first == 127
        || (first == 169 && second == 254)
        || (first == 172 && (16..=31).contains(&second))
        || (first == 192 && matches!(second, 0 | 2 | 168))
        || (first == 198 && matches!(second, 18 | 19 | 51))
        || (first == 203 && second == 0)
        || first >= 224
}

fn private_hostname(host: &str) -> bool {
    let value = host
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if value.is_empty() {
        return true;
    }
    if value == "localhost"
        || value.ends_with(".localhost")
        || value.ends_with(".local")
        || value.ends_with(".internal")
    {
        return true;
    }

    if let Ok(address) = value.parse::<std::net::Ipv4Addr>() {
        return private_ipv4(address.octets());
    }

    if let Ok(address) = value.parse::<std::net::Ipv6Addr>() {
        if address.is_loopback() || address.is_unspecified() || address.is_multicast() {
            return true;
        }
        let segments = address.segments();
        if segments[0] & 0xfe00 == 0xfc00 || segments[0] & 0xffc0 == 0xfe80 {
            return true;
        }
        if let Some(mapped) = address.to_ipv4_mapped() {
            return private_ipv4(mapped.octets());
        }
        // Deprecated IPv4-compatible form (::a.b.c.d).
        if segments[..6] == [0, 0, 0, 0, 0, 0] {
            let octets = [
                (segments[6] >> 8) as u8,
                (segments[6] & 0xff) as u8,
                (segments[7] >> 8) as u8,
                (segments[7] & 0xff) as u8,
            ];
            return private_ipv4(octets);
        }
        return false;
    }

    false
}

fn validate_fetch_url(input: &str) -> Result<Url, String> {
    let value = input.trim();
    if value.is_empty() || value.len() > MAX_URL_LENGTH {
        return Err("invalid-url: The URL is empty or too long.".into());
    }
    let parsed =
        Url::parse(value).map_err(|_| "invalid-url: The URL could not be parsed.".to_owned())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("invalid-url: Only HTTP and HTTPS URLs can be saved.".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("invalid-url: The URL contains unsupported credentials.".into());
    }
    let Some(host) = parsed.host_str() else {
        return Err("invalid-url: The URL is missing a host.".into());
    };
    if private_hostname(host) {
        return Err("invalid-url: Private network URLs are not supported.".into());
    }
    Ok(parsed)
}

/// Deadline handed to the resolver. A finite one matters: `NextTimeout::
/// NotHappening` sends ureq down its synchronous `to_socket_addrs()` path, which
/// is the unbounded blocking call this replaced.
fn resolve_deadline(timeout: Duration) -> NextTimeout {
    NextTimeout {
        after: ureq::unversioned::transport::time::Duration::Exact(timeout),
        reason: ureq::Timeout::Resolve,
    }
}

/// Confirm the host resolves, and to somewhere public.
///
/// Resolution goes through `DefaultResolver` with a finite deadline instead of
/// `to_socket_addrs()`. That call is an unbounded blocking system call, so a
/// stalled resolver ignored the caller's timeout entirely and pinned the thread
/// long past its budget. `DefaultResolver` resolves on a thread ureq can time
/// out, so handing it the caller's budget is what makes this bounded; only a
/// `NotHappening` deadline would send it back down the synchronous path.
///
/// The per-address private-range rejection below stays the SSRF guard: a public
/// name that resolves into the loopback or LAN ranges is refused exactly as
/// `validate_fetch_url` refuses one written out in full.
fn validate_public_host(url: &Url, timeout: Duration) -> Result<(), String> {
    let uri: ureq::http::Uri = url
        .as_str()
        .parse()
        .map_err(|_| "invalid-url: The URL is missing a host.".to_owned())?;
    let addresses = DefaultResolver::default()
        .resolve(
            &uri,
            &ureq::config::Config::default(),
            resolve_deadline(timeout),
        )
        .map_err(|error| format!("network-error: Could not resolve the host: {error}"))?;
    let mut resolved = false;
    for address in addresses.iter() {
        resolved = true;
        if private_hostname(&address.ip().to_string()) {
            return Err("invalid-url: Private network URLs are not supported.".into());
        }
    }
    if !resolved {
        return Err("network-error: The host did not resolve to an address.".into());
    }
    Ok(())
}

#[derive(Debug)]
struct PublicResolver;

impl Resolver for PublicResolver {
    fn resolve(
        &self,
        uri: &ureq::http::Uri,
        config: &ureq::config::Config,
        timeout: NextTimeout,
    ) -> Result<ResolvedSocketAddrs, ureq::Error> {
        let addresses = DefaultResolver::default().resolve(uri, config, timeout)?;
        let mut public_addresses = self.empty();
        for address in addresses.iter() {
            if !private_hostname(&address.ip().to_string()) {
                public_addresses.push(*address);
            }
        }
        if public_addresses.is_empty() {
            Err(ureq::Error::HostNotFound)
        } else {
            Ok(public_addresses)
        }
    }
}

fn public_http_agent(timeout: Duration) -> ureq::Agent {
    // Trust the OS certificate store, the same one the browser uses. ureq's
    // default is Mozilla's bundled roots only, which rejects any host whose
    // chain is not in that snapshot and so fails with UnknownIssuer on a
    // TLS-intercepting network. Chain validation stays on; we only widen which
    // roots are trusted, and the SSRF guards below are unaffected.
    let config = ureq::Agent::config_builder()
        .max_redirects(0)
        .timeout_global(Some(timeout))
        .tls_config(
            ureq::tls::TlsConfig::builder()
                .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                .build(),
        )
        .build();
    ureq::Agent::with_parts(config, DefaultConnector::default(), PublicResolver)
}

const MAX_FAVICON_BYTES: u64 = 128 * 1024;
const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_FAVICON_REDIRECTS: u32 = 5;

/// Ceiling on the buffer `fetch_http` will build, whatever the caller asks for.
/// `maxBytes` arrives straight from the webview, so a direct Tauri invoke could
/// otherwise name any size and have the Rust side honour it. The webview asks
/// for 8 MB for article extraction; 16 MB leaves it headroom for a large page
/// while keeping the worst case bounded.
const MAX_FETCH_BYTES: u64 = 16 * 1024 * 1024;

fn clamp_fetch_bytes(requested: u64) -> u64 {
    requested.clamp(1, MAX_FETCH_BYTES)
}

/// Raster MIME types the thumbnail decoder can actually read, matching the
/// `image` crate features this app builds with (bmp, gif, ico, jpeg, png, tiff,
/// webp). SVG and AVIF download cleanly and then fail in the decoder, so the
/// user is told a capture succeeded and watches it fail; refusing them here
/// keeps one answer for "not an image we can store".
pub(crate) const DECODABLE_IMAGE_MIME: &[&str] = &[
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/webp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
];

/// Bare MIME type (no parameters) that both `download_public_image` and the
/// capture receiver's data-URL decoder accept.
pub(crate) fn is_decodable_image_mime(mime: &str) -> bool {
    DECODABLE_IMAGE_MIME.contains(&mime.trim().to_ascii_lowercase().as_str())
}

fn favicon_extension(content_type: &str, url: &Url) -> &'static str {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    match mime.as_str() {
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        "image/png" => "png",
        "image/svg+xml" => "svg",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => match url
            .path()
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "png" => "png",
            "svg" => "svg",
            "jpg" | "jpeg" => "jpg",
            "webp" => "webp",
            "gif" => "gif",
            _ => "ico",
        },
    }
}

pub(crate) fn download_favicon(url: &str) -> Result<(Vec<u8>, String), String> {
    let mut current = validate_fetch_url(url)?;
    let timeout = Duration::from_secs(10);
    let agent = public_http_agent(timeout);

    for _ in 0..MAX_FAVICON_REDIRECTS {
        validate_public_host(&current, timeout)?;
        let mut response = agent
            .get(current.as_str())
            .header("User-Agent", "inkling/1.0")
            .header("Accept", "image/*,*/*;q=0.8")
            .call()
            .map_err(|error| match error {
                ureq::Error::Timeout(_) => format!("timeout: {error}"),
                other => format!("network-error: {other}"),
            })?;

        let status = response.status().as_u16();
        if (300..400).contains(&status) {
            let location = response
                .headers()
                .get("location")
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "network-error: redirect is missing a location".to_owned())?;
            let next = current
                .join(location)
                .map_err(|_| "invalid-url: Redirect target could not be parsed.".to_owned())?;
            current = validate_fetch_url(next.as_str())?;
            continue;
        }
        if !(200..300).contains(&status) {
            return Err(format!("http-status: favicon returned HTTP {status}"));
        }

        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_owned();
        if content_type.to_ascii_lowercase().contains("text/html") {
            return Err("invalid-favicon: Response is HTML, not an image.".into());
        }
        let bytes = read_limited(response.body_mut(), MAX_FAVICON_BYTES)?;
        if bytes.is_empty() {
            return Err("invalid-favicon: Response body is empty.".into());
        }
        let ext = favicon_extension(&content_type, &current);
        return Ok((bytes, ext.to_owned()));
    }

    Err("network-error: Too many redirects while fetching the favicon.".into())
}

pub(crate) fn download_public_image(url: &str) -> Result<(Vec<u8>, String), String> {
    let mut current = validate_fetch_url(url)?;
    let timeout = Duration::from_secs(30);
    let agent = public_http_agent(timeout);
    for _ in 0..MAX_FAVICON_REDIRECTS {
        validate_public_host(&current, timeout)?;
        let mut response = agent
            .get(current.as_str())
            .header("User-Agent", "inkling/0.1 (+local image capture)")
            .header("Accept", "image/*")
            .call()
            .map_err(|error| match error {
                ureq::Error::Timeout(_) => format!("timeout: {error}"),
                other => format!("network-error: {other}"),
            })?;
        let status = response.status().as_u16();
        if (300..400).contains(&status) {
            let location = response
                .headers()
                .get("location")
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "network-error: redirect is missing a location".to_owned())?;
            let next = current
                .join(location)
                .map_err(|_| "invalid-url: Redirect target could not be parsed.".to_owned())?;
            current = validate_fetch_url(next.as_str())?;
            continue;
        }
        if !(200..300).contains(&status) {
            return Err(format!("http-status: image returned HTTP {status}"));
        }
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        // One answer for every content type we cannot store as an image: the
        // host replied, the bytes are not an image this app can read. SVG and
        // AVIF pass the `image/` prefix check and fail in the thumbnail decoder,
        // which tells the user a capture worked and then shows nothing.
        if !is_decodable_image_mime(&content_type) {
            return Err("invalid-image: Response is not an image.".into());
        }
        let bytes = read_limited(response.body_mut(), MAX_IMAGE_BYTES)?;
        if bytes.is_empty() {
            return Err("invalid-image: Response body is empty.".into());
        }
        return Ok((bytes, content_type));
    }
    Err("network-error: Too many redirects while fetching the image.".into())
}

/// Single-hop JSON GET for provider metadata (oEmbed). Same SSRF guards and
/// public resolver as the other fetchers; no redirects, so the caller cannot be
/// bounced somewhere private.
pub(crate) fn fetch_public_json(url: &str, max_bytes: u64) -> Result<serde_json::Value, String> {
    let parsed = validate_fetch_url(url)?;
    let timeout = Duration::from_secs(4);
    validate_public_host(&parsed, timeout)?;
    let mut response = public_http_agent(timeout)
        .get(parsed.as_str())
        .header("User-Agent", "inkling/0.1 (+local video capture)")
        .header("Accept", "application/json")
        .call()
        .map_err(|error| match error {
            ureq::Error::Timeout(_) => format!("timeout: {error}"),
            other => format!("network-error: {other}"),
        })?;
    if !(200..300).contains(&response.status().as_u16()) {
        return Err(format!(
            "http-status: metadata returned HTTP {}",
            response.status().as_u16()
        ));
    }
    let bytes = read_limited(response.body_mut(), max_bytes)?;
    serde_json::from_slice(&bytes).map_err(|error| format!("invalid-json: {error}"))
}

fn read_limited(body: &mut ureq::Body, max_bytes: u64) -> Result<Vec<u8>, String> {
    let mut reader = body.as_reader().take(max_bytes.saturating_add(1));
    let mut buffer = Vec::new();
    reader
        .read_to_end(&mut buffer)
        .map_err(|error| format!("network-error: {error}"))?;
    if buffer.len() as u64 > max_bytes {
        return Err(
            "content-too-large: The downloaded page is larger than the ingestion limit.".into(),
        );
    }
    Ok(buffer)
}

/// Single-hop HTTP GET for the webview. Redirects are not followed here: the
/// caller walks them and requests each hop as its own call, so every hop is
/// re-validated by `validate_fetch_url` and `validate_public_host` below.
/// Those checks are the guard, not the TypeScript side: `url-ingestion.ts`
/// inspects the page request's own hops with parseHttpUrl, but the X-post
/// oEmbed request follows redirects through here and relies on this alone.
///
/// Async because the body is a blocking GET. A sync command runs on the main
/// thread, which would freeze the window for the whole download — the one thing
/// capture must never do.
#[tauri::command(async)]
pub fn fetch_http(
    url: String,
    user_agent: String,
    accept: String,
    timeout_ms: u64,
    max_bytes: u64,
) -> Result<FetchHttpResult, String> {
    let parsed = validate_fetch_url(&url)?;
    let timeout = Duration::from_millis(timeout_ms.clamp(1, 120_000));
    validate_public_host(&parsed, timeout)?;
    let agent = public_http_agent(timeout);

    let mut response = agent
        .get(parsed.as_str())
        .header("User-Agent", &user_agent)
        .header("Accept", &accept)
        .call()
        .map_err(|error| match error {
            ureq::Error::Timeout(_) => format!("timeout: {error}"),
            other => format!("network-error: {other}"),
        })?;

    let status = response.status().as_u16();
    let mut headers = HashMap::new();
    for (name, value) in response.headers() {
        if let Ok(text) = value.to_str() {
            headers.insert(name.as_str().to_ascii_lowercase(), text.to_owned());
        }
    }

    let bytes = read_limited(response.body_mut(), clamp_fetch_bytes(max_bytes))?;
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(FetchHttpResult {
        status,
        headers,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_agent_trusts_the_platform_certificate_store() {
        // Regression: the agent defaulted to ureq's Mozilla-only root bundle, so
        // any host outside that snapshot failed with `UnknownIssuer` and every
        // capture from a TLS-intercepting network was rejected.
        let agent = public_http_agent(Duration::from_secs(5));
        assert!(
            matches!(
                agent.config().tls_config().root_certs(),
                ureq::tls::RootCerts::PlatformVerifier
            ),
            "captures must trust the OS certificate store, like the browser does"
        );
    }

    #[test]
    fn rejects_private_and_non_http_targets() {
        assert!(validate_fetch_url("http://127.0.0.1/").is_err());
        assert!(validate_fetch_url("http://localhost:1420/").is_err());
        assert!(validate_fetch_url("http://[::1]/").is_err());
        assert!(validate_fetch_url("http://10.0.0.1/").is_err());
        assert!(validate_fetch_url("http://192.168.1.10/").is_err());
        assert!(validate_fetch_url("http://169.254.169.254/").is_err());
        assert!(validate_fetch_url("file:///etc/passwd").is_err());
        assert!(validate_fetch_url("ftp://example.com/file").is_err());
        assert!(validate_fetch_url("https://user:pass@example.com/").is_err());
        assert!(validate_fetch_url("").is_err());
        // Numeric spellings of 127.0.0.1 and an IPv4-mapped loopback must not
        // read as public hosts.
        assert!(validate_fetch_url("http://2130706433/").is_err());
        assert!(validate_fetch_url("http://0x7f.1/").is_err());
        assert!(validate_fetch_url("http://[::ffff:127.0.0.1]/").is_err());
    }

    #[test]
    fn accepts_public_https_targets() {
        assert!(validate_fetch_url("https://example.com/article").is_ok());
        assert!(validate_fetch_url("http://example.com/").is_ok());
        assert!(validate_fetch_url("https://sub.example.co.uk/path?q=1").is_ok());
    }

    #[test]
    fn rejects_common_local_suffixes() {
        assert!(validate_fetch_url("http://printer.local/").is_err());
        assert!(validate_fetch_url("http://db.internal/").is_err());
        assert!(validate_fetch_url("http://foo.localhost/").is_err());
    }

    #[test]
    fn public_resolver_rejects_private_dns_results() {
        let uri: ureq::http::Uri = "http://localhost/".parse().unwrap();
        let timeout = NextTimeout {
            after: ureq::unversioned::transport::time::Duration::NotHappening,
            reason: ureq::Timeout::Resolve,
        };

        assert!(PublicResolver
            .resolve(&uri, &ureq::config::Config::default(), timeout)
            .is_err());
    }

    #[test]
    fn host_validation_bounds_name_resolution() {
        // The old code called `to_socket_addrs()` directly: an unbounded blocking
        // system call, so a stalled resolver ignored the caller's timeout. The
        // deadline has to be finite, because `NotHappening` is what sends ureq
        // back down that synchronous path.
        let budget = Duration::from_millis(250);
        let deadline = resolve_deadline(budget);
        assert_eq!(
            deadline.after,
            ureq::unversioned::transport::time::Duration::Exact(budget)
        );
        assert!(!deadline.after.is_not_happening());
    }

    #[test]
    fn host_validation_still_rejects_private_dns_answers() {
        // Bounding the resolution replaced the call, not the guard. A name
        // resolving into the loopback range is still refused, with the wording
        // the extension shows the user, even though `validate_fetch_url` only
        // ever saw the name.
        let url = Url::parse("http://localhost:8080/asset.png").unwrap();
        assert_eq!(
            validate_public_host(&url, Duration::from_secs(2)),
            Err("invalid-url: Private network URLs are not supported.".to_owned())
        );
    }

    #[test]
    fn only_decodable_raster_types_cross_the_image_boundary() {
        for mime in DECODABLE_IMAGE_MIME {
            assert!(is_decodable_image_mime(mime), "{mime} should be accepted");
        }
        for mime in [
            // Downloads fine, fails in the thumbnail decoder.
            "image/svg+xml",
            "image/avif",
            "image/heic",
            "image/jxl",
            "text/html",
            "application/octet-stream",
            "",
            "image",
        ] {
            assert!(!is_decodable_image_mime(mime), "{mime} should be refused");
        }
        // Callers pass the bare type; the header's parameters are stripped first.
        assert!(is_decodable_image_mime("IMAGE/PNG"));
        assert!(is_decodable_image_mime(" image/webp "));
    }

    #[test]
    fn the_webview_cannot_ask_for_an_unbounded_buffer() {
        // `maxBytes` is caller-controlled and `read_limited` sizes a real buffer
        // from it, so the ceiling lives here rather than in the webview.
        assert_eq!(clamp_fetch_bytes(8 * 1024 * 1024), 8 * 1024 * 1024);
        assert_eq!(clamp_fetch_bytes(MAX_FETCH_BYTES), MAX_FETCH_BYTES);
        assert_eq!(clamp_fetch_bytes(MAX_FETCH_BYTES + 1), MAX_FETCH_BYTES);
        assert_eq!(clamp_fetch_bytes(u64::MAX), MAX_FETCH_BYTES);
        assert_eq!(clamp_fetch_bytes(0), 1);
    }

    #[test]
    fn derives_favicon_extensions_from_content_type_and_url() {
        let url = Url::parse("https://example.com/assets/logo.svg").unwrap();
        assert_eq!(favicon_extension("image/png", &url), "png");
        assert_eq!(favicon_extension("image/svg+xml", &url), "svg");
        assert_eq!(favicon_extension("application/octet-stream", &url), "svg");
        assert_eq!(
            favicon_extension(
                "application/octet-stream",
                &Url::parse("https://example.com/favicon").unwrap()
            ),
            "ico"
        );
    }
}
