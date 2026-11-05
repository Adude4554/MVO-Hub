import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Loader2, AlertTriangle, Search, ChevronLeft, Star, Film, Tv } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { FeaturedRow } from '../components/FeaturedRow';
import { MediaCard } from '../components/MediaCard';
import { getMovieEmbedUrl, getTVEmbedUrl } from '../services/vidsrc';
import {
  getPopularMovies,
  getPopularTV,
  searchMovies,
  searchTV,
  discoverMovies,
  discoverTV,
  getMovieGenres,
  getTVGenres,
  getMovieDetail,
  getTVDetail,
  getSeasonDetail,
  getPosterUrl,
  isMovie,
  getMediaYear,
} from '../services/tmdb';
import type { TMDBMovie, TMDBTVShow, TMDBSeason, TMDBEpisode } from '../types';

const FEATURED_MOVIES = [
  { title: 'Iron Man', tmdbId: '1726', imdbId: 'tt0371746', mediaType: 'movie' as const },
  { title: 'Avengers: Endgame', tmdbId: '299536', imdbId: 'tt4154796', mediaType: 'movie' as const },
  { title: 'Spider-Man: No Way Home', tmdbId: '634649', imdbId: 'tt10872600', mediaType: 'movie' as const },
  { title: 'Doctor Strange', tmdbId: '284054', imdbId: 'tt1211837', mediaType: 'movie' as const },
  { title: 'Deadpool & Wolverine', tmdbId: '533535', imdbId: 'tt6263850', mediaType: 'movie' as const },
  { title: 'Black Panther', tmdbId: '284053', imdbId: 'tt1825683', mediaType: 'movie' as const },
  { title: 'The Dark Knight', tmdbId: '155', imdbId: 'tt0468569', mediaType: 'movie' as const },
  { title: 'The Batman', tmdbId: '414906', imdbId: 'tt1877830', mediaType: 'movie' as const },
];

const FEATURED_TV = [
  { title: 'Supernatural', tmdbId: '1622', mediaType: 'tv' as const },
  { title: 'Stranger Things', tmdbId: '85922', mediaType: 'tv' as const },
  { title: 'The Last of Us', tmdbId: '100088', mediaType: 'tv' as const },
  { title: 'The Walking Dead', tmdbId: '1402', mediaType: 'tv' as const },
  { title: 'The Expanse', tmdbId: '63639', mediaType: 'tv' as const },
  { title: 'Dark', tmdbId: '66732', mediaType: 'tv' as const },
  { title: 'Loki', tmdbId: '84958', mediaType: 'tv' as const },
  { title: 'Reacher', tmdbId: '108978', mediaType: 'tv' as const },
];

function getWatchedKey(): string {
  return 'mvo_tv_watched';
}

