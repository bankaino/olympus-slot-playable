// live/audio.js — ГРОМ ОЛИМПА sound: the user's track in three clips + synthesized effects (WebAudio), driven by the sim event bus S.ev.
// Music follows the show: LOOP (calm intro, seamless) under spins 1-3 → the DROP clip on the Zeus strike (starts on the track's own downbeat) → the EPIC clip at the big win → quieter on the endcard.
// index.html calls AUDIO.tick(state) once per frame in play mode; the context starts on the first user gesture (autoplay policy); AUDIO.mute(bool) is wired to ad-network viewability.
// Clips: live/audio/music_*.mp3 (tools/cut_music.py) — fetched in the live preview, inline base64 (window.MUSIC_B64) in a build. Without them only the effects play.
(function () {
  const SM = window.SIM, K = SM.K, SK = (window.SKIN && window.SKIN.sfx) || { lead: 'triangle', soft: 'sine', bass: 'sine', pitch: 1 }, PM = SK.pitch || 1, f_ = (x) => x * PM;
  let ac = null, out = null, sfx = null, sfxSoft = null, musicBus = null, musicLP = null, muted = false, last = -1, nbuf = null, started = false;
  const buf = {}, cur = {}; let mode = '', lastTick = 0, lastBig = -1, counterAcc = 0, tickAt = 0;
  const MUSIC = { loop: 'audio/music_loop.mp3', drop: 'audio/music_drop.mp3', epic: 'audio/music_epic.mp3', strike: 'audio/sfx_strike.mp3' };            // 'strike' is the thunder sample, not music
  const MV = { loop: 0.62, drop: 0.85, epic: 0.95 };                           // clip level on the music bus
  const start = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    ac = new C(); const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    out = ac.createGain(); out.gain.value = muted ? 0 : 0.8; out.connect(comp); comp.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 0.9; sfx.connect(out);
    const shelf = ac.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3500; shelf.gain.value = -4; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.7;
    sfxSoft = ac.createGain(); sfxSoft.connect(shelf); shelf.connect(lp); lp.connect(sfx);                    // synthesized effects go through here; the thunder sample goes straight to sfx
    musicLP = ac.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 3200; musicLP.Q.value = 0.4;
    musicBus = ac.createGain(); musicBus.gain.value = 0.7; musicBus.connect(musicLP); musicLP.connect(out);
    for (const k in MUSIC) { const p = window.MUSIC_B64 && window.MUSIC_B64[k] ? Promise.resolve(Uint8Array.from(atob(window.MUSIC_B64[k]), (c) => c.charCodeAt(0)).buffer) : fetch(MUSIC[k]).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))));
      p.then((ab) => new Promise((res, rej) => ac.decodeAudioData(ab, res, rej))).then((b) => { buf[k] = b; }).catch((e) => console.warn('music', k, e && e.message)); }
  };
  addEventListener('pointerdown', start, { capture: true }); addEventListener('keydown', start, { capture: true });
  const noise = () => { if (nbuf) return nbuf; nbuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = nbuf.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; } return nbuf; };
  const env = (node, t0, a, peak, dur, dest) => { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); node.connect(g); g.connect(dest || sfxSoft); return g; };
  const tone = (freq, t0, dur, type = 'sine', peak = 0.2, slide = 0, a = 0.005) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur); env(o, t0, a, peak, dur); o.start(t0); o.stop(t0 + dur + 0.05); };
  const burst = (t0, dur, f0, f1, peak, q = 1.2, type = 'bandpass', a = 0.004, dest) => { const s = ac.createBufferSource(); s.buffer = noise(); s.loop = true; const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur); s.connect(f); env(f, t0, a, peak, dur, dest); s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05); };
  const duck = (t0, depth, dur) => { if (!musicBus) return; const g = musicBus.gain; g.cancelScheduledValues(t0); g.setTargetAtTime(0.7 * depth, t0, 0.02); g.setTargetAtTime(0.7, t0 + dur, 0.25); };
  // ---- music: one clip at a time, equal-power crossfades; the loop wraps inside the AudioBuffer (the file already crossfades its own seam) ----
  const play = (name, at, fade, loop) => { const b = buf[name]; if (!b) return false; const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; s.loop = !!loop; g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(MV[name], at + fade);
    s.connect(g); g.connect(musicBus); s.start(at); cur[name] = { s, g }; return true; };
  const stop = (name, at, fade) => { const c = cur[name]; if (!c) return; c.g.gain.cancelScheduledValues(at); c.g.gain.setValueAtTime(c.g.gain.value, at); c.g.gain.linearRampToValueAtTime(0.0001, at + fade); try { c.s.stop(at + fade + 0.05); } catch (e) {} delete cur[name]; };
  const musicTo = (m, now, fade) => { if (m === mode) return; if (m === 'loop') { if (!play('loop', now, fade, true)) return; } else if (m === 'drop') { stop('loop', now, 0.12); if (!play('drop', now, 0.03, false)) return; }
    else if (m === 'epic') { stop('drop', now, 0.1); stop('loop', now, 0.1); if (!play('epic', now, 0.03, false)) return; } mode = m; };
  const stopAll = (now) => { for (const k of Object.keys(cur)) stop(k, now, 0.12); mode = ''; };
  // thunder = a chest-hit sub thump + a FULL-RANGE body (the middle: a rumble that opens at ~1.8 kHz and closes, a sawtooth growl with its 100-600 Hz harmonics, a few crackles around 0.5-1.4 kHz)
  // + two aftershocks rolling left and right + a short dull crack; nothing above ~3 kHz, so it is wide and heavy but never shrill
  const pan = (p) => { const n = ac.createStereoPanner(); n.pan.value = p; n.connect(sfx); return n; };
  const growl = (t0, dur, peak) => { const o = ac.createOscillator(), f = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(118, t0); o.frequency.exponentialRampToValueAtTime(50, t0 + dur); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(260, t0 + dur); f.Q.value = 1.2; o.connect(f); env(f, t0, 0.012, peak, dur); o.start(t0); o.stop(t0 + dur + 0.05); };
  // the recorded bolt (live/audio/sfx_strike.mp3): rate < 1 makes it deeper and longer; ?thunder=synth plays the synthesized thunder below instead (A/B)
  const useSample = () => !!buf.strike && !/thunder=synth/.test(location.search);
  const hit = (t0, rate, gain, pn) => { const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf.strike; s.playbackRate.value = rate; g.gain.value = gain; s.connect(g); if (pn !== undefined) { const p = ac.createStereoPanner(); p.pan.value = pn; g.connect(p); p.connect(sfx); } else g.connect(sfx); s.start(t0); };
  const thunder = (t0, big = 1) => {
    tone(62, t0, 1.1 * big, 'sine', 0.4 * big, 0.45, 0.004); tone(94, t0, 0.55 * big, 'triangle', 0.2 * big, 0.5, 0.004);
    burst(t0, 1.5 * big, 1900, 130, 0.85 * big, 0.8, 'lowpass', 0.006); growl(t0, 0.95 * big, 0.42 * big);
    [1400, 1100, 900, 700, 560].forEach((f, i) => burst(t0 + 0.015 + i * 0.06, 0.16, f, f * 0.45, 0.2 * big, 2, 'bandpass', 0.002));
    burst(t0 + 0.26, 1.2 * big, 1100, 100, 0.5 * big, 0.8, 'lowpass', 0.1, pan(-0.6)); burst(t0 + 0.62, 1.4 * big, 850, 90, 0.42 * big, 0.8, 'lowpass', 0.18, pan(0.6));
    burst(t0 + 1.0, 1.2 * big, 420, 70, 0.2 * big, 0.8, 'lowpass', 0.25, pan(-0.2));
    burst(t0, 0.08, 2400, 500, 0.08 * big, 1.0, 'lowpass', 0.001);
  };
  const SFX = {
    spin: (t0) => { burst(t0, 0.3, 500, 3500, 0.14, 1.4); tone(f_(260), t0, 0.22, SK.soft, 0.08, 2.2); },
    in: (t0) => { for (let c = 0; c < 6; c++) { const at = t0 + K.T.inCol * c + K.T.in * 0.92; tone(f_(150 + 22 * c), at, 0.14, SK.bass, 0.22, 0.55); burst(at, 0.07, 3200 + 300 * c, 1200, 0.07, 2); tone(f_(880 + 110 * c), at + 0.005, 0.12, SK.lead, 0.03); } },
    fall: (t0) => { for (let c = 0; c < 4; c++) { const at = t0 + K.T.fall * (0.82 + 0.03 * c); tone(f_(170 + 25 * c), at, 0.1, SK.bass, 0.15, 0.6); burst(at, 0.05, 3000, 1500, 0.05, 2); } },
    win: (t0, e) => { const n = 3 + Math.min(3, Math.floor(e.x / 3)), base = 523 * Math.pow(2, Math.min(7, e.step || 0) / 12); for (let i = 0; i < n; i++) tone(f_(base * [1, 1.25, 1.5, 2, 2.5, 3][i]), t0 + i * 0.055, 0.32, SK.lead, 0.06, 0, 0.004); tone(f_(base / 2), t0, 0.4, SK.soft, 0.09); },
    burst: (t0) => { burst(t0, 0.45, 6500, 900, 0.22, 1.1, 'highpass'); tone(f_(1568), t0, 0.35, SK.lead, 0.05, 1.5); tone(f_(2093), t0 + 0.04, 0.3, SK.lead, 0.04); burst(t0, 0.18, 1200, 200, 0.12, 0.8, 'lowpass'); },
    strike: (t0) => { if (useSample()) { hit(t0, 0.97 + 0.06 * Math.random(), 0.95); tone(58, t0, 0.55, 'sine', 0.16, 0.5, 0.004); } else thunder(t0, 0.85); burst(t0, 0.16, 700, 220, 0.1, 1.5); duck(t0, 0.5, 0.9); },
    slam: (t0) => { if (useSample()) { hit(t0, 1, 0.8); hit(t0 + 0.03, 0.72, 0.7, -0.3); hit(t0 + 0.09, 0.55, 0.5, 0.3); } else thunder(t0, 1.1); tone(110, t0, 1.5, 'sine', 0.3, 0.26, 0.004); duck(t0, 0.35, 1.3); },
    mult: (t0, e) => { tone(f_(392), t0, 0.14, SK.lead, 0.09); tone(f_(784), t0 + 0.05, 0.3, SK.lead, 0.1); tone(f_(1568 * (e.v >= 10 ? 1.25 : 1)), t0 + 0.1, 0.35, SK.lead, 0.07); burst(t0, 0.25, 600, 4000, 0.12, 1.6); },
    pay: (t0, e) => { const n = Math.min(16, 5 + Math.floor(Math.log10(Math.max(100, e.xs * 100)) * 3)); for (let i = 0; i < n; i++) { const at = t0 + 0.05 + i * 0.05; tone(f_(1900 + 380 * (i % 3) + 40 * Math.random()), at, 0.08, SK.lead, 0.045); tone(f_(2850 + 380 * (i % 3)), at + 0.02, 0.07, SK.lead, 0.02); } },
    charge: (t0, e) => { const k = e.n || 1; tone(f_(110 * (1 + 0.2 * k)), t0, 0.7, 'sawtooth', 0.07, 1.8 + 0.3 * k, 0.12); burst(t0, 0.6, 400, 4200, 0.1 + 0.03 * k, 3); tone(f_(660 + 110 * k), t0 + 0.05, 0.25, SK.lead, 0.07); },
    nice: (t0) => [659, 784, 988, 1319].forEach((f, i) => tone(f_(f), t0 + i * 0.07, 0.4, SK.lead, 0.07)),
    lose: (t0) => { tone(f_(196), t0, 0.35, SK.soft, 0.12, 0.7); tone(f_(147), t0 + 0.12, 0.45, SK.soft, 0.1, 0.7); },
    bet: (t0) => { tone(f_(1200), t0, 0.05, SK.lead, 0.06); tone(f_(1800), t0 + 0.03, 0.06, SK.lead, 0.04); },
    turbo: (t0) => burst(t0, 0.18, 800, 3200, 0.1, 1.5),
    title: (t0, e) => { burst(t0, 0.9, 1400, 80, 0.5, 0.6, 'lowpass'); tone(f_(65), t0, 0.9, 'sine', 0.45, 0.6); [392, 494, 587, 784].forEach((f, i) => tone(f_(f * (1 + 0.12 * (e.n || 0))), t0 + i * 0.03, 0.8, 'sawtooth', 0.045)); burst(t0 + 0.02, 0.5, 1800, 600, 0.08, 0.8, 'bandpass'); duck(t0, 0.6, 0.5); },
    skip: (t0) => burst(t0, 0.15, 1500, 400, 0.1, 1),
    end: (t0) => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f_(f), t0 + i * 0.09, 0.5, SK.soft, 0.1)); },
  };
  window.AUDIO = {
    mute: (m) => { muted = m; if (out) out.gain.value = m ? 0 : 0.8; },
    sfx: (name, e) => { if (ac && SFX[name]) SFX[name](ac.currentTime + 0.02, e || {}); },
    bands: () => { if (!an) return null; const f = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(f); const hz = ac.sampleRate / an.fftSize, B = [0, 0, 0, 0];
      for (let i = 1; i < f.length; i++) { const w = Math.pow(10, f[i] / 10), fr = i * hz; B[fr < 150 ? 0 : fr < 500 ? 1 : fr < 2000 ? 2 : 3] += w; } return B; },
    info: () => ({ mode, loaded: Object.keys(buf), state: ac && ac.state, playing: Object.keys(cur) }),
    level: () => (an ? (an.getByteTimeDomainData(anBuf), Math.max.apply(null, Array.from(anBuf).map((v) => Math.abs(v - 128))) / 128) : 0),          // debug/QA: peak of the master bus
    tick: (S) => {
      if (!ac || !S) return; const now = ac.currentTime;
      if (S.t < last) { stopAll(now); started = false; mode = ''; lastBig = -1; }                              // restart / replay: the loop starts over
      if (!started && S.firstIn >= 0 && ac.state === 'running') { musicTo('loop', now, 0.5); started = !!mode; }
      for (const e of S.ev) { if (e.t <= last) continue;
        if (SFX[e.k]) SFX[e.k](now, e);
        if (e.k === 'slam') musicTo('drop', now, 0.03);
        else if (e.k === 'bigstart') musicTo('epic', now, 0.03);
        else if (e.k === 'end' && cur.epic) { cur.epic.g.gain.cancelScheduledValues(now); cur.epic.g.gain.setTargetAtTime(MV.epic * 0.6, now, 0.4); } }
      if (S.phase === 'big' || S.phase === 'over') {                              // coin ticks follow the counter
        const v = SM.bigValue(S), step = Math.max(1, S.spinWin / 70), q = Math.floor(v / step); if (q !== lastBig && now - tickAt > 0.045) { tone(f_(1500 + 700 * ((q % 5) / 5)), now, 0.05, SK.lead, 0.05); tickAt = now; } lastBig = q; }
      // the filter opens with the storm: dull and distant at dusk, bright and wide when the sky breaks
      musicLP.frequency.setTargetAtTime(2600 + 14000 * Math.min(1, (S.storm || 0) * 1.6), now, 0.4);
      last = S.t;
    },
  };
  let an = null, anBuf = null; const hookMeter = setInterval(() => { if (out && !an) { an = ac.createAnalyser(); an.fftSize = 1024; anBuf = new Uint8Array(1024); out.connect(an); clearInterval(hookMeter); } }, 300);
})();
