window.AetherBastion = window.AetherBastion || {};

/**
 * V9 Master Composite Renderer
 * Supports dynamic expansive map dimensions (1440x810 up to 1920x1080),
 * realistic smoke puffs, brass shell casings, cratered breach zones, and detailed units.
 */
class AetherRenderer {
  constructor(game) {
    this.game = game;
    this.env = new window.AetherBastion.AetherEnvRenderer(game);
    this.ashEmbers = Array.from({ length: 44 }, () => ({
      x: Math.random() * 1920,
      y: Math.random() * 1080,
      r: 1 + Math.random() * 2.1,
      vx: 7 + Math.random() * 15,
      vy: -7 - Math.random() * 14,
      alpha: 0.14 + Math.random() * 0.28
    }));
  }

  invalidateBackdrop() {
    this.env.invalidateBackdrop();
  }

  render() {
    const g = this.game;
    const ctx = g.ctx;
    const stage = g.getCurrentStage();
    const mapW = stage.mapWidth || 1600;
    const mapH = stage.mapHeight || 900;

    ctx.save();
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);

    ctx.translate(g.offsetX * g.dpr, g.offsetY * g.dpr);
    ctx.scale(g.scale * g.dpr, g.scale * g.dpr);

    if (g.shakeTime > 0) {
      const sx = (Math.random() - 0.5) * g.shakeMagnitude * 2;
      const sy = (Math.random() - 0.5) * g.shakeMagnitude * 2;
      ctx.translate(sx, sy);
    }

    // 1. Expansive Terrain, Winding Roads & Props
    this.env.renderBackdropAndRoads(ctx);
    this._drawBlastCraters(ctx);
    this._drawPathRevealAnimations(ctx);
    this.env.renderPortalsAndCitadelCore(ctx);

    // 2. Fixed Tactical Build Pads (and Cratered Unbuildable Pads)
    this.env.renderBuildPads(ctx);

    // 3. Detailed Multi-Part Mechanical Turrets & Realistic Monsters
    window.AetherBastion.AetherTowerRenderer.renderTowers(ctx, g);
    window.AetherBastion.AetherEnemyRenderer.renderEnemies(ctx, g);

    // 4. Ballistic Tracers, Ejecting Brass Casings, Shells & Elemental VFX
    this._drawShellCasings(ctx);
    this._drawProjectiles(ctx);
    this._drawLightningArcs(ctx);
    this._drawOrbitalBeams(ctx);
    this._drawShockwavesAndParticles(ctx);
    this._drawAmbientEmbers(ctx, mapW, mapH);
    this._drawSkillTargetingReticle(ctx);
    this._drawFloatingTexts(ctx);

    if (g.overdriveTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(217, 70, 239, 0.08)';
      ctx.fillRect(0, 0, mapW, mapH);
      ctx.strokeStyle = 'rgba(232, 121, 249, 0.65)';
      ctx.lineWidth = 5;
      ctx.strokeRect(2.5, 2.5, mapW - 5, mapH - 5);
      ctx.restore();
    }

