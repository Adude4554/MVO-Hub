use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgnoreRule {
    pub id: String,
    pub rule_type: IgnoreRuleType,
    pub pattern: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum IgnoreRuleType {
    Executable,
    Directory,
    Path,
    ScanRoot,
}

pub struct IgnoreList {
    rules: Arc<Mutex<Vec<IgnoreRule>>>,
}

impl IgnoreList {
    pub fn new() -> Self {
        Self { rules: Arc::new(Mutex::new(Vec::new())) }
    }

    pub fn load_from_db(db_path: &Path) -> Self {
        let rules = load_ignore_rules_from_db(db_path);
        Self { rules: Arc::new(Mutex::new(rules)) }
    }

    pub fn add_rule(&self, rule_type: IgnoreRuleType, pattern: &str) {
        let rule = IgnoreRule {
            id: format!("ignore:{}:{}", serde_json::to_string(&rule_type).unwrap_or_default(), pattern),
            rule_type,
            pattern: pattern.to_string(),
            created_at: chrono_now(),
        };
        self.rules.lock().unwrap().push(rule);
    }

    pub fn remove_rule(&self, id: &str) {
        self.rules.lock().unwrap().retain(|r| r.id != id);
    }

    pub fn is_ignored(&self, path: &Path) -> bool {
        let rules = self.rules.lock().unwrap();
        let path_str = path.to_string_lossy().to_lowercase();
        let path_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();

        for rule in rules.iter() {
            match rule.rule_type {
                IgnoreRuleType::Executable => {
                    let pattern_lower = rule.pattern.to_lowercase();
                    if path_name == pattern_lower || path_name.starts_with(&pattern_lower) {
                        return true;
                    }
                }
                IgnoreRuleType::Directory | IgnoreRuleType::Path => {
                    let pattern_lower = rule.pattern.to_lowercase();
                    if path_str.contains(&pattern_lower) {
                        return true;
                    }
                }
                IgnoreRuleType::ScanRoot => {
                    let pattern_lower = rule.pattern.to_lowercase();
                    if path_str.starts_with(&pattern_lower) {
                        return true;
                    }
                }
            }
        }
        false
    }

    pub fn is_exe_ignored(&self, exe_name: &str) -> bool {
        let rules = self.rules.lock().unwrap();
        let lower = exe_name.to_lowercase();
        rules.iter().any(|r| r.rule_type == IgnoreRuleType::Executable && lower == r.pattern.to_lowercase())
    }

    pub fn is_dir_ignored(&self, dir_path: &str) -> bool {
        let rules = self.rules.lock().unwrap();
        let lower = dir_path.to_lowercase();
        rules.iter().any(|r| {
            (r.rule_type == IgnoreRuleType::Directory || r.rule_type == IgnoreRuleType::Path)
                && lower.contains(&r.pattern.to_lowercase())
        })
    }

    pub fn is_scan_root_ignored(&self, root: &str) -> bool {
        let rules = self.rules.lock().unwrap();
        let lower = root.to_lowercase();
        rules.iter().any(|r| r.rule_type == IgnoreRuleType::ScanRoot && lower.starts_with(&r.pattern.to_lowercase()))
    }

    pub fn get_rules(&self) -> Vec<IgnoreRule> {
        self.rules.lock().unwrap().clone()
    }

    pub fn clear(&self) {
        self.rules.lock().unwrap().clear();
    }
}

impl Default for IgnoreList {
    fn default() -> Self {
        Self::new()
    }
}

fn load_ignore_rules_from_db(_db_path: &Path) -> Vec<IgnoreRule> {
    Vec::new()
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}", secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ignore_list_empty() {
        let list = IgnoreList::new();
        assert!(list.get_rules().is_empty());
    }

    #[test]
    fn test_add_and_remove_rule() {
        let list = IgnoreList::new();
        list.add_rule(IgnoreRuleType::Executable, "test.exe");
        assert_eq!(list.get_rules().len(), 1);
        let id = list.get_rules()[0].id.clone();
        list.remove_rule(&id);
        assert!(list.get_rules().is_empty());
    }

    #[test]
    fn test_is_exe_ignored() {
        let list = IgnoreList::new();
        list.add_rule(IgnoreRuleType::Executable, "chrome.exe");
        assert!(list.is_exe_ignored("chrome.exe"));
        assert!(!list.is_exe_ignored("game.exe"));
    }

    #[test]
    fn test_is_dir_ignored() {
        let list = IgnoreList::new();
        list.add_rule(IgnoreRuleType::Directory, "C:\\Windows");
        assert!(list.is_dir_ignored("C:\\Windows\\System32"));
        assert!(!list.is_dir_ignored("D:\\Games"));
    }

    #[test]
    fn test_clear() {
        let list = IgnoreList::new();
        list.add_rule(IgnoreRuleType::Executable, "test.exe");
        list.clear();
        assert!(list.get_rules().is_empty());
    }

    #[test]
    fn test_empty_ignore_list_no_match() {
        let list = IgnoreList::new();
        assert!(!list.is_exe_ignored("anything.exe"));
        assert!(!list.is_dir_ignored("C:\\AnyPath"));
        assert!(!list.is_scan_root_ignored("C:\\Games"));
        assert!(!list.is_ignored(std::path::Path::new("C:\\Games\\game.exe")));
    }

    #[test]
    fn test_multiple_rules_matching_same_path() {
        let list = IgnoreList::new();
        list.add_rule(IgnoreRuleType::Directory, "C:\\Games");
        list.add_rule(IgnoreRuleType::Path, "Games\\Test");
        list.add_rule(IgnoreRuleType::ScanRoot, "C:\\");
        assert!(list.is_ignored(std::path::Path::new("C:\\Games\\Test\\game.exe")));
    }

    #[test]
    fn test_case_sensitivity_executable() {
        let list = IgnoreList::new();
        list.add_rule(IgnoreRuleType::Executable, "Chrome.exe");
        assert!(list.is_exe_ignored("chrome.exe"));
        assert!(list.is_exe_ignored("CHROME.EXE"));
        assert!(list.is_exe_ignored("Chrome.exe"));
        assert!(!list.is_exe_ignored("firefox.exe"));
    }

    #[test]
    fn test_case_sensitivity_directory() {
        let list = IgnoreList::new();
        list.add_rule(IgnoreRuleType::Directory, "C:\\WINDOWS");
        assert!(list.is_dir_ignored("c:\\windows\\System32"));
        assert!(list.is_dir_ignored("C:\\Windows\\Temp"));
    }

    #[test]
    fn test_scan_root_case_insensitive() {
        let list = IgnoreList::new();
        list.add_rule(IgnoreRuleType::ScanRoot, "C:\\GAMES");
        assert!(list.is_scan_root_ignored("c:\\games\\Steam"));
        assert!(list.is_scan_root_ignored("C:\\Games\\Epic"));
        assert!(!list.is_scan_root_ignored("D:\\Games"));
    }
}
