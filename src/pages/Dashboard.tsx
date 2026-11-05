import { useState, useEffect } from 'react';
import {
  Cpu,
  Gamepad2,
  Film,
  Globe,
  Bot,
  Settings as SettingsIcon,
  Zap,
  ArrowRight,
  Newspaper,
  Plus,
  Gamepad2 as GamepadIcon,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { PageId } from '../config/pages';
import { getSteamPosterUrl, getLauncherGradient, getGameInitials } from '../lib/gameArtwork';
import { VideoBackground } from '../components/VideoBackground';

/* ────────────────────────────────────────────────────────────────
   Quick Access destinations
   ──────────────────────────────────────────────────────────────── */

const QUICK_ACCESS: ReadonlyArray<{
  page: PageId;
  title: string;
  subtitle: string;
  icon: typeof Cpu;
}> = [
  { page: 'hardware', title: 'Hardware', subtitle: 'Monitor & Optimize', icon: Cpu },
  { page: 'gamelibrary', title: 'Game Library', subtitle: 'Your Games', icon: Gamepad2 },
  { page: 'moviestv', title: 'Movies & TV Shows', subtitle: 'Stream & Watch', icon: Film },
  { page: 'browser', title: 'MVO Browser', subtitle: 'Browse the Web', icon: Globe },
  { page: 'aitools', title: 'MVO AI', subtitle: 'Ask. Analyze. Create.', icon: Bot },
  { page: 'settings', title: 'Settings', subtitle: 'Customize MVO', icon: SettingsIcon },
];

/* ────────────────────────────────────────────────────────────────
   Hero slides (pagination is real: 3 cinematic placeholders)
   ──────────────────────────────────────────────────────────────── */

const HERO_SLIDES = [
  {
    eyebrow: 'The command center',
    title: 'MVO HUB',
    subtitle: 'ONE HUB. ENDLESS POSSIBILITIES.',
    /** Cinematic placeholder gradient — swap for artwork later. */
    art: 'radial-gradient(120% 120% at 18% 20%, #3b0a12 0%, #1a0710 45%, #050812 100%)',
    accent: 'linear-gradient(90deg, transparent, rgba(225,29,72,0.55), transparent)',
    // Decorative curve shapes standing in for key art
    shapes: true,
  },
  {
    eyebrow: 'Every launcher, one library',
    title: 'ALL YOUR GAMES',
    subtitle: '16 PLATFORMS. ZERO JUGGLING.',
    art: 'radial-gradient(120% 120% at 80% 15%, #0d1b3d 0%, #0a1024 50%, #050812 100%)',
    accent: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.45), transparent)',
    shapes: false,
  },
  {
    eyebrow: 'Local-first intelligence',
    title: 'MVO AI',
    subtitle: 'POWERED BY YOUR OWN GPU.',
    art: 'radial-gradient(120% 120% at 50% 100%, #2a0f2e 0%, #140a1c 50%, #050812 100%)',
    accent: 'linear-gradient(90deg, transparent, rgba(179,102,255,0.45), transparent)',
    shapes: true,
  },
];

interface HomeProps {
  hardwareSensors?: any;
  ai?: any;
  games?: any;
  onNavigate?: (page: PageId, tab?: string) => void;
  user?: { id: number; username: string; email: string } | null;
}

interface NewsItem {
  title: string;
  description: string;
  date: string;
  icon: string;
  url: string;
}

