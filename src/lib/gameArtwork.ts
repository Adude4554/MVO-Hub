/**
 * Universal game artwork resolution.
 *
 * Three different call sites exist and each had its own ad-hoc rule (the
 * dashboard checked `platform === 'Steam'`, the library built a CDN URL inline,
 * Game Detail did its own `??` chain). They disagreed on casing, on whether
 * `app_id` is a string or number, and on how to address a local file — which is
 * how grey placeholder boxes appear for games that *do* have artwork.
 *
 * This module is now the single source of truth. It resolves via a documented
 * precedence chain and returns the ordered candidate list, so a component can
 * fall through on `onError` rather than silently showing nothing.
 *
 * Precedence:
 *   1. Explicit override (a custom cover/banner uploaded by the user)
 *   2. Scanner-cached local file (`cover_local`, then `cover_path`)
 *   3. Steam CDN, when the entry has a usable app id
 *   4. Caller-provided fallback (e.g. a gradient + initials)
 */

/** A game as returned by the library hook (`useGames`). */
export interface LibraryGame {
  id: string;
  name: string;
  app_id?: string | number | null;
  source?: string;
  launcher?: string;
  platform?: string;
  cover?: string | null;
  cover_local?: string | null;
  cover_path?: string | null;
  /** Present on Game Detail after a custom upload. */
  customCover?: string | null;
  customBanner?: string | null;
}

export type ArtKind = 'poster' | 'header' | 'hero';

/** Which CDN file serves each aspect ratio. */
const STEAM_FILES: Record<ArtKind, string> = {
  /** 2:3 portrait — the library grid. */
  poster: 'library_600x900.jpg',
  /** 460x215 — the library card thumb. */
  header: 'header.jpg',
  /** Wide cinematic — the Game Detail banner. */
  hero: 'library_hero.jpg',
};

/**
 * Steam's primary host. `cloudflare` is the documented, long-lived endpoint;
 * `akamai` serves the same paths and is used as a second source because CDN
 * flakiness is common enough to matter.
 */
const STEAM_HOSTS = [
  'https://cdn.cloudflare.steamstatic.com',
  'https://cdn.akamai.steamstatic.com',
];

/**
 * Normalise an app id.
 *
 * Accepts `730`, `"730"`, `" 730 "` and rejects anything that is not a plain
 * digit string — app ids are interpolated into a URL path, so a stray `/` or
 * `?` would let the value escape the path segment.
 */
export function normalizeAppId(appId: unknown): string | null {
  if (appId === null || appId === undefined) return null;
  const raw = String(appId).trim();
  if (!/^\d+$/.test(raw)) return null;
  return raw;
}

/** True when an entry is served by Steam (casing varies across sources). */
export function isSteamGame(game: LibraryGame): boolean {
  const markers = [game.platform, game.launcher, game.source];
  return markers.some(m => typeof m === 'string' && m.trim().toLowerCase() === 'steam');
}

/**
 * Convert a path returned by the Rust side into something an `<img>` can load.
 *
 * The backend stores absolute Windows paths (`C:\...`), which need Tauri's
 * asset protocol: a bare `file://C:/...` is rejected by the webview. In the
 * browser test harness `convertFileSrc` is an identity function, so this stays
 * testable.
 */
export function localFileUrl(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  // Already a URL (http, https, data, asset, or a file URL) — leave it alone.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;

  const convert = (
    window as unknown as { __TAURI_INTERNALS__?: { convertFileSrc?: (p: string) => string } }
  ).__TAURI_INTERNALS__?.convertFileSrc;

  if (typeof convert === 'function') return convert(trimmed);
  // Non-Tauri context (plain browser): a file URL is the best available guess.
  return `file://${trimmed.replace(/\\/g, '/')}`;
}

/** Every Steam CDN URL worth trying for one game, in order. */
export function steamArtUrls(game: LibraryGame, kind: ArtKind): string[] {
  if (!isSteamGame(game)) return [];
  const appId = normalizeAppId(game.app_id);
  if (!appId) return [];
  const file = STEAM_FILES[kind];
  return STEAM_HOSTS.map(host => `${host}/steam/apps/${appId}/${file}`);
}

/**
 * Ordered list of artwork candidates for a game.
 *
 * A component renders the first entry and advances on `onError`; when the list
 * is exhausted it shows its own fallback (gradient + initials).
 */
export function resolveArtwork(
  game: LibraryGame | null | undefined,
  kind: ArtKind = 'poster',
  override?: string | null,
): string[] {
  if (!game) return [];
  const candidates: string[] = [];

  const push = (value: string | null | undefined) => {
    const url = value ? localFileUrl(value) : '';
    if (url && !candidates.includes(url)) candidates.push(url);
  };

  // 1. Explicit, user-uploaded art always wins.
  if (kind === 'hero') {
    push(override ?? game.customBanner);
  } else {
    push(override ?? game.customCover);
  }

  // 2. Scanner-cached local copies, then the remote path the scanner recorded.
  push(game.cover_local);
  push(game.cover_path);
  push(game.cover);

  // 3. Steam CDN.
  for (const url of steamArtUrls(game, kind)) push(url);

  return candidates;
}

/**
 * The single best URL for a game, or an empty string when none exists.
 *
 * Prefer [`resolveArtwork`] in components so a broken first candidate can fall
 * through to the next.
 */
export function getArtworkUrl(
  game: LibraryGame | null | undefined,
  kind: ArtKind = 'poster',
  override?: string | null,
): string {
  return resolveArtwork(game, kind, override)[0] ?? '';
}

// ---------------------------------------------------------------------------
// Legacy helpers — kept so existing call sites keep working.
// ---------------------------------------------------------------------------

export function getSteamHeaderUrl(game: LibraryGame): string {
  return steamArtUrls(game, 'header')[0] ?? '';
}

export function getSteamPosterUrl(game: LibraryGame): string {
  return steamArtUrls(game, 'poster')[0] ?? '';
}

export function getSteamHeroUrl(game: LibraryGame): string {
  return steamArtUrls(game, 'hero')[0] ?? '';
}

export function getGameImageUrl(game: LibraryGame): string {
  return getArtworkUrl(game, 'poster');
}

/** Two-letter initials used by the gradient fallback tile. */
export function getGameInitials(name: string): string {
  const words = (name ?? '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (name ?? '').substring(0, 2).toUpperCase();
}

const LAUNCHER_COLORS: Record<string, string[]> = {
  steam: ['#1b2838', '#2a475e'],
  epic: ['#2a2a2a', '#0078f2'],
  gog: ['#86328a', '#c624d4'],
  origin: ['#f56c2e', '#c1272d'],
  ea: ['#f56c2e', '#c1272d'],
  ubisoft: ['#0066cc', '#0099ff'],
  battlenet: ['#00aeef', '#0070cc'],
  riot: ['#d32936', '#bd2632'],
  xbox: ['#107c10', '#0e6b0e'],
  rockstar: ['#ffc300', '#e6b800'],
  amazon: ['#00a8e1', '#0077b5'],
  heroic: ['#553986', '#8549ba'],
  custom: ['#3a3a3a', '#5a5a5a'],
  unknown: ['#292929', '#3a3a3a'],
};

export function getLauncherGradient(launcher: string): string {
  const key = (launcher ?? 'unknown').trim().toLowerCase();
  const colors = LAUNCHER_COLORS[key] ?? LAUNCHER_COLORS.unknown;
  return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
}
