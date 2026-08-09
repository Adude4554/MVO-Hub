use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::errors::HardwareError;
use crate::hardware::provider::HardwareProvider;

#[allow(dead_code)]
pub struct BatteryProvider {
    available: bool,
    last_readings: Option<BatteryReadings>,
}

#[allow(dead_code)]
struct BatteryReadings {
    percentage: f64,
    charging: bool,
    ac_power: bool,
    time_to_empty: Option<f64>,
    design_capacity: Option<f64>,
    full_charge_capacity: Option<f64>,
}

impl BatteryProvider {
    pub fn new() -> Self {
        Self { available: false, last_readings: None }
    }
}

impl HardwareProvider for BatteryProvider {
    fn name(&self) -> &str { "battery" }

    fn is_available(&self) -> bool { self.available }

    fn init(&mut self) -> Result<(), HardwareError> {
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            if let Ok(output) = Command::new("WMIC")
                .args(["Path", "Win32_Battery", "Get", "EstimatedChargeRemaining,BatteryStatus,DesignCapacity,FullChargeCapacity", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                if stdout.contains("EstimatedChargeRemaining") {
                    self.available = true;
                    return Ok(());
                }
            }
            self.available = false;
            Err(HardwareError::NotSupported("No battery detected".into()))
        }
        #[cfg(not(target_os = "windows"))]
        {
            self.available = false;
            Err(HardwareError::NotSupported("Battery not supported on this OS".into()))
        }
    }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        if !self.available { return Vec::new(); }
        vec![DeviceInfo {
            id: "battery_0".to_string(),
            name: "System Battery".to_string(),
            category: SensorCategory::Battery,
            manufacturer: None,
            model: None,
            driver_version: None,
            serial: None,
            source: "wmi".to_string(),
        }]
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        if !self.available { return Vec::new(); }

        let mut sensors = Vec::new();

        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            if let Ok(output) = Command::new("WMIC")
                .args(["Path", "Win32_Battery", "Get", "EstimatedChargeRemaining,BatteryStatus,DesignCapacity,FullChargeCapacity", "/Format:List"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let mut percentage = 0.0f64;
                let mut charging = false;
                let mut ac_power = false;
                let mut design_capacity: Option<f64> = None;
                let mut full_charge_capacity: Option<f64> = None;

                for line in stdout.lines() {
                    if let Some(val) = line.strip_prefix("BatteryStatus=") {
                        match val.trim().parse::<u32>() {
                            Ok(1) => { charging = false; ac_power = true; }
                            Ok(2) => { charging = true; ac_power = true; }
                            Ok(3) => { charging = false; ac_power = false; }
                            Ok(6) => { charging = true; ac_power = true; }
                            Ok(7) => { charging = false; ac_power = true; }
                            _ => {}
                        }
                    }
                    if let Some(val) = line.strip_prefix("EstimatedChargeRemaining=") {
                        percentage = val.trim().parse::<f64>().unwrap_or(0.0);
                    }
                    if let Some(val) = line.strip_prefix("DesignCapacity=") {
                        design_capacity = val.trim().parse::<f64>().ok();
                    }
                    if let Some(val) = line.strip_prefix("FullChargeCapacity=") {
                        full_charge_capacity = val.trim().parse::<f64>().ok();
                    }
                }

                sensors.push(SensorReading::new(
                    "battery.percentage", "Battery Level", SensorCategory::Battery, "level",
                    SensorUnit::Percent, "battery_0", "System Battery", "wmi",
                ).available(percentage));

                sensors.push(SensorReading::new(
                    "battery.charging", "Charging", SensorCategory::Battery, "state",
                    SensorUnit::Count, "battery_0", "System Battery", "wmi",
                ).available(if charging { 1.0 } else { 0.0 }));

                sensors.push(SensorReading::new(
                    "battery.ac_power", "AC Power", SensorCategory::Battery, "state",
                    SensorUnit::Count, "battery_0", "System Battery", "wmi",
                ).available(if ac_power { 1.0 } else { 0.0 }));

                if let Some(design) = design_capacity {
                    sensors.push(SensorReading::new(
                        "battery.design_capacity", "Design Capacity", SensorCategory::Battery, "capacity",
                        SensorUnit::Count, "battery_0", "System Battery", "wmi",
                    ).available(design));
                }

                if let (Some(design), Some(full)) = (design_capacity, full_charge_capacity) {
                    let health = if design > 0.0 { (full / design) * 100.0 } else { 0.0 };
                    sensors.push(SensorReading::new(
                        "battery.health", "Battery Health", SensorCategory::Battery, "health",
                        SensorUnit::Percent, "battery_0", "System Battery", "wmi",
                    ).available(health));
                }
            }
        }

        sensors
    }
}
