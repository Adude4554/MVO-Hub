use crate::hardware::types::{SensorReading, SensorCategory, SensorUnit, DeviceInfo};
use crate::hardware::provider::HardwareProvider;
use crate::hardware::wmi;
use sysinfo::Disks;

pub struct StorageProvider {
    wmi_disks: Vec<wmi::WmiDiskInfo>,
}

impl StorageProvider {
    pub fn new() -> Self {
        let wmi_disks = wmi::query_disk_info();
        Self { wmi_disks }
    }

    fn is_ssd_for_disk(&self, disk_name: &str) -> bool {
        for wmi_disk in &self.wmi_disks {
            if wmi_disk.model.to_lowercase().contains(&disk_name.to_lowercase())
                || disk_name.to_lowercase().contains(&wmi_disk.model.to_lowercase())
            {
                return wmi_disk.is_ssd;
            }
        }
        false
    }

    fn get_wmi_model(&self, disk_name: &str) -> Option<String> {
        for wmi_disk in &self.wmi_disks {
            if wmi_disk.model.to_lowercase().contains(&disk_name.to_lowercase())
                || disk_name.to_lowercase().contains(&wmi_disk.model.to_lowercase())
            {
                return Some(wmi_disk.model.clone());
            }
        }
        None
    }
}

impl HardwareProvider for StorageProvider {
    fn name(&self) -> &str { "sysinfo" }
    fn is_available(&self) -> bool { true }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        let disks_manager = Disks::new_with_refreshed_list();
        disks_manager.list().iter().enumerate().map(|(i, disk)| {
            let name = disk.name().to_string_lossy().to_string();
            let model = self.get_wmi_model(&name);
            DeviceInfo {
                id: format!("storage_{}", i),
                name: model.unwrap_or_else(|| name.clone()),
                category: SensorCategory::Storage,
                manufacturer: None,
                model: Some(name),
                driver_version: None,
                serial: None,
                source: "sysinfo+wmi".to_string(),
            }
        }).collect()
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        let mut sensors = Vec::new();
        let disks_manager = Disks::new_with_refreshed_list();

        for (i, disk) in disks_manager.list().iter().enumerate() {
            let name = disk.name().to_string_lossy().to_string();
            let dev_id = format!("storage_{}", i);

            sensors.push(SensorReading::new(
                format!("{}.total", dev_id), format!("{} Total", name),
                SensorCategory::Storage, "capacity",
                SensorUnit::Bytes, &dev_id, &name, "sysinfo",
            ).available(disk.total_space() as f64));

            sensors.push(SensorReading::new(
                format!("{}.available", dev_id), format!("{} Available", name),
                SensorCategory::Storage, "free",
                SensorUnit::Bytes, &dev_id, &name, "sysinfo",
            ).available(disk.available_space() as f64));

            let used = disk.total_space().saturating_sub(disk.available_space());
            sensors.push(SensorReading::new(
                format!("{}.used", dev_id), format!("{} Used", name),
                SensorCategory::Storage, "used",
                SensorUnit::Bytes, &dev_id, &name, "sysinfo",
            ).available(used as f64));

            let usage_pct = if disk.total_space() > 0 {
                (used as f64 / disk.total_space() as f64) * 100.0
            } else { 0.0 };
            sensors.push(SensorReading::new(
                format!("{}.usage", dev_id), format!("{} Usage", name),
                SensorCategory::Storage, "utilization",
                SensorUnit::Percent, &dev_id, &name, "sysinfo",
            ).available(usage_pct));

            let is_ssd = self.is_ssd_for_disk(&name);
            sensors.push(SensorReading::new(
                format!("{}.is_ssd", dev_id), format!("{} SSD", name),
                SensorCategory::Storage, "info",
                SensorUnit::Count, &dev_id, &name, "wmi",
            ).available(if is_ssd { 1.0 } else { 0.0 }));

            let usage = disk.usage();
            sensors.push(SensorReading::new(
                format!("{}.read", dev_id), format!("{} Read", name),
                SensorCategory::Storage, "traffic",
                SensorUnit::Bytes, &dev_id, &name, "sysinfo",
            ).available(usage.read_bytes as f64));

            sensors.push(SensorReading::new(
                format!("{}.write", dev_id), format!("{} Write", name),
                SensorCategory::Storage, "traffic",
                SensorUnit::Bytes, &dev_id, &name, "sysinfo",
            ).available(usage.written_bytes as f64));
        }

        sensors
    }
}
