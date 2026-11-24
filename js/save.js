window.AetherBastion = window.AetherBastion || {};

class AetherSaveManager {
  constructor() {
    this.PROG_KEY = 'aetherBastionV9_progression';
    this.SLOTS_KEY = 'aetherBastionV9_saveSlots';
  }

  loadProgression() {
    const fallback = {
      unlockedStageOrder: 1,
      stageClears: {},
      globalBestScore: 0
    };
    try {
      const raw = window.localStorage.getItem(this.PROG_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        unlockedStageOrder: Math.max(1, Number(parsed.unlockedStageOrder) || 1),
        stageClears: parsed.stageClears || {},
        globalBestScore: Math.max(0, Number(parsed.globalBestScore) || 0)
      };
    } catch (_) {
      return fallback;
    }
  }

  saveProgression(prog) {
    try {
      window.localStorage.setItem(this.PROG_KEY, JSON.stringify(prog));
    } catch (_) {}
  }

  recordStageClear(stageId, stageOrder, score, coreHp, maxCoreHp) {
    const prog = this.loadProgression();
    if (stageOrder + 1 > prog.unlockedStageOrder) {
      prog.unlockedStageOrder = Math.min(6, stageOrder + 1);
    }
    if (score > prog.globalBestScore) {
      prog.globalBestScore = score;
    }

    const ratio = maxCoreHp > 0 ? coreHp / maxCoreHp : 0;
    const stars = ratio >= 0.95 ? 3 : (ratio >= 0.65 ? 2 : 1);
    const rank = stars === 3 ? 'S' : (stars === 2 ? 'A' : 'B');
    const prev = prog.stageClears[stageId];
    const bestStars = prev && prev.stars > stars ? prev.stars : stars;
    const bestRank = bestStars === 3 ? 'S' : (bestStars === 2 ? 'A' : 'B');

    prog.stageClears[stageId] = {
      cleared: true,
      bestScore: Math.max(score, prev ? prev.bestScore : 0),
      stars: bestStars,
      rank: bestRank
    };
    this.saveProgression(prog);
    return { rank, stars };
  }

  updateGlobalBestScore(score) {
    const prog = this.loadProgression();
    if (score > prog.globalBestScore) {
      prog.globalBestScore = score;
      this.saveProgression(prog);
    }
  }

  loadAllSlots() {
    try {
      const raw = window.localStorage.getItem(this.SLOTS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (_) {
      return {};
    }
  }

  saveToSlot(slotId, snapshot) {
    const slots = this.loadAllSlots();
    slots[slotId] = snapshot;
    try {
      window.localStorage.setItem(this.SLOTS_KEY, JSON.stringify(slots));
      return true;
    } catch (_) {
      return false;
    }
  }

  deleteSlot(slotId) {
    const slots = this.loadAllSlots();
    delete slots[slotId];
    try {
      window.localStorage.setItem(this.SLOTS_KEY, JSON.stringify(slots));
    } catch (_) {}
  }

  createSnapshotFromGame(game, customLabel = '') {
    const { STAGES } = window.AetherBastion;
    const stage = STAGES[game.currentStageId] || STAGES.STAGE_1;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    return {
      version: 'V9',
      timestamp,
      label: customLabel || `${stage.name} · WAVE ${game.wave}`,
      stageId: game.currentStageId,
      stageName: stage.name,
      gameMode: game.gameMode,
      seedText: game.seedText,
      wave: game.wave,
      finalWave: stage.finalWave,
      aether: game.aether,
      totalAetherEarned: game.totalAetherEarned,
      totalAetherSpent: game.totalAetherSpent,
      coreHp: game.coreHp,
      maxCoreHp: game.maxCoreHp,
      score: game.score,
      kills: game.kills,
      reactionsTriggered: game.reactionsTriggered,
      reactionBreakdown: { ...game.reactionBreakdown },
      reactionDamageTotals: { ...game.reactionDamageTotals },
      routeMetrics: JSON.parse(JSON.stringify(game.routeMetrics)),
      openedBreachRoutes: [...game.openedBreachRoutes],
      destroyedPadIds: [...game.destroyedPadIds],
      blastCraters: game.blastCraters.map(c => ({ x: c.x, y: c.y })),
      mods: { ...game.mods },
      activeAugmentIds: game.activeAugments.map(a => a.id),
      augmentStacks: { ...game.augmentStacks },
      coreRepairPurchases: game.coreRepairPurchases,
      tacticalResetPurchases: game.tacticalResetPurchases,
      overdriveUses: game.overdriveUses,
      waveLogs: [...game.waveLogs],
      bossTelemetry: [...game.bossTelemetry],
      towers: game.towers.map(t => ({
        id: t.id,
        padId: t.padId,
        type: t.type,
        x: t.x,
        y: t.y,
        level: t.level,
        spec: t.spec,
        targetMode: t.targetMode,
        totalInvested: t.totalInvested,
        damageDealt: t.damageDealt,
        synergyDamageDealt: t.synergyDamageDealt,
        kills: t.kills
      }))
    };
  }

  exportSnapshotToFile(snapshot) {
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AetherBastion_V9_${snapshot.stageId}_W${snapshot.wave}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

window.AetherBastion.AetherSaveManager = AetherSaveManager;
