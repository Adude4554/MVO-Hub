import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ProfileConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  settings: {
    power_plan: string;
    game_mode: boolean;
    priority_boost: boolean;
    disable_fullscreen_optimizations: boolean;
    gpu_scheduling: boolean;
    network_optimization: boolean;
    audio_exclusive_mode: boolean;
    overlay_enabled: boolean;
    streaming_mode: boolean;
  };
}

export function useProfiles() {
  const [activeProfile, setActiveProfile] = useState<string>('astra');

  const load = useCallback(async () => {
    try {
      const settings = await invoke<any>('load_settings');
      setActiveProfile(settings.selected_profile || 'astra');
    } catch (e) {
      console.error('Profile load failed:', e);
    }
  }, []);

  const save = useCallback(async (profile: string) => {
    try {
      await invoke('save_settings', { settings: { selected_profile: profile } });
      setActiveProfile(profile);
    } catch (e) {
      console.error('Profile save failed:', e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { activeProfile, setActiveProfile: save, profiles: [] };
}