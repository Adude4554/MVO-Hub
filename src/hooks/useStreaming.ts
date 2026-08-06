import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface StreamingTool {
  id: string;
  name: string;
  status: string;
  path?: string;
  version?: string;
}

export function useStreaming() {
  const [tools, setTools] = useState<StreamingTool[]>([]);
  const [loading, setLoading] = useState(true);

  const detect = useCallback(async () => {
    try {
      const result = await invoke<any>('detect_streaming_tools');
      setTools(result.tools || []);
    } catch (e) {
      console.error('Streaming detection failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const launchObs = useCallback(async (admin = false) => {
    try {
      if (admin) await invoke('launch_obs_studio_as_admin');
      else await invoke('launch_obs_studio');
    } catch (e) {
      console.error('OBS launch failed:', e);
    }
  }, []);

  const openObsFolder = useCallback(async () => {
    try {
      await invoke('open_obs_folder');
    } catch (e) {
      console.error('OBS folder open failed:', e);
    }
  }, []);

  const openSettings = useCallback(async (type: 'camera' | 'microphone' | 'sound' | 'capture') => {
    try {
      switch (type) {
        case 'camera': await invoke('open_camera_settings'); break;
        case 'microphone': await invoke('open_microphone_settings'); break;
        case 'sound': await invoke('open_sound_settings'); break;
        case 'capture': await invoke('open_windows_capture_settings'); break;
      }
    } catch (e) {
      console.error(`${type} settings open failed:`, e);
    }
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return { tools, loading, detect, launchObs, openObsFolder, openSettings };
}