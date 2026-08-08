import { useState, useEffect, useRef } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'logo' | 'text' | 'bar' | 'fade'>('logo');
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('text'), 400);
    const t2 = setTimeout(() => setPhase('bar'), 900);
    const t3 = setTimeout(() => setPhase('fade'), 2200);
    const t4 = setTimeout(() => cbRef.current(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050812] transition-opacity duration-500 ${phase === 'fade' ? 'opacity-0' : 'opacity-100'}`}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-cyan-400/5 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-[100px]" />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        <div className={`transition-all duration-500 ease-out ${phase === 'logo' || phase === 'text' || phase === 'bar' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border border-cyan-400/30 backdrop-blur-sm bg-gradient-to-br from-cyan-400/10 to-purple-500/10 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="MVO"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to hexagonal logo if image not found
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = document.createElement('div');
                  fallback.className = 'w-full h-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center';
                  fallback.innerHTML = '<span class="text-3xl font-black text-white tracking-tighter" style="font-family: Orbitron, sans-serif;">MVO</span>';
                  target.parentElement?.appendChild(fallback);
                }}
              />
            </div>
            <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-cyan-400/10 to-purple-500/10 blur-md -z-10 animate-pulse" />
          </div>
        </div>

        <div className={`text-center transition-all duration-500 ease-out delay-200 ${phase === 'text' || phase === 'bar' ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <h1 className="font-display text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
            MVO Hub
          </h1>
          <p className="text-mvo-textDim text-sm mt-2 tracking-widest uppercase">System Optimizer & Game Launcher</p>
        </div>

        <div className={`w-64 transition-all duration-300 ease-out ${phase === 'bar' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="h-1 bg-mvo-panel rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 transition-all duration-1000 ease-out"
              style={{ width: phase === 'bar' || phase === 'fade' ? '100%' : '0%' }}
            />
          </div>
          <p className="text-[10px] text-mvo-textMuted text-center mt-3 tracking-wider">
            {phase === 'bar' ? 'Initializing systems...' : phase === 'fade' ? 'Ready' : ''}
          </p>
        </div>
      </div>

      <div className="absolute bottom-8 flex items-center gap-4 text-[10px] text-mvo-textMuted/40 tracking-wider">
        <span>PERFORMANCE</span>
        <span className="w-1 h-1 rounded-full bg-cyan-400/40" />
        <span>GAMING</span>
        <span className="w-1 h-1 rounded-full bg-purple-400/40" />
        <span>OPTIMIZATION</span>
      </div>
    </div>
  );
}
