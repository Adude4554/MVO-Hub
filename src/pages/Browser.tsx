import { useState, useCallback, useEffect, useRef } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Globe, RotateCw, Home, Star, Search, X, Plus, Zap, Puzzle, Monitor, Brain } from 'lucide-react';
import { t } from '../lib/i18n';

interface Tab {
  id: string;
  title: string;
  url: string;
  webviewLabel: string;
}

const BOOKMARKS = [
  { name: 'Google', url: 'https://google.com', icon: Globe },
  { name: 'YouTube', url: 'https://youtube.com', icon: Monitor },
  { name: 'GitHub', url: 'https://github.com', icon: Globe },
  { name: 'Steam', url: 'https://store.steampowered.com', icon: Globe },
  { name: 'Reddit', url: 'https://reddit.com', icon: Globe },
  { name: 'Nexus Mods', url: 'https://nexusmods.com', icon: Puzzle },
  { name: 'Speedtest', url: 'https://speedtest.net', icon: Zap },
  { name: 'Ollama', url: 'https://ollama.com', icon: Brain },
];

const DEFAULT_URL = 'https://google.com';

function formatUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

let tabCounter = 0;

async function closeWebview(label: string) {
  try {
    const wv = await WebviewWindow.getByLabel(label);
    if (wv) await wv.close();
  } catch {}
}

export function Browser() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const createTab = useCallback(async (url: string = DEFAULT_URL) => {
    const id = `tab-${++tabCounter}`;
    const label = `browser-${id}`;
    const formattedUrl = formatUrl(url);

    try {
      const webview = new WebviewWindow(label, {
        url: formattedUrl,
        title: getDomain(formattedUrl),
        width: 1200,
        height: 800,
        center: true,
      });

      webview.once('tauri://created', () => {
        const newTab: Tab = { id, title: getDomain(formattedUrl), url: formattedUrl, webviewLabel: label };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(id);
        setUrlInput(formattedUrl);
        setIsLoading(false);
      });

      webview.once('tauri://error', () => {
        setIsLoading(false);
      });
    } catch {
      setIsLoading(false);
    }
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) await closeWebview(tab.webviewLabel);
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [tabs, activeTabId]);

  const navigate = useCallback(async (url: string) => {
    if (!activeTab) return;
    const formattedUrl = formatUrl(url);
    setUrlInput(formattedUrl);
    setIsLoading(true);

    // Close old webview and create a new one (Tauri 2 Webview has no navigate method)
    await closeWebview(activeTab.webviewLabel);
    const newLabel = activeTab.webviewLabel + '-nav-' + Date.now();

    try {
      const webview = new WebviewWindow(newLabel, {
        url: formattedUrl,
        title: getDomain(formattedUrl),
        width: 1200,
        height: 800,
        center: true,
      });

      webview.once('tauri://created', () => {
        setTabs(prev => prev.map(t =>
          t.id === activeTab.id
            ? { ...t, url: formattedUrl, title: getDomain(formattedUrl), webviewLabel: newLabel }
            : t
        ));
        setIsLoading(false);
      });

      webview.once('tauri://error', () => {
        setIsLoading(false);
      });
    } catch {
      setIsLoading(false);
    }
  }, [activeTab]);

  const handleUrlSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) navigate(urlInput);
  }, [urlInput, navigate]);

  const handleBookmarkClick = useCallback((url: string) => {
    if (activeTab) {
      navigate(url);
    } else {
      createTab(url);
    }
  }, [activeTab, navigate, createTab]);

  // Clean up all webviews on unmount
  useEffect(() => {
    const currentTabs = tabs;
    return () => {
      currentTabs.forEach(tab => closeWebview(tab.webviewLabel));
    };
  }, []);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text flex items-center gap-2">
            <Globe className="w-6 h-6 text-cyan-400" />
            {t('browser.title') || 'Browser'}
          </h1>
          <p className="text-mvo-textDim mt-1">{t('browser.subtitle') || 'Browse the web with Chromium'}</p>
        </div>
        <button
          onClick={() => createTab()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Tab
        </button>
      </div>

      {/* URL Bar */}
      <div className="glass rounded-xl p-2">
        <div className="flex items-center gap-2">
          {activeTab && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate(activeTab.url)}
                className="p-2 rounded-lg hover:bg-mvo-panelHover text-mvo-textDim hover:text-mvo-text transition-colors"
                title="Refresh"
              >
                <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => navigate(DEFAULT_URL)}
                className="p-2 rounded-lg hover:bg-mvo-panelHover text-mvo-textDim hover:text-mvo-text transition-colors"
                title="Home"
              >
                <Home className="w-4 h-4" />
              </button>
            </div>
          )}
          <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-mvo-bg border border-mvo-border focus-within:border-cyan-500/50 transition-colors">
              <Search className="w-4 h-4 text-mvo-textDim flex-shrink-0" />
              <input
                ref={urlInputRef}
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Search or enter URL..."
                className="flex-1 bg-transparent text-mvo-text text-sm outline-none placeholder:text-mvo-textMuted"
                onFocus={(e) => e.target.select()}
              />
              {urlInput && (
                <button
                  type="button"
                  onClick={() => { setUrlInput(''); urlInputRef.current?.focus(); }}
                  className="text-mvo-textDim hover:text-mvo-text"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Bookmarks Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Star className="w-4 h-4 text-yellow-400 flex-shrink-0" />
        {BOOKMARKS.map((bm) => (
          <button
            key={bm.name}
            onClick={() => handleBookmarkClick(bm.url)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mvo-panel border border-mvo-border hover:border-cyan-500/30 text-mvo-textDim hover:text-mvo-text text-xs whitespace-nowrap transition-all"
          >
            <bm.icon className="w-3 h-3" />
            {bm.name}
          </button>
        ))}
      </div>

      {/* Tab Bar */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all max-w-[200px] ${
                tab.id === activeTabId
                  ? 'bg-mvo-panel border border-cyan-500/30 text-mvo-text'
                  : 'bg-mvo-bg border border-mvo-border text-mvo-textDim hover:text-mvo-text'
              }`}
              onClick={() => {
                setActiveTabId(tab.id);
                setUrlInput(tab.url);
                WebviewWindow.getByLabel(tab.webviewLabel).then(w => w?.setFocus());
              }}
            >
              <Globe className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{tab.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="ml-1 p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 flex-shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {tabs.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mb-6 border border-cyan-500/20">
            <Globe className="w-10 h-10 text-cyan-400" />
          </div>
          <h2 className="text-xl font-bold text-mvo-text mb-2">MVO Browser</h2>
          <p className="text-mvo-textDim text-sm mb-6 max-w-md">
            Enter a URL above or click a bookmark to start browsing. Opens in a Chromium-powered window.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {BOOKMARKS.slice(0, 8).map((bm) => (
              <button
                key={bm.name}
                onClick={() => createTab(bm.url)}
                className="glass p-4 rounded-xl hover:border-cyan-500/30 transition-all group flex flex-col items-center gap-2"
              >
                <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                  <bm.icon className="w-5 h-5" />
                </div>
                <span className="text-xs text-mvo-textDim group-hover:text-mvo-text transition-colors">{bm.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
