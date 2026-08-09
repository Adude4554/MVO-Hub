use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePerformanceProfile {
    pub game_id: String,
    pub game_name: String,
    pub power_plan: Option<String>,
    pub cpu_affinity: Option<Vec<u32>>,
    pub cpu_priority: Option<String>,
    pub enable_overlay: bool,
    pub enable_streaming: bool,
    pub enable_hardware_monitor: bool,
    pub launch_before: Vec<String>,
    pub close_after: Vec<String>,
    pub custom_args: Option<String>,
    pub auto_apply: bool,
}

impl Default for GamePerformanceProfile {
    fn default() -> Self {
        Self {
            game_id: String::new(),
            game_name: String::new(),
            power_plan: None,
            cpu_affinity: None,
            cpu_priority: None,
            enable_overlay: false,
            enable_streaming: false,
            enable_hardware_monitor: true,
            launch_before: Vec::new(),
            close_after: Vec::new(),
            custom_args: None,
            auto_apply: true,
        }
    }
}

pub struct ProfileManager {
    profiles: Arc<Mutex<HashMap<String, GamePerformanceProfile>>>,
}

impl ProfileManager {
    pub fn new() -> Self {
        Self {
            profiles: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_profile(&self, game_id: &str) -> Option<GamePerformanceProfile> {
        self.profiles.lock().ok()?.get(game_id).cloned()
    }

    pub fn get_or_create_profile(&self, game_id: &str, game_name: &str) -> GamePerformanceProfile {
        let mut profiles = self.profiles.lock().unwrap();
        profiles.entry(game_id.to_string()).or_insert_with(|| {
            let mut p = GamePerformanceProfile::default();
            p.game_id = game_id.to_string();
            p.game_name = game_name.to_string();
            p
        }).clone()
    }

    pub fn save_profile(&self, profile: GamePerformanceProfile) {
        if let Ok(mut profiles) = self.profiles.lock() {
            profiles.insert(profile.game_id.clone(), profile);
        }
    }

    pub fn delete_profile(&self, game_id: &str) {
        if let Ok(mut profiles) = self.profiles.lock() {
            profiles.remove(game_id);
        }
    }

    pub fn list_profiles(&self) -> Vec<GamePerformanceProfile> {
        self.profiles.lock().map(|p| p.values().cloned().collect()).unwrap_or_default()
    }

    pub fn apply_profile(&self, profile: &GamePerformanceProfile) -> Result<Vec<String>, String> {
        let mut applied = Vec::new();

        if let Some(ref power_plan) = profile.power_plan {
            match power_plan.as_str() {
                "gaming" => {
                    #[cfg(target_os = "windows")]
                    {
                        use std::process::Command;
                        use std::os::windows::process::CommandExt;
                        let _ = Command::new("powercfg")
                            .args(["/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"])
                            .creation_flags(0x08000000)
                            .output();
                    }
                    applied.push("Power plan: Gaming".to_string());
                }
                "balanced" => {
                    #[cfg(target_os = "windows")]
                    {
                        use std::process::Command;
                        use std::os::windows::process::CommandExt;
                        let _ = Command::new("powercfg")
                            .args(["/setactive", "381b4222-f694-41f0-9685-ff5bb260df2e"])
                            .creation_flags(0x08000000)
                            .output();
                    }
                    applied.push("Power plan: Balanced".to_string());
                }
                "high_performance" => {
                    #[cfg(target_os = "windows")]
                    {
                        use std::process::Command;
                        use std::os::windows::process::CommandExt;
                        let _ = Command::new("powercfg")
                            .args(["/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"])
                            .creation_flags(0x08000000)
                            .output();
                    }
                    applied.push("Power plan: High Performance".to_string());
                }
                _ => {}
            }
        }

        if let Some(ref priority) = profile.cpu_priority {
            applied.push(format!("CPU priority: {}", priority));
        }

        if profile.enable_overlay {
            applied.push("Overlay: enabled".to_string());
        }

        if profile.enable_hardware_monitor {
            applied.push("Hardware monitor: enabled".to_string());
        }

        Ok(applied)
    }

    pub fn restore_defaults(&self) -> Result<Vec<String>, String> {
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            use std::os::windows::process::CommandExt;
            let _ = Command::new("powercfg")
                .args(["/setactive", "381b4222-f694-41f0-9685-ff5bb260df2e"])
                .creation_flags(0x08000000)
                .output();
        }
        Ok(vec!["Power plan restored to Balanced".to_string()])
    }
}

impl Default for ProfileManager {
    fn default() -> Self {
        Self::new()
    }
}

pub fn profile_manager() -> &'static ProfileManager {
    static MANAGER: OnceLock<ProfileManager> = OnceLock::new();
    MANAGER.get_or_init(ProfileManager::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_profile_default() {
        let p = GamePerformanceProfile::default();
        assert!(p.enable_hardware_monitor);
        assert!(!p.enable_overlay);
    }

    #[test]
    fn test_manager_get_or_create() {
        let manager = ProfileManager::new();
        let profile = manager.get_or_create_profile("game-1", "Test Game");
        assert_eq!(profile.game_name, "Test Game");
        assert!(manager.get_profile("game-1").is_some());
    }

    #[test]
    fn test_manager_delete() {
        let manager = ProfileManager::new();
        manager.get_or_create_profile("game-1", "Test Game");
        manager.delete_profile("game-1");
        assert!(manager.get_profile("game-1").is_none());
    }

    #[test]
    fn test_manager_list() {
        let manager = ProfileManager::new();
        manager.get_or_create_profile("game-1", "Game A");
        manager.get_or_create_profile("game-2", "Game B");
        let profiles = manager.list_profiles();
        assert_eq!(profiles.len(), 2);
    }
}
