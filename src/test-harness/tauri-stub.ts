/**
 * Tauri IPC test double — loaded ONLY by the Playwright smoke suite.
 *
 * Imported from `main.tsx` behind `VITE_TEST_HARNESS`, which the production
 * build compiles away (verified: no harness symbols appear in `dist/`).
 *
 * Why this exists: in a plain browser `window.__TAURI_INTERNALS__` is absent,
 * so every `listen()` call rejects with
 * "Cannot read properties of undefined (reading 'transformCallback')".
 * Without a stub those rejections surface as unhandled page errors and mask
 * the thing under test — whether each page renders.
 *
 * The double answers every command with a neutral value:
 *   - `listen()` resolves to a no-op unlisten function
 *   - array-shaped commands resolve to `[]`
 *   - object-shaped commands resolve to `{}`
 *   - scalar-shaped commands resolve to `null`
 *
 * Per-command overrides can be registered via `__MVOTest.stub()`.
 */

type StubValue = unknown;

interface TauriInternals {
  invoke: (cmd: string, args?: unknown) => Promise<unknown>;
  transformCallback: (cb: unknown, once?: boolean) => number;
  unregisterCallback: (id: number) => void;
  convertFileSrc: (p: string) => string;
  plugins: Record<string, unknown>;
}

interface TestApi {
  stub: (cmd: string, value: StubValue) => void;
  calls: string[];
  reset: () => void;
}

const overrides = new Map<string, StubValue>();
const callLog: string[] = [];

/** Commands whose real backend returns a list; stubbed as `[]`. */
const ARRAY_COMMANDS =
  /^(get_|load_|list_|scan_|detect_|chat_get_|gv_get_|search_)/;

/** Explicit fixtures matching the shapes each hook destructures. */
function fixture(cmd: string): unknown {
  switch (cmd) {
    // Auth probe must not look like a logged-in user.
    case 'get_current_user':
      return 'null';

    // Settings: full object so components can read nested fields.
    case 'load_settings':
    case 'load_mvo_settings':
      return {
        theme: 'dark',
        selected_profile: 'astra',
        selected_page: 'dashboard',
        auto_steam_scan: true,
        overlay_before_game: false,
        boost_before_game: false,
        ai_provider: 'ollama',
        ai_base_url: 'http://localhost:11434',
        ai_model: 'test',
        ai_api_key: '',
        first_run_complete: true,
        window_mode: 'normal',
        window_width: 1500,
        window_height: 900,
        sidebar_collapsed: false,
        right_panel_open: true,
        notifications_enabled: true,
        auto_update: false,
        language: 'en',
        hidden_pages: [],
        dashboard_widgets: [],
      };

    // Game scanning: SteamScanResult shape (useGames destructures .games).
    case 'scan_steam_games':
      return {
        steam_found: false,
        library_paths: [],
        games: [],
        message: 'Steam not detected (test harness)',
      };
    case 'scan_custom_games':
      return { games: [] };

    // System first-run probe (useSystem destructures these fields).
    case 'check_first_run':
      return { is_first_run: false, version: '0.0.0' };

    // Home "Your Library" row — scanner DB.
    case 'load_scanned_games_from_db':
      return [
        { id: 'g1', name: 'Test Game Alpha', platform: 'Steam', launcher: 'Steam', app_id: '730', is_hidden: false },
        { id: 'g2', name: 'Test Game Beta', platform: 'Steam', launcher: 'Steam', app_id: '570', is_hidden: false },
        { id: 'g3', name: 'Test Game Gamma', platform: 'GOG', launcher: 'GOG', app_id: null, is_hidden: false },
      ];

    // Home "Latest News" row — Rust `get_news_feed`.
    case 'get_news_feed':
      return [
        {
          title: 'MVO Hub Update / News',
          description: 'The v0.2.14 hardening release brings a rebuilt shell and a crimson theme.',
          date: '2026-11-05',
          icon: '🚀',
          url: 'https://github.com/Adude4554/MVO-Hub/releases',
        },
        { title: 'Scanner V2 improvements', description: 'Confidence tuning', date: '2026-11-01', icon: '📢', url: '' },
        { title: 'Hardware monitoring', description: 'New sensors', date: '2026-10-28', icon: '📢', url: '' },
      ];

    // Updater returns a JSON *string* that useUpdater parses.
    case 'check_for_updates':
      return JSON.stringify({ available: false, version: '0.0.0' });

    // Hardware health: Hardware.tsx reads health.alerts.length directly.
    case 'get_hardware_health':
      return { score: 100, alerts: [], alert_count: 0 };
    case 'get_hardware_recommendations':
      return { recommendations: [], count: 0, timestamp: 0 };
    case 'get_hardware_history':
      return [];

    // Hardware snapshot is destructured for .sensors / .devices.
    case 'get_hardware_snapshot':
      return { sensors: [], devices: [], timestamp_ms: 0 };
    case 'get_hardware_status':
      return { running: false, sensor_count: 0, device_count: 0 };

    // Performance snapshots are read field-by-field; provide a zeroed shape.
    case 'get_performance_snapshot':
      return {
        cpu_usage: 0,
        total_memory: 0,
        used_memory: 0,
        total_storage: 0,
        used_storage: 0,
        uptime_seconds: 0,
        timestamp_ms: 0,
        gpu_usage: 0,
      };

    // Chat / AI enumerations
    case 'get_ollama_models':
    case 'get_ai_providers':
    case 'chat_get_sessions':
      return [];

    default:
      if (ARRAY_COMMANDS.test(cmd)) return [];
      return null;
  }
}

function stubResult(cmd: string): unknown {
  if (overrides.has(cmd)) {
    const value = overrides.get(cmd);
    return typeof value === 'function' ? (value as () => unknown)() : value;
  }
  return fixture(cmd);
}

function install(): void {
  let nextCallbackId = 1;

  const internals: TauriInternals = {
    async invoke(cmd: string) {
      callLog.push(cmd);
      return stubResult(cmd);
    },
    transformCallback() {
      return nextCallbackId++;
    },
    unregisterCallback() {
      /* no-op */
    },
    convertFileSrc: (p: string) => p,
    plugins: {},
  };

  const w = window as unknown as Record<string, unknown>;
  w.__TAURI_INTERNALS__ = internals;

  // Event plugin double: `listen`/`emit` resolve without touching internals.
  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: async () => undefined,
  };

  const api: TestApi = {
    stub(cmd: string, value: StubValue) {
      overrides.set(cmd, value);
    },
    get calls() {
      return callLog;
    },
    reset() {
      overrides.clear();
      callLog.length = 0;
    },
  };
  w.__MVO_IPC_STUB__ = api;
}

install();

export {};
