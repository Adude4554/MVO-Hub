import { useEffect, useCallback } from 'react';
import { sounds } from './useSounds';

interface KeyboardShortcutsProps {
  onToggleSearch: () => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
  onNavigate: (page: string) => void;
}

export function useKeyboardShortcuts({
  onToggleSearch,
  onNewChat,
  onToggleSidebar,
  onToggleRightPanel,
  onNavigate,
}: KeyboardShortcutsProps) {
  const handler = useCallback((e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = e.key.toLowerCase();

    // Ctrl+K — Global search
    if (ctrl && key === 'k') {
      e.preventDefault();
      sounds.click();
      onToggleSearch();
      return;
    }

    // Ctrl+N — New AI chat
    if (ctrl && key === 'n') {
      e.preventDefault();
      sounds.click();
      onNewChat();
      return;
    }

    // Ctrl+B — Toggle sidebar
    if (ctrl && key === 'b') {
      e.preventDefault();
      sounds.toggle();
      onToggleSidebar();
      return;
    }

    // Ctrl+Shift+P — Toggle right panel
    if (ctrl && shift && key === 'p') {
      e.preventDefault();
      sounds.toggle();
      onToggleRightPanel();
      return;
    }

    // Ctrl+1-9 — Quick page navigation
    if (ctrl && !shift && key >= '1' && key <= '9') {
      e.preventDefault();
      sounds.pageSwitch();
      const pageOrder = [
        'dashboard', 'moviestv', 'gamelibrary', 'gamevault', 'globalchat',
        'aitools', 'performance', 'settings', 'tools'
      ];
      const idx = parseInt(key) - 1;
      if (pageOrder[idx]) onNavigate(pageOrder[idx]);
      return;
    }

    // Ctrl+Shift+1-9 — Navigate to hidden/secondary pages
    if (ctrl && shift) {
      const secondaryPages: Record<string, string> = {
        '1': 'optimizer', '2': 'systemboost', '3': 'overlay',
        '4': 'streaming', '5': 'files', '6': 'webhub',
        '7': 'functiontest', '8': 'updates'
      };
      if (secondaryPages[key]) {
        e.preventDefault();
        sounds.pageSwitch();
        onNavigate(secondaryPages[key]);
        return;
      }
    }

    // Escape — Close panels / go to dashboard
    if (key === 'escape') {
      onNavigate('dashboard');
    }
  }, [onToggleSearch, onNewChat, onToggleSidebar, onToggleRightPanel, onNavigate]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
