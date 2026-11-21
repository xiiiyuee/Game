  /* =====================================================================
   * 1.5 霓虹涂装（可在设置中切换，T 键快速循环）
   * ===================================================================*/
  const THEMES = {
    neon: {
      name: "霓虹脉冲", desc: "青蓝 × 品红 × 紫",
      cyan: "#3fe5ff", cyanSoft: "#a5f8ff", cyanDeep: "#1e8fb0",
      danger: "#ff4d6d", orange: "#ff9f2e", violet: "#b06bff", gold: "#ffd166",
      mint: "#6dffc9", magenta: "#ff3ea5",
      bgTop: "#0a1430", bgMid: "#070a1c", bgBottom: "#04060f",
      grid: "rgba(63,229,255,0.06)",
      starA: "#9ff0ff", starB: "#e0ecff",
      nebula: ["rgba(255,62,165,0.30)", "rgba(63,229,255,0.26)", "rgba(139,92,255,0.30)", "rgba(109,255,201,0.16)"],
      enemy: { tri: "#ff4f7b", square: "#5b8cff", penta: "#b06bff", diamond: "#ffb03a" },
      boss: "#ff3b6b",
      weapons: { pulse: "#3fe5ff", scatter: "#9ff8ff", rail: "#8ea6ff" },
      line: "rgba(63,229,255,0.18)", glow: "rgba(63,229,255,0.42)",
      panel: "rgba(7,13,30,0.9)",
      ov1: "rgba(18,42,72,0.88)", ov2: "rgba(3,6,13,0.94)",
    },
    synth: {
      name: "赛博紫", desc: "紫罗兰 × 霓虹粉",
      cyan: "#c08bff", cyanSoft: "#e8d6ff", cyanDeep: "#6b3fa0",
      danger: "#ff4f8b", orange: "#ff7ad9", violet: "#8b6bff", gold: "#ffd9a0",
      mint: "#5cf2d6", magenta: "#ff5edb",
      bgTop: "#160a2e", bgMid: "#0c051c", bgBottom: "#06030f",
      grid: "rgba(192,139,255,0.07)",
      starA: "#e3c9ff", starB: "#ffd6f4",
      nebula: ["rgba(255,94,219,0.30)", "rgba(139,107,255,0.30)", "rgba(92,242,214,0.18)", "rgba(255,79,139,0.22)"],
      enemy: { tri: "#ff5edb", square: "#7b6bff", penta: "#c08bff", diamond: "#ffd166" },
      boss: "#ff4f8b",
      weapons: { pulse: "#c08bff", scatter: "#ff9ce8", rail: "#8f9bff" },
      line: "rgba(192,139,255,0.2)", glow: "rgba(192,139,255,0.45)",
      panel: "rgba(14,7,30,0.9)",
      ov1: "rgba(45,18,72,0.88)", ov2: "rgba(8,3,16,0.94)",
    },
    toxic: {
      name: "生化绿", desc: "酸性绿 × 青柠",
      cyan: "#7dffb0", cyanSoft: "#d4ffe6", cyanDeep: "#2a9a63",
      danger: "#ff6b4a", orange: "#d4ff3f", violet: "#38e6c8", gold: "#e8ff6b",
      mint: "#b4ffda", magenta: "#9dff3f",
      bgTop: "#04180f", bgMid: "#03100a", bgBottom: "#020806",
      grid: "rgba(125,255,176,0.07)",
      starA: "#c9ffe0", starB: "#f0ffe8",
      nebula: ["rgba(125,255,176,0.26)", "rgba(212,255,63,0.22)", "rgba(56,230,200,0.24)", "rgba(255,107,74,0.14)"],
      enemy: { tri: "#ff6b4a", square: "#38e6c8", penta: "#d4ff3f", diamond: "#e8ff6b" },
      boss: "#ff6b4a",
      weapons: { pulse: "#7dffb0", scatter: "#d6ff8a", rail: "#5cf2d0" },
      line: "rgba(125,255,176,0.2)", glow: "rgba(125,255,176,0.45)",
      panel: "rgba(4,20,12,0.9)",
      ov1: "rgba(10,45,30,0.88)", ov2: "rgba(2,8,5,0.94)",
    },
    ember: {
      name: "熔火橙", desc: "琥珀 × 猩红",
      cyan: "#ffb347", cyanSoft: "#ffe0b0", cyanDeep: "#a85a1c",
      danger: "#ff3b3b", orange: "#ff7a2e", violet: "#ff2e63", gold: "#ffe08a",
      mint: "#ffd166", magenta: "#ff5e3a",
      bgTop: "#2a0d06", bgMid: "#170604", bgBottom: "#0b0302",
      grid: "rgba(255,179,71,0.07)",
      starA: "#ffd9a0", starB: "#ffe9d6",
      nebula: ["rgba(255,94,58,0.30)", "rgba(255,179,71,0.26)", "rgba(255,46,99,0.24)", "rgba(255,224,138,0.14)"],
      enemy: { tri: "#ff5e3a", square: "#ff9f2e", penta: "#ff2e63", diamond: "#ffe08a" },
      boss: "#ff3b3b",
      weapons: { pulse: "#ffb347", scatter: "#ffe08a", rail: "#ff7a2e" },
      line: "rgba(255,179,71,0.2)", glow: "rgba(255,179,71,0.45)",
      panel: "rgba(26,8,5,0.9)",
      ov1: "rgba(60,20,8,0.88)", ov2: "rgba(12,3,2,0.94)",
    },
    ice: {
      name: "极地冰", desc: "冰蓝 × 电光",
      cyan: "#7fdcff", cyanSoft: "#e0f9ff", cyanDeep: "#2a7ea8",
      danger: "#ff5f8a", orange: "#7fb2ff", violet: "#a99bff", gold: "#ffe9a8",
      mint: "#b8fff1", magenta: "#6ea8ff",
      bgTop: "#071a30", bgMid: "#04101f", bgBottom: "#020810",
      grid: "rgba(127,220,255,0.07)",
      starA: "#d6f6ff", starB: "#ffffff",
      nebula: ["rgba(110,168,255,0.28)", "rgba(184,255,241,0.22)", "rgba(169,155,255,0.26)", "rgba(127,220,255,0.22)"],
      enemy: { tri: "#ff5f8a", square: "#6ea8ff", penta: "#a99bff", diamond: "#ffe9a8" },
      boss: "#ff5f8a",
      weapons: { pulse: "#7fdcff", scatter: "#d6f6ff", rail: "#a99bff" },
      line: "rgba(127,220,255,0.2)", glow: "rgba(127,220,255,0.45)",
      panel: "rgba(5,16,30,0.9)",
      ov1: "rgba(10,35,60,0.88)", ov2: "rgba(2,7,14,0.94)",
    },
  };
  let themeKey = "neon";
  let THEME = THEMES.neon;

  function applyTheme(key, skipResize) {
    const th = THEMES[key] || THEMES.neon;
    themeKey = THEMES[key] ? key : "neon";
    THEME = th;
    const root = document.documentElement.style;
    root.setProperty("--cyan", th.cyan);
    root.setProperty("--cyan-soft", th.cyanSoft);
    root.setProperty("--cyan-deep", th.cyanDeep);
    root.setProperty("--red", th.danger);
    root.setProperty("--orange", th.orange);
    root.setProperty("--purple", th.violet);
    root.setProperty("--gold", th.gold);
    root.setProperty("--line", th.line);
    root.setProperty("--panel", th.panel);
    root.setProperty("--ov1", th.ov1);
    root.setProperty("--ov2", th.ov2);
    root.setProperty("--glow", th.glow);
    if (typeof glowCache !== "undefined") glowCache.clear();
    // 场上已有单位同步换色（子弹飞行时间短，保留原色）
    if (typeof enemies !== "undefined") {
      for (const e of enemies) e.color = e.isBoss ? THEME.boss : (THEME.enemy[e.type] || e.color);
    }
    if (typeof stats !== "undefined" && stats && typeof chosenWeapon !== "undefined") {
      stats.bulletColor = THEME.weapons[chosenWeapon] || stats.bulletColor;
    }
    document.querySelectorAll("[data-theme]").forEach((el) => {
      el.classList.toggle("active", el.dataset.theme === themeKey);
    });
    try { localStorage.setItem("sf_theme", themeKey); } catch (err) {}
    if (!skipResize) rebuildBackdrop();
  }

