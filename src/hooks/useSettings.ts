import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface AppSettings {
  theme: string;
  selected_profile: string;
  selected_page: string;
  auto_steam_scan: boolean;
  overlay_before_game: boolean;
  boost_before_game: boolean;
  ai_provider: string;
  ai_base_url: string;
  ai_model: string;
  ai_api_key: string;
  first_run_complete: boolean;
  window_mode: string;
  window_width: number;
  window_height: number;
  sidebar_collapsed: boolean;
  right_panel_open: boolean;
  notifications_enabled: boolean;
  auto_update: boolean;
  language: string;
  hidden_pages: string[];
  dashboard_widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    selected_profile: 'astra',
    selected_page: 'dashboard',
    auto_steam_scan: true,
    overlay_before_game: false,
    boost_before_game: false,
    ai_provider: 'ollama',
    ai_base_url: 'http://localhost:11434',
    ai_model: 'llama3.1',
     ai_api_key: '',
     first_run_complete: false,
     window_mode: 'normal',
     window_width: 1500,
     window_height: 900,
     sidebar_collapsed: false,
     right_panel_open: true,
     notifications_enabled: true,
     auto_update: true,
     language: 'en',
     hidden_pages: [],
     dashboard_widgets: [],
   });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await invoke<AppSettings>('load_settings');
      setSettings(data);
    } catch (e) {
      console.error('Settings load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      await invoke('save_settings', { settings: updated });
    } catch (e) {
      console.error('Settings save failed:', e);
    }
  }, [settings]);

  const reset = useCallback(async () => {
    try {
      await invoke('reset_settings');
      load();
    } catch (e) {
      console.error('Settings reset failed:', e);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  return { settings, loading, save, reset, load };
}