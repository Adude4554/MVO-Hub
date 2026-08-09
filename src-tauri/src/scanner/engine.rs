use super::*;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::thread;

/// Progress callback for scan updates
pub type ScanProgressCallback = Arc<dyn Fn(&str) + Send + Sync>;

/// Enriched game with local artwork paths
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichedGameResult {
    pub game: ScannedGame,
    pub cover_local: Option<String>,
    pub icon_local: Option<String>,
}

/// Run all scanners and return deduplicated results
pub fn run_full_scan(progress: Option<ScanProgressCallback>) -> Vec<ScannedGame> {
    let scanners: Vec<Box<dyn GameScanner>> = vec![
        Box::new(steam::SteamScanner::new()),
        Box::new(epic::EpicScanner::new()),
        Box::new(gog::GogScanner::new()),
        Box::new(ea::EaScanner::new()),
        Box::new(ubisoft::UbisoftScanner::new()),
        Box::new(battlenet::BattleNetScanner::new()),
        Box::new(riot::RiotScanner::new()),
        Box::new(xbox::XboxScanner::new()),
        Box::new(amazon::AmazonScanner::new()),
        Box::new(itch::ItchScanner::new()),
        Box::new(rockstar::RockstarScanner::new()),
        Box::new(minecraft::MinecraftScanner::new()),
        Box::new(lutris::LutrisScanner::new()),
        Box::new(heroic::HeroicScanner::new()),
        Box::new(emulator::EmulatorScanner::new()),
        Box::new(standalone::StandaloneScanner::new()),
    ];

    let all_games = Arc::new(Mutex::new(Vec::<ScannedGame>::new()));
    let mut handles = vec![];

    for scanner in scanners {
        let platform = scanner.platform().to_string();
        let all_games = Arc::clone(&all_games);
        let progress = progress.clone();

        let handle = thread::spawn(move || {
            if let Some(ref cb) = progress {
                cb(&format!("Scanning {}...", platform));
            }

            let games = scanner.scan();
            let count = games.len();

            {
                let mut games_lock = all_games.lock().unwrap();
                games_lock.extend(games);
            }

            if let Some(ref cb) = progress {
                cb(&format!("✓ {} {} games found", count, platform));
            }
        });

        handles.push(handle);
    }

    // Wait for all scanners to complete
    for handle in handles {
        let _ = handle.join();
    }

    if let Some(ref cb) = progress {
        cb("Removing duplicates...");
    }

    let mut games = all_games.lock().unwrap().clone();

    // Deduplicate
    deduplicate(&mut games);

    // Sort by name
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    if let Some(ref cb) = progress {
        cb(&format!("Done! {} unique games found", games.len()));
    }

    games
}

/// Run full scan with metadata enrichment (cover art, icons, sizes)
pub fn run_full_scan_enriched(progress: Option<ScanProgressCallback>) -> Vec<EnrichedGameResult> {
    let games = run_full_scan(progress.clone());

    if let Some(ref cb) = progress {
        cb("Downloading artwork...");
    }

    let enriched = metadata::enrich_games_parallel(&games);

    if let Some(ref cb) = progress {
        cb(&format!("Metadata enrichment complete for {} games", enriched.len()));
    }

    enriched.into_iter().map(|e| EnrichedGameResult {
        game: e.game,
        cover_local: e.cover_local,
        icon_local: e.icon_local,
    }).collect()
}

/// Deduplicate games based on install path and name similarity
fn deduplicate(games: &mut Vec<ScannedGame>) {
    let mut seen_paths: HashSet<String> = HashSet::new();
    let mut seen_names: HashSet<String> = HashSet::new();
    let mut deduped = Vec::new();

    // Sort by priority first (higher priority wins)
    games.sort_by(|a, b| b.scan_confidence.partial_cmp(&a.scan_confidence).unwrap_or(std::cmp::Ordering::Equal));

    for game in games.drain(..) {
        let path_key = game.install_path.to_lowercase();
        let name_key = game.name.to_lowercase();

        // Check for exact path match
        if seen_paths.contains(&path_key) {
            continue;
        }

        // Check for very similar names (fuzzy match)
        let is_similar = seen_names.iter().any(|existing: &String| {
            let similarity = name_similarity(&name_key, existing);
            similarity > 0.85
        });

        if is_similar {
            continue;
        }

        seen_paths.insert(path_key);
        seen_names.insert(name_key);
        deduped.push(game);
    }

    *games = deduped;
}

/// Simple name similarity (Jaccard index on words)
pub fn name_similarity(a: &str, b: &str) -> f32 {
    let words_a: HashSet<&str> = a.split_whitespace().collect();
    let words_b: HashSet<&str> = b.split_whitespace().collect();

    if words_a.is_empty() || words_b.is_empty() {
        return 0.0;
    }

    let intersection = words_a.intersection(&words_b).count();
    let union = words_a.union(&words_b).count();

    intersection as f32 / union as f32
}
