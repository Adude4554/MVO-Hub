import { useState, useEffect, useRef } from 'react';
import {
  Minimize,
  Maximize,
  X,
  Square,
  Search,
  Bell,
  LogOut,
  User as UserIcon,
  Settings as SettingsIcon,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { PageId } from '../config/pages';
import { WindowSnapLayout } from './WindowSnapLayout';

const AVATAR_COLORS = [
  'from-rose-500 to-red-700',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-blue-600',
  'from-violet-400 to-purple-600',
  'from-fuchsia-400 to-pink-600',
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
  /** Opens the global search palette (same handler as the Ctrl+K shortcut). */
  onOpenSearch?: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  user?: { id: number; username: string; email: string; avatar?: string } | null;
  onNavigate?: (page: PageId, tab?: string) => void;
  /** Optional page-level notification badge count. */
  notifications?: number;
}

export function TopHUD({
  windowState,
  onMinimize,
  onMaximize,
  onClose,
  onOpenSearch,
  user,
  onNavigate,
  notifications = 0,
}: TopHUDProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [snapLayoutOpen, setSnapLayoutOpen] = useState(false);
  const snapLayoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Drag the frameless window, but never from an interactive element.
  const handleDragStart = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[role="menu"]') ||
      target.closest('.no-drag')
    ) {
      return;
    }
    e.preventDefault();
    try {
      await getCurrentWindow().startDragging();
    } catch {
      /* not running under Tauri */
    }
  };

  const displayName = user?.username || 'Adnan';
  const initial = displayName[0]?.toUpperCase() || 'A';
  const gradient = getAvatarColor(displayName);

  return (
    <header
      data-testid="top-hud"
      className="relative z-50 shrink-0 select-none border-b border-white/[0.06] bg-[#070b16]/85 backdrop-blur-xl"
      onMouseDown={handleDragStart}
    >
      <div className="flex h-[76px] items-center gap-4 px-6">
        {/* ── Greeting ─────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <h1
            data-testid="greeting"
            className="truncate text-[19px] font-bold leading-tight tracking-[-0.2px] text-white"
          >
            Welcome back, <span className="text-white">{displayName}</span>
          </h1>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-white/40">
            Your ultimate hub for gaming, entertainment and more.
          </p>
        </div>

        {/* ── Search + actions ─────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Pill-shaped search — opens the real palette (Ctrl+K) */}
          <button
            type="button"
            onClick={onOpenSearch}
            data-testid="search-trigger"
            className="no-drag hidden h-10 w-[260px] items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-left transition-colors hover:border-white/15 hover:bg-white/[0.07] md:flex"
            aria-label="Search anything"
          >
            <Search className="h-4 w-4 shrink-0 text-white/35" />
            <span className="flex-1 truncate text-[12.5px] text-white/35">
              Search anything… (Ctrl + K)
            </span>
          </button>

          {/* Notifications */}
          <div className="no-drag relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/60 transition-colors hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
              aria-label="Notifications"
            >
              <Bell className="h-[17px] w-[17px]" />
              {notifications > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-mvo-crimsonBright px-1 text-[9px] font-bold text-white shadow-[0_0_10px_var(--mvo-crimson-glow)]">
                  {notifications > 9 ? '9+' : notifications}
                </span>
              )}
            </button>
            {notifOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#0b1120] shadow-2xl"
              >
                <div className="border-b border-white/[0.07] px-4 py-3">
                  <p className="text-[12px] font-semibold text-white">Notifications</p>
                </div>
                <div className="px-4 py-8 text-center text-[11.5px] text-white/35">
                  You’re all caught up.
                </div>
              </div>
            )}
          </div>

          {/* Avatar */}
          <div className="no-drag relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              data-testid="avatar-button"
              className="flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-90"
              aria-label="Open user menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={displayName}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-mvo-crimson/50"
                />
              ) : (
                <div
                  className={[
                    'flex h-10 w-10 items-center justify-center rounded-full',
                    'bg-gradient-to-br ring-2 ring-mvo-crimson/50',
                    gradient,
                  ].join(' ')}
                >
                  <span className="text-sm font-bold text-white">{initial}</span>
                </div>
              )}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#0b1120] shadow-2xl"
              >
                <div className="border-b border-white/[0.07] px-4 py-3">
                  <p className="truncate text-[13px] font-semibold text-white">{displayName}</p>
                  <p className="truncate text-[11px] text-white/40">{user?.email || 'Local profile'}</p>
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate?.('settings', 'account');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <UserIcon className="h-4 w-4" /> Account
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate?.('settings');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <SettingsIcon className="h-4 w-4" /> Settings
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await invoke('logout');
                      } catch {
                        /* not running under Tauri */
                      }
                      window.location.reload();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[12.5px] text-mvo-crimsonBright transition-colors hover:bg-mvo-crimson/10"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Window controls */}
          <div className="no-drag ml-1 flex items-center gap-0.5 border-l border-white/[0.07] pl-2">
            <button
              type="button"
              onClick={onMinimize}
              className="rounded-md p-2 text-white/40 transition-colors hover:bg-white/[0.07] hover:text-white"
              aria-label="Minimize"
            >
              <Minimize className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={onMaximize}
                onMouseEnter={() => {
                  snapLayoutTimer.current = setTimeout(() => setSnapLayoutOpen(true), 400);
                }}
                onMouseLeave={() => {
                  if (snapLayoutTimer.current) clearTimeout(snapLayoutTimer.current);
                  setTimeout(() => setSnapLayoutOpen(false), 200);
                }}
                className="rounded-md p-2 text-white/40 transition-colors hover:bg-white/[0.07] hover:text-white"
                aria-label={windowState === 'maximized' ? 'Restore' : 'Maximize'}
              >
                {windowState === 'maximized' ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </button>
              <WindowSnapLayout open={snapLayoutOpen} onClose={() => setSnapLayoutOpen(false)} />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-white/40 transition-colors hover:bg-mvo-crimson hover:text-white"
              aria-label="Close"
              title="Minimize to tray"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
