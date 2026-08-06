import { Settings as SettingsIcon, Gamepad2, Monitor, Activity, Wrench, Rocket, Bot, FolderOpen, Globe, Wrench as WrenchIcon, FlaskConical, LayoutDashboard, Package, RefreshCw, MessageCircle, Film, Tv } from 'lucide-react';
import { availablePages, PageId } from '../config/pages';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

interface SidebarProps {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  collapsed: boolean;
  hiddenPages?: string[];
}

export function Sidebar({ activePage, onPageChange, collapsed, hiddenPages = [] }: SidebarProps) {
  useLocale();
  const hidden = new Set(hiddenPages);

  const groups = [
    { id: 'main', label: 'MAIN', pages: availablePages.filter(p => p.group === 'main' && !hidden.has(p.id)) },
    { id: 'media', label: 'MOVIES & TV SHOWS', pages: availablePages.filter(p => p.group === 'media' && !hidden.has(p.id)) },
    { id: 'gaming', label: 'GAMING', pages: availablePages.filter(p => p.group === 'gaming' && !hidden.has(p.id)) },
    { id: 'tools', label: 'TOOLS', pages: availablePages.filter(p => p.group === 'tools' && !hidden.has(p.id)) },
    { id: 'system', label: 'SYSTEM', pages: availablePages.filter(p => p.group === 'system' && !hidden.has(p.id)) },
  ].filter(g => g.pages.length > 0);

  const pageIcons: Record<string, React.ReactNode> = {
    dashboard: <LayoutDashboard className="w-5 h-5" />,
    gamelibrary: <Gamepad2 className="w-5 h-5" />,
    gamevault: <Package className="w-5 h-5" />,
    overlay: <Monitor className="w-5 h-5" />,
    performance: <Activity className="w-5 h-5" />,
    optimizer: <Wrench className="w-5 h-5" />,
    files: <FolderOpen className="w-5 h-5" />,
    webhub: <Globe className="w-5 h-5" />,
    tools: <WrenchIcon className="w-5 h-5" />,
    functiontest: <FlaskConical className="w-5 h-5" />,
    settings: <SettingsIcon className="w-5 h-5" />,
    updates: <RefreshCw className="w-5 h-5" />,
    globalchat: <MessageCircle className="w-5 h-5" />,
    moviestv: <Film className="w-5 h-5" />,
    movies: <Film className="w-5 h-5" />,
    tv: <Tv className="w-5 h-5" />,
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-full transition-all duration-300 bg-mvo-panel/95 backdrop-blur-xl border-r border-mvo-border/50 flex flex-col ${collapsed ? 'w-16' : 'w-64'}`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-mvo-border/50">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <span className="text-black font-display font-bold text-sm">M</span>
            </div>
            <span className="font-display font-bold text-lg text-mvo-text">MVO Hub</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-2" role="navigation" aria-label="Main navigation">
        {groups.map(group => (
          <div key={group.id}>
            {!collapsed && (
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-mvo-textMuted">
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {group.pages.map(page => (
                <button
                  key={page.id}
                  onClick={() => onPageChange(page.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                    activePage === page.id
                      ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 shadow-[0_0_15px_#00d4ff33]'
                      : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover'
                  } ${collapsed ? 'justify-center' : ''}`}
                  title={collapsed ? t(`nav.${page.id}`) : undefined}
                  aria-current={activePage === page.id ? 'page' : undefined}
                >
                  <span className="flex-shrink-0">{pageIcons[page.id] || <span className="w-5 h-5" />}</span>
                  {!collapsed && (
                    <span className="font-medium text-sm truncate">{t(`nav.${page.id}`)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-mvo-border/50">
        {!collapsed && (
          <div className="text-xs text-mvo-textMuted mb-2">Shortcuts</div>
        )}
        <div className="flex items-center justify-between text-xs text-mvo-textMuted px-1">
          <span>MVO HUB</span>
          <span>v0.1.0-beta</span>
        </div>
      </div>
    </aside>
  );
}
