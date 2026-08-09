use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::provider::HardwareProvider;
use crate::hardware::wmi;
use sysinfo::System;

pub struct MemoryProvider {
    system: System,
    wmi_modules: Vec<wmi::WmiMemoryInfo>,
}

impl MemoryProvider {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        let wmi_modules = wmi::query_memory_modules();
        Self { system, wmi_modules }
    }
}

impl HardwareProvider for MemoryProvider {
    fn name(&self) -> &str { "sysinfo" }
    fn is_available(&self) -> bool { true }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        vec![DeviceInfo {
            id: "memory_0".to_string(),
            name: "System Memory".to_string(),
            category: SensorCategory::Memory,
            manufacturer: self.wmi_modules.first().and_then(|m| {
                if m.manufacturer.is_empty() { None } else { Some(m.manufacturer.clone()) }
            }),
            model: Some(format!("{} modules", self.wmi_modules.len())),
            driver_version: None,
            serial: None,
            source: "sysinfo+wmi".to_string(),
        }]
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        let mut sensors = Vec::new();
        let total = self.system.total_memory();
        let used = self.system.used_memory();
        let free = total.saturating_sub(used);

        sensors.push(SensorReading::new(
            "memory.total", "Total Memory", SensorCategory::Memory, "total",
            SensorUnit::Bytes, "memory_0", "System Memory", "sysinfo",
        ).available(total as f64));

        sensors.push(SensorReading::new(
            "memory.used", "Used Memory", SensorCategory::Memory, "used",
            SensorUnit::Bytes, "memory_0", "System Memory", "sysinfo",
        ).available(used as f64));

        sensors.push(SensorReading::new(
            "memory.free", "Free Memory", SensorCategory::Memory, "free",
            SensorUnit::Bytes, "memory_0", "System Memory", "sysinfo",
        ).available(free as f64));

        let usage_pct = if total > 0 { (used as f64 / total as f64) * 100.0 } else { 0.0 };
        sensors.push(SensorReading::new(
            "memory.usage", "Memory Usage", SensorCategory::Memory, "utilization",
            SensorUnit::Percent, "memory_0", "System Memory", "sysinfo",
        ).available(usage_pct));

        if !self.wmi_modules.is_empty() {
            let first = &self.wmi_modules[0];
            if first.speed_mhz > 0 {
                sensors.push(SensorReading::new(
                    "memory.speed", "Memory Speed", SensorCategory::Memory, "frequency",
                    SensorUnit::MHz, "memory_0", "System Memory", "wmi",
                ).available(first.speed_mhz as f64));
            }
            if !first.memory_type.is_empty() {
                sensors.push(SensorReading::new(
                    "memory.type", "Memory Type", SensorCategory::Memory, "info",
                    SensorUnit::Count, "memory_0", "System Memory", "wmi",
                ).available(0.0).with_metadata("string_value", &first.memory_type));
            }
            sensors.push(SensorReading::new(
                "memory.modules", "Memory Modules", SensorCategory::Memory, "count",
                SensorUnit::Count, "memory_0", "System Memory", "wmi",
            ).available(self.wmi_modules.len() as f64));

            for (i, module) in self.wmi_modules.iter().enumerate() {
                if module.total_capacity_bytes > 0 {
                    sensors.push(SensorReading::new(
                        format!("memory.module.{}.capacity", i),
                        format!("Module {} Capacity", i),
                        SensorCategory::Memory, "capacity",
                        SensorUnit::Bytes,
                        format!("memory_module_{}", i),
                        format!("Module {} ({})", i, module.device_locator),
                        "wmi",
                    ).available(module.total_capacity_bytes as f64));
                }
            }
        }

        sensors
    }
}
