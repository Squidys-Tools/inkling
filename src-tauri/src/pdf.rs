use std::fmt;

#[derive(Debug)]
pub struct PdfError {
    pub code: &'static str,
    pub message: String,
}

impl PdfError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for PdfError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for PdfError {}

/// Extracts native PDF text page by page. Empty pages are kept so the worker
/// can render only the pages that need OCR.
pub fn extract_text_by_pages(pdf_bytes: &[u8]) -> Result<Vec<String>, PdfError> {
    if pdf_bytes.is_empty() {
        return Err(PdfError::new("empty-pdf", "PDF bytes cannot be empty"));
    }

    pdf_extract::extract_text_from_mem_by_pages(pdf_bytes)
        .map(|pages| {
            pages
                .into_iter()
                .map(|page| normalize_text(&page))
                .collect()
        })
        .map_err(|error| PdfError::new("text-extraction", error.to_string()))
}

/// Reads the document title from the PDF Info dictionary when it has one.
/// A missing or malformed title is treated as enrichment failure so callers
/// can keep the uploaded filename as the stable fallback.
pub fn title(pdf_bytes: &[u8]) -> Option<String> {
    let document = pdf_extract::Document::load_mem(pdf_bytes).ok()?;
    let info_object = document.trailer.get(b"Info").ok()?;
    let info = match info_object {
        pdf_extract::Object::Reference(id) => document.get_object(*id).ok()?,
        pdf_extract::Object::Dictionary(_) => info_object,
        _ => return None,
    };
    let title = info.as_dict().ok()?.get(b"Title").ok()?.as_str().ok()?;
    let title = decode_text_string(title);
    (!title.is_empty()).then_some(title)
}

/// Returns the number of pages when the PDF can be parsed locally.
pub fn page_count(pdf_bytes: &[u8]) -> Option<usize> {
    pdf_extract::Document::load_mem(pdf_bytes)
        .ok()
        .map(|document| document.get_pages().len())
}

fn decode_text_string(bytes: &[u8]) -> String {
    let decoded = if bytes.starts_with(&[0xFE, 0xFF]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]));
        String::from_utf16_lossy(&units.collect::<Vec<_>>())
    } else if bytes.starts_with(&[0xFF, 0xFE]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]));
        String::from_utf16_lossy(&units.collect::<Vec<_>>())
    } else {
        bytes
            .iter()
            .filter_map(|byte| PDF_DOC_ENCODING.get(*byte as usize).copied())
            .filter_map(char::from_u32)
            .collect()
    };

    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

