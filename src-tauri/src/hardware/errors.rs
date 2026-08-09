use std::fmt;

#[derive(Debug)]
#[allow(dead_code)]
pub enum HardwareError {
    ProviderNotFound(String),
    SensorUnavailable(String),
    ApiFailure(String),
    InitializationFailed(String),
    NotSupported(String),
}

impl fmt::Display for HardwareError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ProviderNotFound(p) => write!(f, "Provider not found: {}", p),
            Self::SensorUnavailable(s) => write!(f, "Sensor unavailable: {}", s),
            Self::ApiFailure(e) => write!(f, "API failure: {}", e),
            Self::InitializationFailed(e) => write!(f, "Initialization failed: {}", e),
            Self::NotSupported(e) => write!(f, "Not supported: {}", e),
        }
    }
}

impl std::error::Error for HardwareError {}

impl From<String> for HardwareError {
    fn from(s: String) -> Self {
        Self::ApiFailure(s)
    }
}

impl From<&str> for HardwareError {
    fn from(s: &str) -> Self {
        Self::ApiFailure(s.to_string())
    }
}
