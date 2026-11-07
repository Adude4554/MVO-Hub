use super::*;

#[test]
fn test_theme_manifest_new() {
    let manifest = ThemeManifest {
        id: "test-theme-1".to_string(),
        name: "Test Theme".to_string(),
        description: "A test theme".to_string(),
        author: "Test Author".to_string(),
        version: "1.0.0".to_string(),
        variables: [
            ("--mvo-crimson".to_string(), "#c53030".to_string()),
            ("--background".to_string(), "#0d050a".to_string()),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect(),
        preview_image: None,
        category: None,
        tags: vec!["test".to_string()],
        min_app_version: "0.3.0".to_string(),
        requires_enterprise: false,
    };
    let json = serde_json::to_string(&manifest).unwrap();
    let deserialized: ThemeManifest = serde_json::from_str(&json).unwrap();
    assert_eq!(manifest.id, deserialized.id);
    assert_eq!(manifest.name, deserialized.name);
    assert_eq!(manifest.variables.get("--mvo-crimson"), deserialized.variables.get("--mvo-crimson"));
}

#[test]
fn test_theme_manifest_variables() {
    let mut variables = HashMap::new();
    variables.insert("--mvo-crimson".to_string(), "#e84a4a".to_string());
    variables.insert("--background".to_string(), "#1a0a0f".to_string());

    let manifest = ThemeManifest {
        id: "test-theme-2".to_string(),
        name: "Dark Theme".to_string(),
        description: "A dark theme".to_string(),
        author: "Author".to_string(),
        version: "2.0.0".to_string(),
        variables,
        preview_image: None,
        category: None,
        tags: vec!["dark".to_string()],
        min_app_version: "0.3.0".to_string(),
        requires_enterprise: false,
    };
    let json = serde_json::to_string(&manifest).unwrap();
    let deserialized: ThemeManifest = serde_json::from_str(&json).unwrap();
    assert_eq!(manifest.variables.get("--mvo-crimson"), deserialized.variables.get("--mvo-crimson"));
    assert_eq!(manifest.variables.get("--background"), deserialized.variables.get("--background"));
}

#[test]
fn test_get_theme_tokens() {
    let tokens = get_theme_tokens();
    assert!(tokens.contains_key("crimson"));
    assert!(tokens.contains_key("background"));
    assert_eq!(tokens.get("crimson"), Some(&"#c53030".to_string()));
    assert_eq!(tokens.get("background"), Some(&"#0d050a".to_string()));
}

#[test]
fn test_apply_theme_returns_variables() {
    // Create a temp theme.json
    let dir = std::env::temp_dir().join("mvo_theme_test");
    let _ = std::fs::create_dir_all(&dir);
    let theme_path = dir.join("test_theme.json");
    std::fs::write(&theme_path, r#"{
        "id": "test",
        "name": "Test",
        "description": "Test",
        "author": "Test",
        "version": "1.0.0",
        "variables": {
            "--mvo-crimson": "#e84a4a",
            "--background": "#1a0a0f"
        },
        "preview_image": null,
        "tags": [],
        "min_app_version": "0.3.0",
        "requires_enterprise": false
    }"#).unwrap();

    let result = apply_theme(theme_path.to_string_lossy().to_string());
    assert!(result.is_ok());
    let vars = result.unwrap();
    assert_eq!(vars.get("--mvo-crimson"), Some(&"#e84a4a".to_string()));
    assert_eq!(vars.get("--background"), Some(&"#1a0a0f".to_string()));
}

#[test]
fn test_load_themes_from_dir() {
    let dir = std::env::temp_dir().join("mvo_theme_test2");
    let _ = std::fs::create_dir_all(&dir);
    let theme_path = dir.join("theme.json");
    std::fs::write(&theme_path, r#"{
        "id": "theme-1",
        "name": "Test Theme",
        "description": "A test theme",
        "author": "Test",
        "version": "1.0.0",
        "variables": {
            "--mvo-crimson": "#c53030"
        },
        "preview_image": null,
        "tags": [],
        "min_app_version": "0.3.0",
        "requires_enterprise": false
    }"#).unwrap();

    let result = load_themes_from_dir(dir.to_string_lossy().to_string());
    assert!(result.is_ok());
    let themes = result.unwrap();
    assert_eq!(themes.len(), 1);
    assert_eq!(themes[0].name, "Test Theme");
    assert_eq!(themes[0].variables.get("--mvo-crimson"), Some(&"#c53030".to_string()));
}

#[test]
fn test_set_active_theme() {
    let themes = vec![
        ThemeManifest {
            id: "theme-1".to_string(),
            name: "Test Theme".to_string(),
            description: "A test theme".to_string(),
            author: "Test".to_string(),
            version: "1.0.0".to_string(),
            variables: [("--mvo-crimson".to_string(), "#c53030".to_string())].iter().cloned().collect(),
            preview_image: None,
            category: None,
            tags: vec![],
            min_app_version: "0.3.0".to_string(),
            requires_enterprise: false,
        },
    ];
    
    let result = set_active_theme("theme-1".to_string(), themes);
    assert!(result.is_ok());
    let active = result.unwrap();
    assert!(active.manifest.is_some());
    assert_eq!(active.manifest.as_ref().unwrap().name, "Test Theme");
}

#[test]
fn test_set_active_theme_not_found() {
    let themes: Vec<ThemeManifest> = Vec::new();
    let result = set_active_theme("nonexistent".to_string(), themes);
    assert!(result.is_err());
}

#[test]
fn test_default_theme_tokens_contains_expected() {
    let tokens = DEFAULT_THEME_TOKENS;
    assert!(tokens.contains_key("crimson"));
    assert!(tokens.contains_key("background"));
    assert!(tokens.contains_key("surface"));
    assert!(tokens.contains_key("on-surface"));
    assert!(tokens.contains_key("accent"));
    assert!(tokens.contains_key("border"));
    assert!(tokens.contains_key("link"));
    assert!(tokens.contains_key("error"));
    assert!(tokens.contains_key("success"));
}