import { useEffect, useMemo, useState } from 'react';
import {
  getGameInitials,
  getLauncherGradient,
  resolveArtwork,
  type ArtKind,
  type LibraryGame,
} from '../lib/gameArtwork';

/**
 * Game artwork with a resilient fallback chain.
 *
 * Renders the first candidate from [`resolveArtwork`]; when an image fails to
 * load it advances to the next (local cache → Steam CDN → a second CDN host).
 * Only when every candidate is exhausted does it show a gradient tile with the
 * game's initials — so a missing cover is always *explained*, never a blank box.
 */
interface GameArtworkProps {
  game: LibraryGame | null | undefined;
  kind?: ArtKind;
  /** Explicit override, e.g. a just-uploaded custom cover. */
  override?: string | null;
  alt?: string;
  className?: string;
  /** Classes applied to the initials text inside the fallback tile. */
  initialsClassName?: string;
  /** Which field decides the fallback gradient. */
  launcher?: string;
  /** `loading` for the `<img>`. */
  loading?: 'lazy' | 'eager';
}

export function GameArtwork({
  game,
  kind = 'poster',
  override,
  alt,
  className = 'h-full w-full object-cover',
  initialsClassName = 'font-display text-lg font-bold text-white/70',
  launcher,
  loading = 'lazy',
}: GameArtworkProps) {
  const candidates = useMemo(() => resolveArtwork(game, kind, override), [game, kind, override]);
  const [index, setIndex] = useState(0);

  // Reset the walk when the game or candidate list changes (e.g. navigating to
  // a different game), otherwise a stale index would show the wrong image.
  useEffect(() => {
    setIndex(0);
  }, [candidates]);

  const src = candidates[index];
  const label = alt ?? game?.name ?? '';

  if (!src) {
    return <ArtworkFallback game={game} launcher={launcher} initialsClassName={initialsClassName} />;
  }

  return (
    <img
      src={src}
      alt={label}
      loading={loading}
      className={className}
      data-testid="game-artwork"
      onError={() => setIndex(i => i + 1)}
    />
  );
}

function ArtworkFallback({
  game,
  launcher,
  initialsClassName,
}: {
  game: LibraryGame | null | undefined;
  launcher?: string;
  initialsClassName: string;
}) {
  const gradientSource = launcher ?? game?.launcher ?? game?.platform ?? game?.source ?? 'unknown';
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: getLauncherGradient(gradientSource) }}
      data-testid="game-artwork-fallback"
      aria-label={game?.name ? `${game.name} cover art unavailable` : 'Cover art unavailable'}
    >
      <span className={initialsClassName}>{getGameInitials(game?.name || '?')}</span>
    </div>
  );
}
