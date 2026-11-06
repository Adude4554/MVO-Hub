//! Enterprise licensing.
//!
//! Licences are **offline-verifiable**: a tenant holds a signed token, and MVO
//! Hub checks the Ed25519 signature locally. That matters for enterprise
//! deployments behind air-gapped networks where a licence server may be
//! unreachable — a licensing check that needs the network would brick the app.
//!
//! The token format is deliberately boring so a customer can embed it verbatim
//! in their bootstrap config:
//!
//! ```text
//! base64url(payload_json) + "." + base64url(ed25519_signature)
//! ```

use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// What the licensed tenant may use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Tier {
    /// Community edition — all core features, no white-labelling.
    Community,
    /// Team edition — adds telemetry and SDK access.
    Team,
    /// Full OEM rights, including white-labelling and tenant profiles.
    Enterprise,
}

impl Tier {
    /// Whether the tier may rebrand the application.
    pub fn allows_white_label(self) -> bool {
        matches!(self, Tier::Enterprise)
    }

    /// Whether the tier may receive telemetry export.
    pub fn allows_telemetry(self) -> bool {
        matches!(self, Tier::Team | Tier::Enterprise)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Tier::Community => "community",
            Tier::Team => "team",
            Tier::Enterprise => "enterprise",
        }
    }
}

impl std::str::FromStr for Tier {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "community" | "" => Ok(Tier::Community),
            "team" => Ok(Tier::Team),
            "enterprise" => Ok(Tier::Enterprise),
            other => Err(format!("Unknown licence tier '{}'", other)),
        }
    }
}

/// The claims a signed licence carries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseClaims {
    pub tenant_id: String,
    pub tenant_name: String,
    pub tier: Tier,
    /// `None` means perpetual.
    #[serde(default)]
    pub expires_at: Option<String>,
    /// Maximum activated seats, `None` for unlimited.
    #[serde(default)]
    pub max_seats: Option<u32>,
    #[serde(default)]
    pub issued_at: Option<String>,
}

/// Result of verifying a licence token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub valid: bool,
    pub tier: Tier,
    pub tenant_id: Option<String>,
    pub tenant_name: Option<String>,
    pub expires_at: Option<String>,
    pub days_remaining: Option<i64>,
    pub reason: Option<String>,
}

impl LicenseStatus {
    /// A bare community licence, used when nothing is installed.
    pub fn community(reason: impl Into<String>) -> Self {
        Self {
            valid: false,
            tier: Tier::Community,
            tenant_id: None,
            tenant_name: None,
            expires_at: None,
            days_remaining: None,
            reason: Some(reason.into()),
        }
    }
}

/// Sign claims into a licence token. Used by the vendor-side tooling and by
/// tests; the app itself only ever *verifies*.
pub fn sign_license(claims: &LicenseClaims, signing_key: &SigningKey) -> Result<String, String> {
    if claims.tenant_id.trim().is_empty() {
        return Err("tenantId must not be empty".into());
    }
    let payload = serde_json::to_vec(claims).map_err(|e| e.to_string())?;
    let signature = signing_key.sign(&payload);
    Ok(format!(
        "{}.{}",
        B64.encode(payload),
        B64.encode(signature.to_bytes())
    ))
}

