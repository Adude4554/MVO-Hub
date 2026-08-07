import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface StoreItem {
  id: number;
  name: string;
  description: string;
  appid: number;
  category: string;
  downloadLink: string | null;
}

export interface InstalledGame {
  id: string;
  name: string;
  version: string;
  developer: string;
  category: string;
  install_path: string;
  exe_path: string | null;
  cover: string | null;
  banner: string | null;
  icon: string | null;
  size_bytes: number;
  installed_at: string;
  last_played: string | null;
  play_time_seconds: number;
  is_favorite: boolean;
  tags: string;
  checksum: string | null;
}

export interface DownloadItem {
  id: string;
  store_item_id: string;
  name: string;
  download_url: string;
  dest_path: string;
  status: string;
  progress: number;
  speed_bytes: number;
  downloaded_bytes: number;
  total_bytes: number;
  error: string | null;
  created_at: string;
}

export interface DownloadProgress {
  id: string;
  progress: number;
  speed_bytes: number;
  downloaded_bytes: number;
  total_bytes: number;
  status: string;
}

export interface ExtractProgress {
  id: string;
  progress: number;
  current_file: string;
  extracted_files: number;
  total_files: number;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatSize(bytesPerSec)}/s`;
}

function formatBytes(bytes: number): string {
  return formatSize(bytes);
}

export function useGameVaultStore() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());

  const loadStore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [storeItems, library] = await Promise.all([
        invoke<StoreItem[]>('gv_get_store'),
        invoke<InstalledGame[]>('gv_get_library'),
      ]);
      setItems(storeItems);
      setInstalledIds(new Set(library.map(g => g.id)));
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  const install = useCallback(async (item: StoreItem, installDir?: string): Promise<{ ok: boolean; message: string }> => {
    const idStr = String(item.id);
    setInstallingIds(prev => new Set(prev).add(idStr));
    try {
      const msg = await invoke<string>('gv_install', { itemId: idStr, installDir: installDir || null });
      setInstalledIds(prev => new Set(prev).add(idStr));
      return { ok: true, message: msg };
    } catch (e) {
      const errMsg = String(e);
      console.error('Install failed:', errMsg);
      return { ok: false, message: errMsg };
    } finally {
      setInstallingIds(prev => {
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
    }
  }, []);

  const filtered = items.filter(item => {
    if (category !== 'all' && item.category !== category) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const categories = [...new Set(items.map(i => i.category))];

  useEffect(() => { loadStore(); }, [loadStore]);

  useEffect(() => {
    const unlisten = listen('gv-install-complete', (event: any) => {
      if (event.payload?.success) {
        setInstalledIds(prev => new Set(prev).add(event.payload.id));
      }
    });
    return () => { unlisten.then((fn: UnlistenFn) => fn()); };
  }, []);

  return {
    items: filtered,
    allItems: items,
    loading,
    error,
    search,
    setSearch,
    category,
    setCategory,
    categories,
    installedIds,
    installingIds,
    install,
    refresh: loadStore,
    formatSize,
  };
}

export function useGameVaultLibrary() {
  const [library, setLibrary] = useState<InstalledGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'installed_at' | 'last_played'>('name');

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<InstalledGame[]>('gv_get_library');
      setLibrary(data);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  const uninstall = useCallback(async (id: string) => {
    try {
      await invoke('gv_uninstall', { id });
      setLibrary(prev => prev.filter(g => g.id !== id));
    } catch (e) {
      console.error('Uninstall failed:', e);
    }
  }, []);

  const launch = useCallback(async (id: string) => {
    try {
      await invoke('gv_launch', { id });
      setLibrary(prev => prev.map(g =>
        g.id === id ? { ...g, last_played: new Date().toISOString() } : g
      ));
    } catch (e) {
      console.error('Launch failed:', e);
    }
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    try {
      await invoke('gv_toggle_favorite', { id });
      setLibrary(prev => prev.map(g =>
        g.id === id ? { ...g, is_favorite: !g.is_favorite } : g
      ));
    } catch (e) {
      console.error('Toggle favorite failed:', e);
    }
  }, []);

  const repair = useCallback(async (id: string) => {
    try {
      return await invoke<string>('gv_repair', { id });
    } catch (e) {
      return String(e);
    }
  }, []);

  const openFolder = useCallback(async (id: string) => {
    try {
      await invoke('gv_open_game_folder', { id });
    } catch (e) {
      console.error('Open folder failed:', e);
    }
  }, []);

  const sorted = [...library].sort((a, b) => {
    switch (sortBy) {
      case 'name': return a.name.localeCompare(b.name);
      case 'installed_at': return b.installed_at.localeCompare(a.installed_at);
      case 'last_played': return (b.last_played || '').localeCompare(a.last_played || '');
      default: return 0;
    }
  }).filter(g => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return g.name.toLowerCase().includes(q) || g.developer.toLowerCase().includes(q);
  });

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  return {
    library: sorted,
    allLibrary: library,
    loading,
    error,
    search,
    setSearch,
    sortBy,
    setSortBy,
    uninstall,
    launch,
    toggleFavorite,
    repair,
    openFolder,
    refresh: loadLibrary,
    formatSize,
    formatBytes,
  };
}

export function useGameVaultDownloads() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [progress, setProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [extractProgress, setExtractProgress] = useState<Map<string, ExtractProgress>>(new Map());
  const [loading, setLoading] = useState(true);

  const loadDownloads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<DownloadItem[]>('gv_get_downloads');
      setDownloads(data);
    } catch (e) {
      console.error('Failed to load downloads:', e);
    }
    setLoading(false);
  }, []);

  const cancel = useCallback(async (id: string) => {
    try {
      await invoke('gv_cancel_download', { id });
      setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'cancelled' } : d));
      setProgress(prev => { const next = new Map(prev); next.delete(id); return next; });
    } catch (e) {
      console.error('Cancel failed:', e);
    }
  }, []);

  const retry = useCallback(async (item: DownloadItem) => {
    try {
      await invoke('gv_retry_download', { id: item.id, storeItemId: item.store_item_id });
      setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'downloading', progress: 0, error: null } : d));
    } catch (e) {
      console.error('Retry failed:', e);
    }
  }, []);

  const removeDownload = useCallback(async (id: string) => {
    try {
      await invoke('gv_remove_download', { id });
      setDownloads(prev => prev.filter(d => d.id !== id));
      setProgress(prev => { const next = new Map(prev); next.delete(id); return next; });
    } catch (e) {
      console.error('Remove failed:', e);
    }
  }, []);

  useEffect(() => { loadDownloads(); }, [loadDownloads]);

  useEffect(() => {
    const unsubs: Promise<UnlistenFn>[] = [];

    unsubs.push(
      listen('gv-download-progress', (event: any) => {
        const data: DownloadProgress = event.payload;
        setProgress(prev => {
          const next = new Map(prev);
          next.set(data.id, data);
          return next;
        });
      })
    );

    unsubs.push(
      listen('gv-extract-progress', (event: any) => {
        const data: ExtractProgress = event.payload;
        setExtractProgress(prev => {
          const next = new Map(prev);
          next.set(data.id, data);
          return next;
        });
      })
    );

    unsubs.push(
      listen('gv-install-complete', (event: any) => {
        const { id, success } = event.payload;
        setDownloads(prev => prev.map(d => {
          if (d.id === `gv-${id}` || d.id === id) {
            return { ...d, status: success ? 'completed' : 'failed', progress: success ? 100 : d.progress };
          }
          return d;
        }));
        setProgress(prev => { const next = new Map(prev); next.delete(id); next.delete(`gv-${id}`); return next; });
        setExtractProgress(prev => { const next = new Map(prev); next.delete(id); next.delete(`gv-${id}`); return next; });
        loadDownloads();
      })
    );

    return () => {
      unsubs.forEach(p => p.then((fn: UnlistenFn) => fn()));
    };
  }, []);

  const activeDownloads = downloads.filter(d => d.status === 'downloading');
  const completedDownloads = downloads.filter(d => d.status === 'completed');
  const failedDownloads = downloads.filter(d => d.status === 'failed' || d.status === 'cancelled');

  return {
    downloads,
    activeDownloads,
    completedDownloads,
    failedDownloads,
    progress,
    extractProgress,
    loading,
    cancel,
    retry,
    removeDownload,
    refresh: loadDownloads,
    formatSize,
    formatSpeed,
    formatBytes,
  };
}
