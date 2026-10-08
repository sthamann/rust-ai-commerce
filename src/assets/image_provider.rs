//! Optional OpenAI Images adapter; bounded responses and decoded PNG output, no remote user URLs or leaked provider errors.
use crate::*;
use base64::{Engine, engine::general_purpose::STANDARD};
pub(super) async fn configured(a: &App) -> bool {
    env::var("IMAGE_GENERATION_ENABLED").as_deref() == Ok("true")
        && a.inference
            .connection("openai")
            .await
            .is_ok_and(|(_, key, _)| key.is_some())
}
pub(super) fn model() -> String {
    env::var("OPENAI_IMAGE_MODEL").unwrap_or("gpt-image-2.5-sunburst".into())
}
pub(super) async fn create(
    a: &App,
    prompt: &str,
    source: Option<(String, Vec<u8>)>,
) -> Result<Vec<u8>> {
    let (base, key, _) = a.inference.connection("openai").await.map_err(bad)?;
    let key = key.ok_or(bad("Image provider not configured"))?;
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|_| bad("Image client unavailable"))?;
    let request = if let Some((mime, bytes)) = source {
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name("product-image")
            .mime_str(&mime)
            .map_err(|_| bad("Unsupported image input"))?;
        http.post(format!("{}/images/edits", base.trim_end_matches('/')))
            .multipart(
                reqwest::multipart::Form::new()
                    .text("model", model())
                    .text("prompt", prompt.to_owned())
                    .text("size", "1024x1024")
                    .text("quality", "medium")
                    .text("output_format", "png")
                    .part("image[]", part),
            )
    } else {
        http.post(format!("{}/images/generations",base.trim_end_matches('/'))).json(&json!({"model":model(),"prompt":prompt,"n":1,"size":"1024x1024","quality":"medium","output_format":"png"}))
    };
    let mut response = request
        .bearer_auth(key)
        .send()
        .await
        .map_err(|_| bad("Image provider request failed; no automatic retry"))?;
    if !response.status().is_success() {
        return Err(bad(format!(
            "Image provider rejected request ({})",
            response.status().as_u16()
        )));
    }
    let mut bytes = vec![];
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| bad("Image provider response interrupted"))?
    {
        if bytes.len() + chunk.len() > 12 * 1024 * 1024 {
            return Err(bad("Image provider response too large"));
        }
        bytes.extend(chunk);
    }
    let result: Value =
        serde_json::from_slice(&bytes).map_err(|_| bad("Invalid image provider response"))?;
    let encoded = result["data"][0]["b64_json"]
        .as_str()
        .ok_or(bad("Image provider did not return image bytes"))?;
    let decoded = STANDARD
        .decode(encoded)
        .map_err(|_| bad("Invalid generated image encoding"))?;
    tokio::task::spawn_blocking(move || checked_png(&decoded))
        .await
        .map_err(|_| bad("Image decoding worker failed"))?
}
fn checked_png(bytes: &[u8]) -> Result<Vec<u8>> {
    if bytes.is_empty() || bytes.len() > 8 * 1024 * 1024 {
        return Err(bad("Generated image exceeds asset limit"));
    }
    let reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| bad("Invalid generated image"))?;
    let mut reader = reader;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| bad("Invalid or oversized generated image"))?;
    let mut png = std::io::Cursor::new(vec![]);
    image
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|_| bad("Image encoding failed"))?;
    let png = png.into_inner();
    if png.len() > 8 * 1024 * 1024 {
        return Err(bad("Generated PNG exceeds asset limit"));
    }
    Ok(png)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn image_bytes_are_decoded_not_trusted_by_magic() {
        assert!(checked_png(b"\x89PNG\r\n\x1a\ninvalid").is_err());
        let image = image::DynamicImage::new_rgb8(3, 2);
        let mut out = std::io::Cursor::new(vec![]);
        image.write_to(&mut out, image::ImageFormat::Png).unwrap();
        assert!(checked_png(&out.into_inner()).is_ok());
    }
}
