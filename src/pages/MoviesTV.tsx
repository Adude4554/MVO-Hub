import { useState, useEffect, useCallback } from 'react';
import { Play, Loader2, AlertTriangle, Search, ChevronLeft } from 'lucide-react';
import { FeaturedRow } from '../components/FeaturedRow';

interface MediaItem {
  imdb_id: string;
  tmdb_id: string | null;
  title: string;
  embed_url: string;
  embed_url_tmdb: string | null;
  quality: string;
  time_added: string;
}

const GRADIENTS = [
  ['#06b6d4', '#2563eb'],
  ['#a855f7', '#ec4899'],
  ['#f97316', '#ef4444'],
  ['#22c55e', '#14b8a6'],
  ['#eab308', '#f97316'],
  ['#6366f1', '#a855f7'],
  ['#ec4899', '#f43f5e'],
  ['#14b8a6', '#06b6d4'],
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

function tmdbPosterUrl(tmdbId: string, mediaType: 'movie' | 'tv') {
  // Returns TMDB CDN URL — will 404 if no poster, img tag handles fallback
  return `https://image.tmdb.org/t/p/w500/poster`;
}

const FEATURED_MOVIES = [
  { title: 'Iron Man', tmdbId: '1726', imdbId: 'tt0371746', mediaType: 'movie' as const },
  { title: 'Avengers: Endgame', tmdbId: '299536', imdbId: 'tt4154796', mediaType: 'movie' as const },
  { title: 'Spider-Man: No Way Home', tmdbId: '634649', imdbId: 'tt10872600', mediaType: 'movie' as const },
  { title: 'Doctor Strange', tmdbId: '284054', imdbId: 'tt1211837', mediaType: 'movie' as const },
  { title: 'Deadpool & Wolverine', tmdbId: '533535', imdbId: 'tt6263850', mediaType: 'movie' as const },
  { title: 'Black Panther', tmdbId: '284053', imdbId: 'tt1825683', mediaType: 'movie' as const },
  { title: 'The Dark Knight', tmdbId: '155', imdbId: 'tt0468569', mediaType: 'movie' as const },
  { title: 'The Batman', tmdbId: '414906', imdbId: 'tt1877830', mediaType: 'movie' as const },
  { title: 'Man of Steel', tmdbId: '496243', imdbId: 'tt1386682', mediaType: 'movie' as const },
  { title: 'Joker', tmdbId: '475557', imdbId: 'tt7286456', mediaType: 'movie' as const },
  { title: 'Interstellar', tmdbId: '157336', imdbId: 'tt0816692', mediaType: 'movie' as const },
  { title: 'Inception', tmdbId: '27205', imdbId: 'tt1375666', mediaType: 'movie' as const },
  { title: 'The Matrix', tmdbId: '603', imdbId: 'tt0133093', mediaType: 'movie' as const },
  { title: 'Dune', tmdbId: '438631', imdbId: 'tt1160419', mediaType: 'movie' as const },
  { title: 'Dune: Part Two', tmdbId: '693134', imdbId: 'tt15239678', mediaType: 'movie' as const },
  { title: 'Avatar', tmdbId: '19995', imdbId: 'tt0499549', mediaType: 'movie' as const },
  { title: 'Edge of Tomorrow', tmdbId: '137113', imdbId: 'tt1631861', mediaType: 'movie' as const },
  { title: 'John Wick: Chapter 4', tmdbId: '603692', imdbId: 'tt10356390', mediaType: 'movie' as const },
  { title: 'Top Gun: Maverick', tmdbId: '361743', imdbId: 'tt1745960', mediaType: 'movie' as const },
  { title: 'Mad Max: Fury Road', tmdbId: '76341', imdbId: 'tt1392170', mediaType: 'movie' as const },
  { title: 'The Lord of the Rings', tmdbId: '120', imdbId: 'tt0120737', mediaType: 'movie' as const },
  { title: 'Harry Potter', tmdbId: '671', imdbId: 'tt0241527', mediaType: 'movie' as const },
  { title: 'Back to the Future', tmdbId: '105', imdbId: 'tt0088763', mediaType: 'movie' as const },
  { title: 'Tenet', tmdbId: '577922', imdbId: 'tt6723592', mediaType: 'movie' as const },
  { title: 'Predestination', tmdbId: '244235', imdbId: 'tt2397535', mediaType: 'movie' as const },
];

const FEATURED_TV = [
  { title: 'Supernatural', tmdbId: '1622', mediaType: 'tv' as const },
  { title: 'Constantine', tmdbId: '39221', mediaType: 'tv' as const },
  { title: 'Legends of Tomorrow', tmdbId: '69050', mediaType: 'tv' as const },
  { title: 'Arrow', tmdbId: '1412', mediaType: 'tv' as const },
  { title: 'The Flash', tmdbId: '60735', mediaType: 'tv' as const },
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
  { title: 'Daredevil', tmdbId: '61469', mediaType: 'tv' as const },
  { title: 'Loki', tmdbId: '84958', mediaType: 'tv' as const },
  { title: 'WandaVision', tmdbId: '85271', mediaType: 'tv' as const },
  { title: 'Moon Knight', tmdbId: '93717', mediaType: 'tv' as const },
  { title: 'Smallville', tmdbId: '4589', mediaType: 'tv' as const },
  { title: 'Gotham', tmdbId: '4046', mediaType: 'tv' as const },
  { title: 'Lucifer', tmdbId: '63174', mediaType: 'tv' as const },
  { title: 'The Sandman', tmdbId: '90843', mediaType: 'tv' as const },
  { title: 'Grimm', tmdbId: '8592', mediaType: 'tv' as const },
  { title: 'The Vampire Diaries', tmdbId: '18164', mediaType: 'tv' as const },
  { title: 'Stranger Things', tmdbId: '85922', mediaType: 'tv' as const },
  { title: 'The Walking Dead', tmdbId: '1402', mediaType: 'tv' as const },
  { title: 'The Last of Us', tmdbId: '100088', mediaType: 'tv' as const },
  { title: 'Reacher', tmdbId: '108978', mediaType: 'tv' as const },
  { title: '24', tmdbId: '1984', mediaType: 'tv' as const },
  { title: 'Prison Break', tmdbId: '2288', mediaType: 'tv' as const },
];

const TMDB_KEY = '7c8599abf8bf4728727be7d446c108aa';

export function MoviesTV() {
  const [tab, setTab] = useState<'movies' | 'tv'>('movies');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [selectedEmbed, setSelectedEmbed] = useState<string>('');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [maxPages, setMaxPages] = useState(1);
  const [posters, setPosters] = useState<Record<string, string>>({});

  // Fetch items when tab changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);
    setSearch('');
    setCurrentPage(1);

    const url = tab === 'movies'
      ? 'https://vidsrcme.ru/movies/latest/page-1.json'
      : 'https://vidsrcme.ru/tvshows/latest/page-1.json';

    fetch(url)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then(data => {
        if (cancelled) return;
        setItems(data.result || []);
        setMaxPages(data.pages || 1);
        setLoading(false);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [tab]);

  // Fetch posters via TMDB API (get poster_path, use CDN URL directly) — throttled to 2 concurrent, 500ms apart
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const CONCURRENT = 2;
    const DELAY = 500;

    const fetchOne = async (item: MediaItem) => {
      if (cancelled || !item.tmdb_id || posters[item.tmdb_id]) return;
      try {
        const mediaType = tab === 'movies' ? 'movie' : 'tv';
        const resp = await fetch(`https://api.themoviedb.org/3/${mediaType}/${item.tmdb_id}?api_key=${TMDB_KEY}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.poster_path && !cancelled) {
          setPosters(prev => ({ ...prev, [item.tmdb_id!]: `https://image.tmdb.org/t/p/w500${data.poster_path}` }));
        }
      } catch {}
    };

    const loadPosters = async () => {
      const pending = items.filter(i => i.tmdb_id && !posters[i.tmdb_id]);
      for (let i = 0; i < pending.length; i += CONCURRENT) {
        if (cancelled) break;
        await Promise.all(pending.slice(i, i + CONCURRENT).map(fetchOne));
        if (!cancelled && i + CONCURRENT < pending.length) {
          await new Promise(r => setTimeout(r, DELAY));
        }
      }
    };
    loadPosters();
    return () => { cancelled = true; };
  }, [items, tab]);

  const loadMore = useCallback(() => {
    if (loadingMore || currentPage >= maxPages) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    const url = tab === 'movies'
      ? `https://vidsrcme.ru/movies/latest/page-${nextPage}.json`
      : `https://vidsrcme.ru/tvshows/latest/page-${nextPage}.json`;

    fetch(url)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then(data => {
        setItems(prev => [...prev, ...(data.result || [])]);
        setCurrentPage(nextPage);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [currentPage, maxPages, loadingMore, tab]);

  const filtered = items.filter(m => {
    if (!search) return true;
    return m.title.toLowerCase().includes(search.toLowerCase());
  });

  // Player view
  if (selectedItem) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => { setSelectedItem(null); setSelectedEmbed(''); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mvo-panel border border-mvo-border/50 hover:bg-mvo-panelHover text-mvo-text text-sm transition-all"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="font-display text-lg font-bold text-mvo-text truncate">{cleanTitle(selectedItem.title)}</h2>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-400/20 text-cyan-400">{selectedItem.quality}</span>
        </div>
        <div className="flex-1 min-h-0 mt-3 rounded-xl overflow-hidden border border-mvo-border/30">
          <iframe
            src={selectedEmbed}
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
        <h1 className="font-display text-2xl font-bold text-mvo-text">Movies & TV Shows</h1>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />}
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('movies')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'movies'
              ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
              : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover border border-transparent'
          }`}
        >
          🎬 Movies
        </button>
        <button
          onClick={() => setTab('tv')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'tv'
              ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
              : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover border border-transparent'
          }`}
        >
          📺 TV Shows
        </button>
      </div>

      {/* Featured */}
      <FeaturedRow
        items={tab === 'movies' ? FEATURED_MOVIES : FEATURED_TV}
        onSelect={(item) => {
          setSelectedItem({ embed_url: item.embed_url, title: item.title, quality: item.quality, imdb_id: '', tmdb_id: null, embed_url_tmdb: null, time_added: '' });
          setSelectedEmbed(item.embed_url);
        }}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mvo-textMuted" />
        <input
          type="text"
          placeholder={tab === 'movies' ? 'Search movies...' : 'Search TV shows...'}
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
          <p className="text-lg">{search ? 'No results found' : 'No content available'}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {filtered.map(item => (
          <MediaCard
            key={item.imdb_id}
            item={item}
            poster={item.tmdb_id ? posters[item.tmdb_id] : undefined}
            onClick={() => {
              setSelectedItem(item);
              setSelectedEmbed(item.embed_url);
            }}
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

function MediaCard({ item, poster, onClick }: { item: MediaItem; poster?: string; onClick: () => void }) {
  const year = extractYear(item.title);
  const name = cleanTitle(item.title);
  const [c1, c2] = getGradient(item.title);
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
            {item.quality}
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
          <span>{item.time_added.split(' ')[0]}</span>
        </div>
      </div>
    </div>
  );
}
