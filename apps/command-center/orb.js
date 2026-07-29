// Jarvis-style wireframe orb -- pure Canvas 2D, no WebGL. Renders identically
// everywhere, which a Three.js scene never reliably did in this environment.

class Orb {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.agents = []; // { name, color, active }
    this.pulse = 0.3; // 0..1, driven by real activity level
    this._resize();
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame((ts) => this._loop(ts));
  }

  _resize() {
    const wrap = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = wrap.clientWidth * dpr;
    this.canvas.height = wrap.clientHeight * dpr;
    this.canvas.style.width = wrap.clientWidth + 'px';
    this.canvas.style.height = wrap.clientHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = wrap.clientWidth;
    this.h = wrap.clientHeight;
  }

  setAgents(agents) {
    // Keep stable seed positions per agent name so they don't jump around each refresh.
    const existing = new Map(this.agents.map((a) => [a.name, a]));
    this.agents = agents.map((a, i) => {
      const prev = existing.get(a.name);
      return prev
        ? { ...prev, active: a.active, color: a.color, label: a.label }
        : {
            name: a.name, color: a.color, active: a.active, label: a.label,
            theta: (i / agents.length) * Math.PI * 2,
            phi: Math.acos(1 - 2 * ((i + 0.5) / agents.length)),
            speed: 0.15 + Math.random() * 0.1,
          };
    });
  }

  setPulse(v) { this.pulse = Math.max(0, Math.min(1, v)); }

  // 3D point on unit sphere -> rotated -> projected to 2D screen space.
  _project(x, y, z, cx, cy, radius, rotY, tilt) {
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    let x1 = x * cosY - z * sinY;
    let z1 = x * sinY + z * cosY;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    let y1 = y * cosT - z1 * sinT;
    let z2 = y * sinT + z1 * cosT;
    const persp = 1 / (2.4 - z2);
    return {
      sx: cx + x1 * radius * persp,
      sy: cy + y1 * radius * persp,
      depth: z2,
      scale: persp,
    };
  }

  _loop(ts) {
    const dt = Math.min((ts - (this._last || ts)) / 1000, 0.1);
    this._last = ts;
    this.t += dt;
    this._draw();
    requestAnimationFrame((t) => this._loop(t));
  }

  _draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) * 0.32;
    const rotY = this.t * 0.18;
    const tilt = 0.35 + Math.sin(this.t * 0.1) * 0.05;
    const glow = 0.55 + this.pulse * 0.45 + Math.sin(this.t * 1.6) * 0.08;

    // Outer ambient glow
    const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.2);
    g.addColorStop(0, `rgba(90,180,255,${0.18 * glow})`);
    g.addColorStop(0.5, `rgba(140,110,255,${0.08 * glow})`);
    g.addColorStop(1, 'rgba(10,14,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Latitude rings
    const latCount = 7;
    for (let i = 1; i < latCount; i++) {
      const phi = (i / latCount) * Math.PI;
      const ringR = Math.sin(phi);
      const y = Math.cos(phi);
      ctx.beginPath();
      let started = false;
      for (let a = 0; a <= 64; a++) {
        const theta = (a / 64) * Math.PI * 2;
        const p = this._project(Math.cos(theta) * ringR, y, Math.sin(theta) * ringR, cx, cy, radius, rotY, tilt);
        if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(120,190,255,${0.16 + 0.1 * glow})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Longitude rings
    const lonCount = 9;
    for (let i = 0; i < lonCount; i++) {
      const baseTheta = (i / lonCount) * Math.PI * 2;
      ctx.beginPath();
      let started = false;
      for (let a = 0; a <= 64; a++) {
        const phi = (a / 64) * Math.PI * 2;
        const x = Math.sin(phi) * Math.cos(baseTheta);
        const z = Math.sin(phi) * Math.sin(baseTheta);
        const y = Math.cos(phi);
        const p = this._project(x, y, z, cx, cy, radius, rotY, tilt);
        if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
      }
      ctx.strokeStyle = `rgba(170,140,255,${0.13 + 0.08 * glow})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Core glow
    const coreR = radius * (0.22 + this.pulse * 0.06 + Math.sin(this.t * 2.2) * 0.015);
    const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.6);
    coreG.addColorStop(0, `rgba(190,225,255,${0.9 * glow})`);
    coreG.addColorStop(0.35, `rgba(100,170,255,${0.55 * glow})`);
    coreG.addColorStop(1, 'rgba(80,60,200,0)');
    ctx.fillStyle = coreG;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Agent nodes riding the sphere surface
    const pts = this.agents.map((agent) => {
      const theta = agent.theta + this.t * agent.speed;
      const x = Math.sin(agent.phi) * Math.cos(theta);
      const y = Math.cos(agent.phi);
      const z = Math.sin(agent.phi) * Math.sin(theta);
      const p = this._project(x, y, z, cx, cy, radius, rotY, tilt);
      return { ...p, agent };
    }).sort((a, b) => a.depth - b.depth);

    for (const p of pts) {
      const front = p.depth > 0;
      const r = (p.agent.active ? 4.5 : 3) * p.scale;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = front ? p.agent.color : 'rgba(120,140,180,0.35)';
      ctx.shadowColor = p.agent.color;
      ctx.shadowBlur = p.agent.active ? 14 : 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (front) {
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillStyle = p.agent.active ? 'rgba(230,240,255,0.95)' : 'rgba(160,180,210,0.55)';
        ctx.textAlign = 'center';
        ctx.fillText(p.agent.label, p.sx, p.sy - r - 6);
      }
    }
  }
}

let orb;
window.__startOrb = function (canvas) {
  orb = new Orb(canvas);
  return orb;
};
window.__updateOrb = function (agents, pulse) {
  if (!orb) return;
  orb.setAgents(agents);
  orb.setPulse(pulse);
};
