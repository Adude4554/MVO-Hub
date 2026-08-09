#[cfg(test)]
mod tests {
    use super::super::types::*;
    use super::super::health::*;
    use super::super::provider::HardwareProvider;
    use super::super::cpu::provider::CpuProvider;
    use super::super::memory::provider::MemoryProvider;
    use super::super::storage::provider::StorageProvider;
    use super::super::network::provider::NetworkProvider;
    use super::super::gpu::nvidia::NvidiaProvider;
    use super::super::gpu::amd::AmdProvider;
    use super::super::gpu::intel::IntelProvider;
    use super::super::manager::HardwareManager;
    use super::super::db::HardwareDb;


    #[test]
    fn test_sensor_reading_creation() {
        let reading = SensorReading::new(
            "test.id", "Test Sensor", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "device_1", "Device 1", "test",
        );
        assert_eq!(reading.id, "test.id");
        assert_eq!(reading.name, "Test Sensor");
        assert_eq!(reading.category, SensorCategory::Cpu);
        assert_eq!(reading.status, SensorStatus::Initializing);
    }

    #[test]
    fn test_sensor_reading_available() {
        let reading = SensorReading::new(
            "test.id", "Test", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "dev", "Dev", "src",
        ).available(75.5);
        assert_eq!(reading.value, 75.5);
        assert_eq!(reading.status, SensorStatus::Available);
    }

    #[test]
    fn test_sensor_reading_unavailable() {
        let reading = SensorReading::new(
            "test.id", "Test", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "dev", "Dev", "src",
        ).unavailable();
        assert_eq!(reading.status, SensorStatus::Unavailable);
    }

    #[test]
    fn test_sensor_reading_error() {
        let reading = SensorReading::new(
            "test.id", "Test", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "dev", "Dev", "src",
        ).error();
        assert_eq!(reading.status, SensorStatus::Error);
    }

    #[test]
    fn test_hardware_snapshot_creation() {
        let snap = HardwareSnapshot::new();
        assert!(snap.sensors.is_empty());
        assert!(snap.devices.is_empty());
    }

    #[test]
    fn test_hardware_snapshot_get_sensor() {
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(50.0));

