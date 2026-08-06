import { useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard } from '../components/ui';
import { RotateCcwIcon, DownloadIcon, UploadIcon, FolderOpenIcon, ShieldIcon, BrainIcon, LayoutDashboardIcon, Loader2, Trash2Icon, SettingsIcon, WrenchIcon, GaugeIcon, PowerIcon, MonitorIcon, HardDriveIcon, NetworkIcon, PuzzleIcon, ChevronDownIcon, ChevronRightIcon, RefreshCwIcon, UserIcon, LogOutIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { setLocale, type Locale } from '../lib/i18n';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

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
  const [currentVersion] = useState('0.1.0');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState('');

  const checkForUpdates = async () => {
    setChecking(true);
    setStatus('');
    try {
      const result = await invoke<string>('check_for_updates');
      const info = JSON.parse(result);
      if (info.available) {
        setUpdateAvailable(true);
        setUpdateVersion(info.version);
        setUpdateNotes(info.notes || '');
        setStatus(`Update v${info.version} is available`);
      } else {
        setUpdateAvailable(false);
        setStatus('You have the latest version downloaded already');
      }
    } catch (e) {
      setStatus('You have the latest version downloaded already');
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    setDownloading(true);
    try { await invoke('download_and_install_update'); } catch (e) { setStatus('Failed: ' + String(e)); setDownloading(false); }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><RefreshCwIcon className="w-5 h-5 text-cyan-400" /> App Updates</h3>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-mvo-text">Current version: <span className="text-cyan-400 font-mono">v{currentVersion}-beta</span></p>
            {status && <p className="text-xs text-mvo-textDim mt-1">{status}</p>}
          </div>
          <button onClick={checkForUpdates} disabled={checking} className="btn-secondary text-sm flex items-center gap-2">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
            {checking ? 'Checking...' : 'Check Now'}
          </button>
        </div>
        {updateAvailable && (
          <div className="bg-cyan-400/5 border border-cyan-400/20 rounded-xl p-4">
            <p className="text-cyan-400 font-medium mb-1">Update v{updateVersion} available</p>
            {updateNotes && <p className="text-xs text-mvo-textDim mb-3 whitespace-pre-line">{updateNotes}</p>}
            <button onClick={installUpdate} disabled={downloading} className="btn-primary text-sm flex items-center gap-2">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
              {downloading ? 'Installing...' : 'Download & Install'}
            </button>
          </div>
        )}
      </GlassCard>
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

export function Settings({ settings: parentSettings, onSettingsChange, user, defaultTab }: { settings?: any; onSettingsChange?: (s: any) => void; user?: any; defaultTab?: string } = {}) {
  useLocale();
  const [settings, setSettings] = useState<any>(parentSettings || {});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'advanced' | 'updates' | 'account'>((defaultTab as any) || 'general');

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
    { id: 'advanced', label: t('settings.advanced'), icon: ShieldIcon },
    { id: 'updates', label: 'Updates', icon: RefreshCwIcon },
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
                <input type="checkbox" id="auto_update" checked={settings.auto_update} onChange={e => update({auto_update: e.target.checked})} className="w-4 h-4 accent-cyan-400 rounded" />
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
              <div className="flex items-center gap-3">
                <input type="checkbox" id="right_panel" checked={settings.right_panel_open} onChange={e => update({right_panel_open: e.target.checked})} className="w-4 h-4 accent-cyan-400 rounded" />
                <label htmlFor="right_panel" className="text-sm text-mvo-text">{t('settings.rightPanelOpen')}</label>
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

      {activeTab === 'account' && (
        <AccountTab user={user} />
      )}
    </div>
  );
}
