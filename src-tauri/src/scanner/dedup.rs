use crate::scanner::ScannedGame;
use std::collections::HashMap;

pub struct DeduplicationResult {
    pub games: Vec<ScannedGame>,
    pub duplicates: Vec<DuplicateGroup>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub primary: ScannedGame,
    pub duplicates: Vec<ScannedGame>,
    pub reason: String,
}

pub fn deduplicate_games(games: Vec<ScannedGame>) -> DeduplicationResult {
    let mut by_path: HashMap<String, Vec<ScannedGame>> = HashMap::new();
    let mut by_name: HashMap<String, Vec<ScannedGame>> = HashMap::new();

    for game in &games {
        let path_key = normalize_path(&game.install_path);
        by_path.entry(path_key).or_default().push(game.clone());

        let name_key = normalize_name(&game.name);
        by_name.entry(name_key).or_default().push(game.clone());
    }

    let mut duplicates = Vec::new();
    let mut removed_ids = std::collections::HashSet::new();

    for (_path, group) in &by_path {
        if group.len() > 1 {
            let mut sorted = group.clone();
            sorted.sort_by(|a, b| b.scan_confidence.partial_cmp(&a.scan_confidence).unwrap_or(std::cmp::Ordering::Equal));
            let primary = sorted[0].clone();
            let dupes: Vec<ScannedGame> = sorted[1..].to_vec();
            for d in &dupes {
                removed_ids.insert(d.id.clone());
            }
            duplicates.push(DuplicateGroup {
                primary,
                duplicates: dupes,
                reason: "Multiple installations (same path)".to_string(),
            });
        }
    }

    for (_name, group) in &by_name {
        if group.len() > 1 {
            let already_handled = duplicates.iter().any(|d| {
                group.iter().any(|g| g.id == d.primary.id || d.duplicates.iter().any(|dd| dd.id == g.id))
            });
            if already_handled { continue; }

            let mut sorted = group.clone();
            sorted.sort_by(|a, b| b.scan_confidence.partial_cmp(&a.scan_confidence).unwrap_or(std::cmp::Ordering::Equal));
            let primary = sorted[0].clone();
            let dupes: Vec<ScannedGame> = sorted[1..].to_vec();
            for d in &dupes {
                removed_ids.insert(d.id.clone());
            }
            duplicates.push(DuplicateGroup {
                primary,
                duplicates: dupes,
                reason: "Multiple installations (same name)".to_string(),
            });
        }
    }

    let mut result_games: Vec<ScannedGame> = games.into_iter()
        .filter(|g| !removed_ids.contains(&g.id))
        .collect();
    result_games.sort_by(|a, b| a.name.cmp(&b.name));

    DeduplicationResult {
        games: result_games,
        duplicates,
    }
}

fn normalize_path(path: &str) -> String {
    path.to_lowercase()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_string()
}

fn normalize_name(name: &str) -> String {
    let lower = name.to_lowercase();
    let cleaned: String = lower.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();
    let mut words: Vec<&str> = cleaned.split_whitespace().collect();
    words.sort();
    words.join(" ")
}

pub fn find_game_by_id<'a>(games: &'a [ScannedGame], id: &str) -> Option<&'a ScannedGame> {
    games.iter().find(|g| g.id == id)
}

pub fn find_game_by_path<'a>(games: &'a [ScannedGame], path: &str) -> Option<&'a ScannedGame> {
    let normalized = normalize_path(path);
    games.iter().find(|g| normalize_path(&g.install_path) == normalized)
}

pub fn group_by_launcher(games: &[ScannedGame]) -> HashMap<String, Vec<&ScannedGame>> {
    let mut groups: HashMap<String, Vec<&ScannedGame>> = HashMap::new();
    for game in games {
        groups.entry(game.launcher.clone()).or_default().push(game);
    }
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_game(name: &str, launcher: &str, confidence: f32) -> ScannedGame {
        ScannedGame {
            id: format!("{}:{}", launcher.to_lowercase(), name.to_lowercase().replace(' ', "-")),
            name: name.to_string(),
            platform: launcher.to_string(),
            launcher: launcher.to_string(),
            install_path: format!("C:\\Games\\{}", name),
            exe_path: Some(format!("C:\\Games\\{}\\{}.exe", name, name)),
            app_id: None,
            version: None,
            icon_path: None,
            cover_path: None,
            banner_path: None,
            install_size: Some(1_000_000_000),
            scan_confidence: confidence,
            is_installed: true,
        }
    }

    #[test]
    fn test_no_duplicates() {
        let games = vec![
            make_game("Game A", "Steam", 0.9),
            make_game("Game B", "Epic", 0.8),
        ];
        let result = deduplicate_games(games);
        assert_eq!(result.games.len(), 2);
        assert!(result.duplicates.is_empty());
    }

    #[test]
    fn test_same_path_duplicates() {
        let games = vec![
            make_game("Cyberpunk 2077", "Steam", 1.0),
            make_game("Cyberpunk 2077", "Standalone", 0.5),
        ];
        let result = deduplicate_games(games);
        assert_eq!(result.games.len(), 1);
        assert_eq!(result.duplicates.len(), 1);
        assert_eq!(result.duplicates[0].primary.name, "Cyberpunk 2077");
    }

    #[test]
    fn test_normalize_name() {
        assert_eq!(normalize_name("The Witcher 3"), normalize_name("the witcher 3"));
        assert_eq!(normalize_name("Cyberpunk 2077"), normalize_name("cyberpunk 2077"));
    }

    #[test]
    fn test_group_by_launcher() {
        let games = vec![
            make_game("Game A", "Steam", 0.9),
            make_game("Game B", "Steam", 0.8),
            make_game("Game C", "Epic", 0.7),
        ];
        let groups = group_by_launcher(&games);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups["Steam"].len(), 2);
        assert_eq!(groups["Epic"].len(), 1);
    }

    #[test]
    fn test_empty_game_list() {
        let games = vec![];
        let result = deduplicate_games(games);
        assert_eq!(result.games.len(), 0);
        assert!(result.duplicates.is_empty());
    }

    #[test]
    fn test_single_game_no_dedup() {
        let games = vec![make_game("Solitaire", "Steam", 0.9)];
        let result = deduplicate_games(games);
        assert_eq!(result.games.len(), 1);
        assert!(result.duplicates.is_empty());
        assert_eq!(result.games[0].name, "Solitaire");
    }

    #[test]
    fn test_all_duplicates_identical() {
        let games = vec![
            make_game("Doom", "Steam", 0.9),
            make_game("Doom", "Steam", 0.9),
            make_game("Doom", "Steam", 0.9),
        ];
        let result = deduplicate_games(games);
        assert!(result.duplicates.len() >= 1);
        let total_deduped: usize = result.duplicates.iter().map(|d| d.duplicates.len()).sum();
        assert_eq!(result.games.len() + total_deduped + result.duplicates.len(), 3);
    }

    #[test]
    fn test_same_name_different_paths() {
        let mut g1 = make_game("Hollow Knight", "Steam", 0.9);
        g1.install_path = "C:\\Games\\Hollow Knight".to_string();
        let mut g2 = make_game("Hollow Knight", "Standalone", 0.5);
        g2.install_path = "D:\\Backups\\Hollow Knight".to_string();
        let result = deduplicate_games(vec![g1, g2]);
        assert_eq!(result.games.len(), 1);
        assert_eq!(result.duplicates.len(), 1);
        assert_eq!(result.duplicates[0].primary.install_path, "C:\\Games\\Hollow Knight");
    }
}
