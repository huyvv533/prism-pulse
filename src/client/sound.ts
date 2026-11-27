let sharedCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (sharedCtx) return sharedCtx;
  const AudioCtor = window.AudioContext;
  if (!AudioCtor) return null;
  sharedCtx = new AudioCtor();
  return sharedCtx;
};

const playTone = (
  freq: number,
  durationSec: number,
  delaySec: number,
  gainPeak: number,
  oscType: OscillatorType = 'sine'
): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  const now = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = oscType;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
};

export const playRotateSound = (muted: boolean, stepIndex: number): void => {
  if (muted) return;
  const scale = [523.25, 587.33, 659.25, 783.99];
  const freq = scale[stepIndex % scale.length] ?? 523.25;
  playTone(freq, 0.11, 0, 0.055, 'triangle');
};

export const playBeaconLockSound = (muted: boolean): void => {
  if (muted) return;
  playTone(659.25, 0.16, 0, 0.05, 'sine');
  playTone(987.77, 0.22, 0.04, 0.05, 'sine');
};

export const playVictoryFanfare = (muted: boolean): void => {
  if (muted) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, idx) => {
    playTone(n, 0.28, idx * 0.075, 0.065, 'triangle');
  });
};
