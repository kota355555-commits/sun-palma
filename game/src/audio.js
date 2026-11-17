// Sun Palma — all sound is synthesized with WebAudio: engine hum, sirens, gunshots,
// pickup chimes and a slow ambient pad. No audio files.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    padOsc: [],
    muted: false,
    started: false,
  };

  function ensure() {
    if (audio.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);
      // engine: sawtooth + lowpass
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      const engineFilter = audio.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(engineFilter);
      engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      // siren: two-tone triangle, LFO-driven
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'triangle';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.sirenLfo = audio.ctx.createOscillator();
      audio.sirenLfo.frequency.value = 0.8;
      const lfoGain = audio.ctx.createGain();
      lfoGain.gain.value = 180;
      audio.sirenLfo.connect(lfoGain);
      lfoGain.connect(audio.sirenOsc.frequency);
      audio.sirenLfo.start();
      // ambient pad: two detuned sines on a slow chord
      for (const freq of [110, 164.8, 220]) {
        const o = audio.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        const g = audio.ctx.createGain();
        g.gain.value = 0.02;
        o.connect(g);
        g.connect(audio.master);
        o.start();
        audio.padOsc.push(o);
      }
      audio.started = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime + when;
    const o = audio.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(audio.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noiseBurst(dur = 0.18, vol = 0.5) {
    if (!audio.ctx) return;
    const len = Math.floor(audio.ctx.sampleRate * dur);
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const g = audio.ctx.createGain();
    g.gain.value = vol;
    const f = audio.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    src.connect(f);
    f.connect(g);
    g.connect(audio.master);
    src.start();
  }

  return {
    ensure,
    resume() { if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume(); },
    setMuted(m) {
      audio.muted = m;
      if (audio.master) audio.master.gain.value = m ? 0 : 0.5;
    },
    isMuted() { return audio.muted; },
    setEngine(speed01, inCar) {
      if (!audio.ctx) return;
      audio.engineGain.gain.value = inCar ? 0.05 + speed01 * 0.12 : 0;
      audio.engineOsc.frequency.value = 50 + speed01 * 130;
    },
    setSiren(on) {
      if (!audio.ctx) return;
      audio.sirenGain.gain.value = on ? 0.045 : 0;
    },
    sirenBurst() { if (audio.ctx) { audio.setSiren(true); window.setTimeout(() => audio.setSiren(audio.sirenOn || false), 1200); } },
    shot() { noiseBurst(0.16, 0.45); blip(160, 0.08, 'square', 0.12); },
    crash() { noiseBurst(0.3, 0.4); },
    pickup() { blip(880, 0.12, 'sine', 0.22); blip(1318, 0.18, 'sine', 0.2, 0.09); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.22, i * 0.11)); },
    click() { blip(1200, 0.05, 'square', 0.08); },
  };
}
