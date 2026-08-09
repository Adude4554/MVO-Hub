use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::provider::HardwareProvider;
use crate::hardware::wmi;
use sysinfo::System;

pub struct CpuProvider {
    system: System,
    device_name: String,
    physical_cores: usize,
    logical_cores: usize,
    wmi_info: Option<wmi::WmiCpuInfo>,
}

impl CpuProvider {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        let cpus = system.cpus();
        let device_name = cpus.first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());
        let logical_cores = cpus.len();
        let physical_cores = System::physical_core_count().unwrap_or(logical_cores);

        let wmi_info = wmi::query_cpu_info();
        let wmi_name = if wmi_info.name.is_empty() { None } else { Some(wmi_info.name.clone()) };

        Self {
            system,
            device_name: wmi_name.unwrap_or(device_name),
            physical_cores,
            logical_cores,
            wmi_info: if wmi_info.name.is_empty() { None } else { Some(wmi_info) },
        }
    }
}

impl HardwareProvider for CpuProvider {
    fn name(&self) -> &str { "sysinfo" }
    fn is_available(&self) -> bool { true }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        vec![DeviceInfo {
            id: "cpu_0".to_string(),
            name: self.device_name.clone(),
            category: SensorCategory::Cpu,
            manufacturer: None,
            model: Some(self.device_name.clone()),
            driver_version: None,
            serial: None,
            source: "sysinfo+wmi".to_string(),
        }]
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        let mut sensors = Vec::new();

        let cpu_usage = self.system.global_cpu_usage();
        sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", &self.device_name, "sysinfo",
        ).available(cpu_usage as f64));

        sensors.push(SensorReading::new(
            "cpu.cores.physical", "Physical Cores", SensorCategory::Cpu, "count",
            SensorUnit::Count, "cpu_0", &self.device_name, "sysinfo",
        ).available(self.physical_cores as f64));

        sensors.push(SensorReading::new(
            "cpu.cores.logical", "Logical Processors", SensorCategory::Cpu, "count",
            SensorUnit::Count, "cpu_0", &self.device_name, "sysinfo",
        ).available(self.logical_cores as f64));

        let freq = self.system.cpus().first().map(|c| c.frequency()).unwrap_or(0);
        sensors.push(SensorReading::new(
            "cpu.frequency", "CPU Frequency", SensorCategory::Cpu, "frequency",
            SensorUnit::MHz, "cpu_0", &self.device_name, "sysinfo",
        ).available(freq as f64));

        if let Some(ref wmi) = self.wmi_info {
            if wmi.max_clock_mhz > 0 {
                sensors.push(SensorReading::new(
                    "cpu.frequency.max", "Max CPU Frequency", SensorCategory::Cpu, "frequency",
                    SensorUnit::MHz, "cpu_0", &self.device_name, "wmi",
                ).available(wmi.max_clock_mhz as f64));
            }
            if wmi.current_clock_mhz > 0 {
                sensors.push(SensorReading::new(
                    "cpu.frequency.current", "Current CPU Frequency", SensorCategory::Cpu, "frequency",
                    SensorUnit::MHz, "cpu_0", &self.device_name, "wmi",
                ).available(wmi.current_clock_mhz as f64));
            }
            if !wmi.architecture.is_empty() {
                sensors.push(SensorReading::new(
                    "cpu.architecture", "CPU Architecture", SensorCategory::Cpu, "info",
                    SensorUnit::Count, "cpu_0", &self.device_name, "wmi",
                ).available(0.0).with_metadata("string_value", &wmi.architecture));
            }
        }

        for (i, cpu) in self.system.cpus().iter().enumerate() {
            sensors.push(SensorReading::new(
                format!("cpu.core.{}.usage", i),
                format!("Core {} Usage", i),
                SensorCategory::Cpu, "utilization",
                SensorUnit::Percent,
                format!("cpu_core_{}", i),
                format!("Core {}", i),
                "sysinfo",
            ).available(cpu.cpu_usage() as f64));

            sensors.push(SensorReading::new(
                format!("cpu.core.{}.frequency", i),
                format!("Core {} Frequency", i),
                SensorCategory::Cpu, "frequency",
                SensorUnit::MHz,
                format!("cpu_core_{}", i),
                format!("Core {}", i),
                "sysinfo",
            ).available(cpu.frequency() as f64));
        }

        sensors
    }
}
