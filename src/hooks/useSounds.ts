import { useCallback, useRef } from 'react';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15, detune = 0) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playNoise(duration: number, volume = 0.05) {
  try {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3000;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration);
  } catch {}
}

export const sounds = {
  click: () => {
    playTone(800, 0.08, 'sine', 0.12);
    playTone(1200, 0.06, 'sine', 0.08);
    playNoise(0.03, 0.03);
  },
  hover: () => {
    playTone(2000, 0.04, 'sine', 0.04);
  },
  pageSwitch: () => {
    playTone(600, 0.1, 'sine', 0.08);
    setTimeout(() => playTone(900, 0.08, 'sine', 0.06), 50);
  },
  success: () => {
    playTone(523, 0.12, 'sine', 0.1);
    setTimeout(() => playTone(659, 0.12, 'sine', 0.1), 100);
    setTimeout(() => playTone(784, 0.15, 'sine', 0.1), 200);
  },
  error: () => {
    playTone(300, 0.2, 'sawtooth', 0.08);
    setTimeout(() => playTone(200, 0.3, 'sawtooth', 0.06), 150);
  },
  notification: () => {
    playTone(880, 0.08, 'sine', 0.08);
    setTimeout(() => playTone(1100, 0.1, 'sine', 0.08), 80);
  },
  toggle: () => {
    playTone(1000, 0.06, 'triangle', 0.1);
    playNoise(0.02, 0.02);
  },
  splash: () => {
    playTone(440, 0.4, 'sine', 0.06);
    setTimeout(() => playTone(660, 0.3, 'sine', 0.05), 200);
    setTimeout(() => playTone(880, 0.3, 'sine', 0.04), 400);
  },
};

export function useSounds() {
  const enabled = useRef(true);

  const play = useCallback((sound: keyof typeof sounds) => {
    if (enabled.current) sounds[sound]();
  }, []);

  const setEnabled = useCallback((v: boolean) => { enabled.current = v; }, []);

  return { play, setEnabled, sounds };
}