// PDF Info strings without a UTF-16 BOM use PDFDocEncoding, not UTF-8.
// Keeping this table local avoids treating valid typographic characters as
// replacement glyphs when titles come from older or generated PDFs.
const PDF_DOC_ENCODING: [u32; 256] = [
    0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007, 0x0008, 0x0009, 0x000A, 0x000B,
    0x000C, 0x000D, 0x000E, 0x000F, 0x0010, 0x0011, 0x0012, 0x0013, 0x0014, 0x0015, 0x0016, 0x0017,
    0x02D8, 0x02C7, 0x02C6, 0x02D9, 0x02DD, 0x02DB, 0x02DA, 0x02DC, 0x0020, 0x0021, 0x0022, 0x0023,
    0x0024, 0x0025, 0x0026, 0x0027, 0x0028, 0x0029, 0x002A, 0x002B, 0x002C, 0x002D, 0x002E, 0x002F,
    0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035, 0x0036, 0x0037, 0x0038, 0x0039, 0x003A, 0x003B,
    0x003C, 0x003D, 0x003E, 0x003F, 0x0040, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045, 0x0046, 0x0047,
    0x0048, 0x0049, 0x004A, 0x004B, 0x004C, 0x004D, 0x004E, 0x004F, 0x0050, 0x0051, 0x0052, 0x0053,
    0x0054, 0x0055, 0x0056, 0x0057, 0x0058, 0x0059, 0x005A, 0x005B, 0x005C, 0x005D, 0x005E, 0x005F,
    0x0060, 0x0061, 0x0062, 0x0063, 0x0064, 0x0065, 0x0066, 0x0067, 0x0068, 0x0069, 0x006A, 0x006B,
    0x006C, 0x006D, 0x006E, 0x006F, 0x0070, 0x0071, 0x0072, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077,
    0x0078, 0x0079, 0x007A, 0x007B, 0x007C, 0x007D, 0x007E, 0x0000, 0x2022, 0x2020, 0x2021, 0x2026,
    0x2014, 0x2013, 0x0192, 0x2044, 0x2039, 0x203A, 0x2212, 0x2030, 0x201E, 0x201C, 0x201D, 0x2018,
    0x2019, 0x201A, 0x2122, 0xFB01, 0xFB02, 0x0141, 0x0152, 0x0160, 0x0178, 0x017D, 0x0131, 0x0142,
    0x0153, 0x0161, 0x017E, 0x0000, 0x20AC, 0x00A1, 0x00A2, 0x00A3, 0x00A4, 0x00A5, 0x00A6, 0x00A7,
    0x00A8, 0x00A9, 0x00AA, 0x00AB, 0x00AC, 0x0000, 0x00AE, 0x00AF, 0x00B0, 0x00B1, 0x00B2, 0x00B3,
    0x00B4, 0x00B5, 0x00B6, 0x00B7, 0x00B8, 0x00B9, 0x00BA, 0x00BB, 0x00BC, 0x00BD, 0x00BE, 0x00BF,
    0x00C0, 0x00C1, 0x00C2, 0x00C3, 0x00C4, 0x00C5, 0x00C6, 0x00C7, 0x00C8, 0x00C9, 0x00CA, 0x00CB,
    0x00CC, 0x00CD, 0x00CE, 0x00CF, 0x00D0, 0x00D1, 0x00D2, 0x00D3, 0x00D4, 0x00D5, 0x00D6, 0x00D7,
    0x00D8, 0x00D9, 0x00DA, 0x00DB, 0x00DC, 0x00DD, 0x00DE, 0x00DF, 0x00E0, 0x00E1, 0x00E2, 0x00E3,
    0x00E4, 0x00E5, 0x00E6, 0x00E7, 0x00E8, 0x00E9, 0x00EA, 0x00EB, 0x00EC, 0x00ED, 0x00EE, 0x00EF,
    0x00F0, 0x00F1, 0x00F2, 0x00F3, 0x00F4, 0x00F5, 0x00F6, 0x00F7, 0x00F8, 0x00F9, 0x00FA, 0x00FB,
    0x00FC, 0x00FD, 0x00FE, 0x00FF,
];

fn normalize_text(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_owned()
}

#[cfg(windows)]
pub fn render_pages(pdf_bytes: &[u8]) -> Result<Vec<Vec<u8>>, PdfError> {
    windows_impl::render_pages(pdf_bytes)
}

#[cfg(not(windows))]
pub fn render_pages(_pdf_bytes: &[u8]) -> Result<Vec<Vec<u8>>, PdfError> {
    Err(PdfError::new(
        "pdf-render-unavailable",
        "scanned PDF rendering is currently supported on Windows only",
    ))
}

#[cfg(windows)]
mod windows_impl {
    use std::path::Path;

    use super::PdfError;
    use tokio::runtime::Builder;
    use windows::{
        Data::Pdf::PdfDocument,
        Storage::Streams::{DataReader, FileRandomAccessStream, InMemoryRandomAccessStream},
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };

    pub fn render_pages(pdf_bytes: &[u8]) -> Result<Vec<Vec<u8>>, PdfError> {
        let path = std::env::temp_dir().join(format!("inkling-pdf-{}.pdf", uuid::Uuid::new_v4()));
        std::fs::write(&path, pdf_bytes)
            .map_err(|error| PdfError::new("pdf-temp-write", error.to_string()))?;

        let result = render_pages_from_file(&path);
        let _ = std::fs::remove_file(&path);
        result
    }

