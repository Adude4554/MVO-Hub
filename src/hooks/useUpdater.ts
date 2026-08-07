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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const result = await invoke<string>('check_for_updates');
        const info = JSON.parse(result) as UpdateInfo;
        if (info.available) {
          setUpdateInfo(info);
        }
        if ((info as any).error) {
          setError((info as any).error);
        }
      } catch (e) {
        setError(String(e));
      }
    };
    check();
  }, []);

  const checkForUpdates = async () => {
    setError(null);
    try {
      const result = await invoke<string>('check_for_updates');
      const info = JSON.parse(result) as UpdateInfo;
      if (info.available) {
        setUpdateInfo(info);
      } else {
        setUpdateInfo(null);
      }
      if ((info as any).error) {
        setError((info as any).error);
      } else if (!info.available) {
        setError(null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const installUpdate = async () => {
    setDownloading(true);
    try {
      await invoke('download_and_install_update');
    } catch (e) {
      console.error('Update failed:', e);
      setError(String(e));
      setDownloading(false);
    }
  };

  const dismiss = () => setUpdateInfo(null);

  return { updateInfo, downloading, error, installUpdate, dismiss, checkForUpdates };
}