    if (g.chronoTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(79, 70, 229, 0.14)';
      ctx.fillRect(0, 0, mapW, mapH);
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.55)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, mapW - 6, mapH - 6);
      ctx.restore();
    }

    ctx.restore();
  }

  _drawAmbientEmbers(ctx, mapW, mapH) {
    const dt = 0.016;
    for (const m of this.ashEmbers) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -8) { m.y = mapH + 8; m.x = Math.random() * mapW; }
      if (m.x > mapW + 8) m.x = -8;
      ctx.fillStyle = `rgba(251, 191, 36, ${m.alpha})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBlastCraters(ctx) {
    const g = this.game;
    if (!g.blastCraters || g.blastCraters.length === 0) return;
    for (const cr of g.blastCraters) {
      ctx.save();
      ctx.translate(cr.x, cr.y);
      const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, 62);
      grad.addColorStop(0, 'rgba(251, 113, 133, 0.36)');
      grad.addColorStop(0.55, 'rgba(15, 10, 12, 0.80)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(244, 63, 94, 0.48)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 40 : 26;
        const px = Math.cos(ang) * r;
        const py = Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawPathRevealAnimations(ctx) {
    const g = this.game;
    const stage = g.getCurrentStage();
    const mapW = stage.mapWidth || 1600;
    const mapH = stage.mapHeight || 900;

    for (const anim of g.pathRevealAnims) {
      const pts = g.paths[anim.routeKey];
      if (!pts || pts.length < 2) continue;

      const t = anim.elapsed / anim.duration;
      const alpha = Math.sin(Math.min(1, t) * Math.PI);

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 46;
      ctx.strokeStyle = anim.color;
      ctx.globalAlpha = 0.22 * alpha;
      this.env.traceSmoothRoad(ctx, pts);
      ctx.stroke();

      ctx.lineWidth = 5.5;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = anim.color;
      ctx.shadowBlur = 16;
      ctx.globalAlpha = 0.9 * alpha;
      ctx.setLineDash([32, 44]);
      ctx.lineDashOffset = -anim.elapsed * 300;
      this.env.traceSmoothRoad(ctx, pts);
      ctx.stroke();
      ctx.restore();

      const startPt = pts[0];
      ctx.save();
      ctx.font = '900 13px "Malgun Gothic", sans-serif';
      ctx.textAlign = 'left';
      ctx.globalAlpha = Math.min(1, alpha * 1.4);
      const labelMap = {
        BYPASS: '☣️ NEW ROUTE: 협곡 우회로 개방!',
        SUB_PORTAL: '🌀 NEW RIFT: 북부 균열 개방!',
        EAST_BREACH: '☄️ TERRAIN SHATTERED: 폭격 돌파로 개방 (해당 구역 건설 불가)!',
        CORE_TUNNEL: '🧨 TUNNEL BREACHED: 지하 갱도 개방 (해당 구역 건설 불가)!'
      };
      const label = labelMap[anim.routeKey] || '⚠️ 신규 침투 경로 개방!';
      const lx = Math.min(mapW - 420, Math.max(40, startPt.x + 28));
      const ly = Math.min(mapH - 80, Math.max(95, startPt.y + (startPt.y > mapH * 0.55 ? -32 : 38)));
      ctx.fillStyle = '#020617';
      ctx.fillText(label, lx + 1.5, ly + 1.5);
      ctx.fillStyle = anim.color;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }
  }

  _drawShellCasings(ctx) {
    const g = this.game;
    if (!g.shellCasings) return;
    for (const sc of g.shellCasings) {
      ctx.save();
      ctx.translate(sc.x, sc.y);
      ctx.rotate(sc.rot);
      ctx.globalAlpha = Math.min(1, sc.life * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-2.5, -1, 5, 2);
      ctx.restore();
    }
  }

  _drawProjectiles(ctx) {
    const g = this.game;

    for (const p of g.projectiles) {
      if (p.kind === 'PULSE') {
        if (p.trail.length > 1) {
          ctx.save();
          ctx.strokeStyle = p.isRailgun
            ? 'rgba(56, 189, 248, 0.72)'
            : (p.isCrit ? 'rgba(253, 224, 71, 0.65)' : 'rgba(251, 191, 36, 0.45)');
          ctx.lineWidth = p.isRailgun ? 4.5 : 2.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let i = 1; i < p.trail.length; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
          ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.isRailgun ? '#e0f2fe' : (p.isCrit ? '#fef08a' : '#fde68a');
        ctx.fillRect(p.isRailgun ? -11 : -6, -2, p.isRailgun ? 22 : 12, 4);
        ctx.restore();
      } else if (p.kind === 'MORTAR') {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.48)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.tx, p.ty, p.splashRadius * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const drawY = p.y - p.arcHeight;
        ctx.translate(p.x, drawY);
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, p.isSubmunition ? 4.5 : 6.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawLightningArcs(ctx) {
    const g = this.game;
    for (const arc of g.lightningArcs) {
      const alpha = Math.max(0, arc.life / arc.maxLife);
      ctx.save();
      ctx.strokeStyle = arc.color || `rgba(216, 180, 254, ${alpha})`;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = arc.width || 3;
      ctx.beginPath();
      for (let i = 0; i < arc.points.length - 1; i++) {
        const a = arc.points[i];
        const b = arc.points[i + 1];
        const midX = (a.x + b.x) * 0.5 + (Math.random() - 0.5) * 22;
        const midY = (a.y + b.y) * 0.5 + (Math.random() - 0.5) * 22;
        if (i === 0) ctx.moveTo(a.x, a.y);
        ctx.lineTo(midX, midY);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawOrbitalBeams(ctx) {
    const g = this.game;
    for (const beam of g.orbitalBeams) {
      const alpha = Math.max(0, beam.life / beam.maxLife);
      const isHostile = !!beam.isHostile;
      ctx.save();
      const grad = ctx.createRadialGradient(beam.x, beam.y, 10, beam.x, beam.y, beam.radius);
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(0.4, isHostile ? `rgba(244, 63, 94, ${alpha * 0.78})` : `rgba(251, 191, 36, ${alpha * 0.7})`);
      grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(beam.x, beam.y, beam.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isHostile ? `rgba(254, 205, 211, ${alpha * 0.9})` : `rgba(254, 249, 195, ${alpha * 0.85})`;
      ctx.fillRect(beam.x - 18 * alpha, 0, 36 * alpha, beam.y);
      ctx.restore();
    }
  }

  _drawShockwavesAndParticles(ctx) {
    const g = this.game;
    for (const s of g.shockwaves) {
      const t = s.elapsed / s.duration;
      const r = s.maxRadius * (0.2 + t * 0.8);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const pt of g.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawSkillTargetingReticle(ctx) {
    const g = this.game;
    if (g.targetingSkill !== 'ORBITAL' || !g.hoverPos) return;
    const { x, y } = g.hoverPos;
    const radius = 140;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fbbf24';
    ctx.setLineDash([10, 6]);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 24, y);
    ctx.lineTo(x + 24, y);
    ctx.moveTo(x, y - 24);
    ctx.lineTo(x, y + 24);
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }

  _drawFloatingTexts(ctx) {
    const g = this.game;
    for (const ft of g.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      ctx.font = ft.isReaction ? '800 15px "Malgun Gothic", sans-serif' : '700 13px "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#020617';
      ctx.fillText(ft.text, ft.x + 1.2, ft.y + 1.2);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}

window.AetherBastion.AetherRenderer = AetherRenderer;
