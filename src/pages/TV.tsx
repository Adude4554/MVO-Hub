import { useState, useEffect, useCallback } from 'react';
import { Play, Loader2, AlertTriangle, Search, ChevronLeft } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FeaturedRow } from '../components/FeaturedRow';

interface TVShow {
  imdb_id: string;
  tmdb_id: string | null;
  title: string;
  embed_url: string;
  embed_url_tmdb: string | null;
  quality: string;
  time_added: string;
}

interface TVProps {
  settings?: { tmdb_api_key?: string };
}

const GRADIENTS = [
  ['#8b5cf6', '#d946ef'],
  ['#0ea5e9', '#6366f1'],
  ['#10b981', '#22c55e'],
  ['#f59e0b', '#eab308'],
  ['#f43f5e', '#ec4899'],
  ['#06b6d4', '#14b8a6'],
  ['#3b82f6', '#8b5cf6'],
  ['#d946ef', '#a855f7'],
];

function getGradient(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function extractYear(title: string) {
  const match = title.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

function cleanTitle(title: string) {
  return title.replace(/\s*\b(19|20)\d{2}\b\s*$/, '').trim();
}

function posterSrc(localPath: string) {
  return convertFileSrc(localPath.replace(/\\/g, '/'));
}

const FEATURED_TV = [
  // Supernatural
  { title: 'Supernatural', tmdbId: '1622', mediaType: 'tv' as const },
  // Constantine Universe
  { title: 'Constantine', tmdbId: '39221', mediaType: 'tv' as const },
  { title: 'Legends of Tomorrow', tmdbId: '69050', mediaType: 'tv' as const },
  { title: 'Arrow', tmdbId: '1412', mediaType: 'tv' as const },
  { title: 'The Flash', tmdbId: '60735', mediaType: 'tv' as const },
  // Sci-Fi
  { title: 'Fringe', tmdbId: '7788', mediaType: 'tv' as const },
  { title: 'Person of Interest', tmdbId: '1432', mediaType: 'tv' as const },
  { title: 'Dark', tmdbId: '66732', mediaType: 'tv' as const },
  { title: 'Travelers', tmdbId: '66926', mediaType: 'tv' as const },
  { title: 'Timeless', tmdbId: '67158', mediaType: 'tv' as const },
  { title: 'Lost', tmdbId: '4392', mediaType: 'tv' as const },
  { title: 'The Expanse', tmdbId: '63639', mediaType: 'tv' as const },
  { title: 'Westworld', tmdbId: '63243', mediaType: 'tv' as const },
  { title: 'Severance', tmdbId: '114461', mediaType: 'tv' as const },
  { title: 'Silo', tmdbId: '125988', mediaType: 'tv' as const },
  // Marvel
  { title: 'Daredevil', tmdbId: '61469', mediaType: 'tv' as const },
  { title: 'Loki', tmdbId: '84958', mediaType: 'tv' as const },
  { title: 'WandaVision', tmdbId: '85271', mediaType: 'tv' as const },
  { title: 'Moon Knight', tmdbId: '93717', mediaType: 'tv' as const },
  // DC
  { title: 'Smallville', tmdbId: '4589', mediaType: 'tv' as const },
  { title: 'Gotham', tmdbId: '4046', mediaType: 'tv' as const },
  { title: 'Lucifer', tmdbId: '63174', mediaType: 'tv' as const },
  { title: 'The Sandman', tmdbId: '90843', mediaType: 'tv' as const },
  // Fantasy
  { title: 'Grimm', tmdbId: '8592', mediaType: 'tv' as const },
  { title: 'The Vampire Diaries', tmdbId: '18164', mediaType: 'tv' as const },
  // Mystery & Horror
  { title: 'Stranger Things', tmdbId: '66732', mediaType: 'tv' as const },
  { title: 'The Walking Dead', tmdbId: '1402', mediaType: 'tv' as const },
  { title: 'The Last of Us', tmdbId: '100088', mediaType: 'tv' as const },
  // Action
  { title: 'Reacher', tmdbId: '108978', mediaType: 'tv' as const },
  { title: '24', tmdbId: '1984', mediaType: 'tv' as const },
  { title: 'Prison Break', tmdbId: '2288', mediaType: 'tv' as const },
];

export function TV({ settings }: TVProps) {
  const [shows, setShows] = useState<TVShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShow, setSelectedShow] = useState<TVShow | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [maxPages, setMaxPages] = useState(1);
  const [posters, setPosters] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('https://vidsrcme.ru/tvshows/latest/page-1.json')
      .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then(data => {
        if (cancelled) return;
        setShows(data.result || []);
        setMaxPages(data.pages || 1);
        setCurrentPage(1);
        setLoading(false);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (shows.length === 0) return;
    let cancelled = false;

    const loadPosters = async () => {
      for (const show of shows) {
        if (cancelled || !show.tmdb_id) continue;
        if (posters[show.tmdb_id]) continue;

        try {
          const cached = await invoke<string>('get_cached_poster', { tmdbId: show.tmdb_id });
          if (cached && !cancelled) {
            setPosters(prev => ({ ...prev, [show.tmdb_id!]: posterSrc(cached) }));
            continue;
          }
        } catch {}

        try {
          const result = await invoke<{ poster_path: string }>('fetch_tmdb_poster', {
            tmdbId: show.tmdb_id,
            mediaType: 'tv',
            apiKey: '',
          });
          if (result.poster_path && !cancelled) {
            setPosters(prev => ({ ...prev, [show.tmdb_id!]: posterSrc(result.poster_path) }));
          }
        } catch {}

        await new Promise(r => setTimeout(r, 250));
      }
    };
    loadPosters();
    return () => { cancelled = true; };
  }, [shows]);

  const loadMore = useCallback(() => {
    if (loadingMore || currentPage >= maxPages) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    fetch(`https://vidsrcme.ru/tvshows/latest/page-${nextPage}.json`)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then(data => {
        setShows(prev => [...prev, ...(data.result || [])]);
        setCurrentPage(nextPage);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [currentPage, maxPages, loadingMore]);

  const filtered = shows.filter(s => {
    if (!search) return true;
    return s.title.toLowerCase().includes(search.toLowerCase());
  });

  // Player view — inline in content area
  if (selectedShow) {
    const embedSrc = selectedShow.tmdb_id
      ? `https://vidsrcme.ru/embed/tv/${selectedShow.tmdb_id}`
      : selectedShow.embed_url;
    return (
      <div className="space-y-4 h-full flex flex-col">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedShow(null)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mvo-panel border border-mvo-border/50 hover:bg-mvo-panelHover text-mvo-text text-sm transition-all"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="font-display text-lg font-bold text-mvo-text truncate">{cleanTitle(selectedShow.title)}</h2>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-400/20 text-cyan-400">{selectedShow.quality}</span>
        </div>
        <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-mvo-border/30" style={{ height: 'calc(100vh - 140px)' }}>
          <iframe
            src={embedSrc}
            className="w-full h-full border-0"
            frameBorder="0"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write"
          />
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-2xl font-bold text-mvo-text">TV Shows</h1>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />}
      </div>

      <FeaturedRow
        items={FEATURED_TV}
        onSelect={(item) => setSelectedShow({ ...item, embed_url: item.embed_url, imdb_id: '', tmdb_id: null, embed_url_tmdb: null, time_added: '' })}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mvo-textMuted" />
        <input
          type="text"
          placeholder="Search TV shows..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-mvo-panel border border-mvo-border/50 text-mvo-text placeholder-mvo-textMuted focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 text-sm"
        />
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-mvo-textMuted">
          <p className="text-lg">{search ? 'No shows found' : 'No shows available'}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {filtered.map(show => (
          <ShowCard
            key={show.imdb_id}
            show={show}
            poster={show.tmdb_id ? posters[show.tmdb_id] : undefined}
            onClick={() => setSelectedShow(show)}
          />
        ))}
      </div>

      {!loading && currentPage < maxPages && !search && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-xl bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/20 transition-all disabled:opacity-50 text-sm font-medium"
          >
            {loadingMore ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</span>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function ShowCard({ show, poster, onClick }: { show: TVShow; poster?: string; onClick: () => void }) {
  const year = extractYear(show.title);
  const name = cleanTitle(show.title);
  const [c1, c2] = getGradient(show.title);
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl overflow-hidden bg-mvo-panel border border-mvo-border/30 hover:border-cyan-400/40 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-400/5"
    >
      <div className="relative aspect-[2/3] overflow-hidden">
        {poster ? (
          <img
            src={poster}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : null}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: poster ? 'transparent' : `linear-gradient(135deg, ${c1}, ${c2})` }}
        >
          {!poster && <span className="text-5xl font-bold text-white/80">{initial}</span>}
        </div>
        <div className="absolute top-2 right-2 z-10">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white backdrop-blur-sm">
            {show.quality}
          </span>
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center z-10">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm text-mvo-text line-clamp-1">{name}</h3>
        <div className="flex items-center gap-2 mt-1 text-xs text-mvo-textMuted">
          {year && <span>{year}</span>}
          <span>•</span>
          <span>{show.time_added.split(' ')[0]}</span>
        </div>
      </div>
    </div>
  );
}
