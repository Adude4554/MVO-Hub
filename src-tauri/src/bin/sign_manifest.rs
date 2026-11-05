//! Manifest signing utility for the MVO Hub release pipeline.
//!
//! Generates and uses the Ed25519 key that authenticates the unified update
//! manifest consumed by `src/updater.rs`.
//!
//! Usage:
//!   sign_manifest keygen
//!       Generate a fresh keypair. Prints:
//!         MANIFEST_SIGNING_KEY=<base64 32-byte seed>  -> store as GitHub Secret
//!         MANIFEST_PUBLIC_KEY=<base64 32-byte pubkey> -> embed in updater.rs
//!
//!   sign_manifest sign --in <unsigned.json> --out <signed.json>
//!       Signs the manifest body (top-level `signature` removed) and writes
//!       the signed document. Reads the seed from env `MANIFEST_SIGNING_KEY`.
//!       Self-verifies against the embedded public key before exiting 0,
//!       so a seed/pubkey mismatch fails the CI pipeline immediately.
//!
//!   sign_manifest verify --in <signed.json>
//!       Verifies a signed manifest against the embedded public key.

use std::env;
use std::fs;
use std::process::ExitCode;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use ed25519_dalek::{Signer, SigningKey};
use project_mvo_app_lib::updater::{
    canonical_manifest_bytes, verify_manifest_signature_with, MANIFEST_PUBLIC_KEY_B64,
};
use serde_json::Value;

fn usage() -> &'static str {
    "Usage:\n  sign_manifest keygen\n  sign_manifest sign --in <unsigned.json> --out <signed.json>\n  sign_manifest verify --in <signed.json>"
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn load_signing_key() -> Result<SigningKey, String> {
    let raw = env::var("MANIFEST_SIGNING_KEY")
        .map_err(|_| "MANIFEST_SIGNING_KEY environment variable is not set".to_string())?;
    let bytes = B64
        .decode(raw.trim())
        .map_err(|e| format!("MANIFEST_SIGNING_KEY is not valid base64: {}", e))?;
    let seed: [u8; 32] = bytes
        .as_slice()
        .try_into()
        .map_err(|_| "MANIFEST_SIGNING_KEY must decode to exactly 32 bytes".to_string())?;
    Ok(SigningKey::from_bytes(&seed))
}

fn read_manifest(path: &str) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("Cannot read {}: {}", path, e))?;
    serde_json::from_str(&text).map_err(|e| format!("Cannot parse {} as JSON: {}", path, e))
}

fn cmd_keygen() -> Result<(), String> {
    use rand::RngCore;
    let mut seed = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut seed);
    let signing_key = SigningKey::from_bytes(&seed);

    println!("MANIFEST_SIGNING_KEY={}", B64.encode(seed));
    println!(
        "MANIFEST_PUBLIC_KEY={}",
        B64.encode(signing_key.verifying_key().to_bytes())
    );
    println!();
    println!("Store MANIFEST_SIGNING_KEY as a GitHub Actions repository secret.");
    println!("Embed MANIFEST_PUBLIC_KEY in src-tauri/src/updater.rs (MANIFEST_PUBLIC_KEY_B64).");
    println!("WARNING: keep the seed out of the repository.");
    Ok(())
}

fn cmd_sign(args: &[String]) -> Result<(), String> {
    let in_path = arg_value(args, "--in").ok_or_else(|| usage().to_string())?;
    let out_path = arg_value(args, "--out").ok_or_else(|| usage().to_string())?;

    let signing_key = load_signing_key()?;
    let mut manifest = read_manifest(&in_path)?;

    if !manifest.is_object() {
        return Err("Manifest must be a JSON object".into());
    }

    // Canonical body = manifest without its `signature` field (deterministic).
    let body = canonical_manifest_bytes(&manifest)?;
    let signature = signing_key.sign(&body);
    manifest["signature"] = Value::String(B64.encode(signature.to_bytes()));

    let signed = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Cannot serialize signed manifest: {}", e))?;
    fs::write(&out_path, signed).map_err(|e| format!("Cannot write {}: {}", out_path, e))?;

    // Self-check: the embedded public key must accept what we just produced.
    // This catches seed/pubkey mismatch before a release is published.
    let verify = read_manifest(&out_path)?;
    verify_manifest_signature_with(&verify, MANIFEST_PUBLIC_KEY_B64)?;

    println!("Signed {} -> {} (Ed25519, verified against embedded key)", in_path, out_path);
    Ok(())
}

fn cmd_verify(args: &[String]) -> Result<(), String> {
    let in_path = arg_value(args, "--in").ok_or_else(|| usage().to_string())?;
    let manifest = read_manifest(&in_path)?;
    verify_manifest_signature_with(&manifest, MANIFEST_PUBLIC_KEY_B64)?;
    println!("OK: {} carries a valid Ed25519 manifest signature", in_path);
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("keygen") => cmd_keygen(),
        Some("sign") => cmd_sign(&args),
        Some("verify") => cmd_verify(&args),
        _ => Err(usage().to_string()),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("ERROR: {}", e);
            ExitCode::FAILURE
        }
    }
}
