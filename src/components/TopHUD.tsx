import { useState, useEffect, useRef } from 'react';
import { Minimize, Maximize, X, PanelRight, PanelLeft, Settings as SettingsIcon, ChevronDown, Square } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { availablePages, PageId } from '../config/pages';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';
import { invoke } from '@tauri-apps/api/core';
import { WindowSnapLayout } from './WindowSnapLayout';

const AVATAR_COLORS = [
  'from-cyan-400 to-blue-600',
  'from-purple-400 to-pink-600',
  'from-green-400 to-emerald-600',
  'from-orange-400 to-red-600',
  'from-yellow-400 to-amber-600',
  'from-indigo-400 to-violet-600',
  'from-rose-400 to-fuchsia-600',
  'from-teal-400 to-cyan-600',
];

function getAvatarColor(username: string) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface TopHUDProps {
  activePage: PageId;
  windowState: 'normal' | 'maximized' | 'fullscreen';
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  onToggleRightPanel: () => void;
  rightPanelOpen: boolean;
  user?: { id: number; username: string; email: string; avatar?: string } | null;
  onNavigate?: (page: PageId, tab?: string) => void;
}

export function TopHUD({
  activePage,
  windowState,
  onMinimize,
  onMaximize,
  onClose,
  onToggleSidebar,
  sidebarCollapsed,
  onToggleRightPanel,
  rightPanelOpen,
  user,
  onNavigate,
}: TopHUDProps) {
  useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [snapLayoutOpen, setSnapLayoutOpen] = useState(false);
  const snapLayoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const page = availablePages.find(p => p.id === activePage);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDragStart = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('[role="menu"]') || target.closest('.no-drag')) return;
    e.preventDefault();
    try { await getCurrentWindow().startDragging(); } catch {}
  };

  const initial = user?.username?.[0]?.toUpperCase() || 'U';
  const gradient = getAvatarColor(user?.username || 'U');

  return (
    <>
      <header
        className="h-12 bg-mvo-panel/80 backdrop-blur-xl border-b border-mvo-border/50 flex items-center justify-between px-4 z-50 select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-3">
          <button onClick={onToggleSidebar} className="no-drag p-2 rounded-xl text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover transition-all duration-200" aria-label="Toggle sidebar">
            <PanelLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-purple-500/20 flex items-center justify-center border border-cyan-400/30">
              <span className="text-xl">🎮</span>
            </div>
            <span className="font-display font-bold text-lg bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
              MVO Hub
            </span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center gap-4">
          {!sidebarCollapsed && page && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-mvo-panelHover/50 rounded-lg border border-mvo-border/30">
              <span className="text-xl">{page.icon}</span>
              <span className="font-medium text-sm text-mvo-text">{t(`nav.${page.id}`)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {user && (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(!menuOpen)} className="no-drag flex items-center gap-2 p-1.5 rounded-xl hover:bg-mvo-panelHover transition-all duration-200">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} className="w-7 h-7 rounded-lg object-cover" />
                ) : (
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                    <span className="text-white font-bold text-xs">{initial}</span>
                  </div>
                )}
                <span className="text-xs text-mvo-textDim max-w-[80px] truncate hidden md:block">{user.username}</span>
                <ChevronDown className={`w-3 h-3 text-mvo-textDim transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-mvo-panel/95 backdrop-blur-xl border border-mvo-border/50 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-mvo-border/30">
                    <p className="font-medium text-sm text-mvo-text">{user.username}</p>
                    <p className="text-xs text-mvo-textDim">{user.email}</p>
                  </div>
                  <div className="py-1">
                    <button onClick={() => { setMenuOpen(false); onNavigate?.('settings', 'account'); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover transition-colors">
                      <SettingsIcon className="w-4 h-4" /> Account Settings
                    </button>
                    <button onClick={async () => { await invoke('logout'); window.location.reload(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-400/10 transition-colors">
                      <X className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={onToggleRightPanel}
            className={`no-drag p-2 rounded-xl transition-all duration-200 ${rightPanelOpen ? 'bg-mvo-accent/20 text-mvo-accent' : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover'}`}
            aria-label="Toggle right panel"
          >
            <PanelRight className="w-5 h-5" />
          </button>
          <button onClick={onMinimize} className="no-drag p-2 rounded-xl text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover transition-all duration-200" aria-label="Minimize">
            <Minimize className="w-5 h-5" />
          </button>
          {windowState === 'maximized' ? (
            <div className="relative">
              <button
                onClick={onMaximize}
                onMouseEnter={() => { snapLayoutTimer.current = setTimeout(() => setSnapLayoutOpen(true), 400); }}
                onMouseLeave={() => { clearTimeout(snapLayoutTimer.current!); setTimeout(() => setSnapLayoutOpen(false), 200); }}
                className="no-drag p-2 rounded-xl text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover transition-all duration-200"
                aria-label="Restore"
              >
                <Square className="w-5 h-5" />
              </button>
              <WindowSnapLayout open={snapLayoutOpen} onClose={() => setSnapLayoutOpen(false)} />
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={onMaximize}
                onMouseEnter={() => { snapLayoutTimer.current = setTimeout(() => setSnapLayoutOpen(true), 400); }}
                onMouseLeave={() => { clearTimeout(snapLayoutTimer.current!); setTimeout(() => setSnapLayoutOpen(false), 200); }}
                className="no-drag p-2 rounded-xl text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover transition-all duration-200"
                aria-label="Maximize"
              >
                <Maximize className="w-5 h-5" />
              </button>
              <WindowSnapLayout open={snapLayoutOpen} onClose={() => setSnapLayoutOpen(false)} />
            </div>
          )}
          <button onClick={onClose} className="no-drag p-2 rounded-xl text-mvo-textDim hover:text-mvo-accentRed hover:bg-mvo-accentRed/10 transition-all duration-200" aria-label="Close" title="Minimize to tray">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>
    </>
  );
}
