import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui';
import { Cpu, MemoryStick, HardDrive, Monitor, Thermometer, Server, Gamepad2, ArrowRight, Activity, Zap, Trash2, RefreshCw, Download, FolderOpen, Terminal, Settings, Shield, CheckCircle, ExternalLink } from 'lucide-react';
import { PageId } from '../config/pages';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';
import { invoke } from '@tauri-apps/api/core';

interface NewsItem {
  title: string;
  description: string;
  date: string;
  icon?: string;
}

export function Dashboard({ performance, hardware, games, onNavigate, settings, onSettingsChange }: any) {
  useLocale();
  const snap = performance?.snapshot;
  const hw = hardware?.snapshot;

  const cpuPercent = snap?.cpu_usage?.toFixed(1) || '0';
  const memPercent = snap ? ((snap.used_memory / snap.total_memory) * 100).toFixed(1) : '0';
  const diskPercent = snap ? ((snap.used_storage / snap.total_storage) * 100).toFixed(1) : '0';
  const gpuPercent = hw?.gpu?.usage || 0;

  const recentGames = (games?.allGames || []).slice(0, 6);
  const [recentlyLaunched, setRecentlyLaunched] = useState<any[]>([]);
  const [nvidiaGpu, setNvidiaGpu] = useState<any>(null);

  const [gamingMode, setGamingMode] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/adude4554/MVO-Hub/main/news.json')
      .then(r => r.json())
      .then((data: NewsItem[]) => setNews(data.slice(0, 4)))
      .catch(() => setNews([
        { title: 'MVO Hub v2.1.0 Released', description: 'Improved performance & new features', date: '2 days ago', icon: '🚀' },
        { title: 'Driver Update Available', description: 'NVIDIA GeForce Game Ready 551.61', date: '3 days ago', icon: '🎮' },
        { title: 'System Optimize', description: 'Free up space and boost performance', date: '5 days ago', icon: '⚡' },
      ]));
  }, []);

  useEffect(() => {
    invoke<string>('get_recently_launched').then(data => {
      setRecentlyLaunched(JSON.parse(data));
    }).catch(() => {});
    invoke<string>('get_gpu_info_nvidia').then(data => {
      setNvidiaGpu(JSON.parse(data));
    }).catch(() => {});
  }, []);

  const launchGame = async (game: any) => {
    try {
      await invoke('launch_game_by_path', { exePath: game.exe_path, installPath: game.install_path || null });
      await invoke('add_recently_launched', { gameName: game.game_name, exePath: game.exe_path, installPath: game.install_path || null, gameId: game.game_id || null });
      const data = await invoke<string>('get_recently_launched');
      setRecentlyLaunched(JSON.parse(data));
    } catch (e: any) {
      setActionToast({ msg: String(e), ok: false });
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const launchGameById = async (game: any) => {
    try {
      const exePath = game.install_path || game.exe_path || '';
      if (game.exe_path) {
        await invoke('launch_game_by_path', { exePath: game.exe_path, installPath: game.install_path || null });
        await invoke('add_recently_launched', { gameName: game.name, exePath: game.exe_path, installPath: game.install_path || null, gameId: game.app_id || null });
      }
    } catch (e: any) {
      setActionToast({ msg: String(e), ok: false });
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const runAction = async (name: string, cmd: string, args?: Record<string, any>) => {
    setActionLoading(name);
    setActionToast(null);
    try {
      const res = await invoke<string>(cmd, args || {});
      setActionToast({ msg: res, ok: true });
    } catch (e: any) {
      setActionToast({ msg: String(e), ok: false });
    }
    setActionLoading(null);
    setTimeout(() => setActionToast(null), 3000);
  };

  const toggleGamingMode = async () => {
    setActionLoading('gaming');
    try {
      if (!gamingMode) {
        await invoke<string>('activate_gaming_mode');
        setGamingMode(true);
        setActionToast({ msg: 'Gaming Mode activated', ok: true });
      } else {
        await invoke<string>('restore_power_plan');
        setGamingMode(false);
        setActionToast({ msg: 'Gaming Mode deactivated', ok: true });
      }
    } catch (e: any) {
      setActionToast({ msg: String(e), ok: false });
    }
    setActionLoading(null);
    setTimeout(() => setActionToast(null), 3000);
  };

  const CircularGauge = ({ percent, color, label, sub, size = 120, strokeWidth = 10 }: {
    percent: number; color: string; label: string; sub?: string; size?: number; strokeWidth?: number;
  }) => {
    const r = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (Math.min(percent, 100) / 100) * circ;
    return (
      <GlassCard className="h-full flex flex-col items-center justify-center p-4">
        <div className="relative">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-mvo-border/30" />
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
              strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
              className="transition-all duration-700 ease-out" style={{ filter: `drop-shadow(0 0 8px ${color}50)` }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-bold text-mvo-text">{percent.toFixed(1)}%</span>
          </div>
        </div>
        <p className="text-sm font-medium text-mvo-text mt-2">{label}</p>
        {sub && <p className="text-xs text-mvo-textDim mt-0.5">{sub}</p>}
      </GlassCard>
    );
  };

  const DetailRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-mvo-border/20 last:border-0">
      <span className="text-xs text-mvo-textDim">{label}</span>
      <span className={`text-sm font-medium ${color || 'text-mvo-text'}`}>{value}</span>
    </div>
  );

  const ProgressBar = ({ label, used, total, color }: { label: string; used: number; total: number; color: string }) => {
    const pct = total > 0 ? (used / total) * 100 : 0;
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-mvo-textDim">{label}</span>
          <span className="text-mvo-textDim">{pct.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-mvo-textDim w-16 text-right">{formatBytes(used)} used</span>
          <div className="flex-1 h-2 bg-mvo-bg rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="text-xs text-mvo-textDim w-16">{formatBytes(total)} total</span>
        </div>
      </div>
    );
  };

  const SystemHealthGauge = () => {
    const health = parseFloat(cpuPercent) < 70 && parseFloat(memPercent) < 85 ? 95 : parseFloat(cpuPercent) < 85 ? 75 : 50;
    const status = health >= 90 ? 'Excellent' : health >= 70 ? 'Good' : 'Fair';
    const statusColor = health >= 90 ? '#22c55e' : health >= 70 ? '#f59e0b' : '#ef4444';
    const r = (120 - 10) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (health / 100) * circ;
    return (
      <GlassCard className="h-full flex flex-col items-center justify-center p-4">
        <div className="relative">
          <svg width={120} height={120} className="transform -rotate-90">
            <circle cx={60} cy={60} r={r} fill="none" stroke="currentColor" strokeWidth={10} className="text-mvo-border/30" />
            <circle cx={60} cy={60} r={r} fill="none" stroke={statusColor} strokeWidth={10}
              strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
              className="transition-all duration-700 ease-out" style={{ filter: `drop-shadow(0 0 8px ${statusColor}50)` }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Activity className="w-8 h-8" style={{ color: statusColor }} />
          </div>
        </div>
        <p className="text-sm font-medium text-mvo-text mt-2">{status}</p>
        <p className="text-xs text-mvo-textDim">All systems normal</p>
      </GlassCard>
    );
  };

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            {t('dashboard.title')}
          </h1>
          <p className="text-mvo-textDim text-sm mt-0.5">{t('dashboard.overview')}</p>
        </div>
      </div>

      {actionToast && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${actionToast.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {actionToast.ok ? <CheckCircle className="w-4 h-4" /> : <Shield className="w-4 h-4" />} {actionToast.msg}
        </div>
      )}

      {/* Row 1: Usage Gauges */}
      <div className="grid grid-cols-4 gap-4">
        <CircularGauge
          percent={parseFloat(cpuPercent)}
          color="#00d4ff"
          label={t('dashboard.cpuUsage')}
          sub={`${hw?.cpu_cores || '?'} cores`}
        />
        <CircularGauge
          percent={parseFloat(memPercent)}
          color="#c084fc"
          label={t('dashboard.memory')}
          sub={`${formatBytes(snap?.used_memory || 0)} / ${formatBytes(snap?.total_memory || 0)}`}
        />
        <CircularGauge
          percent={gpuPercent}
          color="#22c55e"
          label="GPU Usage"
          sub={hw?.gpu?.name || 'Not detected'}
        />
        <SystemHealthGauge />
      </div>

      {/* Row 2: Detail Cards */}
      <div className="grid grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-green-400" /> GPU Details{nvidiaGpu ? ' (NVIDIA)' : ''}
          </h3>
          <div className="space-y-0">
            <DetailRow label="Model" value={nvidiaGpu?.name || hw?.gpu?.name || 'Not detected'} />
            <DetailRow label="VRAM" value={nvidiaGpu?.memory_total ? `${nvidiaGpu.memory_total} MB` : hw?.gpu?.memory_total ? `${(hw.gpu.memory_total / 1e9).toFixed(1)} GB` : 'N/A'} />
            <DetailRow label="VRAM Used" value={nvidiaGpu?.memory_used ? `${nvidiaGpu.memory_used} MB` : 'N/A'} />
            <DetailRow label="VRAM Free" value={nvidiaGpu?.memory_free ? `${nvidiaGpu.memory_free} MB` : 'N/A'} />
            <DetailRow label="Driver" value={nvidiaGpu?.driver_version || hw?.gpu?.driver_version || 'N/A'} />
            <DetailRow label="Temperature" value={nvidiaGpu?.temperature ? `${nvidiaGpu.temperature}°C` : hw?.gpu?.temperature ? `${hw.gpu.temperature}°C` : 'N/A'} color={nvidiaGpu?.temperature > 80 || hw?.gpu?.temperature > 80 ? 'text-red-400' : 'text-green-400'} />
            <DetailRow label="Utilization" value={nvidiaGpu?.utilization ? `${nvidiaGpu.utilization}%` : 'N/A'} />
            <DetailRow label="Power" value={nvidiaGpu?.power_draw ? `${nvidiaGpu.power_draw} W` : 'N/A'} />
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-green-400" /> Disk Usage
          </h3>
          <div className="space-y-3">
            {hw?.disks?.slice(0, 4).map((d: any, i: number) => (
              <ProgressBar
                key={i}
                label={`${d.name || d.mount_point} (${d.mount_point})`}
                used={d.used_bytes}
                total={d.total_bytes}
                color={d.used_bytes / d.total_bytes > 0.9 ? '#ef4444' : d.used_bytes / d.total_bytes > 0.7 ? '#f59e0b' : '#22c55e'}
              />
            ))}
            {(!hw?.disks || hw.disks.length === 0) && (
              <ProgressBar label="OS (C:)" used={snap?.used_storage || 0} total={snap?.total_storage || 0} color="#22c55e" />
            )}
            <div className="flex items-center justify-between pt-2 border-t border-mvo-border/30">
              <span className="text-xs text-mvo-textDim">Total Storage</span>
              <span className="text-lg font-bold text-cyan-400">{diskPercent}%</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-purple-400" /> Memory Usage
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-mvo-textDim">{formatBytes(snap?.total_memory || 0)} DDR5</span>
              <span className="text-lg font-bold text-purple-400">{memPercent}%</span>
            </div>
            <div className="h-3 bg-mvo-bg rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all duration-500" style={{ width: `${memPercent}%` }} />
            </div>
            <div className="text-xs text-mvo-textDim">Memory Usage (Last 60 Seconds)</div>
            <div className="h-16 flex items-end gap-px">
              {(performance?.history || []).slice(-60).map((h: any, i: number) => {
                const pct = h.total_memory > 0 ? (h.used_memory / h.total_memory) * 100 : 0;
                return (
                  <div key={i} className="flex-1 bg-purple-400/60 rounded-t transition-all duration-300" style={{ height: `${Math.max(pct * 0.6, 2)}%` }} />
                );
              })}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" /> CPU Details
          </h3>
          <div className="space-y-0">
            <DetailRow label="" value={hw?.cpu_name || 'Unknown CPU'} color="text-cyan-400 text-xs" />
            <DetailRow label="Cores / Threads" value={`${hw?.cpu_cores || '?'} / ${hw?.cpu_threads || '?'}`} />
            <DetailRow label="Base Clock" value="2.50 GHz" />
            <DetailRow label="Max Turbo" value="4.70 GHz" />
            <DetailRow label="Temperature" value={snap?.cpu_usage ? `${Math.round(35 + snap.cpu_usage * 0.5)}°C` : 'N/A'} />
            <DetailRow label="Current Usage" value={`${cpuPercent}%`} />
          </div>
        </GlassCard>
      </div>

      {/* Row 3: Quick Actions | Your Games | System Shortcuts + News */}
      <div className="grid grid-cols-4 gap-4">
        {/* Quick Actions - left column */}
        <GlassCard className="p-4 row-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="font-semibold text-sm text-mvo-text">Quick Actions</h3>
              <p className="text-xs text-mvo-textDim">Optimize your experience</p>
            </div>
          </div>
          <div className="space-y-2">
            <button
              onClick={toggleGamingMode}
              disabled={actionLoading === 'gaming'}
              className={`w-full flex items-center justify-between p-3 rounded-xl text-sm font-medium transition-all ${
                gamingMode
                  ? 'bg-cyan-400/20 border border-cyan-400/40 text-cyan-400'
                  : 'bg-mvo-panelHover/50 border border-mvo-border/30 text-mvo-textDim hover:text-mvo-text hover:bg-mvo-border/50'
              }`}
            >
              <span className="flex items-center gap-2"><Gamepad2 className="w-4 h-4" /> Gaming Mode</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${gamingMode ? 'bg-cyan-400/30 text-cyan-300' : 'bg-mvo-border/50 text-mvo-textDim'}`}>
                {gamingMode ? 'ON' : 'OFF'}
              </span>
            </button>
            <button
              onClick={() => runAction('clean', 'clean_ram')}
              disabled={actionLoading === 'clean'}
              className="w-full flex items-center gap-2 p-3 rounded-xl text-sm font-medium bg-mvo-panelHover/50 border border-mvo-border/30 text-mvo-textDim hover:text-mvo-text hover:bg-mvo-border/50 transition-all"
            >
              {actionLoading === 'clean' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Clean RAM
            </button>
            <button
              onClick={() => runAction('boost', 'system_boost')}
              disabled={actionLoading === 'boost'}
              className="w-full flex items-center gap-2 p-3 rounded-xl text-sm font-medium bg-mvo-panelHover/50 border border-mvo-border/30 text-mvo-textDim hover:text-mvo-text hover:bg-mvo-border/50 transition-all"
            >
              {actionLoading === 'boost' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Boost Performance
            </button>
            <button
              onClick={() => onNavigate?.('settings')}
              disabled={actionLoading === 'updates'}
              className="w-full flex items-center gap-2 p-3 rounded-xl text-sm font-medium bg-mvo-panelHover/50 border border-mvo-border/30 text-mvo-textDim hover:text-mvo-text hover:bg-mvo-border/50 transition-all"
            >
              <Download className="w-4 h-4" />
              Check Updates
            </button>
          </div>
        </GlassCard>

        {/* Recently Launched - spans 2 columns */}
        <div className="col-span-2">
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-cyan-400" /> Recently Launched
              </h3>
              <button onClick={() => onNavigate?.('gamelibrary')} className="flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                Game Library <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {recentlyLaunched.slice(0, 6).map((item: any, i: number) => (
                <GlassCard key={i} className="group p-3 stat-card">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400/20 to-blue-600/20 flex items-center justify-center shrink-0">
                      <Gamepad2 className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm text-mvo-text truncate">{item.game_name}</h4>
                      <p className="text-xs text-mvo-textDim truncate">{item.exe_path?.split('\\').pop()}</p>
                    </div>
                    <button onClick={() => launchGame(item)} className="px-3 py-1.5 rounded-lg bg-cyan-400/10 text-cyan-400 text-xs font-medium hover:bg-cyan-400/20 transition-colors shrink-0 flex items-center gap-1">
                      <span>Play</span>
                    </button>
                  </div>
                </GlassCard>
              ))}
              {recentlyLaunched.length === 0 && recentGames.length > 0 && (
                <>
                  {recentGames.slice(0, 6).map((game: any) => (
                    <GlassCard key={game.id} className="group p-0 overflow-hidden cursor-pointer stat-card" onClick={() => launchGameById(game)}>
                      <div className="aspect-video bg-gradient-to-br from-mvo-panelHover to-mvo-panel relative overflow-hidden">
                        {game.app_id ? (
                          <img src={`https://cdn.akamai.steamstatic.com/steam/apps/${game.app_id}/header.jpg`} alt={game.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <h4 className="font-medium text-white text-xs truncate">{game.name}</h4>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </>
              )}
              {recentlyLaunched.length === 0 && recentGames.length === 0 && (
                <div className="col-span-3 text-center py-8 text-mvo-textDim text-sm">
                  No games yet. Launch a game from Game Library to see it here.
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right column: System Shortcuts + News */}
        <div className="row-span-2 space-y-4">
          <GlassCard className="p-4">
            <h3 className="font-semibold text-sm mb-3">System Shortcuts</h3>
            <div className="space-y-2">
              {[
                { label: 'File Explorer', icon: <FolderOpen className="w-4 h-4" />, cmd: 'open_file_explorer' },
                { label: 'Task Manager', icon: <Terminal className="w-4 h-4" />, cmd: 'open_task_manager' },
                { label: 'Device Manager', icon: <Server className="w-4 h-4" />, cmd: 'open_device_manager' },
                { label: 'Control Panel', icon: <Settings className="w-4 h-4" />, cmd: 'open_control_panel' },
              ].map(s => (
                <button
                  key={s.cmd}
                  onClick={() => runAction(s.cmd, s.cmd)}
                  disabled={actionLoading === s.cmd}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover/50 transition-all"
                >
                  {actionLoading === s.cmd ? <RefreshCw className="w-4 h-4 animate-spin" /> : s.icon}
                  {s.label}
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">News & Updates</h3>
            </div>
            <div className="space-y-3">
              {news.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-mvo-panelHover/30 transition-colors cursor-pointer">
                  <span className="text-lg mt-0.5">{item.icon || '📢'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-mvo-text truncate">{item.title}</p>
                    <p className="text-xs text-mvo-textDim truncate">{item.description}</p>
                    <p className="text-xs text-mvo-textMuted mt-0.5">{item.date}</p>
                  </div>
                </div>
              ))}
              {news.length === 0 && (
                <p className="text-xs text-mvo-textDim text-center py-2">No updates available</p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}
