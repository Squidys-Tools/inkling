use std::{
    fs::{self, File},
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    sync::{Mutex, Once, OnceLock},
};

use image::{imageops::FilterType, ImageReader};
use ort::{session::Session, value::Tensor};
use sha2::{Digest, Sha256};
use tokenizers::{tokenizer::Tokenizer, utils::truncation::TruncationParams};

pub const TEXT_MODEL: &str = "nomic-embed-text-v1.5";
pub const IMAGE_MODEL: &str = "nomic-embed-vision-v1.5";
pub const TEXT_DIMENSION: usize = 768;
pub const IMAGE_DIMENSION: usize = 768;

const TEXT_MAX_TOKENS: usize = 8192;
const IMAGE_EDGE: u32 = 224;
const IMAGE_MEAN: [f32; 3] = [0.48145466, 0.4578275, 0.40821073];
const IMAGE_STD: [f32; 3] = [0.26862954, 0.26130258, 0.27577711];
const ONNX_FILE: &str = "onnx/model_int8.onnx";
const TEXT_TOKENIZER_FILE: &str = "tokenizer.json";

// Pin the exact published artifacts so a future change to a repository's
// default branch cannot silently change the embedding space.
const TEXT_MODEL_URL: &str =
    "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/resolve/e9b6763023c676ca8431644204f50c2b100d9aab/onnx/model_int8.onnx";
const TEXT_TOKENIZER_URL: &str =
    "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/resolve/e9b6763023c676ca8431644204f50c2b100d9aab/tokenizer.json";
const IMAGE_MODEL_URL: &str =
    "https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5/resolve/e3a725bce72db07ca4adb1d83da08903f3ee02f8/onnx/model_int8.onnx";

const TEXT_MODEL_SHA256: &str = "b4342336debaea79de872370664b0aaeb67dea4605513d00ee236ea871a81f27";
const TEXT_TOKENIZER_SHA256: &str =
    "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66";
const IMAGE_MODEL_SHA256: &str = "ba9107df6e412828dae8c675096209aa39f6536de8ec8d9a872665b54dc750c3";

static ORT_INIT: Once = Once::new();
static TEXT_RUNTIME: OnceLock<Mutex<Option<TextRuntime>>> = OnceLock::new();
static IMAGE_RUNTIME: OnceLock<Mutex<Option<ImageRuntime>>> = OnceLock::new();

struct TextRuntime {
    model_cache: PathBuf,
    tokenizer: Tokenizer,
    session: Session,
}

struct ImageRuntime {
    model_cache: PathBuf,
    session: Session,
}

/// Embeds a search query with the Nomic query prefix.
#[allow(dead_code)]
pub fn text_embedding(model_cache: &Path, text: &str) -> Result<Vec<f32>, String> {
    text_query_embedding(model_cache, text)
}

/// Embeds stored item content with the Nomic document prefix.
pub fn text_document_embedding(model_cache: &Path, text: &str) -> Result<Vec<f32>, String> {
    let text = non_empty_text(text)?.to_owned();
    let model_cache = model_cache.to_path_buf();
    run_with_large_stack(move || {
        with_text_runtime(&model_cache, true, |runtime| {
            runtime.embed(&format!("search_document: {text}"))
        })
    })
}

/// Embeds a user query without downloading model files during search.
pub fn text_query_embedding(model_cache: &Path, text: &str) -> Result<Vec<f32>, String> {
    let text = non_empty_text(text)?.to_owned();
    let model_cache = model_cache.to_path_buf();
    #[cfg(test)]
    let fallback_text = text.clone();
    let result = run_with_large_stack(move || {
        with_text_runtime(&model_cache, false, |runtime| {
            runtime.embed(&format!("search_query: {text}"))
        })
    });
    match result {
        Ok(vector) => Ok(vector),
        Err(error) => {
            // Storage tests intentionally run without the 230 MB model bundle.
            // Production builds retain lexical search when the learned model is unavailable.
            #[cfg(test)]
            {
                let _ = error;
                Ok(legacy_text_embedding(&fallback_text))
            }
            #[cfg(not(test))]
            {
                Err(error)
            }
        }
    }
}

/// Embeds an image with Nomic Vision v1.5. The first indexing run downloads
/// the published INT8 ONNX artifact into the app's model cache.
pub fn image_embedding(model_cache: &Path, image_bytes: &[u8]) -> Result<Vec<f32>, String> {
    if image_bytes.is_empty() {
        return Err("cannot embed empty image".into());
    }

    let image_bytes = image_bytes.to_vec();
    let model_cache = model_cache.to_path_buf();
    run_with_large_stack(move || {
        with_image_runtime(&model_cache, true, |runtime| runtime.embed(&image_bytes))
    })
}

