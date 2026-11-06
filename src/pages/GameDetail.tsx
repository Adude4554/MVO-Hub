import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FolderOpen,
  Gamepad2,
  ImagePlus,
  Loader2,
  Play,
  Save,
  Square,
  Terminal,
  Trophy,
} from 'lucide-react';
import { GlassCard } from '../components/ui';
import { GameArtwork } from '../components/GameArtwork';
import { isValidArgs, parseLaunchArgs } from '../lib/launchArgs';

/**
 * Game Detail — cinematic banner, quick play, playtime, launch arguments,
 * executable overrides and achievement progress for a single game.
 *
 * Opened via `?page=gamedetail&game=<id>`; the game id is read from the URL so
 * the view works from a deep link as well as from the library.
 */

type ProcessStateValue = 'launching' | 'running' | 'ending';

interface GameConfig {
  gameId: string;
  launchArgs: string;
  exeOverride: string | null;
  workingDir: string | null;
  customCover: string | null;
  customBanner: string | null;
  playtimeSeconds: number;
  lastPlayed: string | null;
  updatedAt: string;
}

interface LaunchSpec {
  gameId: string;
  gameName: string;
  exePath: string;
  workingDir: string | null;
  args: string[];
}

interface PlaytimeStats {
  totalSeconds: number;
  sessionCount: number;
  averageSeconds: number;
  lastPlayed: string | null;
  recent: Array<{ id: number; startedAt: string; endedAt: string; durationSeconds: number }>;
}

