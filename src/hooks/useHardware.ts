import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface GpuInfo {
  name: string;
  memory_total?: number;
  driver_version?: string;
  usage?: number;
  temperature?: number;
  power?: number;
}

export interface DiskInfo {
  name: string;
  mount_point: string;
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  is_ssd: boolean;
}

export interface HardwareSnapshot {
  cpu_name: string;
  cpu_cores: number;
  cpu_threads: number;
  gpu?: GpuInfo;
  disks: DiskInfo[];
}

export function useHardware() {
  const [snapshot, setSnapshot] = useState<HardwareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnapshot = useCallback(async () => {
    try {
      const sysInfo = await invoke<any>('get_system_info');
      let gpuInfo: GpuInfo | undefined;
      try {
        const rawGpu = await invoke<any | null>('get_gpu_info');
        if (rawGpu) {
          gpuInfo = {
            name: rawGpu.name || '',
            memory_total: rawGpu.memory_total,
            driver_version: rawGpu.driver_version,
            usage: rawGpu.usage,
            temperature: rawGpu.temperature,
            power: rawGpu.power,
          };
        }
      } catch (e) {
        console.error('GPU fetch failed:', e);
      }
      setSnapshot({
        cpu_name: sysInfo.cpu_name || 'Unknown CPU',
        cpu_cores: sysInfo.cpu_cores || 0,
        cpu_threads: sysInfo.cpu_threads || sysInfo.cpu_cores || 0,
        gpu: gpuInfo,
        disks: sysInfo.disks || [],
      });
    } catch (e) {
      console.error('Hardware fetch failed:', e);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    setLoading(false);
    const interval = setInterval(fetchSnapshot, 5000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  return { snapshot, loading, refresh: fetchSnapshot };
}