/// ONNX graph loading and inference overflow the default 1-2 MB thread stack
/// in debug builds (STATUS_STACK_OVERFLOW on Windows). Tauri runs synchronous
/// commands on the main thread, so every embedding call is executed on a
/// dedicated thread with a stack large enough for the runtime.
fn run_with_large_stack<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    std::thread::Builder::new()
        .name("embedding-inference".into())
        .stack_size(64 * 1024 * 1024)
        .spawn(work)
        .map_err(|error| format!("cannot spawn embedding inference thread: {error}"))?
        .join()
        .map_err(|_| "embedding inference thread panicked".to_owned())?
}

fn non_empty_text(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("cannot embed empty text".into());
    }
    if text.chars().any(|character| character.is_alphanumeric()) {
        Ok(text.to_owned())
    } else {
        Err("text contains no embeddable characters".into())
    }
}

fn with_text_runtime<T>(
    model_cache: &Path,
    allow_download: bool,
    operation: impl FnOnce(&mut TextRuntime) -> Result<T, String>,
) -> Result<T, String> {
    let state = TEXT_RUNTIME.get_or_init(|| Mutex::new(None));
    let mut guard = state
        .lock()
        .map_err(|_| "text embedding runtime lock is poisoned".to_owned())?;
    let cache = model_cache.to_path_buf();
    let reload = guard
        .as_ref()
        .map(|runtime| runtime.model_cache != cache)
        .unwrap_or(true);
    if reload {
        *guard = Some(TextRuntime::load(&cache, allow_download)?);
    }
    operation(
        guard
            .as_mut()
            .expect("text runtime is initialized before inference"),
    )
}

fn with_image_runtime<T>(
    model_cache: &Path,
    allow_download: bool,
    operation: impl FnOnce(&mut ImageRuntime) -> Result<T, String>,
) -> Result<T, String> {
    let state = IMAGE_RUNTIME.get_or_init(|| Mutex::new(None));
    let mut guard = state
        .lock()
        .map_err(|_| "image embedding runtime lock is poisoned".to_owned())?;
    let cache = model_cache.to_path_buf();
    let reload = guard
        .as_ref()
        .map(|runtime| runtime.model_cache != cache)
        .unwrap_or(true);
    if reload {
        *guard = Some(ImageRuntime::load(&cache, allow_download)?);
    }
    operation(
        guard
            .as_mut()
            .expect("image runtime is initialized before inference"),
    )
}

impl TextRuntime {
    fn load(model_cache: &Path, allow_download: bool) -> Result<Self, String> {
        let model_root = model_cache.join(TEXT_MODEL);
        let model_path = model_root.join(ONNX_FILE);
        let tokenizer_path = model_root.join(TEXT_TOKENIZER_FILE);
        prepare_asset(
            &model_path,
            TEXT_MODEL_URL,
            TEXT_MODEL_SHA256,
            allow_download,
        )?;
        prepare_asset(
            &tokenizer_path,
            TEXT_TOKENIZER_URL,
            TEXT_TOKENIZER_SHA256,
            allow_download,
        )?;

        let mut tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|error| format!("cannot load Nomic tokenizer: {error}"))?;
        tokenizer
            .with_truncation(Some(TruncationParams {
                max_length: TEXT_MAX_TOKENS,
                ..Default::default()
            }))
            .map_err(|error| format!("cannot configure Nomic tokenizer: {error}"))?;

        init_onnx_runtime();
        let session = Session::builder()
            .map_err(|error| format!("cannot create ONNX text session: {error}"))?
            .commit_from_file(&model_path)
            .map_err(|error| format!("cannot load Nomic text model: {error}"))?;

