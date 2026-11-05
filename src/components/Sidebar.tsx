import {
  Home,
  Cpu,
  Gamepad2,
  Film,
  Globe,
  Bot,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { PageId } from '../config/pages';

/**
 * Primary navigation.
 *
 * This is the *front door* of the product: a curated seven-destination menu.
 * The full page registry (19 routed pages) is still reachable via the global
 * search palette (Ctrl+K) or keyboard shortcuts, so no surface is lost.
 */
const PRIMARY_NAV: ReadonlyArray<{
  id: PageId;
  label: string;
  icon: typeof Home;
}> = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'hardware', label: 'Hardware', icon: Cpu },
  { id: 'gamelibrary', label: 'Game Library', icon: Gamepad2 },
  { id: 'moviestv', label: 'Movies & TV Shows', icon: Film },
  { id: 'browser', label: 'MVO Browser', icon: Globe },
  { id: 'aitools', label: 'MVO AI', icon: Bot },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

interface SidebarProps {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  /** Retained for API compatibility; primary nav is a fixed set. */
  hiddenPages?: string[];
}

export function Sidebar({
  activePage,
  onPageChange,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  return (
    <aside
      data-testid="sidebar"
      className={[
        // The sidebar stops above the global footer so footer content is
        // never covered. Height derives from --mvo-footer-height.
        'fixed left-0 top-0 z-40 flex h-[calc(100%-var(--mvo-footer-height))] flex-col',
        'border-r border-white/[0.06]',
        'bg-[#050812]',
        'transition-[width] duration-300 ease-out',
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      ].join(' ')}
      aria-label="Main navigation"
    >
      {/* ── Branding ─────────────────────────────────────────── */}
      <div className="flex h-[76px] shrink-0 items-center gap-3 px-4">
        <div
          className={[
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            'bg-gradient-to-br from-mvo-crimsonBright to-mvo-crimson',
            'shadow-[0_0_22px_-4px_var(--mvo-crimson-glow)]',
          ].join(' ')}
          aria-hidden="true"
        >
          {/* Stylised 'M' — two strokes meeting at a peak */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 18V7l8 7 8-7v11" />
          </svg>
        </div>

        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-black leading-none tracking-[0.14em] text-white">
              MVO HUB
            </div>
            <div className="mt-1.5 whitespace-nowrap text-[7.5px] font-semibold uppercase leading-none tracking-[0.11em] text-white/35">
              Play • Watch • Browse • More
            </div>
          </div>
        )}
      </div>

      {/* ── Primary navigation ───────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Primary">
        {!collapsed && (
          <div className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/25">
            Menu
          </div>
        )}
        <ul className="space-y-1">
          {PRIMARY_NAV.map(({ id, label, icon: Icon }) => {
            const active = activePage === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPageChange(id)}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? label : undefined}
                  data-testid={`nav-${id}`}
                  className={[
                    'group relative flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium',
                    'transition-colors duration-150',
                    collapsed ? 'justify-center px-0' : 'px-3',
                    active
                      ? 'text-white'
                      : 'text-white/55 hover:bg-white/[0.04] hover:text-white/90',
                  ].join(' ')}
                >
                  {/* Glowing indicator extending from the left edge */}
                  {active && (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-mvo-crimson/25 via-mvo-crimson/10 to-transparent"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-mvo-crimsonBright shadow-[0_0_12px_2px_var(--mvo-crimson-glow)]"
                      />
                    </>
                  )}
                  <Icon
                    className={[
                      'relative h-[18px] w-[18px] shrink-0 transition-colors',
                      active ? 'text-mvo-crimsonBright' : 'text-white/45 group-hover:text-white/80',
                    ].join(' ')}
                    strokeWidth={active ? 2.4 : 2}
                  />
                  {!collapsed && <span className="relative truncate">{label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Footer: collapse control ─────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={[
            'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-white/35',
            'transition-colors hover:bg-white/[0.04] hover:text-white/80',
            collapsed ? 'justify-center px-0' : '',
          ].join(' ')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-testid="sidebar-collapse"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span className="text-[11px] font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
