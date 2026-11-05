import { useEffect, useRef, useState } from 'react';

/**
 * Detects the OS-level "reduce motion" preference (Windows: Settings →
 * Accessibility → Visual effects → Animation effects).
 *
 * When true, decorative video must never autoplay — we fall back to the
 * static poster/gradient instead.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Detects a slow/limited connection. On `saveData` or 2G the video is skipped
 * entirely so we never spend 2.8 MB of someone's mobile tether on decoration.
 */
export function usePrefersLightData(): boolean {
  const [light, setLight] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const conn = (navigator as any).connection;
    if (!conn) return;
    const evaluate = () =>
      setLight(Boolean(conn.saveData) || /(^|-)2g$/.test(conn.effectiveType || ''));
    evaluate();
    conn.addEventListener?.('change', evaluate);
    return () => conn.removeEventListener?.('change', evaluate);
  }, []);

  return light;
}

export interface VideoBackgroundProps {
  /** Path relative to the web root, e.g. `assets/hero-bg.webm`. */
  src: string;
  /** Lightweight static image shown before/instead of the video. */
  poster?: string;
  /** Inline CSS background used when both video and poster are unavailable. */
  fallbackBackground?: string;
  className?: string;
  /** Extra darkening so overlaid text keeps contrast. */
  overlayClassName?: string;
}

/**
 * Cinematic video backdrop for the Home hero.
 *
 * Performance & resilience guarantees:
 *  - `autoPlay muted loop playsInline` — silent, inline, no user gesture needed
 *  - `preload="metadata"` — does not block first paint with a multi-MB fetch
 *  - Skipped entirely when the user requests reduced motion or is on a metered
 *    connection
 *  - The static poster/gradient stays painted underneath, so a missing,
 *    blocked or unsupported video degrades invisibly
 *  - `onError` permanently falls back to the static layer
 */
export function VideoBackground({
  src,
  poster,
  fallbackBackground,
  className = '',
  overlayClassName = '',
}: VideoBackgroundProps) {
  const reducedMotion = usePrefersReducedMotion();
  const lightData = usePrefersLightData();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const shouldLoadVideo = !reducedMotion && !lightData;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!shouldLoadVideo) {
      // Stop any in-flight playback when the preference flips mid-session.
      el.pause();
      return;
    }
    // Autoplay can still be rejected (e.g. power-saving); fail silently.
    el.play().catch(() => setVideoFailed(true));
  }, [shouldLoadVideo]);

  const showVideo = shouldLoadVideo && !videoFailed;

  return (
    <div
      data-testid="video-background"
      data-video-state={!showVideo ? 'static' : videoReady ? 'playing' : 'loading'}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{
        // Static layer: always painted, always the safety net.
        background: poster ? undefined : fallbackBackground,
      }}
    >
      {/* Static poster (also the reduced-motion / fallback image) */}
      {poster && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${poster})` }}
        />
      )}

      {/* Video layer — fades in only once it can actually paint a frame */}
      {showVideo && (
        <video
          ref={videoRef}
          data-testid="hero-video"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
          style={{ opacity: videoReady ? 1 : 0 }}
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
        />
      )}

      {/* Legibility + cinematic grade */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-[#050812] via-[#050812]/50 to-transparent ${overlayClassName}`}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mvo-crimson/60 to-transparent" />
    </div>
  );
}
