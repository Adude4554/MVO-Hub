import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  HardDriveDownload,
  HardDriveUpload,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trophy,
} from 'lucide-react';
import { GlassCard } from '../components/ui';

/**
 * Cloud & Achievements.
 *
 * Mirrors the Rust `cloud` module: save-sync status per tracked file, unresolved
 * conflicts, and the achievement ledger. Everything is read-only here except
 * "Sync now" and conflict resolution — scanning is triggered by the games
 * themselves via `cloud_scan_saves`.
 */

type SaveStateValue = 'inSync' | 'localAhead' | 'remoteAhead' | 'conflict' | 'never';
type ConflictResolution = 'keepLocal' | 'keepRemote' | 'keepBoth';

interface CloudSaveRecord {
  id: number;
  gameId: string;
  gameName: string;
  localPath: string;
  localHash: string;
  remoteHash: string | null;
  localModifiedMs: number;
  localSizeBytes: number;
  syncedHash: string | null;
  syncedAt: string | null;
  updatedAt: string;
}

interface SaveConflict {
  save: CloudSaveRecord;
  remoteHash: string;
  localModifiedMs: number;
  message: string;
}

interface SyncStatus {
  trackedSaves: number;
  inSync: number;
  localAhead: number;
  remoteAhead: number;
  conflicts: number;
  neverSynced: number;
  pendingUploads: number;
  lastSyncAt: string | null;
  achievementsUnlocked: number;
  achievementsTotal: number;
}

interface Achievement {
  id: string;
  gameId: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  unlocked: boolean;
  unlockedAt: string | null;
  recordedAt: string;
}

const EMPTY_STATUS: SyncStatus = {
  trackedSaves: 0,
  inSync: 0,
  localAhead: 0,
  remoteAhead: 0,
  conflicts: 0,
  neverSynced: 0,
  pendingUploads: 0,
  lastSyncAt: null,
  achievementsUnlocked: 0,
  achievementsTotal: 0,
};

/**
 * Derive a save's state on the client using the same three-way rule as Rust
 * (`CloudSaveRecord::state`): compare local, remote and the synced ancestor.
 */
export function deriveSaveState(save: CloudSaveRecord): SaveStateValue {
  const remote = save.remoteHash;
  if (!remote) return save.syncedAt ? 'inSync' : 'never';
  if (save.localHash === remote) return 'inSync';

  const base = save.syncedHash;
  if (!base) return 'remoteAhead';

  const localAhead = save.localHash !== base;
  const remoteAhead = remote !== base;
  if (localAhead && remoteAhead) return 'conflict';
  if (localAhead) return 'localAhead';
  if (remoteAhead) return 'remoteAhead';
  return 'inSync';
}

const STATE_META: Record<SaveStateValue, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  inSync: { label: 'In sync', tone: 'text-green-400 border-green-400/30 bg-green-400/10', icon: CheckCircle2 },
  localAhead: { label: 'Local newer', tone: 'text-mvo-crimsonBright border-mvo-crimson/35 bg-mvo-crimsonDim', icon: HardDriveUpload },
  remoteAhead: { label: 'Cloud newer', tone: 'text-sky-400 border-sky-400/30 bg-sky-400/10', icon: HardDriveDownload },
  conflict: { label: 'Conflict', tone: 'text-amber-400 border-amber-400/35 bg-amber-400/10', icon: ShieldAlert },
  never: { label: 'Not synced', tone: 'text-white/45 border-white/10 bg-white/[0.03]', icon: CloudOff },
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return '—';
  return hash.slice(0, 8);
}

function StatTile({ label, value, accent }: { label: string; value: number | string; accent?: 'crimson' | 'amber' | 'sky' }) {
  const tone =
    accent === 'crimson'
      ? 'border-mvo-crimson/25 bg-mvo-crimsonDim text-mvo-crimsonBright'
      : accent === 'amber'
        ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
        : accent === 'sky'
          ? 'border-sky-400/25 bg-sky-400/10 text-sky-400'
          : 'border-white/[0.07] bg-white/[0.02] text-white';
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 font-mono text-lg">{value}</p>
    </div>
  );
}