function getWatchedEpisodes(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(getWatchedKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function markEpisodeWatched(showId: string, season: number, episode: number) {
  const watched = getWatchedEpisodes();
  const key = `${showId}_s${season}_e${episode}`;
  watched[key] = true;
  localStorage.setItem(getWatchedKey(), JSON.stringify(watched));
}

function isEpisodeWatched(showId: string, season: number, episode: number): boolean {
  const watched = getWatchedEpisodes();
  const key = `${showId}_s${season}_e${episode}`;
  return !!watched[key];
}

export function MoviesTV() {
  const [tab, setTab] = useState<'movies' | 'tv'>('movies');
  const [apiKey, setApiKey] = useState<string | null>(null);

  const [items, setItems] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected item / player state
  const [selectedItem, setSelectedItem] = useState<TMDBMovie | TMDBTVShow | null>(null);
  const [selectedEmbed, setSelectedEmbed] = useState<string>('');
  const [seasons, setSeasons] = useState<TMDBSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);

  // ---- TMDB API key ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const key = await invoke<string>('get_tmdb_api_key');
        if (cancelled) return;
        setApiKey(key || null);
      } catch {
        if (cancelled) return;
        setApiKey(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Load list (popular / search / discover) ----
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let result;
        if (searchQuery.trim()) {
          result = tab === 'movies'
            ? await searchMovies(apiKey, searchQuery.trim(), page)
            : await searchTV(apiKey, searchQuery.trim(), page);
        } else if (selectedGenre) {
          result = tab === 'movies'
            ? await discoverMovies(apiKey, { with_genres: String(selectedGenre), page: String(page) })
            : await discoverTV(apiKey, { with_genres: String(selectedGenre), page: String(page) });
        } else {
          result = tab === 'movies'
            ? await getPopularMovies(apiKey, page)
            : await getPopularTV(apiKey, page);
        }
        if (!cancelled) {
          setItems(result.results);
          setTotalPages(result.total_pages || 1);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load content');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [apiKey, tab, searchQuery, page, selectedGenre]);

  // ---- Load genres ----
  useEffect(() => {
    if (!apiKey) return;
    (async () => {
      try {
        const g = tab === 'movies' ? await getMovieGenres(apiKey) : await getTVGenres(apiKey);
        setGenres(g);
      } catch {}
    })();
  }, [apiKey, tab]);

  // ---- Debounced search ----
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setPage(1), 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  // ---- Selected movie → fetch detail for IMDB id, then show player ----
  useEffect(() => {
    if (!selectedItem || tab === 'movies' || !apiKey) return;
    let cancelled = false;
    setSeasons([]);
    setEpisodes([]);
    setSelectedSeason(1);
    (async () => {
      try {
        const detail = await getTVDetail(apiKey, selectedItem.id);
        if (cancelled) return;
        const regular = (detail.seasons || []).filter((s: TMDBSeason) => s.season_number > 0);
        setSeasons(regular);
        if (regular.length > 0) setSelectedSeason(regular[0].season_number);
      } catch {
        if (!cancelled) setSeasons([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedItem, tab, apiKey]);

  // ---- Selected season → fetch episodes ----
  useEffect(() => {
    if (!selectedItem || tab === 'movies' || !selectedItem.id || !selectedSeason || !apiKey) return;
    let cancelled = false;
    setEpisodes([]);
    (async () => {
      try {
        const data = await getSeasonDetail(apiKey, selectedItem.id, selectedSeason);
        if (cancelled) return;
        setEpisodes(data.episodes || []);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedItem, selectedSeason, apiKey, tab]);

  const goNext = useCallback(() => {
    if (!apiKey || loading || page >= totalPages) return;
    setPage((p) => p + 1);
  }, [apiKey, loading, page, totalPages]);

  const goPrev = useCallback(() => {
    if (!apiKey || loading || page <= 1) return;
    setPage((p) => p - 1);
  }, [apiKey, loading, page]);

  const filtered = items.filter((m) => {
    if (!searchQuery) return true;
    const title = isMovie(m) ? m.title : m.name;
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleMovieWatch = async (item: TMDBMovie) => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await getMovieDetail(apiKey, item.id);
      const imdbId = detail.imdb_id;
      if (!imdbId) throw new Error('No IMDB ID available for this movie');
      setSelectedItem(detail);
      setSelectedEmbed(getMovieEmbedUrl(imdbId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load movie');
    } finally {
      setLoading(false);
    }
  };

  const handleTvShowSelect = (item: TMDBTVShow) => {
    setSelectedItem(item);
    setSelectedEmbed('');
    setSeasons([]);
    setEpisodes([]);
    setSelectedSeason(1);
  };

  const handleEpisodePlay = (item: TMDBTVShow, season: number, episode: number) => {
    const imdbId = item.id.toString();
    const embedUrl = getTVEmbedUrl(imdbId, season, episode);
    setSelectedEmbed(embedUrl);
    markEpisodeWatched(imdbId, season, episode);
  };

  const handleBack = () => {
    setSelectedItem(null);
    setSelectedEmbed('');
    setSeasons([]);
    setEpisodes([]);
  };

  // ---- Movie player view ----
  if (selectedItem && selectedEmbed && isMovie(selectedItem)) {
    return (
      <div className="space-y-4 h-full flex flex-col">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mvo-panel border border-mvo-border/50 hover:bg-mvo-panelHover text-mvo-text text-sm transition-all">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="font-display text-lg font-bold text-mvo-text truncate">{selectedItem.title}</h2>
        </div>
        <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-mvo-border/30">
          <iframe
            src={selectedEmbed}
            className="w-full h-full border-0"
            frameBorder="0"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write"
          />
        </div>
        <div className="p-3">
          <p className="text-sm text-mvo-textDim line-clamp-2">{selectedItem.overview}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-mvo-textMuted">
            {getMediaYear(selectedItem) && <span>{getMediaYear(selectedItem)}</span>}
            {selectedItem.vote_average > 0 && <span>• {selectedItem.vote_average.toFixed(1)}</span>}
          </div>
        </div>
      </div>
    );
  }

  // ---- TV show detail / episode picker view ----
  if (selectedItem && !isMovie(selectedItem)) {
    const show = selectedItem as TMDBTVShow;
    return (
      <div className="space-y-4 h-full flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={handleBack} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mvo-panel border border-mvo-border/50 hover:bg-mvo-panelHover text-mvo-text text-sm transition-all">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="font-display text-lg font-bold text-mvo-text truncate">{show.name}</h2>
        </div>

        {selectedEmbed && (
          <div className="flex-shrink-0 rounded-xl overflow-hidden border border-mvo-border/30" style={{ height: '50vh' }}>
            <iframe
              src={selectedEmbed}
              className="w-full h-full border-0"
              frameBorder="0"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write"
            />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 scrollbar-hide">
          {seasons.length > 0 ? (
            <>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {seasons.map((s) => (
                  <button
                    key={s.season_number}
                    onClick={() => setSelectedSeason(s.season_number)}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      selectedSeason === s.season_number
                        ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
                        : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover border border-transparent'
                    }`}
                  >
                    Season {s.season_number}
                  </button>
                ))}
              </div>

              <div className="grid gap-3">
                {episodes.map((ep) => {
                  const isWatched = isEpisodeWatched(show.id.toString(), ep.season_number, ep.episode_number);
                  return (
                    <div
                      key={ep.episode_number}
                      onClick={() => handleEpisodePlay(show, ep.season_number, ep.episode_number)}
                      className={`group cursor-pointer rounded-xl overflow-hidden border transition-all duration-200 hover:shadow-lg hover:shadow-cyan-400/5 ${
                        isWatched
                          ? 'bg-mvo-panel/50 border-mvo-border/20 opacity-60'
                          : 'bg-mvo-panel border-mvo-border/30 hover:border-cyan-400/40'
                      }`}
                    >
                      <div className="flex gap-3 p-3">
                        <div className="relative w-32 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                          {ep.still_path ? (
                            <img
                              src={getPosterUrl(ep.still_path, 'w300')}
                              alt={ep.name}
                              className="absolute inset-0 w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                              <span className="text-xs font-bold text-white/40">E{ep.episode_number}</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                            </div>
                          </div>
                          {isWatched && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center z-10">
                              <Star className="w-3 h-3 text-black" fill="currentColor" strokeWidth={0} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-mvo-textMuted font-medium">E{ep.episode_number}</span>
                            <h4 className="font-medium text-sm text-mvo-text truncate">{ep.name}</h4>
                          </div>
                          {ep.overview && <p className="text-xs text-mvo-textMuted mt-1 line-clamp-2">{ep.overview}</p>}
                          <div className="flex items-center gap-2 mt-1 text-xs text-mvo-textMuted">
                            {ep.air_date && <span>{ep.air_date}</span>}
                            {ep.runtime && <><span>•</span><span>{ep.runtime}m</span></>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-mvo-textMuted text-sm">No season data available</div>
          )}
        </div>
      </div>
    );
  }

  // ---- Key missing state ----
  if (!apiKey) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-2xl font-bold text-mvo-text">Movies & TV Shows</h1>
        </div>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span className="text-amber-400 text-sm">Set the TMDB_API_KEY environment variable (or configure the API key) to browse movies and TV shows.</span>
        </div>
      </div>
    );
  }

  // ---- Main browse view ----
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {tab === 'movies' ? <Film className="w-6 h-6 text-cyan-400" /> : <Tv className="w-6 h-6 text-cyan-400" />}
          <h1 className="font-display text-2xl font-bold text-mvo-text">{tab === 'movies' ? 'Movies' : 'TV Shows'}</h1>
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { setTab('movies'); setPage(1); setSelectedGenre(null); setSearchQuery(''); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'movies'
              ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
              : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover border border-transparent'
          }`}
        >
          Movies
        </button>
        <button
          onClick={() => { setTab('tv'); setPage(1); setSelectedGenre(null); setSearchQuery(''); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'tv'
              ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
              : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover border border-transparent'
          }`}
        >
          TV Shows
        </button>
      </div>

      <FeaturedRow
        items={tab === 'movies' ? FEATURED_MOVIES : FEATURED_TV}
        onSelect={(item) => {
          if (tab === 'movies') {
            handleMovieWatch({
              id: Number(item.tmdbId),
              title: item.title,
              original_title: item.title,
              overview: '',
              poster_path: null,
              backdrop_path: null,
              release_date: '',
              vote_average: 0,
              vote_count: 0,
              genre_ids: [],
              adult: false,
              original_language: '',
              popularity: 0,
              video: false,
              imdb_id: item.imdbId,
            } as TMDBMovie);
          } else {
            handleTvShowSelect({
              id: Number(item.tmdbId),
              name: item.title,
              original_name: item.title,
              overview: '',
              poster_path: null,
              backdrop_path: null,
              first_air_date: '',
              vote_average: 0,
              vote_count: 0,
              genre_ids: [],
              original_language: '',
              popularity: 0,
              origin_country: [],
            } as TMDBTVShow);
          }
        }}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mvo-textMuted" />
        <input
          type="text"
          placeholder={tab === 'movies' ? 'Search movies...' : 'Search TV shows...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
          <p className="text-lg">{searchQuery ? 'No results found' : 'No content available'}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div className="mb-6 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => { setSelectedGenre(null); setPage(1); }}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                !selectedGenre ? 'bg-cyan-400/20 text-cyan-400' : 'bg-mvo-panelHover text-mvo-textDim hover:text-mvo-text'
              }`}
            >
              All
            </button>
            {genres.map((genre) => (
              <button
                key={genre.id}
                onClick={() => { setSelectedGenre(selectedGenre === genre.id ? null : genre.id); setPage(1); }}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedGenre === genre.id
                    ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
                    : 'bg-mvo-panelHover text-mvo-textDim hover:text-mvo-text border border-transparent'
                }`}
              >
                {genre.name}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onClick={() => {
                  if (isMovie(item)) handleMovieWatch(item);
                  else handleTvShowSelect(item);
                }}
                onWatch={() => {
                  if (isMovie(item)) handleMovieWatch(item);
                }}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={goPrev}
                disabled={page === 1 || loading}
                className="px-6 py-2.5 rounded-xl bg-mvo-panel border border-mvo-border/50 text-mvo-textDim hover:text-mvo-text disabled:opacity-40 text-sm font-medium transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-mvo-textDim">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={goNext}
                disabled={page >= totalPages || loading}
                className="px-6 py-2.5 rounded-xl bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/20 transition-all disabled:opacity-50 text-sm font-medium"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
