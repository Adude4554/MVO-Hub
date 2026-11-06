import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TopHUD } from './components/TopHUD';
import { BottomBar } from './components/BottomBar';
import { DownloadBar } from './components/DownloadBar';
import { Sidebar } from './components/Sidebar';
import { SplashScreen, BootSplash } from './components/SplashScreen';
import { CustomCursor } from './components/CustomCursor';
import { AuthScreen } from './components/AuthScreen';
import { UpdateLockScreen } from './components/UpdateLockScreen';
import { UpdateModal } from './components/UpdateModal';
import { Dashboard } from './pages/Dashboard';
import { GameLibrary } from './pages/GameLibrary';
import { GameVault } from './pages/GameVault';
import { Optimizer } from './pages/Optimizer';
import { Performance } from './pages/Performance';
import { Hardware } from './pages/Hardware';
import { SystemBoost } from './pages/SystemBoost';
import { AITools } from './pages/AITools';
import { Overlay } from './pages/Overlay';
import { Streaming } from './pages/Streaming';
import { Files } from './pages/Files';
import { WebHub } from './pages/WebHub';
import { Browser } from './pages/Browser';
import { Tools } from './pages/Tools';
import { Settings } from './pages/Settings';
import { FunctionTest } from './pages/FunctionTest';
import { Updates } from './pages/Updates';
import { CloudAchievements } from './pages/CloudAchievements';
import { GameDetail } from './pages/GameDetail';
import { GlobalChat } from './pages/GlobalChat';
import { MoviesTV } from './pages/MoviesTV';
import { WindowResizeHandles } from './components/WindowResizeHandles';
import { GlobalSearch } from './components/GlobalSearch';
import { usePerformance } from './hooks/usePerformance';
import { useHardwareSensors } from './hooks/useHardwareSensors';
import { useGames } from './hooks/useGames';
import { useSettings } from './hooks/useSettings';
import { useAI } from './hooks/useAI';
import { useOverlay } from './hooks/useOverlay';
import { useStreaming } from './hooks/useStreaming';
import { useSystem } from './hooks/useSystem';
import { useSounds } from './hooks/useSounds';
import { useUpdater } from './hooks/useUpdater';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { initLocale } from './lib/i18n';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PageId } from './config/pages';
import { DEFAULT_HIDDEN_PAGES } from './config/pages';

initLocale();

// ---------------------------------------------------------------------------
// Test harness (see `src/test-harness.ts`)
//
// Active only when `VITE_TEST_HARNESS=1` is set at build time, which the
// Playwright smoke suite sets via `vite --mode test`. Production builds
// (`npm run build` / `tauri build`) compile these branches away, so this has
// no effect on shipped behaviour.
// ---------------------------------------------------------------------------
const TEST_HARNESS = import.meta.env.VITE_TEST_HARNESS === '1';

