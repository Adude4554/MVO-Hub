import { useState, useCallback } from 'react';
import { GlassCard } from '../components/ui';
import { Search, Play, FolderOpen, Loader2, AlertTriangle, Scan, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

interface ScannedGame {
  id: string;
  name: string;
  platform: string;
  launcher: string;
  installPath: string;
  exePath?: string;
  appId?: string;
  version?: string;
  iconPath?: string;
  coverPath?: string;
  bannerPath?: string;
  installSize?: number;
  scanConfidence: number;
  isInstalled: boolean;
  coverLocal?: string;
  iconLocal?: string;
}

interface ScanResult {
  games: ScannedGame[];
  total: number;
  message: string;
}

export function Scanner() {
  useLocale();
  const [scanning, setScanning] = useState(false);
  const [games, setGames] = useState<ScannedGame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'platform' | 'size'>('name');
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const startScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setGames([]);
    try {
      const result = await invoke<ScanResult>('scan_all_platforms');
      setGames(result.games);
    } catch (e) {
      setError(String(e));
    }
    setScanning(false);
  }, []);

  const filteredGames = games
    .filter(g => {
      if (filter === 'all') return true;
      if (filter === 'installed') return g.isInstalled;
      return g.platform.toLowerCase() === filter.toLowerCase();
    })
    .filter(g => search === '' || g.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'platform') return a.platform.localeCompare(b.platform);
      if (sortBy === 'size') return (b.installSize || 0) - (a.installSize || 0);
      return 0;
    });

  const platforms = [...new Set(games.map(g => g.platform))].sort();

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const launchGame = async (game: ScannedGame) => {
    setActionLoading(game.id);
    setToast(null);
    try {
      if (game.platform === 'Steam' && game.appId) {
        const res = await invoke<string>('launch_steam_game', { appId: game.appId });
        setToast({ msg: res, ok: true });
      } else if (game.exePath) {
        const res = await invoke<string>('launch_exe', { path: game.exePath });
        setToast({ msg: res, ok: true });
      } else {
        setToast({ msg: 'No executable found for this game', ok: false });
      }
    } catch (e: any) {
      setToast({ msg: String(e), ok: false });
    }
    setActionLoading(null);
  };

  const openFolder = async (path: string) => {
    try {
      await invoke<string>('open_game_folder', { path });
    } catch (e: any) {
      setToast({ msg: String(e), ok: false });
    }
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      'Steam': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Epic': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'GOG': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      'EA': 'bg-blue-600/20 text-blue-300 border-blue-600/30',
      'Ubisoft': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      'Battle.net': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Riot': 'bg-red-500/20 text-red-400 border-red-500/30',
      'Xbox': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Amazon': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'itch.io': 'bg-red-400/20 text-red-300 border-red-400/30',
      'Rockstar': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Minecraft': 'bg-green-600/20 text-green-300 border-green-600/30',
      'Emulator': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      'Standalone': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };
    return colors[platform] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text">{t('scanner.title') || 'Universal Game Scanner'}</h1>
          <p className="text-mvo-textDim mt-1">
            {games.length > 0
              ? `Found ${games.length} games across ${platforms.length} platforms`
              : 'Scan your PC for all installed games'}
          </p>
        </div>
        <button
          onClick={startScan}
          disabled={scanning}
          className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
        >
          {scanning ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Scan className="w-5 h-5" />
              {t('scanner.scanButton') || 'Scan PC'}
            </>
          )}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${toast.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {toast.ok ? '✓' : '⚠'} {toast.msg}
        </div>
      )}

      {/* Error */}
      {error && (
        <GlassCard className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Scan Failed</h3>
          <p className="text-mvo-textDim">{error}</p>
        </GlassCard>
      )}

      {/* Results */}
      {games.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mvo-textMuted" />
              <input
                type="text"
                placeholder="Search games..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-10 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              />
            </div>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/50 appearance-none cursor-pointer"
            >
              <option value="all">All Platforms</option>
              <option value="installed">Installed Only</option>
              {platforms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/50 appearance-none cursor-pointer"
            >
              <option value="name">Sort by Name</option>
              <option value="platform">Sort by Platform</option>
              <option value="size">Sort by Size</option>
            </select>
          </div>

          {/* Platform Summary */}
          <div className="flex flex-wrap gap-2">
            {platforms.map(p => {
              const count = games.filter(g => g.platform === p).length;
              return (
                <button
                  key={p}
                  onClick={() => setFilter(filter === p ? 'all' : p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${getPlatformColor(p)} ${filter === p ? 'ring-2 ring-cyan-400/50' : ''}`}
                >
                  {p}: {count}
                </button>
              );
            })}
          </div>

          {/* Game Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredGames.map(game => (
              <GlassCard key={game.id} className="p-0 overflow-hidden">
                {/* Cover */}
                <div className="aspect-video bg-gradient-to-br from-mvo-panelHover to-mvo-panel relative overflow-hidden">
                  {(game.coverLocal || game.coverPath) ? (
                    <img
                      src={game.coverLocal || game.coverPath}
                      alt={game.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={e => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                      }}
                    />
                  ) : game.iconLocal ? (
                    <img
                      src={game.iconLocal}
                      alt={game.name}
                      className="w-16 h-16 m-auto mt-8"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-mvo-textMuted">
                      {game.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getPlatformColor(game.platform)}`}>
                      {game.platform}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-mvo-text truncate">{game.name}</h3>
                  <p className="text-xs text-mvo-textDim mt-1 truncate">{game.launcher}</p>
                  <p className="text-xs text-mvo-textDim">{formatSize(game.installSize)}</p>

                  {/* Expand/Collapse */}
                  <button
                    onClick={() => setExpandedGame(expandedGame === game.id ? null : game.id)}
                    className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    {expandedGame === game.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Details
                  </button>

                  {/* Expanded Details */}
                  {expandedGame === game.id && (
                    <div className="mt-3 space-y-2 text-xs">
                      <div>
                        <span className="text-mvo-textMuted">Install Path:</span>
                        <p className="text-mvo-text truncate">{game.installPath}</p>
                      </div>
                      {game.exePath && (
                        <div>
                          <span className="text-mvo-textMuted">Executable:</span>
                          <p className="text-mvo-text truncate">{game.exePath}</p>
                        </div>
                      )}
                      {game.version && (
                        <div>
                          <span className="text-mvo-textMuted">Version:</span>
                          <p className="text-mvo-text">{game.version}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-mvo-textMuted">Confidence:</span>
                        <p className="text-mvo-text">{(game.scanConfidence * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => launchGame(game)}
                      disabled={actionLoading === game.id || !game.exePath}
                      className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {actionLoading === game.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <><Play className="w-4 h-4" /> Play</>
                      )}
                    </button>
                    <button
                      onClick={() => openFolder(game.installPath)}
                      className="btn-secondary py-2 px-3"
                      title="Open Folder"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Empty State */}
          {filteredGames.length === 0 && (
            <GlassCard className="text-center">
              <Search className="w-12 h-12 text-mvo-textMuted mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No games found</h3>
              <p className="text-mvo-textDim">Try adjusting your search or filter</p>
            </GlassCard>
          )}
        </>
      )}

      {/* Empty State (no scan yet) */}
      {!scanning && games.length === 0 && !error && (
        <GlassCard className="text-center">
          <Scan className="w-16 h-16 text-cyan-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Ready to Scan</h3>
          <p className="text-mvo-textDim mb-6">
            Click "Scan PC" to discover all installed games across Steam, Epic, GOG, EA, Ubisoft, and more.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-md mx-auto text-sm">
            {['Steam', 'Epic', 'GOG', 'EA', 'Ubisoft', 'Battle.net', 'Riot', 'Xbox'].map(p => (
              <div key={p} className="flex items-center gap-2 text-mvo-textDim">
                <Check className="w-4 h-4 text-cyan-400" />
                {p}
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
