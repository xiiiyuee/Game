  /* =====================================================================
   * 16. 更新主逻辑
   * ===================================================================*/
  function update(dt) {
    const rawDt = dt;

    // Boss 击杀特写：慢动作 + 延迟进入下一星域
    if (victoryTimer > 0) {
      victoryTimer -= rawDt;
      victoryFlash = Math.max(0, victoryFlash - rawDt * 0.75);
      if (victoryTimer <= 0) {
        chapterClear();
        return;
      }
    }
    if (slowmo > 0) {
      slowmo = Math.max(0, slowmo - rawDt);
      dt *= 0.3;
    }
    // 命中顿帧：短暂冻结世界更新，强化打击反馈
    if (hitStop > 0) {
      hitStop = Math.max(0, hitStop - rawDt);
      return;
    }

    elapsed += dt;
    if (ultTimer > 0) ultTimer = Math.max(0, ultTimer - dt);

    // 连杀保持计时
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }

    // 进化「虚空回响」：周期环形弹幕
    if (stats.echoBurst) {
      echoTimer -= dt;
      if (echoTimer <= 0) {
        echoTimer = 4;
        echoBurstFire();
      }
    }

    // 波次推进（每章独立计时）
    const newWave = Math.min(
      CFG.RUN.CHAPTER_WAVES,
      1 + Math.floor((elapsed - chapterStartElapsed) / CFG.WAVE.INTERVAL)
    );
    if (newWave !== waveNum) {
      waveNum = newWave;
      const cx = camera.x + view.w / 2;
      const cy = camera.y + view.h * 0.28;
      if (waveNum >= CFG.RUN.CHAPTER_WAVES) {
        addText(cx, cy, "虚空之眼逼近", "#ff4d6d", 24);
      } else {
        addText(cx, cy, "第 " + waveNum + " 波", "#7ef0ff", 22);
      }
      if (waveNum % CFG.RUN.SHOP_WAVE === 0 && waveNum !== lastShopWave) {
        lastShopWave = waveNum;
        openShop("第 " + chapter + " 星域 · 第 " + waveNum + " 波补给");
        return;
      }
    }
    if (!bossSpawned && waveNum >= CFG.RUN.CHAPTER_WAVES) spawnBoss();

    updateSpawner(dt);
    updateEvents(dt);
    updateCores(dt);
    if (state !== "playing") { updateParticles(dt); return; }

    updatePlayer(dt);
    updateCamera(dt);
    if (state !== "playing") return;

    updateDrones(dt, elapsed);
    updateDefenses(dt);
    updateEnemies(dt, elapsed);
    if (state !== "playing") { updateParticles(dt); return; }

    updateBullets(dt);
    if (state !== "playing") { updateParticles(dt); return; }

    updateGems(dt);
    if (state !== "playing") { updateParticles(dt); return; }

    updateParticles(dt);
    updateMusic(dt);

    shake *= Math.pow(0.0009, dt);
    if (shake < 0.15) shake = 0;
    hurtFlash = Math.max(0, hurtFlash - dt * 2.8);

    // HUD 约 12Hz 刷新即可，避免每帧多次触发样式计算
    hudAcc += dt;
    if (hudAcc >= 0.08) {
      hudAcc = 0;
      refreshHud();
    }
  }

