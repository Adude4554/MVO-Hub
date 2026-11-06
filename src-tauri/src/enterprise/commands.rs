//! Tauri IPC surface for enterprise licensing, tenant profiles and telemetry.

use tauri::{AppHandle, Manager};

use crate::{app_data_dir, cloud, gamevault::db::GameVaultDb, games, plugins};

use super::{
    expiry_warning, state, DiagnosticsBundle, EnterpriseState, LicenseStatus, Metric,
    TenantProfile, TelemetryEvent, TelemetryRecord,
};

/// The effective licence, plus a human-readable warning when it is close to
/// expiring. Bundled into one call so the UI needs a single round-trip.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseView {
    pub status: LicenseStatus,
    /// Non-empty when an administrator should be nudged.
    pub warning: Option<String>,
    /// Branding actually applied, already gated by tier.
    pub branding: super::Branding,
    pub tier: super::Tier,
}

fn view(es: &EnterpriseState) -> LicenseView {
    let status = es.status();
    let warning = expiry_warning(&status).map(|days| {
        if days <= 0 {
            "Licence expires today".to_string()
        } else {
            format!("Licence expires in {} day{}", days, if days == 1 { "" } else { "s" })
        }
    });

    LicenseView {
        tier: status.tier,
        branding: es.effective_branding(),
        warning,
        status,
    }
}

/// Current licence, tier and applied branding.
#[tauri::command]
pub fn enterprise_get_license() -> Result<LicenseView, String> {
    Ok(view(state()))
}

/// Install a signed licence token.
#[tauri::command]
pub fn enterprise_install_license(token: String) -> Result<LicenseView, String> {
    let es = state();
    es.install_license(&token)?;
    Ok(view(es))
}

/// The stored tenant profile (regardless of whether it is applied).
#[tauri::command]
pub fn enterprise_get_profile() -> Result<TenantProfile, String> {
    Ok(state().profile())
}

/// Validate and save a tenant profile.
///
/// The error is a flattened, `; `-joined string because Tauri command errors
/// must serialise; the UI re-validates locally for field-level highlighting.
#[tauri::command]
pub fn enterprise_set_profile(profile: TenantProfile) -> Result<TenantProfile, String> {
    state()
        .set_profile(profile)
        .map_err(|errors| {
            errors
                .iter()
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
                .join("; ")
        })
}

/// Branding the shell should render right now.
#[tauri::command]
pub fn enterprise_get_branding() -> Result<super::Branding, String> {
    Ok(state().effective_branding())
}

/// Queued telemetry records (snapshot, non-destructive).
#[tauri::command]
pub fn enterprise_telemetry_snapshot() -> Result<Vec<TelemetryRecord>, String> {
    Ok(state().telemetry_snapshot())
}

/// Drain queued telemetry. Restricted to tiers that may export.
#[tauri::command]
pub fn enterprise_drain_telemetry() -> Result<Vec<TelemetryRecord>, String> {
    let es = state();
    if !es.status().tier.allows_telemetry() {
        return Err("Telemetry export requires the Team or Enterprise licence tier".into());
    }
    Ok(es.drain_telemetry())
}

/// Record a diagnostic event (no free-text payload is accepted by design).
#[tauri::command]
pub fn enterprise_record_event(
    event: TelemetryEvent,
    metric: Option<Metric>,
) -> Result<bool, String> {
    Ok(state().record_telemetry(event, metric))
}

/// Build a diagnostics bundle from live local state for support tickets.
#[tauri::command]
pub fn enterprise_diagnostics(app: AppHandle) -> Result<DiagnosticsBundle, String> {
    let es = state();
    let data = app_data_dir();

    // Every probe is best-effort: diagnostics must still produce output when a
    // subsystem is broken, which is exactly when they are needed.
    let plugin_count = app
        .try_state::<plugins::PluginManager>()
        .map(|m| m.get_plugins().len())
        .unwrap_or(0);

    let running = games::commands::run_process_poll(&app)
        .map(|a| a.len())
        .unwrap_or(0);

    let (tracked_saves, achievements_unlocked, pending_uploads) = cloud::CloudDb::open(&data)
        .and_then(|db| {
            let saves = db.list_saves()?.len();
            let achievements = cloud::achievements::overall_state(&db)?.unlocked;
            let pending = db.pending_count()?;
            Ok((saves, achievements, pending))
        })
        .unwrap_or((0, 0, 0));

    // Keep the reference so `GameVaultDb` remains a known dependency for the
    // diagnostic surface even before it exposes extra counters.
    let _ = GameVaultDb::new(&data).is_ok();

    Ok(DiagnosticsBundle {
        app_version: es.build_label().to_string(),
        os: std::env::consts::OS.to_string(),
        tier: es.status().tier.as_str().to_string(),
        tenant_id: es.status().tenant_id,
        plugin_count,
        tracked_saves,
        achievements_unlocked,
        pending_uploads,
        active_sessions: running,
        generated_at: super::now_iso(),
    })
}
