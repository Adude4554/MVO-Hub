/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mvo: {
          bg: 'var(--mvo-bg)',
          panel: 'var(--mvo-panel)',
          panelHover: 'var(--mvo-panel-hover)',
          border: 'var(--mvo-border)',
          borderBright: 'var(--mvo-border-bright)',
          text: 'var(--mvo-text)',
          textDim: 'var(--mvo-text-dim)',
          textMuted: 'var(--mvo-text-muted)',
          accent: 'var(--mvo-accent)',
          accentDim: 'rgba(0, 212, 255, 0.25)',
          accentGreen: '#00ff88',
          accentGold: '#ffd700',
          accentRed: 'var(--mvo-accent-red)',
          accentPurple: '#b366ff',
          accentOrange: '#ff9f1a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['Orbitron', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px -5px rgba(0, 212, 255, 0.3)',
        'glow-green': '0 0 20px -5px rgba(0, 255, 136, 0.3)',
        'glow-red': '0 0 20px -5px rgba(255, 51, 102, 0.3)',
        'inner-glow': 'inset 0 0 20px -5px rgba(0, 212, 255, 0.1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-gradient': 'linear-gradient(135deg, #0a0f1a 0%, #111827 50%, #0a0f1a 100%)',
      },
    },
  },
  plugins: [],
}