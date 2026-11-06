//! Tenant configuration and white-label profiles.
//!
//! A tenant profile lets an OEM rebrand MVO Hub: product name, colours, logo,
//! support URLs and feature switches. Because this ships to end users, it is
//! validated strictly — a bad profile should be rejected at save time, not
//! produce a half-rendered UI in the field.
//!
//! Colours are restricted to `#rrggbb` deliberately: a CSS injection through a
//! brand colour would be a design-level escape, since these values are applied
//! as inline styles.

use serde::{Deserialize, Serialize};

use super::license::Tier;

/// Branding applied to the application shell.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branding {
    pub product_name: String,
    pub short_name: String,
    /// `#rrggbb` — the primary accent.
    pub primary_color: String,
    /// `#rrggbb` — the bright accent used for highlights.
    pub accent_color: String,
    /// Absolute `https://` URL, or empty.
    #[serde(default)]
    pub logo_url: String,
    /// Absolute `https://` URL, or empty.
    #[serde(default)]
    pub support_url: String,
}

impl Default for Branding {
    fn default() -> Self {
        Self {
            product_name: "MVO Hub".into(),
            short_name: "MVO".into(),
            primary_color: "#e11d48".into(),
            accent_color: "#ff2d55".into(),
            logo_url: String::new(),
            support_url: String::new(),
        }
    }
}

/// Feature switches an OEM can turn off for their deployment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantFeatures {
    pub plugins_enabled: bool,
    pub cloud_sync_enabled: bool,
    pub telemetry_enabled: bool,
    pub beta_channels_enabled: bool,
}

impl Default for TenantFeatures {
    fn default() -> Self {
        Self {
            plugins_enabled: true,
            cloud_sync_enabled: true,
            telemetry_enabled: false,
            beta_channels_enabled: false,
        }
    }
}

/// A full tenant profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantProfile {
    pub tenant_id: String,
    pub branding: Branding,
    pub features: TenantFeatures,
    /// Additional hosts the telemetry exporter may contact.
    #[serde(default)]
    pub telemetry_endpoints: Vec<String>,
    pub updated_at: String,
}

impl TenantProfile {
    /// The built-in profile used by unlicensed installs.
    pub fn default_profile() -> Self {
        Self {
            tenant_id: "mvo-default".into(),
            branding: Branding::default(),
            features: TenantFeatures::default(),
            telemetry_endpoints: Vec::new(),
            updated_at: super::now_iso(),
        }
    }

    /// The branding actually shown to the user, accounting for licence tier.
    ///
    /// A `Team` tenant may configure branding in the profile, but it is only
    /// *applied* at `Enterprise` — otherwise the tier gate would be decorative.
    pub fn effective_branding(&self, tier: Tier) -> Branding {
        if tier.allows_white_label() {
            self.branding.clone()
        } else {
            Branding::default()
        }
    }

    /// Whether telemetry may actually be sent, given tier + tenant opt-in.
    pub fn telemetry_active(&self, tier: Tier) -> bool {
        tier.allows_telemetry() && self.features.telemetry_enabled
    }
}

/// Field-level validation failure, so the UI can point at the exact input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileError {
    pub field: &'static str,
    pub message: String,
}

impl std::fmt::Display for ProfileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.field, self.message)
    }
}

impl std::error::Error for ProfileError {}

fn err(field: &'static str, message: impl Into<String>) -> ProfileError {
    ProfileError { field, message: message.into() }
}

