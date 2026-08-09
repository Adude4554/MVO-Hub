use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::errors::HardwareError;
use crate::hardware::provider::HardwareProvider;
use nvml_wrapper::Nvml;
use nvml_wrapper::enum_wrappers::device::{TemperatureSensor, Clock};

pub struct NvidiaProvider {
    available: bool,
}

impl NvidiaProvider {
    pub fn new() -> Self {
        Self { available: false }
    }
}

impl HardwareProvider for NvidiaProvider {
    fn name(&self) -> &str { "nvml" }
    fn is_available(&self) -> bool { self.available }

    fn init(&mut self) -> Result<(), HardwareError> {
        match Nvml::init() {
            Ok(nvml) => {
                match nvml.device_count() {
                    Ok(count) if count > 0 => {
                        self.available = true;
                        Ok(())
                    }
                    _ => {
                        self.available = false;
                        Err(HardwareError::NotSupported("No NVIDIA GPUs found".into()))
                    }
                }
            }
            Err(e) => {
                self.available = false;
                Err(HardwareError::InitializationFailed(format!("NVML init failed: {}", e)))
            }
        }
    }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        if !self.available { return Vec::new(); }
        let nvml = match Nvml::init() { Ok(n) => n, Err(_) => return Vec::new() };
        let count = nvml.device_count().unwrap_or(0);
        let mut devices = Vec::new();

        for i in 0..count {
            if let Ok(device) = nvml.device_by_index(i) {
                let name = device.name().unwrap_or_else(|_| format!("NVIDIA GPU {}", i));
                let driver = nvml.sys_driver_version().unwrap_or_else(|_| "Unknown".to_string());
                let uuid = device.uuid().map(|u| u.to_string()).ok();

                devices.push(DeviceInfo {
                    id: format!("gpu_nvidia_{}", i),
                    name,
                    category: SensorCategory::Gpu,
                    manufacturer: Some("NVIDIA".to_string()),
                    model: None,
                    driver_version: Some(driver),
                    serial: uuid,
                    source: "nvml".to_string(),
                });
            }
        }
        devices
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        if !self.available { return Vec::new(); }
        let nvml = match Nvml::init() { Ok(n) => n, Err(_) => return Vec::new() };
        let count = nvml.device_count().unwrap_or(0);
        let mut sensors = Vec::new();

        for i in 0..count {
            let device = match nvml.device_by_index(i) { Ok(d) => d, Err(_) => continue };
            let dev_id = format!("gpu_nvidia_{}", i);
            let dev_name = device.name().unwrap_or_else(|_| format!("NVIDIA GPU {}", i));

            if let Ok(util) = device.utilization_rates() {
                sensors.push(SensorReading::new(
                    format!("gpu.{}.usage", dev_id), "GPU Usage", SensorCategory::Gpu, "utilization",
                    SensorUnit::Percent, &dev_id, &dev_name, "nvml",
                ).available(util.gpu as f64));
            }

            if let Ok(mem) = device.memory_info() {
                sensors.push(SensorReading::new(
                    format!("gpu.{}.vram.total", dev_id), "VRAM Total", SensorCategory::Gpu, "memory",
                    SensorUnit::Bytes, &dev_id, &dev_name, "nvml",
                ).available(mem.total as f64));

                sensors.push(SensorReading::new(
                    format!("gpu.{}.vram.used", dev_id), "VRAM Used", SensorCategory::Gpu, "memory",
                    SensorUnit::Bytes, &dev_id, &dev_name, "nvml",
                ).available(mem.used as f64));

                sensors.push(SensorReading::new(
                    format!("gpu.{}.vram.free", dev_id), "VRAM Free", SensorCategory::Gpu, "memory",
                    SensorUnit::Bytes, &dev_id, &dev_name, "nvml",
                ).available(mem.free as f64));

                let usage_pct = if mem.total > 0 { (mem.used as f64 / mem.total as f64) * 100.0 } else { 0.0 };
                sensors.push(SensorReading::new(
                    format!("gpu.{}.vram.usage", dev_id), "VRAM Usage", SensorCategory::Gpu, "utilization",
                    SensorUnit::Percent, &dev_id, &dev_name, "nvml",
                ).available(usage_pct));
            }

            if let Ok(temp) = device.temperature(TemperatureSensor::Gpu) {
                sensors.push(SensorReading::new(
                    format!("gpu.{}.temperature", dev_id), "GPU Temperature", SensorCategory::Gpu, "temperature",
                    SensorUnit::Celsius, &dev_id, &dev_name, "nvml",
                ).available(temp as f64));
            }

            if let Ok(power) = device.power_usage() {
                sensors.push(SensorReading::new(
                    format!("gpu.{}.power", dev_id), "GPU Power", SensorCategory::Gpu, "power",
                    SensorUnit::Watts, &dev_id, &dev_name, "nvml",
                ).available(power as f64 / 1000.0));
            }

            if let Ok(limit) = device.power_management_limit() {
                sensors.push(SensorReading::new(
                    format!("gpu.{}.power_limit", dev_id), "Power Limit", SensorCategory::Gpu, "power",
                    SensorUnit::Watts, &dev_id, &dev_name, "nvml",
                ).available(limit as f64 / 1000.0));
            }

            if let Ok(fan) = device.fan_speed(0) {
                sensors.push(SensorReading::new(
                    format!("gpu.{}.fan", dev_id), "Fan Speed", SensorCategory::Gpu, "fan",
                    SensorUnit::Percent, &dev_id, &dev_name, "nvml",
                ).available(fan as f64));
            }

            if let Ok(clock) = device.clock_info(Clock::Graphics) {
                sensors.push(SensorReading::new(
                    format!("gpu.{}.clock.graphics", dev_id), "Graphics Clock", SensorCategory::Gpu, "frequency",
                    SensorUnit::MHz, &dev_id, &dev_name, "nvml",
                ).available(clock as f64));
            }

            if let Ok(clock) = device.clock_info(Clock::Memory) {
                sensors.push(SensorReading::new(
                    format!("gpu.{}.clock.memory", dev_id), "Memory Clock", SensorCategory::Gpu, "frequency",
                    SensorUnit::MHz, &dev_id, &dev_name, "nvml",
                ).available(clock as f64));
            }
        }
        sensors
    }
}
