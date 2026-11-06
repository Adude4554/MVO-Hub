//! Enterprise B2B / SDK foundation — v0.3.0 Step 4.
//!
//! Three cooperating pieces:
//!
//! * [`license`] — offline-verifiable Ed25519 licences gating tier features.
//! * [`tenant`] — strict, validated white-label profiles (branding + switches).
//! * [`telemetry`] — a closed-set event queue that cannot carry free text.
//!
//! The tier is the authority: a tenant profile may *request* branding, but it is
//! only applied if the licence grants it. That way a copied config file cannot
//! unlock enterprise behaviour on a community install.

pub mod commands;
pub mod license;
pub mod telemetry;
pub mod tenant;

use std::sync::{Mutex, OnceLock};

pub use license::{
    expiry_warning, sign_license, verify_license, LicenseClaims, LicenseStatus, Tier,
};
pub use telemetry::{
    DiagnosticsBundle, Metric, TelemetryEvent, TelemetryQueue, TelemetryRecord,
};
pub use tenant::{
    is_hex_color, is_trusted_url, validate_profile, Branding, ProfileError, TenantFeatures,
    TenantProfile,
};

use ed25519_dalek::VerifyingKey;

/// The vendor's public key, compiled into the binary.
///
/// Verification only ever uses this key; the private key never ships. It can be
/// overridden at runtime via [`EnterpriseState::with_verifying_key`], which the
/// tests use to sign with a throwaway key.
///
/// The default is a well-known test key so a development build is deterministic;
/// a release build must replace it with the vendor key.
const DEFAULT_VERIFYING_KEY_HEX: &str =
    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

/// Everything enterprise-related that survives for the process lifetime.
pub struct EnterpriseState {
    pub verifying_key: VerifyingKey,
    status: Mutex<LicenseStatus>,
    profile: Mutex<TenantProfile>,
    queue: TelemetryQueue,
    build_label: String,
    /// Where tenant profiles are stored. `None` means memory-only, which is the
    /// case in unit tests; production always supplies a store.
    store: Option<crate::games::GameStore>,
}

impl std::fmt::Debug for EnterpriseState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EnterpriseState")
            .field("build_label", &self.build_label)
            .finish_non_exhaustive()
    }
}

impl EnterpriseState {
    pub fn new(build_label: impl Into<String>) -> Result<Self, String> {
        let key = decode_verifying_key(DEFAULT_VERIFYING_KEY_HEX)?;
        Ok(Self::with_verifying_key(key, build_label))
    }

    /// Build with an explicit key (used by tests and by vendor tooling).
    pub fn with_verifying_key(key: VerifyingKey, build_label: impl Into<String>) -> Self {
        Self {
            verifying_key: key,
            status: Mutex::new(LicenseStatus::community("No licence installed")),
            profile: Mutex::new(TenantProfile::default_profile()),
            queue: TelemetryQueue::default(),
            build_label: build_label.into(),
            store: None,
        }
    }

    /// Attach a persistent store and load any previously saved profile.
    ///
    /// This is the production path: [`state()`] calls it at first use so OEM
    /// branding survives a restart. Loading is best-effort — an unreadable or
    /// corrupt profile falls back to the default rather than preventing the app
    /// from starting, because a branding problem must never be fatal.
    pub fn with_store(mut self, store: crate::games::GameStore) -> Self {
        match store.load_active_tenant_profile() {
            Ok(Some(json)) => match serde_json::from_str::<TenantProfile>(&json) {
                Ok(profile) => {
                    // Re-validate on load: the schema may have tightened since
                    // the row was written, and an invalid profile must not be
                    // applied as-is.
                    if validate_profile(&profile).is_empty() {
                        if let Ok(mut current) = self.profile.lock() {
                            *current = profile;
                        }
                    } else {
                        eprintln!(
                            "Stored tenant profile '{}' is no longer valid; using defaults",
                            profile.tenant_id
                        );
                    }
                }
                Err(e) => eprintln!("Stored tenant profile is corrupt ({}); using defaults", e),
            },
            Ok(None) => {}
            Err(e) => eprintln!("Could not read tenant profile: {}", e),
        }
        self.store = Some(store);
        self
    }

