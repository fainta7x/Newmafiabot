import type { PokerSoundCue } from './pokerSound.ts';

/**
 * Table sounds built from what a real table sounds like (owner, 2026-10-12: «это не звуки покера, какое-то пиликанье»):
 * a clay chip is a short click plus a few quickly dying, inharmonic rings and a dull knock on the felt; a card is a
 * hiss of air and a dry snap; a knuckle rap is a low thump. No samples are downloaded — nothing to license or load.
 * Every cue gets a little random pitch and timing so repeated chips do not sound like one machine-gun loop.
 */
type Ctx = AudioContext;

const noises = new WeakMap<Ctx, AudioBuffer>();
const masters = new WeakMap<Ctx, AudioNode>();

const rnd = (from: number, to: number) => from + Math.random() * (to - from);

const noiseOf = (ctx: Ctx) => {
  let buffer = noises.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(ctx, buffer);
  }
  return buffer;
};

/** One shared limiter, so several clacks at once never clip on a phone speaker. */
const masterOf = (ctx: Ctx) => {
  let out = masters.get(ctx);
  if (!out) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    const gain = ctx.createGain();
    gain.gain.value = 0.95;
    compressor.connect(gain).connect(ctx.destination);
    out = compressor;
    masters.set(ctx, out);
  }
  return out;
};

