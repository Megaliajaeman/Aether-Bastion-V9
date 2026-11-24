window.AetherBastion = window.AetherBastion || {};

/**
 * V9 Realistic Gritty Bio-Mechanical Monster Renderer
 */
class AetherEnemyRenderer {
  static renderEnemies(ctx, game) {
    for (const e of game.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);

      const walkPhase = game.time * (e.speed * 0.14) + e.id * 12.0;

      // Directional Ground Cast Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath();
      ctx.ellipse(3, 6, e.radius * 0.96, e.radius * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();

      // Status Auras
      if (e.shield > 0) {
        ctx.save();
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (e.armorShredTimer > 0) {
        ctx.save();
        ctx.rotate(-game.time * 2.5);
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (e.slowTimer > 0 || e.freezeTimer > 0) {
        ctx.fillStyle = e.freezeTimer > 0 ? 'rgba(186, 230, 253, 0.45)' : 'rgba(56, 189, 248, 0.24)';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.rotate(e.angle);
      const isFlashed = e.hitFlash > 0;

      if (e.type === 'DRONE') {
        this._drawScoutCrawler(ctx, e, walkPhase, isFlashed);
      } else if (e.type === 'RUNNER') {
        this._drawShadowHound(ctx, e, walkPhase, isFlashed);
      } else if (e.type === 'BEHEMOTH') {
        this._drawArmoredJuggernaut(ctx, e, walkPhase, isFlashed);
      } else if (e.type === 'SPLITTER') {
        this._drawBroodMother(ctx, e, walkPhase, isFlashed, game.time);
      } else if (e.type === 'AEGIS') {
        this._drawWardAcolyte(ctx, e, game.time, isFlashed);
      } else {
        this._drawSiegeTitanBoss(ctx, e, walkPhase, isFlashed, game.time);
      }

      ctx.restore();

      // Overhead Health & Shield Bar
      const barW = e.isBoss ? 72 : 34;
      const barH = e.isBoss ? 7.5 : 4.5;
      const hpPct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
      ctx.fillRect(-barW * 0.5, -e.radius - 16, barW, barH);
      ctx.fillStyle = e.isBoss ? '#f43f5e' : (hpPct > 0.5 ? '#10b981' : '#f59e0b');
      ctx.fillRect(-barW * 0.5, -e.radius - 16, barW * hpPct, barH);

      if (e.shield > 0 && e.maxShield > 0) {
        const shPct = Math.max(0, e.shield / e.maxShield);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-barW * 0.5, -e.radius - 20, barW * shPct, 2.8);
      }

      if (e.isBoss) {
        ctx.fillStyle = '#ffe4e6';
        ctx.font = '800 10px "Consolas", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SIEGE TITAN [6 DMG]', 0, -e.radius - 24);
      }

      ctx.restore();
    }
  }

  static _drawScoutCrawler(ctx, e, walkPhase, flash) {
    const r = e.radius;
    ctx.strokeStyle = flash ? '#ffffff' : '#115e59';
    ctx.lineWidth = 2.4;
    for (let side of [-1, 1]) {
      for (let leg = 0; leg < 3; leg++) {
        const baseX = (leg - 1) * 6;
        const swing = Math.sin(walkPhase + leg * 1.4 + (side > 0 ? Math.PI : 0)) * 4.5;
        ctx.beginPath();
        ctx.moveTo(baseX, side * 5);
        ctx.lineTo(baseX + swing * 0.6, side * (r + 3));
        ctx.lineTo(baseX - 3 + swing, side * (r + 6));
        ctx.stroke();
      }
    }

    ctx.fillStyle = flash ? '#ffffff' : '#134e4a';
    ctx.strokeStyle = '#5eead4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-6, 0, r * 0.62, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = flash ? '#ffffff' : e.color;
    ctx.beginPath();
    ctx.ellipse(3, 0, r * 0.55, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#ccfbf1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 0.6, -4);
    ctx.quadraticCurveTo(r + 5, -6, r + 3, -1.5);
    ctx.moveTo(r * 0.6, 4);
    ctx.quadraticCurveTo(r + 5, 6, r + 3, 1.5);
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(r * 0.55, -3, 1.8, 0, Math.PI * 2);
    ctx.arc(r * 0.55, 3, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  static _drawShadowHound(ctx, e, walkPhase, flash) {
    const r = e.radius;
    const tailWag = Math.sin(walkPhase * 1.3) * 5;
    ctx.strokeStyle = flash ? '#ffffff' : '#9333ea';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.quadraticCurveTo(-r - 5, tailWag, -r - 11, tailWag * 1.4);
    ctx.stroke();

    ctx.strokeStyle = flash ? '#ffffff' : '#581c87';
    ctx.lineWidth = 2.8;
    for (let side of [-1, 1]) {
      const fStride = Math.sin(walkPhase + (side > 0 ? 0 : Math.PI)) * 6;
      const bStride = Math.sin(walkPhase + (side > 0 ? Math.PI : 0)) * 6;
      ctx.beginPath();
      ctx.moveTo(5, side * 5);
      ctx.lineTo(7 + fStride, side * (r + 3));
      ctx.moveTo(-6, side * 5);
      ctx.lineTo(-8 + bStride, side * (r + 3));
      ctx.stroke();
    }

    ctx.fillStyle = flash ? '#ffffff' : '#3b0764';
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = flash ? '#ffffff' : e.color;
    ctx.beginPath();
    ctx.moveTo(r + 6, 0);
    ctx.lineTo(r * 0.35, -7);
    ctx.lineTo(r * 0.35, 7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(r * 0.65, -2.6, 1.8, 0, Math.PI * 2);
    ctx.arc(r * 0.65, 2.6, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  static _drawArmoredJuggernaut(ctx, e, walkPhase, flash) {
    const r = e.radius;
    const armSwing = Math.sin(walkPhase * 0.8) * 4.5;

    ctx.fillStyle = flash ? '#ffffff' : '#7c2d12';
    ctx.strokeStyle = '#fdba74';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(2 + armSwing, -r - 3, 13, 7, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(2 - armSwing, r - 4, 13, 7, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = flash ? '#ffffff' : '#431407';
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(-2, 0, r * 0.78, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(-4, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? '#ffffff' : '#9a3412';
    ctx.beginPath();
    ctx.arc(r * 0.55, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#ffedd5';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -6);
    ctx.lineTo(r + 5, -10);
    ctx.moveTo(r * 0.5, 6);
    ctx.lineTo(r + 5, 10);
    ctx.stroke();
  }

  static _drawBroodMother(ctx, e, walkPhase, flash, time) {
    const r = e.radius;
    ctx.strokeStyle = flash ? '#ffffff' : '#059669';
    ctx.lineWidth = 2.2;
    for (let t = -2; t <= 2; t++) {
      const wave = Math.sin(time * 6 + t) * 4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, t * 4);
      ctx.quadraticCurveTo(-r - 4, t * 5 + wave, -r - 9, t * 4 - wave);
      ctx.stroke();
    }

    ctx.fillStyle = flash ? '#ffffff' : '#064e3b';
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const sacPulse = 1 + Math.sin(time * 7) * 0.14;
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(-3, -6, 5.2 * sacPulse, 0, Math.PI * 2);
    ctx.arc(-3, 6, 5.2 * sacPulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    for (const [ex, ey] of [[r * 0.72, -4], [r * 0.72, 4], [r * 0.85, -1.8], [r * 0.85, 1.8]]) {
      ctx.beginPath();
      ctx.arc(ex, ey, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  static _drawWardAcolyte(ctx, e, time, flash) {
    const r = e.radius;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.28)';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7);
    ctx.lineTo(-r - 8, 0);
    ctx.lineTo(0, r * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = flash ? '#ffffff' : '#1e3a8a';
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = Math.cos(a) * (r * 0.82);
      const py = Math.sin(a) * (r * 0.82);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    for (let p = 0; p < 2; p++) {
      const pa = time * 3.2 + p * Math.PI;
      const px = Math.cos(pa) * (r + 3);
      const py = Math.sin(pa) * (r + 3);
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(r * 0.35, -5, 4, 10);
  }

  static _drawSiegeTitanBoss(ctx, e, walkPhase, flash, time) {
    const r = e.radius;
    const stomp = Math.sin(walkPhase * 0.65) * 6;

    ctx.fillStyle = flash ? '#ffffff' : '#4c0519';
    ctx.strokeStyle = '#fda4af';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(4 + stomp, -r - 6, 20, 10, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(4 - stomp, r - 4, 20, 10, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = flash ? '#ffffff' : '#881337';
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-14, -15, 9, 7);
    ctx.fillRect(-14, 8, 9, 7);

    const coreR = 10 + Math.sin(time * 6) * 2;
    ctx.fillStyle = '#ffe4e6';
    ctx.beginPath();
    ctx.arc(-2, 0, coreR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1f0912';
    ctx.beginPath();
    ctx.moveTo(r + 9, 0);
    ctx.lineTo(r * 0.45, -13);
    ctx.lineTo(r * 0.45, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#fecdd3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -11);
    ctx.lineTo(r + 10, -18);
    ctx.moveTo(r * 0.5, 11);
    ctx.lineTo(r + 10, 18);
    ctx.stroke();
  }
}

window.AetherBastion.AetherEnemyRenderer = AetherEnemyRenderer;
