import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface GameEntry {
  id: string;
  app_id: string;
  name: string;
  source: string;
  install_dir: string;
  library_path: string;
  executable_hint?: string;
  is_installed: boolean;
  last_played?: number;
  is_favorite: boolean;
  playtime_forever?: number;
  tags: string[];
}

export interface SteamScanResult {
  steam_found: boolean;
  steam_path?: string;
  library_paths: string[];
  games: GameEntry[];
  message: string;
}

export function useGames() {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [steamInfo, setSteamInfo] = useState<{ found: boolean; path?: string; libraries: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'steam' | 'manual' | 'favorites' | 'recent'>('all');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [steamResult, customResult] = await Promise.all([
        invoke<SteamScanResult>('scan_steam_games'),
        invoke<{ games: GameEntry[]; message: string }>('scan_custom_games'),
      ]);
      const allGames = [...steamResult.games, ...customResult.games];
      setGames(allGames);
      setSteamInfo({ found: steamResult.steam_found, path: steamResult.steam_path, libraries: steamResult.library_paths });
    } catch (e) {
      console.error('Game scan failed:', e);
      setError(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isLikelyNotGame = (g: GameEntry): boolean => {
    const name = g.name.toLowerCase();
    const path = (g.executable_hint || g.install_dir || '').toLowerCase();

    // Reject known non-game patterns
    const badPatterns = [
      'build_script', 'build-', 'build ',
      'agent', 'service', 'helper', 'updater', 'downloader', 'installer',
      'setup', 'uninstall', 'unins',
      '7z', 'winrar', 'winzip',
      'devcon', 'nvcontainer', 'display driver',
      'hwinfo', 'msi afterburner', 'riva tuner',
      'commonredist', 'oalinst', 'dxsetup', 'vcrun',
      'predator', 'acer', 'lenovo', 'dell',
      'visualstudio', 'msbuild', 'nuget', 'dotnet',
      // Benchmark subfolder tests (not the main 3DMark Demo)
      'timespy', 'nightraid', 'night raid', 'firestrike', 'fire strike',
      'cloudgate', 'cloud gate', 'skydiver', 'sky diver',
      'port royal', 'speed way',
      'unigine', 'heaven', 'valley', 'superposition',
      'cinebench', 'geekbench', 'pcmark', 'passmark', 'memtest',
      'furmark', 'occt', 'prime95', 'aida64',
      'userbenchmark', 'novabench', 'crossmark',
      'touchup', 'storagereader', 'icfworkload',
      // Subfolder binaries / arch folders / Java
      'unpack200', 'pack200', 'jre', 'javac', 'java.exe',
      'arm64', 'arm',
      'steam_monitor', 'activationui',
      'rld', 'crack',
      // BattlEye launcher
      'be_service', 'bedaisy', '_be',
      // Generic non-game folder names
      'redist', 'support', 'docs', 'manual', 'readme',
      'license', 'eula', 'changelog', 'version',
      'bin', 'arm64', 'arm',
      // Common non-game tools
      'rufus', 'itunes', '3utools', 'steamcmd', 'writeminidump',
      'slinfo', 'notepad', 'putty', 'filezilla', 'winscp',
      'qbittorrent', 'utorrent', 'deluge', 'aria2',
      'chrome', 'firefox', 'edge', 'opera', 'brave',
      'discord', 'slack', 'teams', 'zoom', 'skype',
      'photoshop', 'gimp', 'blender', 'obs', 'ffmpeg',
      'vscode', 'sublime', 'notepad++', 'atom',
      'ccleaner', 'malwarebytes', 'avg', 'avast',
      'vmware', 'virtualbox', 'docker',
      'postman', 'insomnia',
    ];
    if (badPatterns.some(p => name.includes(p))) return true;

    // Reject names that are just hex hashes (build scripts)
    if (name.length >= 12 && /^[a-f0-9]+$/.test(name)) return true;

    // Reject standalone architecture/utility names
    if (['x64', 'x86', 'bin', 'arm64', 'arm', 'win32', 'win64'].includes(name)) return true;

    // Reject if path is in a known non-game directory
    const badPaths = [
      'program files', 'windows', 'system32', 'appdata', 'microsoft visual studio',
    ];
    if (badPaths.some(p => path.includes(p))) return true;

    return false;
  };

  const filteredGames = games.filter(g => {
    if (isLikelyNotGame(g)) return false;
    if (filter === 'steam' && g.source !== 'Steam') return false;
    if (filter === 'manual' && g.source !== 'Manual') return false;
    if (filter === 'favorites' && !g.is_favorite) return false;
    if (filter === 'recent' && !g.last_played) return false;
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return { games: filteredGames, allGames: games, steamInfo, loading, error, refresh, filter, setFilter, search, setSearch };
}
