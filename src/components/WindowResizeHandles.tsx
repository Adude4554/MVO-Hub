import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ResizeDirection } from '@tauri-apps/api/window';

const EDGE = 4;

const handles: { dir: ResizeDirection; style: React.CSSProperties; cursor: string }[] = [
  { dir: 'North',      style: { top: 0, left: 0, right: 0, height: EDGE },                cursor: 'n-resize' },
  { dir: 'South',      style: { bottom: 0, left: 0, right: 0, height: EDGE },              cursor: 's-resize' },
  { dir: 'West',       style: { top: 0, bottom: 0, left: 0, width: EDGE },                 cursor: 'w-resize' },
  { dir: 'East',       style: { top: 0, bottom: 0, right: 0, width: EDGE },                cursor: 'e-resize' },
  { dir: 'NorthWest',  style: { top: 0, left: 0, width: EDGE * 2, height: EDGE * 2 },      cursor: 'nw-resize' },
  { dir: 'NorthEast',  style: { top: 0, right: 0, width: EDGE * 2, height: EDGE * 2 },     cursor: 'ne-resize' },
  { dir: 'SouthWest',  style: { bottom: 0, left: 0, width: EDGE * 2, height: EDGE * 2 },   cursor: 'sw-resize' },
  { dir: 'SouthEast',  style: { bottom: 0, right: 0, width: EDGE * 2, height: EDGE * 2 },  cursor: 'se-resize' },
];

export function WindowResizeHandles() {
  const startResize = async (dir: ResizeDirection) => {
    try {
      await getCurrentWindow().startResizeDragging(dir);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[40] pointer-events-none">
      <div className="absolute inset-0 border-[3px] border-white/20 rounded-lg pointer-events-none" />
      {handles.map((h) => (
        <div
          key={h.dir}
          className="absolute pointer-events-auto"
          style={{ ...h.style, cursor: h.cursor }}
          onMouseDown={() => startResize(h.dir)}
        />
      ))}
    </div>
  );
}
