use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::errors::HardwareError;
use crate::hardware::provider::HardwareProvider;
use std::process::Command;

pub struct IntelProvider {
    available: bool,
    gpu_name: Option<String>,
    vram_bytes: Option<u64>,
}

impl IntelProvider {
    pub fn new() -> Self {
        Self { available: false, gpu_name: None, vram_bytes: None }
    }
}

impl HardwareProvider for IntelProvider {
    fn name(&self) -> &str { "intel" }
    fn is_available(&self) -> bool { self.available }

    fn init(&mut self) -> Result<(), HardwareError> {
        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = Command::new("WMIC")
                .args(["path", "win32_videocontroller", "get", "Name,AdapterRAM,DriverVersion", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let mut current_name = String::new();
                let mut current_vram: Option<u64> = None;

                for line in stdout.lines() {
                    if let Some(v) = line.strip_prefix("Name=") {
                        current_name = v.trim().to_string();
                    }
                    if let Some(v) = line.strip_prefix("AdapterRAM=") {
                        current_vram = v.trim().parse::<u64>().ok();
                    }

                    if !current_name.is_empty()
                        && (current_name.to_lowercase().contains("intel")
                            || current_name.to_lowercase().contains("uhd")
                            || current_name.to_lowercase().contains("iris"))
                    {
                        self.gpu_name = Some(current_name.clone());
                        self.vram_bytes = current_vram;
                        self.available = true;
                        return Ok(());
                    }
                }
            }
        }
        self.available = false;
        Err(HardwareError::NotSupported("No Intel GPU detected".into()))
    }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        if !self.available { return vec![]; }
        vec![DeviceInfo {
            id: "gpu_intel_0".to_string(),
            name: self.gpu_name.clone().unwrap_or_else(|| "Intel GPU".to_string()),
            category: SensorCategory::Gpu,
            manufacturer: Some("Intel".to_string()),
            model: self.gpu_name.clone(),
            driver_version: None,
            serial: None,
            source: "wmi".to_string(),
        }]
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        if !self.available { return vec![]; }
        let dev_id = "gpu_intel_0";
        let dev_name = self.gpu_name.clone().unwrap_or_else(|| "Intel GPU".to_string());
        let mut sensors = vec![];

        if let Some(vram) = self.vram_bytes {
            sensors.push(SensorReading::new(
                format!("gpu.{}.vram.total", dev_id), "VRAM Total", SensorCategory::Gpu, "memory",
                SensorUnit::Bytes, dev_id, &dev_name, "wmi",
            ).available(vram as f64));
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = Command::new("WMIC")
                .args(["path", "win32_videocontroller", "get", "LoadPercentage", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                for line in stdout.lines() {
                    if let Some(v) = line.strip_prefix("LoadPercentage=") {
                        if let Ok(val) = v.trim().parse::<f64>() {
                            sensors.push(SensorReading::new(
                                format!("gpu.{}.usage", dev_id), "GPU Usage", SensorCategory::Gpu, "utilization",
                                SensorUnit::Percent, dev_id, &dev_name, "wmi",
                            ).available(val));
                        }
                        break;
                    }
                }
            }
        }

        sensors
    }
}
