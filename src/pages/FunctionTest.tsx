import { useState } from 'react';
import { GlassCard } from '../components/ui';
import { invoke } from '@tauri-apps/api/core';

interface TestItem {
  category: string;
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

export function FunctionTest() {
  const [tests, setTests] = useState<TestItem[]>([]);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'ok' | 'warn' | 'fail'>('all');

  const testCommands = [
    { category: 'System', name: 'CPU Info', cmd: 'get_system_info' },
    { category: 'System', name: 'Performance Snapshot', cmd: 'get_performance_snapshot' },
    { category: 'System', name: 'Hardware History', cmd: 'get_hardware_history' },
    { category: 'System', name: 'GPU Info (WMI)', cmd: 'get_gpu_info' },
    { category: 'Gaming', name: 'Steam Scan', cmd: 'scan_steam_games' },
    { category: 'Gaming', name: 'Launch Steam Game', cmd: 'launch_steam_game' },
    { category: 'Gaming', name: 'Steam Status', cmd: 'get_steam_status' },
    { category: 'Optimizer', name: 'Current Power Plan', cmd: 'get_current_power_plan' },
    { category: 'Optimizer', name: 'Flush DNS', cmd: 'flush_dns' },
    { category: 'Optimizer', name: 'Disk Cleanup', cmd: 'open_disk_cleanup' },
    { category: 'Optimizer', name: 'Task Manager', cmd: 'open_task_manager' },
    { category: 'AI', name: 'AI Providers', cmd: 'get_ai_providers' },
    { category: 'Streaming', name: 'Detect Streaming Tools', cmd: 'detect_streaming_tools' },
    { category: 'Streaming', name: 'Launch OBS', cmd: 'launch_obs_studio' },
    { category: 'System', name: 'Overlay Status', cmd: 'get_overlay_status' },
    { category: 'System', name: 'Check for Updates', cmd: 'check_for_updates' },
    { category: 'Settings', name: 'Load MVO Settings', cmd: 'load_mvo_settings' },
    { category: 'Settings', name: 'Load Settings', cmd: 'load_settings' },
  ];

  const runTests = async () => {
    setRunning(true);
    setTests([]);
    for (const test of testCommands) {
      try {
        const result = await invoke(test.cmd);
        setTests(prev => [...prev, { category: test.category, name: test.name, status: 'ok', message: String(result) }]);
      } catch (e: any) {
        setTests(prev => [...prev, { category: test.category, name: test.name, status: 'fail', message: e.message || 'Unknown error' }]);
      }
    }
    setRunning(false);
  };

  const filteredTests = tests.filter(t => filter === 'all' || t.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text">Function Test Center</h1>
          <p className="text-mvo-textDim mt-1">Test all backend commands & diagnose issues</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="input w-40">
            <option value="all">All</option>
            <option value="ok">Passed</option>
            <option value="warn">Warnings</option>
            <option value="fail">Failed</option>
          </select>
          <button onClick={runTests} disabled={running} className="btn-primary">
            {running ? <span className="w-4 h-4 mr-2 animate-spin">⟳</span> : null}
            {running ? 'Running...' : 'Run All Tests'}
          </button>
        </div>
      </div>

      <div className="flex gap-4 text-sm text-mvo-textDim">
        <span>Passed: {tests.filter(t => t.status === 'ok').length}</span>
        <span>Warnings: {tests.filter(t => t.status === 'warn').length}</span>
        <span>Failed: {tests.filter(t => t.status === 'fail').length}</span>
        <span>Total: {tests.length}</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-mvo-border/30 flex items-center gap-3 font-mono text-xs text-mvo-textDim">
          <span className="w-40">Category</span>
          <span className="w-56">Test</span>
          <span className="w-20 text-center">Status</span>
          <span>Message</span>
        </div>
        <div className="divide-y divide-mvo-border/30 max-h-[500px] overflow-y-auto">
          {tests.length === 0 ? (
            <div className="p-8 text-center text-mvo-textDim">No tests run yet. Click "Run All Tests" to start.</div>
          ) : (
            filteredTests.map((test, i) => (
              <div key={i} className="p-4 hover:bg-mvo-panelHover/50 transition-colors">
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="w-40 text-mvo-textDim">{test.category}</span>
                  <span className="w-56 text-mvo-text">{test.name}</span>
                  <span className={`w-20 text-center ${test.status === 'ok' ? 'text-green-400' : test.status === 'warn' ? 'text-yellow-400' : 'text-red-400'}`}>
                    {test.status === 'ok' ? (
                      <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : test.status === 'warn' ? (
                      <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    ) : (
                      <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                  </span>
                  <span className="text-mvo-textDim flex-1">{test.message}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}