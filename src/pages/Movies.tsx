import { useState, useEffect, useCallback } from 'react';
import { Play, Loader2, AlertTriangle, Search, ChevronLeft } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FeaturedRow } from '../components/FeaturedRow';

interface Movie {
  imdb_id: string;
  tmdb_id: string | null;
  title: string;
  embed_url: string;
  embed_url_tmdb: string | null;
  quality: string;
  time_added: string;
}

interface MovieProps {
  settings?: { tmdb_api_key?: string };
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

function posterSrc(localPath: string) {
  // Normalize Windows backslashes to forward slashes for convertFileSrc
  return convertFileSrc(localPath.replace(/\\/g, '/'));
}

const FEATURED_MOVIES = [
  // Marvel
  { title: 'Iron Man', tmdbId: '1726', mediaType: 'movie' as const },
  { title: 'Avengers: Endgame', tmdbId: '299536', mediaType: 'movie' as const },
  { title: 'Spider-Man: No Way Home', tmdbId: '634649', mediaType: 'movie' as const },
  { title: 'Doctor Strange', tmdbId: '284054', mediaType: 'movie' as const },
  { title: 'Deadpool & Wolverine', tmdbId: '533535', mediaType: 'movie' as const },
  { title: 'Black Panther', tmdbId: '284053', mediaType: 'movie' as const },
  // DC
  { title: 'The Dark Knight', tmdbId: '155', mediaType: 'movie' as const },
  { title: 'The Batman', tmdbId: '414906', mediaType: 'movie' as const },
  { title: 'Man of Steel', tmdbId: '496243', mediaType: 'movie' as const },
  { title: 'Joker', tmdbId: '475557', mediaType: 'movie' as const },
  // Sci-Fi
  { title: 'Interstellar', tmdbId: '157336', mediaType: 'movie' as const },
  { title: 'Inception', tmdbId: '27205', mediaType: 'movie' as const },
  { title: 'The Matrix', tmdbId: '603', mediaType: 'movie' as const },
  { title: 'Dune', tmdbId: '438631', mediaType: 'movie' as const },
  { title: 'Dune: Part Two', tmdbId: '693134', mediaType: 'movie' as const },
  { title: 'Avatar', tmdbId: '19995', mediaType: 'movie' as const },
  { title: 'Edge of Tomorrow', tmdbId: '137113', mediaType: 'movie' as const },
  // Action
  { title: 'John Wick: Chapter 4', tmdbId: '603692', mediaType: 'movie' as const },
  { title: 'Top Gun: Maverick', tmdbId: '361743', mediaType: 'movie' as const },
  { title: 'Mad Max: Fury Road', tmdbId: '76341', mediaType: 'movie' as const },
  // Fantasy
  { title: 'The Lord of the Rings', tmdbId: '120', mediaType: 'movie' as const },
  { title: 'Harry Potter', tmdbId: '671', mediaType: 'movie' as const },
  { title: 'Back to the Future', tmdbId: '105', mediaType: 'movie' as const },
  // Time Travel
  { title: 'Tenet', tmdbId: '577922', mediaType: 'movie' as const },
  { title: 'Predestination', tmdbId: '244235', mediaType: 'movie' as const },
];

export function Movies({ settings }: MovieProps) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [maxPages, setMaxPages] = useState(1);
  const [posters, setPosters] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('https://vidsrcme.ru/movies/latest/page-1.json')
      .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then(data => {
        if (cancelled) return;
        setMovies(data.result || []);
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

  // Fetch posters in background
  useEffect(() => {
    if (movies.length === 0) return;
    let cancelled = false;

    const loadPosters = async () => {
      for (const movie of movies) {
        if (cancelled || !movie.tmdb_id) continue;
        if (posters[movie.tmdb_id]) continue;

        // Check local cache first
        try {
          const cached = await invoke<string>('get_cached_poster', { tmdbId: movie.tmdb_id });
          if (cached && !cancelled) {
            setPosters(prev => ({ ...prev, [movie.tmdb_id!]: posterSrc(cached) }));
            continue;
          }
        } catch {}

        // Fetch from TMDB
        try {
          const result = await invoke<{ poster_path: string }>('fetch_tmdb_poster', {
            tmdbId: movie.tmdb_id,
            mediaType: 'movie',
            apiKey: '',
          });
          if (result.poster_path && !cancelled) {
            setPosters(prev => ({ ...prev, [movie.tmdb_id!]: posterSrc(result.poster_path) }));
          }
        } catch {}

        await new Promise(r => setTimeout(r, 250));
      }
    };
    loadPosters();
    return () => { cancelled = true; };
  }, [movies]);

  const loadMore = useCallback(() => {
    if (loadingMore || currentPage >= maxPages) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    fetch(`https://vidsrcme.ru/movies/latest/page-${nextPage}.json`)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then(data => {
        setMovies(prev => [...prev, ...(data.result || [])]);
        setCurrentPage(nextPage);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [currentPage, maxPages, loadingMore]);

  const filtered = movies.filter(m => {
    if (!search) return true;
    return m.title.toLowerCase().includes(search.toLowerCase());
  });

  // Player view — inline in content area
  if (selectedMovie) {
    return (
      <div className="space-y-4 h-full flex flex-col">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedMovie(null)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mvo-panel border border-mvo-border/50 hover:bg-mvo-panelHover text-mvo-text text-sm transition-all"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="font-display text-lg font-bold text-mvo-text truncate">{cleanTitle(selectedMovie.title)}</h2>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-400/20 text-cyan-400">{selectedMovie.quality}</span>
        </div>
        <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-mvo-border/30" style={{ height: 'calc(100vh - 140px)' }}>
          <iframe
            src={selectedMovie.embed_url}
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
        <h1 className="font-display text-2xl font-bold text-mvo-text">Movies</h1>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />}
      </div>

      <FeaturedRow
        items={FEATURED_MOVIES}
        onSelect={(item) => setSelectedMovie({ ...item, embed_url: item.embed_url, imdb_id: '', tmdb_id: null, embed_url_tmdb: null, time_added: '' })}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mvo-textMuted" />
        <input
          type="text"
          placeholder="Search movies..."
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
          <p className="text-lg">{search ? 'No movies found' : 'No movies available'}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {filtered.map(movie => (
          <MovieCard
            key={movie.imdb_id}
            movie={movie}
            poster={movie.tmdb_id ? posters[movie.tmdb_id] : undefined}
            onClick={() => setSelectedMovie(movie)}
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

function MovieCard({ movie, poster, onClick }: { movie: Movie; poster?: string; onClick: () => void }) {
  const year = extractYear(movie.title);
  const name = cleanTitle(movie.title);
  const [c1, c2] = getGradient(movie.title);
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
            {movie.quality}
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
          <span>{movie.time_added.split(' ')[0]}</span>
        </div>
      </div>
    </div>
  );
}
