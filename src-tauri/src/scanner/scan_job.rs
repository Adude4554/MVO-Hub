use crate::scanner::dedup;
use crate::scanner::filesystem::FilesystemScanner;
use crate::scanner::ignore::IgnoreList;
use crate::scanner::ScannedGame;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: String,
    pub current_path: String,
    pub directories_scanned: u32,
    pub candidates_found: u32,
    pub games_found: u32,
    pub errors: u32,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub games: Vec<ScannedGame>,
    pub duplicates: Vec<dedup::DuplicateGroup>,
    pub total_directories_scanned: u32,
    pub total_candidates: u32,
    pub total_errors: u32,
    pub duration_ms: u64,
    pub scan_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanJobConfig {
    pub scan_type: ScanType,
    pub paths: Vec<String>,
    pub incremental: bool,
    pub cancel_token: Arc<Mutex<bool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ScanType {
    Quick,
    Full,
    Custom,
    RescanPath,
}

impl ScanType {
    pub fn label(&self) -> &str {
        match self {
            Self::Quick => "Quick Scan",
            Self::Full => "Full Scan",
            Self::Custom => "Custom Scan",
            Self::RescanPath => "Rescan",
        }
    }
}

pub struct ScanJob {
    config: ScanJobConfig,
    progress: Arc<Mutex<ScanProgress>>,
    ignore_list: Arc<IgnoreList>,
}

impl ScanJob {
    pub fn new(config: ScanJobConfig, ignore_list: Arc<IgnoreList>) -> Self {
        Self {
            config,
            progress: Arc::new(Mutex::new(ScanProgress {
                phase: "Initializing".to_string(),
                current_path: String::new(),
                directories_scanned: 0,
                candidates_found: 0,
                games_found: 0,
                errors: 0,
                elapsed_ms: 0,
            })),
            ignore_list,
        }
    }

    pub fn cancel(&self) {
        *self.config.cancel_token.lock().unwrap() = true;
    }

    pub fn is_cancelled(&self) -> bool {
        *self.config.cancel_token.lock().unwrap()
    }

    pub fn get_progress(&self) -> ScanProgress {
        self.progress.lock().unwrap().clone()
    }

    pub fn run(&self, _app_data_dir: Option<PathBuf>) -> ScanResult {
        let start = Instant::now();
        let mut all_games = Vec::new();
        let mut total_dirs = 0u32;
        let mut total_candidates = 0u32;
        let total_errors = 0u32;

        self.update_progress("Discovering scan locations", "", 0, 0, 0, 0);

        let scan_roots = self.determine_scan_roots();

        for root in &scan_roots {
            if self.is_cancelled() { break; }

            self.update_progress(
                &format!("Scanning {}", root.display()),
                &root.to_string_lossy(),
                total_dirs, total_candidates, all_games.len() as u32, total_errors,
            );

            let fs_scanner = FilesystemScanner::new(Some(Arc::new({
                move |_msg: &str| {
                    // progress updates are handled per-directory
                }
            })));

            let games = fs_scanner.scan_roots(&[root.clone()]);
            total_dirs += 1;
            total_candidates += games.len() as u32;
            all_games.extend(games);
        }

        self.update_progress("Deduplicating results", "", total_dirs, total_candidates, all_games.len() as u32, total_errors);

        let dedup_result = dedup::deduplicate_games(all_games);
        let final_games = dedup_result.games;
        let duplicates = dedup_result.duplicates;

        self.update_progress(
            "Complete",
            "",
            total_dirs,
            total_candidates,
            final_games.len() as u32,
            total_errors,
        );

        ScanResult {
            games: final_games,
            duplicates,
            total_directories_scanned: total_dirs,
            total_candidates: total_candidates,
            total_errors,
            duration_ms: start.elapsed().as_millis() as u64,
            scan_type: self.config.scan_type.label().to_string(),
        }
    }

    fn determine_scan_roots(&self) -> Vec<PathBuf> {
        match self.config.scan_type {
            ScanType::Quick => {
                let mut roots = Vec::new();
                let home = dirs::home_dir().unwrap_or_default();
                roots.push(home.join("Desktop"));
                roots.push(home.join("Downloads"));
                roots.push(home.join("Documents"));

                for letter in ['C', 'D', 'E'] {
                    let drive = PathBuf::from(format!("{}:\\Games", letter));
                    if drive.exists() { roots.push(drive); }
                    let drive2 = PathBuf::from(format!("{}:\\My Games", letter));
                    if drive2.exists() { roots.push(drive2); }
                }

                roots.retain(|r| r.exists());
                roots
            }
            ScanType::Full => {
                let mut roots = Vec::new();
                let home = dirs::home_dir().unwrap_or_default();
                roots.push(home.join("Desktop"));
                roots.push(home.join("Downloads"));
                roots.push(home.join("Documents"));

                for letter in 'A'..='Z' {
                    let drive = PathBuf::from(format!("{}:\\", letter));
                    if drive.exists() {
                        roots.push(drive);
                    }
                }
                roots
            }
            ScanType::Custom | ScanType::RescanPath => {
                self.config.paths.iter().map(PathBuf::from).filter(|p| p.exists()).collect()
            }
        }
    }

    fn update_progress(&self, phase: &str, path: &str, dirs: u32, candidates: u32, games: u32, errors: u32) {
        let mut p = self.progress.lock().unwrap();
        p.phase = phase.to_string();
        p.current_path = path.to_string();
        p.directories_scanned = dirs;
        p.candidates_found = candidates;
        p.games_found = games;
        p.errors = errors;
    }
}

pub fn run_scan_in_background(
    config: ScanJobConfig,
    ignore_list: Arc<IgnoreList>,
    app_data_dir: Option<PathBuf>,
) -> Arc<Mutex<Option<ScanResult>>> {
    let result = Arc::new(Mutex::new(None));
    let result_clone = result.clone();

    thread::spawn(move || {
        let job = ScanJob::new(config, ignore_list);
        let scan_result = job.run(app_data_dir);
        *result_clone.lock().unwrap() = Some(scan_result);
    });

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_type_labels() {
        assert_eq!(ScanType::Quick.label(), "Quick Scan");
        assert_eq!(ScanType::Full.label(), "Full Scan");
        assert_eq!(ScanType::Custom.label(), "Custom Scan");
    }

    #[test]
    fn test_cancel_token() {
        let token = Arc::new(Mutex::new(false));
        let config = ScanJobConfig {
            scan_type: ScanType::Quick,
            paths: vec![],
            incremental: false,
            cancel_token: token.clone(),
        };
        let job = ScanJob::new(config, Arc::new(IgnoreList::new()));
        assert!(!job.is_cancelled());
        job.cancel();
        assert!(job.is_cancelled());
    }

    #[test]
    fn test_progress_initial() {
        let job = ScanJob::new(
            ScanJobConfig {
                scan_type: ScanType::Quick,
                paths: vec![],
                incremental: false,
                cancel_token: Arc::new(Mutex::new(false)),
            },
            Arc::new(IgnoreList::new()),
        );
        let progress = job.get_progress();
        assert_eq!(progress.phase, "Initializing");
        assert_eq!(progress.games_found, 0);
    }

    #[test]
    fn test_scan_empty_paths_list() {
        let config = ScanJobConfig {
            scan_type: ScanType::Custom,
            paths: vec![],
            incremental: false,
            cancel_token: Arc::new(Mutex::new(false)),
        };
        let job = ScanJob::new(config, Arc::new(IgnoreList::new()));
        let result = job.run(None);
        assert_eq!(result.games.len(), 0);
        assert_eq!(result.total_errors, 0);
        assert_eq!(result.scan_type, "Custom Scan");
    }

    #[test]
    fn test_scan_nonexistent_path() {
        let config = ScanJobConfig {
            scan_type: ScanType::Custom,
            paths: vec!["C:\\ThisPathDoesNotExist_12345".to_string()],
            incremental: false,
            cancel_token: Arc::new(Mutex::new(false)),
        };
        let job = ScanJob::new(config, Arc::new(IgnoreList::new()));
        let result = job.run(None);
        assert_eq!(result.games.len(), 0);
    }

    #[test]
    fn test_cancel_during_scan() {
        let token = Arc::new(Mutex::new(false));
        let config = ScanJobConfig {
            scan_type: ScanType::Quick,
            paths: vec![],
            incremental: false,
            cancel_token: token.clone(),
        };
        let job = ScanJob::new(config, Arc::new(IgnoreList::new()));
        assert!(!job.is_cancelled());
        job.cancel();
        assert!(job.is_cancelled());
        let result = job.run(None);
        assert_eq!(result.games.len(), 0);
    }

    #[test]
    fn test_rescan_path_type() {
        let config = ScanJobConfig {
            scan_type: ScanType::RescanPath,
            paths: vec!["C:\\Nonexistent".to_string()],
            incremental: false,
            cancel_token: Arc::new(Mutex::new(false)),
        };
        let job = ScanJob::new(config, Arc::new(IgnoreList::new()));
        assert_eq!(job.config.scan_type.label(), "Rescan");
    }
}
