import { useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard } from '../components/ui';
import { RotateCcwIcon, DownloadIcon, UploadIcon, FolderOpenIcon, ShieldIcon, BrainIcon, LayoutDashboardIcon, Loader2, Trash2Icon, SettingsIcon, WrenchIcon, GaugeIcon, PowerIcon, MonitorIcon, HardDriveIcon, NetworkIcon, PuzzleIcon, ChevronDownIcon, ChevronRightIcon, RefreshCwIcon, UserIcon, LogOutIcon, CheckCircleIcon, AlertTriangle, CloudIcon, DatabaseIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { setLocale, type Locale } from '../lib/i18n';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';
import { useUpdater } from '../hooks/useUpdater';
import { grantedPermissions, PERMISSION_CATALOGUE, type LoadedPlugin } from '../sdk/plugin';
import { Building2 as BuildingIcon, Palette as PaletteIcon, SlidersHorizontal as SlidersIcon, KeyRound as KeyIcon, Activity as ActivityIcon } from 'lucide-react';

interface AppSettings {
  theme: string;
  selected_profile: string;
  selected_page: string;
  auto_steam_scan: boolean;
  overlay_before_game: boolean;
  boost_before_game: boolean;
  ai_provider: string;
  ai_base_url: string;
  ai_model: string;
  ai_api_key: string;
  first_run_complete: boolean;
  window_mode: string;
  window_width: number;
  window_height: number;
  sidebar_collapsed: boolean;
  right_panel_open: boolean;
  notifications_enabled: boolean;
  auto_update: boolean;
  language: string;
  hidden_pages: string[];
  dashboard_widgets: any[];
}

function AdvancedSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <GlassCard className="p-0 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-mvo-panelHover/30 transition-colors">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-mvo-text">{title}</h3>
        </div>
        {open ? <ChevronDownIcon className="w-4 h-4 text-mvo-textDim" /> : <ChevronRightIcon className="w-4 h-4 text-mvo-textDim" />}
      </button>
      {open && <div className="px-5 pb-4 divide-y divide-mvo-border/20">{children}</div>}
    </GlassCard>
  );
}

function ActionRow({ label, desc, buttonText, onClick, hasToggle }: { label: string; desc: string; buttonText: string; onClick: (enable?: boolean) => void; hasToggle?: boolean }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-sm text-mvo-text">{label}</p>
        <p className="text-xs text-mvo-textDim">{desc}</p>
      </div>
      <button onClick={handleClick} disabled={loading} className="btn-secondary text-xs px-3 py-1.5 shrink-0">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : buttonText}
      </button>
    </div>
  );
}

