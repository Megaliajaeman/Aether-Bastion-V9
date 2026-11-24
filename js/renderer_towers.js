window.AetherBastion = window.AetherBastion || {};

/**
 * V9 Realistic Military-Industrial Turret Renderer
 * Features explicit, unmistakable visual upgrades and level rank badges (Lv.1 / Lv.2 / Lv.3 / Lv.4)
 * directly on every turret so players can instantly read upgrade tiers on the battlefield.
 */
class AetherTowerRenderer {
  static renderTowers(ctx, game) {
    for (const t of game.towers) {
      const stats = game.getTowerStats(t);
      const isSelected = game.selectedTower === t;

      // 1. Tactical Range Ring when Selected
      if (isSelected && game.showSelectedRange) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(t.x, t.y, stats.range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stats.color;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(t.x, t.y);

      // Overdrive / Level 4 Transcendent Halo
      if (game.overdriveTimer > 0) {
        ctx.save();
        ctx.rotate(game.time * 4.5);
        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, 39, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (t.level >= 4) {
        ctx.save();
        ctx.rotate(-game.time * 1.8);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([10, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Level-Scaled Bunker Base & Armor Plating
      this._drawBunkerBase(ctx, t, stats, isSelected);

      // 3. Level-Scaled Multi-Part Weapon Assembly
      if (t.type === 'PULSE') {
        this._drawAutocannonTurret(ctx, t, stats, game.time);
      } else if (t.type === 'CRYO') {
        this._drawCryoTurret(ctx, t, stats, game.time);
      } else if (t.type === 'TESLA') {
        this._drawTeslaTurret(ctx, t, stats, game.time);
      } else if (t.type === 'MORTAR') {
        this._drawMortarTurret(ctx, t, stats, game.time);
      }

      if (t.upgradeFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${t.upgradeFlash * 0.55})`;
        ctx.beginPath();
        ctx.arc(0, 0, 27, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Explicit Level Badge Pill + Stars at Bottom of Turret
      this._drawLevelPlate(ctx, t, stats);

      ctx.restore();
    }
  }

  static _drawBunkerBase(ctx, t, stats, isSelected) {
    // Sandbag parapet grows fuller at Lv.2+
    const bagCount = t.level >= 2 ? 7 : 5;
    ctx.fillStyle = t.level >= 3 ? '#4b5563' : '#574a38';
    ctx.strokeStyle = '#1f242d';
    ctx.lineWidth = 1.4;
    const half = Math.floor(bagCount / 2);
    for (let i = -half; i <= half; i++) {
      const ang = Math.PI * 0.5 + i * 0.28;
      const sx = Math.cos(ang) * 26;
      const sy = Math.sin(ang) * 26;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang + Math.PI * 0.5);
      ctx.beginPath();
      ctx.roundRect(-6.5, -3.5, 13, 7, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Extra side armor sponsons added at Lv.2+
    if (t.level >= 2) {
      ctx.fillStyle = t.level >= 4 ? '#78350f' : '#27303f';
      ctx.strokeStyle = t.level >= 4 ? '#fbbf24' : '#64748b';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-26, -8, 6, 16);
      ctx.strokeRect(-26, -8, 6, 16);
      ctx.fillRect(20, -8, 6, 16);
      ctx.strokeRect(20, -8, 6, 16);
    }

    // Main Octagonal Cast-Iron Turret Ring
    const baseRadius = 21 + Math.min(3, t.level - 1);
    ctx.fillStyle = '#1b222c';
    ctx.strokeStyle = isSelected ? '#ffffff' : (t.level >= 4 ? '#fbbf24' : (t.level >= 3 ? stats.color : '#64748b'));
    ctx.lineWidth = isSelected ? 2.8 : (t.level >= 2 ? 2.4 : 1.8);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const px = Math.cos(a) * baseRadius;
      const py = Math.sin(a) * baseRadius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner bearing ring + metallic rivets
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = t.level >= 4 ? '#fde047' : '#94a3b8';
    for (let r = 0; r < 6; r++) {
      const ra = (r * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(ra) * 19, Math.sin(ra) * 19, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  static _drawAutocannonTurret(ctx, t, stats, time) {
    ctx.save();
    ctx.rotate(t.angle);
    const kick = t.recoil * 5.5;

    // Ammo box & brass belt
    ctx.fillStyle = '#3f4a3c';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.4;
    ctx.fillRect(-8 - kick * 0.4, 8, 13, 9);
    ctx.strokeRect(-8 - kick * 0.4, 8, 13, 9);

    ctx.fillStyle = '#fbbf24';
    for (let b = 0; b < 3; b++) {
      ctx.fillRect(-3 + b * 2.5 - kick * 0.4, 5, 1.8, 4);
    }

    if (t.spec === 'B') {
      // Lv.3B / Lv.4: Heavy Magnetic Railgun
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.3;
      ctx.fillRect(2 - kick, -7, 32, 4.2);
      ctx.strokeRect(2 - kick, -7, 32, 4.2);
      ctx.fillRect(2 - kick, 2.8, 32, 4.2);
      ctx.strokeRect(2 - kick, 2.8, 32, 4.2);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(4 - kick, -2, 28, 4);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(30 - kick, -8, 5, 16);
    } else if (t.spec === 'A') {
      // Lv.3A / Lv.4: 6-Barrel Rotary Vulcan Gatling
      const spinOffset = Math.sin(time * 28) * 1.4;
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.1;
      for (const oy of [-5.2 + spinOffset * 0.4, 0, 5.2 - spinOffset * 0.4]) {
        ctx.fillRect(3 - kick, oy - 1.7, 27, 3.4);
        ctx.strokeRect(3 - kick, oy - 1.7, 27, 3.4);
      }
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(14 - kick, -7.5, 3, 15);
      ctx.fillRect(25 - kick, -7.5, 3.5, 15);
    } else if (t.level === 2) {
      // Lv.2: Twin-Linked Heavy Autocannon Barrels
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.fillRect(2 - kick, -6.5, 25, 4.5);
      ctx.strokeRect(2 - kick, -6.5, 25, 4.5);
      ctx.fillRect(2 - kick, 2.0, 25, 4.5);
      ctx.strokeRect(2 - kick, 2.0, 25, 4.5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(24 - kick, -7.2, 4, 14.4);
    } else {
      // Lv.1: Single Perforated Barrel Autocannon
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.3;
      ctx.fillRect(2 - kick, -4.5, 16, 9);
      ctx.strokeRect(2 - kick, -4.5, 16, 9);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(17 - kick, -2.8, 10, 5.6);
      ctx.strokeRect(17 - kick, -2.8, 10, 5.6);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(25 - kick, -3.8, 3.5, 7.6);
    }

    // Armored Receiver Housing
    ctx.fillStyle = '#263142';
    ctx.strokeStyle = t.level >= 4 ? '#fbbf24' : stats.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-12 - kick * 0.5, -10, 18, 20, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-4 - kick * 0.5, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = stats.color;
    ctx.fillRect(0 - kick * 0.5, -7.5, 5, 3);

    if (t.recoil > 0.72) {
      const tipX = (t.level >= 3 ? 34 : 29) - kick;
      ctx.fillStyle = 'rgba(254, 240, 138, 0.92)';
      ctx.beginPath();
      ctx.moveTo(tipX, 0);
      ctx.lineTo(tipX + 14, -6);
      ctx.lineTo(tipX + 9, 0);
      ctx.lineTo(tipX + 14, 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  static _drawCryoTurret(ctx, t, stats, time) {
    // Pressurized nitrogen tanks (larger at Lv.2+)
    const tankH = t.level >= 2 ? 20 : 16;
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-16, -tankH * 0.5, 7, tankH, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(9, -tankH * 0.5, 7, tankH, 3);
    ctx.fill();
    ctx.stroke();

    // Emitter prongs increase with level: 3 prongs (Lv.1) -> 4 prongs (Lv.2) -> 6 prongs (Lv.3+)
    const prongCount = t.level === 1 ? 3 : (t.level === 2 ? 4 : 6);
    ctx.save();
    ctx.rotate(t.pulsePhase * 0.7);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = stats.color;
    ctx.lineWidth = 1.7;
    for (let i = 0; i < prongCount; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / prongCount);
      ctx.beginPath();
      ctx.moveTo(0, -3.5);
      ctx.lineTo(16 + t.level, -2);
      ctx.lineTo(16 + t.level, 2);
      ctx.lineTo(0, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#bae6fd';
      ctx.beginPath();
      ctx.arc(16 + t.level, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 9 + t.level);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.6, '#38bdf8');
    glow.addColorStop(1, '#0369a1');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 8 + t.level * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  static _drawTeslaTurret(ctx, t, stats, time) {
    // Copper coil rings scale with level
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 3.5 + t.level * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();

    if (t.level >= 2) {
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Discharge electrodes (2 at Lv.1-2, 4 at Lv.3+)
    const dirs = t.level >= 3 ? [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5] : [0, Math.PI];
    for (const a of dirs) {
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.fillRect(6, -2.8, 11, 5.6);
      ctx.strokeRect(6, -2.8, 11, 5.6);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(17, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const orbR = 7 + t.level * 0.8 + Math.sin(time * 8) * 1.3;
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, orbR + 3);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, stats.color);
    grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, orbR + 3, 0, Math.PI * 2);
    ctx.fill();
  }

  static _drawMortarTurret(ctx, t, stats, time) {
    // Ammo shells stacked beside cradle (more shells at higher levels)
    const shellCount = Math.min(4, t.level + 1);
    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let s = 0; s < shellCount; s++) {
      ctx.beginPath();
      ctx.arc(-16 + s * 4.2, 13, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.save();
    ctx.rotate(t.angle);
    const kick = t.recoil * 6.5;

    ctx.fillStyle = '#292524';
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-11, -11, 18, 22);
    ctx.strokeRect(-11, -11, 18, 22);

    const barrelLen = 22 + t.level * 2;
    const barrelW = 15 + t.level * 1.4;
    ctx.fillStyle = '#44403c';
    ctx.strokeStyle = '#0c0a09';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-4 - kick, -barrelW * 0.5, barrelLen, barrelW, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = stats.color;
    ctx.fillRect(6 - kick, -barrelW * 0.5 - 0.8, 3.5, barrelW + 1.6);
    ctx.fillRect(barrelLen - 7 - kick, -barrelW * 0.5 - 1.5, 5.5, barrelW + 3);

    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.ellipse(barrelLen - 2 - kick, 0, 2.2, barrelW * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Explicit Level-Up Plate & Stars directly on every turret ("Lv.1", "Lv.2", "Lv.3 ★", "Lv.4 👑")
   */
  static _drawLevelPlate(ctx, t, stats) {
    const label = t.level >= 4 ? 'Lv.4 👑' : (t.level === 3 ? 'Lv.3 ★' : `Lv.${t.level}`);
    const plateW = t.level >= 3 ? 42 : 32;
    const yPos = 22;

    ctx.fillStyle = 'rgba(9, 13, 20, 0.92)';
    ctx.strokeStyle = t.level >= 4 ? '#fbbf24' : (t.level === 3 ? stats.color : (t.level === 2 ? '#34d399' : '#64748b'));
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-plateW * 0.5, yPos - 7, plateW, 14, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = t.level >= 4 ? '#fde047' : (t.level === 3 ? '#f5d0fe' : (t.level === 2 ? '#6ee7b7' : '#cbd5e1'));
    ctx.font = '800 9.5px "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, yPos + 0.5);
  }
}

window.AetherBastion.AetherTowerRenderer = AetherTowerRenderer;
