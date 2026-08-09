use serde::{Deserialize, Serialize};
use super::types::HardwareSnapshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthAlert {
    pub id: String,
    pub severity: AlertSeverity,
    pub category: String,
    pub message: String,
    pub value: f64,
    pub threshold: f64,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertSeverity {
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthThresholds {
    pub cpu_usage_warning: f64,
    pub cpu_usage_critical: f64,
    pub gpu_usage_warning: f64,
    pub gpu_usage_critical: f64,
    pub gpu_temp_warning: f64,
    pub gpu_temp_critical: f64,
    pub memory_usage_warning: f64,
    pub memory_usage_critical: f64,
    pub disk_usage_warning: f64,
    pub disk_usage_critical: f64,
    pub battery_level_warning: f64,
    pub battery_level_critical: f64,
}

impl Default for HealthThresholds {
    fn default() -> Self {
        Self {
            cpu_usage_warning: 80.0,
            cpu_usage_critical: 95.0,
            gpu_usage_warning: 90.0,
            gpu_usage_critical: 99.0,
            gpu_temp_warning: 80.0,
            gpu_temp_critical: 90.0,
            memory_usage_warning: 85.0,
            memory_usage_critical: 95.0,
            disk_usage_warning: 85.0,
            disk_usage_critical: 95.0,
            battery_level_warning: 20.0,
            battery_level_critical: 10.0,
        }
    }
}

pub struct HealthEngine {
    thresholds: HealthThresholds,
}

impl HealthEngine {
    pub fn new() -> Self {
        Self { thresholds: HealthThresholds::default() }
    }

    #[allow(dead_code)]
    pub fn with_thresholds(thresholds: HealthThresholds) -> Self {
        Self { thresholds }
    }

    pub fn evaluate(&self, snapshot: &HardwareSnapshot) -> Vec<HealthAlert> {
        let mut alerts = Vec::new();
        let ts = super::types::now_millis();

        for sensor in &snapshot.sensors {
            if sensor.status != super::types::SensorStatus::Available { continue; }

            match sensor.id.as_str() {
                "cpu.usage" => {
                    if sensor.value >= self.thresholds.cpu_usage_critical {
                        alerts.push(self.make_alert(
                            "cpu_critical", AlertSeverity::Critical, "CPU",
                            format!("CPU usage critical: {:.1}%", sensor.value),
                            sensor.value, self.thresholds.cpu_usage_critical, ts,
                        ));
                    } else if sensor.value >= self.thresholds.cpu_usage_warning {
                        alerts.push(self.make_alert(
                            "cpu_warning", AlertSeverity::Warning, "CPU",
                            format!("CPU usage high: {:.1}%", sensor.value),
                            sensor.value, self.thresholds.cpu_usage_warning, ts,
                        ));
                    }
                }
                id if id.contains("gpu") && id.contains("temperature") => {
                    if sensor.value >= self.thresholds.gpu_temp_critical {
                        alerts.push(self.make_alert(
                            "gpu_temp_critical", AlertSeverity::Critical, "GPU",
                            format!("GPU temperature critical: {:.0}°C", sensor.value),
                            sensor.value, self.thresholds.gpu_temp_critical, ts,
                        ));
                    } else if sensor.value >= self.thresholds.gpu_temp_warning {
                        alerts.push(self.make_alert(
                            "gpu_temp_warning", AlertSeverity::Warning, "GPU",
                            format!("GPU temperature high: {:.0}°C", sensor.value),
                            sensor.value, self.thresholds.gpu_temp_warning, ts,
                        ));
                    }
                }
                id if id.contains("gpu") && id.contains("usage") => {
                    if sensor.value >= self.thresholds.gpu_usage_critical {
                        alerts.push(self.make_alert(
                            "gpu_usage_critical", AlertSeverity::Critical, "GPU",
                            format!("GPU usage critical: {:.1}%", sensor.value),
                            sensor.value, self.thresholds.gpu_usage_critical, ts,
                        ));
                    } else if sensor.value >= self.thresholds.gpu_usage_warning {
                        alerts.push(self.make_alert(
                            "gpu_usage_warning", AlertSeverity::Warning, "GPU",
                            format!("GPU usage high: {:.1}%", sensor.value),
                            sensor.value, self.thresholds.gpu_usage_warning, ts,
                        ));
                    }
                }
                "memory.usage" => {
                    if sensor.value >= self.thresholds.memory_usage_critical {
                        alerts.push(self.make_alert(
                            "mem_critical", AlertSeverity::Critical, "Memory",
                            format!("Memory usage critical: {:.1}%", sensor.value),
                            sensor.value, self.thresholds.memory_usage_critical, ts,
                        ));
                    } else if sensor.value >= self.thresholds.memory_usage_warning {
                        alerts.push(self.make_alert(
                            "mem_warning", AlertSeverity::Warning, "Memory",
                            format!("Memory usage high: {:.1}%", sensor.value),
                            sensor.value, self.thresholds.memory_usage_warning, ts,
                        ));
                    }
                }
                id if id.contains("battery.percentage") => {
                    if sensor.value <= self.thresholds.battery_level_critical {
                        alerts.push(self.make_alert(
                            "batt_critical", AlertSeverity::Critical, "Battery",
                            format!("Battery critical: {:.0}%", sensor.value),
                            sensor.value, self.thresholds.battery_level_critical, ts,
                        ));
                    } else if sensor.value <= self.thresholds.battery_level_warning {
                        alerts.push(self.make_alert(
                            "batt_warning", AlertSeverity::Warning, "Battery",
                            format!("Battery low: {:.0}%", sensor.value),
                            sensor.value, self.thresholds.battery_level_warning, ts,
                        ));
                    }
                }
                _ => {}
            }
        }

        alerts
    }

    pub fn get_health_score(&self, snapshot: &HardwareSnapshot) -> f64 {
        let mut score: f64 = 100.0;

        for sensor in &snapshot.sensors {
            if sensor.status != super::types::SensorStatus::Available { continue; }

            match sensor.id.as_str() {
                "cpu.usage" => {
                    if sensor.value > 90.0 { score -= 15.0; }
                    else if sensor.value > 80.0 { score -= 5.0; }
                    else if sensor.value > 70.0 { score -= 2.0; }
                }
                id if id.contains("gpu") && id.contains("temperature") => {
                    if sensor.value > 90.0 { score -= 20.0; }
                    else if sensor.value > 80.0 { score -= 8.0; }
                    else if sensor.value > 70.0 { score -= 3.0; }
                }
                id if id.contains("gpu") && id.contains("usage") => {
                    if sensor.value > 95.0 { score -= 10.0; }
                    else if sensor.value > 90.0 { score -= 3.0; }
                }
                "memory.usage" => {
                    if sensor.value > 95.0 { score -= 10.0; }
                    else if sensor.value > 85.0 { score -= 3.0; }
                }
                id if id.contains("storage_") && id.ends_with(".usage") => {
                    if sensor.value > 95.0 { score -= 8.0; }
                    else if sensor.value > 85.0 { score -= 3.0; }
                }
                "battery.percentage" => {
                    if sensor.value < 10.0 { score -= 10.0; }
                    else if sensor.value < 20.0 { score -= 3.0; }
                }
                _ => {}
            }
        }

        score.max(0.0)
    }

    fn make_alert(&self, id: &str, severity: AlertSeverity, category: &str, message: String, value: f64, threshold: f64, timestamp: u64) -> HealthAlert {
        HealthAlert {
            id: id.to_string(),
            severity,
            category: category.to_string(),
            message,
            value,
            threshold,
            timestamp,
        }
    }
}
