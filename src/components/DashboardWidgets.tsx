import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Plus, Settings } from 'lucide-react';
import { GlassCard } from './ui';
import { t } from '../lib/i18n';

export interface WidgetConfig {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

interface DashboardWidgetsProps {
  widgets: WidgetConfig[];
  onWidgetsChange: (widgets: WidgetConfig[]) => void;
  children: Record<string, React.ReactNode>;
}

const WIDGET_DEFAULTS: Record<string, { w: number; h: number; label: string }> = {
  cpu: { w: 1, h: 1, label: 'CPU' },
  memory: { w: 1, h: 1, label: 'Memory' },
  storage: { w: 1, h: 1, label: 'Storage' },
  gpu: { w: 1, h: 1, label: 'GPU' },
  games: { w: 2, h: 1, label: 'Games' },
  cpuDetails: { w: 1, h: 1, label: 'CPU Details' },
  gpuDetails: { w: 1, h: 1, label: 'GPU Details' },
  disks: { w: 1, h: 1, label: 'Disks' },
};

export function getDefaultWidgets(): WidgetConfig[] {
  return Object.entries(WIDGET_DEFAULTS).map(([type, def], i) => ({
    id: `widget-${type}`,
    type,
    x: i % 4,
    y: Math.floor(i / 4),
    w: def.w,
    h: def.h,
    visible: true,
  }));
}

const COLS = 4;
const ROW_HEIGHT = 180;

export function DashboardWidgets({ widgets, onWidgetsChange, children }: DashboardWidgetsProps) {
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ x: number; y: number } | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const visibleWidgets = widgets.filter(w => w.visible);

  // Compute grid rows needed
  const maxY = Math.max(0, ...visibleWidgets.map(w => w.y + w.h));

  // Check if a grid cell is occupied
  const isCellOccupied = useCallback((cx: number, cy: number, excludeId?: string) => {
    return visibleWidgets.some(w =>
      w.id !== excludeId &&
      cx >= w.x && cx < w.x + w.w &&
      cy >= w.y && cy < w.y + w.h
    );
  }, [visibleWidgets]);

