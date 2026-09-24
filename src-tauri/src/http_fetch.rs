use std::collections::HashMap;
use std::io::Read;
use std::time::Duration;

use serde::Serialize;
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

const MAX_FAVICON_BYTES: u64 = 128 * 1024;
const MAX_FAVICON_REDIRECTS: u32 = 5;

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
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .max_redirects(0)
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .into();

    for _ in 0..MAX_FAVICON_REDIRECTS {
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

/// Single-hop HTTP GET for the webview. Redirects are not followed here:
/// the TypeScript ingestion pipeline already inspects each hop with
/// parseHttpUrl-style SSRF guards before requesting the next URL.
#[tauri::command]
pub fn fetch_http(
    url: String,
    user_agent: String,
    accept: String,
    timeout_ms: u64,
    max_bytes: u64,
) -> Result<FetchHttpResult, String> {
    let parsed = validate_fetch_url(&url)?;
    let timeout = Duration::from_millis(timeout_ms.clamp(1, 120_000));
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .max_redirects(0)
        .timeout_global(Some(timeout))
        .build()
        .into();

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

    let bytes = read_limited(response.body_mut(), max_bytes)?;
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
