import { useState } from 'react';
import { GlassCard } from '../components/ui';
import { Zap, Battery, Monitor, Activity, Wifi, HardDrive, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function SystemBoost() {
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

  const modes = [
    { id: 'maximum', name: t('boost.maximum'), icon: Zap, color: 'text-red-400', desc: t('boost.maximumDesc'), actions: [t('boost.maximumAction1'), t('boost.maximumAction2'), t('boost.maximumAction3'), t('boost.maximumAction4')], cmd: 'activate_gaming_mode' },
    { id: 'balanced', name: t('boost.balanced'), icon: Battery, color: 'text-amber-400', desc: t('boost.balancedDesc'), actions: [t('boost.balancedAction1'), t('boost.balancedAction2'), t('boost.balancedAction3')], cmd: 'restore_power_plan', args: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e' } },
    { id: 'power', name: t('boost.powerSaver'), icon: Battery, color: 'text-green-400', desc: t('boost.powerSaverDesc'), actions: [t('boost.powerSaverAction1'), t('boost.powerSaverAction2'), t('boost.powerSaverAction3')], cmd: 'restore_power_plan', args: { guid: 'a1841308-3541-4fab-bc81-f71556f20b4a' } },
    { id: 'stream', name: t('boost.streaming'), icon: Monitor, color: 'text-purple-400', desc: t('boost.streamingDesc'), actions: [t('boost.streamingAction1'), t('boost.streamingAction2'), t('boost.streamingAction3'), t('boost.streamingAction4')], cmd: 'activate_gaming_mode' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">{t('boost.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('boost.subtitle')}</p>
      </div>

      {result && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${result.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {result.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {result.msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modes.map(mode => (
          <button key={mode.id} onClick={() => run(mode.id, mode.cmd, mode.args)} disabled={loading !== null} className="glass rounded-2xl p-6 hover:border-mvo-borderBright/50 transition-all relative overflow-hidden group text-left disabled:opacity-50">
            <div className="relative flex items-start justify-between">
              <div>
                <div className={`p-3 rounded-xl bg-mvo-panelHover mb-4`}>
                  {loading === mode.id ? <Loader2 className={`w-6 h-6 ${mode.color} animate-spin`} /> : <mode.icon className={`w-6 h-6 ${mode.color}`} />}
                </div>
                <h3 className="font-display text-lg font-bold text-mvo-text mb-1">{mode.name}</h3>
                <p className="text-sm text-mvo-textDim">{mode.desc}</p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-mvo-border/30 space-y-2">
              {mode.actions.map((action, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-mvo-textDim">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/50" />
                  {action}
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      <GlassCard>
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-400" /> {t('boost.quickActions')}</h3>
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
