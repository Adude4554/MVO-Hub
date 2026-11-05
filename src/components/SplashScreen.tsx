import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrefersReducedMotion } from './VideoBackground';

/** Path relative to the web root, so it works in Vite dev and packaged builds. */
const SPLASH_VIDEO_SRC = 'assets/startup.webm';

interface SplashScreenProps {
  onComplete: () => void;
}

/**
 * Boot splash.
 *
 * Plays `assets/startup.webm` and advances to the app shell when the video
 * ends (`onEnded`). Hard guarantees against getting stuck on the splash:
 *  - `MAX_SPLASH_MS` always resolves, even if the video never loads/ends
 *  - `onError`, reduced-motion and light-data all fall back to the timed
 *    CSS animation that shipped before the video existed
 *  - `onComplete` is idempotent (fires exactly once)
 */
/**
 * The splash ends when the video finishes playing.
 *
 * Whether autoplay actually starts is decided by the *Tauri* WebView at
 * runtime (Chromium autoplay policy can block muted inline playback). If
 * playback never begins, no `ended` event will ever fire, so we must not rely
 * on it alone.
 *
 * Strategy:
 *  - `playing` marks the video as the driver of the splash
 *  - if no `playing` event arrives, the timed CSS splash + MAX_SPLASH_MS guard
 *    take over and the app always launches
 *
 * MAX_SPLASH_MS must exceed the startup clip length
 * (`assets/startup.webm`, currently ~10.0 s) plus the fade-out, otherwise the
 * timeout pre-empts `onEnded` and the splash is cut off mid-play.
 */
