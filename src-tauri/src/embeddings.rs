use std::io::Cursor;
use std::path::Path;

use image::{imageops::FilterType, ImageReader};

pub const TEXT_MODEL: &str = "feature-hash-text-v1";
pub const IMAGE_MODEL: &str = "color-spatial-image-v1";
const TEXT_DIMENSION: usize = 384;
const IMAGE_DIMENSION: usize = 512;

/// Builds a stable, normalized text vector without a network call or model
/// runtime. Token and character-trigram features make related text searchable
/// while keeping the persisted vector format ready for a learned encoder.
pub fn text_embedding(_model_cache: &Path, text: &str) -> Result<Vec<f32>, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("cannot embed empty text".into());
    }

    let mut vector = vec![0.0; TEXT_DIMENSION];
    let mut feature_count = 0_u32;
    for token in text
        .split(|character: char| !character.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|token| !token.is_empty())
    {
        add_hashed_feature(&mut vector, token.as_bytes(), 1.0);
        feature_count += 1;
        for trigram in token.as_bytes().windows(3) {
            add_hashed_feature(&mut vector, trigram, 0.35);
            feature_count += 1;
        }
    }

    if feature_count == 0 {
        return Err("text contains no embeddable characters".into());
    }
    normalize(&mut vector);
    Ok(vector)
}

/// Builds a stable visual vector from spatial color, luminance, and color
/// histogram features. It is intentionally local and deterministic, so image
/// similarity works before a learned CLIP model is bundled.
pub fn image_embedding(_model_cache: &Path, image_bytes: &[u8]) -> Result<Vec<f32>, String> {
    if image_bytes.is_empty() {
        return Err("cannot embed empty image".into());
    }

    let image = ImageReader::new(Cursor::new(image_bytes))
        .with_guessed_format()
        .map_err(|error| format!("image format detection failed: {error}"))?
        .decode()
        .map_err(|error| format!("image decoding failed: {error}"))?;
    let rgb = image.to_rgb8();
    let small_gray = image.resize_exact(16, 16, FilterType::Triangle).to_luma8();
    let small_rgb = image.resize_exact(8, 8, FilterType::Triangle).to_rgb8();
    let mut vector = Vec::with_capacity(IMAGE_DIMENSION);

    vector.extend(small_gray.pixels().map(|pixel| f32::from(pixel[0]) / 255.0));
    for pixel in small_rgb.pixels() {
        vector.push(f32::from(pixel[0]) / 255.0);
        vector.push(f32::from(pixel[1]) / 255.0);
        vector.push(f32::from(pixel[2]) / 255.0);
    }

    let mut histogram = [0_u32; 64];
    for pixel in rgb.pixels() {
        let red = usize::from(pixel[0]) / 64;
        let green = usize::from(pixel[1]) / 64;
        let blue = usize::from(pixel[2]) / 64;
        histogram[(red << 4) | (green << 2) | blue] += 1;
    }
    let pixel_count = (rgb.width() as f32 * rgb.height() as f32).max(1.0);
    vector.extend(histogram.map(|value| value as f32 / pixel_count));

    if vector.len() != IMAGE_DIMENSION {
        return Err("image encoder produced an invalid vector dimension".into());
    }
    normalize(&mut vector);
    Ok(vector)
}

fn add_hashed_feature(vector: &mut [f32], feature: &[u8], weight: f32) {
    let hash = feature.iter().fold(2_166_136_261_u32, |hash, byte| {
        (hash ^ u32::from(*byte)).wrapping_mul(16_777_619)
    });
    let index = (hash as usize) % vector.len();
    let sign = if hash & 1 == 0 { 1.0 } else { -1.0 };
    vector[index] += sign * weight;
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
mod tests {
    use super::{decode_f32, encode_f32, image_embedding, text_embedding};

    #[test]
    fn text_vectors_are_normalized_and_stable() {
        let first =
            text_embedding(std::path::Path::new("models"), "Warm light and timber").unwrap();
        let second =
            text_embedding(std::path::Path::new("other"), "Warm light and timber").unwrap();
        assert_eq!(first, second);
        let magnitude = first.iter().map(|value| value * value).sum::<f32>().sqrt();
        assert!((magnitude - 1.0).abs() < 0.0001);
    }

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
