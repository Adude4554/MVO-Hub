import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TopHUD } from './components/TopHUD';
import { BottomBar } from './components/BottomBar';
import { DownloadBar } from './components/DownloadBar';
import { RightPanel } from './components/RightPanel';
import { Sidebar } from './components/Sidebar';
import { SplashScreen } from './components/SplashScreen';
import { CustomCursor } from './components/CustomCursor';
import { AuthScreen } from './components/AuthScreen';
import { UpdateLockScreen } from './components/UpdateLockScreen';
import { Dashboard } from './pages/Dashboard';
import { GameLibrary } from './pages/GameLibrary';
import { GameVault } from './pages/GameVault';
import { Optimizer } from './pages/Optimizer';
import { Performance } from './pages/Performance';
import { SystemBoost } from './pages/SystemBoost';
import { AITools } from './pages/AITools';
import { Overlay } from './pages/Overlay';
import { Streaming } from './pages/Streaming';
import { Files } from './pages/Files';
import { WebHub } from './pages/WebHub';
import { Tools } from './pages/Tools';
import { Settings } from './pages/Settings';
import { FunctionTest } from './pages/FunctionTest';
import { Updates } from './pages/Updates';
import { GlobalChat } from './pages/GlobalChat';
import { MoviesTV } from './pages/MoviesTV';
import { WindowResizeHandles } from './components/WindowResizeHandles';
import { usePerformance } from './hooks/usePerformance';
import { useHardware } from './hooks/useHardware';
import { useGames } from './hooks/useGames';
import { useSettings } from './hooks/useSettings';
import { useAI } from './hooks/useAI';
import { useOverlay } from './hooks/useOverlay';
import { useStreaming } from './hooks/useStreaming';
import { useSystem } from './hooks/useSystem';
import { useSounds } from './hooks/useSounds';
import { useUpdater } from './hooks/useUpdater';
import { initLocale } from './lib/i18n';
import { invoke } from '@tauri-apps/api/core';
import { availablePages, PageId } from './config/pages';
import { DEFAULT_HIDDEN_PAGES } from './config/pages';

initLocale();

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [windowState, setWindowState] = useState<'normal' | 'maximized' | 'fullscreen'>('normal');
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);

  const [user, setUser] = useState<{ id: number; username: string; email: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const settings = useSettings();
  const { play } = useSounds();

  // Check for saved user on mount
  useEffect(() => {
    invoke<string>('get_current_user').then(data => {
      if (data && data !== 'null') {
        setUser(JSON.parse(data));
      }
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
  }, []);

  // Apply default hidden pages if none set
  useEffect(() => {
    if (settings.settings.hidden_pages === undefined || (settings.settings.hidden_pages as string[]).length === 0) {
      settings.save({ hidden_pages: DEFAULT_HIDDEN_PAGES });
    }
  }, []);

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
  const hardware = useHardware();
  const games = useGames();
  const ai = useAI();
  const overlay = useOverlay();
  const streaming = useStreaming();
  const system = useSystem();
  const { updateInfo } = useUpdater();

  useEffect(() => {
    invoke('start_performance_engine').catch(console.error);
  });

  const handlePageChange = useCallback((page: PageId) => {
    play('pageSwitch');
    setActivePage(page);
  }, [play]);

  const PageComponent = useMemo(() => {
const pageMap: Record<string, React.FC<any>> = {
  dashboard: Dashboard,
  gamelibrary: GameLibrary,
  gamevault: GameVault,
  optimizer: Optimizer,
  performance: Performance,
  systemboost: SystemBoost,
  aitools: AITools,
  overlay: Overlay,
  streaming: Streaming,
  files: Files,
  webhub: WebHub,
  tools: Tools,
  settings: Settings,
  functiontest: FunctionTest,
  updates: Updates,
  globalchat: GlobalChat,
  moviestv: MoviesTV,
  movies: MoviesTV,
  tv: MoviesTV,
};
    return pageMap[activePage] || Dashboard;
  }, [activePage]);

  if (showSplash) {
    return (
      <>
        <SplashScreen onComplete={() => { play('splash'); setShowSplash(false); }} />
        <CustomCursor />
      </>
    );
  }

  // Auth screen
  if (authChecked && !user) {
    return <AuthScreen onAuth={(u) => setUser(u)} />;
  }

  // Update lock screen — locks app, auto-downloads, no dismiss
  if (updateInfo?.available) {
    return <UpdateLockScreen version={updateInfo.version || ''} notes={updateInfo.notes || ''} />;
  }

  return (
    <div className="mvo-app h-screen w-screen flex flex-col overflow-hidden bg-mvo-bg text-mvo-text font-sans antialiased">
      <WindowResizeHandles />
      <CustomCursor />

      <TopHUD
        activePage={activePage}
        windowState={windowState}
        onMinimize={() => invoke('window_minimize')}
        onMaximize={() => invoke(windowState === 'maximized' ? 'window_unmaximize' : 'window_maximize').then(() => setWindowState(s => s === 'maximized' ? 'normal' : 'maximized'))}
        onClose={() => invoke('window_close')}
        onToggleSidebar={() => { play('toggle'); setSidebarCollapsed(s => !s); }}
        sidebarCollapsed={sidebarCollapsed}
        onToggleRightPanel={() => { play('toggle'); setRightPanelOpen(s => !s); }}
        rightPanelOpen={rightPanelOpen}
        user={user}
        onNavigate={(page, tab) => { setSettingsTab(tab); handlePageChange(page); }}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activePage={activePage}
          onPageChange={handlePageChange}
          collapsed={sidebarCollapsed}
          hiddenPages={settings.settings.hidden_pages || []}
        />

        <main className={`flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
          <div key={activePage} className={`animate-in ${activePage === 'moviestv' ? 'h-full overflow-y-auto' : ''}`}>
            <PageComponent
              performance={performance}
              hardware={hardware}
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
            />
          </div>
        </main>

        <RightPanel
          isOpen={rightPanelOpen}
          onClose={() => { play('click'); setRightPanelOpen(false); }}
          performance={performance}
          hardware={hardware}
          games={games}
          overlay={overlay}
          streaming={streaming}
        />
      </div>

      <BottomBar
        performance={performance}
        hardware={hardware}
        windowState={windowState}
      />
      <DownloadBar />
    </div>
  );
}

export default App;
