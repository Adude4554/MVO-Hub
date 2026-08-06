import React, { useEffect, useRef } from 'react';

export function FuturisticBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let gridOffset = 0;
    let scanlineY = -100;
    const scanlineSpeed = 0.5;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      life: number;
      maxLife: number;
      type: 'dot' | 'line' | 'ring';
      angle: number;
      angularVel: number;
    }

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      
      particles = Array.from({ length: 60 }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 1,
        color: i % 3 === 0 ? '#00d4ff' : i % 3 === 1 ? '#8b7cff' : '#00ff88',
        life: Math.random() * 100,
        maxLife: 100 + Math.random() * 200,
        type: Math.random() > 0.7 ? 'ring' : Math.random() > 0.5 ? 'line' : 'dot',
        angle: Math.random() * Math.PI * 2,
        angularVel: (Math.random() - 0.5) * 0.01,
      }));
    }

    function drawGrid() {
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      
      ctx.beginPath();
      for (let x = -gridOffset; x < width + gridSize; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = -gridOffset; y < height + gridSize; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    function drawGlowOrbs() {
      const time = Date.now() * 0.001;
      const orbs = [
        { x: width * 0.15 + Math.sin(time * 0.3) * 100, y: height * 0.2 + Math.cos(time * 0.2) * 50, r: 300, color: 'rgba(0, 212, 255, 0.08)' },
        { x: width * 0.85 + Math.cos(time * 0.25) * 80, y: height * 0.8 + Math.sin(time * 0.35) * 60, r: 250, color: 'rgba(139, 124, 255, 0.06)' },
        { x: width * 0.5 + Math.sin(time * 0.15) * 120, y: height * 0.5 + Math.cos(time * 0.1) * 80, r: 400, color: 'rgba(0, 255, 136, 0.04)' },
      ];

      orbs.forEach(orb => {
        const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
        gradient.addColorStop(0, orb.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawParticles() {
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        p.angle += p.angularVel;

        if (p.x < -50) p.x = width + 50;
        if (p.x > width + 50) p.x = -50;
        if (p.y < -50) p.y = height + 50;
        if (p.y > height + 50) p.y = -50;

        if (p.life > p.maxLife) {
          p.life = 0;
          p.maxLife = 100 + Math.random() * 200;
          p.size = Math.random() * 2 + 1;
        }

        const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.6;
        ctx.globalAlpha = alpha;

        if (p.type === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3 + Math.sin(p.life * 0.1) * 5, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 6 + Math.sin(p.life * 0.1) * 8, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.type === 'line') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(p.angle) * 15, p.y - Math.sin(p.angle) * 15);
          ctx.lineTo(p.x + Math.cos(p.angle) * 15, p.y + Math.sin(p.angle) * 15);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }

    function drawScanline() {
      scanlineY += scanlineSpeed;
      if (scanlineY > height + 100) scanlineY = -100;
      
      const gradient = ctx.createLinearGradient(0, scanlineY - 2, 0, scanlineY + 2);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.5, 'rgba(0, 212, 255, 0.03)');
      gradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, scanlineY - 2, width, 4);
    }

    function drawConnections() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 120) {
            const alpha = (1 - dist / 120) * 0.1;
            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    }

    function drawCornerBrackets() {
      const size = 40;
      const thickness = 2;
      const color = 'rgba(0, 212, 255, 0.3)';
      const padding = 30;
      const time = Date.now() * 0.001;
      const pulse = Math.sin(time * 2) * 0.3 + 0.7;

      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.globalAlpha = pulse;

      const corners = [
        { x: padding, y: padding, right: true, down: true },
        { x: width - padding, y: padding, right: false, down: true },
        { x: padding, y: height - padding, right: true, down: false },
        { x: width - padding, y: height - padding, right: false, down: false },
      ];

      corners.forEach(c => {
        ctx.beginPath();
        if (c.right) {
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x + size, c.y);
        } else {
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x - size, c.y);
        }
        if (c.down) {
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x, c.y + size);
        } else {
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x, c.y - size);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);
      
      drawGlowOrbs();
      drawGrid();
      drawConnections();
      drawParticles();
      drawScanline();
      drawCornerBrackets();

      gridOffset = (gridOffset + 0.1) % 50;
      
      animationRef.current = requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resize);
    resize();
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}

export function NeonGlow({ x, y, radius = 300, color = 'rgba(0, 212, 255, 0.15)', className = '' }: {
  x: number;
  y: number;
  radius?: number;
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        left: x - radius,
        top: y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: '50%',
        background: `radial-gradient(circle at center, ${color} 0%, transparent 70%)`,
        filter: 'blur(60px)',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}