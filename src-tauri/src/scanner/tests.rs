use super::*;

#[test]
fn test_steam_scanner_availability() {
    let scanner = steam::SteamScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_epic_scanner_availability() {
    let scanner = epic::EpicScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_gog_scanner_availability() {
    let scanner = gog::GogScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_ea_scanner_availability() {
    let scanner = ea::EaScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_ubisoft_scanner_availability() {
    let scanner = ubisoft::UbisoftScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_battlenet_scanner_availability() {
    let scanner = battlenet::BattleNetScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_riot_scanner_availability() {
    let scanner = riot::RiotScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_xbox_scanner_availability() {
    let scanner = xbox::XboxScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_amazon_scanner_availability() {
    let scanner = amazon::AmazonScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_itch_scanner_availability() {
    let scanner = itch::ItchScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_rockstar_scanner_availability() {
    let scanner = rockstar::RockstarScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_minecraft_scanner_availability() {
    let scanner = minecraft::MinecraftScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_emulator_scanner_availability() {
    let scanner = emulator::EmulatorScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_standalone_scanner_availability() {
    let scanner = standalone::StandaloneScanner::new();
    let _available = scanner.is_available();
}

#[test]
fn test_name_similarity() {
    assert_eq!(engine::name_similarity("call of duty", "call of duty"), 1.0);
    let sim = engine::name_similarity("call of duty modern warfare", "call of duty");
    assert!(sim > 0.0 && sim < 1.0);
    assert_eq!(engine::name_similarity("halo", "forza"), 0.0);
}

#[test]
fn test_is_game_dir_name() {
    assert!(is_game_dir_name("Cyberpunk 2077"));
    assert!(is_game_dir_name("The Witcher 3"));
    assert!(!is_game_dir_name(".git"));
    assert!(!is_game_dir_name("__pycache__"));
    assert!(!is_game_dir_name("redist"));
    assert!(!is_game_dir_name("support"));
}

#[test]
fn test_steam_scanner_scan() {
    let scanner = steam::SteamScanner::new();
    let games = scanner.scan();
    if scanner.is_available() {
        println!("Steam games found: {}", games.len());
        for game in &games {
            println!("  - {} ({})", game.name, game.platform);
        }
    }
}

#[test]
fn test_epic_scanner_scan() {
    let scanner = epic::EpicScanner::new();
    let games = scanner.scan();
    if scanner.is_available() {
        println!("Epic games found: {}", games.len());
        for game in &games {
            println!("  - {} ({})", game.name, game.platform);
        }
    }
}

#[test]
fn test_full_scan_engine() {
    let games = engine::run_full_scan(None);
    println!("Total games found: {}", games.len());
    for game in &games {
        println!("  - {} [{}] ({})", game.name, game.platform, game.launcher);
    }
}
