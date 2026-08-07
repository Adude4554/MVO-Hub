import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
}

export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const result = await invoke<string>('check_for_updates');
        const info = JSON.parse(result) as UpdateInfo;
        if (info.available) {
          setUpdateInfo(info);
        }
      } catch (e) {
        console.log('Update check skipped:', e);
      }
    };
    check();
  }, []);

  const checkForUpdates = async () => {
    try {
      const result = await invoke<string>('check_for_updates');
      const info = JSON.parse(result) as UpdateInfo;
      if (info.available) {
        setUpdateInfo(info);
      }
    } catch (e) {
      console.log('Update check failed:', e);
    }
  };

  const installUpdate = async () => {
    setDownloading(true);
    try {
      await invoke('download_and_install_update');
    } catch (e) {
      console.error('Update failed:', e);
      setDownloading(false);
    }
  };

  const dismiss = () => setUpdateInfo(null);

  return { updateInfo, downloading, installUpdate, dismiss, checkForUpdates };
}