    /// Whether profiles are being persisted.
    pub fn is_persistent(&self) -> bool {
        self.store.is_some()
    }

    pub fn build_label(&self) -> &str {
        &self.build_label
    }

    pub fn status(&self) -> LicenseStatus {
        self.status
            .lock()
            .map(|s| s.clone())
            .unwrap_or_else(|_| LicenseStatus::community("Licence state unavailable"))
    }

    pub fn profile(&self) -> TenantProfile {
        self.profile
            .lock()
            .map(|p| p.clone())
            .unwrap_or_else(|_| TenantProfile::default_profile())
    }

    /// Replace the active licence after verifying it.
    ///
    /// A token that fails verification is *stored* as the status (so the UI can
    /// explain why) but the tier stays `Community`.
    pub fn install_license(&self, token: &str) -> Result<LicenseStatus, String> {
        let status = verify_license(token, &self.verifying_key, chrono::Utc::now());
        *self.status.lock().map_err(|_| "licence state poisoned")? = status.clone();
        Ok(status)
    }

    /// Validate and store a tenant profile.
    ///
    /// Validation runs first, so an invalid profile is never written to disk.
    /// If a store is attached, the write must succeed before the in-memory copy
    /// changes — otherwise the UI would show branding that a restart loses.
    pub fn set_profile(&self, profile: TenantProfile) -> Result<TenantProfile, Vec<ProfileError>> {
        let errors = validate_profile(&profile);
        if !errors.is_empty() {
            return Err(errors);
        }

        if let Some(store) = &self.store {
            let json = serde_json::to_string(&profile).map_err(|e| {
                vec![ProfileError {
                    field: "profile",
                    message: format!("Could not serialise profile: {}", e),
                }]
            })?;
            store
                .save_tenant_profile(&profile.tenant_id, &json)
                .map_err(|e| {
                    vec![ProfileError {
                        field: "profile",
                        message: format!("Could not save profile: {}", e),
                    }]
                })?;
        }

        if let Ok(mut current) = self.profile.lock() {
            *current = profile.clone();
        }
        Ok(profile)
    }

    /// Branding the UI should actually render, gated by the licence tier.
    pub fn effective_branding(&self) -> Branding {
        self.profile().effective_branding(self.status().tier)
    }

    /// Record a telemetry event, if the tier and tenant allow it.
    ///
    /// Returns whether the event was queued — the caller can surface that in a
    /// diagnostics view without guessing.
    pub fn record_telemetry(&self, event: TelemetryEvent, metric: Option<Metric>) -> bool {
        let tier = self.status().tier;
        if !self.profile().telemetry_active(tier) {
            return false;
        }
        self.queue.record(event, metric, &self.build_label).is_ok()
    }

    pub fn telemetry_snapshot(&self) -> Vec<TelemetryRecord> {
        self.queue.snapshot()
    }

    pub fn drain_telemetry(&self) -> Vec<TelemetryRecord> {
        self.queue.drain()
    }
}

/// Decode a 32-byte Ed25519 public key from hex.
pub fn decode_verifying_key(hex_key: &str) -> Result<VerifyingKey, String> {
    let bytes = hex::decode(hex_key).map_err(|_| "Public key is not valid hex".to_string())?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "Public key must be 32 bytes".to_string())?;
    VerifyingKey::from_bytes(&bytes).map_err(|_| "Public key is not a valid Ed25519 point".to_string())
}

