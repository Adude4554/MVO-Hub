const VIDSRC_BASE = 'https://vidsrcme.ru/embed';

export function getMovieEmbedUrl(imdbId: string): string {
  return `${VIDSRC_BASE}/movie/${imdbId}`;
}

export function getTVEmbedUrl(imdbId: string, season?: number, episode?: number): string {
  if (season !== undefined && episode !== undefined) {
    return `${VIDSRC_BASE}/tv/${imdbId}/${season}/${episode}`;
  }
  if (season !== undefined) {
    return `${VIDSRC_BASE}/tv/${imdbId}/${season}`;
  }
  return `${VIDSRC_BASE}/tv/${imdbId}`;
}
