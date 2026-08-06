import { useState } from 'react';
import { GlassCard } from '../components/ui';
import { Zap, Wifi, HardDrive, Monitor, Activity, Shield, Settings, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function Optimizer() {
  useLocale();
  const [result, setResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const run = async (id: string, cmd: string, args?: Record<string, any>) => {
    setLoading(id);
    setResult(null);
    try {
      const res = await invoke<string>(cmd, args);
      setResult({ msg: res, ok: true });
    } catch (e: any) {
      setResult({ msg: String(e), ok: false });
    }
    setLoading(null);
  };

  const actions = [
    { id: 'power', label: t('opt.powerPlan'), icon: Zap, color: 'text-yellow-400', desc: t('opt.powerPlanDesc'), cmd: 'get_active_power_plan' },
    { id: 'game', label: t('opt.gameMode'), icon: Monitor, color: 'text-green-400', desc: t('opt.gameModeDesc'), cmd: 'activate_gaming_mode' },
    { id: 'balanced', label: t('opt.balancedPlan'), icon: Shield, color: 'text-blue-400', desc: t('opt.balancedPlanDesc'), cmd: 'restore_power_plan', args: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e' } },
    { id: 'dns', label: t('opt.flushDns'), icon: Wifi, color: 'text-purple-400', desc: t('opt.flushDnsDesc'), cmd: 'flush_dns' },
    { id: 'disk', label: t('opt.diskCleanup'), icon: HardDrive, color: 'text-orange-400', desc: t('opt.diskCleanupDesc'), cmd: 'open_disk_cleanup' },
    { id: 'task', label: t('opt.taskManager'), icon: Activity, color: 'text-red-400', desc: t('opt.taskManagerDesc'), cmd: 'open_task_manager' },
    { id: 'startup', label: t('opt.startupApps'), icon: Settings, color: 'text-teal-400', desc: t('opt.startupAppsDesc'), cmd: 'open_url', args: { url: 'ms-settings:startupapps' } },
    { id: 'storage', label: t('opt.storageSettings'), icon: HardDrive, color: 'text-orange-400', desc: t('opt.storageSettingsDesc'), cmd: 'open_url', args: { url: 'ms-settings:storagesense' } },
    { id: 'gaming', label: t('opt.gamingSettings'), icon: Monitor, color: 'text-pink-400', desc: t('opt.gamingSettingsDesc'), cmd: 'open_url', args: { url: 'ms-settings:gaming' } },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">{t('opt.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('opt.subtitle')}</p>
      </div>

      {result && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${result.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {result.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {result.msg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map(action => (
          <button key={action.id} onClick={() => run(action.id, action.cmd, action.args)} disabled={loading !== null} className="glass rounded-2xl p-6 hover:border-mvo-borderBright/50 hover:bg-mvo-panelHover/30 transition-all relative overflow-hidden group text-left disabled:opacity-50">
            <div className="relative flex items-start justify-between">
              <div>
                <div className={`p-3 rounded-xl bg-mvo-panelHover mb-4`}>
                  {loading === action.id ? <Loader2 className={`w-6 h-6 ${action.color} animate-spin`} /> : <action.icon className={`w-6 h-6 ${action.color}`} />}
                </div>
                <h3 className="font-semibold text-lg text-mvo-text group-hover:text-cyan-400 transition-colors">{action.label}</h3>
                <p className="text-sm text-mvo-textDim mt-1">{action.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <GlassCard>
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-400" /> {t('opt.quickActions')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('opt.flushDns'), cmd: 'flush_dns' },
            { label: t('opt.diskCleanup'), cmd: 'open_disk_cleanup' },
            { label: t('opt.taskManager'), cmd: 'open_task_manager' },
            { label: t('opt.gamingSettings'), cmd: 'open_url', args: { url: 'ms-settings:gaming' } },
          ].map((a, i) => (
            <button key={i} onClick={() => run(`quick-${i}`, a.cmd, a.args)} disabled={loading !== null} className="px-4 py-3 bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm rounded-xl hover:bg-mvo-border hover:text-mvo-text transition-colors flex items-center gap-2 disabled:opacity-50">
              {loading === `quick-${i}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>{a.label}</span>}
            </button>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
