import { useState } from 'react';
import { GlassCard } from '../components/ui';
import {
  Search, Loader2, AlertTriangle, Download, ExternalLink, Package,
  Trash2, Play, FolderOpen, Star, RefreshCw, Pause, X, CheckCircle,
  ArrowDownToLine, HardDrive, Clock, ChevronDown, ShieldCheck, Folder, RotateCcw,
} from 'lucide-react';
import {
  useGameVaultStore, useGameVaultLibrary, useGameVaultDownloads,
  StoreItem, InstalledGame,
} from '../hooks/useGameVault';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

type Tab = 'store' | 'library' | 'downloads';

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function GameVault() {
  useLocale();
  const [tab, setTab] = useState<Tab>('store');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text flex items-center gap-2">
            <Package className="w-6 h-6 text-cyan-400" /> GameVault
          </h1>
          <p className="text-mvo-textDim mt-1">{t('vault.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-mvo-panel/50 rounded-xl border border-mvo-border/30 w-fit">
        {([
          { key: 'store' as Tab, label: t('vault.storeTab'), icon: Package },
          { key: 'library' as Tab, label: t('vault.libraryTab'), icon: HardDrive },
          { key: 'downloads' as Tab, label: t('vault.downloadsTab'), icon: ArrowDownToLine },
        ]).map(tabItem => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === tabItem.key
                ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
                : 'text-mvo-textDim hover:text-mvo-text border border-transparent'
            }`}
          >
            <tabItem.icon className="w-4 h-4" />
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'store' && <StoreTab />}
      {tab === 'library' && <LibraryTab />}
      {tab === 'downloads' && <DownloadsTab />}
    </div>
  );
}

function StoreTab() {
  useLocale();
  const {
    items, loading, error, search, setSearch,
    category, setCategory, categories, installedIds,
    installingIds, install, refresh,
  } = useGameVaultStore();

  const [selected, setSelected] = useState<StoreItem | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const handleInstall = async (item: StoreItem) => {
    setToast(null);
    const result = await install(item);
    setToast({ msg: result.message, ok: result.ok });
    if (result.ok) setTimeout(() => setToast(null), 5000);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;

  if (error) return (
    <GlassCard className="text-center">
      <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold mb-2">{t('vault.failedLoad')}</h3>
      <p className="text-mvo-textDim">{error}</p>
      <button onClick={refresh} className="btn-primary mt-4">{t('common.retry')}</button>
    </GlassCard>
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mvo-textMuted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('library.search')}
            className="input pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              category === 'all'
                ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
                : 'bg-mvo-panelHover/50 text-mvo-textDim border border-mvo-border/50 hover:border-cyan-400/30'
            }`}
          >
            {t('library.all')}
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
                  : 'bg-mvo-panelHover/50 text-mvo-textDim border border-mvo-border/50 hover:border-cyan-400/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-mvo-textDim">{items.length} {t('vault.gamesCount')}</p>

      {items.length === 0 ? (
        <GlassCard className="text-center p-12">
          <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('vault.noGames')}</h3>
          <p className="text-mvo-textDim">{t('vault.noGamesHint')}</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map(item => (
            <StoreCard
              key={item.id}
              item={item}
              installed={installedIds.has(String(item.id))}
              installing={installingIds.has(String(item.id))}
              onInstall={() => handleInstall(item)}
              onSelect={() => setSelected(item)}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${toast.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {selected && (
        <StoreDetail
          item={selected}
          installed={installedIds.has(String(selected.id))}
          installing={installingIds.has(String(selected.id))}
          onInstall={() => handleInstall(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function StoreCard({ item, installed, installing, onInstall, onSelect }: {
  item: StoreItem;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
  onSelect: () => void;
}) {
  useLocale();
  const coverUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${item.appid}/header.jpg`;

  return (
    <GlassCard className="group p-0 overflow-hidden flex flex-col h-full" hover onClick={onSelect}>
      <div className="relative">
        <img src={coverUrl} alt={item.name} className="w-full h-auto aspect-[460/215] object-cover" loading="lazy"
          onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).className = 'w-full aspect-[460/215] bg-mvo-panel flex items-center justify-center'; }} />
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium bg-mvo-bg/80 text-mvo-textDim border border-mvo-border/50">
          {item.category}
        </span>
        {installed && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400 border border-green-400/30 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> {t('vault.installed')}
          </span>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-mvo-text truncate group-hover:text-cyan-400 transition-colors">{item.name}</h3>
        <p className="text-xs text-mvo-textDim mt-1 line-clamp-2">{item.description}</p>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="text-[10px] text-mvo-textDim">ID: {item.appid}</span>
          {item.downloadLink ? (
            installed ? (
              <span className="btn-secondary py-1 px-3 text-xs opacity-60">{t('vault.installed')}</span>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); onInstall(); }}
                disabled={installing}
                className="btn-primary py-1 px-3 text-xs"
              >
                {installing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                {installing ? t('vault.installing') : t('vault.install')}
              </button>
            )
          ) : (
            <span className="text-[10px] text-mvo-textDim opacity-50">{t('vault.noDownload')}</span>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function StoreDetail({ item, installed, installing, onInstall, onClose }: {
  item: StoreItem;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  useLocale();
  const coverUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${item.appid}/header.jpg`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <GlassCard className="max-w-lg w-full mx-4 p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
        <img src={coverUrl} alt={item.name} className="w-full h-auto aspect-[460/215] object-cover"
          onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).className = 'w-full aspect-[460/215] bg-mvo-panel flex items-center justify-center'; }} />
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-mvo-text">{item.name}</h2>
              <p className="text-xs text-mvo-textDim">{item.category} &middot; App ID: {item.appid}</p>
            </div>
            <button onClick={onClose} className="text-mvo-textDim hover:text-mvo-text text-xl leading-none">&times;</button>
          </div>
          <p className="text-sm text-mvo-textDim mb-4">{item.description}</p>
          <div className="flex gap-3">
            {installed ? (
              <span className="btn-secondary opacity-60 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> {t('vault.installed')}
              </span>
            ) : item.downloadLink ? (
              <button onClick={onInstall} disabled={installing} className="btn-primary">
                {installing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {installing ? t('vault.installing') : t('vault.install')}
              </button>
            ) : (
              <span className="btn-secondary opacity-50">{t('vault.noDownloadAvailable')}</span>
            )}
            <a href={`https://store.steampowered.com/app/${item.appid}`} target="_blank" rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-2">
              <ExternalLink className="w-4 h-4" /> {t('vault.steam')}
            </a>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function LibraryTab() {
  useLocale();
  const {
    library, loading, error, search, setSearch, sortBy, setSortBy,
    uninstall, launch, toggleFavorite, repair, openFolder, refresh, formatSize,
  } = useGameVaultLibrary();

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;

  if (error) return (
    <GlassCard className="text-center">
      <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold mb-2">{t('vault.failedLoadLibrary')}</h3>
      <p className="text-mvo-textDim">{error}</p>
      <button onClick={refresh} className="btn-primary mt-4">{t('common.retry')}</button>
    </GlassCard>
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mvo-textMuted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('library.searchInstalled')}
            className="input pl-9"
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="input w-auto min-w-[140px]"
        >
          <option value="name">{t('vault.sortName')}</option>
          <option value="installed_at">{t('vault.sortDate')}</option>
          <option value="last_played">{t('vault.sortLastPlayed')}</option>
        </select>
      </div>

      <p className="text-xs text-mvo-textDim">{library.length} {t('vault.installedGames')}</p>

      {library.length === 0 ? (
        <GlassCard className="text-center p-12">
          <HardDrive className="w-16 h-16 text-mvo-textDim mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('vault.noGamesInstalled')}</h3>
          <p className="text-mvo-textDim">{t('vault.browseStore')}</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {library.map(game => (
            <GlassCard key={game.id} className="flex items-center gap-4 p-4" hover>
              {game.cover ? (
                <img src={game.cover} alt={game.name} className="w-16 h-12 rounded object-cover flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-16 h-12 rounded bg-mvo-panel flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">🎮</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-mvo-text truncate">{game.name}</h3>
                  <button onClick={() => toggleFavorite(game.id)} className="flex-shrink-0">
                    <Star className={`w-3.5 h-3.5 ${game.is_favorite ? 'text-yellow-400 fill-yellow-400' : 'text-mvo-textDim'}`} />
                  </button>
                </div>
                <p className="text-xs text-mvo-textDim">{game.developer} &middot; v{game.version} &middot; {game.size_bytes > 0 ? formatSize(game.size_bytes) : ''}</p>
                {game.last_played && !isNaN(Number(game.last_played)) && (
                  <p className="text-[10px] text-mvo-textDim flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {t('vault.lastPlayed')} {new Date(Number(game.last_played) * 1000).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => launch(game.id)} className="btn-primary py-1.5 px-3 text-xs" title={t('vault.launch')}>
                  <Play className="w-3.5 h-3.5 mr-1" /> {t('library.play')}
                </button>
                <button onClick={() => openFolder(game.id)} className="btn-secondary py-1.5 px-2 text-xs" title={t('library.openFolder')}>
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => repair(game.id)} className="btn-secondary py-1.5 px-2 text-xs" title={t('vault.verifyIntegrity')}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                </button>
                {confirmDelete === game.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { uninstall(game.id); setConfirmDelete(null); }} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">
                      {t('vault.confirm')}
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="text-xs text-mvo-textDim hover:text-mvo-text px-1">
                      {t('vault.cancel')}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(game.id)} className="btn-secondary py-1.5 px-2 text-xs text-red-400 hover:text-red-300" title={t('vault.uninstall')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}

function DownloadsTab() {
  useLocale();
  const {
    downloads, activeDownloads, progress, extractProgress,
    loading, cancel, retry, removeDownload, formatSize, formatSpeed, refresh,
  } = useGameVaultDownloads();

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;

  if (downloads.length === 0) return (
    <GlassCard className="text-center p-12">
      <ArrowDownToLine className="w-16 h-16 text-mvo-textDim mx-auto mb-4" />
      <h3 className="text-lg font-semibold mb-2">{t('vault.noDownloads')}</h3>
      <p className="text-mvo-textDim">{t('vault.browseStoreDownload')}</p>
    </GlassCard>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-mvo-textDim">{downloads.length} {t('vault.downloadCount')}</p>
        <button onClick={refresh} className="px-3 py-1.5 bg-mvo-panelHover/50 text-mvo-textDim border border-mvo-border/50 hover:text-mvo-text rounded-xl text-xs font-medium transition-all">
          <RefreshCw className="w-3 h-3 mr-1 inline" /> {t('common.refresh')}
        </button>
      </div>

      {activeDownloads.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-mvo-text mb-3 flex items-center gap-2">
            <Download className="w-4 h-4 text-cyan-400" /> {t('vault.active')} ({activeDownloads.length})
          </h3>
          <div className="space-y-2">
            {activeDownloads.map(item => {
              const prog = progress.get(item.id);
              const extProg = extractProgress.get(item.id);
              const pct = prog?.progress ?? item.progress;
              const speed = prog?.speed_bytes ?? item.speed_bytes;
              const downloaded = prog?.downloaded_bytes ?? item.downloaded_bytes;
              const total = prog?.total_bytes ?? item.total_bytes;

              return (
                <GlassCard key={item.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-mvo-text text-sm">{item.name}</h4>
                    <button onClick={() => cancel(item.id)} className="text-red-400 hover:text-red-300 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {extProg ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-mvo-textDim">
                        <span>{t('vault.extracting')}</span>
                        <span>{extProg.extracted_files}/{extProg.total_files} files</span>
                      </div>
                      <div className="w-full bg-mvo-panel/50 rounded-full h-2">
                        <div className="bg-green-400 h-2 rounded-full transition-all" style={{ width: `${extProg.progress}%` }} />
                      </div>
                      <p className="text-[10px] text-mvo-textDim truncate">{extProg.current_file}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-mvo-textDim">
                        <span>{formatSize(downloaded)} / {formatSize(total)}</span>
                        <span>
                          {formatSpeed(speed)}
                          {speed > 0 && total > 0 && ` · ETA ${formatEta((total - downloaded) / speed)}`}
                          {' · '}{Math.round(pct)}%
                        </span>
                      </div>
                      <div className="w-full bg-mvo-panel/50 rounded-full h-2">
                        <div className="bg-cyan-400 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      {downloads.filter(d => d.status !== 'downloading').length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-mvo-text mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-mvo-textDim" /> {t('vault.history')} ({downloads.filter(d => d.status !== 'downloading').length})
          </h3>
          <div className="space-y-2">
            {downloads.filter(d => d.status !== 'downloading').map(item => (
              <GlassCard key={item.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    ) : item.status === 'cancelled' ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <div>
                      <h4 className="font-medium text-mvo-text text-sm">{item.name}</h4>
                      <p className="text-[10px] text-mvo-textDim">
                        {item.status === 'completed' ? t('vault.statusInstalled') : item.status === 'failed' ? t('vault.statusFailed') : item.status === 'cancelled' ? t('vault.statusCancelled') : item.status}
                      </p>
                      {item.error && (
                        <p className="text-[10px] text-red-400/80 mt-1 max-w-md">{item.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(item.status === 'failed' || item.status === 'cancelled') && (
                      <button
                        onClick={() => retry(item)}
                        className="text-cyan-400 hover:text-cyan-300 p-1"
                        title="Retry download"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => removeDownload(item.id)}
                      className="text-mvo-textDim hover:text-red-400 p-1"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      item.status === 'completed' ? 'bg-green-400/10 text-green-400' :
                      item.status === 'cancelled' ? 'bg-yellow-400/10 text-yellow-400' :
                      'bg-red-400/10 text-red-400'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
