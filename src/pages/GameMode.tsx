import { GlassCard } from '../components/ui';
import { Zap, Monitor, Tv, Bot, Wrench, Rocket, FolderOpen, Globe, FlaskConical, Settings, Gamepad2, Activity, Cpu, Shield, LayoutDashboard } from 'lucide-react';

const pages = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-cyan-400' },
  { id: 'gamelibrary', label: 'Game Library', icon: Gamepad2, color: 'text-purple-400' },
  { id: 'gamemode', label: 'Game Mode', icon: Zap, color: 'text-amber-400' },
  { id: 'optimizer', label: 'Optimizer', icon: Wrench, color: 'text-orange-400' },
  { id: 'performance', label: 'Performance', icon: Activity, color: 'text-green-400' },
  { id: 'systemboost', label: 'System Boost', icon: Rocket, color: 'text-red-400' },
  { id: 'aitools', label: 'AI Tools', icon: Bot, color: 'text-pink-400' },
  { id: 'overlay', label: 'Overlay', icon: Monitor, color: 'text-orange-400' },
  { id: 'streaming', label: 'Streaming', icon: Tv, color: 'text-purple-400' },
  { id: 'files', label: 'Files', icon: FolderOpen, color: 'text-blue-400' },
  { id: 'webhub', label: 'Web Hub', icon: Globe, color: 'text-teal-400' },
  { id: 'tools', label: 'Tools', icon: Wrench, color: 'text-amber-400' },
  { id: 'functiontest', label: 'Function Test', icon: FlaskConical, color: 'text-yellow-400' },
  { id: 'settings', label: 'Settings', icon: Settings, color: 'text-gray-400' },
];

export function GameMode({ activeProfile, setActiveProfile }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">Game Mode</h1>
        <p className="text-mvo-textDim mt-1">Select your active profile for game-specific optimizations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { id: 'vortex', name: 'Vortex', icon: '🌪️', desc: 'Competitive Gaming — Max FPS, low latency, overlay', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30' },
          { id: 'nova', name: 'Nova', icon: '✨', desc: 'Streaming/Creator — OBS, audio, capture, stability', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/30' },
          { id: 'astra', name: 'Astra', icon: '⭐', desc: 'Balanced/Everyday — Stability, lower heat, normal usage', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
        ].map(p => (
          <button key={p.id} onClick={() => setActiveProfile(p.id)} className={`glass rounded-2xl p-6 transition-all relative overflow-hidden group ${activeProfile === p.id ? 'ring-2 ring-cyan-400/50 bg-cyan-400/5' : 'hover:border-mvo-borderBright/50'}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[var(--tw-gradient-from)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ '--tw-gradient-from': p.color.replace('text-', '') }} />
            <div className="relative">
              <span className="text-4xl">{p.icon}</span>
              <h3 className="font-display text-xl font-bold mt-2 text-mvo-text">{p.name}</h3>
              <p className="text-sm text-mvo-textDim mt-1">{p.desc}</p>
              {activeProfile === p.id && <span className="absolute top-4 right-4 w-6 h-6 rounded-full bg-cyan-400/20 border border-cyan-400/50 flex items-center justify-center text-cyan-400 font-bold text-sm">✓</span>}
            </div>
          </button>
        ))}
      </div>

      <GlassCard>
        <h3 className="font-semibold text-mvo-text mb-4">Profile Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-mvo-textDim">Power Plan:</span> <span className="font-mono ml-2 text-mvo-text">High Performance</span></div>
          <div><span className="text-mvo-textDim">Game Mode:</span> <span className="font-mono ml-2 text-green-400">Enabled</span></div>
          <div><span className="text-mvo-textDim">Priority Boost:</span> <span className="font-mono ml-2 text-mvo-text">Enabled</span></div>
          <div><span className="text-mvo-textDim">GPU Scheduling:</span> <span className="font-mono ml-2 text-mvo-text">Hardware Accelerated</span></div>
        </div>
      </GlassCard>
    </div>
  );
}