// Pure 2D Canvas isometric renderer -- no WebGL, works in any browser.
// Same real data (projects, roster, queue) as city.js, drawn with plain canvas paths.

const TILE_W = 64, TILE_H = 32;
const COFFEE_POS = { x: 8, z: 8 };
const FIRE_POS = { x: -8, z: 8 };
const TRADE_POS = { x: -8, z: -8 };

const SLOTS = [
  [14, 0], [-14, 0], [0, 14], [0, -14],
  [14, 14], [-14, 14], [14, -14], [-14, -14],
];

function hashColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 55%, 55%)`;
}

class City2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buildings = new Map();
    this.agents = new Map();
    this.camX = 0; this.camY = 0;
    this.zoom = 1;
    this.player = { x: COFFEE_POS.x + 2, z: COFFEE_POS.z + 2 };
    this.walkMode = false;
    this.keys = {};
    this.currentInterior = null;
    this.citizens = [];
    this._t = 0;
    this._last = performance.now();

    this._resize();
    window.addEventListener('resize', () => this._resize());
    canvas.addEventListener('click', (e) => this._onClick(e));
    canvas.addEventListener('mousedown', (e) => { this._dragging = true; this._lx = e.clientX; this._ly = e.clientY; this._dragMoved = false; });
    window.addEventListener('mouseup', () => { this._dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this._dragging || this.walkMode) return;
      const dx = e.clientX - this._lx, dy = e.clientY - this._ly;
      if (Math.abs(dx) + Math.abs(dy) > 3) this._dragMoved = true;
      this.camX -= dx; this.camY -= dy;
      this._lx = e.clientX; this._ly = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.5, Math.min(2.2, this.zoom - e.deltaY * 0.001));
    }, { passive: false });
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    requestAnimationFrame((t) => this._loop(t));
  }

  _resize() {
    const wrap = this.canvas.parentElement;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
  }

  setWalkMode(on) { this.walkMode = on; }

  // World (x, z, h) -> screen pixel, iso projection.
  toScreen(x, z, h = 0) {
    const cx = this.canvas.width / 2 - this.camX;
    const cy = this.canvas.height / 2 - this.camY;
    const sx = (x - z) * (TILE_W / 2) * this.zoom + cx;
    const sy = (x + z) * (TILE_H / 2) * this.zoom - h * this.zoom + cy;
    return [sx, sy];
  }

  _buildingHeight(p) {
    return 20 + Math.min(p.council_count + p.content_count + p.research_count, 10) * 10;
  }

  setProjects(projects) {
    this._allProjects = projects;
    const seen = new Set();
    projects.forEach((p, i) => {
      seen.add(p.name);
      const [x, z] = SLOTS[i % SLOTS.length];
      const height = this._buildingHeight(p);
      const color = hashColor(p.name);
      let b = this.buildings.get(p.name);
      if (!b) { b = { x, z }; this.buildings.set(p.name, b); }
      b.height = height; b.color = color; b.data = p;
    });
    for (const [name] of this.buildings) if (!seen.has(name)) this.buildings.delete(name);
    this._syncAgents(projects);
    this._syncPopulation(projects);
  }

  _syncAgents(projects) {
    const merged = new Map();
    projects.forEach((p) => p.roster.forEach((a) => { if (!merged.has(a.name)) merged.set(a.name, a); }));
    for (const [name, data] of merged) {
      let a = this.agents.get(name);
      if (!a) {
        a = {
          x: COFFEE_POS.x + (Math.random() - 0.5) * 3, z: COFFEE_POS.z + (Math.random() - 0.5) * 3,
          state: 'idle', roamTarget: null, roamPause: Math.random() * 3, target: null, travelT: 0,
        };
        this.agents.set(name, a);
      }
      a.data = data;
    }
    for (const [name] of this.agents) if (!merged.has(name)) this.agents.delete(name);
  }

  _syncPopulation(projects) {
    const real = projects.reduce((a, p) => a + p.leads_count + p.content_count + p.council_count, 0);
    const target = Math.min(real, 24);
    while (this.citizens.length < target) {
      this.citizens.push({
        angle: Math.random() * Math.PI * 2, r: 20 + Math.random() * 8,
        speed: 0.15 + Math.random() * 0.2, color: '#8a94b8',
      });
    }
    while (this.citizens.length > target) this.citizens.pop();
  }

  updateActivity(projects) {
    projects.forEach((p) => {
      if (!p.queue || !p.queue.length) return;
      const already = [...this.agents.values()].some((a) => a.state !== 'idle' && a.target === p.name);
      if (already) return;
      const idle = [...this.agents.values()].find((a) => a.state === 'idle');
      if (idle && this.buildings.has(p.name)) { idle.state = 'to-target'; idle.travelT = 0; idle.target = p.name; }
    });
    this._updateChips();
  }

  _updateChips() {
    const bar = document.getElementById('chips-bar');
    if (!bar) return;
    bar.innerHTML = [...this.agents.values()].map((a) => {
      const status = a.state === 'idle' ? 'roaming' : a.state === 'at-target' ? `working: ${a.target}` : `heading to: ${a.target}`;
      return `<div class="chip" title="${(a.data.line || '').replace(/"/g, '&quot;')}"><span class="chip-dot" style="background:${a.data.color}"></span><strong>${a.data.char_name}</strong><span class="chip-status">${status}</span></div>`;
    }).join('');
  }

  applyWeather() {}

  // ---------- interaction ----------

  _hitTest(px, py) {
    // Agents first (small radius).
    for (const [name, a] of this.agents) {
      const [sx, sy] = this.toScreen(a.x, a.z, 12);
      if (Math.hypot(px - sx, py - sy) < 16) return { type: 'agent', name };
    }
    // Core.
    const [cx, cy] = this.toScreen(0, 0, 40);
    if (Math.hypot(px - cx, py - cy) < 45) return { type: 'core' };
    const [tx, ty] = this.toScreen(TRADE_POS.x, TRADE_POS.z, 35);
    if (Math.hypot(px - tx, py - ty) < 40) return { type: 'trading' };
    for (const [name, b] of this.buildings) {
      const [bx, by] = this.toScreen(b.x, b.z, b.height / 2);
      if (Math.hypot(px - bx, py - by) < 34) return { type: 'building', name };
    }
    return null;
  }

  _onClick(e) {
    if (this._dragMoved) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const hit = this._hitTest(px, py);
    if (!hit) return;
    if (hit.type === 'agent') this._showConversation(hit.name);
    else if (hit.type === 'core') this.enterCommandCenter();
    else if (hit.type === 'trading') this.enterTradingRoom();
    else if (hit.type === 'building') this.enterBuilding(hit.name);
  }

  _showConversation(name) {
    const agent = this.agents.get(name);
    if (!agent) return;
    const radius = 4;
    const nearby = [...this.agents.values()].filter((a) => Math.hypot(a.x - agent.x, a.z - agent.z) < radius);
    const box = document.getElementById('dialogue-box');
    box.hidden = false;
    box.innerHTML = nearby.map((a) => `<div class="dialogue-line"><span class="dialogue-name" style="color:${a.data.color}">${a.data.char_name}:</span>${a.data.line}</div>`).join('');
    clearTimeout(this._chatTimer);
    this._chatTimer = setTimeout(() => { box.hidden = true; }, 8000);
  }

  enterBuilding(name) {
    const b = this.buildings.get(name);
    if (!b) return;
    this.currentInterior = name;
    document.getElementById('interior-title').textContent = `Inside ${name}`;
    const roster = b.data.roster || [];
    document.getElementById('interior-body').innerHTML = roster.map((a) => `
      <div class="desk"><div class="avatar" style="background:${a.color}">${(a.char_name || a.name)[0]}</div>
      <div><div class="who">${a.char_name || a.name} <span class="role">— ${a.role}</span></div><div class="line">${a.line}</div></div></div>
    `).join('') || '<div class="empty">Nobody assigned here yet.</div>';
    document.getElementById('interior-panel').hidden = false;
  }

  enterCommandCenter() {
    this.currentInterior = '__command_center__';
    const projects = this._allProjects || [];
    document.getElementById('interior-title').textContent = 'Inside the Command Center';
    const totalQueue = projects.reduce((a, p) => a + p.queue.length, 0);
    const chairman = projects.flatMap((p) => p.roster).find((a) => a.name === 'council-chairman');
    const summary = `<div class="desk" style="background:#1a1730;border-color:#3a3060">
      <div class="avatar" style="background:${chairman ? chairman.color : '#7c5cff'}">${chairman ? chairman.char_name[0] : 'P'}</div>
      <div><div class="who">${chairman ? chairman.char_name : 'Priya'} <span class="role">— speaking for the Command Center</span></div>
      <div class="line">${totalQueue > 0 ? `${totalQueue} thing${totalQueue === 1 ? '' : 's'} waiting on you across ${projects.length} project${projects.length === 1 ? '' : 's'}.` : `All ${projects.length} project${projects.length === 1 ? '' : 's'} caught up.`}</div></div></div>`;
    const rows = projects.map((p) => `<div class="desk"><div class="avatar" style="background:#35d0ba">${p.name[0]}</div>
      <div><div class="who">${p.name}</div><div class="role">${p.council_count} council · ${p.content_count} content · ${p.hired_count} hired</div>
      <div class="line">${p.queue.length ? `${p.queue.length} waiting on you` : 'nothing pending'}</div></div></div>`).join('');
    document.getElementById('interior-body').innerHTML = summary + (rows || '<div class="empty">No projects yet.</div>');
    document.getElementById('interior-panel').hidden = false;
  }

  enterTradingRoom() {
    this.currentInterior = '__trading_room__';
    document.getElementById('interior-title').textContent = 'Inside the Trading Room';
    const t = this._trading;
    const body = document.getElementById('interior-body');
    if (!t) { body.innerHTML = '<div class="empty">Loading...</div>'; document.getElementById('interior-panel').hidden = false; return; }
    const sign = t.gain_loss >= 0 ? '+' : '';
    const holdingsRows = Object.entries(t.holdings || {}).filter(([, s]) => s > 0.0001)
      .map(([tk, s]) => `<div class="desk"><div class="avatar" style="background:#4ade9c">${tk[0]}</div><div><div class="who">${tk}</div><div class="role">${s.toFixed(3)} sh @ $${(t.prices[tk] || 0).toFixed(2)}</div></div></div>`).join('')
      || '<div class="empty">No positions held right now.</div>';
    const tradeRows = (t.trades || []).slice(0, 6).map((tr) => `<div class="desk"><div class="avatar" style="background:${tr.action === 'BUY' ? '#4ade9c' : '#ff8a6a'}">${tr.action[0]}</div><div><div class="who">${tr.action} ${tr.ticker} — ${tr.shares} sh @ $${tr.price}</div><div class="role">${tr.reason}</div></div></div>`).join('')
      || '<div class="empty">No trades yet -- waiting for a >=1.5% move.</div>';
    body.innerHTML = `
      <div class="notice-box" style="margin-bottom:16px">SIMULATED PAPER TRADING — real market prices, fake $${t.starting_value.toLocaleString()} starting cash, no real account, no real money.</div>
      <div class="desk" style="background:#0f2018;border-color:#2a5a40"><div class="avatar" style="background:#4ade9c">S</div>
      <div><div class="who">Sterling <span class="role">— runs this simulated desk</span></div>
      <div class="line">Portfolio: $${t.portfolio_value.toLocaleString()} (${sign}$${t.gain_loss.toLocaleString()}, ${sign}${t.gain_loss_pct}%) · Cash: $${t.cash.toLocaleString()}</div></div></div>
      <h3 style="margin-top:16px">Holdings</h3>${holdingsRows}
      <h3 style="margin-top:16px">Recent simulated trades</h3>${tradeRows}`;
    document.getElementById('interior-panel').hidden = false;
  }

  leaveBuilding() {
    document.getElementById('interior-panel').hidden = true;
    this.currentInterior = null;
  }

  // ---------- update + draw ----------

  _update(dt) {
    this._t += dt;
    if (this.walkMode) {
      const k = this.keys;
      const inX = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
      const inZ = (k['KeyS'] || k['ArrowDown'] ? 1 : 0) - (k['KeyW'] || k['ArrowUp'] ? 1 : 0);
      if (inX || inZ) {
        const speed = 5 * dt;
        this.player.x += inX * speed;
        this.player.z += inZ * speed;
      }
      // Camera follows player.
      const [px, py] = [(this.player.x - this.player.z) * (TILE_W / 2), (this.player.x + this.player.z) * (TILE_H / 2)];
      this.camX += (px - this.camX) * 0.1;
      this.camY += (py - this.camY) * 0.1;

      if (Math.abs(this.player.x) < 3 && Math.abs(this.player.z) < 3) {
        if (this.currentInterior !== '__command_center__') this.enterCommandCenter();
      } else if (Math.abs(this.player.x - TRADE_POS.x) < 2.2 && Math.abs(this.player.z - TRADE_POS.z) < 2.2) {
        if (this.currentInterior !== '__trading_room__') this.enterTradingRoom();
      } else {
        let inBuilding = false;
        for (const [name, b] of this.buildings) {
          if (Math.abs(this.player.x - b.x) < 2.2 && Math.abs(this.player.z - b.z) < 2.2) {
            if (this.currentInterior !== name) this.enterBuilding(name);
            inBuilding = true;
            break;
          }
        }
        if (!inBuilding && this.currentInterior) this.leaveBuilding();
      }
    }

    for (const c of this.citizens) c.angle += c.speed * dt * 0.3;

    for (const a of this.agents.values()) {
      if (a.state === 'idle') {
        if (!a.roamTarget) {
          if (a.roamPause > 0) { a.roamPause -= dt; }
          else {
            const spots = [COFFEE_POS, FIRE_POS, { x: 0, z: 0 }, ...[...this.buildings.values()].map((b) => ({ x: b.x, z: b.z }))];
            const pick = spots[Math.floor(Math.random() * spots.length)];
            a.roamTarget = { x: pick.x + (Math.random() - 0.5) * 5, z: pick.z + (Math.random() - 0.5) * 5 };
          }
        } else {
          const dx = a.roamTarget.x - a.x, dz = a.roamTarget.z - a.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.3) { a.roamTarget = null; a.roamPause = 2 + Math.random() * 4; }
          else { const s = Math.min(1.6 * dt, dist) / dist; a.x += dx * s; a.z += dz * s; }
        }
      } else if (a.state === 'to-target' || a.state === 'to-home') {
        a.travelT += dt * 0.3;
        const b = this.buildings.get(a.target);
        if (!b) { a.state = 'idle'; continue; }
        const start = a.state === 'to-target' ? { x: a.x, z: a.z } : { x: b.x, z: b.z };
        const end = a.state === 'to-target' ? { x: b.x, z: b.z } : COFFEE_POS;
        const tt = Math.min(a.travelT, 1);
        a.x = start.x + (end.x - start.x) * tt;
        a.z = start.z + (end.z - start.z) * tt;
        if (tt >= 1) {
          if (a.state === 'to-target') { a.state = 'at-target'; a.travelT = 0; }
          else { a.state = 'idle'; a.target = null; a.roamPause = 1; this._updateChips(); }
        }
      } else if (a.state === 'at-target') {
        a.travelT += dt;
        if (a.travelT > 5) { a.state = 'to-home'; a.travelT = 0; }
      }
    }
  }

  _diamond(ctx, x, y, w, h, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x, y + h / 2);
    ctx.lineTo(x - w / 2, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  _isoBox(ctx, cx, cy, w, d, h, topColor, leftColor, rightColor) {
    // cx,cy = screen pos of the box's base center. w/d in screen tile units, h in px.
    const hw = w / 2, hd = d / 2;
    const top = [[cx, cy - h - hd], [cx + hw, cy - h], [cx, cy - h + hd], [cx - hw, cy - h]];
    const leftFace = [[cx - hw, cy - h], [cx, cy - h + hd], [cx, cy + hd], [cx - hw, cy]];
    const rightFace = [[cx + hw, cy - h], [cx, cy - h + hd], [cx, cy + hd], [cx + hw, cy]];
    const draw = (pts, color) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.stroke();
    };
    draw(leftFace, leftColor);
    draw(rightFace, rightColor);
    draw(top, topColor);
  }

  _shade(hex, amt) {
    // Works for hsl() strings too via canvas-computed fallback: just adjust lightness token.
    const m = hex.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (m) {
      const l = Math.max(10, Math.min(90, parseInt(m[3]) + amt));
      return `hsl(${m[1]}, ${m[2]}%, ${l}%)`;
    }
    return hex;
  }

  _drawLabel(ctx, x, y, text, color = '#e8eaf0') {
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(10,8,24,0.75)';
    ctx.fillRect(x - w / 2 - 6, y - 14, w + 12, 18);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y - 1);
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#241448');
    grad.addColorStop(1, '#0b0d14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Ground grid.
    ctx.strokeStyle = 'rgba(90,60,160,0.15)';
    ctx.lineWidth = 1;
    for (let i = -20; i <= 20; i += 2) {
      const [x1, y1] = this.toScreen(i, -20);
      const [x2, y2] = this.toScreen(i, 20);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = this.toScreen(-20, i);
      const [x4, y4] = this.toScreen(20, i);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }

    // Roads to every building + amenities.
    ctx.strokeStyle = 'rgba(154,138,255,0.4)';
    ctx.lineWidth = 3;
    const targets = [...this.buildings.values(), COFFEE_POS, FIRE_POS, TRADE_POS];
    for (const t of targets) {
      const [x1, y1] = this.toScreen(0, 0, 2);
      const [x2, y2] = this.toScreen(t.x, t.z, 2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // Collect all drawables with a depth key (x+z) for painter's algorithm.
    const drawables = [];
    for (const [name, b] of this.buildings) drawables.push({ depth: b.x + b.z, draw: () => this._drawBuilding(b, name) });
    drawables.push({ depth: 0, draw: () => this._drawCore() });
    drawables.push({ depth: COFFEE_POS.x + COFFEE_POS.z, draw: () => this._drawAmenity(COFFEE_POS, '#ffb454', '☕ Meeting Hall', 30) });
    drawables.push({ depth: FIRE_POS.x + FIRE_POS.z, draw: () => this._drawAmenity(FIRE_POS, '#ff5a4a', '🚒 Fire Department', 34) });
    drawables.push({ depth: TRADE_POS.x + TRADE_POS.z, draw: () => this._drawAmenity(TRADE_POS, '#4ade9c', '📈 Trading Room', 34) });
    for (const c of this.citizens) {
      const x = Math.cos(c.angle) * c.r, z = Math.sin(c.angle) * c.r;
      drawables.push({ depth: x + z, draw: () => this._drawPerson(x, z, 0.5, c.color, null) });
    }
    for (const [, a] of this.agents) {
      drawables.push({ depth: a.x + a.z + 0.1, draw: () => this._drawPerson(a.x, a.z, 1, a.data.color, a.data.char_name) });
    }
    if (this.walkMode) {
      drawables.push({ depth: this.player.x + this.player.z + 0.2, draw: () => this._drawPerson(this.player.x, this.player.z, 1, '#ffffff', 'You') });
    }

    drawables.sort((p, q) => p.depth - q.depth);
    for (const d of drawables) d.draw();
  }

  _drawBuilding(b, name) {
    const [sx, sy] = this.toScreen(b.x, b.z, 0);
    const s = this.zoom;
    this._isoBox(this.ctx, sx, sy, 56 * s, 40 * s, b.height * s, this._shade(b.color, 15), this._shade(b.color, -15), this._shade(b.color, -5));
    this._drawLabel(this.ctx, sx, sy - b.height * s - 14, name.replace(/\s*\(.*\)$/, ''));
  }

  _drawCore() {
    const [sx, sy] = this.toScreen(0, 0, 0);
    const s = this.zoom;
    this._isoBox(this.ctx, sx, sy, 70 * s, 50 * s, 50 * s, '#e8e2d0', '#a8a290', '#c9c2ac');
    // Dome accent.
    const [dx, dy] = this.toScreen(0, 0, 50 * s + 14 * s);
    this.ctx.beginPath();
    this.ctx.arc(dx, dy, 10 * s, 0, Math.PI * 2);
    this.ctx.fillStyle = '#7c5cff';
    this.ctx.fill();
    this._drawLabel(this.ctx, sx, sy - 50 * s - 26, 'Command Center', '#e8e2d0');
  }

  _drawAmenity(pos, color, label, height) {
    const [sx, sy] = this.toScreen(pos.x, pos.z, 0);
    const s = this.zoom;
    this._isoBox(this.ctx, sx, sy, 34 * s, 26 * s, height * s, this._shade(color, 15), this._shade(color, -20), this._shade(color, -8));
    this._drawLabel(this.ctx, sx, sy - height * s - 12, label);
  }

  _drawPerson(x, z, hMul, color, label) {
    const [sx, sy] = this.toScreen(x, z, 0);
    const s = this.zoom * hMul;
    // Simple standing figure: legs + torso + head, small but readable.
    this.ctx.fillStyle = '#23233a';
    this.ctx.fillRect(sx - 3 * s, sy - 10 * s, 6 * s, 8 * s);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.roundRect ? this.ctx.roundRect(sx - 4 * s, sy - 20 * s, 8 * s, 10 * s, 3 * s) : this.ctx.rect(sx - 4 * s, sy - 20 * s, 8 * s, 10 * s);
    this.ctx.fill();
    this.ctx.fillStyle = '#e8c9a8';
    this.ctx.beginPath();
    this.ctx.arc(sx, sy - 24 * s, 3.5 * s, 0, Math.PI * 2);
    this.ctx.fill();
    if (label) this._drawLabel(this.ctx, sx, sy - 32 * s, label, '#ffffff');
  }

  _loop(now) {
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;
    this._update(dt);
    this._draw();
    requestAnimationFrame((t) => this._loop(t));
  }
}

let city2d;

function wireWalkToggle2D() {
  const btn = document.getElementById('walk-toggle');
  const hint = document.getElementById('city-hint');
  const fpBtn = document.getElementById('fp-toggle');
  if (fpBtn) fpBtn.hidden = true; // first-person needs true 3D; not available in 2D fallback
  btn.addEventListener('click', () => {
    if (!city2d) return;
    const on = !city2d.walkMode;
    city2d.setWalkMode(on);
    btn.classList.toggle('active', on);
    btn.textContent = on ? '🖱️ Free camera' : '🚶 Join as character';
    hint.textContent = on ? 'WASD / arrows to walk · walk into a building to enter it' : 'Drag to look around · scroll to zoom · click a building or character';
  });
  document.getElementById('interior-leave').addEventListener('click', () => { if (city2d) city2d.leaveBuilding(); });
}

async function refresh2D() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();
    if (!city2d) {
      city2d = new City2D(document.getElementById('city-canvas-2d'));
      wireWalkToggle2D();
    }
    city2d.setProjects(s.projects);
    city2d.updateActivity(s.projects);
    city2d._trading = s.trading;
    if (city2d.currentInterior === '__trading_room__') city2d.enterTradingRoom();
  } catch (err) {
    console.error('city2d refresh failed', err);
  }
}

window.__startCity2D = function () {
  refresh2D();
  setInterval(refresh2D, 8000);
};
