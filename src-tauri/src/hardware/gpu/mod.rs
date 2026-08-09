pub mod nvidia;
pub mod amd;
pub mod intel;

use crate::hardware::types::{SensorReading, DeviceInfo};
use crate::hardware::provider::HardwareProvider;

pub struct GpuManager {
    providers: Vec<Box<dyn HardwareProvider>>,
}

impl GpuManager {
    pub fn new() -> Self {
        let mut providers: Vec<Box<dyn HardwareProvider>> = Vec::new();

        let mut nv = nvidia::NvidiaProvider::new();
        let _ = nv.init();
        if nv.is_available() {
            providers.push(Box::new(nv));
        }

        let mut amd_prov = amd::AmdProvider::new();
        let _ = amd_prov.init();
        if amd_prov.is_available() {
            providers.push(Box::new(amd_prov));
        }

        let mut intel_prov = intel::IntelProvider::new();
        let _ = intel_prov.init();
        if intel_prov.is_available() {
            providers.push(Box::new(intel_prov));
        }

        Self { providers }
    }
}

impl HardwareProvider for GpuManager {
    fn name(&self) -> &str { "gpu_manager" }

    fn is_available(&self) -> bool { !self.providers.is_empty() }

    fn discover_devices(&self) -> Vec<DeviceInfo> {
        self.providers.iter().flat_map(|p| p.discover_devices()).collect()
    }

    fn collect_sensors(&self) -> Vec<SensorReading> {
        self.providers.iter().flat_map(|p| p.collect_sensors()).collect()
    }
}