/// Validate a profile, returning every problem found.
///
/// All errors are collected rather than short-circuiting so a settings form can
/// highlight every invalid field at once.
pub fn validate_profile(profile: &TenantProfile) -> Vec<ProfileError> {
    let mut errors = Vec::new();
    let b = &profile.branding;

    if profile.tenant_id.trim().is_empty() {
        errors.push(err("tenantId", "Tenant id must not be empty"));
    } else if !profile
        .tenant_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        errors.push(err(
            "tenantId",
            "Tenant id may only contain letters, digits, '-' and '_'",
        ));
    }

    if b.product_name.trim().is_empty() {
        errors.push(err("productName", "Product name must not be empty"));
    } else if b.product_name.chars().count() > 40 {
        errors.push(err("productName", "Product name must be 40 characters or fewer"));
    }

    if b.short_name.trim().is_empty() {
        errors.push(err("shortName", "Short name must not be empty"));
    } else if b.short_name.chars().count() > 12 {
        errors.push(err("shortName", "Short name must be 12 characters or fewer"));
    }

    for (field, value) in [
        ("primaryColor", &b.primary_color),
        ("accentColor", &b.accent_color),
    ] {
        if !is_hex_color(value) {
            errors.push(err(field, "Colour must be in #rrggbb format"));
        }
    }

    for (field, value) in [("logoUrl", &b.logo_url), ("supportUrl", &b.support_url)] {
        if !value.trim().is_empty() && !is_trusted_url(value) {
            errors.push(err(field, "URL must be an absolute https:// address"));
        }
    }

    if profile.telemetry_endpoints.len() > 10 {
        errors.push(err("telemetryEndpoints", "At most 10 endpoints are allowed"));
    }
    for (i, endpoint) in profile.telemetry_endpoints.iter().enumerate() {
        if !is_trusted_url(endpoint) {
            errors.push(ProfileError {
                field: "telemetryEndpoints",
                message: format!("Endpoint {} must be an absolute https:// address", i + 1),
            });
        }
    }

    errors
}

/// `#rrggbb`, case-insensitive, exactly six hex digits.
pub fn is_hex_color(value: &str) -> bool {
    let Some(rest) = value.strip_prefix('#') else {
        return false;
    };
    rest.len() == 6 && rest.chars().all(|c| c.is_ascii_hexdigit())
}