    fn render_pages_from_file(path: &Path) -> Result<Vec<Vec<u8>>, PdfError> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
            .map_err(|error| PdfError::new("winrt-init", error.to_string()))?;
        let _winrt = WinRtGuard;
        let runtime = Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| PdfError::new("runtime-init", error.to_string()))?;

        let result = runtime.block_on(render_pages_inner(path));
        drop(runtime);
        result
    }

    struct WinRtGuard;

    impl Drop for WinRtGuard {
        fn drop(&mut self) {
            unsafe { RoUninitialize() };
        }
    }

    async fn render_pages_inner(path: &Path) -> Result<Vec<Vec<u8>>, PdfError> {
        let path = windows::core::HSTRING::from(path.to_string_lossy().as_ref());
        let input =
            FileRandomAccessStream::OpenAsync(&path, windows::Storage::FileAccessMode::Read)
                .map_err(|error| PdfError::new("stream-open", error.to_string()))?
                .await
                .map_err(|error| PdfError::new("stream-open-await", error.to_string()))?;

        let document = PdfDocument::LoadFromStreamAsync(&input)
            .map_err(|error| PdfError::new("pdf-open", error.to_string()))?
            .await
            .map_err(|error| PdfError::new("pdf-open-await", error.to_string()))?;
        let page_count = document
            .PageCount()
            .map_err(|error| PdfError::new("page-count", error.to_string()))?;

        let mut rendered_pages = Vec::with_capacity(page_count as usize);
        for page_index in 0..page_count {
            let page = document
                .GetPage(page_index)
                .map_err(|error| PdfError::new("page-open", error.to_string()))?;
            let output = InMemoryRandomAccessStream::new()
                .map_err(|error| PdfError::new("page-stream", error.to_string()))?;
            page.RenderToStreamAsync(&output)
                .map_err(|error| PdfError::new("page-render", error.to_string()))?
                .await
                .map_err(|error| PdfError::new("page-render-await", error.to_string()))?;

            let size = output
                .Size()
                .map_err(|error| PdfError::new("page-size", error.to_string()))?;
            let size = u32::try_from(size)
                .map_err(|_| PdfError::new("page-too-large", "rendered PDF page exceeds 4 GiB"))?;
            output
                .Seek(0)
                .map_err(|error| PdfError::new("page-seek", error.to_string()))?;
            let reader = DataReader::CreateDataReader(&output)
                .map_err(|error| PdfError::new("page-reader", error.to_string()))?;
            reader
                .LoadAsync(size)
                .map_err(|error| PdfError::new("page-load", error.to_string()))?
                .await
                .map_err(|error| PdfError::new("page-load-await", error.to_string()))?;
            let mut bytes = vec![0; size as usize];
            reader
                .ReadBytes(&mut bytes)
                .map_err(|error| PdfError::new("page-read", error.to_string()))?;
            rendered_pages.push(bytes);
            page.Close()
                .map_err(|error| PdfError::new("page-close", error.to_string()))?;
        }

        Ok(rendered_pages)
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_text_string, normalize_text};

    #[test]
    fn normalizes_page_whitespace() {
        assert_eq!(normalize_text(" one\n two\tthree "), "one two three");
    }

    #[test]
    fn decodes_pdfdoc_encoded_titles() {
        assert_eq!(decode_text_string(b"NASA\x90s Guide"), "NASA’s Guide");
    }

    #[test]
    fn decodes_utf16_pdf_titles() {
        assert_eq!(
            decode_text_string(&[
                0xFE, 0xFF, 0x00, b'T', 0x00, b'i', 0x00, b't', 0x00, b'l', 0x00, b'e'
            ]),
            "Title"
        );
    }
}
