use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Emitter;

use super::types::{HardwareSnapshot, SensorReading, now_millis};
use super::provider::HardwareProvider;
use super::cpu::provider::CpuProvider;
use super::gpu::GpuManager;
use super::memory::provider::MemoryProvider;
use super::storage::provider::StorageProvider;
use super::network::provider::NetworkProvider;
use super::battery::provider::BatteryProvider;
use super::motherboard::provider::MotherboardProvider;

const MAX_HISTORY: usize = 300;

pub struct HardwareManager {
    snapshot: Arc<Mutex<HardwareSnapshot>>,
    history: Arc<Mutex<Vec<HardwareSnapshot>>>,
    running: Arc<Mutex<bool>>,
}

impl HardwareManager {
    pub fn new() -> Self {
        Self {
            snapshot: Arc::new(Mutex::new(HardwareSnapshot::new())),
            history: Arc::new(Mutex::new(Vec::with_capacity(MAX_HISTORY))),
            running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn init(&self) {
        log::info!("HardwareManager initializing providers...");
    }

    pub fn start(&self, app_handle: tauri::AppHandle) {
        let mut running = self.running.lock().unwrap();
        if *running { return; }
        *running = true;
        drop(running);

        let snapshot = Arc::clone(&self.snapshot);
        let history = Arc::clone(&self.history);
        let running = Arc::clone(&self.running);

        thread::spawn(move || {
            loop {
                {
                    let r = running.lock().unwrap();
                    if !*r { break; }
                }

                let mut all_sensors: Vec<SensorReading> = Vec::new();
                let mut all_devices = Vec::new();

                let cpu = CpuProvider::new();
                all_sensors.extend(cpu.collect_sensors());
                all_devices.extend(cpu.discover_devices());

                let mut gpu = GpuManager::new();
                let _ = gpu.init();
                all_sensors.extend(gpu.collect_sensors());
                all_devices.extend(gpu.discover_devices());

                let mem = MemoryProvider::new();
                all_sensors.extend(mem.collect_sensors());
                all_devices.extend(mem.discover_devices());

                let storage = StorageProvider::new();
                all_sensors.extend(storage.collect_sensors());
                all_devices.extend(storage.discover_devices());

                let net = NetworkProvider::new();
                all_sensors.extend(net.collect_sensors());
                all_devices.extend(net.discover_devices());

                let mut bat = BatteryProvider::new();
                if bat.is_available() || bat.init().is_ok() {
                    all_sensors.extend(bat.collect_sensors());
                    all_devices.extend(bat.discover_devices());
                }

                let mut mb = MotherboardProvider::new();
                if mb.is_available() || mb.init().is_ok() {
                    all_sensors.extend(mb.collect_sensors());
                    all_devices.extend(mb.discover_devices());
                }

                let uptime = sysinfo::System::uptime();

                let hw_snapshot = HardwareSnapshot {
                    timestamp: now_millis(),
                    sensors: all_sensors,
                    devices: all_devices,
                    uptime_seconds: uptime,
                };

                if let Ok(mut s) = snapshot.lock() {
                    *s = hw_snapshot.clone();
                }

                if let Ok(mut h) = history.lock() {
                    if h.len() >= MAX_HISTORY {
                        h.remove(0);
                    }
                    h.push(hw_snapshot.clone());
                }

                let _ = app_handle.emit("hardware-sensors-update", &hw_snapshot);

                thread::sleep(Duration::from_secs(1));
            }
        });

        log::info!("HardwareManager background thread started");
    }

    pub fn stop(&self) {
        let mut running = self.running.lock().unwrap();
        *running = false;
    }

    pub fn get_snapshot(&self) -> HardwareSnapshot {
        self.snapshot.lock().unwrap().clone()
    }

    #[allow(dead_code)]
    pub fn get_snapshot_json(&self) -> Result<String, String> {
        let snap = self.get_snapshot();
        serde_json::to_string(&snap).map_err(|e| e.to_string())
    }

    #[allow(dead_code)]
    pub fn get_snapshot_value(&self) -> Result<serde_json::Value, String> {
        let snap = self.get_snapshot();
        serde_json::to_value(&snap).map_err(|e| e.to_string())
    }

    #[allow(dead_code)]
    pub fn get_sensors_json(&self) -> Result<Vec<serde_json::Value>, String> {
        let snap = self.get_snapshot();
        let sensors: Vec<serde_json::Value> = snap.sensors.iter()
            .filter_map(|s| serde_json::to_value(s).ok())
            .collect();
        Ok(sensors)
    }

    #[allow(dead_code)]
    pub fn get_devices_json(&self) -> Result<Vec<serde_json::Value>, String> {
        let snap = self.get_snapshot();
        let devices: Vec<serde_json::Value> = snap.devices.iter()
            .filter_map(|d| serde_json::to_value(d).ok())
            .collect();
        Ok(devices)
    }

    pub fn get_status_json(&self) -> Result<serde_json::Value, String> {
        let snap = self.get_snapshot();
        let running = *self.running.lock().unwrap();

        let mut category_counts: HashMap<String, u32> = HashMap::new();
        for sensor in &snap.sensors {
            *category_counts.entry(sensor.category.to_string()).or_insert(0) += 1;
        }

        Ok(serde_json::json!({
            "running": running,
            "timestamp": snap.timestamp,
            "uptime_seconds": snap.uptime_seconds,
            "sensor_count": snap.sensors.len(),
            "device_count": snap.devices.len(),
            "categories": category_counts,
        }))
    }

    pub fn get_history_json(&self, count: usize) -> Result<Vec<serde_json::Value>, String> {
        let history = self.history.lock().map_err(|e| e.to_string())?;
        let start = history.len().saturating_sub(count);
        let snapshots: Vec<serde_json::Value> = history[start..].iter()
            .filter_map(|s| serde_json::to_value(s).ok())
            .collect();
        Ok(snapshots)
    }

    pub fn get_history_summary(&self) -> Result<serde_json::Value, String> {
        let history = self.history.lock().map_err(|e| e.to_string())?;
        let count = history.len();

        let mut cpu_min = f64::MAX;
        let mut cpu_max = f64::MIN;
        let mut cpu_sum = 0.0;
        let mut gpu_min = f64::MAX;
        let mut gpu_max = f64::MIN;
        let mut gpu_sum = 0.0;
        let mut temp_min = f64::MAX;
        let mut temp_max = f64::MIN;

        for snap in history.iter() {
            for sensor in &snap.sensors {
                if sensor.id == "cpu.usage" {
                    cpu_min = cpu_min.min(sensor.value);
                    cpu_max = cpu_max.max(sensor.value);
                    cpu_sum += sensor.value;
                }
                if sensor.id.starts_with("gpu.gpu_nvidia_0.usage") || sensor.id.starts_with("gpu.gpu_amd_0.usage") {
                    gpu_min = gpu_min.min(sensor.value);
                    gpu_max = gpu_max.max(sensor.value);
                    gpu_sum += sensor.value;
                }
                if sensor.id.contains("temperature") {
                    temp_min = temp_min.min(sensor.value);
                    temp_max = temp_max.max(sensor.value);
                }
            }
        }

        Ok(serde_json::json!({
            "snapshot_count": count,
            "cpu": {
                "min": if cpu_min == f64::MAX { 0.0 } else { cpu_min },
                "max": if cpu_max == f64::MIN { 0.0 } else { cpu_max },
                "avg": if count > 0 { cpu_sum / count as f64 } else { 0.0 },
            },
            "gpu": {
                "min": if gpu_min == f64::MAX { 0.0 } else { gpu_min },
                "max": if gpu_max == f64::MIN { 0.0 } else { gpu_max },
                "avg": if count > 0 { gpu_sum / count as f64 } else { 0.0 },
            },
            "temperature": {
                "min": if temp_min == f64::MAX { 0.0 } else { temp_min },
                "max": if temp_max == f64::MIN { 0.0 } else { temp_max },
            },
        }))
    }
}
