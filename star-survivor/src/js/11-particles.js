  /* =====================================================================
   * 9. 粒子 / 飘字 / 经验球
   * ===================================================================*/
  function emit(x, y, count, color, speed, size, life) {
    const cap = lowFx ? 120 : CFG.LIMITS.PARTICLES;
    if (lowFx) count = Math.ceil(count * 0.4);
    for (let i = 0; i < count; i++) {
      if (particles.length >= cap) break;
      const a = Math.random() * TAU;
      const sp = rand(0.25, 1) * speed;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.6, 1) * life,
        max: life,
        size: rand(0.5, 1.3) * size,
        color,
      });
    }
  }

  function addText(x, y, str, color, size) {
    if (texts.length >= CFG.LIMITS.NUMBERS) texts.shift();
    texts.push({ x, y, text: str, color, size: size || 13, life: 0.75, vy: -46 });
  }

  function spawnGem(x, y, value) {
    if (gems.length >= CFG.LIMITS.GEMS) {
      gems[gems.length - 1].value += value;
      return;
    }
    const a = Math.random() * TAU;
    gems.push({
      x, y,
      vx: Math.cos(a) * rand(20, 70),
      vy: Math.sin(a) * rand(20, 70),
      value,
      r: 4.5,
      pulse: Math.random() * TAU,
    });
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.y += t.vy * dt;
      t.vy *= 0.92;
      t.life -= dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
  }

  function updateGems(dt) {
    if (coopIsGuest()) {                 // 联机客户端：经验球位置由房主同步
      for (let i = 0; i < gems.length; i++) gems[i].pulse = (gems[i].pulse || 0) + dt * 4;
      return;
    }
    const pickup = CFG.XP.PICKUP * view.scale;
    const collect = CFG.XP.COLLECT;
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      g.pulse += dt * 4;
      // 个人拾取（P4-04）：每颗球归最近的可行动玩家
      let target = null;
      let best = Infinity;
      for (let k = 0; k < players.length; k++) {
        const q = players[k];
        if (q.eliminated) continue;
        const dd = dist2(q.x, q.y, g.x, g.y);
        if (dd < best) { best = dd; target = q; }
      }
      if (!target) continue;
      const d = Math.sqrt(best);
      if (d < pickup) {
        const pull = 420 + (pickup - d) * 3.2;
        const ang = Math.atan2(target.y - g.y, target.x - g.x);
        g.x += Math.cos(ang) * pull * dt;
        g.y += Math.sin(ang) * pull * dt;
      } else {
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.vx *= 0.94;
        g.vy *= 0.94;
      }
      if (d < collect) {
        gems.splice(i, 1);
        gainXpFor(target, Math.max(1, Math.round(g.value * target.stats.xpMul)));
        if (state !== "playing" && !roomCode) return;   // 单机升级界面打开后停止本帧后续
      }
    }
  }

