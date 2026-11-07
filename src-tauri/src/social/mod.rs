//! In-App Community Overlay & Chat System
//!
//! Local messaging/overlay event bus and IPC channel manager for in-app chat,
//! voice status, and gameplay overlays. Runs on a tokio-backed task communicates
//! with the frontend via Tauri IPC commands.

use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc as tokio_mpsc;
use tokio::time::timeout;

use tauri::State;
use tokio::sync::broadcaster;

/// Message types sent through the overlay event bus
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum OverlayMessage {
    /// Toggle the overlay widget visibility
    ToggleOverlay,
    /// Show a transient toast/notification
    ShowToast {
        title: String,
        message: String,
        timeout_ms: u64,
    },
    /// Update chat state (add message, clear, etc.)
    ChatUpdate {
        action: ChatAction,
        payload: ChatPayload,
    },
    /// Set overlay position and visibility
    SetOverlayState {
        visible: bool,
        position: OverlayPosition,
    },
    /// Refresh the overlay with new game state info
    RefreshOverlay {
        game_name: String,
        session_duration: String,
        is_playing: bool,
    },
}

/// Chat action types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChatAction {
    AddMessage,
    ClearMessages,
    SetTyping,
    RemoveMessage,
}

/// Chat payload structure
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatPayload {
    /// The message text
    pub message: String,
    /// Optional user display name
    pub username: Option<String>,
    /// Timestamp of the message
    pub timestamp: String,
    /// Whether the user is currently typing
    pub is_typing: bool,
}

/// Overlay position on screen
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OverlayPosition {
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
    Center,
}

/// Statistics about overlay usage
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayStats {
    pub total_messages: u64,
    pub total_toggles: u64,
    pub last_activity: Option<Instant>,
}

/// Thread-safe overlay event bus
pub struct OverlayBus {
    /// Channel for sending messages from backend to frontend
    sender: Option<mpsc::Sender<OverlayMessage>>,
    /// Received message count for stats
    stats: Arc<Mutex<OverlayStats>>,
    /// Whether the bus is initialized
    initialized: Arc<Mutex<bool>>,
}

impl OverlayBus {
    /// Create a new overlay bus with unbounded channels
    pub fn new() -> (Self, mpsc::Sender<OverlayMessage>) {
        let (tx, rx) = mpsc::channel::<OverlayMessage>();
        let bus = OverlayBus {
            sender: Some(tx),
            stats: Arc::new(Mutex::new(OverlayStats::default())),
            initialized: Arc::new(Mutex::new(false)),
        };
        // Spawn task that forwards messages (could be replaced with IPC later)
        let stats = Arc::clone(bus.stats);
        let initialized = Arc::clone(bus.initialized);
        std::thread::spawn(move || {
            for msg in rx {
                // Could log or process messages here
                let mut stats_lock = stats.lock().unwrap();
                stats_lock.total_messages += 1;
                drop(stats_lock);
            }
            *initialized.lock().unwrap() = true;
        });
        (bus, tx)
    }

    /// Send a message to the frontend via the IPC channel
    pub fn send(&self, msg: OverlayMessage) -> Result<(), String> {
        if let Some(ref sender) = self.sender {
            sender.send(msg).map_err(|e| format!("Overlay bus send failed: {}", e))?;
            Ok(())
        } else {
            Err("Overlay bus not initialized".to_string())
        }
    }

    /// Get current stats
    pub fn get_stats(&self) -> OverlayStats {
        self.stats.lock().unwrap().clone()
    }

    /// Check if the bus is initialized
    pub fn is_initialized(&self) -> bool {
        *self.initialized.lock().unwrap()
    }
}

/// Global overlay bus instance (lazy initialization)
pub static GLOBAL_BUS: once_lock::sync::Lazy<OverlayBus> = once_lock::sync::Lazy::new(|| {
    let (bus, _) = OverlayBus::new();
    bus
});

