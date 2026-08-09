use super::manager::HardwareManager;
use super::db::HardwareDb;
use super::health::HealthEngine;
use std::sync::{Arc, Mutex};
use std::sync::OnceLock;

static HW_MANAGER: OnceLock<Arc<Mutex<HardwareManager>>> = OnceLock::new();
static HW_DB: OnceLock<Arc<Mutex<HardwareDb>>> = OnceLock::new();

pub fn hw_manager() -> &'static Arc<Mutex<HardwareManager>> {
    HW_MANAGER.get_or_init(|| Arc::new(Mutex::new(HardwareManager::new())))
}

pub fn hw_db() -> &'static Arc<Mutex<HardwareDb>> {
    HW_DB.get_or_init(|| {
        let data_dir = dirs::data_local_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("MVO-Hub");
        Arc::new(Mutex::new(HardwareDb::new(&data_dir).expect("Failed to init hardware DB")))
    })
}

#[tauri::command]
pub fn start_hardware_monitor(app: tauri::AppHandle) -> Result<String, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    manager.init();
    manager.start(app);
    Ok("MVO Hardware Engine started".to_string())
}

#[tauri::command]
pub fn stop_hardware_monitor() -> Result<String, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    manager.stop();
    Ok("MVO Hardware Engine stopped".to_string())
}

#[tauri::command]
pub fn get_hardware_sensors() -> Result<Vec<serde_json::Value>, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    let snap = manager.get_snapshot();
    let sensors: Vec<serde_json::Value> = snap.sensors.iter()
        .filter_map(|s| serde_json::to_value(s).ok())
        .collect();
    Ok(sensors)
}

#[tauri::command]
pub fn get_hardware_devices() -> Result<Vec<serde_json::Value>, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    let snap = manager.get_snapshot();
    let devices: Vec<serde_json::Value> = snap.devices.iter()
        .filter_map(|d| serde_json::to_value(d).ok())
        .collect();
    Ok(devices)
}

#[tauri::command]
pub fn get_hardware_status() -> Result<serde_json::Value, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    manager.get_status_json()
}

#[tauri::command]
pub fn get_hardware_snapshot() -> Result<serde_json::Value, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    let snap = manager.get_snapshot();
    serde_json::to_value(&snap).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_hardware_history(count: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    manager.get_history_json(count.unwrap_or(60))
}

#[tauri::command]
pub fn get_hardware_history_summary() -> Result<serde_json::Value, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    manager.get_history_summary()
}

#[tauri::command]
pub fn get_hardware_health() -> Result<serde_json::Value, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    let snap = manager.get_snapshot();
    let engine = HealthEngine::new();
    let alerts = engine.evaluate(&snap);
    let score = engine.get_health_score(&snap);
    Ok(serde_json::json!({
        "score": score,
        "alerts": alerts,
        "alert_count": alerts.len(),
    }))
}

#[tauri::command]
pub fn get_hardware_sensor_history(sensor_id: String, count: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let db = hw_db();
    let conn = db.lock().map_err(|e| e.to_string())?;
    let readings = conn.get_recent_readings(&sensor_id, count.unwrap_or(100)).map_err(|e| e.to_string())?;
    Ok(readings.iter().map(|(ts, val)| serde_json::json!({"timestamp": ts, "value": val})).collect())
}

#[tauri::command]
pub fn save_hardware_snapshot() -> Result<String, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    let snap = manager.get_snapshot();
    let db = hw_db();
    let conn = db.lock().map_err(|e| e.to_string())?;
    for reading in &snap.sensors {
        conn.upsert_sensor(reading).map_err(|e| e.to_string())?;
    }
    conn.insert_batch_readings(&snap.sensors).map_err(|e| e.to_string())?;
    Ok(format!("Saved {} sensors", snap.sensors.len()))
}

#[tauri::command]
pub fn cleanup_old_sensor_data(days: Option<i64>) -> Result<usize, String> {
    let db = hw_db();
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.cleanup_old_readings(days.unwrap_or(30)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_hardware_recommendations() -> Result<serde_json::Value, String> {
    let mgr = hw_manager();
    let manager = mgr.lock().map_err(|e| e.to_string())?;
    let snap = manager.get_snapshot();
    let mut recommendations = Vec::new();

    for sensor in &snap.sensors {
        match sensor.id.as_str() {
            id if id.starts_with("cpu.usage") && sensor.value > 90.0 => {
                recommendations.push(serde_json::json!({
                    "type": "warning",
                    "component": "CPU",
                    "message": format!("CPU usage is very high ({:.0}%). Close unnecessary background processes or consider upgrading.", sensor.value),
                    "severity": "high",
                }));
            }
            id if id.starts_with("cpu.usage") && sensor.value > 75.0 => {
                recommendations.push(serde_json::json!({
                    "type": "info",
                    "component": "CPU",
                    "message": format!("CPU usage is elevated ({:.0}%). Monitor for sustained loads.", sensor.value),
                    "severity": "medium",
                }));
            }
            id if id.starts_with("gpu.gpu_nvidia_0.temperature") && sensor.value > 85.0 => {
                recommendations.push(serde_json::json!({
                    "type": "warning",
                    "component": "GPU",
                    "message": format!("GPU temperature is critical ({:.0}°C). Improve case airflow or reduce GPU load.", sensor.value),
                    "severity": "high",
                }));
            }
            id if id.starts_with("gpu.gpu_nvidia_0.temperature") && sensor.value > 75.0 => {
                recommendations.push(serde_json::json!({
                    "type": "info",
                    "component": "GPU",
                    "message": format!("GPU temperature is warm ({:.0}°C). Ensure adequate cooling.", sensor.value),
                    "severity": "medium",
                }));
            }
            id if id.starts_with("gpu.gpu_nvidia_0.power") && sensor.value > 300.0 => {
                recommendations.push(serde_json::json!({
                    "type": "info",
                    "component": "GPU",
                    "message": format!("GPU power draw is high ({:.0}W). Verify PSU capacity is sufficient.", sensor.value),
                    "severity": "medium",
                }));
            }
            id if id.starts_with("memory.usage") && sensor.value > 90.0 => {
                recommendations.push(serde_json::json!({
                    "type": "warning",
                    "component": "Memory",
                    "message": format!("Memory usage is critical ({:.0}%). Close memory-heavy applications or add more RAM.", sensor.value),
                    "severity": "high",
                }));
            }
            id if id.starts_with("memory.usage") && sensor.value > 80.0 => {
                recommendations.push(serde_json::json!({
                    "type": "info",
                    "component": "Memory",
                    "message": format!("Memory usage is high ({:.0}%). Consider closing unused applications.", sensor.value),
                    "severity": "medium",
                }));
            }
            id if id.starts_with("battery.percentage") && sensor.value < 20.0 => {
                recommendations.push(serde_json::json!({
                    "type": "warning",
                    "component": "Battery",
                    "message": format!("Battery is low ({:.0}%). Connect to power source.", sensor.value),
                    "severity": "high",
                }));
            }
            _ => {}
        }
    }

    if recommendations.is_empty() {
        recommendations.push(serde_json::json!({
            "type": "success",
            "component": "System",
            "message": "All hardware metrics are within normal ranges.",
            "severity": "low",
        }));
    }

    Ok(serde_json::json!({
        "recommendations": recommendations,
        "count": recommendations.len(),
        "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,
    }))
}
