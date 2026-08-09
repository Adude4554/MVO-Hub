use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SensorCategory {
    Cpu,
    Gpu,
    Memory,
    Storage,
    Network,
    Battery,
    Motherboard,
}

impl SensorCategory {
    #[allow(dead_code)]
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "cpu" => Self::Cpu,
            "gpu" => Self::Gpu,
            "memory" => Self::Memory,
            "storage" => Self::Storage,
            "network" => Self::Network,
            "battery" => Self::Battery,
            "motherboard" => Self::Motherboard,
            _ => Self::Cpu,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Cpu => "cpu",
            Self::Gpu => "gpu",
            Self::Memory => "memory",
            Self::Storage => "storage",
            Self::Network => "network",
            Self::Battery => "battery",
            Self::Motherboard => "motherboard",
        }
    }
}

impl fmt::Display for SensorCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Cpu => write!(f, "CPU"),
            Self::Gpu => write!(f, "GPU"),
            Self::Memory => write!(f, "Memory"),
            Self::Storage => write!(f, "Storage"),
            Self::Network => write!(f, "Network"),
            Self::Battery => write!(f, "Battery"),
            Self::Motherboard => write!(f, "Motherboard"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SensorUnit {
    Celsius,
    Fahrenheit,
    Percent,
    Watts,
    MHz,
    GHz,
    Bytes,
    BytesPerSecond,
    Volts,
    RPM,
    Count,
    Seconds,
    RPMs,
}

impl SensorUnit {
    #[allow(dead_code)]
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "celsius" | "°c" => Self::Celsius,
            "fahrenheit" | "°f" => Self::Fahrenheit,
            "percent" | "%" => Self::Percent,
            "watts" | "w" => Self::Watts,
            "mhz" => Self::MHz,
            "ghz" => Self::GHz,
            "bytes" | "b" => Self::Bytes,
            "bytespersecond" | "b/s" | "bytes_per_second" => Self::BytesPerSecond,
            "volts" | "v" => Self::Volts,
            "rpm" => Self::RPM,
            "count" => Self::Count,
            "seconds" | "s" => Self::Seconds,
            "rpms" => Self::RPMs,
            _ => Self::Count,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Celsius => "celsius",
            Self::Fahrenheit => "fahrenheit",
            Self::Percent => "percent",
            Self::Watts => "watts",
            Self::MHz => "mhz",
            Self::GHz => "ghz",
            Self::Bytes => "bytes",
            Self::BytesPerSecond => "bytes_per_second",
            Self::Volts => "volts",
            Self::RPM => "rpm",
            Self::Count => "count",
            Self::Seconds => "seconds",
            Self::RPMs => "rpms",
        }
    }
}

impl fmt::Display for SensorUnit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Celsius => write!(f, "°C"),
            Self::Fahrenheit => write!(f, "°F"),
            Self::Percent => write!(f, "%"),
            Self::Watts => write!(f, "W"),
            Self::MHz => write!(f, "MHz"),
            Self::GHz => write!(f, "GHz"),
            Self::Bytes => write!(f, "B"),
            Self::BytesPerSecond => write!(f, "B/s"),
            Self::Volts => write!(f, "V"),
            Self::RPM => write!(f, "RPM"),
            Self::Count => write!(f, ""),
            Self::Seconds => write!(f, "s"),
            Self::RPMs => write!(f, "RPM/s"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SensorStatus {
    Available,
    Unavailable,
    Unsupported,
    Error,
    Initializing,
}

impl fmt::Display for SensorStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Available => write!(f, "Available"),
            Self::Unavailable => write!(f, "Unavailable"),
            Self::Unsupported => write!(f, "Unsupported"),
            Self::Error => write!(f, "Error"),
            Self::Initializing => write!(f, "Initializing"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    pub id: String,
    pub name: String,
    pub category: SensorCategory,
    pub subcategory: String,
    pub value: f64,
    pub unit: SensorUnit,
    pub device_id: String,
    pub device_name: String,
    pub source: String,
    pub timestamp: u64,
    pub status: SensorStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<std::collections::HashMap<String, String>>,
}

impl SensorReading {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        category: SensorCategory,
        subcategory: impl Into<String>,
        unit: SensorUnit,
        device_id: impl Into<String>,
        device_name: impl Into<String>,
        source: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            category,
            subcategory: subcategory.into(),
            value: 0.0,
            unit,
            device_id: device_id.into(),
            device_name: device_name.into(),
            source: source.into(),
            timestamp: now_millis(),
            status: SensorStatus::Initializing,
            metadata: None,
        }
    }

    pub fn available(mut self, value: f64) -> Self {
        self.value = value;
        self.status = SensorStatus::Available;
        self.timestamp = now_millis();
        self
    }

    #[allow(dead_code)]
    pub fn unavailable(mut self) -> Self {
        self.status = SensorStatus::Unavailable;
        self.timestamp = now_millis();
        self
    }

    #[allow(dead_code)]
    pub fn error(mut self) -> Self {
        self.status = SensorStatus::Error;
        self.timestamp = now_millis();
        self
    }

    #[allow(dead_code)]
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        let meta = self.metadata.get_or_insert_with(std::collections::HashMap::new);
        meta.insert(key.into(), value.into());
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub category: SensorCategory,
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub driver_version: Option<String>,
    pub serial: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareSnapshot {
    pub timestamp: u64,
    pub sensors: Vec<SensorReading>,
    pub devices: Vec<DeviceInfo>,
    pub uptime_seconds: u64,
}

impl HardwareSnapshot {
    pub fn new() -> Self {
        Self {
            timestamp: now_millis(),
            sensors: Vec::new(),
            devices: Vec::new(),
            uptime_seconds: 0,
        }
    }

    #[allow(dead_code)]
    pub fn get_sensor(&self, id: &str) -> Option<&SensorReading> {
        self.sensors.iter().find(|s| s.id == id)
    }

    #[allow(dead_code)]
    pub fn get_sensors_by_category(&self, category: SensorCategory) -> Vec<&SensorReading> {
        self.sensors.iter().filter(|s| s.category == category).collect()
    }

    #[allow(dead_code)]
    pub fn get_device(&self, id: &str) -> Option<&DeviceInfo> {
        self.devices.iter().find(|d| d.id == id)
    }
}

pub fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
