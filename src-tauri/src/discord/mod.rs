//! Discord Rich Presence client for MVO Hub.
//! Automatically updates user Rich Presence when games launch/close,
//! with game title, session duration, play state, and custom MVO Hub details.
//! Runs in a non-blocking async task via tokio.

use std::time::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::Mutex;

use discord_rich_rpc::Client as DiscordClient;
use discord_rich_rpc::RpcEvent;

/// Configuration for Discord Rich Presence
#[derive(Debug, Clone)]
pub struct DiscordRPCConfig {
    /// The client ID from the Discord Developer Portal
    pub client_id: String,
    /// Whether Rich Presence is enabled
    pub enabled: bool,
    /// Optional details (game name) update interval
    pub details_update_interval: Duration,
    /// Optional state update interval
    pub state_update_interval: Duration,
}

/// The current Rich Presence state sent to Discord
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceState {
    /// The game details (e.g., "Playing Game Title")
    pub details: String,
    /// The game state (e.g., "Session duration: 02m 31s")
    pub state: String,
    /// Large image key
    pub large_image: Option<String>,
    /// Large image text (hover)
    pub large_text: Option<String>,
    /// Small image key
    pub small_image: Option<String>,
    /// Small image text (hover)
    pub small_text: Option<String>,
    /// Whether the user is playing
    pub start_timestamp: Option<Instant>,
}

/// Manages the Discord RPC connection and presence updates.
pub struct DiscordRPC {
    /// The Discord client instance
    client: Option<DiscordClient>,
    /// Whether RPC is enabled
    enabled: bool,
    /// Current presence state
    state: Arc<Mutex<PresenceState>>,
    /// Configuration
    config: DiscordRPCConfig,
    /// Last presence update time
    last_update: Arc<Mutex<Instant>>,
}

impl DiscordRPC {
    /// Creates a new DiscordRPC instance with the given configuration.
    pub fn new(config: DiscordRPCConfig) -> Self {
        DiscordRPC {
            client: None,
            enabled: config.enabled,
            state: Arc::new(Mutex::new(PresenceState {
                details: String::new(),
                state: String::new(),
                large_image: None,
                large_text: None,
                small_image: None,
                small_text: None,
                start_timestamp: None,
            })),
            config,
            last_update: Arc::new(Mutex::new(Instant::now())),
        }
    }

    /// Initialize the Discord RPC connection.
    /// Returns true if the connection was successfully established.
    pub async fn init(&mut self) -> Result<(), String> {
        if !self.enabled {
            return Ok(());
        }

        // Parse the client ID
        let client_id = self.config.client_id
            .parse::<u64>()
            .map_err(|e| format!("Invalid Discord client ID: {}", e))?;

        // Create the Discord client
        let mut client = DiscordClient::new(client_id)
            .map_err(|e| format!("Failed to create Discord client: {}", e))?;

        // Set up event handler
        client.set_event_handler(|event| {
            // Handle connection events if needed
            // e.g., log connection state changes
        });

        // Connect will block until connection is established or timeout
        client.start(false)
            .map_err(|e| format!("Failed to start Discord RPC: {}", e))?;

        self.client = Some(client);

        Ok(())
    }

    /// Update the Rich Presence with the current game state.
    pub async fn update_presence(&self, state: PresenceState) {
        if !self.enabled {
            return;
        }

        if let Some(ref client) = self.client {
            let now = Instant::now();
            let last = self.last_update.lock().await;
            // Throttle updates to at least 15 seconds apart
            if now.duration_since(*last).as_secs() < 15 {
                drop(last);
                return;
            }
            drop(last);

            // Build the presence object
            let mut presence = discord_rich_rpc:: Presence::default();
            presence.details = Some(state.details);
            presence.state = Some(state.state);
            presence.start_timestamp = state.start_timestamp.map(|t| t.elapsed().as_secs() as i64);

            if let Some(lg_image) = state.large_image {
                presence.large_image = Some(lg_image);
            }
            if let Some(lg_text) = state.large_text {
                presence.large_text = Some(lg_text);
            }
            if let Some(sm_image) = state.small_image {
                presence.small_image = Some(sm_image);
            }
            if let Some(sm_text) = state.small_text {
                presence.small_text = Some(sm_text);
            }

            // Update presence
            client.send_presence_update(&presence)
                .await
                .ok();

            // Update last update time
            let mut last = self.last_update.lock().await;
            *last = now;
        }
    }

    /// Set the game presence state.
    /// This will be sent to Discord on the next update cycle.
    pub fn set_presence(&self, details: String, state: String, large_image: Option<String>, large_text: Option<String>, small_image: Option<String>, small_text: Option<String>) {
        let mut s = self.state.lock().unwrap();
        s.details = details;
        s.state = state;
        s.large_image = large_image;
        s.large_text = large_text;
        s.small_image = small_image;
        s.small_text = small_text;
    }

    /// Get the current presence state
    pub fn get_presence(&self) -> PresenceState {
        self.state.lock().unwrap().clone()
    }

    /// Check if Discord RPC is enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Whether the client is currently connected to Discord
    pub async fn is_connected(&self) -> bool {
        self.client.as_ref().map_or(false, |c| c.is_ready()).await
    }
}

impl Drop for DiscordRPC {
    fn drop(&mut self) {
        // The client will be cleaned up when it goes out of scope
        // If we had a running task, we'd stop it here
    }
}

/// Background task that periodically updates Discord Rich Presence.
/// This runs on a tokio runtime and should be spawned as a task.
pub async fn discord_rpc_task(
    rpc: Arc<DiscordRPC>,
    game_name: Arc<Mutex<Option<String>>>,
    start_time: Arc<Mutex<Option<Instant>>>,
) {
    // Initial update
    rpc.update_presence(rpc.get_presence()).await;

    loop {
        tokio::time::sleep(Duration::from_secs(15)).await;

        let game = game_name.lock().await;
        let start = start_time.lock().await;
        
        let mut presence = rpc.get_presence();
        
        if let Some(ref game_name) = *game {
            presence.details = Some(game_name.clone());
        }

        // Calculate session duration
        if let Some(start) = *start {
            let duration = start.elapsed();
            let minutes = duration.as_secs() / 60;
            let seconds = duration.as_secs() % 60;
            presence.state = Some(format!("Session duration: {:02}m {:02}s", minutes, seconds));
        }

        drop(start);
        drop(game);

        rpc.update_presence(presence).await;
    }
}

/// Parse a PresenceState from a ScannedGame and optional session data
pub fn presence_from_game(game: &crate::scanner::ScannedGame, session_duration: Option<Duration>) -> PresenceState {
    let mut presence = PresenceState {
        details: game.name.clone(),
        state: session_duration.map_or_else(|| "Not playing".to_string(), |d| {
            let minutes = d.as_secs() / 60;
            let seconds = d.as_secs() % 60;
            format!("Playing {} ({:02}m {:02}s)", game.name, minutes, seconds)
        }),
        large_image: None,
        large_text: None,
        small_image: None,
        small_text: None,
        start_timestamp: session_duration.map(|d| Instant::now() - d),
    };

    // Set platform-appropriate large image text
    presence.large_text = Some(game.platform.clone());

    presence
}