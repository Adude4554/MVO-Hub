import { useState, useCallback, useEffect } from 'react';
import { GlassCard } from '../components/ui';
import { Search, Play, FolderOpen, Loader2, AlertTriangle, Scan, Check, ChevronDown, ChevronUp, Star, EyeOff, Database, HardDrive, X, Plus, Shield, ShieldAlert, ShieldCheck, Eye, Info } from 'lucide-react';
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
  isFavorite?: boolean;
  isHidden?: boolean;
}

interface ScanV2Result {
  games: ScannedGame[];
  total: number;
  duplicates: number;
  directoriesScanned: number;
  candidatesFound: number;
  errors: number;
  durationMs: number;
  scanType: string;
}

type ScanType = 'quick' | 'full' | 'custom';

export function Scanner() {
  useLocale();
  const [scanning, setScanning] = useState(false);
  const [games, setGames] = useState<ScannedGame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'platform' | 'size' | 'confidence'>('name');
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [dataSource, setDataSource] = useState<'db' | 'scan'>('db');
  const [scanType, setScanType] = useState<ScanType>('quick');
  const [scanResult, setScanResult] = useState<ScanV2Result | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [manualExe, setManualExe] = useState('');
  const [metadataCache, setMetadataCache] = useState<Record<string, any>>({});
  const [resolvingMetadata, setResolvingMetadata] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<Record<string, boolean>>({});
  const [scanningCancelled, setScanningCancelled] = useState(false);
  const [batchResolving, setBatchResolving] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  useEffect(() => { loadFromDB(); }, []);

  const loadFromDB = useCallback(async () => {
    try {
      const dbGames = await invoke<ScannedGame[]>('load_scanned_games_from_db');
      if (dbGames && dbGames.length > 0) {
        setGames(dbGames);
        setDataSource('db');
      }
    } catch (e) {
      console.log('No cached games in DB');
    }
  }, []);

  const startScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setGames([]);
    setScanResult(null);
    try {
      const result = await invoke<ScanV2Result>('scanner_v2_scan', {
        scanType,
        paths: [],
      });
      setGames(result.games);
      setScanResult(result);
      setDataSource('scan');
      try {
        const rows = result.games.map((g: any) => ({
          id: g.id,
          name: g.name,
          platform: g.platform,
          launcher: g.launcher,
          installPath: g.installPath,
          exePath: g.exePath || null,
          appId: g.appId || null,
          version: g.version || null,
          coverPath: g.coverPath || null,
          coverLocal: g.coverLocal || null,
          iconLocal: g.iconLocal || null,
          installSize: g.installSize || 0,
          scanConfidence: g.scanConfidence,
          isInstalled: g.isInstalled,
          isFavorite: false,
          isHidden: false,
          playtimeSeconds: 0,
          lastPlayed: null,
          scannedAt: '',
          workingDir: null,
          launchArgs: null,
          confidenceReasons: '[]',
          scanSource: g.platform,
          driveLetter: '',
          metadataStatus: 'none',
          lastScanId: '',
        }));
        await invoke('save_scanned_games_to_db', { games: rows });
      } catch (e) {
        console.error('Failed to save to DB:', e);
      }
    } catch (e) {
      setError(String(e));
    }
    setScanning(false);
  }, [scanType]);

  const cancelScan = useCallback(async () => {
    try {
      await invoke('scanner_v2_cancel_scan');
      setScanning(false);
    } catch (e) {
      console.error('Failed to cancel:', e);
    }
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    try {
      await invoke('toggle_scanned_game_favorite', { id });
      setGames(prev => prev.map(g => g.id === id ? { ...g, isFavorite: !g.isFavorite } : g));
    } catch (e) {
      setToast({ msg: String(e), ok: false });
    }
  }, []);

  const toggleHidden = useCallback(async (id: string) => {
    try {
      await invoke('toggle_scanned_game_hidden', { id });
      setGames(prev => prev.map(g => g.id === id ? { ...g, isHidden: !g.isHidden } : g));
    } catch (e) {
      setToast({ msg: String(e), ok: false });
    }
  }, []);

  const approveGame = useCallback(async (id: string) => {
    try {
      await invoke('scanner_v2_approve_game', { id });
      setGames(prev => prev.map(g => g.id === id ? { ...g, scanConfidence: 1.0 } : g));
      setToast({ msg: 'Game approved', ok: true });
    } catch (e) {
      setToast({ msg: String(e), ok: false });
    }
  }, []);

  const manualAddGame = useCallback(async () => {
    if (!manualName || !manualPath) return;
    try {
      const game = await invoke<any>('scanner_v2_manual_add_game', {
        name: manualName,
        installPath: manualPath,
        exePath: manualExe || null,
      });
      setGames(prev => [...prev, game]);
      setShowManualAdd(false);
      setManualName('');
      setManualPath('');
      setManualExe('');
      setToast({ msg: `Added ${game.name}`, ok: true });
    } catch (e) {
      setToast({ msg: String(e), ok: false });
    }
  }, [manualName, manualPath, manualExe]);

  const resolveMetadata = useCallback(async (game: ScannedGame) => {
    setResolvingMetadata(game.id);
    try {
      const metadata = await invoke<any>('resolve_game_metadata', { name: game.name, steamAppId: game.appId || null });
      if (metadata) {
        setMetadataCache(prev => ({ ...prev, [game.id]: metadata }));
        setToast({ msg: `Metadata resolved for ${game.name}`, ok: true });
      } else {
        setToast({ msg: `No metadata found for ${game.name}`, ok: false });
      }
    } catch (e) {
      setToast({ msg: String(e), ok: false });
    }
    setResolvingMetadata(null);
  }, []);

  const batchResolveMetadata = useCallback(async () => {
    const unresolved = games.filter(g => !metadataCache[g.id]);
    if (unresolved.length === 0) return;
    setBatchResolving(true);
    setBatchProgress({ done: 0, total: unresolved.length });
    for (let i = 0; i < unresolved.length; i++) {
      const game = unresolved[i];
      try {
        const metadata = await invoke<any>('resolve_game_metadata', { name: game.name, steamAppId: game.appId || null });
        if (metadata) {
          setMetadataCache(prev => ({ ...prev, [game.id]: metadata }));
        }
      } catch (e) {
        console.error(`Failed to resolve metadata for ${game.name}:`, e);
      }
      setBatchProgress({ done: i + 1, total: unresolved.length });
    }
    setBatchResolving(false);
    setToast({ msg: `Metadata resolved for ${unresolved.length} games`, ok: true });
  }, [games, metadataCache]);

  const trackLaunch = useCallback(async (game: ScannedGame) => {
    try {
      await invoke('track_game_launch', { gameId: game.id, name: game.name, platform: game.platform, exePath: game.exePath || '' });
      setActiveSessions(prev => ({ ...prev, [game.id]: true }));
    } catch (e) {
      console.error('Failed to track launch:', e);
    }
  }, []);

  const filteredGames = games
    .filter(g => {
      if (g.isHidden && filter !== 'hidden') return false;
      if (filter === 'all') return true;
      if (filter === 'installed') return g.isInstalled;
      if (filter === 'favorites') return g.isFavorite;
      if (filter === 'review') return g.scanConfidence >= 0.3 && g.scanConfidence < 0.7;
      if (filter === 'hidden') return g.isHidden;
      return g.platform.toLowerCase() === filter.toLowerCase();
    })
    .filter(g => search === '' || g.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'platform') return a.platform.localeCompare(b.platform);
      if (sortBy === 'size') return (b.installSize || 0) - (a.installSize || 0);
      if (sortBy === 'confidence') return b.scanConfidence - a.scanConfidence;
      return 0;
    });

  const platforms = [...new Set(games.map(g => g.platform))].sort();

  const confirmedCount = games.filter(g => g.scanConfidence >= 0.7).length;
  const likelyCount = games.filter(g => g.scanConfidence >= 0.5 && g.scanConfidence < 0.7).length;
  const reviewCount = games.filter(g => g.scanConfidence >= 0.3 && g.scanConfidence < 0.5).length;

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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
      trackLaunch(game);
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
      'Filesystem': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      'Shortcut': 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      'Manual': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
    return colors[platform] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getConfidenceIcon = (conf: number) => {
    if (conf >= 0.7) return <ShieldCheck className="w-4 h-4 text-green-400" />;
    if (conf >= 0.5) return <Shield className="w-4 h-4 text-yellow-400" />;
    if (conf >= 0.3) return <ShieldAlert className="w-4 h-4 text-orange-400" />;
    return <EyeOff className="w-4 h-4 text-gray-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text">{t('scanner.title') || 'Game Scanner V2'}</h1>
          <p className="text-mvo-textDim mt-1 flex items-center gap-2">
            {games.length > 0
              ? `Found ${games.length} games across ${platforms.length} platforms`
              : 'Scan your PC for all installed games'}
            <span className={`text-xs px-2 py-0.5 rounded ${dataSource === 'db' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {dataSource === 'db' ? <><Database className="w-3 h-3 inline mr-1" />Cached</> : <><HardDrive className="w-3 h-3 inline mr-1" />Live</>}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={scanType}
            onChange={e => setScanType(e.target.value as ScanType)}
            className="bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/50 appearance-none cursor-pointer"
          >
            <option value="quick">Quick Scan</option>
            <option value="full">Full Scan</option>
            <option value="custom">Custom Scan</option>
          </select>
          <button
            onClick={() => setShowManualAdd(true)}
            className="px-4 py-2 bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text rounded-xl text-sm flex items-center gap-2 hover:bg-mvo-panelHover transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Game
          </button>
          {games.length > 0 && (
            <button
              onClick={batchResolveMetadata}
              disabled={batchResolving || games.every(g => metadataCache[g.id])}
              className="px-4 py-2 bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text rounded-xl text-sm flex items-center gap-2 hover:bg-mvo-panelHover transition-colors disabled:opacity-50"
            >
              {batchResolving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {batchProgress.done}/{batchProgress.total}</>
              ) : (
                <><Database className="w-4 h-4" /> Resolve All Metadata</>
              )}
            </button>
          )}
          {scanning ? (
            <button
              onClick={cancelScan}
              className="px-6 py-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium transition-all duration-200 flex items-center gap-2"
            >
              <X className="w-5 h-5" />
              Cancel
            </button>
          ) : (
            <button
              onClick={startScan}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2"
            >
              <Scan className="w-5 h-5" />
              {t('scanner.scanButton') || 'Scan PC'}
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${toast.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {toast.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
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

      {/* Scan Stats */}
      {scanResult && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Games Found', value: scanResult.total, color: 'text-cyan-400' },
            { label: 'Confirmed', value: confirmedCount, color: 'text-green-400' },
            { label: 'Likely', value: likelyCount, color: 'text-yellow-400' },
            { label: 'Review', value: reviewCount, color: 'text-orange-400' },
            { label: 'Duration', value: formatDuration(scanResult.durationMs), color: 'text-blue-400' },
          ].map((stat) => (
            <GlassCard key={stat.label} className="p-3 text-center">
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-mvo-textDim">{stat.label}</div>
            </GlassCard>
          ))}
        </div>
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
              <option value="all">All Games</option>
              <option value="installed">Installed Only</option>
              <option value="favorites">Favorites</option>
              <option value="review">Needs Review ({reviewCount})</option>
              <option value="hidden">Hidden</option>
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
              <option value="confidence">Sort by Confidence</option>
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
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : game.iconLocal ? (
                    <img src={game.iconLocal} alt={game.name} className="w-16 h-16 m-auto mt-8" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-mvo-textMuted">
                      {game.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {getConfidenceIcon(game.scanConfidence)}
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getPlatformColor(game.platform)}`}>
                      {game.platform}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-mvo-text truncate">{game.name}</h3>
                  <p className="text-xs text-mvo-textDim mt-1 truncate">{game.launcher}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-mvo-textDim">{formatSize(game.installSize)}</p>
                    <span className="text-xs text-mvo-textMuted">•</span>
                    <p className={`text-xs ${game.scanConfidence >= 0.7 ? 'text-green-400' : game.scanConfidence >= 0.5 ? 'text-yellow-400' : 'text-orange-400'}`}>
                      {(game.scanConfidence * 100).toFixed(0)}% confidence
                    </p>
                  </div>

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
                      {metadataCache[game.id] && (
                        <>
                          {metadataCache[game.id].developer && (
                            <div>
                              <span className="text-mvo-textMuted">Developer:</span>
                              <p className="text-mvo-text">{metadataCache[game.id].developer}</p>
                            </div>
                          )}
                          {metadataCache[game.id].publisher && (
                            <div>
                              <span className="text-mvo-textMuted">Publisher:</span>
                              <p className="text-mvo-text">{metadataCache[game.id].publisher}</p>
                            </div>
                          )}
                          {metadataCache[game.id].release_date && (
                            <div>
                              <span className="text-mvo-textMuted">Release:</span>
                              <p className="text-mvo-text">{metadataCache[game.id].release_date}</p>
                            </div>
                          )}
                          {metadataCache[game.id].genres && metadataCache[game.id].genres.length > 0 && (
                            <div>
                              <span className="text-mvo-textMuted">Genres:</span>
                              <p className="text-mvo-text">{metadataCache[game.id].genres.join(', ')}</p>
                            </div>
                          )}
                          {metadataCache[game.id].description && (
                            <div>
                              <span className="text-mvo-textMuted">Description:</span>
                              <p className="text-mvo-text line-clamp-3">{metadataCache[game.id].description}</p>
                            </div>
                          )}
                        </>
                      )}
                      {activeSessions[game.id] && (
                        <div className="flex items-center gap-2 text-green-400">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-xs font-medium">Currently Playing</span>
                        </div>
                      )}
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
                    {game.scanConfidence < 0.7 && (
                      <button
                        onClick={() => approveGame(game.id)}
                        className="btn-secondary py-2 px-3 text-green-400"
                        title="Approve Game"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => toggleFavorite(game.id)}
                      className={`btn-secondary py-2 px-3 ${game.isFavorite ? 'text-yellow-400' : ''}`}
                      title="Toggle Favorite"
                    >
                      <Star className={`w-4 h-4 ${game.isFavorite ? 'fill-yellow-400' : ''}`} />
                    </button>
                    <button
                      onClick={() => toggleHidden(game.id)}
                      className={`btn-secondary py-2 px-3 ${game.isHidden ? 'text-red-400' : ''}`}
                      title="Toggle Hidden"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                    {!metadataCache[game.id] && (
                      <button
                        onClick={() => resolveMetadata(game)}
                        disabled={resolvingMetadata === game.id}
                        className="btn-secondary py-2 px-3"
                        title="Resolve Metadata"
                      >
                        {resolvingMetadata === game.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />}
                      </button>
                    )}
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

      {/* Manual Add Modal */}
      {showManualAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowManualAdd(false)}>
          <GlassCard className="w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Add Game Manually</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-mvo-textDim">Game Name</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="My Game"
                  className="w-full bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-mvo-textDim">Install Path</label>
                <input
                  type="text"
                  value={manualPath}
                  onChange={e => setManualPath(e.target.value)}
                  placeholder="C:\Games\MyGame"
                  className="w-full bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-mvo-textDim">Executable (optional)</label>
                <input
                  type="text"
                  value={manualExe}
                  onChange={e => setManualExe(e.target.value)}
                  placeholder="C:\Games\MyGame\game.exe"
                  className="w-full bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl mt-1"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={manualAddGame}
                disabled={!manualName || !manualPath}
                className="flex-1 btn-primary py-2 disabled:opacity-50"
              >
                Add Game
              </button>
              <button
                onClick={() => setShowManualAdd(false)}
                className="flex-1 btn-secondary py-2"
              >
                Cancel
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