function ConflictCard({
  conflict,
  busy,
  onResolve,
}: {
  conflict: SaveConflict;
  busy: boolean;
  onResolve: (c: SaveConflict, r: ConflictResolution) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white">{conflict.save.gameName}</p>
          <p className="mt-0.5 text-[11.5px] text-amber-300/90">{conflict.message}</p>
          <p className="mt-1 truncate font-mono text-[10px] text-mvo-textMuted">{conflict.save.localPath}</p>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
            <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2 py-1.5">
              <p className="text-mvo-textMuted">Local</p>
              <p className="font-mono text-mvo-crimsonBright">{shortHash(conflict.save.localHash)}</p>
              <p className="text-mvo-textMuted">{formatWhen(new Date(conflict.localModifiedMs).toISOString())}</p>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2 py-1.5">
              <p className="text-mvo-textMuted">Cloud</p>
              <p className="font-mono text-sky-400">{shortHash(conflict.remoteHash)}</p>
              <p className="text-mvo-textMuted">{formatWhen(conflict.save.syncedAt)}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => onResolve(conflict, 'keepLocal')}
              className="rounded-lg border border-mvo-crimson/40 bg-mvo-crimson/15 px-3 py-1.5 text-[11px] font-medium text-mvo-crimsonBright transition-colors hover:bg-mvo-crimson/25 disabled:opacity-50"
            >
              Keep local
            </button>
            <button
              disabled={busy}
              onClick={() => onResolve(conflict, 'keepRemote')}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
            >
              Keep cloud
            </button>
            <button
              disabled={busy}
              onClick={() => onResolve(conflict, 'keepBoth')}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
            >
              Keep both
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveRow({ save }: { save: CloudSaveRecord }) {
  const state = deriveSaveState(save);
  const meta = STATE_META[state];
  const Icon = meta.icon;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] py-2.5 first:border-t-0">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-white/90">{save.gameName}</p>
        <p className="truncate font-mono text-[10px] text-mvo-textMuted">{save.localPath}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden font-mono text-[10px] text-mvo-textMuted sm:inline">
          {formatBytes(save.localSizeBytes)} · {shortHash(save.localHash)}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.tone}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>
    </div>
  );
}

function AchievementRow({ achievement }: { achievement: Achievement }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
        achievement.unlocked
          ? 'border-mvo-crimson/25 bg-mvo-crimsonDim'
          : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          achievement.unlocked ? 'bg-mvo-crimson/20 text-mvo-crimsonBright' : 'bg-white/[0.05] text-white/30'
        }`}
      >
        <Trophy className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-[12.5px] font-semibold ${achievement.unlocked ? 'text-white' : 'text-white/55'}`}>
            {achievement.name}
          </p>
          {achievement.points > 0 && (
            <span
              className={`shrink-0 font-mono text-[10.5px] ${
                achievement.unlocked ? 'text-mvo-crimsonBright' : 'text-white/30'
              }`}
            >
              {achievement.points} pts
            </span>
          )}
        </div>
        {achievement.description && (
          <p className="mt-0.5 line-clamp-2 text-[10.5px] text-mvo-textDim">{achievement.description}</p>
        )}
        <p className="mt-1 text-[10px] text-mvo-textMuted">
          {achievement.unlocked ? `Unlocked ${formatWhen(achievement.unlockedAt)}` : 'Locked'}
          <span className="ml-2 opacity-60">{achievement.gameId}</span>
        </p>
      </div>
    </div>
  );
}

