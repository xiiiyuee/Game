  /* =====================================================================
   * 13. 子弹 / 碰撞
   * ===================================================================*/
  // 统一伤害结算：暴击反馈、伤害数字、死亡处理
  function hurtEnemy(e, dmg, crit, silent, ownerId) {
    if (e.dead) return;
    // Boss「分裂护盾」：先消耗护盾层
    if (e.isBoss && e.shield > 0) {
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      dmg -= absorbed;
      emit(e.x, e.y, 4, THEME.cyanSoft, 150, 2, 0.3);
      if (e.shield <= 0) {
        e.shield = 0;
        addText(e.x, e.y - e.r - 18, "护盾碎裂", THEME.cyanSoft, 15);
        emit(e.x, e.y, 22, THEME.cyanSoft, 260, 3.2, 0.6);
      }
      if (dmg <= 0) return;
    }
    if (e.armor) dmg *= 1 - e.armor;
    e.hp -= dmg;
    if (ownerId) {
      e.lastHit = ownerId;                 // 个人伤害 / 击杀归属（P4-07）
      const op = coopPlayerById(ownerId);
      if (op) op.damage += Math.max(0, dmg);
    }
    if (silent) {
      emit(e.x, e.y, 3, "#ffd08a", 140, 2, 0.28);
    } else {
      emit(e.x, e.y, crit ? 10 : 5, crit ? "#ffc857" : "#9ff8ff", crit ? 200 : 130, crit ? 3 : 2.2, 0.4);
      addText(e.x, e.y - e.r - 4, (crit ? "暴击 " : "") + Math.round(dmg), crit ? "#ffc857" : "#cfefff", crit ? 16 : 12);
      if (crit) shake = Math.max(shake, 3 * CFG.FX.SHAKE);
      sfxHit();
    }
    if (e.hp <= 0) killEnemy(e);
  }

  // 进化「裂变弹」：命中点爆炸
  function explodeAt(x, y, dmg, source, radius, color, ownerId) {
    const R = (radius || 60) * view.scale;
    emit(x, y, 14, color || THEME.gold, 240, 3, 0.5);
    for (let i = 0; i < enemies.length; i++) {
      const o = enemies[i];
      if (o.dead || o === source) continue;
      const rr = R + o.r;
      if (dist2(x, y, o.x, o.y) <= rr * rr) {
        hurtEnemy(o, dmg, false, true, ownerId);
        if (state !== "playing") return;
      }
    }
  }

  // 进化「裂变轨道」：命中后分裂一枚追踪碎片
  function spawnRailShard(b, hit) {
    if (bullets.length >= CFG.LIMITS.BULLETS) return;
    let best = null;
    let bestD = (340 * view.scale) * (340 * view.scale);
    for (let i = 0; i < enemies.length; i++) {
      const o = enemies[i];
      if (o.dead || o === hit) continue;
      const d = dist2(b.x, b.y, o.x, o.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) return;
    const ang = Math.atan2(best.y - b.y, best.x - b.x);
    const sp = stats.bulletSpeed * view.scale * 0.95;
    bullets.push({
      bid: nextBulletId++,
      owner: b.owner,
      x: b.x, y: b.y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      r: 3, dmg: b.dmg * 0.5, pierce: 0, life: 0.9,
      dead: false, hit: new Set(), ang,
      color: THEME.violet, shard: true,
    });
    emit(b.x, b.y, 4, THEME.violet, 140, 2, 0.25);
  }

  function updateBullets(dt) {
    const slow = ultTimer > 0 ? CFG.ULT.SLOW : 1;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];

      if (b.synced) {
        // 联机客户端：远端玩家子弹按最新快照平滑插值
        const k = Math.min(1, dt * 18);
        b.x += (b.tx - b.x) * k;
        b.y += (b.ty - b.y) * k;
        continue;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // 大世界不再做镜面反弹：飞出世界或超时即销毁
      if (b.x < 0 || b.x > world.w || b.y < 0 || b.y > world.h) b.dead = true;

      if (!b.dead) {
        // 与敌人碰撞（每个敌人只结算一次）
        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (e.dead) continue;
          if (b.hit.has(e.id)) continue;
          const rr = b.r + e.r;
          if (dist2(b.x, b.y, e.x, e.y) <= rr * rr) {
            b.hit.add(e.id);
            const crit = Math.random() < stats.crit;
            const dmg = b.dmg * (crit ? stats.critMult : 1);
            hurtEnemy(e, dmg, crit, false, b.owner);
            if (state === "playing") {
              if (stats.explodeOnHit) explodeAt(b.x, b.y, b.dmg * 0.6, e, undefined, undefined, b.owner);
              if (stats.pulseBlast) explodeAt(b.x, b.y, b.dmg * 0.45, e, 56, THEME.cyanSoft, b.owner);
              if (stats.scatterBlast) explodeAt(b.x, b.y, b.dmg * 0.35, e, 38, THEME.gold, b.owner);
              if (stats.railShard && !b.shard) spawnRailShard(b, e);
            }

            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              b.dead = true;
              break;
            }
          }
        }
      }

      // 与小怪弹幕对撞：可击落（Boss 重型弹不可击落）
      if (!b.dead) {
        for (let j = ebullets.length - 1; j >= 0; j--) {
          const eb = ebullets[j];
          if (eb.dead || eb.heavy) continue;
          const rr = b.r + eb.r;
          if (dist2(b.x, b.y, eb.x, eb.y) <= rr * rr) {
            eb.dead = true;
            emit(eb.x, eb.y, 5, "#b9f7ff", 150, 2, 0.28);
            addEnergy(0.6);
            if (b.pierce > 0) b.pierce -= 1;
            else { b.dead = true; break; }
          }
        }
      }

      // 与能量水晶碰撞（可打碎）
      if (!b.dead) {
        for (let j = 0; j < crystals.length; j++) {
          const c = crystals[j];
          if (b.hit.has("c" + c.id)) continue;
          const rr = b.r + c.r;
          if (dist2(b.x, b.y, c.x, c.y) <= rr * rr) {
            b.hit.add("c" + c.id);
            c.hp -= b.dmg;
            c.flash = 0.18;
            emit(b.x, b.y, 6, "#8ff6ff", 180, 2.4, 0.4);
            sfxHit();
            if (c.hp <= 0) destroyCrystal(c);
            if (b.pierce > 0) b.pierce -= 1;
            else { b.dead = true; break; }
          }
        }
      }

      // 与陨石碰撞（可击碎）
      if (!b.dead) {
        for (let j = 0; j < asteroids.length; j++) {
          const a = asteroids[j];
          if (b.hit.has("a" + a.id)) continue;
          const rr = b.r + a.r;
          if (dist2(b.x, b.y, a.x, a.y) <= rr * rr) {
            b.hit.add("a" + a.id);
            a.hp -= b.dmg;
            a.flash = 0.16;
            emit(b.x, b.y, 6, "#ffd6a0", 170, 2.4, 0.4);
            sfxHit();
            if (a.hp <= 0) destroyAsteroid(a);
            if (b.pierce > 0) b.pierce -= 1;
            else { b.dead = true; break; }
          }
        }
      }

      if (b.dead || b.life <= 0) bullets.splice(i, 1);
    }

    // 敌方子弹（超载期间减速）
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i];
      if (b.synced) continue;                 // 联机客户端：敌弹由房主同步
      b.x += b.vx * dt * slow;
      b.y += b.vy * dt * slow;
      b.life -= dt * slow;

      // 命中任意存活玩家；玩家之间无友伤
      for (let k = 0; k < players.length; k++) {
        const p = players[k];
        if (p.down || p.eliminated) continue;
        const rr = b.r + p.r;
        if (dist2(b.x, b.y, p.x, p.y) <= rr * rr) {
          damagePlayer(b.dmg, p);
          b.dead = true;
          emit(b.x, b.y, 8, b.color, 160, 2.4, 0.4);
          break;
        }
      }

      if (b.dead || b.life <= 0 || b.x < camera.x - 80 || b.x > camera.x + view.w + 80 ||
          b.y < camera.y - 80 || b.y > camera.y + view.h + 80) {
        ebullets.splice(i, 1);
      }
    }
  }