type Burst = { freq: number; endFreq?: number; q?: number; decay: number; gain: number; type?: BiquadFilterType; attack?: number };
/** A short burst of filtered noise: the air and the friction in a card or a chip. */
const burst = (ctx: Ctx, out: AudioNode, at: number, spec: Burst) => {
  const attack = spec.attack ?? 0.002;
  const source = ctx.createBufferSource();
  source.buffer = noiseOf(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = spec.type ?? 'bandpass';
  filter.Q.value = spec.q ?? 1;
  filter.frequency.setValueAtTime(spec.freq, at);
  if (spec.endFreq) filter.frequency.exponentialRampToValueAtTime(spec.endFreq, at + attack + spec.decay);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(spec.gain, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + spec.decay);
  source.connect(filter).connect(gain).connect(out);
  source.start(at, rnd(0, 0.9), attack + spec.decay + 0.03);
};

/** A struck object: a few sine partials that fade at different speeds. */
const ring = (ctx: Ctx, out: AudioNode, at: number, freqs: number[], gains: number[], decay: number, gain: number) => {
  freqs.forEach((hz, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = hz;
    const level = ctx.createGain();
    const length = decay / (1 + index * 0.55);
    level.gain.setValueAtTime(0.0001, at);
    level.gain.linearRampToValueAtTime(gain * (gains[index] ?? 0.2), at + 0.002);
    level.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(level).connect(out);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
  });
};

/** A dull knock: a low sine that drops a little in pitch, like a hand or a stack landing on felt. */
const thump = (ctx: Ctx, out: AudioNode, at: number, freq: number, gain: number, length = 0.05) => {
  const oscillator = ctx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(freq * 1.5, at);
  oscillator.frequency.exponentialRampToValueAtTime(freq, at + 0.02);
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.linearRampToValueAtTime(gain, at + 0.003);
  level.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(level).connect(out);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
};

/** One clay chip hitting another: click + inharmonic ring + a knock on the felt. */
const clack = (ctx: Ctx, out: AudioNode, at: number, strength = 1) => {
  const pitch = rnd(0.9, 1.1);
  burst(ctx, out, at, { freq: 3800 * pitch, q: 1.3, decay: 0.012, gain: 0.5 * strength });
  ring(ctx, out, at, [2250, 3470, 5210, 6980].map((hz) => hz * pitch * rnd(0.97, 1.03)), [1, 0.65, 0.4, 0.22], 0.08, 0.15 * strength);
  thump(ctx, out, at, 240 * pitch, 0.13 * strength, 0.035);
};

const cardSlide = (ctx: Ctx, out: AudioNode, at: number, length = 0.07, gain = 0.22) =>
  burst(ctx, out, at, { freq: 2600, endFreq: 5400, q: 0.7, decay: length, gain, attack: 0.006 });

const cardSnap = (ctx: Ctx, out: AudioNode, at: number, gain = 0.45) => {
  burst(ctx, out, at, { freq: 5200 * rnd(0.95, 1.05), q: 1.1, decay: 0.02, gain });
  burst(ctx, out, at, { freq: 1400, q: 0.9, decay: 0.04, gain: gain * 0.55 });
  thump(ctx, out, at, 150, gain * 0.35, 0.04);
};

const knuckleRap = (ctx: Ctx, out: AudioNode, at: number) => {
  thump(ctx, out, at, 165 * rnd(0.95, 1.05), 0.5, 0.06);
  burst(ctx, out, at, { freq: 1500, q: 1, decay: 0.018, gain: 0.22 });
};

/** Several chips in a row, each a little later than the last (a stack being pushed or dropped). */
const cascade = (ctx: Ctx, out: AudioNode, at: number, count: number, span: number, strength: number) => {
  let time = at;
  for (let i = 0; i < count; i++) {
    clack(ctx, out, time, strength * rnd(0.7, 1) * (0.75 + 0.25 * (i / Math.max(1, count - 1))));
    time += (span / count) * rnd(0.6, 1.4);
  }
};

export const playPokerCue = (ctx: Ctx, cue: PokerSoundCue) => {
  const out = masterOf(ctx);
  const at = ctx.currentTime + 0.01;
  switch (cue) {
    case 'deal':
      for (let i = 0; i < 2; i++) { cardSlide(ctx, out, at + i * 0.12); cardSnap(ctx, out, at + i * 0.12 + 0.05); }
      break;
    case 'board':
      cardSlide(ctx, out, at, 0.1, 0.25);
      cardSnap(ctx, out, at + 0.1, 0.5);
      thump(ctx, out, at + 0.1, 120, 0.25, 0.06);
      break;
    case 'chips':
      cascade(ctx, out, at, 3, 0.1, 0.8);
      break;
    case 'chipsBig':
      burst(ctx, out, at, { freq: 900, q: 0.6, decay: 0.28, gain: 0.12, attack: 0.02 });
      cascade(ctx, out, at, 7, 0.26, 1);
      break;
    case 'check':
      knuckleRap(ctx, out, at);
      knuckleRap(ctx, out, at + 0.13);
      break;
    case 'fold':
      burst(ctx, out, at, { freq: 3000, endFreq: 1500, q: 0.6, decay: 0.13, gain: 0.3, attack: 0.008 });
      cardSnap(ctx, out, at + 0.11, 0.22);
      break;
    case 'sweep':
      burst(ctx, out, at, { freq: 1800, q: 0.5, decay: 0.28, gain: 0.2, attack: 0.02 });
      cascade(ctx, out, at + 0.03, 4, 0.22, 0.5);
      break;
    case 'turn':
      ring(ctx, out, at, [784, 1568, 2350], [1, 0.3, 0.12], 0.34, 0.14);
      ring(ctx, out, at + 0.12, [988, 1976, 2960], [1, 0.3, 0.12], 0.4, 0.11);
      break;
    case 'timer':
      for (let i = 0; i < 2; i++) burst(ctx, out, at + i * 0.15, { freq: 1300, q: 3, decay: 0.022, gain: 0.9 });
      break;
    case 'win':
      cascade(ctx, out, at + 0.15, 10, 0.75, 0.9);
      burst(ctx, out, at + 0.1, { freq: 1700, q: 0.5, decay: 0.45, gain: 0.14, attack: 0.04 });
      ring(ctx, out, at + 0.4, [523, 659, 784], [1, 0.8, 0.7], 0.9, 0.05);
      break;
  }
};
