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
      // Covers each artwork branch: a Steam game (CDN), a manual game with a
      // cached cover, and a manual game with no art at all. `g1` also feeds the
      // Game Detail fixtures.
      return {
        games: [
          {
            id: 'g1',
            app_id: '730',
            name: 'Test Game Alpha',
            source: 'Steam',
            install_dir: 'C:/Games/alpha',
            library_path: 'C:/Games/alpha',
            executable_hint: 'C:/Games/alpha/game.exe',
            is_installed: true,
            last_played: 1762300000000,
            is_favorite: false,
            playtime_forever: 7200,
            tags: [],
          },
          {
            id: 'g2',
            app_id: null,
            name: 'Test Game Beta',
            source: 'Manual',
            install_dir: 'C:/Games/beta',
            library_path: 'C:/Games/beta',
            executable_hint: 'C:/Games/beta/game.exe',
            is_installed: true,
            last_played: 1762200000000,
            is_favorite: false,
            playtime_forever: 3600,
            tags: [],
            cover_local: 'C:/MVO/cache/beta-cover.png',
          },
          {
            id: 'g3',
            app_id: null,
            name: 'Test Game Gamma',
            source: 'Manual',
            install_dir: 'C:/Games/gamma',
            library_path: 'C:/Games/gamma',
            executable_hint: 'C:/Games/gamma/game.exe',
            is_installed: true,
            last_played: null,
            is_favorite: false,
            playtime_forever: 0,
            tags: [],
          },
        ],
        message: 'test harness',
      };

    // System first-run probe (useSystem destructures these fields).
    case 'check_first_run':
      return { is_first_run: false, version: '0.0.0' };

    // Home "Your Library" row — scanner DB.
    case 'load_scanned_games_from_db':
      // One game per artwork-resolution branch, so the E2E suite covers the
      // whole precedence chain: Steam CDN, cached local file, and no art at all.
      return [
        { id: 'g1', name: 'Test Game Alpha', platform: 'Steam', launcher: 'Steam', app_id: '730', is_hidden: false },
        {
          id: 'g2',
          name: 'Test Game Beta',
          platform: 'Steam',
          launcher: 'Steam',
          app_id: null,
          cover_local: 'C:/MVO/cache/beta-cover.png',
          is_hidden: false,
        },
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

    // Enterprise: a Team-tier licence, so the tier-gated UI branches (white-label
    // locked, telemetry export allowed) are all exercised.
    case 'enterprise_get_license':
      return {
        status: {
          valid: true,
          tier: 'team',
          tenantId: 'acme',
          tenantName: 'Acme Corp',
          expiresAt: '2027-01-01T00:00:00Z',
          daysRemaining: 56,
          reason: null,
        },
        warning: null,
        tier: 'team',
        branding: {
          productName: 'MVO Hub',
          shortName: 'MVO',
          primaryColor: '#e11d48',
          accentColor: '#ff2d55',
          logoUrl: '',
          supportUrl: '',
        },
      };
    case 'enterprise_install_license':
      return {
        status: {
          valid: true,
          tier: 'enterprise',
          tenantId: 'acme',
          tenantName: 'Acme Corp',
          expiresAt: '2027-01-01T00:00:00Z',
          daysRemaining: 56,
          reason: null,
        },
        warning: null,
        tier: 'enterprise',
        branding: {
          productName: 'Acme Hub',
          shortName: 'ACME',
          primaryColor: '#0a84ff',
          accentColor: '#ff375f',
          logoUrl: '',
          supportUrl: '',
        },
      };
    case 'enterprise_get_profile':
      return {
        tenantId: 'acme',
        branding: {
          productName: 'Acme Hub',
          shortName: 'ACME',
          primaryColor: '#0a84ff',
          accentColor: '#ff375f',
          logoUrl: '',
          supportUrl: '',
        },
        features: {
          pluginsEnabled: true,
          cloudSyncEnabled: true,
          telemetryEnabled: true,
          betaChannelsEnabled: false,
        },
        telemetryEndpoints: [],
        updatedAt: '2026-11-06T00:00:00Z',
      };
    case 'enterprise_set_profile':
      return null;
    case 'enterprise_telemetry_snapshot':
      return [
        { event: 'appLaunched', name: 'app.launched', metric: null, build: '0.3.0', at: '2026-11-06T09:00:00Z' },
        { event: 'syncCompleted', name: 'sync.completed', metric: { kind: 'percent', value: 100 }, build: '0.3.0', at: '2026-11-06T09:05:00Z' },
      ];
    case 'enterprise_drain_telemetry':
      return [];
    case 'enterprise_diagnostics':
      return {
        appVersion: '0.3.0',
        os: 'windows',
        tier: 'team',
        tenantId: 'acme',
        pluginCount: 1,
        trackedSaves: 3,
        achievementsUnlocked: 2,
        pendingUploads: 0,
        activeSessions: 0,
        generatedAt: '2026-11-06T10:00:00Z',
      };

    // Advanced game management (Game Detail). The game id matches the scanned
    // fixture `g1`/Test Game Alpha so the detail view resolves a real row.
    case 'get_game_config':
      return {
        gameId: 'g1',
        launchArgs: '-windowed -novid',
        exeOverride: null,
        workingDir: null,
        customCover: null,
        customBanner: null,
        playtimeSeconds: 7200,
        lastPlayed: '2026-11-05T20:00:00Z',
        updatedAt: '2026-11-05T20:00:00Z',
      };
    case 'update_game_config':
      return {
        gameId: 'g1',
        launchArgs: '-windowed',
        exeOverride: null,
        workingDir: null,
        customCover: null,
        customBanner: null,
        playtimeSeconds: 7200,
        lastPlayed: '2026-11-05T20:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      };
    case 'get_game_playtime':
      return {
        totalSeconds: 7200,
        sessionCount: 3,
        averageSeconds: 2400,
        lastPlayed: '2026-11-05T20:00:00Z',
        recent: [
          { id: 3, gameId: 'g1', gameName: 'Test Game Alpha', startedAt: '2026-11-05T19:00:00Z', endedAt: '2026-11-05T20:00:00Z', durationSeconds: 3600 },
          { id: 2, gameId: 'g1', gameName: 'Test Game Alpha', startedAt: '2026-11-04T18:00:00Z', endedAt: '2026-11-04T19:00:00Z', durationSeconds: 2400 },
          { id: 1, gameId: 'g1', gameName: 'Test Game Alpha', startedAt: '2026-11-03T17:00:00Z', endedAt: '2026-11-03T18:20:00Z', durationSeconds: 1200 },
        ],
      };
    case 'get_game_process_state':
      return null;
    case 'launch_game_with_args':
      return {
        gameId: 'g1',
        gameName: 'Test Game Alpha',
        exePath: 'C:/Games/alpha/game.exe',
        workingDir: 'C:/Games/alpha',
        args: ['-windowed', '-novid'],
      };
    case 'stop_game_session':
      return {
        totalSeconds: 9000,
        sessionCount: 4,
        averageSeconds: 2250,
        lastPlayed: '2026-11-06T10:05:00Z',
        recent: [],
      };
    case 'upload_game_image':
      return {
        gameId: 'g1',
        launchArgs: '-windowed -novid',
        exeOverride: null,
        workingDir: null,
        customCover: 'C:/covers/g1-cover.png',
        customBanner: null,
        playtimeSeconds: 7200,
        lastPlayed: '2026-11-05T20:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      };

    // Cloud & Achievements: a representative mix of sync states plus one
    // conflict, so the page exercises every visual branch in E2E.
    case 'cloud_get_status':
      return {
        trackedSaves: 3,
        inSync: 1,
        localAhead: 1,
        remoteAhead: 0,
        conflicts: 1,
        neverSynced: 0,
        pendingUploads: 2,
        lastSyncAt: '2026-11-05T18:42:00Z',
        achievementsUnlocked: 2,
        achievementsTotal: 4,
      };
    case 'cloud_sync_now':
      return {
        trackedSaves: 3,
        inSync: 2,
        localAhead: 1,
        remoteAhead: 0,
        conflicts: 0,
        neverSynced: 0,
        pendingUploads: 0,
        lastSyncAt: '2026-11-06T09:00:00Z',
        achievementsUnlocked: 2,
        achievementsTotal: 4,
      };
    case 'cloud_list_saves':
      return [
        {
          id: 1,
          gameId: 'g1',
          gameName: 'Test Game Alpha',
          localPath: 'C:/Games/alpha/save/slot1.sav',
          localHash: 'a1b2c3d4e5f60718',
          remoteHash: 'a1b2c3d4e5f60718',
          localModifiedMs: 1762300000000,
          localSizeBytes: 40960,
          syncedHash: 'a1b2c3d4e5f60718',
          syncedAt: '2026-11-05T18:42:00Z',
          updatedAt: '2026-11-05T18:42:00Z',
        },
        {
          id: 2,
          gameId: 'g2',
          gameName: 'Test Game Beta',
          localPath: 'C:/Games/beta/profile.sav',
          localHash: 'deadbeefcafe0001',
          remoteHash: 'feedface12345678',
          localModifiedMs: 1762310000000,
          localSizeBytes: 8192,
          syncedHash: '0badf00d12345678',
          syncedAt: '2026-11-04T10:15:00Z',
          updatedAt: '2026-11-06T08:00:00Z',
        },
        {
          id: 3,
          gameId: 'g3',
          gameName: 'Test Game Gamma',
          localPath: 'C:/Games/gamma/state.dat',
          localHash: '1111222233334444',
          remoteHash: '1111222233334444',
          localModifiedMs: 1762320000000,
          localSizeBytes: 2048,
          syncedHash: '1111222233334444',
          syncedAt: '2026-11-06T07:30:00Z',
          updatedAt: '2026-11-06T07:30:00Z',
        },
      ];
    case 'cloud_detect_conflicts':
      return [
        {
          save: {
            id: 2,
            gameId: 'g2',
            gameName: 'Test Game Beta',
            localPath: 'C:/Games/beta/profile.sav',
            localHash: 'deadbeefcafe0001',
            remoteHash: 'feedface12345678',
            localModifiedMs: 1762310000000,
            localSizeBytes: 8192,
            syncedHash: '0badf00d12345678',
            syncedAt: '2026-11-04T10:15:00Z',
            updatedAt: '2026-11-06T08:00:00Z',
          },
          remoteHash: 'feedface12345678',
          localModifiedMs: 1762310000000,
          message: 'Test Game Beta was modified both locally and in the cloud since the last sync',
        },
      ];
    case 'cloud_resolve_conflict':
      return null;
    case 'achievements_list':
      return [
        {
          id: 'a1',
          gameId: 'g1',
          name: 'First Steps',
          description: 'Complete the tutorial.',
          icon: 'trophy',
          points: 10,
          unlocked: true,
          unlockedAt: '2026-11-01T12:00:00Z',
          recordedAt: '2026-11-01T12:00:00Z',
        },
        {
          id: 'a2',
          gameId: 'g1',
          name: 'Speedrunner',
          description: 'Finish a run under ten minutes.',
          icon: 'trophy',
          points: 25,
          unlocked: true,
          unlockedAt: '2026-11-03T09:30:00Z',
          recordedAt: '2026-11-03T09:30:00Z',
        },
        {
          id: 'b1',
          gameId: 'g2',
          name: 'Completionist',
          description: 'Collect every item in the world.',
          icon: 'trophy',
          points: 50,
          unlocked: false,
          unlockedAt: null,
          recordedAt: '2026-11-02T00:00:00Z',
        },
        {
          id: 'b2',
          gameId: 'g2',
          name: 'Untouchable',
          description: 'Finish a level without taking damage.',
          icon: 'trophy',
          points: 15,
          unlocked: false,
          unlockedAt: null,
          recordedAt: '2026-11-02T00:00:00Z',
        },
      ];
    case 'achievements_unlock':
      return { newlyUnlocked: true, queued: true, achievement: null };
    case 'achievements_state':
      return { gameId: '*', total: 4, unlocked: 2, pointsUnlocked: 35, pointsTotal: 100, completionPercent: 50 };

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