/// Verify a licence token against a public key.
///
/// Verification order matters: the signature is checked before any claim is
/// trusted, so an attacker cannot influence the expiry logic by editing the
/// payload.
pub fn verify_license(
    token: &str,
    verifying_key: &VerifyingKey,
    now: chrono::DateTime<chrono::Utc>,
) -> LicenseStatus {
    let Some((payload_b64, sig_b64)) = token.split_once('.') else {
        return LicenseStatus::community("Malformed licence token");
    };

    let payload = match B64.decode(payload_b64) {
        Ok(p) => p,
        Err(_) => return LicenseStatus::community("Licence payload is not valid base64"),
    };
    let sig_bytes = match B64.decode(sig_b64) {
        Ok(s) => s,
        Err(_) => return LicenseStatus::community("Licence signature is not valid base64"),
    };
    let sig_bytes: [u8; 64] = match sig_bytes.try_into() {
        Ok(b) => b,
        Err(_) => return LicenseStatus::community("Licence signature has the wrong length"),
    };
    let signature = Signature::from_bytes(&sig_bytes);

    if verifying_key.verify(&payload, &signature).is_err() {
        return LicenseStatus::community("Licence signature is invalid");
    }

    let claims: LicenseClaims = match serde_json::from_slice(&payload) {
        Ok(c) => c,
        Err(_) => return LicenseStatus::community("Licence payload is malformed"),
    };

    // Only now, with a verified payload, is it safe to evaluate expiry.
    let days_remaining = claims.expires_at.as_deref().and_then(|exp| {
        chrono::DateTime::parse_from_rfc3339(exp)
            .ok()
            .map(|d| (d.with_timezone(&chrono::Utc) - now).num_days())
    });

    let expired = match claims.expires_at.as_deref() {
        Some(exp) => match chrono::DateTime::parse_from_rfc3339(exp) {
            Ok(deadline) => deadline.with_timezone(&chrono::Utc) <= now,
            Err(_) => true, // An unparseable expiry fails closed.
        },
        None => false,
    };

    if expired {
        return LicenseStatus {
            valid: false,
            tier: Tier::Community,
            tenant_id: Some(claims.tenant_id),
            tenant_name: Some(claims.tenant_name),
            expires_at: claims.expires_at,
            days_remaining,
            reason: Some("Licence has expired".into()),
        };
    }

    LicenseStatus {
        valid: true,
        tier: claims.tier,
        tenant_id: Some(claims.tenant_id),
        tenant_name: Some(claims.tenant_name),
        expires_at: claims.expires_at,
        days_remaining,
        reason: None,
    }
}

