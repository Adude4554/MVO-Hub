import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { ShieldCheck, Zap, Gem, Cpu, MemoryStick, HardDrive, Wifi } from 'lucide-react';
import pkg from '../../package.json';

/**
 * Build-time app version, injected from package.json so the UI can never drift
 * from the package manifest. In a packaged Tauri build `getVersion()` takes
 * precedence; this covers web / test builds where the API is unavailable.
 */
const BUILD_VERSION: string = pkg.version;

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

interface StatusFooterProps {
  performance?: any;
  hardwareSensors?: any;
  /** Optional override for the connection/health indicator. */
  ready?: boolean;
}

export function BottomBar({ performance, hardwareSensors, ready = true }: StatusFooterProps) {
  const [version, setVersion] = useState(BUILD_VERSION);

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => {
        if (!cancelled && v) setVersion(v);
      })
      .catch(() => {
        /* not running under Tauri — keep the build fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hs = hardwareSensors;
  const snap = performance?.snapshot;

  const cpuPercent =
    typeof hs?.cpuUsage === 'number'
      ? hs.cpuUsage
      : typeof snap?.cpu_usage === 'number'
        ? snap.cpu_usage
        : null;
  const memPercent =
    hs?.memTotal > 0
      ? (hs.memUsed / hs.memTotal) * 100
      : snap?.total_memory > 0
        ? (snap.used_memory / snap.total_memory) * 100
        : null;
  const diskPercent =
    snap?.total_storage > 0 ? (snap.used_storage / snap.total_storage) * 100 : null;
  const totalRx = (hs?.networkSpeeds || []).reduce(
    (sum: number, n: any) => sum + (n.receivedRate || 0),
    0,
  );

  const telemetry = [
    { key: 'cpu', icon: Cpu, value: cpuPercent === null ? '--' : `${cpuPercent.toFixed(0)}%` },
    { key: 'ram', icon: MemoryStick, value: memPercent === null ? '--' : `${memPercent.toFixed(0)}%` },
    { key: 'disk', icon: HardDrive, value: diskPercent === null ? '--' : `${diskPercent.toFixed(0)}%` },
    { key: 'net', icon: Wifi, value: formatSpeed(totalRx) },
  ];

  return (
    <footer
      data-testid="status-footer"
      className="relative z-50 flex h-footer shrink-0 items-center justify-between gap-4 border-t border-white/[0.07] bg-[#050812] px-5"
    >
      {/* ── Left: version + readiness ── */}
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2">
          <span
            data-testid="footer-status-dot"
            className={[
              'h-2 w-2 rounded-full',
              ready
                ? 'bg-emerald-400 shadow-[0_0_8px_1px_rgba(52,211,153,0.7)]'
                : 'bg-amber-400 shadow-[0_0_8px_1px_rgba(251,191,36,0.6)]',
            ].join(' ')}
          />
          <span
            data-testid="footer-version"
            className="whitespace-nowrap text-[11px] font-medium text-white/55"
          >
            MVO Hub v{version} <span className="text-white/20">|</span>{' '}
            <span className={ready ? 'text-emerald-400/90' : 'text-amber-400/90'}>
              {ready ? 'Ready' : 'Connecting'}
            </span>
          </span>
        </div>

        {/* Live telemetry (kept from the legacy bar, restyled) */}
        <div className="hidden items-center gap-3 border-l border-white/[0.07] pl-4 md:flex">
          {telemetry.map(({ key, icon: Icon, value }) => (
            <span
              key={key}
              className="flex items-center gap-1.5 text-[10.5px] tabular-nums text-white/35"
              title={key.toUpperCase()}
            >
              <Icon className="h-3 w-3 text-white/25" />
              {value}
            </span>
          ))}
        </div>
      </div>

      {/* ── Right: brand indicators ── */}
      <div className="flex shrink-0 items-center gap-4">
        <span data-testid="indicator-secure" className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[10.5px] font-medium text-white/40">Secure</span>
        </span>
        <span data-testid="indicator-fast" className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 fill-amber-400/80 text-amber-400" />
          <span className="text-[10.5px] font-medium text-white/40">Fast</span>
        </span>
        <span data-testid="indicator-modern" className="flex items-center gap-1.5">
          <Gem className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-[10.5px] font-medium text-white/40">Modern</span>
        </span>
        <span className="text-white/15">|</span>
        <span data-testid="indicator-powered" className="text-[10.5px] font-medium text-white/35">
          Powered by <span className="font-semibold text-white/55">MVO</span>
        </span>
      </div>
    </footer>
  );
}
