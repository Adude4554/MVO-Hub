use super::types::{SensorReading, DeviceInfo, HardwareSnapshot};
use super::errors::HardwareError;

#[allow(dead_code)]
pub trait HardwareProvider: Send + Sync {
    fn name(&self) -> &str;

    fn init(&mut self) -> Result<(), HardwareError> { Ok(()) }

    fn discover_devices(&self) -> Vec<DeviceInfo> { Vec::new() }

    fn collect_sensors(&self) -> Vec<SensorReading> { Vec::new() }

    fn is_available(&self) -> bool { true }

    fn snapshot(&self) -> HardwareSnapshot {
        let devices = self.discover_devices();
        let sensors = self.collect_sensors();
        HardwareSnapshot {
            timestamp: super::types::now_millis(),
            sensors,
            devices,
            uptime_seconds: 0,
        }
    }
}
