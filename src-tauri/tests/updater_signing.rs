use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use std::{env, fs};

#[test]
#[ignore = "requires the release signing key"]
fn release_signing_key_matches_configured_updater_public_key() {
    let public_key =
        env::var("INKLING_UPDATER_PUBLIC_KEY").expect("updater public key is required");
    let public_key = base64::engine::general_purpose::STANDARD
        .decode(public_key)
        .expect("updater public key must be base64 encoded");
    let public_key = String::from_utf8(public_key).expect("updater public key must be UTF-8");
    let public_key = PublicKey::decode(&public_key).expect("updater public key must be valid");
    let payload =
        fs::read(env::var("INKLING_SIGNING_TEST_PAYLOAD").expect("test payload is required"))
            .expect("test payload must be readable");
    let signature = fs::read_to_string(
        env::var("INKLING_SIGNING_TEST_SIGNATURE").expect("test signature is required"),
    )
    .expect("test signature must be readable");
    let signature = base64::engine::general_purpose::STANDARD
        .decode(signature.trim())
        .expect("test signature must be base64 encoded");
    let signature = String::from_utf8(signature).expect("test signature must be UTF-8");
    let signature = Signature::decode(&signature).expect("test signature must be valid");

    public_key
        .verify(&payload, &signature, true)
        .expect("release private key must match the configured updater public key");
    assert!(signature
        .trusted_comment()
        .split('\t')
        .any(|field| field == "version:0.0.0"));
}