export function Dashboard({ hardwareSensors, ai, games, onNavigate }: HomeProps) {
  const [slide, setSlide] = useState(0);
  const [scannedGames, setScannedGames] = useState<any[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  /* Library: prefer the scanner DB (gamevault.db) as the source of truth,
     falling back to the live launcher scan supplied by useGames. */
  useEffect(() => {
    let cancelled = false;

    const applyFallback = () => {
      const live = Array.isArray(games?.games) ? games.games : [];
      if (!cancelled) setScannedGames(live);
    };

    invoke<any[]>('load_scanned_games_from_db')
      .then((rows) => {
        if (cancelled) return;
        const usable = Array.isArray(rows) ? rows.filter((g) => !g.is_hidden) : [];
        if (usable.length > 0) setScannedGames(usable);
        else applyFallback();
      })
      .catch(() => {
        if (!cancelled) applyFallback();
      });

    return () => {
      cancelled = true;
    };
  }, [games?.games]);

  /* News: routed through the Rust `get_news_feed` command. */
  useEffect(() => {
    let cancelled = false;
    invoke<NewsItem[]>('get_news_feed')
      .then((items) => {
        if (!cancelled) setNews(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setNews([]);
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Auto-advance the hero */
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 7000);
    return () => clearInterval(id);
  }, []);

  const aiOnline = Boolean(ai?.ollamaRunning);
  const hero = HERO_SLIDES[slide];
  const cpuUsage = hardwareSensors?.cpuUsage;

  return (
    <div data-testid="home-page" className="w-full space-y-8">
      {/* ══════════════════ HERO ══════════════════ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Main banner ── */}
        <div
          data-testid="hero-banner"
          className="relative flex min-h-[340px] flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.07] p-8"
          style={{ background: hero.art }}
        >
          {/* Cinematic video backdrop (slide 1 only). The static gradient
              above and the poster below are the guaranteed fallback. */}
          {slide === 0 ? (
            <VideoBackground
              src="assets/hero-bg.webm"
              poster="assets/hero-poster.webp"
              fallbackBackground={hero.art}
            />
          ) : (
            <>
              {hero.shapes && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                  <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full border border-white/[0.06]" />
                  <div className="absolute -right-6 -top-10 h-56 w-56 rounded-full border border-white/[0.09]" />
                  <div className="absolute -bottom-24 right-10 h-64 w-64 rotate-12 rounded-[3rem] border border-white/[0.05]" />
                </div>
              )}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: hero.accent }}
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050812]/80 via-transparent to-transparent" />
            </>
          )}

          {/* Copy */}
          <div className="relative max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-mvo-crimson/30 bg-mvo-crimson/10 px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.2em] text-mvo-crimsonBright">
              {hero.eyebrow}
            </span>
            <h2
              data-testid="hero-title"
              className="mt-4 text-[42px] leading-[0.92] tracking-[-2px] text-white sm:text-[58px]"
              style={{
                fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
                fontStyle: 'italic',
                fontWeight: 900,
                // Synthesised obliques look upright at heavy weights; the
                // browser only slants if a real italic face is unavailable.
                fontSynthesis: 'none',
                transform: 'skewX(-10deg)',
                transformOrigin: 'left center',
              }}
            >
              {hero.title}
            </h2>
            <p className="mt-3 text-[11.5px] font-semibold uppercase tracking-[0.22em] text-white/55">
              {hero.subtitle}
            </p>
          </div>

          {/* Actions + pagination */}
          <div className="relative mt-6 flex items-end justify-between gap-4">
            <button
              type="button"
              onClick={() => onNavigate?.('gamelibrary')}
              data-testid="hero-cta"
              className="group inline-flex items-center gap-2 rounded-full bg-mvo-crimson px-5 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_6px_24px_-6px_var(--mvo-crimson-glow)] transition-all hover:bg-mvo-crimsonBright hover:shadow-[0_8px_28px_-4px_var(--mvo-crimson-glow)] active:scale-[0.98]"
            >
              Explore Now
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>

            <div className="flex items-center gap-1.5" role="tablist" aria-label="Hero slides">
              {HERO_SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === slide}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => setSlide(i)}
                  className={[
                    'h-1.5 rounded-full transition-all duration-300',
                    i === slide
                      ? 'w-6 bg-mvo-crimsonBright shadow-[0_0_8px_var(--mvo-crimson-glow)]'
                      : 'w-1.5 bg-white/25 hover:bg-white/50',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── AI status card ── */}
        <aside
          data-testid="ai-status-card"
          className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#0d1020] to-[#070a14] p-6"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-mvo-crimson/10 blur-3xl"
          />

          <div className="relative">
            {/* Brain placeholder graphic */}
            <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-mvo-crimson/25 bg-mvo-crimson/10">
              <Bot className="h-7 w-7 text-mvo-crimsonBright" strokeWidth={1.8} />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#0b0f1c] bg-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-900/60" />
              </span>
            </div>

            <h3 className="font-display text-[17px] font-bold tracking-tight text-white">MVO AI</h3>
            <p className="mt-1 text-[11.5px] text-white/45">Powered by Nemotron 3 Super</p>

            <div className="mt-4 flex items-center gap-2">
              <span
                data-testid="ai-online-dot"
                className={[
                  'h-2 w-2 rounded-full',
                  aiOnline
                    ? 'bg-emerald-400 shadow-[0_0_8px_1px_rgba(52,211,153,0.7)]'
                    : 'bg-amber-400 shadow-[0_0_8px_1px_rgba(251,191,36,0.6)]',
                ].join(' ')}
              />
              <span className="text-[11.5px] font-medium text-white/70">Online</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate?.('aitools')}
            data-testid="ai-open-button"
            className="group relative mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.05] px-4 py-2.5 text-[12.5px] font-semibold text-white/90 transition-colors hover:border-mvo-crimson/40 hover:bg-mvo-crimson/15 hover:text-white"
          >
            Open AI Center
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </aside>
      </section>

      {/* ══════════════════ QUICK ACCESS ══════════════════ */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mvo-crimson/15">
              <Zap className="h-4 w-4 fill-mvo-crimsonBright text-mvo-crimsonBright" />
            </span>
            Quick Access
          </h2>
          {typeof cpuUsage === 'number' && cpuUsage > 0 && (
            <span className="flex items-center gap-2 text-[11px] text-white/35">
              <Cpu className="h-3.5 w-3.5" />
              CPU {cpuUsage.toFixed(0)}%
            </span>
          )}
        </div>

        <div
          data-testid="quick-access"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
        >
          {QUICK_ACCESS.map(({ page, title, subtitle, icon: Icon }) => (
            <button
              key={page}
              type="button"
              onClick={() => onNavigate?.(page)}
              data-testid={`quick-${page}`}
              className="group relative flex min-h-[132px] flex-col items-start justify-between overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0e18] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-mvo-crimson/35 hover:bg-mvo-crimsonDim hover:shadow-[0_10px_30px_-12px_var(--mvo-crimson-glow)]"
            >
              <Icon
                className="h-6 w-6 text-white/45 transition-colors duration-200 group-hover:text-mvo-crimsonBright"
                strokeWidth={1.8}
              />
              <div className="w-full">
                <div className="truncate text-[12.5px] font-semibold leading-tight text-white">{title}</div>
                <div className="mt-0.5 truncate text-[10.5px] leading-tight text-white/35">{subtitle}</div>
                <div className="mt-2 flex justify-end">
                  <ArrowRight className="h-4 w-4 -translate-x-1 text-white/20 transition-all duration-200 group-hover:translate-x-0 group-hover:text-mvo-crimsonBright" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ══════════════════ YOUR LIBRARY + LATEST NEWS ══════════════════ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── Your Library ── */}
        <div
          data-testid="your-library"
          className="rounded-2xl border border-white/[0.06] bg-[#0a0e18] p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2.5 text-[13.5px] font-bold text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mvo-crimson/15">
                <GamepadIcon className="h-4 w-4 text-mvo-crimsonBright" />
              </span>
              Your Library
            </h2>
            <button
              type="button"
              onClick={() => onNavigate?.('gamelibrary')}
              data-testid="library-view-all"
              className="flex items-center gap-1 text-[11.5px] font-medium text-mvo-crimsonBright transition-colors hover:text-white"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1">
            {scannedGames.length === 0 && (
              <div className="flex h-[148px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-[11px] text-white/30">
                No games detected yet — run a scan in your Game Library.
              </div>
            )}

            {scannedGames.slice(0, 5).map((game: any) => {
              const poster = game.platform === 'Steam' && game.app_id
                ? getSteamPosterUrl({ launcher: 'steam', app_id: String(game.app_id) } as any)
                : game.cover_local
                  ? `file://${game.cover_local}`
                  : '';
              return (
                <button
                  key={game.id || game.name}
                  type="button"
                  onClick={() => onNavigate?.('gamelibrary')}
                  title={game.name}
                  data-testid="library-cover"
                  className="group relative flex w-[104px] shrink-0 flex-col gap-1.5 text-left"
                >
                  <div
                    className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-white/[0.07] transition-colors group-hover:border-mvo-crimson/45"
                    style={poster ? undefined : { background: getLauncherGradient(game.launcher || 'unknown') }}
                  >
                    {poster ? (
                      <img
                        src={poster}
                        alt={game.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="font-display text-lg font-bold text-white/70">
                          {getGameInitials(game.name || '?')}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="truncate text-[10px] text-white/50 group-hover:text-white/80">
                    {game.name}
                  </span>
                </button>
              );
            })}

            {/* Add Game */}
            <button
              type="button"
              onClick={() => onNavigate?.('gamelibrary')}
              data-testid="library-add-game"
              className="group flex w-[104px] shrink-0 flex-col gap-1.5 text-left"
              style={{ visibility: 'visible' }}
            >
              <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] transition-colors group-hover:border-mvo-crimson/50 group-hover:bg-mvo-crimsonDim">
                <Plus className="h-6 w-6 text-white/30 transition-colors group-hover:text-mvo-crimsonBright" />
              </div>
              <span className="truncate text-[10px] text-white/40">Add Game</span>
            </button>
          </div>
        </div>

        {/* ── Latest News ── */}
        <div
          data-testid="latest-news"
          className="rounded-2xl border border-white/[0.06] bg-[#0a0e18] p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2.5 text-[13.5px] font-bold text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mvo-crimson/15">
                <Newspaper className="h-4 w-4 text-mvo-crimsonBright" />
              </span>
              Latest News
            </h2>
            <button
              type="button"
              onClick={() => {
                const url = news[0]?.url;
                if (url) {
                  invoke('open_url', { url }).catch(() => {});
                } else {
                  onNavigate?.('updates');
                }
              }}
              data-testid="news-view-all"
              className="flex items-center gap-1 text-[11.5px] font-medium text-mvo-crimsonBright transition-colors hover:text-white"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {newsLoading ? (
            <div className="flex h-[148px] items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-[11px] text-white/25">
              Loading news…
            </div>
          ) : news.length === 0 ? (
            <div
              data-testid="news-empty"
              className="flex h-[148px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/[0.08] text-[11px] text-white/30"
            >
              <Newspaper className="h-5 w-5 text-white/20" />
              No news right now.
            </div>
          ) : (
            (() => {
              const item = news[0];
              const extras = news.slice(1, 3);
              return (
                <div className="space-y-3">
                  {/* Prominent featured card */}
                  <a
                    href={item.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="news-featured"
                    onClick={(e) => {
                      if (!item.url) {
                        e.preventDefault();
                        onNavigate?.('updates');
                      }
                    }}
                    className="group flex gap-3 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition-colors hover:border-mvo-crimson/40 hover:bg-mvo-crimsonDim"
                  >
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-mvo-crimson/25 to-mvo-crimson/5 text-2xl">
                      <span aria-hidden="true">{item.icon || '📢'}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold leading-tight text-white group-hover:text-white">
                        {item.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-white/40">
                        {item.description}
                      </p>
                      {item.date && (
                        <p className="mt-1.5 text-[9.5px] font-medium uppercase tracking-wider text-white/25">
                          {item.date}
                        </p>
                      )}
                    </div>
                  </a>

                  {/* Secondary headlines */}
                  {extras.map((n, i) => (
                    <div
                      key={`${n.title}-${i}`}
                      className="flex items-center gap-2.5 rounded-lg px-1 py-1.5"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mvo-crimson/60" />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-white/55">
                        {n.title}
                      </span>
                      {n.date && (
                        <span className="shrink-0 text-[9.5px] text-white/25">{n.date}</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      </section>
    </div>
  );
}
