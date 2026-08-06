use futures_util::StreamExt;
use sha2::{Sha256, Digest};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use serde_json::json;
use tauri::Emitter;

use super::DownloadItem;

pub struct DownloadManager {
    pub active: Arc<Mutex<HashMap<String, bool>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn download_file(
        &self,
        item: &DownloadItem,
        app_handle: tauri::AppHandle,
    ) -> Result<String, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3600))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client.get(&item.download_url).send().await
            .map_err(|e| format!("Failed to start download: {}", e))?;

        let total_bytes = resp.content_length().unwrap_or(0);

        let dest_path = PathBuf::from(&item.dest_path);
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        {
            let mut active = self.active.lock().map_err(|e| e.to_string())?;
            active.insert(item.id.clone(), true);
        }

        let mut file = std::fs::File::create(&dest_path).map_err(|e| format!("Failed to create file: {}", e))?;
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;
        let mut hasher = Sha256::new();
        let start_time = std::time::Instant::now();
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk) = stream.next().await {
            {
                let active = self.active.lock().map_err(|e| e.to_string())?;
                if let Some(false) = active.get(&item.id) {
                    return Err("Download cancelled".to_string());
                }
            }

            let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
            std::io::Write::write_all(&mut file, &chunk).map_err(|e| e.to_string())?;
            hasher.update(&chunk);
            downloaded += chunk.len() as u64;

            if last_emit.elapsed().as_millis() > 200 {
                let elapsed = start_time.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 { (downloaded as f64 / elapsed) as u64 } else { 0 };
                let progress = if total_bytes > 0 { (downloaded as f64 / total_bytes as f64) * 100.0 } else { 0.0 };

                let _ = app_handle.emit("gv-download-progress", json!({
                    "id": item.id,
                    "progress": (progress * 100.0).round() / 100.0,
                    "speed_bytes": speed,
                    "downloaded_bytes": downloaded,
                    "total_bytes": total_bytes,
                    "status": "downloading",
                }));
                last_emit = std::time::Instant::now();
            }
        }

        drop(file);

        let hash_result = format!("{:x}", hasher.finalize());

        let _ = app_handle.emit("gv-download-progress", json!({
            "id": item.id,
            "progress": 100.0,
            "speed_bytes": 0u64,
            "downloaded_bytes": downloaded,
            "total_bytes": total_bytes,
            "status": "complete",
        }));

        Ok(hash_result)
    }

    pub fn cancel(&self, id: &str) {
        if let Ok(mut active) = self.active.lock() {
            active.insert(id.to_string(), false);
        }
    }
}
