// Sun Palma — all sound is synthesized with WebAudio, rewritten for the
// revision pass: engine hum, sirens, per-weapon gunshots, pickup chimes, a
// slow ambient pad, and now a rain bed and thunder for the storms. No audio
// files anywhere.

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    padOsc: [],
    rainGain: null,
    rainSrc: null,
    muted: false,
    started: false,
  };

  // One oscillator wired straight to the master bus.
  function makeVoice(type, freq, vol) {
    const o = audio.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = audio.ctx.createGain();
    g.gain.value = vol;
    o.connect(g);
    g.connect(audio.master);
    o.start();
    return o;
  }

  function ensure() {
    if (audio.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);

      // engine: sawtooth through a lowpass, pitch follows speed
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

      // siren: two-tone triangle with an LFO wobbling the pitch
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'triangle';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      const lfo = audio.ctx.createOscillator();
      lfo.frequency.value = 0.8;
      const lfoGain = audio.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(audio.sirenOsc.frequency);
      lfo.start();
      audio.sirenLfo = lfo;

      // ambient pad: three detuned sines on a slow chord
      for (const freq of [110, 164.8, 220]) {
        audio.padOsc.push(makeVoice('sine', freq, 0.02));
      }

      // rain: a looping bed of filtered noise, silent until the weather asks
      const rainLen = Math.floor(audio.ctx.sampleRate * 2);
      const rainBuf = audio.ctx.createBuffer(1, rainLen, audio.ctx.sampleRate);
      const rainData = rainBuf.getChannelData(0);
      for (let i = 0; i < rainLen; i++) rainData[i] = Math.random() * 2 - 1;
      audio.rainSrc = audio.ctx.createBufferSource();
      audio.rainSrc.buffer = rainBuf;
      audio.rainSrc.loop = true;
      const rainFilter = audio.ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 1400;
      rainFilter.Q.value = 0.6;
      audio.rainGain = audio.ctx.createGain();
      audio.rainGain.gain.value = 0;
      audio.rainSrc.connect(rainFilter);
      rainFilter.connect(audio.rainGain);
      audio.rainGain.connect(audio.master);
      audio.rainSrc.start();

      audio.started = true;
      return true;
    } catch {
      return false;
    }
  }

  // A short pitched blip that fades out.
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

  // A burst of noise through a lowpass: the raw material of shots, crashes
  // and thunder, each with its own length and filter.
  function noiseBurst(dur = 0.18, vol = 0.5, cutoff = 1800) {
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
    f.frequency.value = cutoff;
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
    // one gunshot sound per weapon: the shotgun booms low, the SMG snaps fast
    shotFor(id) {
      if (id === 'shotgun') { noiseBurst(0.35, 0.6); blip(90, 0.16, 'square', 0.2); }
      else if (id === 'smg') { noiseBurst(0.09, 0.35); blip(220, 0.05, 'square', 0.1); }
      else if (id === 'fists') { noiseBurst(0.08, 0.25); blip(120, 0.06, 'sine', 0.15); }
      else { noiseBurst(0.16, 0.45); blip(160, 0.08, 'square', 0.12); }
    },
    // rain volume follows the weather (0 dry, 1 downpour)
    setRain(level) {
      if (!audio.ctx || !audio.rainGain) return;
      audio.rainGain.gain.value = Math.max(0, Math.min(1, level)) * 0.16;
    },
    // thunder: a long low rumble that fades over a couple of seconds
    thunder() {
      if (!audio.ctx) return;
      const len = Math.floor(audio.ctx.sampleRate * 2.2);
      const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buf;
      const f = audio.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 160;
      const g = audio.ctx.createGain();
      g.gain.value = 0.5;
      src.connect(f);
      f.connect(g);
      g.connect(audio.master);
      src.start();
    },
    crash() { noiseBurst(0.3, 0.4); },
    pickup() { blip(880, 0.12, 'sine', 0.22); blip(1318, 0.18, 'sine', 0.2, 0.09); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.22, i * 0.11)); },
    click() { blip(1200, 0.05, 'square', 0.08); },
  };
}
