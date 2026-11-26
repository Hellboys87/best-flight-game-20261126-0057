// Skyline Courier — sound: a synthesized engine hum and radio blips.
//
// Everything is WebAudio oscillators and filtered noise, made at run
// time. No audio files, no network, nothing to download. Audio starts
// on the first key press or click, as browsers require.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let started = false;

  /** Build the audio graph on first user gesture. Safe to call often. */
  function ensure() {
    if (started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      started = true;

      // Engine: two detuned sawtooths through a low-pass filter.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 93;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();

      // Wind: looped noise through a band-pass filter.
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 900;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0.0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      noise.start();
    } catch {
      started = false;
    }
  }

  /** Follow the plane: pitch rises with throttle, wind with speed. */
  function update(throttle, speed, flying) {
    if (!started || !ctx) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(flying ? 0.035 + throttle * 0.05 : 0.0, t, 0.1);
    engineOsc.frequency.setTargetAtTime(55 + throttle * 75, t, 0.1);
    engineOsc2.frequency.setTargetAtTime(82 + throttle * 110, t, 0.1);
    windGain.gain.setTargetAtTime(flying ? Math.min(0.06, speed * 0.0012) : 0.0, t, 0.2);
  }

  /** A short two-note chime when a ring is flown through. */
  function ringChime() {
    if (!started || !ctx) return;
    blip(660, 0.09, 0.12);
    setTimeout(() => blip(990, 0.12, 0.14), 90);
  }

  /** A low thud for a hard landing or a crash. */
  function thud() {
    if (!started || !ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  }

  /** A bright arpeggio for a mission complete. */
  function fanfare() {
    if (!started || !ctx) return;
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => blip(freq, 0.18, 0.12), i * 110);
    });
  }

  function blip(freq, dur, vol) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  return { ensure, update, ringChime, thud, fanfare };
}