/// Process-wide enterprise state.
pub fn state() -> &'static EnterpriseState {
    static STATE: OnceLock<EnterpriseState> = OnceLock::new();
    STATE.get_or_init(|| {
        let base = EnterpriseState::new(env!("CARGO_PKG_VERSION")).unwrap_or_else(|e| {
            eprintln!("Enterprise bootstrap failed ({}); using community defaults", e);
            // Fall back to a key that verifies nothing rather than crashing
            // the app: a broken key must degrade, not brick.
            let fallback = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]).verifying_key();
            EnterpriseState::with_verifying_key(fallback, env!("CARGO_PKG_VERSION"))
        });

        // Persist profiles in the same database that holds game configuration,
        // so OEM branding survives a restart.
        match crate::games::GameStore::open(&crate::app_data_dir()) {
            Ok(store) => base.with_store(store),
            Err(e) => {
                eprintln!("Tenant profiles will not persist this session: {}", e);
                base
            }
        }
    })
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;
    use rand::rngs::OsRng;

    fn state_with_key() -> (EnterpriseState, SigningKey) {
        let signing = SigningKey::generate(&mut OsRng);
        let state = EnterpriseState::with_verifying_key(signing.verifying_key(), "0.3.0-test");
        (state, signing)
    }

    fn claims(tier: Tier) -> LicenseClaims {
        LicenseClaims {
            tenant_id: "acme".into(),
            tenant_name: "Acme".into(),
            tier,
            expires_at: None,
            max_seats: Some(10),
            issued_at: None,
        }
    }

    fn branded_profile() -> TenantProfile {
        TenantProfile {
            tenant_id: "acme".into(),
            branding: Branding {
                product_name: "Acme Hub".into(),
                short_name: "ACME".into(),
                primary_color: "#0a84ff".into(),
                accent_color: "#ff375f".into(),
                logo_url: String::new(),
                support_url: String::new(),
            },
            features: TenantFeatures {
                telemetry_enabled: true,
                ..TenantFeatures::default()
            },
            telemetry_endpoints: vec![],
            updated_at: "2026-11-06T00:00:00Z".into(),
        }
    }

    #[test]
    fn default_state_is_community_and_unbranded() {
        let (state, _) = state_with_key();
        assert_eq!(state.status().tier, Tier::Community);
        assert_eq!(state.effective_branding().product_name, "MVO Hub");
    }

    #[test]
    fn installing_a_valid_licence_raises_the_tier() {
        let (state, signing) = state_with_key();
        let token = sign_license(&claims(Tier::Enterprise), &signing).unwrap();

        let status = state.install_license(&token).unwrap();
        assert!(status.valid);
        assert_eq!(state.status().tier, Tier::Enterprise);
    }

    #[test]
    fn installing_a_forged_licence_keeps_community() {
        let (state, _) = state_with_key();
        let attacker = SigningKey::generate(&mut OsRng);
        let token = sign_license(&claims(Tier::Enterprise), &attacker).unwrap();

        let status = state.install_license(&token).unwrap();
        assert!(!status.valid);
        assert_eq!(state.status().tier, Tier::Community);
    }

    #[test]
    fn branding_requires_enterprise_licence() {
        let (state, signing) = state_with_key();
        state.set_profile(branded_profile()).unwrap();

        // No licence yet: stored, but not applied.
        assert_eq!(state.effective_branding().product_name, "MVO Hub");

        state
            .install_license(&sign_license(&claims(Tier::Team), &signing).unwrap())
            .unwrap();
        assert_eq!(state.effective_branding().product_name, "MVO Hub", "team cannot rebrand");

        state
            .install_license(&sign_license(&claims(Tier::Enterprise), &signing).unwrap())
            .unwrap();
        assert_eq!(state.effective_branding().product_name, "Acme Hub");
    }

    #[test]
    fn invalid_profiles_are_rejected_with_field_errors() {
        let (state, _) = state_with_key();
        let mut bad = branded_profile();
        bad.tenant_id = "bad id!".into();

        let errors = state.set_profile(bad).unwrap_err();
        assert!(errors.iter().any(|e| e.field == "tenantId"));
        // The stored profile is unchanged.
        assert_eq!(state.profile().tenant_id, "mvo-default");
    }

    #[test]
    fn valid_profiles_are_stored() {
        let (state, _) = state_with_key();
        let stored = state.set_profile(branded_profile()).unwrap();
        assert_eq!(stored.tenant_id, "acme");
        assert_eq!(state.profile().branding.product_name, "Acme Hub");
    }

    #[test]
    fn telemetry_requires_licence_and_opt_in() {
        let (state, signing) = state_with_key();
        state.set_profile(branded_profile()).unwrap();

        // Opted in, but community tier.
        assert!(!state.record_telemetry(TelemetryEvent::AppLaunched, None));
        assert!(state.telemetry_snapshot().is_empty());

        state
            .install_license(&sign_license(&claims(Tier::Team), &signing).unwrap())
            .unwrap();
        assert!(state.record_telemetry(TelemetryEvent::AppLaunched, None));
        assert_eq!(state.telemetry_snapshot().len(), 1);
    }

    #[test]
    fn telemetry_opt_out_is_respected_at_enterprise_tier() {
        let (state, signing) = state_with_key();
        let mut profile = branded_profile();
        profile.features.telemetry_enabled = false;
        state.set_profile(profile).unwrap();
        state
            .install_license(&sign_license(&claims(Tier::Enterprise), &signing).unwrap())
            .unwrap();

        assert!(!state.record_telemetry(TelemetryEvent::AppLaunched, None));
        assert!(state.telemetry_snapshot().is_empty());
    }

    #[test]
    fn draining_telemetry_empties_the_queue() {
        let (state, signing) = state_with_key();
        state.set_profile(branded_profile()).unwrap();
        state
            .install_license(&sign_license(&claims(Tier::Enterprise), &signing).unwrap())
            .unwrap();
        state.record_telemetry(TelemetryEvent::SyncCompleted, Some(Metric::Percent(100)));

        let drained = state.drain_telemetry();
        assert_eq!(drained.len(), 1);
        assert!(state.telemetry_snapshot().is_empty());
    }

    #[test]
    fn decoding_a_bad_public_key_fails_cleanly() {
        assert!(decode_verifying_key("nothex").is_err());
        assert!(decode_verifying_key("1234").is_err(), "short key must fail");
    }

    #[test]
    fn the_compiled_default_key_is_valid() {
        // Guards against a typo making every real licence unverifiable.
        assert!(decode_verifying_key(DEFAULT_VERIFYING_KEY_HEX).is_ok());
    }

    #[test]
    fn process_singleton_is_stable() {
        let a = state() as *const EnterpriseState;
        let b = state() as *const EnterpriseState;
        assert_eq!(a, b);
    }

    // -- persistence ---------------------------------------------------------

    use crate::games::GameStore;

    fn persistent_state() -> (EnterpriseState, GameStore, SigningKey) {
        let signing = SigningKey::generate(&mut OsRng);
        let store = GameStore::in_memory().unwrap();
        let state = EnterpriseState::with_verifying_key(signing.verifying_key(), "0.3.0-test")
            .with_store(store.clone());
        (state, store, signing)
    }

    /// Simulate a restart: build fresh state from the same store.
    fn restart(store: &GameStore, key: &SigningKey) -> EnterpriseState {
        EnterpriseState::with_verifying_key(key.verifying_key(), "0.3.0-test")
            .with_store(store.clone())
    }

    #[test]
    fn a_saved_profile_survives_a_restart() {
        let (state, store, key) = persistent_state();
        state.set_profile(branded_profile()).unwrap();

        let rebooted = restart(&store, &key);
        assert_eq!(rebooted.profile().tenant_id, "acme");
        assert_eq!(rebooted.profile().branding.product_name, "Acme Hub");
        assert_eq!(rebooted.profile().branding.primary_color, "#0a84ff");
    }

    #[test]
    fn restart_without_a_stored_profile_uses_defaults() {
        let (_state, store, key) = persistent_state();
        let rebooted = restart(&store, &key);
        assert_eq!(rebooted.profile().tenant_id, "mvo-default");
        assert!(rebooted.is_persistent());
    }

    #[test]
    fn branding_is_applied_after_restart_with_an_enterprise_licence() {
        let (state, store, key) = persistent_state();
        state.set_profile(branded_profile()).unwrap();
        let token = sign_license(&claims(Tier::Enterprise), &key).unwrap();

        let rebooted = restart(&store, &key);
        // Licences are process-scoped today, so re-install on the new instance.
        rebooted.install_license(&token).unwrap();
        assert_eq!(rebooted.effective_branding().product_name, "Acme Hub");
    }

    #[test]
    fn invalid_profiles_are_never_written_to_disk() {
        let (state, store, _key) = persistent_state();
        let mut bad = branded_profile();
        bad.tenant_id = "bad id!".into();

        assert!(state.set_profile(bad).is_err());
        assert_eq!(store.tenant_profile_count().unwrap(), 0, "rejected profile must not persist");
        assert_eq!(state.profile().tenant_id, "mvo-default");
    }

    #[test]
    fn saving_again_replaces_rather_than_appends() {
        let (state, store, key) = persistent_state();
        state.set_profile(branded_profile()).unwrap();

        let mut renamed = branded_profile();
        renamed.branding.product_name = "Acme Hub Pro".into();
        state.set_profile(renamed).unwrap();

        assert_eq!(store.tenant_profile_count().unwrap(), 1, "one active profile per tenant");
        let rebooted = restart(&store, &key);
        assert_eq!(rebooted.profile().branding.product_name, "Acme Hub Pro");
    }

    #[test]
    fn switching_tenants_marks_only_one_active() {
        let (state, store, key) = persistent_state();
        state.set_profile(branded_profile()).unwrap();

        let mut other = branded_profile();
        other.tenant_id = "globex".into();
        other.branding.product_name = "Globex Hub".into();
        state.set_profile(other).unwrap();

        // Both rows exist, but only the newest is active.
        assert_eq!(store.tenant_profile_count().unwrap(), 2);
        let rebooted = restart(&store, &key);
        assert_eq!(rebooted.profile().tenant_id, "globex");
    }

    #[test]
    fn a_corrupt_stored_profile_falls_back_to_defaults() {
        let store = GameStore::in_memory().unwrap();
        store.save_tenant_profile("broken", "{not valid json").unwrap();

        let signing = SigningKey::generate(&mut OsRng);
        let state = EnterpriseState::with_verifying_key(signing.verifying_key(), "test")
            .with_store(store);

        // Must degrade, not panic or refuse to start.
        assert_eq!(state.profile().tenant_id, "mvo-default");
    }

    #[test]
    fn profile_survives_a_real_database_reopen() {
        // The in-memory tests prove the logic; this proves the bytes actually
        // hit disk, which is the whole point of the change.
        let dir = std::env::temp_dir().join(format!(
            "mvo_enterprise_persist_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);

        let signing = SigningKey::generate(&mut OsRng);
        {
            let store = GameStore::open(&dir).unwrap();
            let state = EnterpriseState::with_verifying_key(signing.verifying_key(), "test")
                .with_store(store);
            state.set_profile(branded_profile()).unwrap();
        }
        {
            // Fresh connection, as on the next launch.
            let store = GameStore::open(&dir).unwrap();
            let rebooted =
                EnterpriseState::with_verifying_key(signing.verifying_key(), "test").with_store(store);
            assert_eq!(rebooted.profile().tenant_id, "acme");
            assert_eq!(rebooted.profile().branding.short_name, "ACME");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn memory_only_state_reports_not_persistent() {
        let (state, _) = state_with_key();
        assert!(!state.is_persistent());
        // Still functional for tests and vendor tooling.
        state.set_profile(branded_profile()).unwrap();
        assert_eq!(state.profile().tenant_id, "acme");
    }
}