  // Find nearest empty cell for drop target
  const findDropTarget = useCallback((clientX: number, clientY: number, widgetW: number, widgetH: number, excludeId: string) => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const cellW = rect.width / COLS;
    const rawX = Math.round((clientX - rect.left) / cellW - widgetW / 2);
    const rawY = Math.round((clientY - rect.top) / ROW_HEIGHT - widgetH / 2);
    const x = Math.max(0, Math.min(COLS - widgetW, rawX));
    const y = Math.max(0, rawY);
    return { x, y };
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent, widgetId: string) => {
    if (!editMode) return;
    e.preventDefault();
    setDragging(widgetId);
  }, [editMode]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      if (!gridRef.current) return;
      const widget = widgets.find(w => w.id === dragging);
      if (!widget) return;
      const target = findDropTarget(e.clientX, e.clientY, widget.w, widget.h, dragging);
      if (target) setDragOver(target);
    };

    const handleUp = () => {
      if (dragOver && dragging) {
        onWidgetsChange(widgets.map(w =>
          w.id === dragging ? { ...w, x: dragOver.x, y: dragOver.y } : w
        ));
      }
      setDragging(null);
      setDragOver(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, dragOver, widgets, onWidgetsChange, findDropTarget]);

  const toggleWidget = (type: string) => {
    const existing = widgets.find(w => w.type === type);
    if (existing) {
      onWidgetsChange(widgets.map(w =>
        w.id === existing.id ? { ...w, visible: !w.visible } : w
      ));
    } else {
      const def = WIDGET_DEFAULTS[type];
      if (!def) return;
      // Find first available slot
      let y = 0;
      while (true) {
        for (let x = 0; x <= COLS - def.w; x++) {
          if (!isCellOccupied(x, y)) {
            onWidgetsChange([...widgets, {
              id: `widget-${type}-${Date.now()}`,
              type,
              x,
              y,
              w: def.w,
              h: def.h,
              visible: true,
            }]);
            setShowAddMenu(false);
            return;
          }
        }
        y++;
        if (y > 20) break; // safety
      }
    }
    setShowAddMenu(false);
  };

  const resizeWidget = (id: string, dw: number, dh: number) => {
    onWidgetsChange(widgets.map(w => {
      if (w.id !== id) return w;
      const newW = Math.max(1, Math.min(COLS, w.w + dw));
      const newH = Math.max(1, w.h + dh);
      // Clamp x so widget doesn't overflow right edge
      const newX = Math.min(w.x, COLS - newW);
      return { ...w, x: newX, w: newW, h: newH };
    }));
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setEditMode(!editMode)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
            editMode
              ? 'bg-cyan-400/20 text-cyan-400 border-cyan-400/30'
              : 'bg-mvo-panelHover/50 text-mvo-textDim border-mvo-border/50 hover:text-mvo-text'
          }`}
        >
          <Settings className="w-3 h-3 mr-1 inline" />
          {editMode ? 'Done Editing' : 'Customize Layout'}
        </button>
        {editMode && (
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-400/10 text-cyan-400 border border-cyan-400/30"
            >
              <Plus className="w-3 h-3 mr-1 inline" /> Add Widget
            </button>
            {showAddMenu && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-mvo-panel border border-mvo-border rounded-xl p-2 shadow-xl min-w-[180px]">
                {Object.entries(WIDGET_DEFAULTS).map(([type, def]) => {
                  const isEnabled = widgets.find(w => w.type === type && w.visible);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleWidget(type)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        isEnabled
                          ? 'text-mvo-textDim line-through opacity-50'
                          : 'text-mvo-text hover:bg-mvo-panelHover'
                      }`}
                    >
                      {def.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={gridRef}
        className="relative"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridAutoRows: `${ROW_HEIGHT}px`,
          gap: '12px',
          minHeight: `${maxY * ROW_HEIGHT + (maxY - 1) * 12}px`,
        }}
      >
        {visibleWidgets.map(widget => {
          const def = WIDGET_DEFAULTS[widget.type] || { w: 1, h: 1, label: widget.type };
          const isDragging = dragging === widget.id;
          const isDragOver = dragOver && dragging !== widget.id &&
            dragOver.x < widget.x + widget.w && dragOver.x + 1 > widget.x &&
            dragOver.y < widget.y + widget.h && dragOver.y + 1 > widget.y;

          return (
            <div
              key={widget.id}
              className={`transition-all duration-150 ${
                isDragging ? 'z-50 opacity-80 scale-[1.02] pointer-events-none' : 'z-10'
              } ${isDragOver ? 'ring-2 ring-red-400/50' : ''} ${
                editMode ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
              style={{
                gridColumn: `${widget.x + 1} / span ${widget.w}`,
                gridRow: `${widget.y + 1} / span ${widget.h}`,
              }}
              onMouseDown={(e) => handleDragStart(e, widget.id)}
            >
              <GlassCard className={`h-full p-4 relative ${editMode ? 'ring-2 ring-cyan-400/30' : ''}`}>
                {editMode && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20 bg-mvo-bg/80 backdrop-blur rounded-lg p-1.5 border border-mvo-border/50">
                    <button
                      onClick={(e) => { e.stopPropagation(); resizeWidget(widget.id, -1, 0); }}
                      className="w-7 h-7 rounded-md bg-mvo-panelHover hover:bg-cyan-400/20 text-mvo-textDim hover:text-cyan-400 text-sm flex items-center justify-center transition-colors"
                      title="Shrink width"
                    >
                      ←
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); resizeWidget(widget.id, 1, 0); }}
                      className="w-7 h-7 rounded-md bg-mvo-panelHover hover:bg-cyan-400/20 text-mvo-textDim hover:text-cyan-400 text-sm flex items-center justify-center transition-colors"
                      title="Grow width"
                    >
                      →
                    </button>
                    <div className="w-px h-5 bg-mvo-border/50" />
                    <button
                      onClick={(e) => { e.stopPropagation(); resizeWidget(widget.id, 0, -1); }}
                      className="w-7 h-7 rounded-md bg-mvo-panelHover hover:bg-cyan-400/20 text-mvo-textDim hover:text-cyan-400 text-sm flex items-center justify-center transition-colors"
                      title="Shrink height"
                    >
                      ↑
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); resizeWidget(widget.id, 0, 1); }}
                      className="w-7 h-7 rounded-md bg-mvo-panelHover hover:bg-cyan-400/20 text-mvo-textDim hover:text-cyan-400 text-sm flex items-center justify-center transition-colors"
                      title="Grow height"
                    >
                      ↓
                    </button>
                    <div className="w-px h-5 bg-mvo-border/50" />
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleWidget(widget.type); }}
                      className="w-7 h-7 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 text-sm flex items-center justify-center transition-colors"
                      title="Hide widget"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {children[widget.type] || (
                  <div className="flex items-center justify-center h-full text-mvo-textDim text-sm">
                    {def.label}
                  </div>
                )}
              </GlassCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}
