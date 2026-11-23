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

  function tone(freq, to, dur, type, vol, filterHz, bus) {
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
    gain.connect(bus || audio.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noiseBurst(dur, vol, filterFrom, filterTo, bus) {
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
    g.connect(bus || audio.sfx);
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

  // ===== 激光与濒危反馈 =====
  let lastLaserChargeSfx = 0;
  function sfxLaserCharge(dur) {
    if (!audio.ctx || audio.muted) return;
    const now = performance.now();
    if (now - lastLaserChargeSfx < 260) return;   // 多道激光同时蓄力时不叠爆音
    lastLaserChargeSfx = now;
    const d = Math.min(Math.max(dur || 1.1, 0.45), 1.2);
    tone(150, 920, d, "sawtooth", 0.06, 2600);
    tone(240, 1240, d, "square", 0.026, 3200);
  }
  function sfxLaserFire() {
    if (!audio.ctx || audio.muted) return;
    tone(1300, 90, 0.24, "sawtooth", 0.17, 3400);
    noiseBurst(0.18, 0.16, 3800, 380);
  }
  function sfxLaserBreak() {
    if (!audio.ctx || audio.muted) return;
    tone(660, 170, 0.16, "triangle", 0.09, 2200);
  }
  function sfxShieldBreak() {
    if (!audio.ctx || audio.muted) return;
    tone(1040, 210, 0.2, "square", 0.09, 4400);
    noiseBurst(0.16, 0.12, 5600, 900);
  }
  function sfxClimax() {
    if (!audio.ctx || audio.muted) return;
    tone(72, 46, 0.85, "sawtooth", 0.16, 360);
    setTimeout(() => {
      if (audio.ctx && !audio.muted) tone(120, 260, 0.45, "square", 0.06, 1800);
    }, 110);
    noiseBurst(0.6, 0.1, 900, 140);
  }
  function sfxSquad() {
    if (!audio.ctx || audio.muted) return;
    tone(300, 420, 0.12, "square", 0.06, 1800);
    setTimeout(() => {
      if (audio.ctx && !audio.muted) tone(420, 300, 0.14, "square", 0.05, 1600);
    }, 90);
  }
  function sfxBeamStart() {
    if (!audio.ctx || audio.muted) return;
    tone(180, 920, 0.3, "sawtooth", 0.12, 3200);
    noiseBurst(0.25, 0.12, 3000, 500);
  }
  let lastBeamTickSfx = 0;
  function sfxBeamTick() {
    if (!audio.ctx || audio.muted) return;
    const now = performance.now();
    if (now - lastBeamTickSfx < 150) return;
    lastBeamTickSfx = now;
    noiseBurst(0.07, 0.05, 4200, 1200);
  }
  function sfxHeartbeat(intense) {
    if (!audio.ctx || audio.muted) return;
    tone(64, 40, 0.14, "sine", intense ? 0.17 : 0.11, 220);
    setTimeout(() => {
      if (audio.ctx && !audio.muted) tone(56, 35, 0.12, "sine", intense ? 0.12 : 0.08, 200);
    }, 130);
  }

  // 移动端触觉反馈（桌面端 navigator.vibrate 不存在，自动跳过）
  function haptic(pattern) {
    if (!document.body.classList.contains("touch")) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
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

  // ===== 动态音乐：低音铺底 + 随压力收紧的节拍与琶音 =====
  let droneNodes = null;
  let musicIntensity = 0.12;   // 平滑后的音乐强度 0..1
  let musicBeat = 0;           // 节拍计时
  let musicBeatIdx = 0;
  let musicArpIdx = 0;

  const MUSIC_SCALE = [0, 3, 5, 7, 10];       // 小调五声音阶
  const MUSIC_BOSS_SCALE = [0, 1, 5, 6, 8];   // Boss 战半音压迫音阶

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

  // 目标强度：威胁等级为主，章节 / 高潮波 / Boss 逐层叠加
  function musicTarget() {
    const maxT = typeof threatMax === "function" ? threatMax() : CFG.THREAT.MAX;
    let t = 0.12 + clamp((threat || 0) / Math.max(1, maxT), 0, 1) * 0.5;
    t += Math.min(0.16, Math.max(0, (chapter - 1)) * 0.03);
    if (boss && !boss.dead) t = Math.max(t, 0.88);
    else if (waveNum >= 8) t += 0.12;
    return clamp(t, 0, 1);
  }

  function updateMusic(dt) {
    if (state !== "playing") return;
    // 强度平滑，避免章节切换时音乐突然跳变（无音频上下文时也保持可测）
    musicIntensity += (musicTarget() - musicIntensity) * Math.min(1, dt * 0.5);
    if (!audio.ctx || audio.muted) return;

    const k = musicIntensity;
    const inBoss = !!(boss && !boss.dead);
    if (droneNodes) {
      // 底噪随压力缓慢抬升，并加入轻微起伏
      const pump = 0.03 + 0.055 * k + 0.006 * Math.sin(performance.now() * 0.0012);
      droneNodes.g.gain.setTargetAtTime(pump, audio.ctx.currentTime, 0.25);
    }

    // 节拍：压力越大越快
    musicBeat -= dt;
    if (musicBeat > 0) return;
    musicBeat = inBoss ? 0.3 : 0.64 - 0.3 * k;
    musicBeatIdx++;

    const root = inBoss ? 41.2 : 55;   // E1 / A1
    // 底鼓
    tone(120, 42, 0.16, "sine", 0.1 + 0.16 * k, 300, audio.music);
    // 反拍镲：中高压力才出现
    if (k > 0.3 && musicBeatIdx % 2 === 0) {
      noiseBurst(0.05, 0.05 + 0.05 * k, 9000, 4200, audio.music);
    }
    // 低音线：每两拍换音
    if (musicBeatIdx % 2 === 0) {
      const scale = inBoss ? MUSIC_BOSS_SCALE : MUSIC_SCALE;
      const semi = scale[Math.floor(musicBeatIdx / 2) % scale.length];
      const f = root * Math.pow(2, semi / 12);
      tone(f, f, 0.42, "triangle", 0.1 + 0.06 * k, 700, audio.music);
    }
    // 琶音：强度越高越密、音区越高
    const arpEvery = k > 0.66 ? 1 : 2;
    if (musicBeatIdx % arpEvery === 0) {
      const scale = inBoss ? MUSIC_BOSS_SCALE : MUSIC_SCALE;
      const semi = scale[musicArpIdx % scale.length] + (k > 0.55 ? 12 : 0);
      musicArpIdx++;
      const f = (inBoss ? 82.4 : 110) * 2 * Math.pow(2, semi / 12);
      tone(f, f, 0.2, "sine", 0.03 + 0.05 * k, 2600, audio.music);
    }
    // Boss：每四拍叠一层不谐和长音
    if (inBoss && musicBeatIdx % 4 === 0) {
      tone(311, 233, 0.5, "sawtooth", 0.028, 1400, audio.music);
    }
  }

