import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  pub_date?: string;
  force?: boolean;
  download_url?: string;
  file_size?: number;
  local?: string;
  error?: string;
}

export interface UpdateProgress {
  status: 'downloading' | 'installing' | 'done' | 'error';
  percent?: number;
  downloaded?: number;
  total?: number;
}

export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const checkingRef = useRef(false);

  const checkForUpdates = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setError(null);
    try {
      const result = await invoke<string>('check_for_updates');
      const info = JSON.parse(result) as UpdateInfo;
      setLastChecked(new Date().toLocaleString());
      if (info.available) {
        setUpdateInfo(info);
        if (info.force) {
          setShowModal(true);
        }
      } else {
        setUpdateInfo(null);
      }
      if (info.error) {
        setError(info.error);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setDownloading(true);
    setProgress({ status: 'downloading', percent: 0 });
    try {
      await invoke('download_and_install_update');
    } catch (e) {
      console.error('Update failed:', e);
      setError(String(e));
      setDownloading(false);
      setProgress({ status: 'error' });
    }
  }, []);

  const dismiss = useCallback(() => {
    setUpdateInfo(null);
    setShowModal(false);
  }, []);

  const openModal = useCallback(() => setShowModal(true), []);
  const closeModal = useCallback(() => {
    if (!updateInfo?.force) setShowModal(false);
  }, [updateInfo?.force]);

  // Listen for progress events from Rust
  useEffect(() => {
    const unlisten = listen<UpdateProgress>('update-progress', (event) => {
      setProgress(event.payload);
      if (event.payload.status === 'installing') {
        setDownloading(true);
      }
    });
    return () => { unlisten.then((fn: UnlistenFn) => fn()); };
  }, []);

  // Listen for periodic background check results
  useEffect(() => {
    const unlisten = listen<string>('update-check-result', (event) => {
      try {
        const info = JSON.parse(event.payload) as UpdateInfo;
        if (info.available) {
          setUpdateInfo(info);
          setLastChecked(new Date().toLocaleString());
          if (info.force) setShowModal(true);
        }
      } catch {}
    });
    return () => { unlisten.then((fn: UnlistenFn) => fn()); };
  }, []);

  // Check on mount
  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  return {
    updateInfo,
    downloading,
    progress,
    error,
    lastChecked,
    showModal,
    checkForUpdates,
    installUpdate,
    dismiss,
    openModal,
    closeModal,
  };
}
