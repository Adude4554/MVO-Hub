import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface PerformanceSnapshot {
  cpu_usage: number;
  total_memory: number;
  used_memory: number;
  total_storage: number;
  used_storage: number;
  uptime_seconds: number;
  timestamp_ms: number;
}

export function usePerformance() {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await invoke<PerformanceSnapshot>('get_performance_snapshot');
      setSnapshot(data);
      setHistory(prev => [...prev.slice(-59), data]);
    } catch (e) {
      console.error('Performance refresh failed:', e);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await invoke<PerformanceSnapshot[]>('get_hardware_history');
      setHistory(data);
    } catch (e) {
      console.error('History load failed:', e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([refresh(), loadHistory()]).then(() => {
      if (active) setLoading(false);
    });
    const interval = setInterval(refresh, 1000);
    return () => { active = false; clearInterval(interval); };
  }, [refresh, loadHistory]);

  return { snapshot, history, loading, refresh, loadHistory };
}