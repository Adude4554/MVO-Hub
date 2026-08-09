import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface SensorReading {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  value: number;
  unit: string;
  deviceId: string;
  deviceName: string;
  source: string;
  timestamp: number;
  status: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  category: string;
  manufacturer?: string;
  model?: string;
  driverVersion?: string;
  serial?: string;
  source: string;
}

export interface HardwareEngineSnapshot {
  timestamp: number;
  sensors: SensorReading[];
  devices: DeviceInfo[];
  uptimeSeconds: number;
}

export interface HardwareEngineStatus {
  running: boolean;
  timestamp: number;
  uptimeSeconds: number;
  sensorCount: number;
  deviceCount: number;
  categories: Record<string, number>;
}

export interface CpuCore {
  index: number;
  usage: number;
  frequency: number;
}

export interface NetworkSpeed {
  deviceId: string;
  name: string;
  received: number;
  transmitted: number;
  receivedRate: number;
  transmittedRate: number;
}

export function useHardwareSensors() {
  const [snapshot, setSnapshot] = useState<HardwareEngineSnapshot | null>(null);
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [status, setStatus] = useState<HardwareEngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const prevNetworkRef = useRef<Map<string, { received: number; transmitted: number; timestamp: number }>>(new Map());

  const startMonitor = useCallback(async () => {
    try {
      await invoke('start_hardware_monitor');
      setStarted(true);
    } catch (e) {
      console.error('Failed to start hardware monitor:', e);
    }
  }, []);

  const stopMonitor = useCallback(async () => {
    try {
      await invoke('stop_hardware_monitor');
      setStarted(false);
    } catch (e) {
      console.error('Failed to stop hardware monitor:', e);
    }
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await invoke<HardwareEngineSnapshot>('get_hardware_snapshot');
      setSnapshot(data);
      setSensors(data.sensors || []);
      setDevices(data.devices || []);
    } catch (e) {
      console.error('Failed to fetch hardware snapshot:', e);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await invoke<HardwareEngineStatus>('get_hardware_status');
      setStatus(data);
    } catch (e) {
      console.error('Failed to fetch hardware status:', e);
    }
  }, []);

  const fetchSensors = useCallback(async () => {
    try {
      const data = await invoke<SensorReading[]>('get_hardware_sensors');
      setSensors(data);
    } catch (e) {
      console.error('Failed to fetch sensors:', e);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const data = await invoke<DeviceInfo[]>('get_hardware_devices');
      setDevices(data);
    } catch (e) {
      console.error('Failed to fetch devices:', e);
    }
  }, []);

  // Listen for real-time events from Rust background thread
  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      try {
        unlistenRef.current = await listen<HardwareEngineSnapshot>('hardware-sensors-update', (event) => {
          if (!mounted) return;
          setSnapshot(event.payload);
          setSensors(event.payload.sensors || []);
          setDevices(event.payload.devices || []);
        });
      } catch (e) {
        console.error('Failed to listen for hardware events:', e);
      }
    };

    setupListener();

    return () => {
      mounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  // Initial fetch and start monitor on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await startMonitor();
        // Give the background thread a moment to collect first snapshot
        await new Promise(r => setTimeout(r, 500));
        if (!mounted) return;
        await Promise.all([fetchSnapshot(), fetchStatus()]);
      } catch (e) {
        console.error('Hardware init failed:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    // Periodically fetch status (less frequent than sensor events)
    const statusInterval = setInterval(() => {
      if (mounted) fetchStatus();
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(statusInterval);
    };
  }, [startMonitor, fetchSnapshot, fetchStatus]);

  // Helper to get sensor by ID prefix
  const getSensor = useCallback((idPrefix: string): SensorReading | undefined => {
    return sensors.find(s => s.id.startsWith(idPrefix));
  }, [sensors]);

  // Helper to get sensors by category
  const getSensorsByCategory = useCallback((category: string): SensorReading[] => {
    return sensors.filter(s => s.category === category);
  }, [sensors]);

  // Helper to get devices by category
  const getDevicesByCategory = useCallback((category: string): DeviceInfo[] => {
    return devices.filter(d => d.category === category);
  }, [devices]);

  // Convenience accessors for common metrics
  const cpuUsage = getSensor('cpu.usage')?.value ?? 0;
  const cpuFrequency = getSensor('cpu.frequency')?.value ?? 0;
  const cpuCoresPhysical = getSensor('cpu.cores.physical')?.value ?? 0;
  const cpuCoresLogical = getSensor('cpu.cores.logical')?.value ?? 0;

  const gpuUsage = getSensor('gpu.gpu_nvidia_0.usage')?.value ?? 0;
  const gpuTemperature = getSensor('gpu.gpu_nvidia_0.temperature')?.value ?? 0;
  const gpuPower = getSensor('gpu.gpu_nvidia_0.power')?.value ?? 0;
  const gpuVramUsed = getSensor('gpu.gpu_nvidia_0.vram.used')?.value ?? 0;
  const gpuVramTotal = getSensor('gpu.gpu_nvidia_0.vram.total')?.value ?? 0;
  const gpuFan = getSensor('gpu.gpu_nvidia_0.fan')?.value ?? 0;
  const gpuClockGraphics = getSensor('gpu.gpu_nvidia_0.clock.graphics')?.value ?? 0;
  const gpuClockMemory = getSensor('gpu.gpu_nvidia_0.clock.memory')?.value ?? 0;

  const memTotal = getSensor('memory.total')?.value ?? 0;
  const memUsed = getSensor('memory.used')?.value ?? 0;
  const memFree = getSensor('memory.free')?.value ?? 0;

  const batteryLevel = getSensor('battery.percentage')?.value ?? null;
  const batteryCharging = getSensor('battery.charging')?.value ?? null;
  const batteryHealth = getSensor('battery.health')?.value ?? null;

  const networkInterfaces = getDevicesByCategory('network');
  const storageDevices = getDevicesByCategory('storage');

  // Per-core CPU data
  const cpuCores: CpuCore[] = [];
  for (let i = 0; i < (cpuCoresLogical || 64); i++) {
    const usageSensor = sensors.find(s => s.id === `cpu.core.${i}.usage`);
    const freqSensor = sensors.find(s => s.id === `cpu.core.${i}.frequency`);
    if (usageSensor || freqSensor) {
      cpuCores.push({
        index: i,
        usage: usageSensor?.value ?? 0,
        frequency: freqSensor?.value ?? 0,
      });
    }
  }

  // Network speed (bytes/sec rates)
  const networkSpeeds: NetworkSpeed[] = [];
  const now = Date.now();
  for (const iface of networkInterfaces) {
    const receivedSensor = sensors.find(s => s.id === `${iface.id}.received`);
    const transmittedSensor = sensors.find(s => s.id === `${iface.id}.transmitted`);
    const received = receivedSensor?.value ?? 0;
    const transmitted = transmittedSensor?.value ?? 0;

    const prev = prevNetworkRef.current.get(iface.id);
    let receivedRate = 0;
    let transmittedRate = 0;

    if (prev) {
      const elapsed = (now - prev.timestamp) / 1000;
      if (elapsed > 0) {
        receivedRate = Math.max(0, (received - prev.received) / elapsed);
        transmittedRate = Math.max(0, (transmitted - prev.transmitted) / elapsed);
      }
    }

    prevNetworkRef.current.set(iface.id, { received, transmitted, timestamp: now });

    networkSpeeds.push({
      deviceId: iface.id,
      name: iface.name,
      received,
      transmitted,
      receivedRate,
      transmittedRate,
    });
  }

  return {
    // Raw data
    snapshot,
    sensors,
    devices,
    status,
    loading,
    started,

    // Actions
    startMonitor,
    stopMonitor,
    fetchSnapshot,
    fetchStatus,
    fetchSensors,
    fetchDevices,

    // Helpers
    getSensor,
    getSensorsByCategory,
    getDevicesByCategory,

    // Convenience: CPU
    cpuUsage,
    cpuFrequency,
    cpuCoresPhysical,
    cpuCoresLogical,
    cpuCores,
    cpuDevice: getDevicesByCategory('cpu')[0],

    // Convenience: GPU
    gpuUsage,
    gpuTemperature,
    gpuPower,
    gpuVramUsed,
    gpuVramTotal,
    gpuFan,
    gpuClockGraphics,
    gpuClockMemory,
    gpuDevice: getDevicesByCategory('gpu')[0],

    // Convenience: Memory
    memTotal,
    memUsed,
    memFree,
    memUsagePercent: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,

    // Convenience: Battery
    batteryLevel,
    batteryCharging,
    batteryHealth,
    hasBattery: batteryLevel !== null,

    // Convenience: Network & Storage
    networkInterfaces,
    networkSpeeds,
    storageDevices,

    // Convenience: Motherboard
    motherboardDevice: getDevicesByCategory('motherboard')[0],
    biosVersion: getSensor('mb.bios.version')?.value,
    osVersion: getSensor('mb.os.version')?.value,
  };
}
