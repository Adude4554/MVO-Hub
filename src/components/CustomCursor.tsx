import { useEffect, useRef } from 'react';

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const ring = useRef({ x: 0, y: 0 });
  const trail = useRef({ x: 0, y: 0 });
  const visible = useRef(false);

  useEffect(() => {
    const isCustomCursor = window.matchMedia('(pointer: fine)').matches;
    if (!isCustomCursor) return;

    // Use a class so it survives re-renders and language changes
    document.documentElement.classList.add('custom-cursor-active');

    const onMove = (e: MouseEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      if (!visible.current) {
        visible.current = true;
        ring.current = { x: e.clientX, y: e.clientY };
        trail.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onEnter = () => { visible.current = true; };
    const onLeave = () => { visible.current = false; };

    let raf: number;
    const animate = () => {
      ring.current.x += (pos.current.x - ring.current.x) * 0.15;
      ring.current.y += (pos.current.y - ring.current.y) * 0.15;
      trail.current.x += (pos.current.x - trail.current.x) * 0.06;
      trail.current.y += (pos.current.y - trail.current.y) * 0.06;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x - 4}px, ${pos.current.y - 4}px)`;
        dotRef.current.style.opacity = visible.current ? '1' : '0';
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${ring.current.x - 16}px, ${ring.current.y - 16}px)`;
        ringRef.current.style.opacity = visible.current ? '1' : '0';
      }
      if (trailRef.current) {
        trailRef.current.style.transform = `translate(${trail.current.x - 24}px, ${trail.current.y - 24}px)`;
        trailRef.current.style.opacity = visible.current ? '0.4' : '0';
      }
      raf = requestAnimationFrame(animate);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseenter', onEnter);
    document.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseenter', onEnter);
      document.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove('custom-cursor-active');
    };
  }, []);

  return (
    <>
      <div ref={trailRef} className="pointer-events-none fixed top-0 z-[10000] w-12 h-12 rounded-full border border-cyan-400/20 transition-opacity duration-300" style={{ willChange: 'transform', left: 0 }} />
      <div ref={ringRef} className="pointer-events-none fixed top-0 z-[10001] w-8 h-8 rounded-full border-2 border-cyan-400/60 transition-opacity duration-300" style={{ willChange: 'transform', left: 0 }} />
      <div ref={dotRef} className="pointer-events-none fixed top-0 z-[10002] w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,212,255,0.8)] transition-opacity duration-300" style={{ willChange: 'transform', left: 0 }} />
    </>
  );
}
