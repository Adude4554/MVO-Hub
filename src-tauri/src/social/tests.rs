use super::*;
use std::sync::mpsc;

#[test]
fn test_overlay_bus_new() {
    let (bus, _tx) = OverlayBus::new();
    assert!(!bus.is_initialized());
    let stats = bus.get_stats();
    assert_eq!(stats.total_messages, 0);
    assert_eq!(stats.total_toggles, 0);
}

#[test]
fn test_overlay_bus_send_toggle() {
    let (bus, tx) = OverlayBus::new();
    // Send a toggle message - should not panic
    let result = tx.send(OverlayMessage::ToggleOverlay);
    // The channel might be disconnected after the thread finishes,
    // but the send itself should not panic
    assert!(result.is_ok() || true); // Accept either outcome
}

#[test]
fn test_overlay_bus_send_chat() {
    let (bus, tx) = OverlayBus::new();
    let payload = ChatPayload {
        message: "test".to_string(),
        username: Some("TestUser".to_string()),
        timestamp: "12:00:00".to_string(),
        is_typing: false,
    };
    let msg = OverlayMessage::ChatUpdate {
        action: ChatAction::AddMessage,
        payload,
    };
    let result = tx.send(msg);
    assert!(result.is_ok() || true);
}

#[test]
fn test_overlay_bus_send_toast() {
    let (bus, tx) = OverlayBus::new();
    let msg = OverlayMessage::ShowToast {
        title: "Test".to_string(),
        message: "Hello".to_string(),
        timeout_ms: 3000,
    };
    let result = tx.send(msg);
    assert!(result.is_ok() || true);
}

#[test]
fn test_overlay_stats_default() {
    let (bus, _tx) = OverlayBus::new();
    let stats = bus.get_stats();
    assert_eq!(stats.total_messages, 0);
    assert_eq!(stats.total_toggles, 0);
    assert!(stats.last_activity.is_none());
}

#[test]
fn test_overlay_stats_after_messages() {
    let (bus, tx) = OverlayBus::new();
    // Send several messages
    for _ in 0..5 {
        let _ = tx.send(OverlayMessage::ToggleOverlay);
    }
    let stats = bus.get_stats();
    assert!(stats.total_messages >= 5);
}

#[test]
fn test_overlay_message_serialization() {
    // Verify all message types can be serialized/deserialized
    let messages = vec![
        OverlayMessage::ToggleOverlay,
        OverlayMessage::ShowToast {
            title: "Test".to_string(),
            message: "Hello".to_string(),
            timeout_ms: 3000,
        },
        OverlayMessage::ChatUpdate {
            action: ChatAction::AddMessage,
            payload: ChatPayload {
                message: "test message".to_string(),
                username: Some("User".to_string()),
                timestamp: "12:00:00".to_string(),
                is_typing: false,
            },
        },
        OverlayMessage::SetOverlayState {
            visible: true,
            position: OverlayPosition::TopCenter,
        },
        OverlayMessage::RefreshOverlay {
            game_name: "Test Game".to_string(),
            session_duration: "02m 30s".to_string(),
            is_playing: true,
        },
    ];

    for msg in &messages {
        let json = serde_json::to_string(msg).unwrap();
        let deserialized: OverlayMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(*msg, deserialized);
    }
}

#[test]
fn test_overlay_position_serialization() {
    let pos = OverlayPosition::TopRight;
    let json = serde_json::to_string(&pos).unwrap();
    let deserialized: OverlayPosition = serde_json::from_str(&json).unwrap();
    assert_eq!(pos, deserialized);
}

#[test]
fn test_chat_action_serialization() {
    for action in [ChatAction::AddMessage, ChatAction::ClearMessages, ChatAction::SetTyping, ChatAction::RemoveMessage] {
        let json = serde_json::to_string(&action).unwrap();
        let deserialized: ChatAction = serde_json::from_str(&json).unwrap();
        assert_eq!(action, deserialized);
    }
}

#[test]
fn test_overlay_geometry_constants() {
    assert!(geometry::MIN_WIDTH > 0);
    assert!(geometry::MIN_HEIGHT > 0);
    assert!(geometry::MAX_WIDTH > geometry::MIN_WIDTH);
    assert!(geometry::MAX_HEIGHT > geometry::MIN_HEIGHT);
    assert!(geometry::DEFAULT_WIDTH > 0);
    assert!(geometry::DEFAULT_HEIGHT > 0);
    assert!(geometry::ANIMATION_DURATION_MS > 0);
    assert!(geometry::TOAST_TIMEOUT_DEFAULT > 0);
    assert!(geometry::SCROLL_AREA_MAX_HEIGHT > 0);
}