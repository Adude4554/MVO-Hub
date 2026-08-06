#![allow(dead_code)]

pub mod db;
pub mod downloader;
pub mod extractor;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreItem {
    pub id: u32,
    pub name: String,
    pub description: String,
    pub appid: u32,
    pub category: String,
    #[serde(default, rename = "downloadLink")]
    pub download_link: Option<String>,
}

impl StoreItem {
    pub fn cover_url(&self) -> String {
        format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/header.jpg", self.appid)
    }

    pub fn has_download(&self) -> bool {
        self.download_link.is_some()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledGame {
    pub id: String,
    pub name: String,
    pub version: String,
    pub developer: String,
    pub category: String,
    pub install_path: String,
    pub exe_path: Option<String>,
    pub cover: Option<String>,
    pub banner: Option<String>,
    pub icon: Option<String>,
    pub size_bytes: u64,
    pub installed_at: String,
    pub last_played: Option<String>,
    pub play_time_seconds: u64,
    pub is_favorite: bool,
    pub tags: String,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub store_item_id: String,
    pub name: String,
    pub download_url: String,
    pub dest_path: String,
    pub status: String,
    pub progress: f64,
    pub speed_bytes: u64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub error: Option<String>,
    pub created_at: String,
}
