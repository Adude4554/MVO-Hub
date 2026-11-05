import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface OverlayTool {
  id: string;
  name: string;
  status: string;
  path?: string;
}

export function useOverlay() {
  const [tools, setTools] = useState<OverlayTool[]>([]);
  const [loading, setLoading] = useState(true);

  const detect = useCallback(async () => {
    try {
      const result = await invoke<any>('detect_overlay_tools');
      setTools([
        { id: 'rtss', name: 'RTSS', status: result.rtssStatus || 'missing', path: result.rtssPath },
        { id: 'afterburner', name: 'MSI Afterburner', status: result.afterburnerStatus || 'missing', path: result.afterburnerPath },
        { id: 'xbox', name: 'Xbox Game Bar', status: result.xboxGameBarStatus || 'missing', path: null },
      ]);
    } catch (e) {
      console.error('Overlay detection failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const launchRtss = useCallback(async (_admin: boolean) => {
    try {
      if (_admin) await invoke('launch_rtss_as_admin');
      else await invoke('launch_rtss');
    } catch (e) {
      console.error('RTSS launch failed:', e);
    }
  }, []);

  const launchAfterburner = useCallback(async (_admin: boolean) => {
    try {
      if (_admin) await invoke('launch_msi_afterburner_as_admin');
      else await invoke('launch_msi_afterburner');
    } catch (e) {
      console.error('Afterburner launch failed:', e);
    }
  }, []);

  const launchHwinfo = useCallback(async () => {
    // HWiNFO auto-launch disabled - use native hardware monitoring instead
    console.warn('HWiNFO launch disabled - use native hardware monitoring instead');
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return { tools, loading, detect, launchRtss, launchAfterburner, launchHwinfo };
}