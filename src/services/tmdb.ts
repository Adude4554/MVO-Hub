import type {
  TMDBMovie,
  TMDBTVShow,
  TMDBMovieDetail,
  TMDBTVDetail,
  TMDBSeasonDetail,
  TMDBSearchResult,
  TMDBGenre,
} from '../types';

const BASE_URL = 'https://api.themoviedb.org/3';

/** TMDB image base URL */
export const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export function getPosterUrl(path: string | null, size = 'w500'): string {
  if (!path) return '';
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function getBackdropUrl(path: string | null, size = 'original'): string {
  return getPosterUrl(path, size);
}

export function getProfileUrl(path: string | null, size = 'w185'): string {
  return getPosterUrl(path, size);
}

async function fetchTMDB<T>(apiKey: string, endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/* ---------- Trending ---------- */
export async function getTrendingMovies(apiKey: string): Promise<TMDBMovie[]> {
  const data = await fetchTMDB<{ results: TMDBMovie[] }>(apiKey, '/trending/movie/day');
  return data.results;
}

export async function getTrendingTV(apiKey: string): Promise<TMDBTVShow[]> {
  const data = await fetchTMDB<{ results: TMDBTVShow[] }>(apiKey, '/trending/tv/day');
  return data.results;
}

/* ---------- Popular ---------- */
export async function getPopularMovies(apiKey: string, page = 1): Promise<{ results: TMDBMovie[]; total_pages: number }> {
  return fetchTMDB(apiKey, '/movie/popular', { page: String(page) });
}

export async function getPopularTV(apiKey: string, page = 1): Promise<{ results: TMDBTVShow[]; total_pages: number }> {
  return fetchTMDB(apiKey, '/tv/popular', { page: String(page) });
}

/* ---------- Top rated ---------- */
export async function getTopRatedMovies(apiKey: string): Promise<TMDBMovie[]> {
  const data = await fetchTMDB<{ results: TMDBMovie[] }>(apiKey, '/movie/top_rated');
  return data.results;
}

export async function getTopRatedTV(apiKey: string): Promise<TMDBTVShow[]> {
  const data = await fetchTMDB<{ results: TMDBTVShow[] }>(apiKey, '/tv/top_rated');
  return data.results;
}

/* ---------- Search ---------- */
export async function searchMovies(apiKey: string, query: string, page = 1): Promise<TMDBSearchResult> {
  return fetchTMDB(apiKey, '/search/movie', { query, page: String(page) });
}

export async function searchTV(apiKey: string, query: string, page = 1): Promise<TMDBSearchResult> {
  return fetchTMDB(apiKey, '/search/tv', { query, page: String(page) });
}

/* ---------- Discover (genre filtering) ---------- */
export async function discoverMovies(apiKey: string, params: Record<string, string> = {}): Promise<{ results: TMDBMovie[]; total_pages: number }> {
  return fetchTMDB(apiKey, '/discover/movie', { sort_by: 'popularity.desc', ...params });
}

export async function discoverTV(apiKey: string, params: Record<string, string> = {}): Promise<{ results: TMDBTVShow[]; total_pages: number }> {
  return fetchTMDB(apiKey, '/discover/tv', { sort_by: 'popularity.desc', ...params });
}

/* ---------- Genres ---------- */
export async function getMovieGenres(apiKey: string): Promise<TMDBGenre[]> {
  const data = await fetchTMDB<{ genres: TMDBGenre[] }>(apiKey, '/genre/movie/list');
  return data.genres;
}

export async function getTVGenres(apiKey: string): Promise<TMDBGenre[]> {
  const data = await fetchTMDB<{ genres: TMDBGenre[] }>(apiKey, '/genre/tv/list');
  return data.genres;
}

/* ---------- Details ---------- */
export async function getMovieDetail(apiKey: string, id: number): Promise<TMDBMovieDetail> {
  return fetchTMDB(apiKey, `/movie/${id}`, { append_to_response: 'credits,recommendations' });
}

export async function getTVDetail(apiKey: string, id: number): Promise<TMDBTVDetail> {
  return fetchTMDB(apiKey, `/tv/${id}`, { append_to_response: 'credits,recommendations' });
}

export async function getSeasonDetail(apiKey: string, tvId: number, seasonNumber: number): Promise<TMDBSeasonDetail> {
  return fetchTMDB(apiKey, `/tv/${tvId}/season/${seasonNumber}`);
}

/* ---------- Helpers ---------- */
export function isMovie(item: TMDBMovie | TMDBTVShow): item is TMDBMovie {
  return (item as TMDBMovie).title !== undefined;
}

export function getMediaTitle(item: TMDBMovie | TMDBTVShow): string {
  return isMovie(item) ? item.title : item.name;
}

export function getMediaDate(item: TMDBMovie | TMDBTVShow): string {
  return isMovie(item) ? item.release_date : item.first_air_date;
}

export function getMediaYear(item: TMDBMovie | TMDBTVShow): number | null {
  const date = getMediaDate(item);
  return date ? new Date(date).getFullYear() : null;
}