export function CloudAchievements() {
  const [status, setStatus] = useState<SyncStatus>(EMPTY_STATUS);
  const [saves, setSaves] = useState<CloudSaveRecord[]>([]);
  const [conflicts, setConflicts] = useState<SaveConflict[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextSaves, nextConflicts, nextAchievements] = await Promise.all([
        invoke<SyncStatus>('cloud_get_status'),
        invoke<CloudSaveRecord[]>('cloud_list_saves'),
        invoke<SaveConflict[]>('cloud_detect_conflicts'),
        invoke<Achievement[]>('achievements_list', { gameId: null }),
      ]);
      setStatus({ ...EMPTY_STATUS, ...nextStatus });
      setSaves(Array.isArray(nextSaves) ? nextSaves : []);
      setConflicts(Array.isArray(nextConflicts) ? nextConflicts : []);
      setAchievements(Array.isArray(nextAchievements) ? nextAchievements : []);
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when the backend reports a change made outside this view.
  useEffect(() => {
    const unlisten: Array<() => void> = [];
    const subscribe = async () => {
      for (const event of ['cloud:saves-synced', 'cloud:achievement-unlocked', 'cloud:save-conflict']) {
        try {
          unlisten.push(await listen(event, () => { load(); }));
        } catch {
          // Events are best-effort; polling via manual refresh still works.
        }
      }
    };
    subscribe();
    return () => unlisten.forEach(fn => fn());
  }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    setNotice('');
    try {
      const next = await invoke<SyncStatus>('cloud_sync_now');
      setStatus({ ...EMPTY_STATUS, ...next });
      await load();
      setNotice('Uploads flushed to the cloud queue.');
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  };

  const resolve = async (conflict: SaveConflict, resolution: ConflictResolution) => {
    setResolving(conflict.save.localPath);
    setNotice('');
    try {
      await invoke('cloud_resolve_conflict', {
        gameId: conflict.save.gameId,
        localPath: conflict.save.localPath,
        resolution,
      });
      await load();
      setNotice(`Resolved "${conflict.save.gameName}" (${resolution.replace(/^keep/, 'kept ')}).`);
    } catch (e) {
      setError(String(e));
    } finally {
      setResolving(null);
    }
  };

  const visibleAchievements = useMemo(() => {
    if (filter === 'unlocked') return achievements.filter(a => a.unlocked);
    if (filter === 'locked') return achievements.filter(a => !a.unlocked);
    return achievements;
  }, [achievements, filter]);

  const completion = status.achievementsTotal
    ? Math.round((status.achievementsUnlocked / status.achievementsTotal) * 100)
    : 0;
  const healthy = status.conflicts === 0 && status.pendingUploads === 0;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-mvo-crimsonBright" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="cloud-achievements">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
            <Cloud className="h-6 w-6 text-mvo-crimsonBright" />
            Cloud &amp; Achievements
          </h1>
          <p className="mt-1 text-sm text-mvo-textDim">
            Save-file sync state and your achievement ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary flex items-center gap-2 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="btn-primary flex items-center gap-2 text-xs disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-mvo-crimson/30 bg-mvo-crimsonDim p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-mvo-crimsonBright" />
          <p className="break-all text-xs text-mvo-crimsonBright">{error}</p>
        </div>
      )}
      {notice && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-green-400/25 bg-green-400/[0.07] p-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
          <p className="text-xs text-green-400">{notice}</p>
        </div>
      )}

      {/* Status overview */}
      <GlassCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            {healthy ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : (
              <CloudOff className="h-4 w-4 text-amber-400" />
            )}
            Sync status
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-mvo-textMuted">
            <span>
              Last synced <span className="text-white/70">{formatWhen(status.lastSyncAt)}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${
                healthy
                  ? 'border-green-400/30 bg-green-400/10 text-green-400'
                  : 'border-amber-400/30 bg-amber-400/10 text-amber-400'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${healthy ? 'bg-green-400' : 'bg-amber-400'}`} />
              {healthy ? 'All clear' : 'Action needed'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Tracked saves" value={status.trackedSaves} />
          <StatTile label="In sync" value={status.inSync} />
          <StatTile label="Local newer" value={status.localAhead} accent="crimson" />
          <StatTile label="Cloud newer" value={status.remoteAhead} accent="sky" />
          <StatTile label="Conflicts" value={status.conflicts} accent={status.conflicts > 0 ? 'amber' : undefined} />
          <StatTile label="Pending uploads" value={status.pendingUploads} accent={status.pendingUploads > 0 ? 'crimson' : undefined} />
        </div>
      </GlassCard>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <GlassCard className="p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-amber-400">
            <ShieldAlert className="h-4 w-4" /> Save conflicts ({conflicts.length})
          </h2>
          <p className="mb-4 text-[11.5px] text-mvo-textDim">
            These saves changed both locally and in the cloud. Nothing is overwritten until you choose.
          </p>
          <div className="space-y-3">
            {conflicts.map(c => (
              <ConflictCard
                key={`${c.save.gameId}:${c.save.localPath}`}
                conflict={c}
                busy={resolving === c.save.localPath}
                onResolve={resolve}
              />
            ))}
          </div>
        </GlassCard>
      )}

      {/* Save files */}
      <GlassCard className="p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-white">
          <HardDriveUpload className="h-4 w-4 text-mvo-crimsonBright" /> Save files
        </h2>
        <p className="mb-3 text-[11.5px] text-mvo-textDim">
          Checksums are verified against the last synced copy before anything uploads.
        </p>
        {saves.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-xs text-mvo-textDim">
            No save files are being tracked yet.
          </p>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3">
            {saves.map(save => (
              <SaveRow key={save.id} save={save} />
            ))}
          </div>
        )}
      </GlassCard>

      {/* Achievements */}
      <GlassCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <Trophy className="h-4 w-4 text-mvo-crimsonBright" /> Achievements
            </h2>
            <p className="mt-1 text-[11.5px] text-mvo-textDim">
              {status.achievementsUnlocked} of {status.achievementsTotal} unlocked
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
            {(['all', 'unlocked', 'locked'] as const).map(key => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                  filter === key ? 'bg-mvo-crimson/20 text-mvo-crimsonBright' : 'text-white/45 hover:text-white/75'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-1 flex justify-between text-[10.5px] text-mvo-textMuted">
            <span>Completion</span>
            <span className="font-mono text-mvo-crimsonBright">{completion}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-mvo-crimson to-mvo-crimsonBright transition-all"
              style={{ width: `${completion}%` }}
            />
          </div>
        </div>

        {visibleAchievements.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-xs text-mvo-textDim">
            {achievements.length === 0 ? 'No achievements registered yet.' : `No ${filter} achievements.`}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visibleAchievements.map(a => (
              <AchievementRow key={a.id} achievement={a} />
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
