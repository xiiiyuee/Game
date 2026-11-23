  /* =====================================================================
   * 13.5 子弹 / 碰撞
   * ===================================================================*/
  // 统一伤害结算：暴击反馈、伤害数字、死亡处理
  function hurtEnemy(e, dmg, crit, silent, ownerId, ang) {
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
      if (op) {
        op.damage += Math.max(0, dmg);
        gainSkillEnergy(op, CFG.SKILL.HIT_GAIN);   // 命中返技能能量
      }
    }

    // 受击闪白 + 分档反馈（P0）：普通命中轻，暴击/精英/Boss 重
    const heavy = !!(e.isBoss || e.type === "diamond");
    const hasDir = typeof ang === "number";
    const punch = heavy && (e.fxCd || 0) <= 0;   // 重击反馈限频，避免高射速下持续震屏/顿帧
    if (punch) e.fxCd = e.isBoss ? 0.22 : 0.14;
    e.hitFlash = Math.max(e.hitFlash || 0, silent ? 0.55 : 1);

    if (silent) {
      emit(e.x, e.y, heavy ? 5 : 3, "#ffd08a", heavy ? 170 : 140, 2, 0.28);
    } else {
      const n = crit ? 12 : heavy ? 9 : 5;
      const sp = crit ? 230 : heavy ? 195 : 145;
      const color = crit ? "#ffc857" : "#9ff8ff";
      if (hasDir) emitDir(e.x, e.y, n, color, ang, crit ? 0.5 : 0.75, sp, crit ? 3 : 2.2, 0.4);
      else emit(e.x, e.y, n, color, sp * 0.85, crit ? 3 : 2.2, 0.4);
      addText(e.x + rand(-3, 3), e.y - e.r - 4, (crit ? "暴击 " : "") + Math.round(dmg), crit ? "#ffc857" : "#cfefff", crit ? 17 : 12);

      const shakeAdd = punch ? 1.5 : crit ? 0.9 : 0;
      if (shakeAdd > 0) {
        shake = Math.max(shake, shakeAdd * CFG.FX.SHAKE);
        if (hasDir) { shakeDirX = Math.cos(ang); shakeDirY = Math.sin(ang); }
      }
      sfxHit(crit, punch);

      // 顿帧：单机暴击/重击；联机房主只对精英/Boss，客户端不冻结本地操作
      if (!roomCode) {
        if (e.isBoss) hitStop = Math.max(hitStop, 0.05);
        else if (heavy) hitStop = Math.max(hitStop, 0.03);
        else if (crit) hitStop = Math.max(hitStop, 0.022);
      } else if (!coopIsGuest() && punch) {
        hitStop = Math.max(hitStop, 0.028);
      }
    }

    // 轻击退：房主结算位置后随快照同步；Boss 与冲刺中的精英免疫
    if (!silent && hasDir && !e.isBoss && !e.synced) {
      if (e.type !== "diamond" || (e.dashTime || 0) <= 0) {
        const kb = (e.type === "diamond" ? 70 : 150) * (crit ? 1.35 : 1);
        e.kbx = (e.kbx || 0) + Math.cos(ang) * kb;
        e.kby = (e.kby || 0) + Math.sin(ang) * kb;
      }
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
            hurtEnemy(e, dmg, crit, false, b.owner, b.ang);
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

      // 擦弹回流：在命中判定前吸收近距离掠过的敌弹（房主裁决）
      if (!coopIsGuest() && !b.heavy) {
        let grazed = false;
        for (let k = 0; k < players.length; k++) {
          const p = players[k];
          if (p.down || p.eliminated || !(p.grazeActive > 0)) continue;
          const gr = p.r + CFG.SKILL.GRAZE.RADIUS;
          if (dist2(b.x, b.y, p.x, p.y) <= gr * gr) {
            grazeAbsorb(p, b);
            b.dead = true;
            grazed = true;
            break;
          }
        }
        if (grazed) { ebullets.splice(i, 1); continue; }
      }

      // 命中防线：炮塔/缓速场会替玩家挡弹并被破坏
      if (!b.dead) {
        const d = defenseAt(b.x, b.y, b.r);
        if (d) {
          hurtDefense(d, b.dmg, null);
          b.dead = true;
          emit(b.x, b.y, 6, "#ffb3a0", 150, 2.4, 0.32);
        }
      }

      // 命中任意存活玩家；玩家之间无友伤
      if (!b.dead) {
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
      }

      if (b.dead || b.life <= 0 || b.x < camera.x - 80 || b.x > camera.x + view.w + 80 ||
          b.y < camera.y - 80 || b.y > camera.y + view.h + 80) {
        ebullets.splice(i, 1);
      }
    }
  }

