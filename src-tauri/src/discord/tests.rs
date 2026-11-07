use super::*;

#[tokio::test]
async fn test_discord_rpc_new() {
    let config = DiscordRPCConfig {
        client_id: "123456789012345678".to_string(),
        enabled: false,
        details_update_interval: Duration::from_secs(15),
        state_update_interval: Duration::from_secs(15),
    };
    let rpc = DiscordRPC::new(config);
    assert!(!rpc.is_enabled());
}

#[tokio::test]
async fn test_discord_rpc_presence_state() {
    let config = DiscordRPCConfig {
        client_id: "123456789012345678".to_string(),
        enabled: true,
        details_update_interval: Duration::from_secs(15),
        state_update_interval: Duration::from_secs(15),
    };
    let rpc = DiscordRPC::new(config);
    
    rpc.set_presence(
        "Playing Game Title".to_string(),
        "Session duration: 05m 30s".to_string(),
        Some("large_image_key".to_string()),
        Some("Large Image Text".to_string()),
        Some("small_image_key".to_string()),
        Some("Small Image Text".to_string()),
    );
    
    let state = rpc.get_presence();
    assert_eq!(state.details, "Playing Game Title");
    assert_eq!(state.state, "Session duration: 05m 30s");
    assert_eq!(state.large_image, Some("large_image_key".to_string()));
    assert_eq!(state.large_text, Some("Large Image Text".to_string()));
    assert_eq!(state.small_image, Some("small_image_key".to_string()));
    assert_eq!(state.small_text, Some("Small Image Text".to_string()));
}

#[tokio::test]
async fn test_presence_from_game() {
    let game = crate::scanner::ScannedGame {
        id: "steam-123456".to_string(),
        name: "Cyberpunk 2077".to_string(),
        platform: "Steam".to_string(),
        launcher: "Steam".to_string(),
        install_path: "C:\\Games\\Cyberpunk 2077".to_string(),
        exe_path: Some("C:\\Games\\Cyberpunk 2077\\cyberpunk2077.exe".to_string()),
        app_id: Some("1091500".to_string()),
        version: Some("1.63".to_string()),
        icon_path: None,
        cover_path: None,
        banner_path: None,
        install_size: Some(50_000_000_000),
        scan_confidence: 0.98,
        is_installed: true,
    };
    
    let session_duration = Some(Duration::from_secs(300)); // 5 minutes
    let presence = presence_from_game(&game, session_duration);
    
    assert_eq!(presence.details, "Cyberpunk 2077");
    assert!(presence.state.contains("Session duration"));
    assert!(presence.state.contains("05m"));
    assert_eq!(presence.large_text, Some("Steam".to_string()));
}

#[tokio::test]
async fn test_presence_from_game_no_session() {
    let game = crate::scanner::ScannedGame {
        id: "steam-123456".to_string(),
        name: "The Witcher 3".to_string(),
        platform: "Steam".to_string(),
        launcher: "Steam".to_string(),
        install_path: "C:\\Games\\The Witcher 3".to_string(),
        exe_path: Some("C:\\Games\\The Witcher 3\\witcher3.exe".to_string()),
        app_id: Some("292030".to_string()),
        version: Some("1.32".to_string()),
        icon_path: None,
        cover_path: None,
        banner_path: None,
        install_size: Some(35_000_000_000),
        scan_confidence: 0.95,
        is_installed: true,
    };
    
    let session_duration = None;
    let presence = presence_from_game(&game, session_duration);
    
    assert_eq!(presence.details, "The Witcher 3");
    assert_eq!(presence.state, "Not playing");
    assert_eq!(presence.large_text, Some("Steam".to_string()));
}