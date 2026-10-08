//! Public Ed25519 attestations bind exact native facts and channel context for five minutes; signatures do not guarantee source truth.
use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ring::signature::{Ed25519KeyPair, KeyPair};
fn key() -> Result<Ed25519KeyPair> {
    let secret = env::var("FACT_SIGNING_SEED")
        .or_else(|_| env::var("PLATFORM_SECRET_KEY"))
        .map_err(|_| {
            Error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Fact signing is not configured".into(),
            )
        })?;
    if secret.len() != 64 || !secret.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(bad("Fact signing seed must be 32-byte hexadecimal"));
    }
    let bytes = (0..64)
        .step_by(2)
        .map(|i| u8::from_str_radix(&secret[i..i + 2], 16).unwrap())
        .collect::<Vec<_>>();
    let seed = Sha256::digest(
        [
            b"vendune/public-facts/ed25519/v1".as_slice(),
            bytes.as_slice(),
        ]
        .concat(),
    );
    Ed25519KeyPair::from_seed_unchecked(&seed).map_err(|_| bad("Invalid fact signing key"))
}
pub(crate) fn attest(payload: Value) -> Result<Value> {
    let key = key()?;
    let bytes = serde_json::to_vec(&payload).map_err(|_| bad("Invalid fact payload"))?;
    let public = URL_SAFE_NO_PAD.encode(key.public_key().as_ref());
    Ok(
        json!({"payload":payload,"payloadBase64":URL_SAFE_NO_PAD.encode(&bytes),"signature":URL_SAFE_NO_PAD.encode(key.sign(&bytes).as_ref()),"algorithm":"Ed25519","keyId":hash(&public),"verificationKeys":"/.well-known/commerce-facts.json"}),
    )
}
async fn keys() -> Result<Json<Value>> {
    let public = URL_SAFE_NO_PAD.encode(key()?.public_key().as_ref());
    Ok(Json(
        json!({"keys":[{"kty":"OKP","crv":"Ed25519","x":public,"kid":hash(&public),"use":"sig","alg":"EdDSA"}],"schemaVersion":1}),
    ))
}
pub(crate) async fn facts(a: &App, h: &RequestContext, id: &str) -> Result<Value> {
    let t = tenant(h)?;
    let detail = commerce::product_detail(
        State(a.clone()),
        h.clone(),
        Path(id.into()),
        axum::extract::Query(CatalogCriteria::default()),
    )
    .await?
    .0;
    let claims = evidence::claims(a, &t, id, true).await?;
    let now = chrono::Utc::now().timestamp();
    attest(
        json!({"schemaVersion":1,"tenant":t,"channel":marketing::channel_id(h),"issuedAt":now,"expiresAt":now+300,"product":detail["product"],"claims":claims["claims"],"meaning":"Current recorded facts; availability is not a stock reservation and delivery estimates are not guarantees"}),
    )
}
async fn public(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    Ok(Json(facts(&a, &h, &id).await?))
}
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/.well-known/commerce-facts.json", get(keys))
        .route("/store-api/product/{id}/facts/signed", get(public))
        .route("/ucp/v1/products/{id}/facts", get(public))
}
#[cfg(test)]
mod tests {
    #[test]
    fn signatures_bind_exact_bytes_and_reject_modified_evidence() {
        use ring::signature::{ED25519, Ed25519KeyPair, KeyPair, UnparsedPublicKey};
        let key = Ed25519KeyPair::from_seed_unchecked(&[7; 32]).unwrap();
        let data = b"{\"stock\":4,\"expiresAt\":300}";
        let sig = key.sign(data);
        let verifier = UnparsedPublicKey::new(&ED25519, key.public_key().as_ref());
        assert!(verifier.verify(data, sig.as_ref()).is_ok());
        assert!(
            verifier
                .verify(b"{\"stock\":5,\"expiresAt\":300}", sig.as_ref())
                .is_err()
        );
    }
}