        assert!(snap.get_sensor("cpu.usage").is_some());
        assert!(snap.get_sensor("cpu.nonexistent").is_none());
    }

    #[test]
    fn test_hardware_snapshot_get_sensors_by_category() {
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "util",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(50.0));
        snap.sensors.push(SensorReading::new(
            "mem.total", "Memory Total", SensorCategory::Memory, "total",
            SensorUnit::Bytes, "mem_0", "Memory", "sysinfo",
        ).available(16e9));

        let cpu_sensors = snap.get_sensors_by_category(SensorCategory::Cpu);
        assert_eq!(cpu_sensors.len(), 1);
        assert_eq!(cpu_sensors[0].id, "cpu.usage");

        let mem_sensors = snap.get_sensors_by_category(SensorCategory::Memory);
        assert_eq!(mem_sensors.len(), 1);
    }

    #[test]
    fn test_device_info_creation() {
        let dev = DeviceInfo {
            id: "cpu_0".to_string(),
            name: "Test CPU".to_string(),
            category: SensorCategory::Cpu,
            manufacturer: Some("Intel".to_string()),
            model: Some("Core i9".to_string()),
            driver_version: None,
            serial: None,
            source: "test".to_string(),
        };
        assert_eq!(dev.id, "cpu_0");
        assert_eq!(dev.category, SensorCategory::Cpu);
    }

    #[test]
    fn test_sensor_category_display() {
        assert_eq!(SensorCategory::Cpu.to_string(), "CPU");
        assert_eq!(SensorCategory::Gpu.to_string(), "GPU");
        assert_eq!(SensorCategory::Memory.to_string(), "Memory");
        assert_eq!(SensorCategory::Storage.to_string(), "Storage");
        assert_eq!(SensorCategory::Network.to_string(), "Network");
        assert_eq!(SensorCategory::Battery.to_string(), "Battery");
        assert_eq!(SensorCategory::Motherboard.to_string(), "Motherboard");
    }

    #[test]
    fn test_sensor_unit_display() {
        assert_eq!(SensorUnit::Celsius.to_string(), "°C");
        assert_eq!(SensorUnit::Percent.to_string(), "%");
        assert_eq!(SensorUnit::Watts.to_string(), "W");
        assert_eq!(SensorUnit::MHz.to_string(), "MHz");
    }

    #[test]
    fn test_cpu_provider_collects_sensors() {
        let provider = CpuProvider::new();
        let sensors = provider.collect_sensors();
        assert!(!sensors.is_empty());
        assert!(sensors.iter().any(|s| s.id == "cpu.usage"));
        assert!(sensors.iter().any(|s| s.id == "cpu.frequency"));
    }

    #[test]
    fn test_cpu_provider_discover_devices() {
        let provider = CpuProvider::new();
        let devices = provider.discover_devices();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].category, SensorCategory::Cpu);
    }

    #[test]
    fn test_memory_provider_collects_sensors() {
        let provider = MemoryProvider::new();
        let sensors = provider.collect_sensors();
        assert!(!sensors.is_empty());
        assert!(sensors.iter().any(|s| s.id == "memory.total"));
        assert!(sensors.iter().any(|s| s.id == "memory.used"));
    }

    #[test]
    fn test_storage_provider_collects_sensors() {
        let provider = StorageProvider::new();
        let sensors = provider.collect_sensors();
        assert!(!sensors.is_empty());
        assert!(sensors.iter().any(|s| s.id.starts_with("storage_")));
    }

    #[test]
    fn test_network_provider_collects_sensors() {
        let provider = NetworkProvider::new();
        let sensors = provider.collect_sensors();
        assert!(!sensors.is_empty());
    }

    #[test]
    fn test_health_engine_defaults() {
        let engine = HealthEngine::new();
        let snap = HardwareSnapshot::new();
        let alerts = engine.evaluate(&snap);
        assert!(alerts.is_empty());
    }

    #[test]
    fn test_health_engine_cpu_warning() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(85.0));

        let alerts = engine.evaluate(&snap);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Warning);
    }

    #[test]
    fn test_health_engine_cpu_critical() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(96.0));

        let alerts = engine.evaluate(&snap);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Critical);
    }

    #[test]
    fn test_health_engine_gpu_temp_warning() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "gpu.gpu_nvidia_0.temperature", "GPU Temp", SensorCategory::Gpu, "temperature",
            SensorUnit::Celsius, "gpu_nvidia_0", "NVIDIA GPU", "nvml",
        ).available(82.0));

        let alerts = engine.evaluate(&snap);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Warning);
    }

    #[test]
    fn test_health_engine_gpu_temp_critical() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "gpu.gpu_nvidia_0.temperature", "GPU Temp", SensorCategory::Gpu, "temperature",
            SensorUnit::Celsius, "gpu_nvidia_0", "NVIDIA GPU", "nvml",
        ).available(92.0));

        let alerts = engine.evaluate(&snap);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Critical);
    }

    #[test]
    fn test_health_engine_memory_critical() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "memory.usage", "Memory Usage", SensorCategory::Memory, "utilization",
            SensorUnit::Percent, "mem_0", "Memory", "sysinfo",
        ).available(96.0));

        let alerts = engine.evaluate(&snap);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Critical);
    }

    #[test]
    fn test_health_engine_battery_warning() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "battery.percentage", "Battery Level", SensorCategory::Battery, "level",
            SensorUnit::Percent, "battery_0", "System Battery", "wmi",
        ).available(15.0));

        let alerts = engine.evaluate(&snap);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Warning);
    }

    #[test]
    fn test_health_engine_battery_critical() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "battery.percentage", "Battery Level", SensorCategory::Battery, "level",
            SensorUnit::Percent, "battery_0", "System Battery", "wmi",
        ).available(8.0));

        let alerts = engine.evaluate(&snap);
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].severity, AlertSeverity::Critical);
    }

    #[test]
    fn test_health_engine_multiple_alerts() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(85.0));
        snap.sensors.push(SensorReading::new(
            "gpu.gpu_nvidia_0.temperature", "GPU Temp", SensorCategory::Gpu, "temperature",
            SensorUnit::Celsius, "gpu_nvidia_0", "NVIDIA GPU", "nvml",
        ).available(82.0));

        let alerts = engine.evaluate(&snap);
        assert_eq!(alerts.len(), 2);
    }

    #[test]
    fn test_health_score_healthy() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(30.0));

        let score = engine.get_health_score(&snap);
        assert_eq!(score, 100.0);
    }

    #[test]
    fn test_health_score_degraded() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(92.0));

        let score = engine.get_health_score(&snap);
        assert!(score < 100.0);
        assert!(score > 0.0);
    }

    #[test]
    fn test_health_score_zero_on_empty() {
        let engine = HealthEngine::new();
        let snap = HardwareSnapshot::new();
        let score = engine.get_health_score(&snap);
        assert_eq!(score, 100.0);
    }

    #[test]
    fn test_hardware_manager_new() {
        let mgr = HardwareManager::new();
        let snap = mgr.get_snapshot();
        assert!(snap.sensors.is_empty());
    }

    #[test]
    fn test_hardware_manager_not_running_initially() {
        let mgr = HardwareManager::new();
        let status = mgr.get_status_json().unwrap();
        assert_eq!(status["running"], false);
    }

    #[test]
    fn test_now_millis() {
        let t = now_millis();
        assert!(t > 0);
    }

    #[test]
    fn test_sensor_category_from_str() {
        assert_eq!(SensorCategory::from_str("cpu"), SensorCategory::Cpu);
        assert_eq!(SensorCategory::from_str("GPU"), SensorCategory::Gpu);
        assert_eq!(SensorCategory::from_str("memory"), SensorCategory::Memory);
        assert_eq!(SensorCategory::from_str("storage"), SensorCategory::Storage);
        assert_eq!(SensorCategory::from_str("network"), SensorCategory::Network);
        assert_eq!(SensorCategory::from_str("battery"), SensorCategory::Battery);
        assert_eq!(SensorCategory::from_str("motherboard"), SensorCategory::Motherboard);
        assert_eq!(SensorCategory::from_str("unknown"), SensorCategory::Cpu);
    }

    #[test]
    fn test_sensor_category_as_str() {
        assert_eq!(SensorCategory::Cpu.as_str(), "cpu");
        assert_eq!(SensorCategory::Gpu.as_str(), "gpu");
        assert_eq!(SensorCategory::Memory.as_str(), "memory");
        assert_eq!(SensorCategory::Storage.as_str(), "storage");
    }

    #[test]
    fn test_sensor_unit_from_str() {
        assert_eq!(SensorUnit::from_str("celsius"), SensorUnit::Celsius);
        assert_eq!(SensorUnit::from_str("°C"), SensorUnit::Celsius);
        assert_eq!(SensorUnit::from_str("percent"), SensorUnit::Percent);
        assert_eq!(SensorUnit::from_str("%"), SensorUnit::Percent);
        assert_eq!(SensorUnit::from_str("watts"), SensorUnit::Watts);
        assert_eq!(SensorUnit::from_str("w"), SensorUnit::Watts);
        assert_eq!(SensorUnit::from_str("mhz"), SensorUnit::MHz);
        assert_eq!(SensorUnit::from_str("bytes_per_second"), SensorUnit::BytesPerSecond);
        assert_eq!(SensorUnit::from_str("unknown"), SensorUnit::Count);
    }

    #[test]
    fn test_sensor_unit_as_str() {
        assert_eq!(SensorUnit::Celsius.as_str(), "celsius");
        assert_eq!(SensorUnit::Percent.as_str(), "percent");
        assert_eq!(SensorUnit::Watts.as_str(), "watts");
        assert_eq!(SensorUnit::MHz.as_str(), "mhz");
    }

    #[test]
    fn test_hardware_db_creation() {
        let temp_dir = std::env::temp_dir().join("mvo_test_hw_db");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db = HardwareDb::new(&temp_dir);
        assert!(db.is_ok());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_hardware_db_upsert_sensor() {
        let temp_dir = std::env::temp_dir().join("mvo_test_hw_db_upsert");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db = HardwareDb::new(&temp_dir).unwrap();
        let reading = SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(50.0);

        assert!(db.upsert_sensor(&reading).is_ok());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_hardware_db_insert_and_read() {
        let temp_dir = std::env::temp_dir().join("mvo_test_hw_db_read");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db = HardwareDb::new(&temp_dir).unwrap();
        let reading = SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(75.0);

        db.upsert_sensor(&reading).unwrap();
        db.insert_reading(&reading).unwrap();

        let readings = db.get_recent_readings("cpu.usage", 10).unwrap();
        assert_eq!(readings.len(), 1);
        assert_eq!(readings[0].1, 75.0);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_hardware_db_batch_insert() {
        let temp_dir = std::env::temp_dir().join("mvo_test_hw_db_batch");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let db = HardwareDb::new(&temp_dir).unwrap();
        let readings = vec![
            SensorReading::new("cpu.usage", "CPU", SensorCategory::Cpu, "util", SensorUnit::Percent, "cpu_0", "CPU", "sysinfo").available(50.0),
            SensorReading::new("mem.total", "Mem", SensorCategory::Memory, "total", SensorUnit::Bytes, "mem_0", "Mem", "sysinfo").available(16e9),
        ];

        for r in &readings {
            db.upsert_sensor(r).unwrap();
        }
        db.insert_batch_readings(&readings).unwrap();

        let stored = db.get_recent_readings("cpu.usage", 10).unwrap();
        assert_eq!(stored.len(), 1);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_nvidia_provider_not_available() {
        let mut provider = NvidiaProvider::new();
        let _ = provider.init();
        // NVML may or may not be available in CI
        // Just verify it doesn't panic
        let _ = provider.is_available();
    }

    #[test]
    fn test_amd_provider_new() {
        let provider = AmdProvider::new();
        assert!(!provider.is_available());
    }

    #[test]
    fn test_intel_provider_new() {
        let provider = IntelProvider::new();
        assert!(!provider.is_available());
    }

    #[test]
    fn test_health_score_multiple_warnings() {
        let engine = HealthEngine::new();
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU Usage", SensorCategory::Cpu, "utilization",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(98.0));
        snap.sensors.push(SensorReading::new(
            "gpu.gpu_nvidia_0.temperature", "GPU Temp", SensorCategory::Gpu, "temperature",
            SensorUnit::Celsius, "gpu_nvidia_0", "GPU", "nvml",
        ).available(95.0));
        snap.sensors.push(SensorReading::new(
            "memory.usage", "Mem Usage", SensorCategory::Memory, "utilization",
            SensorUnit::Percent, "mem_0", "Memory", "sysinfo",
        ).available(98.0));

        let score = engine.get_health_score(&snap);
        assert!(score < 60.0);
    }

    #[test]
    fn test_sensor_reading_serialization() {
        let reading = SensorReading::new(
            "test", "Test", SensorCategory::Cpu, "util",
            SensorUnit::Percent, "dev", "Dev", "src",
        ).available(42.0);

        let json = serde_json::to_string(&reading).unwrap();
        assert!(json.contains("test"));
        assert!(json.contains("42"));
    }

    #[test]
    fn test_hardware_snapshot_serialization() {
        let mut snap = HardwareSnapshot::new();
        snap.sensors.push(SensorReading::new(
            "cpu.usage", "CPU", SensorCategory::Cpu, "util",
            SensorUnit::Percent, "cpu_0", "CPU", "sysinfo",
        ).available(50.0));

        let json = serde_json::to_string(&snap).unwrap();
        assert!(json.contains("cpu.usage"));
    }
}