        Ok(Self {
            model_cache: model_cache.to_path_buf(),
            tokenizer,
            session,
        })
    }

    fn embed(&mut self, text: &str) -> Result<Vec<f32>, String> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|error| format!("Nomic tokenization failed: {error}"))?;
        let ids = encoding
            .get_ids()
            .iter()
            .map(|id| i64::from(*id))
            .collect::<Vec<_>>();
        let type_ids = encoding
            .get_type_ids()
            .iter()
            .map(|id| i64::from(*id))
            .collect::<Vec<_>>();
        let attention_mask = encoding
            .get_attention_mask()
            .iter()
            .map(|mask| i64::from(*mask))
            .collect::<Vec<_>>();
        let sequence_length = ids.len();
        if sequence_length == 0 {
            return Err("Nomic tokenizer produced no tokens".into());
        }

        let input_ids = Tensor::from_array(([1, sequence_length], ids))
            .map_err(|error| format!("cannot build Nomic input_ids tensor: {error}"))?;
        let token_type_ids = Tensor::from_array(([1, sequence_length], type_ids))
            .map_err(|error| format!("cannot build Nomic token_type_ids tensor: {error}"))?;
        let attention_tensor =
            Tensor::from_array(([1, sequence_length], attention_mask.clone()))
                .map_err(|error| format!("cannot build Nomic attention_mask tensor: {error}"))?;
        let outputs = self
            .session
            .run(ort::inputs! {
                "input_ids" => input_ids,
                "token_type_ids" => token_type_ids,
                "attention_mask" => attention_tensor,
            })
            .map_err(|error| format!("Nomic text inference failed: {error}"))?;
        let (shape, hidden_states) = outputs["last_hidden_state"]
            .try_extract_tensor::<f32>()
            .map_err(|error| format!("cannot read Nomic text output: {error}"))?;
        if shape.len() != 3
            || shape[0] != 1
            || shape[1] != i64::try_from(sequence_length).unwrap_or(-1)
            || shape[2] != i64::try_from(TEXT_DIMENSION).unwrap_or(-1)
        {
            return Err(format!("Nomic text output has unexpected shape {shape:?}"));
        }

        let active_tokens = attention_mask.iter().filter(|mask| **mask != 0).count();
        if active_tokens == 0 {
            return Err("Nomic attention mask contains no active tokens".into());
        }
        let mut vector = vec![0.0_f32; TEXT_DIMENSION];
        for token_index in 0..sequence_length {
            if attention_mask[token_index] == 0 {
                continue;
            }
            let start = token_index * TEXT_DIMENSION;
            for (dimension, value) in vector.iter_mut().enumerate() {
                *value += hidden_states[start + dimension];
            }
        }
        let divisor = active_tokens as f32;
        for value in &mut vector {
            *value /= divisor;
        }
        layer_norm(&mut vector);
        normalize(&mut vector);
        Ok(vector)
    }
}

impl ImageRuntime {
    fn load(model_cache: &Path, allow_download: bool) -> Result<Self, String> {
        let model_root = model_cache.join(IMAGE_MODEL);
        let model_path = model_root.join(ONNX_FILE);
        prepare_asset(
            &model_path,
            IMAGE_MODEL_URL,
            IMAGE_MODEL_SHA256,
            allow_download,
        )?;

        init_onnx_runtime();
        let session = Session::builder()
            .map_err(|error| format!("cannot create ONNX vision session: {error}"))?
            .commit_from_file(&model_path)
            .map_err(|error| format!("cannot load Nomic vision model: {error}"))?;

        Ok(Self {
            model_cache: model_cache.to_path_buf(),
            session,
        })
    }

    fn embed(&mut self, image_bytes: &[u8]) -> Result<Vec<f32>, String> {
        let image = ImageReader::new(Cursor::new(image_bytes))
            .with_guessed_format()
            .map_err(|error| format!("image format detection failed: {error}"))?
            .decode()
            .map_err(|error| format!("image decoding failed: {error}"))?;
        let image = image
            .resize_to_fill(IMAGE_EDGE, IMAGE_EDGE, FilterType::CatmullRom)
            .to_rgb8();
        let plane_size = usize::try_from(IMAGE_EDGE * IMAGE_EDGE).unwrap_or(0);
        let mut pixels = vec![0.0_f32; 3 * plane_size];
        for (index, pixel) in image.pixels().enumerate() {
            for channel in 0..3 {
                let normalized = f32::from(pixel[channel]) / 255.0;
                pixels[channel * plane_size + index] =
                    (normalized - IMAGE_MEAN[channel]) / IMAGE_STD[channel];
            }
        }

        let input = Tensor::from_array(([1, 3, IMAGE_EDGE as usize, IMAGE_EDGE as usize], pixels))
            .map_err(|error| format!("cannot build Nomic pixel_values tensor: {error}"))?;
        let outputs = self
            .session
            .run(ort::inputs! { "pixel_values" => input })
            .map_err(|error| format!("Nomic vision inference failed: {error}"))?;
        let (shape, hidden_states) = outputs["last_hidden_state"]
            .try_extract_tensor::<f32>()
            .map_err(|error| format!("cannot read Nomic vision output: {error}"))?;
        if shape.len() != 3
            || shape[0] != 1
            || shape[1] < 1
            || shape[2] != i64::try_from(IMAGE_DIMENSION).unwrap_or(-1)
        {
            return Err(format!(
                "Nomic vision output has unexpected shape {shape:?}"
            ));
        }
        let mut vector = hidden_states[..IMAGE_DIMENSION].to_vec();
        normalize(&mut vector);
        Ok(vector)
    }
}

fn init_onnx_runtime() {
    ORT_INIT.call_once(|| {
        ort::init().with_name("mymind-library embeddings").commit();
    });
}

