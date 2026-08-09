use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::provider::HardwareProvider;
use crate::hardware::wmi;
use sysinfo::Networks;

pub struct NetworkProvider {
    wmi_adapters: Vec<wmi::WmiNetworkInfo>,
}

impl NetworkProvider {
    pub fn new() -> Self {
        let wmi_adapters = wmi::query_network_adapters();
        Self { wmi_adapters }
    }
}

impl HardwareProvider for NetworkProvider {
    fn name(&self) -> &str { "sysinfo" }

    fn is_available(&self) -> bool { true }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        let networks = Networks::new_with_refreshed_list();
        let mut devices = Vec::new();

        for (name, _) in networks.iter() {
            if name == "lo" || name == "Loopback Pseudo-Interface 1" { continue; }

            let wmi = self.wmi_adapters.iter().find(|a| {
                a.name.to_lowercase().contains(&name.to_lowercase())
                    || name.to_lowercase().contains(&a.name.to_lowercase())
            });

            devices.push(DeviceInfo {
                id: format!("net_{}", name.replace(' ', "_")),
                name: name.clone(),
                category: SensorCategory::Network,
                manufacturer: None,
                model: wmi.map(|a| a.description.clone()),
                driver_version: wmi.map(|a| a.link_speed.clone()),
                serial: wmi.map(|a| a.mac_address.clone()),
                source: "sysinfo+wmi".to_string(),
            });
        }

        devices
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        let networks = Networks::new_with_refreshed_list();
        let mut sensors = Vec::new();

        for (name, data) in networks.iter() {
            if name == "lo" || name == "Loopback Pseudo-Interface 1" { continue; }
            let dev_id = format!("net_{}", name.replace(' ', "_"));

            sensors.push(SensorReading::new(
                format!("{}.received", dev_id), format!("{} Received", name),
                SensorCategory::Network, "traffic", SensorUnit::Bytes,
                &dev_id, name, "sysinfo",
            ).available(data.total_received() as f64));

            sensors.push(SensorReading::new(
                format!("{}.transmitted", dev_id), format!("{} Transmitted", name),
                SensorCategory::Network, "traffic", SensorUnit::Bytes,
                &dev_id, name, "sysinfo",
            ).available(data.total_transmitted() as f64));

            sensors.push(SensorReading::new(
                format!("{}.received_rate", dev_id), format!("{} RX Rate", name),
                SensorCategory::Network, "rate", SensorUnit::BytesPerSecond,
                &dev_id, name, "sysinfo",
            ).available(data.received() as f64));

            sensors.push(SensorReading::new(
                format!("{}.transmitted_rate", dev_id), format!("{} TX Rate", name),
                SensorCategory::Network, "rate", SensorUnit::BytesPerSecond,
                &dev_id, name, "sysinfo",
            ).available(data.transmitted() as f64));

            sensors.push(SensorReading::new(
                format!("{}.received_packets", dev_id), format!("{} RX Packets", name),
                SensorCategory::Network, "packets", SensorUnit::Count,
                &dev_id, name, "sysinfo",
            ).available(data.packets_received() as f64));

            sensors.push(SensorReading::new(
                format!("{}.transmitted_packets", dev_id), format!("{} TX Packets", name),
                SensorCategory::Network, "packets", SensorUnit::Count,
                &dev_id, name, "sysinfo",
            ).available(data.packets_transmitted() as f64));

            let errors = data.errors_on_received() + data.errors_on_transmitted();
            sensors.push(SensorReading::new(
                format!("{}.errors", dev_id), format!("{} Errors", name),
                SensorCategory::Network, "errors", SensorUnit::Count,
                &dev_id, name, "sysinfo",
            ).available(errors as f64));
        }

        sensors
    }
}