/// Only absolute HTTPS URLs are accepted. Plain `http://`, `file://`, `javascript:`
/// and relative paths are all refused — these values end up in `href`/`src`.
pub fn is_trusted_url(value: &str) -> bool {
    let trimmed = value.trim();
    if !trimmed.starts_with("https://") {
        return false;
    }
    // Reject anything that tries to terminate the authority early.
    let rest = &trimmed["https://".len()..];
    if rest.is_empty() || rest.starts_with('/') {
        return false;
    }
    !rest.chars().any(|c| c.is_whitespace() || c == '\\')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> TenantProfile {
        TenantProfile {
            tenant_id: "acme".into(),
            branding: Branding {
                product_name: "Acme Hub".into(),
                short_name: "ACME".into(),
                primary_color: "#0a84ff".into(),
                accent_color: "#ff375f".into(),
                logo_url: "https://acme.example/logo.png".into(),
                support_url: "https://acme.example/support".into(),
            },
            features: TenantFeatures::default(),
            telemetry_endpoints: vec!["https://telemetry.acme.example".into()],
            updated_at: "2026-11-06T00:00:00Z".into(),
        }
    }

    #[test]
    fn default_profile_is_valid() {
        assert!(validate_profile(&TenantProfile::default_profile()).is_empty());
    }

    #[test]
    fn a_well_formed_profile_validates() {
        assert!(validate_profile(&valid()).is_empty());
    }

    #[test]
    fn empty_tenant_id_is_rejected() {
        let mut p = valid();
        p.tenant_id = "   ".into();
        let errors = validate_profile(&p);
        assert!(errors.iter().any(|e| e.field == "tenantId"));
    }

    #[test]
    fn tenant_id_must_be_filesystem_and_url_safe() {
        for bad in ["acme corp", "acme/../x", "acme.inc", "a b"] {
            let mut p = valid();
            p.tenant_id = bad.into();
            assert!(
                validate_profile(&p).iter().any(|e| e.field == "tenantId"),
                "'{}' should be rejected",
                bad
            );
        }
    }

    #[test]
    fn tenant_id_allows_hyphens_and_underscores() {
        let mut p = valid();
        p.tenant_id = "acme_corp-2026".into();
        assert!(validate_profile(&p).is_empty());
    }

    #[test]
    fn empty_or_overlong_names_are_rejected() {
        let mut p = valid();
        p.branding.product_name = "".into();
        assert!(validate_profile(&p).iter().any(|e| e.field == "productName"));

        let mut p = valid();
        p.branding.product_name = "x".repeat(41);
        assert!(validate_profile(&p).iter().any(|e| e.field == "productName"));

        let mut p = valid();
        p.branding.short_name = "y".repeat(13);
        assert!(validate_profile(&p).iter().any(|e| e.field == "shortName"));
    }

    #[test]
    fn names_at_the_limit_are_accepted() {
        let mut p = valid();
        p.branding.product_name = "x".repeat(40);
        p.branding.short_name = "y".repeat(12);
        assert!(validate_profile(&p).is_empty());
    }

    #[test]
    fn colours_must_be_six_hex_digits() {
        assert!(is_hex_color("#e11d48"));
        assert!(is_hex_color("#E11D48"));

        for bad in [
            "e11d48",       // no hash
            "#e11d4",       // too short
            "#e11d488",     // too long
            "#gggggg",      // not hex
            "red",          // named colour
            "#e11d48; x",   // injection attempt
            "rgb(1,2,3)",   // function syntax
            "",             // empty
        ] {
            assert!(!is_hex_color(bad), "'{}' should be rejected", bad);
        }
    }

    #[test]
    fn css_injection_through_colour_is_rejected() {
        let mut p = valid();
        p.branding.primary_color = "#fff; background:url(evil)".into();
        let errors = validate_profile(&p);
        assert!(errors.iter().any(|e| e.field == "primaryColor"));
    }

    #[test]
    fn only_https_urls_are_trusted() {
        assert!(is_trusted_url("https://example.com/a.png"));
        for bad in [
            "http://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html;base64,AAA",
            "//example.com",
            "/relative/path",
            "example.com",
            "https://",
            "https:///evil",
            "https://exa mple.com",
            "https://example.com\\@evil.com",
        ] {
            assert!(!is_trusted_url(bad), "'{}' should be rejected", bad);
        }
    }

    #[test]
    fn empty_urls_are_allowed() {
        let mut p = valid();
        p.branding.logo_url = String::new();
        p.branding.support_url = String::new();
        assert!(validate_profile(&p).is_empty());
    }

    #[test]
    fn insecure_urls_are_rejected_per_field() {
        let mut p = valid();
        p.branding.logo_url = "http://acme.example/logo.png".into();
        let errors = validate_profile(&p);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "logoUrl");
    }

    #[test]
    fn telemetry_endpoints_are_limited_and_validated() {
        let mut p = valid();
        p.telemetry_endpoints = (0..11).map(|i| format!("https://t{}.example", i)).collect();
        assert!(validate_profile(&p).iter().any(|e| e.field == "telemetryEndpoints"));

        let mut p = valid();
        p.telemetry_endpoints = vec!["http://insecure.example".into()];
        assert!(validate_profile(&p).iter().any(|e| e.field == "telemetryEndpoints"));
    }

    #[test]
    fn errors_are_collected_not_short_circuited() {
        let mut p = valid();
        p.tenant_id = "".into();
        p.branding.product_name = "".into();
        p.branding.primary_color = "nope".into();
        // Three independent problems should all be reported.
        assert!(validate_profile(&p).len() >= 3);
    }

    #[test]
    fn branding_is_only_applied_at_enterprise_tier() {
        let p = valid();
        assert_eq!(p.effective_branding(Tier::Community), Branding::default());
        assert_eq!(p.effective_branding(Tier::Team), Branding::default());
        assert_eq!(p.effective_branding(Tier::Enterprise).product_name, "Acme Hub");
    }

    #[test]
    fn telemetry_requires_both_tier_and_opt_in() {
        let mut p = valid();
        p.features.telemetry_enabled = true;
        assert!(!p.telemetry_active(Tier::Community), "community lacks telemetry");
        assert!(p.telemetry_active(Tier::Team));
        assert!(p.telemetry_active(Tier::Enterprise));

        p.features.telemetry_enabled = false;
        assert!(!p.telemetry_active(Tier::Enterprise), "opt-out must win");
    }

    #[test]
    fn default_features_are_conservative() {
        let f = TenantFeatures::default();
        assert!(!f.telemetry_enabled, "telemetry must be opt-in");
        assert!(!f.beta_channels_enabled);
    }
}
