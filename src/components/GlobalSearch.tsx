import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, Gamepad2, MessageSquare, Settings, Film, LayoutDashboard, Wrench, Monitor, Zap, Bot, Globe, FlaskConical, RefreshCw, Hash } from 'lucide-react';
import { sounds } from '../hooks/useSounds';
import { availablePages } from '../config/pages';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action: () => void;
  category: string;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: string) => void;
  games: { name: string; platform: string }[];
  aiSessions: { id: string; title: string }[];
}

export function GlobalSearch({ isOpen, onClose, onNavigate, games, aiSessions }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const pageIcons: Record<string, React.ReactNode> = {
    dashboard: <LayoutDashboard className="w-4 h-4" />,
    gamelibrary: <Gamepad2 className="w-4 h-4" />,
    gamevault: <Gamepad2 className="w-4 h-4" />,
    optimizer: <Wrench className="w-4 h-4" />,
    performance: <Monitor className="w-4 h-4" />,
    systemboost: <Zap className="w-4 h-4" />,
    aitools: <Bot className="w-4 h-4" />,
    webhub: <Globe className="w-4 h-4" />,
    tools: <Wrench className="w-4 h-4" />,
    settings: <Settings className="w-4 h-4" />,
    functiontest: <FlaskConical className="w-4 h-4" />,
    updates: <RefreshCw className="w-4 h-4" />,
    globalchat: <MessageSquare className="w-4 h-4" />,
    moviestv: <Film className="w-4 h-4" />,
    overlay: <Monitor className="w-4 h-4" />,
    streaming: <Film className="w-4 h-4" />,
    files: <Hash className="w-4 h-4" />,
  };

  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const items: SearchResult[] = [];

    // Search pages
    availablePages.forEach(p => {
      if (p.label.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)) {
        items.push({
          id: `page-${p.id}`,
          title: p.label,
          subtitle: p.description || '',
          icon: pageIcons[p.id] || <Hash className="w-4 h-4" />,
          action: () => { onNavigate(p.id); onClose(); },
          category: 'Pages',
        });
      }
    });

    // Search games
    games.forEach(g => {
      if (g.name.toLowerCase().includes(q)) {
        items.push({
          id: `game-${g.name}`,
          title: g.name,
          subtitle: g.platform,
          icon: <Gamepad2 className="w-4 h-4" />,
          action: () => { onNavigate('gamelibrary'); onClose(); },
          category: 'Games',
        });
      }
    });

    // Search AI sessions
    aiSessions.forEach(s => {
      if (s.title.toLowerCase().includes(q)) {
        items.push({
          id: `chat-${s.id}`,
          title: s.title,
          subtitle: 'AI Chat',
          icon: <MessageSquare className="w-4 h-4" />,
          action: () => { onNavigate('aitools'); onClose(); },
          category: 'AI Chats',
        });
      }
    });

    return items;
  }, [query, games, aiSessions, onNavigate, onClose]);

  useEffect(() => { setSelectedIdx(0); }, [results.length, query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault();
      sounds.click();
      results[selectedIdx].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, selectedIdx, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-mvo-panel/95 backdrop-blur-xl border border-mvo-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-mvo-border">
          <Search className="w-5 h-5 text-mvo-accent" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, games, chats..."
            className="flex-1 bg-transparent text-mvo-text placeholder-mvo-textDim outline-none text-sm"
          />
          <kbd className="px-2 py-0.5 rounded bg-mvo-bg border border-mvo-border text-[10px] text-mvo-textDim">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {query && results.length === 0 && (
            <div className="text-center py-8 text-mvo-textDim text-sm">No results for "{query}"</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => { sounds.click(); r.action(); }}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                i === selectedIdx ? 'bg-mvo-accent/20 text-mvo-accent' : 'hover:bg-mvo-bg/50 text-mvo-text'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-mvo-bg flex items-center justify-center flex-shrink-0">
                {r.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.title}</div>
                <div className="text-xs text-mvo-textDim truncate">{r.subtitle}</div>
              </div>
              <span className="text-[10px] text-mvo-textDim bg-mvo-bg px-2 py-0.5 rounded-full">{r.category}</span>
            </button>
          ))}
          {!query && (
            <div className="text-center py-8 text-mvo-textDim text-sm">
              Type to search across pages, games, and AI chats
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