fn prepare_asset(
    path: &Path,
    url: &str,
    expected_sha256: &str,
    allow_download: bool,
) -> Result<(), String> {
    if path.is_file() {
        return verify_asset(path, expected_sha256);
    }
    if !allow_download {
        return Err(format!(
            "Nomic model asset is not installed: {}",
            path.display()
        ));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "cannot create model directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let partial_path = path.with_file_name(format!(
        ".{}.part",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("model")
    ));
    let mut response = ureq::get(url)
        .call()
        .map_err(|error| format!("cannot download Nomic model asset from {url}: {error}"))?;
    let mut output = File::create(&partial_path).map_err(|error| {
        format!(
            "cannot create model download {}: {error}",
            partial_path.display()
        )
    })?;
    io::copy(&mut response.body_mut().as_reader(), &mut output).map_err(|error| {
        format!(
            "cannot save Nomic model asset {}: {error}",
            partial_path.display()
        )
    })?;
    drop(output);
    let length = fs::metadata(&partial_path)
        .map_err(|error| format!("cannot inspect downloaded Nomic asset: {error}"))?
        .len();
    if length == 0 {
        return Err(format!("downloaded Nomic model asset is empty: {url}"));
    }
    verify_asset(&partial_path, expected_sha256)?;
    fs::rename(&partial_path, path).map_err(|error| {
        format!(
            "cannot finalize downloaded Nomic model asset {}: {error}",
            path.display()
        )
    })?;
    Ok(())
}

fn verify_asset(path: &Path, expected_sha256: &str) -> Result<(), String> {
    let mut file = File::open(path)
        .map_err(|error| format!("cannot open Nomic model asset {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let bytes_read = file.read(&mut buffer).map_err(|error| {
            format!("cannot hash Nomic model asset {}: {error}", path.display())
        })?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected_sha256 {
        return Err(format!(
            "Nomic model asset integrity check failed for {}",
            path.display()
        ));
    }
    Ok(())
}

fn layer_norm(vector: &mut [f32]) {
    let mean = vector.iter().sum::<f32>() / vector.len() as f32;
    let variance = vector
        .iter()
        .map(|value| {
            let difference = *value - mean;
            difference * difference
        })
        .sum::<f32>()
        / vector.len() as f32;
    let scale = (variance + 1e-12).sqrt();
    for value in vector {
        *value = (*value - mean) / scale;
    }
}

fn normalize(vector: &mut [f32]) {
    let magnitude = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if magnitude > f32::EPSILON {
        for value in vector {
            *value /= magnitude;
        }
    }
}

pub fn encode_f32(embedding: &[f32]) -> Vec<u8> {
    embedding
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

#[allow(dead_code)]
pub fn decode_f32(bytes: &[u8]) -> Result<Vec<f32>, String> {
    let chunks = bytes.chunks_exact(std::mem::size_of::<f32>());
    if !chunks.remainder().is_empty() {
        return Err("embedding blob has an invalid byte length".into());
    }
    Ok(chunks
        .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("chunks_exact guarantees size")))
        .collect())
}

#[cfg(test)]
fn legacy_text_embedding(text: &str) -> Vec<f32> {
    const DIMENSION: usize = 384;
    let mut vector = vec![0.0; DIMENSION];
    for token in text
        .split(|character: char| !character.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|token| !token.is_empty())
    {
        add_hashed_feature(&mut vector, token.as_bytes(), 1.0);
        for trigram in token.as_bytes().windows(3) {
            add_hashed_feature(&mut vector, trigram, 0.35);
        }
    }
    normalize(&mut vector);
    vector
}

#[cfg(test)]
fn add_hashed_feature(vector: &mut [f32], feature: &[u8], weight: f32) {
    let hash = feature.iter().fold(2_166_136_261_u32, |hash, byte| {
        (hash ^ u32::from(*byte)).wrapping_mul(16_777_619)
    });
    let index = (hash as usize) % vector.len();
    let sign = if hash & 1 == 0 { 1.0 } else { -1.0 };
    vector[index] += sign * weight;
}

#[cfg(test)]
mod tests {
    use super::{decode_f32, encode_f32, image_embedding, text_embedding};

    #[test]
    fn round_trips_f32_vectors() {
        let input = vec![0.25, -1.5, 3.0];
        assert_eq!(decode_f32(&encode_f32(&input)).unwrap(), input);
    }

    #[test]
    fn rejects_partial_f32_bytes() {
        assert!(decode_f32(&[0, 1, 2]).is_err());
    }

    #[test]
    fn rejects_empty_text() {
        assert!(text_embedding(std::path::Path::new("models"), "  ").is_err());
    }

    #[test]
    fn rejects_empty_image() {
        assert!(image_embedding(std::path::Path::new("models"), &[]).is_err());
    }
}