/** Page to open on boot, e.g. `?page=hardware` (test harness only). */
function readInitialPage(): PageId | null {
  if (!TEST_HARNESS) return null;
  const requested = new URLSearchParams(window.location.search).get('page');
  return requested ? (requested as PageId) : null;
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activePage, setActivePage] = useState<PageId>(() => readInitialPage() ?? 'dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [windowState, setWindowState] = useState<'normal' | 'maximized' | 'fullscreen'>('normal');
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);

  const [user, setUser] = useState<{ id: number; username: string; email: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const settings = useSettings();
  const { play } = useSounds();

  // Check for saved user on mount
  useEffect(() => {
    invoke<string>('get_current_user').then(data => {
      if (data && data !== 'null') {
        try { setUser(JSON.parse(data)); } catch { /* ignore bad data */ }
      }
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
  }, []);

  // Apply default hidden pages if none set — wait until settings have loaded
  // so a slow load_settings cannot race this save and wipe user preferences.
  useEffect(() => {
    if (settings.loading) return;
    const hidden = settings.settings.hidden_pages;
    if (hidden === undefined || (hidden as string[]).length === 0) {
      settings.save({ hidden_pages: DEFAULT_HIDDEN_PAGES });
    }
  }, [settings.loading, settings.settings.hidden_pages, settings.save]);

  useEffect(() => {
    const theme = settings.settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove('light', 'dark');
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.add(prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.classList.add(theme);
    }
  }, [settings.settings.theme]);

  const performance = usePerformance();
  const hardwareSensors = useHardwareSensors();
  const games = useGames();
  const ai = useAI();
  const overlay = useOverlay();
  const streaming = useStreaming();
  const system = useSystem();
  const { updateInfo, downloading, progress, error, showModal, verificationProgress, checkForUpdates, installUpdate, dismiss, openModal, closeModal } = useUpdater();

  const handlePageChange = useCallback((page: PageId) => {
    play('pageSwitch');
    setActivePage(page);
  }, [play]);

  const handleNewChat = useCallback(() => {
    ai.createSession('New Chat');
    handlePageChange('aitools');
  }, [ai, handlePageChange]);

  useKeyboardShortcuts({
    onToggleSearch: () => setSearchOpen(s => !s),
    onNewChat: handleNewChat,
    onToggleSidebar: () => { play('toggle'); setSidebarCollapsed(s => !s); },
    onNavigate: handlePageChange,
  });

  // ── Test harness bridge ──
  // Lets Playwright navigate between pages and detect React render errors
  // without waiting on splash/auth. Compiled out of production builds.
  useEffect(() => {
    if (!TEST_HARNESS) return;
    const w = window as unknown as Record<string, unknown>;
    w.__MVO_TEST__ = {
      navigate: (page: string) => handlePageChange(page as PageId),
      currentPage: () => activePage,
      pages: ['dashboard', 'moviestv', 'gamelibrary', 'gamevault', 'globalchat', 'files',
              'tools', 'optimizer', 'settings', 'overlay', 'performance', 'hardware',
              'systemboost', 'aitools', 'webhub', 'browser', 'functiontest', 'updates', 'streaming'],
    };
    // Capture React ErrorBoundary crashes so the suite can assert on them.
    w.__MVO_ERRORS__ = [];
  }, [handlePageChange, activePage]);

  useEffect(() => {
    invoke('start_performance_engine').catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen('quick-scan-requested', () => {
      handlePageChange('gamelibrary');
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    }).catch(() => { /* not running under Tauri (web build) */ });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [handlePageChange]);

  const PageComponent = useMemo(() => {
const pageMap: Record<string, React.FC<any>> = {
  dashboard: Dashboard,
  gamelibrary: GameLibrary,
  gamevault: GameVault,
  optimizer: Optimizer,
  performance: Performance,
  hardware: Hardware,
  systemboost: SystemBoost,
  aitools: AITools,
  overlay: Overlay,
  streaming: Streaming,
  files: Files,
  webhub: WebHub,
  browser: Browser,
  tools: Tools,
  settings: Settings,
  functiontest: FunctionTest,
  updates: Updates,
  cloud: CloudAchievements,
  gamedetail: GameDetail,
  globalchat: GlobalChat,
  moviestv: MoviesTV,
  movies: MoviesTV,
  tv: MoviesTV,
};
    return pageMap[activePage] || Dashboard;
  }, [activePage]);

  if (showSplash && !TEST_HARNESS) {
    return (
      <>
        <SplashScreen onComplete={() => { play('splash'); setShowSplash(false); }} />
        <CustomCursor />
      </>
    );
  }

  // Auth gate.
  //
  // While `get_current_user` is still resolving (`authChecked === false`) there
  // is no screen to show yet — previously this fell through to `undefined` and
  // rendered nothing, blanking the window for a moment after the splash.
  // The shared branded loader keeps the transition seamless.
  if (!TEST_HARNESS) {
    if (!authChecked) return <BootSplash />;
    if (!user) return <AuthScreen onAuth={(u) => setUser(u)} />;
  }

  // Force update lock screen — blocks everything, no dismiss
  if (updateInfo?.available && updateInfo?.force) {
    return <UpdateLockScreen version={updateInfo.version || ''} notes={updateInfo.notes || ''} />;
  }

  return (
    <div className="mvo-app h-screen w-screen flex overflow-hidden bg-mvo-bg text-mvo-text font-sans antialiased">
      <WindowResizeHandles />
      <CustomCursor />
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={handlePageChange}
        games={(games as any).games || []}
        aiSessions={(ai as any).sessions || []}
      />

      {/* ── Fixed left navigation ─────────────────────────────── */}
      <Sidebar
        activePage={activePage}
        onPageChange={handlePageChange}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => { play('toggle'); setSidebarCollapsed(s => !s); }}
        hiddenPages={settings.settings.hidden_pages || []}
      />

      {/* ── Main column: HUD + scrolling page area ────────────── */}
      <div
        className={[
          'flex min-w-0 flex-1 flex-col pb-footer transition-[margin] duration-300 ease-out',
          sidebarCollapsed ? 'ml-sidebar-collapsed' : 'ml-sidebar',
        ].join(' ')}
      >
        <TopHUD
          activePage={activePage}
          windowState={windowState}
          onMinimize={() => invoke('window_minimize')}
          onMaximize={() =>
            invoke(windowState === 'maximized' ? 'window_unmaximize' : 'window_maximize').then(() =>
              setWindowState((s) => (s === 'maximized' ? 'normal' : 'maximized')),
            )
          }
          onClose={() => invoke('window_close')}
          onOpenSearch={() => setSearchOpen(true)}
          onToggleSidebar={() => { play('toggle'); setSidebarCollapsed(s => !s); }}
          sidebarCollapsed={sidebarCollapsed}
          user={user}
          onNavigate={(page, tab) => { setSettingsTab(tab); handlePageChange(page); }}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* The single scroll container for page content. */}
          <main
            data-testid="page-viewport"
            className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"
          >
            <div
              key={activePage}
              className={`animate-in ${activePage === 'moviestv' ? 'h-full overflow-y-auto' : ''}`}
            >
              <PageComponent
                performance={performance}
                hardwareSensors={hardwareSensors}
                games={games}
                ai={ai}
                overlay={overlay}
                streaming={streaming}
                system={system}
                settings={settings.settings}
                onNavigate={handlePageChange}
                onSettingsChange={settings.save}
                user={user}
                defaultTab={settingsTab}
                updateInfo={updateInfo}
                onUpdateCheck={checkForUpdates}
                onUpdateDismiss={dismiss}
                onUpdateNow={openModal}
              />
            </div>
          </main>
        </div>
      </div>

      {/* ── Global status footer: spans the full window width ── */}
      <div className="fixed inset-x-0 bottom-0">
        <BottomBar performance={performance} hardwareSensors={hardwareSensors} />
      </div>

      <DownloadBar />

      {/* Update modal for non-force updates */}
      {showModal && updateInfo?.available && !updateInfo?.force && (
        <UpdateModal
          update={updateInfo}
          progress={progress}
          downloading={downloading}
          verificationProgress={verificationProgress}
          error={error}
          onUpdate={installUpdate}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

export default App;
