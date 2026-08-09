import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '../components/ui';
import { Cpu, MemoryStick, HardDrive, Thermometer, Wifi, Fan, Zap, Activity, AlertTriangle, CheckCircle, RefreshCw, Gauge, Server, Database } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';
import { invoke } from '@tauri-apps/api/core';

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

interface HealthAlert {
  sensor_id: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
}

interface HealthData {
  score: number;
  alerts: HealthAlert[];
  alert_count: number;
}

export const Hardware = React.memo(function Hardware({ hardwareSensors }: any) {
  useLocale();
  const hs = hardwareSensors;
  const [health, setHealth] = useState<HealthData | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>('');

  const fetchHealth = useCallback(async () => {
    try {
      const data = await invoke<HealthData>('get_hardware_health');
      setHealth(data);
    } catch (e) {
      console.error('Failed to fetch health:', e);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await invoke<any[]>('get_hardware_history', { count: 60 });
      setHistoryData(data);
    } catch (e) {
      console.error('Failed to fetch history:', e);
    }
  }, []);

  const fetchRecommendations = useCallback(async () => {
    try {
      const data = await invoke<any>('get_hardware_recommendations');
      setRecommendations(data.recommendations || []);
    } catch (e) {
      console.error('Failed to fetch recommendations:', e);
    }
  }, []);

  const saveSnapshot = useCallback(async () => {
    setSaving(true);
    try {
      const result = await invoke<string>('save_hardware_snapshot');
      setLastSaved(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Failed to save snapshot:', e);
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchHistory();
    fetchRecommendations();
    const interval = setInterval(() => {
      fetchHealth();
      fetchHistory();
      fetchRecommendations();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchHealth, fetchHistory, fetchRecommendations]);

  const cpuPercent = hs?.cpuUsage ?? 0;
  const memPercent = hs?.memTotal > 0 ? (hs.memUsed / hs.memTotal) * 100 : 0;
  const gpuPercent = hs?.gpuUsage ?? 0;
  const gpuTemp = hs?.gpuTemperature ?? 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-400/10';
      case 'warning': return 'text-amber-400 bg-amber-400/10';
      case 'info': return 'text-blue-400 bg-blue-400/10';
      default: return 'text-mvo-textDim bg-mvo-bg';
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-cyan-400 to-green-500 bg-clip-text text-transparent">Hardware Monitor</h1>
          <p className="text-mvo-textDim mt-1">Real-time sensor data from NVML, sysinfo & WMI</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveSnapshot}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            Save Snapshot
          </button>
          {lastSaved && <span className="text-xs text-mvo-textDim">Last saved: {lastSaved}</span>}
        </div>
      </div>

      {/* Health Score */}
      {health && (
        <GlassCard className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`text-5xl font-bold font-mono ${getScoreColor(health.score)}`}>
                {health.score}
              </div>
              <div>
                <div className="text-lg font-semibold text-mvo-text">System Health Score</div>
                <div className="text-sm text-mvo-textDim">
                  {health.alert_count > 0 ? `${health.alert_count} alert${health.alert_count > 1 ? 's' : ''} detected` : 'All systems nominal'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {health.score >= 80 ? (
                <CheckCircle className="w-8 h-8 text-green-400" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              )}
            </div>
          </div>

          {health.alerts.length > 0 && (
            <div className="mt-4 space-y-2">
              {health.alerts.map((alert, i) => (
                <div key={i} className={`flex items-center gap-3 p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">{alert.message}</span>
                  <span className="ml-auto text-xs font-mono">{alert.value.toFixed(1)} / {alert.threshold}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Main Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <span className="font-semibold text-sm">CPU</span>
          </div>
          <div className="text-3xl font-bold font-mono text-cyan-400">{cpuPercent.toFixed(1)}%</div>
          <div className="text-xs text-mvo-textDim mt-1">{hs?.cpuDevice?.name || 'Unknown'}</div>
          <div className="h-2 bg-mvo-bg rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 rounded-full transition-all duration-300" style={{ width: `${cpuPercent}%` }} />
          </div>
          <div className="flex justify-between text-xs text-mvo-textDim mt-2">
            <span>{hs?.cpuCoresPhysical || '?'}C / {hs?.cpuCoresLogical || '?'}T</span>
            <span>{hs?.cpuFrequency ? `${hs.cpuFrequency.toFixed(0)} MHz` : ''}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <MemoryStick className="w-5 h-5 text-purple-400" />
            <span className="font-semibold text-sm">Memory</span>
          </div>
          <div className="text-3xl font-bold font-mono text-purple-400">{memPercent.toFixed(1)}%</div>
          <div className="text-xs text-mvo-textDim mt-1">{hs?.memTotal ? `${(hs.memUsed / 1e9).toFixed(1)} / ${(hs.memTotal / 1e9).toFixed(1)} GB` : 'N/A'}</div>
          <div className="h-2 bg-mvo-bg rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all duration-300" style={{ width: `${memPercent}%` }} />
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Thermometer className="w-5 h-5 text-green-400" />
            <span className="font-semibold text-sm">GPU</span>
          </div>
          <div className="text-3xl font-bold font-mono text-green-400">{gpuPercent.toFixed(1)}%</div>
          <div className="text-xs text-mvo-textDim mt-1">{hs?.gpuDevice?.name || 'No GPU'}</div>
          <div className="h-2 bg-mvo-bg rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-300" style={{ width: `${gpuPercent}%` }} />
          </div>
          <div className="flex justify-between text-xs text-mvo-textDim mt-2">
            <span>{gpuTemp > 0 ? `${gpuTemp.toFixed(0)}°C` : '--'}</span>
            <span>{hs?.gpuPower ? `${hs.gpuPower.toFixed(0)}W` : '--'}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Wifi className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm">Network</span>
          </div>
          <div className="space-y-1">
            {hs?.networkSpeeds?.slice(0, 2).map((iface: any) => (
              <div key={iface.deviceId} className="flex justify-between text-xs">
                <span className="text-mvo-textDim truncate max-w-[80px]">{iface.name}</span>
                <span className="font-mono text-blue-400">{formatSpeed(iface.receivedRate)} / {formatSpeed(iface.transmittedRate)}</span>
              </div>
            ))}
            {(!hs?.networkSpeeds || hs.networkSpeeds.length === 0) && (
              <div className="text-xs text-mvo-textDim">No active interfaces</div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* GPU Details */}
      {hs?.gpuDevice && (
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-green-400" /> GPU Details</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="glass-strong rounded-lg p-3 text-center">
              <div className="text-xs text-mvo-textDim mb-1">Temperature</div>
              <div className={`text-lg font-bold font-mono ${gpuTemp > 80 ? 'text-red-400' : 'text-green-400'}`}>{gpuTemp > 0 ? `${gpuTemp.toFixed(0)}°C` : '--'}</div>
            </div>
            <div className="glass-strong rounded-lg p-3 text-center">
              <div className="text-xs text-mvo-textDim mb-1">Usage</div>
              <div className="text-lg font-bold font-mono text-green-400">{gpuPercent.toFixed(0)}%</div>
            </div>
            <div className="glass-strong rounded-lg p-3 text-center">
              <div className="text-xs text-mvo-textDim mb-1">VRAM</div>
              <div className="text-lg font-bold font-mono text-mvo-text">{hs.gpuVramTotal ? `${(hs.gpuVramTotal / 1e9).toFixed(1)} GB` : '--'}</div>
            </div>
            <div className="glass-strong rounded-lg p-3 text-center">
              <div className="text-xs text-mvo-textDim mb-1">Power</div>
              <div className="text-lg font-bold font-mono text-mvo-text">{hs.gpuPower ? `${hs.gpuPower.toFixed(0)}W` : '--'}</div>
            </div>
            {hs.gpuFan > 0 && (
              <div className="glass-strong rounded-lg p-3 text-center">
                <div className="text-xs text-mvo-textDim mb-1">Fan</div>
                <div className="text-lg font-bold font-mono text-mvo-text">{hs.gpuFan.toFixed(0)}%</div>
              </div>
            )}
            {hs.gpuClockGraphics > 0 && (
              <div className="glass-strong rounded-lg p-3 text-center">
                <div className="text-xs text-mvo-textDim mb-1">Clock</div>
                <div className="text-lg font-bold font-mono text-mvo-text">{hs.gpuClockGraphics.toFixed(0)} MHz</div>
              </div>
            )}
          </div>
          <div className="mt-3 text-xs text-mvo-textDim">Driver: {hs.gpuDevice.driverVersion || 'N/A'}</div>
        </GlassCard>
      )}

      {/* Per-Core CPU */}
      {hs?.cpuCores && hs.cpuCores.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Cpu className="w-5 h-5 text-cyan-400" /> Per-Core Usage</h3>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {hs.cpuCores.map((core: any) => (
              <div key={core.index} className="glass-strong rounded-lg p-2 text-center">
                <div className="text-[10px] text-mvo-textDim mb-1">C{core.index}</div>
                <div className="h-12 bg-mvo-bg rounded overflow-hidden relative">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-500 to-cyan-400 rounded transition-all duration-300"
                    style={{ height: `${Math.min(core.usage, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] font-mono text-mvo-text mt-1">{core.usage.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Devices */}
      {hs?.devices && hs.devices.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-amber-400" /> Detected Devices</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hs.devices.map((device: any) => (
              <div key={device.id} className="glass-strong rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-mvo-text">{device.name}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-mvo-bg rounded-full text-mvo-textDim">{device.category}</span>
                </div>
                <div className="space-y-1 text-xs text-mvo-textDim">
                  {device.manufacturer && <div>Manufacturer: {device.manufacturer}</div>}
                  {device.model && <div>Model: {device.model}</div>}
                  {device.driverVersion && <div>Driver: {device.driverVersion}</div>}
                  {device.serial && <div>Serial: {device.serial}</div>}
                  <div>Source: {device.source}</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* AI Recommendations */}
      {recommendations.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <span className="text-lg">🤖</span> AI Recommendations
          </h3>
          <div className="space-y-2">
            {recommendations.map((rec: any, i: number) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                rec.severity === 'high' ? 'bg-red-400/10 text-red-400' :
                rec.severity === 'medium' ? 'bg-amber-400/10 text-amber-400' :
                rec.type === 'success' ? 'bg-green-400/10 text-green-400' :
                'bg-blue-400/10 text-blue-400'
              }`}>
                <span className="mt-0.5">
                  {rec.severity === 'high' ? '⚠️' : rec.type === 'success' ? '✅' : '💡'}
                </span>
                <div>
                  <span className="font-semibold text-sm">[{rec.component}]</span>
                  <span className="text-sm ml-2">{rec.message}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* CPU History */}
      <GlassCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-400" /> CPU History (60s)</h3>
        <div className="h-32 flex items-end gap-px">
          {historyData.length > 0 ? historyData.map((snap: any, i: number) => {
            const cpuSensor = snap.sensors?.find((s: any) => s.id === 'cpu.usage');
            const cpuVal = cpuSensor?.value ?? 0;
            return (
              <div key={i} className="flex-1 bg-cyan-400/30 rounded-t transition-all duration-200 hover:bg-cyan-400" style={{ height: `${Math.max(cpuVal, 1)}%` }} title={`${cpuVal.toFixed(1)}%`} />
            );
          }) : (
            <div className="flex-1 flex items-center justify-center text-mvo-textDim text-sm">Collecting data...</div>
          )}
        </div>
      </GlassCard>
    </div>
  );
});
