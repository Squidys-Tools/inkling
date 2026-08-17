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
    use super::PdfError;
    use tokio::runtime::Builder;
    use windows::{
        Data::Pdf::PdfDocument,
        Storage::Streams::{DataReader, DataWriter, InMemoryRandomAccessStream},
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };

    pub fn render_pages(pdf_bytes: &[u8]) -> Result<Vec<Vec<u8>>, PdfError> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
            .map_err(|error| PdfError::new("winrt-init", error.to_string()))?;
        let _winrt = WinRtGuard;
        let runtime = Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| PdfError::new("runtime-init", error.to_string()))?;

        let result = runtime.block_on(render_pages_inner(pdf_bytes));
        drop(runtime);
        result
    }

    struct WinRtGuard;

    impl Drop for WinRtGuard {
        fn drop(&mut self) {
            unsafe { RoUninitialize() };
        }
    }

    async fn render_pages_inner(pdf_bytes: &[u8]) -> Result<Vec<Vec<u8>>, PdfError> {
        let input = InMemoryRandomAccessStream::new()
            .map_err(|error| PdfError::new("stream-create", error.to_string()))?;
        {
            let writer = DataWriter::CreateDataWriter(&input)
                .map_err(|error| PdfError::new("stream-writer", error.to_string()))?;
            writer
                .WriteBytes(pdf_bytes)
                .map_err(|error| PdfError::new("stream-write", error.to_string()))?;
            writer
                .StoreAsync()
                .map_err(|error| PdfError::new("stream-store", error.to_string()))?
                .await
                .map_err(|error| PdfError::new("stream-store-await", error.to_string()))?;
            writer
                .FlushAsync()
                .map_err(|error| PdfError::new("stream-flush", error.to_string()))?
                .await
                .map_err(|error| PdfError::new("stream-flush-await", error.to_string()))?;
        }
        input
            .Seek(0)
            .map_err(|error| PdfError::new("stream-seek", error.to_string()))?;

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
    use super::normalize_text;

    #[test]
    fn normalizes_page_whitespace() {
        assert_eq!(normalize_text(" one\n two\tthree "), "one two three");
    }
}
