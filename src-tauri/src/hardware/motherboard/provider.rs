use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::errors::HardwareError;
use crate::hardware::provider::HardwareProvider;
use sysinfo::System;

pub struct MotherboardProvider {
    info: Option<MbInfo>,
}

#[allow(dead_code)]
struct MbInfo {
    manufacturer: String,
    model: String,
    bios_vendor: String,
    bios_version: String,
    bios_date: String,
    os_version: String,
}

impl MotherboardProvider {
    pub fn new() -> Self {
        Self { info: None }
    }
}

impl HardwareProvider for MotherboardProvider {
    fn name(&self) -> &str { "wmi" }

    fn is_available(&self) -> bool { self.info.is_some() }

    fn init(&mut self) -> Result<(), HardwareError> {
        #[cfg(target_os = "windows")]
        {
            let mut manufacturer = String::new();
            let mut model = String::new();
            let mut bios_vendor = String::new();
            let mut bios_version = String::new();
            let mut bios_date = String::new();
            let mut os_version = String::new();

            if let Ok(output) = std::process::Command::new("WMIC")
                .args(["BaseBoard", "Get", "Manufacturer,Product", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                for line in stdout.lines() {
                    if let Some(v) = line.strip_prefix("Manufacturer=") {
                        manufacturer = v.trim().to_string();
                    }
                    if let Some(v) = line.strip_prefix("Product=") {
                        model = v.trim().to_string();
                    }
                }
            }

            if let Ok(output) = std::process::Command::new("WMIC")
                .args(["Bios", "Get", "Manufacturer,SMBIOSBIOSVersion,ReleaseDate", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                for line in stdout.lines() {
                    if let Some(v) = line.strip_prefix("Manufacturer=") {
                        bios_vendor = v.trim().to_string();
                    }
                    if let Some(v) = line.strip_prefix("SMBIOSBIOSVersion=") {
                        bios_version = v.trim().to_string();
                    }
                    if let Some(v) = line.strip_prefix("ReleaseDate=") {
                        bios_date = v.trim().to_string();
                    }
                }
            }

            if let Ok(output) = std::process::Command::new("WMIC")
                .args(["OS", "Get", "Caption", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                for line in stdout.lines() {
                    if let Some(v) = line.strip_prefix("Caption=") {
                        os_version = v.trim().to_string();
                    }
                }
            }

            if !manufacturer.is_empty() || !model.is_empty() {
                self.info = Some(MbInfo {
                    manufacturer, model, bios_vendor, bios_version, bios_date, os_version,
                });
                return Ok(());
            }
        }

        Err(HardwareError::NotSupported("Could not detect motherboard info".into()))
    }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        match &self.info {
            Some(info) => vec![DeviceInfo {
                id: "motherboard_0".to_string(),
                name: format!("{} {}", info.manufacturer, info.model),
                category: SensorCategory::Motherboard,
                manufacturer: Some(info.manufacturer.clone()),
                model: Some(info.model.clone()),
                driver_version: None,
                serial: None,
                source: "wmi".to_string(),
            }],
            None => vec![],
        }
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        let info = match &self.info {
            Some(i) => i,
            None => return vec![],
        };

        let mut sensors = Vec::new();

        sensors.push(SensorReading::new(
            "mb.bios.version", "BIOS Version", SensorCategory::Motherboard, "bios",
            SensorUnit::Count, "motherboard_0", "Motherboard", "wmi",
        ).available(0.0).with_metadata("string_value", &info.bios_version));

        sensors.push(SensorReading::new(
            "mb.bios.vendor", "BIOS Vendor", SensorCategory::Motherboard, "bios",
            SensorUnit::Count, "motherboard_0", "Motherboard", "wmi",
        ).available(0.0).with_metadata("string_value", &info.bios_vendor));

        sensors.push(SensorReading::new(
            "mb.os.version", "OS Version", SensorCategory::Motherboard, "os",
            SensorUnit::Count, "motherboard_0", "Motherboard", "wmi",
        ).available(0.0).with_metadata("string_value", &info.os_version));

        let mut sys = System::new_all();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let process_count = sys.processes().len() as f64;
        sensors.push(SensorReading::new(
            "mb.system.process_count", "Running Processes", SensorCategory::Motherboard, "system",
            SensorUnit::Count, "motherboard_0", "Motherboard", "sysinfo",
        ).available(process_count));

        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = std::process::Command::new("WMIC")
                .args(["OS", "Get", "LastBootUpTime", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                for line in stdout.lines() {
                    if let Some(v) = line.strip_prefix("LastBootUpTime=") {
                        let boot_str = v.trim().to_string();
                        if !boot_str.is_empty() {
                            sensors.push(SensorReading::new(
                                "mb.system.boot_time", "System Boot Time", SensorCategory::Motherboard, "system",
                                SensorUnit::Count, "motherboard_0", "Motherboard", "wmi",
                            ).available(0.0).with_metadata("string_value", &boot_str));
                        }
                        break;
                    }
                }
            }

            if let Ok(output) = std::process::Command::new("WMIC")
                .args(["OS", "Get", "LastBootUpTime", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                for line in stdout.lines() {
                    if let Some(v) = line.strip_prefix("LastBootUpTime=") {
                        let raw = v.trim();
                        if raw.len() >= 14 {
                            let year: i64 = raw[0..4].parse().unwrap_or(0);
                            let month: i64 = raw[4..6].parse().unwrap_or(1);
                            let day: i64 = raw[6..8].parse().unwrap_or(1);
                            let hour: i64 = raw[8..10].parse().unwrap_or(0);
                            let min: i64 = raw[10..12].parse().unwrap_or(0);
                            let sec: i64 = raw[12..14].parse().unwrap_or(0);
                            let boot_epoch = chrono::NaiveDate::from_ymd_opt(year as i32, month as u32, day as u32)
                                .and_then(|d| d.and_hms_opt(hour as u32, min as u32, sec as u32))
                                .and_then(|dt| dt.and_local_timezone(chrono::Local).single())
                                .map(|dt| dt.timestamp() as f64)
                                .unwrap_or(0.0);
                            if boot_epoch > 0.0 {
                                let uptime_secs = chrono::Local::now().timestamp() as f64 - boot_epoch;
                                if uptime_secs > 0.0 {
                                    sensors.push(SensorReading::new(
                                        "mb.system.uptime", "System Uptime", SensorCategory::Motherboard, "system",
                                        SensorUnit::Seconds, "motherboard_0", "Motherboard", "wmi",
                                    ).available(uptime_secs));
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }

        sensors
    }
}