/// Initialize the global overlay bus with a Tauri command sender
/// This should be called during app setup with the app handle's command sender
pub fn init_global_bus(sender: mpsc::Sender<OverlayMessage>) {
    let _ = GLOBAL_BUS.get_or_init(|| {
        let (bus, _) = OverlayBus::new();
        // Replace the sender with the real one
        // In a full implementation, we'd update the bus's sender
        bus
    });
}

/// Send a toggle overlay message (accessible via global shortcut)
pub fn send_toggle_overlay() -> Result<(), String> {
    GLOBAL_BUS.send(OverlayMessage::ToggleOverlay)
}

/// Send a chat message to the overlay
pub fn send_chat_message(message: String, username: Option<String>) -> Result<(), String> {
    GLOBAL_BUS.send(OverlayMessage::ChatUpdate {
        action: ChatAction::AddMessage,
        payload: ChatPayload {
            message,
            username,
            timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
            is_typing: false,
        },
    })
}

/// Send a toast notification
pub fn send_toast(title: String, message: String, timeout_ms: u64) -> Result<(), String> {
    GLOBAL_BUS.send(OverlayMessage::ShowToast { title, message, timeout_ms })
}

/// Build statistics about overlay usage
pub fn build_overlay_stats() -> OverlayStats {
    GLOBAL_BUS.get_stats()
}

/// IPC command names for frontend communication
pub mod commands {
    /// Command names used to communicate with the overlay from the frontend
    pub const TOGGLE_OVERLAY: &str = "overlay:toggle";
    pub const SEND_CHAT_MESSAGE: &str = "overlay:chat:message";
    pub const SEND_TOAST: &str = "overlay:toast";
    pub SET_OVERLAY_STATE: &str = "overlay:setState";
    pub REFRESH_OVERLAY: &str = "overlay:refresh";
    pub GET_OVERLAY_STATS: &str = "overlay:stats";
}

/// Backend -> frontend event names
pub mod events {
    /// Events sent from the backend to the frontend
    pub const OVERLAY_TOGGLED: &str = "overlay:toggled";
    pub const CHAT_MESSAGE: &str = "overlay:chat:message";
    pub const TOAST_SHOWN: &str = "overlay:toast:shown";
    pub const OVERLAY_STATE_CHANGED: &str = "overlay:state:changed";
    pub const OVERLAY_STATS_UPDATE: &str = "overlay:stats:update";
}

/// Theme colors for the overlay (crimson-themed)
pub mod colors {
    /// Crimson theme palette
    pub const DEFAULT_BACKGROUND: &str = "#1a0a0f";
    pub const DEFAULT_SURFACE: &str = "#2a1a1f";
    pub const DEFAULT_ON_SURFACE: &str = "#f0e6e2";
    pub const PRIMARY_CRIMSON: &str = "#c53030";
    pub const PRIMARY_CRIMSON_BRIGHT: &str = "#e84a4a";
    pub const ACCENT_GOLD: &str = "#d4a843";
    pub const TEXT_DISABLED: &str = "#666666";
    pub const BACKGROUND_GRADIENT: &str = "linear-gradient(135deg, #1a0a0f 0%, #0d050a 100%)";
}

/// Overlay widget dimensions and styling constants
pub mod geometry {
    pub const MIN_WIDTH: f64 = 320.0;
    pub const MIN_HEIGHT: f64 = 200.0;
    pub const MAX_WIDTH: f64 = 800.0;
    pub const MAX_HEIGHT: f64 = 600.0;
    pub const DEFAULT_WIDTH: f64 = 480.0;
    pub const DEFAULT_HEIGHT: f64 = 360.0;
    pub const ANIMATION_DURATION_MS: u64 = 200;
    pub const TOAST_TIMEOUT_DEFAULT: u64 = 5000;
    pub const SCROLL_AREA_MAX_HEIGHT: f64 = 300.0;
}