const MAX_SPLASH_MS = 12500;
const FALLBACK_MS = 2800;
const AUTOPLAY_GRACE_MS = 1500;
/** Matches the 500 ms opacity transition before unmount. */
const FADE_OUT_MS = 500;

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'logo' | 'text' | 'bar' | 'fade'>('logo');
  const [usingVideo, setUsingVideo] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  const completedRef = useRef(false);
  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    cbRef.current();
  }, []);

  // Try the cinematic video unless the user asked for reduced motion.
  useEffect(() => {
    if (reducedMotion) {
      setUsingVideo(false);
      setVideoFailed(true);
      return;
    }
    setUsingVideo(true);
  }, [reducedMotion]);

  // Absolute ceiling: always fires, regardless of playback state.
  // MAX_SPLASH_MS is comfortably longer than the startup clip, so in the
  // normal case `onEnded` wins and this is never reached. If the video stalls,
  // never autoplays, or the asset is missing, this is the guaranteed exit.
  useEffect(() => {
    const t = setTimeout(() => {
      setPhase('fade');
      setTimeout(complete, FADE_OUT_MS);
    }, MAX_SPLASH_MS);
    return () => clearTimeout(t);
  }, [complete]);

  // Autoplay grace period: if the video has not actually started playing
  // shortly after mount, treat it as unavailable and use the timed path.
  useEffect(() => {
    if (!usingVideo || videoFailed) return;
    if (videoPlaying) return;
    const t = setTimeout(() => {
      setVideoFailed((failed) => failed || !videoPlaying);
    }, AUTOPLAY_GRACE_MS);
    return () => clearTimeout(t);
  }, [usingVideo, videoFailed, videoPlaying]);

  // Timed CSS animation — the default path, and the fallback whenever the
  // video is absent, failed, or never began playing.
  useEffect(() => {
    if (usingVideo && !videoFailed && videoPlaying) return;
    const t1 = setTimeout(() => setPhase('text'), 400);
    const t2 = setTimeout(() => setPhase('bar'), 900);
    const t3 = setTimeout(() => setPhase('fade'), 2200);
    const t4 = setTimeout(complete, FALLBACK_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [usingVideo, videoFailed, videoPlaying, complete]);

  const handleVideoEnded = useCallback(() => {
    setPhase('fade');
    // Guard: the browser can fire `ended` before our `playing` handler marks
    // the video as the driver, but the hand-off must still complete.
    setVideoPlaying(true);
    // Let the opacity transition finish before unmounting.
    setTimeout(complete, FADE_OUT_MS);
  }, [complete]);

  const handleVideoError = useCallback(() => {
    setVideoFailed(true);
  }, []);

  const handleVideoPlaying = useCallback(() => {
    setVideoPlaying(true);
    setPhase('text');
  }, []);

  const videoActive = usingVideo && !videoFailed;
  const videoDrives = videoActive && videoPlaying;

  return (
    <div
      data-testid="splash-screen"
      data-splash-mode={videoActive ? 'video' : 'static'}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#050812] transition-opacity duration-500 ${
        phase === 'fade' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* ── Cinematic startup video ── */}
      {videoActive && (
        <video
          data-testid="splash-video"
          className="absolute inset-0 h-full w-full object-cover"
          src={SPLASH_VIDEO_SRC}
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onEnded={handleVideoEnded}
          onError={handleVideoError}
          onPlaying={handleVideoPlaying}
        />
      )}

      {/* Dimming + vignette so the logo stays legible over the footage */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#050812] via-[#050812]/45 to-[#050812]/70"
      />

      {/* ── Static fallback backdrop (always painted beneath the video) ── */}
      {!videoActive && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-20" />
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-mvo-crimson/10 blur-[120px]" />
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-mvo-crimson/5 blur-[100px]" />
        </div>
      )}

      <div className="relative flex flex-col items-center gap-6">
        <div
          className={`transition-all duration-500 ease-out ${
            phase === 'logo' || phase === 'text' || phase === 'bar'
              ? 'scale-100 opacity-100'
              : 'scale-75 opacity-0'
          }`}
        >
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-mvo-crimson/30 bg-gradient-to-br from-mvo-crimson/15 to-transparent backdrop-blur-sm">
              <img
                src="/logo.png"
                alt="MVO"
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = document.createElement('div');
                  fallback.className =
                    'w-full h-full bg-gradient-to-br from-mvo-crimson to-mvo-crimsonBright flex items-center justify-center';
                  fallback.innerHTML =
                    '<span class="text-3xl font-black text-white tracking-tighter" style="font-family: Orbitron, sans-serif;">MVO</span>';
                  target.parentElement?.appendChild(fallback);
                }}
              />
            </div>
            <div className="absolute -inset-1 -z-10 animate-pulse rounded-full bg-mvo-crimson/15 blur-md" />
          </div>
        </div>

        <div
          className={`text-center transition-all duration-500 ease-out delay-200 ${
            phase === 'text' || phase === 'bar'
              ? 'translate-y-0 opacity-100'
              : 'translate-y-4 opacity-0'
          }`}
        >
          <h1 className="bg-gradient-to-r from-white via-white to-mvo-crimsonBright bg-clip-text font-display text-4xl font-bold text-transparent">
            MVO Hub
          </h1>
          <p className="mt-2 text-sm uppercase tracking-widest text-mvo-textDim">
            System Optimizer &amp; Game Launcher
          </p>
        </div>

        {/* Progress bar only for the static path; the video is its own timer. */}
        {!videoDrives && (
          <div
            className={`w-64 transition-all duration-300 ease-out ${
              phase === 'bar' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="h-1 overflow-hidden rounded-full bg-mvo-panel">
              <div
                className="h-full rounded-full bg-gradient-to-r from-mvo-crimson to-mvo-crimsonBright transition-all duration-1000 ease-out"
                style={{ width: phase === 'bar' || phase === 'fade' ? '100%' : '0%' }}
              />
            </div>
            <p className="mt-3 text-center text-[10px] tracking-wider text-mvo-textMuted">
              {phase === 'bar' ? 'Initializing systems...' : phase === 'fade' ? 'Ready' : ''}
            </p>
          </div>
        )}
      </div>

      <div className="absolute bottom-8 flex items-center gap-4 text-[10px] tracking-wider text-mvo-textMuted/40">
        <span>PERFORMANCE</span>
        <span className="h-1 w-1 rounded-full bg-mvo-crimson/40" />
        <span>GAMING</span>
        <span className="h-1 w-1 rounded-full bg-mvo-crimson/40" />
        <span>OPTIMIZATION</span>
      </div>
    </div>
  );
}

/**
 * Static branded loader shown while the app resolves the signed-in user.
 * Prevents the blank frame between the splash and the auth/shell screens.
 */
export function BootSplash() {
  return (
    <div
      data-testid="boot-splash"
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-[#050812]"
    >
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-mvo-crimson/30 bg-gradient-to-br from-mvo-crimson/15 to-transparent">
        <img src="/logo.png" alt="MVO" className="h-full w-full object-cover" />
      </div>
      <p className="mt-5 text-[10px] uppercase tracking-[0.3em] text-white/30">Starting MVO Hub</p>
      <div className="mt-3 h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-mvo-crimson" />
      </div>
    </div>
  );
}