function PowerPlanSelector() {
  const [current, setCurrent] = useState('balanced');
  useEffect(() => {
    invoke<string>('get_current_power_plan').then(setCurrent).catch(() => {});
  }, []);
  const plans = [
    { id: 'high', label: 'High Performance', color: 'text-red-400' },
    { id: 'balanced', label: 'Balanced', color: 'text-green-400' },
    { id: 'saver', label: 'Power Saver', color: 'text-blue-400' },
  ];
  return (
    <div className="py-3">
      <p className="font-medium text-sm text-mvo-text mb-1">Power Plan</p>
      <p className="text-xs text-mvo-textDim mb-3">Switch between power plans for performance or battery life</p>
      <div className="flex gap-2">
        {plans.map(p => (
          <button key={p.id} onClick={async () => { await invoke('set_power_plan', { plan: p.id }); setCurrent(p.id); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${current === p.id ? 'bg-cyan-400/20 border-cyan-400/30 ' + p.color : 'bg-mvo-panelHover/30 border-mvo-border/30 text-mvo-textDim hover:text-mvo-text'}`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UpdatesTab() {
  const { updateInfo, downloading: updateDownloading, progress, error: updateError, lastChecked, updaterState, installUpdate, checkForUpdates } = useUpdater();
  const [currentVersion, setCurrentVersion] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const version = await getVersion();
        setCurrentVersion(version);
      } catch (e) {
        console.error('Failed to get version:', e);
        setCurrentVersion('unknown');
      }
    };
    loadVersion();
  }, []);

  const handleCheckForUpdates = async () => {
    setChecking(true);
    try {
      await checkForUpdates();
    } catch (e) {
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current version & check */}
      <GlassCard className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><RefreshCwIcon className="w-5 h-5 text-cyan-400" /> App Updates</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-mvo-bg/50 border border-mvo-border/30">
            <p className="text-[10px] text-mvo-textMuted uppercase tracking-wider mb-1">Current Version</p>
            <p className="font-mono text-sm text-cyan-400">v{currentVersion}</p>
          </div>
          <div className="p-3 rounded-xl bg-mvo-bg/50 border border-mvo-border/30">
            <p className="text-[10px] text-mvo-textMuted uppercase tracking-wider mb-1">Latest Version</p>
            <p className="font-mono text-sm text-mvo-text">
              {updateInfo?.available ? <span className="text-green-400">v{updateInfo.version}</span> : <span className="text-mvo-textMuted">—</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-mvo-textMuted">
            {lastChecked ? <>Last checked: {lastChecked}</> : 'Not checked yet'}
          </div>
          <button onClick={handleCheckForUpdates} disabled={checking} className="btn-secondary text-sm flex items-center gap-2">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
            {checking ? 'Checking...' : 'Check Now'}
          </button>
        </div>

        {/* Status */}
        {!updateInfo?.available && !checking && !updateError && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-400/5 border border-green-400/20">
            <CheckCircleIcon className="w-4 h-4 text-green-400" />
            <p className="text-xs text-green-400">App is up to date</p>
          </div>
        )}
        {updateError && !checking && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-400/5 border border-red-400/20">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400 break-all">{updateError}</p>
          </div>
        )}
        {updateDownloading && updaterState && updaterState !== 'idle' && updaterState !== 'checking' && updaterState !== 'available' && updaterState !== 'completed' && updaterState !== 'error' && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-cyan-400/5 border border-cyan-400/20">
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            <p className="text-xs text-cyan-400">
              {updaterState === 'downloading' && 'Downloading update...'}
              {updaterState === 'verifying' && 'Verifying update integrity...'}
              {updaterState === 'installing' && 'Installing update...'}
            </p>
          </div>
        )}
      </GlassCard>

      {/* Update available */}
      {updateInfo?.available && (
        <GlassCard className="p-5 border-cyan-400/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/20 flex items-center justify-center">
              <DownloadIcon className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <p className="font-medium text-cyan-400">Update v{updateInfo.version} available</p>
              {updateInfo.pub_date && <p className="text-[10px] text-mvo-textMuted">Released: {updateInfo.pub_date}</p>}
              {updateInfo.file_size != null && updateInfo.file_size > 0 && (
                <p className="text-[10px] text-mvo-textMuted">Size: {(updateInfo.file_size / 1024 / 1024).toFixed(1)} MB</p>
              )}
            </div>
          </div>
          {updateInfo.notes && (
            <div className="p-3 rounded-xl bg-mvo-bg/50 border border-mvo-border/30 mb-3">
              <p className="text-[10px] text-mvo-textMuted uppercase tracking-wider mb-1">Release Notes</p>
              <p className="text-xs text-mvo-textDim whitespace-pre-line">{updateInfo.notes}</p>
            </div>
          )}

          {/* Download progress */}
          {updateDownloading && progress && (
            <div className="mb-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-mvo-textDim">
                  {progress.status === 'downloading' ? 'Downloading...' : progress.status === 'installing' ? 'Installing...' : 'Verifying...'}
                </span>
                <span className="text-cyan-400 font-mono">{progress.percent || 0}%</span>
              </div>
              <div className="h-1.5 bg-mvo-bg/50 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all" style={{ width: `${progress.percent || 0}%` }} />
              </div>
            </div>
          )}

          <button onClick={installUpdate} disabled={updateDownloading} className="btn-primary text-sm flex items-center gap-2 w-full justify-center">
            {updateDownloading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {updaterState === 'verifying' ? 'Verifying...' : progress?.status === 'installing' ? 'Installing...' : 'Downloading...'}</>
            ) : (
              <><DownloadIcon className="w-4 h-4" /> Download & Install</>
            )}
          </button>
        </GlassCard>
      )}
    </div>
  );
}

const AVATAR_COLORS = [
  'from-cyan-400 to-blue-600', 'from-purple-400 to-pink-600', 'from-green-400 to-emerald-600',
  'from-orange-400 to-red-600', 'from-yellow-400 to-amber-600', 'from-indigo-400 to-violet-600',
  'from-rose-400 to-fuchsia-600', 'from-teal-400 to-cyan-600',
];
function getAvatarColor(username: string) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = ((h << 5) - h + username.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function AccountTab({ user }: { user?: any }) {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [showPass, setShowPass] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogout = async () => { await invoke('logout'); window.location.reload(); };

  const changePass = async () => {
    try {
      await invoke('change_password', { userId: user.id, oldPassword: oldPass, newPassword: newPass });
      setMsg('Password changed'); setOldPass(''); setNewPass('');
    } catch (e: any) { setMsg(String(e)); }
  };

  const changeEmailAddr = async () => {
    try {
      await invoke('change_email', { userId: user.id, newEmail });
      setMsg('Email changed');
    } catch (e: any) { setMsg(String(e)); }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const path = await invoke<string>('save_avatar', { userId: user.id, avatarData: base64 });
      // Reload page to show new avatar
      window.location.reload();
    };
    reader.readAsDataURL(file);
  };

  const gradient = getAvatarColor(user?.username || 'U');

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><UserIcon className="w-5 h-5 text-cyan-400" /> Profile</h3>
        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden`}>
                  <span className="text-white font-display font-bold text-2xl">{user.username?.[0]?.toUpperCase() || 'U'}</span>
                </div>
                <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-medium">Change</span>
                </div>
              </div>
              <div>
                <p className="font-medium text-mvo-text text-lg">{user.username}</p>
                <p className="text-sm text-mvo-textDim">{user.email}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-mvo-textDim text-sm">No account loaded</p>
        )}
      </GlassCard>

      {msg && (
        <div className="bg-cyan-400/10 border border-cyan-400/30 rounded-xl px-4 py-2 text-sm text-cyan-400">{msg}</div>
      )}

      <GlassCard className="p-5">
        <h3 className="font-semibold mb-3">Change Password</h3>
        <div className="space-y-3">
          <input type={showPass ? 'text' : 'password'} value={oldPass} onChange={e => setOldPass(e.target.value)} placeholder="Current password" className="w-full input" />
          <input type={showPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="New password" className="w-full input" />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="showPass" checked={showPass} onChange={e => setShowPass(e.target.checked)} className="w-4 h-4 accent-cyan-400 rounded" />
            <label htmlFor="showPass" className="text-sm text-mvo-textDim">Show passwords</label>
          </div>
          <button onClick={changePass} disabled={!oldPass || !newPass} className="btn-primary text-sm">Update Password</button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="font-semibold mb-3">Change Email</h3>
        <div className="space-y-3">
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="New email address" className="w-full input" />
          <button onClick={changeEmailAddr} disabled={!newEmail} className="btn-primary text-sm">Update Email</button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <button onClick={handleLogout} className="btn-danger flex items-center gap-2">
          <LogOutIcon className="w-4 h-4" /> Sign Out
        </button>
      </GlassCard>
    </div>
  );
}

function CloudSyncTab({ settings, update }: { settings: any; update: (patch: any) => void }) {
  const [token, setToken] = useState(settings.cloud_sync_token || '');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(settings.cloud_sync_last || '');
  const [gistId, setGistId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (token) {
      invoke<string | null>('sync_get_gist_id', { githubToken: token }).then(id => {
        setGistId(id);
      }).catch(() => {});
    }
  }, [token]);

  const handleExport = async () => {
    if (!token.trim()) { setMsg('Enter a GitHub token first'); setMsgType('error'); return; }
    setSyncing(true); setMsg('');
    try {
      const result = await invoke<string>('sync_export_to_gist', { githubToken: token });
      setMsg(result); setMsgType('success');
      const now = new Date().toISOString();
      setLastSync(now);
      update({ cloud_sync_token: token, cloud_sync_last: now });
    } catch (e: any) {
      setMsg(String(e)); setMsgType('error');
    } finally { setSyncing(false); }
  };

  const handleImport = async () => {
    if (!token.trim()) { setMsg('Enter a GitHub token first'); setMsgType('error'); return; }
    setSyncing(true); setMsg('');
    try {
      const result = await invoke<string>('sync_import_from_gist', { githubToken: token });
      setMsg(result + ' — Restart app to apply'); setMsgType('success');
    } catch (e: any) {
      setMsg(String(e)); setMsgType('error');
    } finally { setSyncing(false); }
  };

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><CloudIcon className="w-5 h-5 text-cyan-400" /> Cloud Sync</h3>
        <p className="text-sm text-mvo-textDim mb-4">Sync your settings, chat history, and preferences across devices using a private GitHub Gist.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-mvo-textDim mb-1">GitHub Personal Access Token</label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} className="w-full input" placeholder="ghp_..." />
            <p className="text-[10px] text-mvo-textDim mt-1">
              Create one at <span className="text-cyan-400">github.com/settings/tokens</span> with <strong>gist</strong> scope
            </p>
          </div>

          {gistId && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-400/5 border border-green-400/20">
              <CheckCircleIcon className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400">Sync gist connected: {gistId.slice(0, 8)}...</span>
            </div>
          )}

          {lastSync && (
            <p className="text-xs text-mvo-textDim">Last synced: {new Date(lastSync).toLocaleString()}</p>
          )}

          {msg && (
            <div className={`p-3 rounded-xl text-sm ${msgType === 'success' ? 'bg-green-400/10 border border-green-400/30 text-green-400' : 'bg-red-400/10 border border-red-400/30 text-red-400'}`}>
              {msg}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleExport} disabled={syncing || !token.trim()} className="btn-primary flex items-center gap-2">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
              {syncing ? 'Syncing...' : 'Upload to Cloud'}
            </button>
            <button onClick={handleImport} disabled={syncing || !token.trim()} className="btn-secondary flex items-center gap-2">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
              {syncing ? 'Syncing...' : 'Download from Cloud'}
            </button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="font-semibold mb-3">What Gets Synced</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-green-400"><CheckCircleIcon className="w-4 h-4" /> Settings & preferences</div>
          <div className="flex items-center gap-2 text-green-400"><CheckCircleIcon className="w-4 h-4" /> AI chat history</div>
          <div className="flex items-center gap-2 text-green-400"><CheckCircleIcon className="w-4 h-4" /> Theme & language</div>
          <div className="flex items-center gap-2 text-green-400"><CheckCircleIcon className="w-4 h-4" /> Dashboard layout</div>
          <div className="flex items-center gap-2 text-mvo-textDim"><AlertTriangle className="w-4 h-4" /> Game install paths (machine-specific)</div>
          <div className="flex items-center gap-2 text-mvo-textDim"><AlertTriangle className="w-4 h-4" /> Download progress (transient)</div>
        </div>
      </GlassCard>
    </div>
  );
}

interface ScannerSettings {
  scan_paths: string[];
  auto_scan: boolean;
  enable_metadata: boolean;
  cache_retention_days: number;
}

// Backend get_scanner_settings returns { scanRoots, excludePaths, autoScanOnLaunch,
// scanType, hideLowConfidence, confidenceThreshold } when scanner_settings.json is
// missing, while the frontend historically expected { scan_paths, auto_scan, ... }.
// Always normalize to the frontend shape so a fresh install cannot crash on
// `settings.scan_paths.map`.
function normalizeScannerSettings(data: unknown): ScannerSettings {
  const d = (data ?? {}) as Record<string, unknown>;
  const scanPaths = Array.isArray(d.scan_paths)
    ? (d.scan_paths as unknown[]).filter((p): p is string => typeof p === 'string')
    : Array.isArray(d.scanRoots)
      ? (d.scanRoots as unknown[]).filter((p): p is string => typeof p === 'string')
      : [];
  return {
    scan_paths: scanPaths,
    auto_scan: typeof d.auto_scan === 'boolean'
      ? d.auto_scan
      : typeof d.autoScanOnLaunch === 'boolean' ? d.autoScanOnLaunch : true,
    enable_metadata: typeof d.enable_metadata === 'boolean' ? d.enable_metadata : true,
    cache_retention_days: typeof d.cache_retention_days === 'number' ? d.cache_retention_days : 7,
  };
}

function ScannerSettingsTab() {
  const [settings, setSettings] = useState<ScannerSettings>({ scan_paths: [], auto_scan: true, enable_metadata: true, cache_retention_days: 7 });
  const [saving, setSaving] = useState(false);
  const [newPath, setNewPath] = useState('');

  useEffect(() => {
    let cancelled = false;
    invoke<unknown>('get_scanner_settings')
      .then(data => { if (!cancelled) setSettings(normalizeScannerSettings(data)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Persist both shapes so backend-format files (scanRoots/autoScanOnLaunch)
      // stay readable for the Rust side while the frontend keys keep working.
      await invoke('save_scanner_settings', {
        settings: {
          ...settings,
          scanRoots: settings.scan_paths,
          autoScanOnLaunch: settings.auto_scan,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const addPath = () => {
    if (newPath && !settings.scan_paths.includes(newPath)) {
      setSettings(s => ({ ...s, scan_paths: [...s.scan_paths, newPath] }));
      setNewPath('');
    }
  };

  const removePath = (p: string) => {
    setSettings(s => ({ ...s, scan_paths: s.scan_paths.filter(x => x !== p) }));
  };

  const clearCache = async () => {
    try {
      await invoke('clear_artwork_cache');
    } catch (e) {
      console.error('Failed to clear cache:', e);
    }
  };

  return (
    <div className="space-y-4">
      <AdvancedSection title="Scanner Settings" icon={<DatabaseIcon className="w-5 h-5 text-cyan-400" />}>
        <div className="space-y-4">
          <div>
            <p className="font-medium text-sm mb-2">Scan Paths</p>
            {settings.scan_paths.map(p => (
              <div key={p} className="flex items-center gap-2 py-1">
                <span className="text-sm text-mvo-text flex-1 truncate">{p}</span>
                <button onClick={() => removePath(p)} className="text-red-400 hover:text-red-300"><Trash2Icon className="w-4 h-4" /></button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newPath}
                onChange={e => setNewPath(e.target.value)}
                placeholder="C:\Games"
                className="flex-1 bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl"
              />
              <button onClick={addPath} className="btn-secondary px-3 py-2 text-sm">Add</button>
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-sm">Auto-scan on startup</p>
              <p className="text-xs text-mvo-textDim">Automatically scan for games when app launches</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.auto_scan} onChange={e => setSettings(s => ({ ...s, auto_scan: e.target.checked }))} className="sr-only peer" />
              <div className="w-11 h-6 bg-mvo-border/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-400/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-sm">Enable metadata resolution</p>
              <p className="text-xs text-mvo-textDim">Fetch game info from Steam Store API</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.enable_metadata} onChange={e => setSettings(s => ({ ...s, enable_metadata: e.target.checked }))} className="sr-only peer" />
              <div className="w-11 h-6 bg-mvo-border/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-400/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-sm">Cache retention</p>
              <p className="text-xs text-mvo-textDim">How long to keep scan cache</p>
            </div>
            <select
              value={settings.cache_retention_days}
              onChange={e => setSettings(s => ({ ...s, cache_retention_days: Number(e.target.value) }))}
              className="bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl"
            >
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          <div className="flex gap-3 pt-3 border-t border-mvo-border/30">
            <button onClick={clearCache} className="btn-secondary text-sm"><Trash2Icon className="w-4 h-4 mr-2" /> Clear Scan Cache</button>
            <button onClick={save} className="btn-primary text-sm" disabled={saving}>{saving ? 'Saving...' : 'Save Scanner Settings'}</button>
          </div>
        </div>
      </AdvancedSection>
    </div>
  );
}

function PermissionPill({ label, sensitive }: { label: string; sensitive?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
        sensitive
          ? 'border-mvo-crimson/40 bg-mvo-crimsonDim text-mvo-crimsonBright'
          : 'border-white/10 bg-white/[0.04] text-mvo-textDim'
      }`}
    >
      {sensitive && <ShieldIcon className="h-3 w-3" />}
      {label}
    </span>
  );
}

function PluginCard({ plugin, busy, onToggle }: { plugin: LoadedPlugin; busy: boolean; onToggle: (id: string, enabled: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const granted = grantedPermissions(plugin.manifest.permissions);
  const enabled = plugin.enabled;

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        enabled
          ? 'border-mvo-crimson/25 bg-mvo-crimsonDim'
          : 'border-white/[0.06] bg-white/[0.02] opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              enabled ? 'bg-mvo-crimson/20 text-mvo-crimsonBright' : 'bg-white/[0.05] text-white/35'
            }`}
          >
            <PuzzleIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-[13px] font-semibold text-white">{plugin.manifest.name}</p>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-mvo-textMuted">
                v{plugin.manifest.version}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${
                  enabled ? 'text-mvo-crimsonBright' : 'text-white/30'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-mvo-crimsonBright' : 'bg-white/25'}`} />
                {enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11.5px] text-mvo-textDim">
              {plugin.manifest.description || 'No description provided.'}
            </p>
            {plugin.manifest.author && (
              <p className="mt-1 text-[10.5px] text-mvo-textMuted">by {plugin.manifest.author}</p>
            )}
          </div>
        </div>

        <label className={`relative inline-flex shrink-0 items-center ${busy ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={() => onToggle(plugin.manifest.id, !enabled)}
            className="peer sr-only"
            aria-label={`Toggle ${plugin.manifest.name}`}
          />
          <div className="h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white/70 after:transition-all peer-checked:bg-mvo-crimson peer-checked:after:translate-x-full peer-checked:after:border-white after:content-['']" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {granted.length === 0 ? (
          <span className="text-[10.5px] text-mvo-textMuted">No permissions requested</span>
        ) : (
          granted.map(p => <PermissionPill key={p.key} label={p.label} sensitive={p.sensitive} />)
        )}
        <button
          onClick={() => setExpanded(v => !v)}
          className="ml-1 inline-flex items-center gap-0.5 text-[10.5px] font-medium text-mvo-crimsonBright transition-colors hover:text-white"
        >
          {expanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
          {expanded ? 'Hide details' : 'Permissions detail'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-white/[0.06] bg-black/20 p-3">
          {PERMISSION_CATALOGUE.map(p => {
            const isGranted = plugin.manifest.permissions?.[p.key] === true;
            return (
              <div key={p.key} className="flex items-start gap-2">
                {isGranted ? (
                  <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
                ) : (
                  <span className="mt-[5px] h-3.5 w-3.5 shrink-0 rounded-full border border-white/15" />
                )}
                <div>
                  <p className={`text-[11.5px] ${isGranted ? 'text-white/85' : 'text-white/35'}`}>{p.label}</p>
                  <p className="text-[10px] text-mvo-textMuted">{p.description}</p>
                </div>
              </div>
            );
          })}
          <p className="border-t border-white/[0.06] pt-1.5 font-mono text-[9.5px] text-mvo-textMuted break-all">
            {plugin.path}
          </p>
        </div>
      )}
    </div>
  );
}

function PluginsTab() {
  const [plugins, setPlugins] = useState<LoadedPlugin[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const list = await invoke<LoadedPlugin[]>('list_plugins');
      setPlugins(Array.isArray(list) ? list : []);
      setLoadState('ready');
      setError('');
    } catch (e) {
      setError(String(e));
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (id: string, enabled: boolean) => {
    setBusyId(id);
    try {
      await invoke('toggle_plugin', { pluginId: id, enabled });
      setPlugins(prev => prev.map(p => (p.manifest.id === id ? { ...p, enabled } : p)));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = plugins.filter(p => p.enabled).length;

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <PuzzleIcon className="h-5 w-5 text-mvo-crimsonBright" /> Plugins
            </h3>
            <p className="mt-1 text-xs text-mvo-textDim">
              Extend MVO Hub with community additions for the sidebar, dashboard and game launch events.
            </p>
          </div>
          <button onClick={load} disabled={loadState === 'loading'} className="btn-secondary flex items-center gap-2 text-xs">
            <RefreshCwIcon className={`h-3.5 w-3.5 ${loadState === 'loading' ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-wider text-mvo-textMuted">Installed</p>
            <p className="mt-0.5 font-mono text-sm text-white">{plugins.length}</p>
          </div>
          <div className="rounded-xl border border-mvo-crimson/25 bg-mvo-crimsonDim p-3">
            <p className="text-[10px] uppercase tracking-wider text-mvo-textMuted">Active</p>
            <p className="mt-0.5 font-mono text-sm text-mvo-crimsonBright">{activeCount}</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-wider text-mvo-textMuted">Inactive</p>
            <p className="mt-0.5 font-mono text-sm text-white">{plugins.length - activeCount}</p>
          </div>
        </div>

        <p className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 font-mono text-[10px] text-mvo-textMuted break-all">
          %APPDATA%\MVO Hub\plugins\
        </p>
      </GlassCard>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-mvo-crimson/30 bg-mvo-crimsonDim p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-mvo-crimsonBright" />
          <p className="text-xs text-mvo-crimsonBright break-all">{error}</p>
        </div>
      )}

      {loadState === 'loading' && plugins.length === 0 ? (
        <GlassCard className="flex items-center justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-mvo-crimsonBright" />
        </GlassCard>
      ) : plugins.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-mvo-crimson/25 bg-mvo-crimsonDim">
            <PuzzleIcon className="h-6 w-6 text-mvo-crimsonBright" />
          </div>
          <p className="text-sm font-medium text-white">No plugins installed</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-mvo-textDim">
            Drop a folder containing a <span className="font-mono text-mvo-crimsonBright">manifest.json</span> into the
            plugins directory above, then hit Refresh.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {plugins.map(plugin => (
            <PluginCard key={plugin.manifest.id} plugin={plugin} busy={busyId === plugin.manifest.id} onToggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

type EnterpriseTier = 'community' | 'team' | 'enterprise';

interface EnterpriseBranding {
  productName: string;
  shortName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  supportUrl: string;
}

interface TenantProfileShape {
  tenantId: string;
  branding: EnterpriseBranding;
  features: {
    pluginsEnabled: boolean;
    cloudSyncEnabled: boolean;
    telemetryEnabled: boolean;
    betaChannelsEnabled: boolean;
  };
  telemetryEndpoints: string[];
  updatedAt: string;
}

interface LicenseViewShape {
  status: {
    valid: boolean;
    tier: EnterpriseTier;
    tenantId: string | null;
    tenantName: string | null;
    expiresAt: string | null;
    daysRemaining: number | null;
    reason: string | null;
  };
  warning: string | null;
  branding: EnterpriseBranding;
  tier: EnterpriseTier;
}

interface TelemetryRecordShape {
  event: string;
  name: string;
  metric: { kind: string; value: number } | null;
  build: string;
  at: string;
}

/** Mirrors the Rust `#rrggbb` rule — duplicated so the form can validate live. */
function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Mirrors Rust's `is_trusted_url`: absolute HTTPS only. */
function isTrustedUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  const rest = value.slice('https://'.length);
  if (rest.length === 0 || rest.startsWith('/')) return false;
  return !/[\s\\]/.test(rest);
}

const TIER_LABELS: Record<EnterpriseTier, string> = {
  community: 'Community',
  team: 'Team',
  enterprise: 'Enterprise',
};

function EnterpriseTab() {
  const [license, setLicense] = useState<LicenseViewShape | null>(null);
  const [profile, setProfile] = useState<TenantProfileShape | null>(null);
  const [token, setToken] = useState('');
  const [telemetry, setTelemetry] = useState<TelemetryRecordShape[]>([]);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [lic, prof, events] = await Promise.all([
        invoke<LicenseViewShape>('enterprise_get_license'),
        invoke<TenantProfileShape>('enterprise_get_profile'),
        invoke<TelemetryRecordShape[]>('enterprise_telemetry_snapshot'),
      ]);
      setLicense(lic);
      setProfile(prof);
      setTelemetry(Array.isArray(events) ? events : []);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tier: EnterpriseTier = license?.tier ?? 'community';
  const canWhiteLabel = tier === 'enterprise';
  const canTelemetry = tier === 'team' || tier === 'enterprise';

  const patchBranding = (patch: Partial<EnterpriseBranding>) => {
    setProfile(p => (p ? { ...p, branding: { ...p.branding, ...patch } } : p));
  };
  const patchFeature = (key: keyof TenantProfileShape['features'], value: boolean) => {
    setProfile(p => (p ? { ...p, features: { ...p.features, [key]: value } } : p));
  };

  // Client-side validation mirrors the backend so the form highlights fields
  // before a round-trip; the backend remains authoritative.
  const fieldErrors: Record<string, string> = {};
  if (profile) {
    if (!/^[A-Za-z0-9_-]+$/.test(profile.tenantId)) {
      fieldErrors.tenantId = "Letters, digits, '-' and '_' only";
    }
    if (!profile.branding.productName.trim()) fieldErrors.productName = 'Required';
    else if (profile.branding.productName.length > 40) fieldErrors.productName = 'Max 40 characters';
    if (!profile.branding.shortName.trim()) fieldErrors.shortName = 'Required';
    else if (profile.branding.shortName.length > 12) fieldErrors.shortName = 'Max 12 characters';
    if (!isHexColor(profile.branding.primaryColor)) fieldErrors.primaryColor = 'Use #rrggbb';
    if (!isHexColor(profile.branding.accentColor)) fieldErrors.accentColor = 'Use #rrggbb';
    if (profile.branding.logoUrl && !isTrustedUrl(profile.branding.logoUrl)) {
      fieldErrors.logoUrl = 'Must be an https:// URL';
    }
    if (profile.branding.supportUrl && !isTrustedUrl(profile.branding.supportUrl)) {
      fieldErrors.supportUrl = 'Must be an https:// URL';
    }
  }
  const hasErrors = Object.keys(fieldErrors).length > 0;

  const installLicense = async () => {
    setBusy('license');
    setError('');
    setNotice('');
    try {
      const next = await invoke<LicenseViewShape>('enterprise_install_license', { token });
      setLicense(next);
      setToken('');
      setNotice(
        next.status.valid
          ? `Licence installed — ${TIER_LABELS[next.tier]} tier.`
          : `Licence rejected: ${next.status.reason ?? 'unknown reason'}`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async () => {
    if (!profile) return;
    setBusy('profile');
    setError('');
    setNotice('');
    try {
      const saved = await invoke<TenantProfileShape>('enterprise_set_profile', { profile });
      setProfile(saved);
      await load();
      setNotice('Tenant profile saved.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const drainTelemetry = async () => {
    setBusy('drain');
    setError('');
    setNotice('');
    try {
      const drained = await invoke<TelemetryRecordShape[]>('enterprise_drain_telemetry');
      setTelemetry([]);
      setNotice(`Exported ${Array.isArray(drained) ? drained.length : 0} telemetry event(s).`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const runDiagnostics = async () => {
    setBusy('diagnostics');
    setError('');
    try {
      const bundle = await invoke<Record<string, unknown>>('enterprise_diagnostics');
      const lines = [
        `MVO ${bundle.appVersion} on ${bundle.os}`,
        `tier: ${bundle.tier} (tenant: ${bundle.tenantId ?? 'none'})`,
        `plugins: ${bundle.pluginCount}, saves: ${bundle.trackedSaves}, achievements: ${bundle.achievementsUnlocked}`,
        `pending uploads: ${bundle.pendingUploads}, active sessions: ${bundle.activeSessions}`,
        `generated: ${bundle.generatedAt}`,
      ];
      setSummary(lines.join('\n'));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!license || !profile) {
    return (
      <GlassCard className="flex items-center justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-mvo-crimsonBright" />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Licence status */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <BuildingIcon className="h-5 w-5 text-mvo-crimsonBright" /> Licence
            </h3>
            <p className="mt-1 text-xs text-mvo-textDim">
              Offline-verified via Ed25519. No licence server is contacted.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${
              license.status.valid
                ? 'border-mvo-crimson/35 bg-mvo-crimsonDim text-mvo-crimsonBright'
                : 'border-white/10 bg-white/[0.03] text-white/50'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${license.status.valid ? 'bg-mvo-crimsonBright' : 'bg-white/30'}`} />
            {TIER_LABELS[tier]}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Tenant', value: license.status.tenantName ?? '—' },
            { label: 'Expires', value: license.status.expiresAt ? new Date(license.status.expiresAt).toLocaleDateString() : 'Perpetual' },
            { label: 'Days left', value: license.status.daysRemaining != null ? String(license.status.daysRemaining) : '—' },
            { label: 'White-label', value: canWhiteLabel ? 'Enabled' : 'Locked' },
          ].map(tile => (
            <div key={tile.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-mvo-textMuted">{tile.label}</p>
              <p className="mt-0.5 truncate font-mono text-[12.5px] text-white">{tile.value}</p>
            </div>
          ))}
        </div>

        {license.warning && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">{license.warning}</p>
          </div>
        )}
        {!license.status.valid && license.status.reason && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <ShieldIcon className="h-4 w-4 shrink-0 text-white/40" />
            <p className="text-xs text-mvo-textDim">{license.status.reason}</p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste signed licence token"
            aria-label="Licence token"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[11.5px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
          />
          <button
            onClick={installLicense}
            disabled={!token.trim() || busy === 'license'}
            className="btn-primary flex items-center justify-center gap-2 text-xs disabled:opacity-50"
          >
            {busy === 'license' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyIcon className="h-3.5 w-3.5" />}
            Install
          </button>
        </div>
      </GlassCard>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-mvo-crimson/30 bg-mvo-crimsonDim p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-mvo-crimsonBright" />
          <p className="break-all text-xs text-mvo-crimsonBright">{error}</p>
        </div>
      )}
      {notice && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-green-400/25 bg-green-400/[0.07] p-3">
          <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-400" />
          <p className="text-xs text-green-400">{notice}</p>
        </div>
      )}

      {/* White-label */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <PaletteIcon className="h-5 w-5 text-mvo-crimsonBright" /> White-label
          </h3>
          {!canWhiteLabel && (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-white/45">
              Requires Enterprise tier
            </span>
          )}
        </div>
        {!canWhiteLabel && (
          <p className="mt-2 text-[11.5px] text-mvo-textDim">
            Branding can be configured now but is only applied with an Enterprise licence.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([
            { key: 'productName' as const, label: 'Product name', placeholder: 'MVO Hub' },
            { key: 'shortName' as const, label: 'Short name', placeholder: 'MVO' },
            { key: 'logoUrl' as const, label: 'Logo URL', placeholder: 'https://example.com/logo.png' },
            { key: 'supportUrl' as const, label: 'Support URL', placeholder: 'https://example.com/support' },
          ]).map(field => (
            <div key={field.key}>
              <label htmlFor={`ent-${field.key}`} className="mb-1 block text-[11px] font-medium text-mvo-textDim">
                {field.label}
              </label>
              <input
                id={`ent-${field.key}`}
                value={profile.branding[field.key]}
                onChange={e => patchBranding({ [field.key]: e.target.value })}
                placeholder={field.placeholder}
                className={`w-full rounded-xl border bg-black/25 px-3 py-2 text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50 ${
                  fieldErrors[field.key] ? 'border-mvo-crimson/60' : 'border-white/10'
                }`}
              />
              {fieldErrors[field.key] && (
                <p className="mt-1 text-[10.5px] text-mvo-crimsonBright">{fieldErrors[field.key]}</p>
              )}
            </div>
          ))}

          {(['primaryColor', 'accentColor'] as const).map(key => (
            <div key={key}>
              <label htmlFor={`ent-${key}`} className="mb-1 block text-[11px] font-medium text-mvo-textDim">
                {key === 'primaryColor' ? 'Primary colour' : 'Accent colour'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`ent-${key}`}
                  value={profile.branding[key]}
                  onChange={e => patchBranding({ [key]: e.target.value })}
                  className={`min-w-0 flex-1 rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50 ${
                    fieldErrors[key] ? 'border-mvo-crimson/60' : 'border-white/10'
                  }`}
                />
                <span
                  className="h-8 w-8 shrink-0 rounded-lg border border-white/15"
                  style={{ background: isHexColor(profile.branding[key]) ? profile.branding[key] : 'transparent' }}
                  aria-hidden="true"
                />
              </div>
              {fieldErrors[key] && (
                <p className="mt-1 text-[10.5px] text-mvo-crimsonBright">{fieldErrors[key]}</p>
              )}
            </div>
          ))}

          <div className="sm:col-span-2">
            <label htmlFor="ent-tenantId" className="mb-1 block text-[11px] font-medium text-mvo-textDim">
              Tenant id
            </label>
            <input
              id="ent-tenantId"
              value={profile.tenantId}
              onChange={e => setProfile(p => (p ? { ...p, tenantId: e.target.value } : p))}
              className={`w-full rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50 ${
                fieldErrors.tenantId ? 'border-mvo-crimson/60' : 'border-white/10'
              }`}
            />
            {fieldErrors.tenantId && (
              <p className="mt-1 text-[10.5px] text-mvo-crimsonBright">{fieldErrors.tenantId}</p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Feature switches */}
      <GlassCard className="p-5">
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <SlidersIcon className="h-5 w-5 text-mvo-crimsonBright" /> Feature switches
        </h3>
        <div className="mt-2 divide-y divide-white/[0.05]">
          {([
            { key: 'pluginsEnabled' as const, label: 'Third-party plugins', desc: 'Allow loading plugins from the plugins directory' },
            { key: 'cloudSyncEnabled' as const, label: 'Cloud sync', desc: 'Enable save and achievement synchronisation' },
            { key: 'telemetryEnabled' as const, label: 'Telemetry', desc: 'Queue diagnostic events for export (opt-in)' },
            { key: 'betaChannelsEnabled' as const, label: 'Beta channels', desc: 'Allow prerelease update channels' },
          ]).map(item => (
            // The whole row is the label, so a click anywhere toggles the switch.
            <label
              key={item.key}
              htmlFor={`ent-feature-${item.key}`}
              className="flex cursor-pointer items-center justify-between py-3"
            >
              <div>
                <p className="text-[12.5px] font-medium text-white">{item.label}</p>
                <p className="text-[10.5px] text-mvo-textDim">{item.desc}</p>
              </div>
              <span className="relative inline-flex items-center">
                <input
                  id={`ent-feature-${item.key}`}
                  type="checkbox"
                  checked={profile.features[item.key]}
                  onChange={e => patchFeature(item.key, e.target.checked)}
                  className="peer sr-only"
                  aria-label={item.label}
                />
                {/* `pointer-events-none` so the visual track never swallows the
                    click meant for the (visually hidden) checkbox. */}
                <span className="pointer-events-none h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white/70 after:transition-all peer-checked:bg-mvo-crimson peer-checked:after:translate-x-full after:content-['']" />
              </span>
            </label>
          ))}
        </div>
        {profile.features.telemetryEnabled && !canTelemetry && (
          <p className="mt-1 text-[10.5px] text-amber-400">
            Telemetry is queued but not exported until a Team or Enterprise licence is installed.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={saveProfile}
            disabled={hasErrors || busy === 'profile'}
            className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50"
          >
            {busy === 'profile' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircleIcon className="h-3.5 w-3.5" />}
            Save profile
          </button>
          {hasErrors && <span className="text-[10.5px] text-mvo-crimsonBright">Fix the highlighted fields first</span>}
        </div>
      </GlassCard>

      {/* Telemetry & diagnostics */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <ActivityIcon className="h-5 w-5 text-mvo-crimsonBright" /> Telemetry &amp; diagnostics
          </h3>
          <span className="font-mono text-[10.5px] text-mvo-textMuted">{telemetry.length} queued</span>
        </div>
        <p className="mt-1 text-[11.5px] text-mvo-textDim">
          Events carry only a fixed name and numeric metrics — never file paths, game names or messages.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={runDiagnostics} disabled={busy === 'diagnostics'} className="btn-secondary flex items-center gap-2 text-xs">
            {busy === 'diagnostics' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ActivityIcon className="h-3.5 w-3.5" />}
            Generate diagnostics
          </button>
          <button
            onClick={drainTelemetry}
            disabled={busy === 'drain' || telemetry.length === 0 || !canTelemetry}
            className="btn-secondary flex items-center gap-2 text-xs disabled:opacity-40"
            title={!canTelemetry ? 'Requires Team or Enterprise tier' : undefined}
          >
            {busy === 'drain' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadIcon className="h-3.5 w-3.5" />}
            Export telemetry
          </button>
        </div>

        {summary && (
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-black/30 p-3 font-mono text-[10.5px] text-mvo-textDim">
            {summary}
          </pre>
        )}

        {telemetry.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 px-3">
            {telemetry.slice(-8).reverse().map((record, i) => (
              <div key={`${record.name}-${i}`} className="flex items-center justify-between border-t border-white/[0.05] py-2 text-[11px] first:border-t-0">
                <span className="font-mono text-white/75">{record.name}</span>
                <span className="text-mvo-textMuted">
                  {record.metric ? `${record.metric.kind}: ${record.metric.value}` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

export function Settings({ settings: parentSettings, onSettingsChange, user, defaultTab }: { settings?: any; onSettingsChange?: (s: any) => void; user?: any; defaultTab?: string } = {}) {
  useLocale();
  const [settings, setSettings] = useState<any>(parentSettings || {});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'sync' | 'advanced' | 'updates' | 'scanner' | 'plugins' | 'enterprise' | 'account'>((defaultTab as any) || 'general');

  useEffect(() => {
    if (parentSettings) setSettings(parentSettings);
  }, [parentSettings]);

  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab as any);
  }, [defaultTab]);

  // Helper: update local state AND notify parent
  const update = (patch: Partial<any>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (onSettingsChange) onSettingsChange(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await invoke('save_settings', { settings });
    } catch (e) {
      console.error('Settings save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    try {
      const data = await invoke<any>('reset_settings');
      setSettings(data);
      if (onSettingsChange) onSettingsChange(data);
    } catch (e) {
      console.error('Settings reset failed:', e);
    }
  };

  const exportSettings = async () => {
    const json = await invoke<string>('export_settings');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mvo-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await invoke('import_settings', { json: text });
    const data = await invoke<any>('load_settings');
    setSettings(data);
    if (onSettingsChange) onSettingsChange(data);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;

  const tabs = [
    { id: 'general', label: t('settings.general'), icon: SettingsIcon },
    { id: 'ai', label: 'AI', icon: BrainIcon },
    { id: 'sync', label: 'Cloud Sync', icon: CloudIcon },
    { id: 'advanced', label: t('settings.advanced'), icon: ShieldIcon },
    { id: 'updates', label: 'Updates', icon: RefreshCwIcon },
    { id: 'scanner', label: 'Scanner', icon: DatabaseIcon },
    { id: 'plugins', label: 'Plugins', icon: PuzzleIcon },
    { id: 'enterprise', label: 'Enterprise', icon: BuildingIcon },
    { id: 'account', label: 'Account', icon: UserIcon },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text">{t('settings.title')}</h1>
          <p className="text-mvo-textDim mt-1">{t('settings.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-secondary" disabled={saving}>{t('settings.resetDefaults')}</button>
          <button onClick={exportSettings} className="btn-secondary">{t('settings.exportSettings')}</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? t('common.loading') : t('settings.saveChanges')}
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6 border-b border-mvo-border/50">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-4 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30' : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover'}`}>
            <tab.icon className="w-4 h-4 mr-2 inline-block" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="space-y-6">
          <GlassCard className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><LayoutDashboardIcon className="w-5 h-5 text-cyan-400" /> {t('settings.general')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-mvo-textDim mb-1">{t('settings.language')}</label>
                <select value={settings.language} onChange={e => { const v = e.target.value; update({ language: v }); setLocale(v as Locale); invoke('save_settings', { settings: {...settings, language: v} }).catch(console.error); }} className="w-full input">
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                  <option value="de">Deutsch</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-mvo-textDim mb-1">{t('settings.theme')}</label>
                <select value={settings.theme} onChange={e => { const v = e.target.value; update({ theme: v }); invoke('save_settings', { settings: {...settings, theme: v} }).catch(console.error); }} className="w-full input">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="notifications" checked={settings.notifications_enabled} onChange={e => update({notifications_enabled: e.target.checked})} className="w-4 h-4 accent-cyan-400 rounded" />
                <label htmlFor="notifications" className="text-sm text-mvo-text">{t('settings.enableNotifications')}</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="auto_update" checked={settings.auto_update} onChange={e => { const v = e.target.checked; update({auto_update: v}); invoke('save_settings', { settings: {...settings, auto_update: v} }).catch(console.error); }} className="w-4 h-4 accent-cyan-400 rounded" />
                <label htmlFor="auto_update" className="text-sm text-mvo-text">{t('settings.autoCheckUpdates')}</label>
              </div>
            </div>
           </GlassCard>

           <GlassCard className="p-6">
             <h3 className="font-semibold mb-4">{t('settings.windowSize')}</h3>
             <div className="space-y-4">
               <div>
                 <label className="block text-sm text-mvo-textDim mb-1">{t('settings.windowWidth')}</label>
                 <div className="flex items-center">
                   <input
                     type="range"
                     min={900}
                     max={3840}
                     step={10}
                     value={settings.window_width || 1500}
                     className="w-full h-2 bg-mvo-border/20 rounded"
                     onChange={(e) => {
                       const value = parseInt(e.target.value);
                       update({ window_width: value });
                       // Apply immediately for live preview
                       invoke('set_window_size', { width: value, height: settings.window_height || 900 }).catch(console.error);
                     }}
                   />
                   <div className="flex items-center gap-2 ml-2 text-xs text-mvo-textDim">
                     <span>{settings.window_width || 1500}</span>
                     <span>px</span>
                   </div>
                 </div>
                 <p className="text-xs text-mvo-textDim">{t('settings.windowWidthDesc')}</p>
               </div>
               <div>
                 <label className="block text-sm text-mvo-textDim mb-1">{t('settings.windowHeight')}</label>
                 <div className="flex items-center">
                   <input
                     type="range"
                     min={560}
                     max={2160}
                     step={10}
                     value={settings.window_height || 900}
                     className="w-full h-2 bg-mvo-border/20 rounded"
                     onChange={(e) => {
                       const value = parseInt(e.target.value);
                       update({ window_height: value });
                       // Apply immediately for live preview
                       invoke('set_window_size', { width: settings.window_width || 1500, height: value }).catch(console.error);
                     }}
                   />
                   <div className="flex items-center gap-2 ml-2 text-xs text-mvo-textDim">
                     <span>{settings.window_height || 900}</span>
                     <span>px</span>
                   </div>
                 </div>
                 <p className="text-xs text-mvo-textDim">{t('settings.windowHeightDesc')}</p>
               </div>
             </div>
           </GlassCard>

            <GlassCard className="p-6">
              <h3 className="font-semibold mb-4">{t('settings.gaming')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="auto_steam" checked={settings.auto_steam_scan} onChange={e => update({auto_steam_scan: e.target.checked})} className="w-4 h-4 accent-cyan-400 rounded" />
                <label htmlFor="auto_steam" className="text-sm text-mvo-text">{t('settings.autoScanSteam')}</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="overlay_before" checked={settings.overlay_before_game} onChange={e => update({overlay_before_game: e.target.checked})} className="w-4 h-4 accent-cyan-400 rounded" />
                <label htmlFor="overlay_before" className="text-sm text-mvo-text">{t('settings.overlayBeforeGame')}</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="boost_before" checked={settings.boost_before_game} onChange={e => update({boost_before_game: e.target.checked})} className="w-4 h-4 accent-cyan-400 rounded" />
                <label htmlFor="boost_before" className="text-sm text-mvo-text">{t('settings.boostBeforeGame')}</label>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold mb-4">{t('settings.windowLayout')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="sidebar_collapsed" checked={settings.sidebar_collapsed} onChange={e => update({sidebar_collapsed: e.target.checked})} className="w-4 h-4 accent-cyan-400 rounded" />
                <label htmlFor="sidebar_collapsed" className="text-sm text-mvo-text">{t('settings.sidebarCollapsed')}</label>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold mb-4">{t('settings.windowLayout')}</h3>
            <p className="text-xs text-mvo-textDim mb-4">{t('settings.tabVisibilityDesc')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[
                { id: 'dashboard', label: t('nav.dashboard') },
                { id: 'gamelibrary', label: t('nav.library') },
                { id: 'gamevault', label: t('nav.gamevault') },
                { id: 'performance', label: t('nav.performance') },
                { id: 'optimizer', label: t('nav.optimizer') },
                { id: 'systemboost', label: t('nav.systemBoost') },
                { id: 'aitools', label: t('nav.aiTools') },
                { id: 'overlay', label: t('nav.overlay') },
                { id: 'streaming', label: t('nav.streaming') },
                { id: 'files', label: t('nav.files') },
                { id: 'webhub', label: t('nav.web') },
                { id: 'tools', label: t('nav.tools') },
              ].map(page => {
                const isHidden = (settings.hidden_pages || []).includes(page.id);
                return (
                  <button
                    key={page.id}
                    onClick={() => {
                      const hidden_pages = isHidden
                        ? (settings.hidden_pages || []).filter(p => p !== page.id)
                        : [...(settings.hidden_pages || []), page.id];
                      update({hidden_pages});
                    }}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                      isHidden
                        ? 'bg-mvo-panelHover/30 text-mvo-textDim border-mvo-border/30 opacity-50'
                        : 'bg-cyan-400/10 text-cyan-400 border-cyan-400/30'
                    }`}
                  >
                    {isHidden ? t('settings.hidden') : t('settings.visible')} — {page.label}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold mb-4">{t('settings.importExport')}</h3>
            <div className="flex gap-3 flex-wrap">
              <button onClick={async () => { const json = await invoke<string>('export_settings'); const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mvo-settings.json'; a.click(); }} className="btn-secondary">
                <DownloadIcon className="w-4 h-4 mr-2" /> {t('settings.exportSettings')}
              </button>
              <label className="btn-secondary cursor-pointer">
                <UploadIcon className="w-4 h-4 mr-2" /> {t('settings.importSettings')}
                <input type="file" accept=".json" onChange={importSettings} className="hidden" />
              </label>
              <button onClick={reset} className="btn-danger">
                <RotateCcwIcon className="w-4 h-4 mr-2" /> {t('settings.resetDefaults')}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-6">
          <GlassCard className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><BrainIcon className="w-5 h-5 text-pink-400" /> AI Provider</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-mvo-textDim mb-1">{t('ai.provider')}</label>
                <select value={settings.ai_provider} onChange={e => update({ai_provider: e.target.value})} className="w-full input">
                  <option value="ollama">Ollama (Local)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="openai-compatible">OpenAI Compatible</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-mvo-textDim mb-1">{t('ai.model')}</label>
                <input value={settings.ai_model} onChange={e => update({ai_model: e.target.value})} className="w-full input" placeholder="llama3.1" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-mvo-textDim mb-1">{t('ai.baseUrl')}</label>
                <input value={settings.ai_base_url} onChange={e => update({ai_base_url: e.target.value})} className="w-full input" placeholder="http://localhost:11434" />
              </div>
              {settings.ai_provider !== 'ollama' && (
                <div className="md:col-span-2">
                  <label className="block text-sm text-mvo-textDim mb-1">{t('ai.apiKey')}</label>
                  <input type="password" value={settings.ai_api_key} onChange={e => update({ai_api_key: e.target.value})} className="w-full input" placeholder={t('ai.apiKeyPlaceholder')} />
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === 'sync' && (
        <CloudSyncTab settings={settings} update={update} />
      )}

      {activeTab === 'advanced' && (
        <div className="space-y-4">
          {/* System Maintenance */}
          <AdvancedSection title="System Maintenance" icon={<WrenchIcon className="w-5 h-5 text-cyan-400" />}>
            <ActionRow
              label="Run System File Checker"
              desc="Scan and repair corrupted Windows system files"
              buttonText="Run SFC"
              onClick={async () => { try { await invoke('run_sfc_scan'); } catch(e) { alert(String(e)); } }}
            />
            <ActionRow
              label="Run DISM Repair"
              desc="Repair Windows system image"
              buttonText="Run DISM"
              onClick={async () => { try { await invoke('run_dism_repair'); } catch(e) { alert(String(e)); } }}
            />
            <ActionRow
              label="Clear Temp Files"
              desc="Delete temporary files from system temp folder"
              buttonText="Clear"
              onClick={async () => { try { const r = await invoke<string>('clear_temp_files'); alert(r); } catch(e) { alert(String(e)); } }}
            />
            <ActionRow
              label="Clear Software Distribution"
              desc="Clear Windows Update download cache"
              buttonText="Clear"
              onClick={async () => { try { const r = await invoke<string>('clear_software_distribution'); alert(r); } catch(e) { alert(String(e)); } }}
            />
            <ActionRow
              label="Reset Windows Store Cache"
              desc="Reset Microsoft Store cache"
              buttonText="Reset"
              onClick={async () => { try { const r = await invoke<string>('reset_windows_store_cache'); alert(r); } catch(e) { alert(String(e)); } }}
            />
          </AdvancedSection>

          {/* Power & Performance */}
          <AdvancedSection title="Power & Performance" icon={<PowerIcon className="w-5 h-5 text-green-400" />}>
            <PowerPlanSelector />
            <ActionRow
              label="Toggle Transparency"
              desc="Enable or disable Windows transparency effects"
              buttonText="Toggle"
              onClick={async (enable) => { try { await invoke('toggle_transparency', { enable }); } catch(e) { alert(String(e)); } }}
              hasToggle
            />
            <ActionRow
              label="Toggle Animations"
              desc="Enable or disable Windows UI animations"
              buttonText="Toggle"
              onClick={async (enable) => { try { await invoke('toggle_animations', { enable }); } catch(e) { alert(String(e)); } }}
              hasToggle
            />
            <ActionRow
              label="Toggle Hibernate"
              desc="Enable or disable hibernation mode"
              buttonText="Toggle"
              onClick={async (enable) => { try { await invoke('toggle_hibernate', { enable }); } catch(e) { alert(String(e)); } }}
              hasToggle
            />
          </AdvancedSection>

          {/* Windows Tools */}
          <AdvancedSection title="Windows Tools" icon={<MonitorIcon className="w-5 h-5 text-purple-400" />}>
            <ActionRow label="Windows Update" desc="Check for and install Windows updates" buttonText="Open" onClick={() => invoke('open_windows_update')} />
            <ActionRow label="Device Manager" desc="Manage hardware devices and drivers" buttonText="Open" onClick={() => invoke('open_device_manager')} />
            <ActionRow label="Disk Management" desc="Manage disk partitions and volumes" buttonText="Open" onClick={() => invoke('open_disk_management')} />
            <ActionRow label="Event Viewer" desc="View system logs and event records" buttonText="Open" onClick={() => invoke('open_event_viewer')} />
            <ActionRow label="Registry Editor" desc="Edit Windows registry" buttonText="Open" onClick={() => invoke('open_registry_editor')} />
            <ActionRow label="Resource Monitor" desc="Real-time CPU, memory, disk, and network usage" buttonText="Open" onClick={() => invoke('open_resource_monitor')} />
            <ActionRow label="System Information" desc="View detailed system hardware and software info" buttonText="Open" onClick={() => invoke('open_system_info')} />
            <ActionRow label="System Configuration" desc="Configure startup, boot, services, and tools" buttonText="Open" onClick={() => invoke('open_msconfig')} />
            <ActionRow label="Task Scheduler" desc="Automate tasks and scripts" buttonText="Open" onClick={() => invoke('open_task_scheduler')} />
            <ActionRow label="Services" desc="Manage Windows services" buttonText="Open" onClick={() => invoke('open_services')} />
            <ActionRow label="Group Policy Editor" desc="Configure advanced system policies" buttonText="Open" onClick={() => invoke('open_group_policy')} />
            <ActionRow label="Local Users & Groups" desc="Manage user accounts" buttonText="Open" onClick={() => invoke('open_local_users_groups')} />
            <ActionRow label="Print Management" desc="Manage printers and print queues" buttonText="Open" onClick={() => invoke('open_print_management')} />
            <ActionRow label="PowerShell (Admin)" desc="Open elevated PowerShell terminal" buttonText="Open" onClick={() => invoke('open_powershell_admin')} />
          </AdvancedSection>

          {/* Windows Settings */}
          <AdvancedSection title="Windows Settings" icon={<SettingsIcon className="w-5 h-5 text-yellow-400" />}>
            <ActionRow label="Display" desc="Resolution, scale, brightness" buttonText="Open" onClick={() => invoke('open_display_settings')} />
            <ActionRow label="Sound" desc="Audio devices and volume" buttonText="Open" onClick={() => invoke('open_sound_settings')} />
            <ActionRow label="Network & Internet" desc="Wi-Fi, Ethernet, VPN, proxy" buttonText="Open" onClick={() => invoke('open_network_settings')} />
            <ActionRow label="Bluetooth" desc="Bluetooth devices and pairing" buttonText="Open" onClick={() => invoke('open_bluetooth_settings')} />
            <ActionRow label="Night Light" desc="Reduce blue light in the evening" buttonText="Open" onClick={() => invoke('open_night_light_settings')} />
            <ActionRow label="Focus Assist" desc="Minimize distractions during focus time" buttonText="Open" onClick={() => invoke('open_focus_assist_settings')} />
            <ActionRow label="Default Apps" desc="Choose default apps for file types" buttonText="Open" onClick={() => invoke('open_default_apps_settings')} />
            <ActionRow label="Startup Apps" desc="Manage apps that start with Windows" buttonText="Open" onClick={() => invoke('open_startup_apps_settings')} />
            <ActionRow label="Storage" desc="Storage Sense and disk usage" buttonText="Open" onClick={() => invoke('open_storage_settings')} />
            <ActionRow label="Personalization" desc="Background, colors, themes" buttonText="Open" onClick={() => invoke('open_personalization_settings')} />
            <ActionRow label="Privacy" desc="App permissions and privacy settings" buttonText="Open" onClick={() => invoke('open_privacy_settings')} />
            <ActionRow label="Accessibility" desc="Narrator, magnifier, high contrast" buttonText="Open" onClick={() => invoke('open_accessibility_settings')} />
            <ActionRow label="Delivery Optimization" desc="Windows Update download settings" buttonText="Open" onClick={() => invoke('open_delivery_optimization')} />
            <ActionRow label="Maintenance" desc="Automatic maintenance settings" buttonText="Open" onClick={() => invoke('open_maintenance_settings')} />
            <ActionRow label="Recovery" desc="Reset, restore, advanced startup" buttonText="Open" onClick={() => invoke('open_recovery_settings')} />
            <ActionRow label="Troubleshoot" desc="Run Windows troubleshooters" buttonText="Open" onClick={() => invoke('open_troubleshoot_settings')} />
            <ActionRow label="Optional Features" desc="Add or remove Windows features" buttonText="Open" onClick={() => invoke('open_optional_features')} />
            <ActionRow label="Environment Variables" desc="Edit system and user PATH variables" buttonText="Open" onClick={() => invoke('open_environment_variables')} />
            <ActionRow label="About" desc="System specs and Windows version" buttonText="Open" onClick={() => invoke('open_about_settings')} />
          </AdvancedSection>

          {/* Security */}
          <AdvancedSection title="Security" icon={<ShieldIcon className="w-5 h-5 text-red-400" />}>
            <ActionRow label="Windows Security" desc="Virus protection, firewall, account protection" buttonText="Open" onClick={() => invoke('open_windows_security')} />
          </AdvancedSection>

          {/* App Management */}
          <AdvancedSection title="App Management" icon={<HardDriveIcon className="w-5 h-5 text-orange-400" />}>
            <ActionRow label="Disk Cleanup" desc="Clean up unnecessary system files" buttonText="Open" onClick={() => invoke('open_disk_cleanup')} />
            <ActionRow label="Control Panel" desc="Classic system settings" buttonText="Open" onClick={() => invoke('open_control_panel')} />
          </AdvancedSection>

          {/* Debug & App */}
          <AdvancedSection title="Debug & App" icon={<PuzzleIcon className="w-5 h-5 text-gray-400" />}>
            <ActionRow
              label="Check for Updates"
              desc="Check if a new version of MVO Hub is available"
              buttonText="Check"
              onClick={async () => { try { const r = await invoke<string>('check_for_updates'); const info = JSON.parse(r); if (info.available) { alert(`Update v${info.version} available!\n${info.notes || ''}`); } else { alert('App is up to date.'); } } catch(e) { alert(String(e)); } }}
            />
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">Debug Logging</p>
                <p className="text-sm text-mvo-textDim">Log detailed app info for troubleshooting</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-mvo-border/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-400/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">Hardware Acceleration</p>
                <p className="text-sm text-mvo-textDim">Use GPU for app rendering</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-cyan-400 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-400/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">Telemetry</p>
                <p className="text-sm text-mvo-textDim">Send usage data to improve the app</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-mvo-border/50 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-400/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400"></div>
              </label>
            </div>
            <div className="flex gap-3 flex-wrap pt-3 border-t border-mvo-border/30">
              <button className="btn-secondary" onClick={() => invoke('open_settings_folder')}><FolderOpenIcon className="w-4 h-4 mr-2" /> Open Settings Folder</button>
              <button className="btn-secondary" onClick={() => invoke('open_settings_folder')}><FolderOpenIcon className="w-4 h-4 mr-2" /> Open Logs Folder</button>
              <button className="btn-danger"><Trash2Icon className="w-4 h-4 mr-2" /> Clear Cache</button>
            </div>
           </AdvancedSection>
        </div>
      )}

      {activeTab === 'updates' && (
        <UpdatesTab />
      )}

      {activeTab === 'scanner' && (
        <ScannerSettingsTab />
      )}

      {activeTab === 'plugins' && (
        <PluginsTab />
      )}

      {activeTab === 'enterprise' && (
        <EnterpriseTab />
      )}

      {activeTab === 'account' && (
        <AccountTab user={user} />
      )}
    </div>
  );
}
