use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::provider::HardwareProvider;
use crate::hardware::wmi;
use crate::hardware::cpu::temp;
use std::sync::Mutex;
use sysinfo::{Components, System};

pub struct CpuProvider {
    system: System,
    components: Mutex<Components>,
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

        let components = Mutex::new(Components::new_with_refreshed_list());

        let wmi_info = wmi::query_cpu_info();
        let wmi_name = if wmi_info.name.is_empty() { None } else { Some(wmi_info.name.clone()) };

        Self {
            system,
            components,
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

        // CPU temperature: prefer the elevated LibreHardwareMonitor helper
        // (writes %LOCALAPPDATA%\MVO Hub\cpu-temp.json every 2 s). Fall back to
        // the sysinfo ACPI/chassis component when the helper is not running.
        let mut cpu_temps: Vec<(String, String, String, String, String, f64)> = Vec::new();
        let helper_temps = temp::read_cpu_temps();
        if !helper_temps.is_empty() {
            let package = helper_temps.iter()
                .find(|t| t.name.contains("Package") || t.name.contains("Tctl") || t.name.contains("Tdie"))
                .or_else(|| helper_temps.first());
            if let Some(t) = package {
                cpu_temps.push((
                    "cpu.temperature".to_string(),
                    "CPU Temperature".to_string(),
                    "cpu_0".to_string(),
                    self.device_name.clone(),
                    "librehardwaremonitor".to_string(),
                    t.value,
                ));
            }
            for (i, t) in helper_temps.iter().filter(|t| t.name.starts_with("Core")).enumerate() {
                cpu_temps.push((
                    format!("cpu.core.{}.temperature", i),
                    format!("{} Temperature", t.name),
                    format!("cpu_core_{}", i),
                    format!("Core {}", i),
                    "librehardwaremonitor".to_string(),
                    t.value,
                ));
            }
        } else {
            // sysinfo Components fallback (ACPI/chassis zone; may be inaccurate).
            let mut comps = self.components.lock().unwrap_or_else(|e| e.into_inner());
            comps.refresh(true);
            if let Some(comp) = comps.iter().find_map(|c| c.temperature()) {
                cpu_temps.push((
                    "cpu.temperature.approx".to_string(),
                    "CPU Temperature (approx)".to_string(),
                    "cpu_0".to_string(),
                    self.device_name.clone(),
                    "sysinfo".to_string(),
                    comp as f64,
                ));
            }
        }
        for (id, name, device_id, device_name, source, value) in cpu_temps {
            sensors.push(SensorReading::new(
                id, name, SensorCategory::Cpu, "temperature",
                SensorUnit::Celsius, device_id, device_name, source,
            ).available(value));
        }

        sensors
    }
}
