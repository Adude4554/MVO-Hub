import { useState } from 'react';
import { GlassCard } from '../components/ui';
import { GameArtwork } from '../components/GameArtwork';
import { Search, Star, Play, FolderOpen, Loader2, AlertTriangle } from 'lucide-react';
import { useGames } from '../hooks/useGames';
import { invoke } from '@tauri-apps/api/core';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function GameLibrary() {
  useLocale();
  const { games, allGames, steamInfo, loading, error, refresh, filter, setFilter, search, setSearch } = useGames();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'source' | 'recent'>('name');

  const sortedGames = [...games].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'source') return a.source.localeCompare(b.source);
    if (sortBy === 'recent') return (b.last_played || 0) - (a.last_played || 0);
    return 0;
  });

  const launchGame = async (game: any) => {
    setActionLoading(game.id);
    setToast(null);
    try {
      if (game.source === 'Steam' && game.app_id) {
        const res = await invoke<string>('launch_steam_game', { appId: String(game.app_id) });
        setToast({ msg: res, ok: true });
      } else if (game.executable_hint) {
        const res = await invoke<string>('launch_exe', { path: game.executable_hint });
        setToast({ msg: res, ok: true });
      } else {
        setToast({ msg: t('library.noExe'), ok: false });
      }
    } catch (e: any) {
      setToast({ msg: String(e), ok: false });
    }
    setActionLoading(null);
  };

  /** Open the Game Detail view; the id travels in the URL so it deep-links. */
  const openGameDetail = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', 'gamedetail');
    url.searchParams.set('game', id);
    window.location.href = url.toString();
  };

  const openFolder = async (path: string) => {
    try {
      await invoke<string>('open_game_folder', { path });
    } catch (e: any) {
      setToast({ msg: String(e), ok: false });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;
      if (error) return <GlassCard className="text-center"><AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" /><h3 className="text-lg font-semibold mb-2">{t('library.failedLoad')}</h3><p className="text-mvo-textDim">{error}</p></GlassCard>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text">{t('library.title')}</h1>
          <p className="text-mvo-textDim mt-1">{allGames.length} games • {steamInfo?.found ? t('library.steamDetected') : t('library.steamNotFound')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mvo-textMuted" />
            <input type="text" placeholder={t('library.search')} value={search} onChange={e => setSearch(e.target.value)} className="bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-10 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/50 w-64" />
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/50 appearance-none cursor-pointer">
            <option value="all">{t('library.all')}</option>
            <option value="steam">{t('library.steam')}</option>
            <option value="manual">{t('library.manual')}</option>
            <option value="favorites">{t('library.favorites')}</option>
            <option value="recent">{t('library.recent')}</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-mvo-panelHover/50 border border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/50 appearance-none cursor-pointer">
            <option value="name">{t('library.sortName')}</option>
            <option value="source">{t('library.sortSource')}</option>
            <option value="recent">{t('library.sortRecent')}</option>
          </select>
          <button onClick={refresh} className="px-4 py-2 bg-mvo-panelHover/50 text-mvo-textDim border border-mvo-border/50 hover:text-mvo-text hover:bg-mvo-border rounded-xl font-medium transition-all duration-200 disabled:opacity-50" disabled={loading}>
            <Loader2 className="w-4 h-4 mr-2 inline" /> {t('common.refresh')}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${toast.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {toast.ok ? '✓' : '⚠'} {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sortedGames.length === 0 ? (
          <div className="col-span-full glass rounded-2xl p-12 text-center">
            <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('vault.noGames')}</h3>
            <p className="text-mvo-textDim">{t('library.noGamesHint')}</p>
          </div>
        ) : (
          sortedGames.map(game => (
            <GlassCard key={game.id} className="group p-0 overflow-hidden flex flex-col h-full stat-card">
              <div className="aspect-video bg-gradient-to-br from-mvo-panelHover to-mvo-panel relative overflow-hidden">
                <GameArtwork
                  game={game}
                  kind="header"
                  alt={game.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  initialsClassName="font-display text-2xl font-bold text-white/70"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
                  <span className="text-xs px-2 py-1 rounded bg-mvo-bg/80 backdrop-blur text-mvo-textDim">{game.source}</span>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <button
                  onClick={() => openGameDetail(game.id)}
                  className="truncate text-left font-semibold text-mvo-text transition-colors group-hover:text-mvo-crimsonBright hover:text-mvo-crimsonBright"
                  title={t('library.details')}
                >
                  {game.name}
                </button>
                <p className="text-xs text-mvo-textDim mt-1 truncate">{game.executable_hint || game.install_dir}</p>
                <div className="mt-auto pt-3 flex items-center gap-2">
                  <button onClick={() => launchGame(game)} disabled={actionLoading === game.id} className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2">
                    {actionLoading === game.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4" /> {t('library.play')}</>}
                  </button>
                  <button onClick={() => openFolder(game.install_dir)} className="btn-secondary py-2 px-3" title={t('library.openFolder')}>
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}