interface AchievementStateResponse {
  gameId: string;
  total: number;
  unlocked: number;
  pointsUnlocked: number;
  pointsTotal: number;
  completionPercent: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  points: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

interface GameEntry {
  id: string;
  name: string;
  app_id?: string | null;
  source: string;
  install_dir: string;
  executable_hint?: string;
}

const EMPTY_CONFIG: GameConfig = {
  gameId: '',
  launchArgs: '',
  exeOverride: null,
  workingDir: null,
  customCover: null,
  customBanner: null,
  playtimeSeconds: 0,
  lastPlayed: null,
  updatedAt: '',
};

const EMPTY_STATS: PlaytimeStats = {
  totalSeconds: 0,
  sessionCount: 0,
  averageSeconds: 0,
  lastPlayed: null,
  recent: [],
};

/** "3h 42m" — hours are dropped below an hour, minutes below a minute. */
export function formatPlaytime(seconds: number): string {
  if (!seconds || seconds < 60) return `${seconds || 0}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function readGameId(): string | null {
  return new URLSearchParams(window.location.search).get('game');
}

function BackButton() {
  return (
    <button
      onClick={() => {
        const url = new URL(window.location.href);
        url.searchParams.set('page', 'gamelibrary');
        url.searchParams.delete('game');
        window.location.href = url.toString();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Library
    </button>
  );
}

export function GameDetail() {
  const gameId = useMemo(readGameId, []);

  const [game, setGame] = useState<GameEntry | null>(null);
  const [config, setConfig] = useState<GameConfig>(EMPTY_CONFIG);
  const [stats, setStats] = useState<PlaytimeStats>(EMPTY_STATS);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achievementState, setAchievementState] = useState<AchievementStateResponse | null>(null);

  const [argDraft, setArgDraft] = useState('');
  const [exeDraft, setExeDraft] = useState('');
  const [workDirDraft, setWorkDirDraft] = useState('');

  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processState, setProcessState] = useState<ProcessStateValue | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const parsedArgs = useMemo(() => parseLaunchArgs(argDraft), [argDraft]);

  const load = useCallback(async () => {
    if (!gameId) {
      setLoading(false);
      return;
    }
    try {
      const [allGames, nextConfig, nextStats, nextAchievements, nextState] = await Promise.all([
        invoke<{ games: GameEntry[] }>('scan_custom_games'),
        invoke<GameConfig>('get_game_config', { gameId }),
        invoke<PlaytimeStats>('get_game_playtime', { gameId }),
        invoke<Achievement[]>('achievements_list', { gameId }),
        invoke<AchievementStateResponse>('achievements_state', { gameId }).catch(() => null),
      ]);
      const match = allGames?.games?.find(g => g.id === gameId) ?? null;
      setGame(match);
      setConfig({ ...EMPTY_CONFIG, ...nextConfig });
      setArgDraft(nextConfig?.launchArgs ?? '');
      setExeDraft(nextConfig?.exeOverride ?? '');
      setWorkDirDraft(nextConfig?.workingDir ?? '');
      setStats({ ...EMPTY_STATS, ...nextStats });
      setAchievements(Array.isArray(nextAchievements) ? nextAchievements : []);
      setAchievementState(nextState && nextState.total >= 0 ? nextState : null);
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the live process badge in sync.
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const state = await invoke<ProcessStateValue | null>('get_game_process_state', { gameId });
        if (!cancelled) setProcessState(state);
      } catch {
        /* monitor is best-effort */
      }
    };
    tick();
    const id = window.setInterval(tick, 4000);

    const unlisten: Array<() => void> = [];
    (async () => {
      for (const event of ['games:session-started', 'games:session-ended']) {
        try {
          unlisten.push(await listen(event, () => load()));
        } catch {
          /* events are best-effort */
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      unlisten.forEach(fn => fn());
    };
  }, [gameId, load]);

  const saveConfig = async () => {
    if (!gameId) return;
    if (!isValidArgs(parsedArgs)) {
      setError(parsedArgs.errors.join('; '));
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const next = await invoke<GameConfig>('update_game_config', {
        gameId,
        patch: {
          launchArgs: argDraft,
          exeOverride: exeDraft.trim() || null,
          workingDir: workDirDraft.trim() || null,
        },
      });
      setConfig(next);
      setNotice('Game settings saved.');
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const launch = async () => {
    if (!gameId) return;
    setLaunching(true);
    setError('');
    setNotice('');
    try {
      const spec = await invoke<LaunchSpec>('launch_game_with_args', { gameId });
      setProcessState('launching');
      setNotice(
        spec.args.length
          ? `Launched with ${spec.args.length} argument${spec.args.length === 1 ? '' : 's'}.`
          : 'Launched.',
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLaunching(false);
    }
  };

  const stop = async () => {
    if (!gameId) return;
    try {
      const next = await invoke<PlaytimeStats>('stop_game_session', { gameId });
      setStats({ ...EMPTY_STATS, ...next });
      setProcessState(null);
      setNotice('Session ended and playtime saved.');
    } catch (e) {
      setError(String(e));
    }
  };

  const uploadImage = async (file: File) => {
    if (!gameId) return;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    try {
      const next = await invoke<GameConfig>('upload_game_image', {
        gameId,
        kind: 'cover',
        dataBase64: base64,
      });
      setConfig(next);
      setNotice('Cover updated.');
    } catch (e) {
      setError(String(e));
    }
  };

  if (!gameId) {
    return (
      <div className="space-y-4">
        <BackButton />
        <GlassCard className="p-10 text-center">
          <Gamepad2 className="mx-auto mb-3 h-10 w-10 text-mvo-crimsonBright" />
          <p className="text-sm font-medium text-white">No game selected</p>
          <p className="mt-1 text-xs text-mvo-textDim">
            Open a game from your library to see its details.
          </p>
        </GlassCard>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-mvo-crimsonBright" />
      </div>
    );
  }

  // The artwork component resolves the full fallback chain (custom upload →
  // scanner cache → Steam CDN → gradient), so nothing needs to be pre-computed.
  const artGame = game ?? (gameId ? { id: gameId, name: gameId } : null);

  const isRunning = processState === 'running' || processState === 'launching';
  const unlocked = achievements.filter(a => a.unlocked);
  const completion =
    achievementState?.completionPercent ??
    (achievements.length ? Math.round((unlocked.length / achievements.length) * 100) : 0);

  return (
    <div className="space-y-5" data-testid="game-detail">
      {/* Cinematic banner */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0e18]">
        <div className="relative h-52 w-full sm:h-64">
          <GameArtwork
            game={artGame}
            kind="hero"
            override={config.customBanner}
            alt=""
            loading="eager"
            className="h-full w-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050812] via-[#050812]/70 to-transparent" />
        </div>

        <div className="relative -mt-20 flex flex-wrap items-end justify-between gap-4 px-5 pb-5">
          <div className="flex items-end gap-4">
            <div className="h-32 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#0a0e18] shadow-xl">
              <GameArtwork
                game={artGame}
                kind="poster"
                override={config.customCover}
                alt={game?.name ?? 'Game'}
                loading="eager"
                initialsClassName="font-display text-xl font-bold text-white/70"
              />
            </div>
            <div className="pb-1">
              <h1 className="font-display text-2xl font-bold text-white">{game?.name ?? gameId}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-mvo-textDim">
                {game?.source && (
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5">{game.source}</span>
                )}
                <span>Last played {formatWhen(stats.lastPlayed ?? config.lastPlayed)}</span>
                {isRunning && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-400/30 bg-green-400/10 px-2 py-0.5 font-medium text-green-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                    {processState === 'launching' ? 'Launching' : 'Running'}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-1">
            <BackButton />
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <ImagePlus className="h-3.5 w-3.5" /> Cover
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
                e.target.value = '';
              }}
            />
            {isRunning ? (
              <button
                onClick={stop}
                className="inline-flex items-center gap-2 rounded-full border border-mvo-crimson/40 bg-mvo-crimson/15 px-5 py-2.5 text-[12.5px] font-semibold text-mvo-crimsonBright transition-colors hover:bg-mvo-crimson/25"
              >
                <Square className="h-3.5 w-3.5" /> End session
              </button>
            ) : (
              <button
                onClick={launch}
                disabled={launching}
                className="inline-flex items-center gap-2 rounded-full bg-mvo-crimson px-5 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_6px_24px_-6px_var(--mvo-crimson-glow)] transition-all hover:bg-mvo-crimsonBright disabled:opacity-60"
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                Play
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-mvo-crimson/30 bg-mvo-crimsonDim p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-mvo-crimsonBright" />
          <p className="break-all text-xs text-mvo-crimsonBright">{error}</p>
        </div>
      )}
      {notice && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-green-400/25 bg-green-400/[0.07] p-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
          <p className="text-xs text-green-400">{notice}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Playtime */}
        <GlassCard className="p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Clock className="h-4 w-4 text-mvo-crimsonBright" /> Playtime
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-mvo-crimson/25 bg-mvo-crimsonDim p-3">
              <p className="text-[10px] uppercase tracking-wider text-mvo-textMuted">Total</p>
              {/* `get_game_playtime` already returns the authoritative total
                  (same source as `config.playtimeSeconds`); summing them would
                  double-count. */}
              <p className="mt-0.5 font-mono text-lg text-mvo-crimsonBright">
                {formatPlaytime(stats.totalSeconds || config.playtimeSeconds)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-mvo-textMuted">Sessions</p>
              <p className="mt-0.5 font-mono text-lg text-white">{stats.sessionCount}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-mvo-textMuted">Avg. session</p>
              <p className="mt-0.5 font-mono text-lg text-white">{formatPlaytime(stats.averageSeconds)}</p>
            </div>
          </div>

          {stats.recent.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/15 px-3">
              {stats.recent.map(session => (
                <div
                  key={session.id}
                  className="flex items-center justify-between border-t border-white/[0.05] py-2 text-[11px] first:border-t-0"
                >
                  <span className="text-mvo-textDim">{formatWhen(session.endedAt)}</span>
                  <span className="font-mono text-white/70">{formatPlaytime(session.durationSeconds)}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Achievement progress */}
        <GlassCard className="p-5">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Trophy className="h-4 w-4 text-mvo-crimsonBright" /> Achievements
          </h2>
          {achievements.length === 0 ? (
            <p className="mt-4 text-xs text-mvo-textDim">No achievements registered for this game.</p>
          ) : (
            <>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="font-mono text-2xl text-mvo-crimsonBright">{completion}%</span>
                <span className="text-[11px] text-mvo-textDim">
                  {unlocked.length} / {achievements.length}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-mvo-crimson to-mvo-crimsonBright"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <div className="mt-3 space-y-1.5">
                {achievements.slice(0, 4).map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-[11px]">
                    {a.unlocked ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/15" />
                    )}
                    <span className={a.unlocked ? 'truncate text-white/85' : 'truncate text-white/35'}>
                      {a.name}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassCard>
      </div>

      {/* Launch configuration */}
      <GlassCard className="p-5">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Terminal className="h-4 w-4 text-mvo-crimsonBright" /> Launch options
        </h2>
        <p className="mt-1 text-[11.5px] text-mvo-textDim">
          Arguments are passed to the game as-is. Quotes group a value containing spaces.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="gd-launch-args" className="mb-1 block text-[11px] font-medium text-mvo-textDim">Launch arguments</label>
            <input
              id="gd-launch-args"
              value={argDraft}
              onChange={e => setArgDraft(e.target.value)}
              placeholder='-windowed -novid -name "My Player"'
              className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
              aria-invalid={!isValidArgs(parsedArgs)}
            />
            {isValidArgs(parsedArgs) ? (
              parsedArgs.args.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {parsedArgs.args.map((arg, i) => (
                    <span
                      key={`${arg}-${i}`}
                      className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/70"
                    >
                      {arg || '""'}
                    </span>
                  ))}
                </p>
              )
            ) : (
              <p className="mt-1.5 text-[10.5px] text-mvo-crimsonBright">{parsedArgs.errors[0]}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="gd-exe" className="mb-1 block text-[11px] font-medium text-mvo-textDim">
                Executable override
              </label>
              <input
                id="gd-exe"
                value={exeDraft}
                onChange={e => setExeDraft(e.target.value)}
                placeholder={game?.executable_hint ?? 'C:/Games/My Game/game.exe'}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
              />
            </div>
            <div>
              <label htmlFor="gd-workdir" className="mb-1 block text-[11px] font-medium text-mvo-textDim">Working directory</label>
              <input
                id="gd-workdir"
                value={workDirDraft}
                onChange={e => setWorkDirDraft(e.target.value)}
                placeholder={game?.install_dir ?? 'C:/Games/My Game'}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={saveConfig}
              disabled={saving || !isValidArgs(parsedArgs)}
              className="btn-primary inline-flex items-center gap-2 text-xs disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
            {game?.install_dir && (
              <button
                onClick={() => invoke('open_game_folder', { path: game.install_dir }).catch(e => setError(String(e)))}
                className="btn-secondary inline-flex items-center gap-2 text-xs"
              >
                <FolderOpen className="h-3.5 w-3.5" /> Open folder
              </button>
            )}
            <span className="text-[10px] text-mvo-textMuted">
              Saved {formatWhen(config.updatedAt)}
            </span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
