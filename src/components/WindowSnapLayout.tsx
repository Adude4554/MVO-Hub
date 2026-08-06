import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';

interface SnapOption {
  label: string;
  icon: string;
  apply: (w: number, h: number, px: number, py: number) => { w: number; h: number; x: number; y: number };
}

function pct(p: number, total: number) { return Math.round(total * p); }

const SNAP_OPTIONS: SnapOption[] = [
  { label: 'Left half',   icon: '◧', apply: (w, h, px, py) => ({ w: pct(0.5, w), h, x: px, y: py }) },
  { label: 'Right half',  icon: '◨', apply: (w, h, px, py) => ({ w: pct(0.5, w), h, x: px + pct(0.5, w), y: py }) },
  { label: 'Top left',    icon: '◰', apply: (w, h, px, py) => ({ w: pct(0.5, w), h: pct(0.5, h), x: px, y: py }) },
  { label: 'Top right',   icon: '◳', apply: (w, h, px, py) => ({ w: pct(0.5, w), h: pct(0.5, h), x: px + pct(0.5, w), y: py }) },
  { label: 'Bottom left', icon: '◱', apply: (w, h, px, py) => ({ w: pct(0.5, w), h: pct(0.5, h), x: px, y: py + pct(0.5, h) }) },
  { label: 'Bottom right',icon: '◲', apply: (w, h, px, py) => ({ w: pct(0.5, w), h: pct(0.5, h), x: px + pct(0.5, w), y: py + pct(0.5, h) }) },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WindowSnapLayout({ open, onClose }: Props) {
  if (!open) return null;

  const snap = async (opt: SnapOption) => {
    try {
      const win = getCurrentWindow();
      const mon = await currentMonitor();
      if (!mon) return;
      const work = mon.workArea;
      const scaleFactor = mon.scaleFactor;
      const workW = work.size.width / scaleFactor;
      const workH = work.size.height / scaleFactor;
      const workX = work.position.x / scaleFactor;
      const workY = work.position.y / scaleFactor;
      const r = opt.apply(workW, workH, workX, workY);
      await win.setSize(new LogicalSize(r.w, r.h));
      await win.setPosition(new LogicalPosition(r.x, r.y));
    } catch {}
    onClose();
  };

  const maximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch {}
    onClose();
  };

  return (
    <div className="absolute right-12 top-0 mt-1 z-[9998] bg-mvo-panel/95 backdrop-blur-xl border border-mvo-border/50 rounded-xl shadow-2xl p-3" onMouseLeave={onClose}>
      <div className="grid grid-cols-3 gap-1.5 w-[144px]">
        {SNAP_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            title={opt.label}
            onClick={() => snap(opt)}
            className="w-11 h-8 rounded-md bg-mvo-bg/60 border border-mvo-border/40 hover:border-cyan-400/60 hover:bg-cyan-400/10 transition-all flex items-center justify-center text-sm text-mvo-textDim hover:text-cyan-400"
          >
            {opt.icon}
          </button>
        ))}
        <button
          title="Maximize"
          onClick={maximize}
          className="w-11 h-8 rounded-md bg-mvo-bg/60 border border-mvo-border/40 hover:border-cyan-400/60 hover:bg-cyan-400/10 transition-all flex items-center justify-center text-sm text-mvo-textDim hover:text-cyan-400"
        >
          ⬜
        </button>
      </div>
    </div>
  );
}
