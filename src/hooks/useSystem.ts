import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface FirstRunStatus {
  is_first_run: boolean;
  version: string;
}

export function useSystem() {
  const [firstRun, setFirstRun] = useState<FirstRunStatus>({ is_first_run: true, version: '' });
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    try {
      const result = await invoke<FirstRunStatus>('check_first_run');
      setFirstRun(result);
    } catch (e) {
      console.error('First run check failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const complete = useCallback(async () => {
    try {
      await invoke('complete_first_run');
      setFirstRun({ is_first_run: false, version: firstRun.version });
    } catch (e) {
      console.error('First run complete failed:', e);
    }
  }, [firstRun.version]);

  useEffect(() => {
    check();
  }, [check]);

  return { firstRun: firstRun.is_first_run, loading, check, complete };
}