/// Warn when a licence is close enough to expiry that an administrator should
/// be told. Returns the number of days remaining when that is under 30.
pub fn expiry_warning(status: &LicenseStatus) -> Option<i64> {
    match (status.valid, status.days_remaining) {
        (true, Some(days)) if days <= 30 => Some(days),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;
    use rand::rngs::OsRng;

    fn keypair() -> (SigningKey, VerifyingKey) {
        let signing = SigningKey::generate(&mut OsRng);
        let verifying = signing.verifying_key();
        (signing, verifying)
    }

    fn claims(tier: Tier, expires: Option<&str>) -> LicenseClaims {
        LicenseClaims {
            tenant_id: "acme".into(),
            tenant_name: "Acme Corp".into(),
            tier,
            expires_at: expires.map(str::to_string),
            max_seats: Some(50),
            issued_at: Some("2026-01-01T00:00:00Z".into()),
        }
    }

    fn now() -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::parse_from_rfc3339("2026-06-01T00:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc)
    }

    #[test]
    fn round_trip_valid_licence() {
        let (signing, verifying) = keypair();
        let token = sign_license(&claims(Tier::Enterprise, Some("2027-01-01T00:00:00Z")), &signing)
            .unwrap();
        let status = verify_license(&token, &verifying, now());

        assert!(status.valid);
        assert_eq!(status.tier, Tier::Enterprise);
        assert_eq!(status.tenant_id.as_deref(), Some("acme"));
        assert!(status.reason.is_none());
    }

    #[test]
    fn rejecting_a_tampered_payload() {
        let (signing, verifying) = keypair();
        let token = sign_license(&claims(Tier::Community, None), &signing).unwrap();
        let (_, sig) = token.split_once('.').unwrap();

        // Swap in an Enterprise payload, keeping the original signature.
        let forged = LicenseClaims {
            tier: Tier::Enterprise,
            ..claims(Tier::Community, None)
        };
        let forged_payload = B64.encode(serde_json::to_vec(&forged).unwrap());
        let status = verify_license(&format!("{}.{}", forged_payload, sig), &verifying, now());

        assert!(!status.valid);
        assert_eq!(status.tier, Tier::Community);
        assert!(status.reason.unwrap().contains("signature"));
    }

    #[test]
    fn rejecting_a_licence_signed_by_another_key() {
        let (_, verifying) = keypair();
        let (attacker, _) = keypair();
        let token = sign_license(&claims(Tier::Enterprise, None), &attacker).unwrap();

        let status = verify_license(&token, &verifying, now());
        assert!(!status.valid);
    }

    #[test]
    fn expired_licence_falls_back_to_community() {
        let (signing, verifying) = keypair();
        let token = sign_license(&claims(Tier::Enterprise, Some("2026-01-01T00:00:00Z")), &signing)
            .unwrap();
        let status = verify_license(&token, &verifying, now());

        assert!(!status.valid);
        assert_eq!(status.tier, Tier::Community, "expired must not retain paid tier");
        assert!(status.reason.unwrap().contains("expired"));
    }

    #[test]
    fn perpetual_licence_never_expires() {
        let (signing, verifying) = keypair();
        let token = sign_license(&claims(Tier::Enterprise, None), &signing).unwrap();
        let far_future = chrono::DateTime::parse_from_rfc3339("2099-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        assert!(verify_license(&token, &verifying, far_future).valid);
    }

    #[test]
    fn unparseable_expiry_fails_closed() {
        let (signing, verifying) = keypair();
        let token = sign_license(&claims(Tier::Enterprise, Some("not-a-date")), &signing).unwrap();
        assert!(!verify_license(&token, &verifying, now()).valid);
    }

    #[test]
    fn malformed_tokens_are_rejected_without_panicking() {
        let (_, verifying) = keypair();
        for bad in ["", "onlyonepart", "a.b.c", "!!!.???", "eyJ9.!!!!"] {
            let status = verify_license(bad, &verifying, now());
            assert!(!status.valid, "'{}' should be rejected", bad);
            assert_eq!(status.tier, Tier::Community);
        }
    }

    #[test]
    fn signing_rejects_an_empty_tenant_id() {
        let (signing, _) = keypair();
        let bad = LicenseClaims {
            tenant_id: "  ".into(),
            ..claims(Tier::Enterprise, None)
        };
        assert!(sign_license(&bad, &signing).is_err());
    }

    #[test]
    fn days_remaining_is_reported() {
        let (signing, verifying) = keypair();
        let token = sign_license(&claims(Tier::Enterprise, Some("2026-07-01T00:00:00Z")), &signing)
            .unwrap();
        let status = verify_license(&token, &verifying, now());
        assert_eq!(status.days_remaining, Some(30));
    }

    #[test]
    fn expiry_warning_only_fires_when_close() {
        let near = LicenseStatus {
            valid: true,
            days_remaining: Some(10),
            ..LicenseStatus::community("")
        };
        let far = LicenseStatus {
            valid: true,
            days_remaining: Some(365),
            ..LicenseStatus::community("")
        };
        let expired = LicenseStatus {
            valid: false,
            days_remaining: Some(-5),
            ..LicenseStatus::community("")
        };
        assert_eq!(expiry_warning(&near), Some(10));
        assert_eq!(expiry_warning(&far), None);
        assert_eq!(expiry_warning(&expired), None);
    }

    #[test]
    fn tier_parsing_is_case_insensitive_and_defaults_to_community() {
        assert_eq!("ENTERPRISE".parse::<Tier>().unwrap(), Tier::Enterprise);
        assert_eq!("Team".parse::<Tier>().unwrap(), Tier::Team);
        assert_eq!("".parse::<Tier>().unwrap(), Tier::Community);
        assert!("platinum".parse::<Tier>().is_err());
    }

    #[test]
    fn tier_capabilities_are_least_privilege() {
        assert!(!Tier::Community.allows_white_label());
        assert!(!Tier::Community.allows_telemetry());
        assert!(!Tier::Team.allows_white_label());
        assert!(Tier::Team.allows_telemetry());
        assert!(Tier::Enterprise.allows_white_label());
        assert!(Tier::Enterprise.allows_telemetry());
    }
}
