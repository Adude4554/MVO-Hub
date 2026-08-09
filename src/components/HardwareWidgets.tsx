import { GlassCard } from './ui';

interface CircularGaugeProps {
  value: number;
  max?: number;
  color: string;
  label: string;
  sub?: string;
  unit?: string;
  size?: number;
  strokeWidth?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
}

export function CircularGauge({
  value, max = 100, color, label, sub, unit = '%', size = 120, strokeWidth = 10,
  warningThreshold, criticalThreshold,
}: CircularGaugeProps) {
  const percent = Math.min((value / max) * 100, 100);
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  let displayColor = color;
  if (criticalThreshold !== undefined && value >= criticalThreshold) {
    displayColor = '#ef4444';
  } else if (warningThreshold !== undefined && value >= warningThreshold) {
    displayColor = '#f59e0b';
  }

  return (
    <GlassCard className="h-full flex flex-col items-center justify-center p-4">
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-mvo-border/30" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={displayColor} strokeWidth={strokeWidth}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-700 ease-out" style={{ filter: `drop-shadow(0 0 8px ${displayColor}50)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-mvo-text">{value.toFixed(1)}<span className="text-sm">{unit}</span></span>
        </div>
      </div>
      <p className="text-sm font-medium text-mvo-text mt-2">{label}</p>
      {sub && <p className="text-xs text-mvo-textDim mt-0.5">{sub}</p>}
    </GlassCard>
  );
}

interface LinearGaugeProps {
  value: number;
  max: number;
  label: string;
  color: string;
  usedLabel?: string;
  totalLabel?: string;
  showPercent?: boolean;
}

export function LinearGauge({ value, max, label, color, usedLabel, totalLabel, showPercent = true }: LinearGaugeProps) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-mvo-textDim">{label}</span>
        {showPercent && <span className="text-mvo-textDim">{percent.toFixed(1)}%</span>}
      </div>
      <div className="flex items-center gap-2">
        {usedLabel && <span className="text-xs text-mvo-textDim w-16 text-right">{usedLabel}</span>}
        <div className="flex-1 h-2 bg-mvo-bg rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(percent, 100)}%`, background: color }} />
        </div>
        {totalLabel && <span className="text-xs text-mvo-textDim w-16">{totalLabel}</span>}
      </div>
    </div>
  );
}

interface SensorCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  color?: string;
  sub?: string;
}

export function SensorCard({ label, value, icon, color = 'text-cyan-400', sub }: SensorCardProps) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs text-mvo-textDim">{label}</span>
        </div>
        <span className={`text-lg font-bold ${color}`}>{value}</span>
      </div>
      {sub && <p className="text-xs text-mvo-textDim mt-1">{sub}</p>}
    </GlassCard>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  color?: string;
}

export function DetailRow({ label, value, color }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-mvo-border/20 last:border-0">
      <span className="text-xs text-mvo-textDim">{label}</span>
      <span className={`text-sm font-medium ${color || 'text-mvo-text'}`}>{value}</span>
    </div>
  );
}

interface MiniBarProps {
  value: number;
  max: number;
  color: string;
  height?: number;
}

export function MiniBar({ value, max, color, height = 8 }: MiniBarProps) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-full bg-mvo-bg rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(percent, 100)}%`, background: color }} />
    </div>
  );
}

interface HistoryChartProps {
  data: number[];
  color: string;
  height?: number;
  label?: string;
}

export function HistoryChart({ data, color, height = 64, label }: HistoryChartProps) {
  const max = Math.max(...data, 1);
  return (
    <div>
      {label && <div className="text-xs text-mvo-textDim mb-1">{label}</div>}
      <div className="flex items-end gap-px" style={{ height }}>
        {data.map((v, i) => (
          <div key={i} className="flex-1 rounded-t transition-all duration-200"
            style={{ height: `${Math.max((v / max) * 100, 2)}%`, background: `${color}99` }}
            title={`${v.toFixed(1)}`} />
        ))}
      </div>
    </div>
  );
}
