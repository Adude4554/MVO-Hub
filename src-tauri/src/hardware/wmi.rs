use std::process::Command;

#[allow(dead_code)]
pub fn wmi_query(class: &str, fields: &str) -> String {
    match Command::new("WMIC")
        .args(["path", class, "get", fields, "/Format:List"])
        .output()
    {
        Ok(output) => String::from_utf8_lossy(&output.stdout).to_string(),
        Err(_) => String::new(),
    }
}

#[allow(dead_code)]
pub fn wmi_parse_field(line: &str, prefix: &str) -> Option<String> {
    line.strip_prefix(prefix).map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

#[allow(dead_code)]
pub struct WmiCpuInfo {
    pub name: String,
    pub cores: u32,
    pub threads: u32,
    pub max_clock_mhz: u32,
    pub current_clock_mhz: u32,
    pub architecture: String,
    pub l2_cache: String,
    pub l3_cache: String,
}

#[allow(dead_code)]
pub fn query_cpu_info() -> WmiCpuInfo {
    let stdout = wmi_query("Win32_Processor", "Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,CurrentClockSpeed,Architecture,L2CacheSize,L3CacheSize");
    let mut info = WmiCpuInfo {
        name: String::new(),
        cores: 0,
        threads: 0,
        max_clock_mhz: 0,
        current_clock_mhz: 0,
        architecture: String::new(),
        l2_cache: String::new(),
        l3_cache: String::new(),
    };

    for line in stdout.lines() {
        if let Some(v) = wmi_parse_field(line, "Name=") { info.name = v; }
        if let Some(v) = wmi_parse_field(line, "NumberOfCores=") { info.cores = v.parse().unwrap_or(0); }
        if let Some(v) = wmi_parse_field(line, "NumberOfLogicalProcessors=") { info.threads = v.parse().unwrap_or(0); }
        if let Some(v) = wmi_parse_field(line, "MaxClockSpeed=") { info.max_clock_mhz = v.parse().unwrap_or(0); }
        if let Some(v) = wmi_parse_field(line, "CurrentClockSpeed=") { info.current_clock_mhz = v.parse().unwrap_or(0); }
        if let Some(v) = wmi_parse_field(line, "Architecture=") {
            info.architecture = match v.as_str() {
                "0" => "x86".to_string(),
                "9" => "x64".to_string(),
                "12" => "ARM64".to_string(),
                _ => v,
            };
        }
        if let Some(v) = wmi_parse_field(line, "L2CacheSize=") { info.l2_cache = format!("{} KB", v); }
        if let Some(v) = wmi_parse_field(line, "L3CacheSize=") { info.l3_cache = format!("{} KB", v); }
    }

    info
}

#[allow(dead_code)]
pub struct WmiMemoryInfo {
    pub total_capacity_bytes: u64,
    pub speed_mhz: u32,
    pub memory_type: String,
    pub form_factor: String,
    pub manufacturer: String,
    pub device_locator: String,
    pub module_count: u32,
}

#[allow(dead_code)]
pub fn query_memory_modules() -> Vec<WmiMemoryInfo> {
    let stdout = wmi_query("Win32_PhysicalMemory", "Capacity,Speed,MemoryType,FormFactor,Manufacturer,DeviceLocator");
    let mut modules = Vec::new();
    let mut current = WmiMemoryInfo {
        total_capacity_bytes: 0,
        speed_mhz: 0,
        memory_type: String::new(),
        form_factor: String::new(),
        manufacturer: String::new(),
        device_locator: String::new(),
        module_count: 0,
    };

    for line in stdout.lines() {
        if let Some(v) = wmi_parse_field(line, "Capacity=") {
            if current.total_capacity_bytes > 0 {
                modules.push(std::mem::replace(&mut current, WmiMemoryInfo {
                    total_capacity_bytes: 0, speed_mhz: 0, memory_type: String::new(),
                    form_factor: String::new(), manufacturer: String::new(),
                    device_locator: String::new(), module_count: 0,
                }));
            }
            current.total_capacity_bytes = v.parse().unwrap_or(0);
        }
        if let Some(v) = wmi_parse_field(line, "Speed=") { current.speed_mhz = v.parse().unwrap_or(0); }
        if let Some(v) = wmi_parse_field(line, "MemoryType=") {
            current.memory_type = match v.as_str() {
                "20" => "DDR".to_string(),
                "21" => "DDR2".to_string(),
                "24" => "DDR3".to_string(),
                "26" => "DDR4".to_string(),
                "27" => "DDR5".to_string(),
                _ => format!("Type {}", v),
            };
        }
        if let Some(v) = wmi_parse_field(line, "FormFactor=") {
            current.form_factor = match v.as_str() {
                "8" => "DIMM".to_string(),
                "12" => "SODIMM".to_string(),
                _ => format!("Factor {}", v),
            };
        }
        if let Some(v) = wmi_parse_field(line, "Manufacturer=") { current.manufacturer = v; }
        if let Some(v) = wmi_parse_field(line, "DeviceLocator=") { current.device_locator = v; }
    }

    if current.total_capacity_bytes > 0 {
        modules.push(current);
    }

    modules
}

#[allow(dead_code)]
pub struct WmiDiskInfo {
    pub model: String,
    pub interface_type: String,
    pub media_type: String,
    pub size_bytes: u64,
    pub serial: String,
    pub is_ssd: bool,
}

#[allow(dead_code)]
pub fn query_disk_info() -> Vec<WmiDiskInfo> {
    let stdout = wmi_query("Win32_DiskDrive", "Model,InterfaceType,MediaType,Size,SerialNumber");
    let mut disks = Vec::new();
    let mut current = WmiDiskInfo {
        model: String::new(),
        interface_type: String::new(),
        media_type: String::new(),
        size_bytes: 0,
        serial: String::new(),
        is_ssd: false,
    };

    for line in stdout.lines() {
        if let Some(v) = wmi_parse_field(line, "Model=") {
            if !current.model.is_empty() {
                disks.push(std::mem::replace(&mut current, WmiDiskInfo {
                    model: String::new(), interface_type: String::new(), media_type: String::new(),
                    size_bytes: 0, serial: String::new(), is_ssd: false,
                }));
            }
            current.model = v;
        }
        if let Some(v) = wmi_parse_field(line, "InterfaceType=") { current.interface_type = v; }
        if let Some(v) = wmi_parse_field(line, "MediaType=") {
            current.media_type = v.clone();
            current.is_ssd = v.to_lowercase().contains("ssd")
                || v.to_lowercase().contains("solid state")
                || current.interface_type.to_lowercase().contains("nvme");
        }
        if let Some(v) = wmi_parse_field(line, "Size=") { current.size_bytes = v.parse().unwrap_or(0); }
        if let Some(v) = wmi_parse_field(line, "SerialNumber=") { current.serial = v; }
    }

    if !current.model.is_empty() {
        disks.push(current);
    }

    disks
}

#[allow(dead_code)]
pub struct WmiNetworkInfo {
    pub name: String,
    pub description: String,
    pub mac_address: String,
    pub link_speed: String,
    pub connection_status: String,
    pub adapter_type: String,
    pub is_physical: bool,
}

#[allow(dead_code)]
pub fn query_network_adapters() -> Vec<WmiNetworkInfo> {
    let stdout = wmi_query("Win32_NetworkAdapter", "Name,Description,MACAddress,Speed,NetConnectionStatus,AdapterType,PhysicalAdapter");
    let mut adapters = Vec::new();
    let mut current = WmiNetworkInfo {
        name: String::new(),
        description: String::new(),
        mac_address: String::new(),
        link_speed: String::new(),
        connection_status: String::new(),
        adapter_type: String::new(),
        is_physical: false,
    };

    for line in stdout.lines() {
        if let Some(v) = wmi_parse_field(line, "Name=") {
            if !current.name.is_empty() {
                adapters.push(std::mem::replace(&mut current, WmiNetworkInfo {
                    name: String::new(), description: String::new(), mac_address: String::new(),
                    link_speed: String::new(), connection_status: String::new(),
                    adapter_type: String::new(), is_physical: false,
                }));
            }
            current.name = v;
        }
        if let Some(v) = wmi_parse_field(line, "Description=") { current.description = v; }
        if let Some(v) = wmi_parse_field(line, "MACAddress=") { current.mac_address = v; }
        if let Some(v) = wmi_parse_field(line, "Speed=") {
            current.link_speed = v.parse::<u64>().map(|bps| {
                if bps >= 1_000_000_000 { format!("{} Gbps", bps / 1_000_000_000) }
                else if bps >= 1_000_000 { format!("{} Mbps", bps / 1_000_000) }
                else { format!("{} bps", bps) }
            }).unwrap_or_else(|_| v);
        }
        if let Some(v) = wmi_parse_field(line, "NetConnectionStatus=") {
            current.connection_status = match v.as_str() {
                "0" => "Disconnected".to_string(),
                "1" => "Connecting".to_string(),
                "2" => "Connected".to_string(),
                "3" => "Disconnecting".to_string(),
                _ => format!("Status {}", v),
            };
        }
        if let Some(v) = wmi_parse_field(line, "AdapterType=") { current.adapter_type = v; }
        if let Some(v) = wmi_parse_field(line, "PhysicalAdapter=") { current.is_physical = v == "TRUE"; }
    }

    if !current.name.is_empty() {
        adapters.push(current);
    }

    adapters
}
