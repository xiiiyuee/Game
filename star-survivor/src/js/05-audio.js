  /* =====================================================================
   * 4. 音效（Web Audio 实时合成，开始游戏后初始化）
   * ===================================================================*/
  const audio = { ctx: null, master: null, sfx: null, music: null, noise: null, muted: false };
  let lastShootSfx = 0;
  let lastHitSfx = 0;
  let lastExplodeSfx = 0;

  function initAudio() {
    if (audio.ctx) {
      if (audio.ctx.state === "suspended") audio.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    const master = ac.createGain();
    master.gain.value = audio.muted ? 0 : CFG.AUDIO.MASTER;
    master.connect(ac.destination);

    const sfx = ac.createGain();
    sfx.gain.value = CFG.AUDIO.SFX;
    sfx.connect(master);

    const music = ac.createGain();
    music.gain.value = CFG.AUDIO.MUSIC;
    music.connect(master);

    // 预生成白噪声，供爆炸音使用
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.4), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    audio.ctx = ac;
    audio.master = master;
    audio.sfx = sfx;
    audio.music = music;
    audio.noise = buf;

    startDrone();
  }

  function tone(freq, to, dur, type, vol, filterHz) {
    if (!audio.ctx || audio.muted) return;
    const ac = audio.ctx;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (to && to !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, to), t0 + dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let tail = osc;
    if (filterHz) {
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = filterHz;
      osc.connect(f);
      tail = f;
    }
    tail.connect(gain);
    gain.connect(audio.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noiseBurst(dur, vol, filterFrom, filterTo) {
    if (!audio.ctx || audio.muted) return;
    const ac = audio.ctx;
    const t0 = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = audio.noise;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(filterFrom, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(120, filterTo), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(audio.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function sfxShoot() {
    if (!audio.ctx || audio.muted) return;
    const now = performance.now();
    if (now - lastShootSfx < 45) return;   // 限制射击音频率，避免刺耳
    lastShootSfx = now;
    tone(880, 520, 0.06, "triangle", 0.09, 3200);
  }
  function sfxHit(crit, heavy) {
    if (!audio.ctx || audio.muted) return;
    const now = performance.now();
    if (now - lastHitSfx < (heavy ? 55 : 32)) return;   // 独立限流，避免被射击音吞掉
    lastHitSfx = now;
    const base = crit ? 430 : 310;
    tone(base, base * 0.62, crit ? 0.05 : 0.035, "square", crit ? 0.05 : 0.032, 2600);
    if (heavy) tone(120, 62, 0.12, "sawtooth", 0.06, 480);   // 重击低频层
  }
  function sfxExplode(big) {
    if (!audio.ctx || audio.muted) return;
    if (!big) {
      const now = performance.now();
      if (now - lastExplodeSfx < 40) return;   // 后期大量击杀时限流，避免音频线程过载
      lastExplodeSfx = now;
    }
    noiseBurst(big ? 0.55 : 0.22, big ? 0.5 : 0.22, 1600, 120);
    if (big) tone(90, 40, 0.5, "sawtooth", 0.18, 400);
  }
  function sfxLevelUp() {
    if (!audio.ctx || audio.muted) return;
    tone(523, 523, 0.12, "sine", 0.16, 4000);
    setTimeout(() => tone(659, 659, 0.12, "sine", 0.16, 4000), 90);
    setTimeout(() => tone(784, 784, 0.18, "sine", 0.16, 4000), 180);
  }
  function sfxHurt() {
    if (!audio.ctx || audio.muted) return;
    tone(160, 70, 0.22, "sawtooth", 0.18, 700);
  }
  function sfxDash() {
    if (!audio.ctx || audio.muted) return;
    tone(220, 940, 0.13, "sine", 0.1, 4000);
  }
  function sfxBoss() {
    if (!audio.ctx || audio.muted) return;
    tone(70, 38, 1.1, "sawtooth", 0.22, 320);
    noiseBurst(0.8, 0.2, 900, 100);
  }
  function sfxUlt() {
    if (!audio.ctx || audio.muted) return;
    tone(180, 720, 0.35, "sawtooth", 0.13, 3000);
    setTimeout(() => tone(760, 240, 0.35, "sine", 0.11, 4000), 90);
    noiseBurst(0.3, 0.18, 2400, 200);
  }
  function sfxWin() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, 0.22, "triangle", 0.16, 5000), i * 120));
  }
  function sfxLose() {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, f * 0.9, 0.3, "sawtooth", 0.12, 900), i * 150));
  }

  // 低音持续背景 + 循环琶音
  let droneNodes = null;
  let musicTimer = 0;
  let musicStep = 0;
  const musicNotes = [110, 146.83, 164.81, 146.83, 130.81, 98, 130.81, 164.81];

  function startDrone() {
    if (!audio.ctx || droneNodes) return;
    const ac = audio.ctx;
    const g = ac.createGain();
    g.gain.value = 0.035;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    const o1 = ac.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 55;
    const o2 = ac.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = 82.4;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(audio.music);
    o1.start();
    o2.start();
    droneNodes = { o1, o2, g };
  }

  function updateMusic(dt) {
    if (!audio.ctx || state !== "playing" || audio.muted) return;
    musicTimer -= dt;
    if (musicTimer <= 0) {
      musicTimer = 0.42;
      const f = musicNotes[musicStep % musicNotes.length];
      musicStep++;
      tone(f, f, 0.24, "sine", 0.05, 1800);
    }
  }

