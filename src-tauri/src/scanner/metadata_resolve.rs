use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMetadata {
    pub title: String,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub banner_url: Option<String>,
    pub icon_url: Option<String>,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    pub rating: Option<f32>,
    pub screenshots: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamAppDetails {
    #[serde(rename = "type")]
    app_type: Option<String>,
    name: Option<String>,
    developers: Option<Vec<String>>,
    publishers: Option<Vec<String>>,
    release_date: Option<SteamReleaseDate>,
    short_description: Option<String>,
    header_image: Option<String>,
    capsule_image: Option<String>,
    website: Option<String>,
    categories: Option<Vec<SteamCategory>>,
    genres: Option<Vec<SteamGenre>>,
    ratings: Option<SteamRatings>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamReleaseDate {
    coming_soon: Option<bool>,
    date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamCategory {
    id: Option<u32>,
    description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamGenre {
    id: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamRatings {
    #[serde(rename = "metacritic")]
    metacritic: Option<SteamMetacritic>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamMetacritic {
    score: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamAppDetailsResponse {
    success: bool,
    data: Option<SteamAppDetails>,
}

pub struct MetadataResolver {
    cache: Arc<Mutex<HashMap<String, GameMetadata>>>,
    client: Option<reqwest::blocking::Client>,
}

impl MetadataResolver {
    pub fn new() -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .user_agent("MVO-Hub/0.2.12")
            .build()
            .ok();

        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            client,
        }
    }

    pub fn resolve_by_steam_app_id(&self, app_id: &str) -> Option<GameMetadata> {
        if let Some(cached) = self.cache.lock().ok()?.get(app_id) {
            return Some(cached.clone());
        }

        let client = self.client.as_ref()?;
        let url = format!("https://store.steampowered.com/api/appdetails?appids={}", app_id);
        let resp = client.get(&url).send().ok()?;
        let json: HashMap<String, SteamAppDetailsResponse> = resp.json().ok()?;

        let app_data = json.get(app_id)?.data.as_ref()?;
        if app_data.app_type.as_deref() != Some("game") && app_data.app_type.as_deref() != Some("dlc") {
            return None;
        }

        let metadata = GameMetadata {
            title: app_data.name.clone().unwrap_or_default(),
            developer: app_data.developers.as_ref().and_then(|d| d.first().cloned()),
            publisher: app_data.publishers.as_ref().and_then(|p| p.first().cloned()),
            release_date: app_data.release_date.as_ref().and_then(|r| r.date.clone()),
            description: app_data.short_description.clone(),
            cover_url: app_data.header_image.clone(),
            banner_url: app_data.capsule_image.clone(),
            icon_url: None,
            genres: app_data.genres.as_ref()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|g| g.description.clone())
                .collect(),
            platforms: vec!["PC".to_string()],
            rating: app_data.ratings.as_ref()
                .and_then(|r| r.metacritic.as_ref())
                .and_then(|m| m.score)
                .map(|s| s as f32 / 100.0),
            screenshots: Vec::new(),
        };

        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(app_id.to_string(), metadata.clone());
        }

        Some(metadata)
    }

    pub fn resolve_by_name(&self, name: &str) -> Option<GameMetadata> {
        let client = self.client.as_ref()?;
        let url = format!(
            "https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=US",
            urlencoding::encode(name)
        );
        let resp = client.get(&url).send().ok()?;
        let json: serde_json::Value = resp.json().ok()?;

        let items = json.get("items")?.as_array()?;
        let first = items.first()?;
        let app_id = first.get("id")?.as_i64()?.to_string();

        self.resolve_by_steam_app_id(&app_id)
    }

    pub fn resolve_for_game(&self, name: &str, steam_app_id: Option<&str>) -> Option<GameMetadata> {
        if let Some(id) = steam_app_id {
            if !id.is_empty() {
                if let Some(meta) = self.resolve_by_steam_app_id(id) {
                    return Some(meta);
                }
            }
        }

        self.resolve_by_name(name)
    }

    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
    }

    pub fn cache_size(&self) -> usize {
        self.cache.lock().map(|c| c.len()).unwrap_or(0)
    }
}

impl Default for MetadataResolver {
    fn default() -> Self {
        Self::new()
    }
}

pub fn metadata_resolver() -> &'static MetadataResolver {
    static RESOLVER: OnceLock<MetadataResolver> = OnceLock::new();
    RESOLVER.get_or_init(MetadataResolver::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metadata_resolver_new() {
        let resolver = MetadataResolver::new();
        assert_eq!(resolver.cache_size(), 0);
    }

    #[test]
    fn test_clear_cache() {
        let resolver = MetadataResolver::new();
        resolver.clear_cache();
        assert_eq!(resolver.cache_size(), 0);
    }
}
