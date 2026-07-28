import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const COLORS = {
  bg: 0x150b28,
  core: 0x7c5cff,
  coreStone: 0xe8e2d0,
  coreStoneDark: 0xc9c2ac,
  coreRoof: 0x2a2733,
  island: 0x1b1440,
  islandRim: 0x4a9eff,
  ground: 0x1a0b2e,
  coffee: 0x8a5a3a,
  player: 0xffffff,
  leaf: 0x2f8b5f,
  house: 0x2a2354,
  houseRoof: 0x1a1435,
  citizen: 0x8a94b8,
  lamp: 0xffd9a8,
};

// Island slots arranged like city blocks around the center.
const SLOTS = [
  [14, 0], [-14, 0], [0, 14], [0, -14],
  [14, 14], [-14, 14], [14, -14], [-14, -14],
  [28, 0], [-28, 0], [0, 28], [0, -28],
];

const COFFEE_POS = new THREE.Vector3(8, 0, 8);

function makeLabelSprite(text, color = '#e8eaf0', bg = 'rgba(10,8,24,0.75)') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const scale = 2;
  canvas.width = 256 * scale;
  canvas.height = 64 * scale;
  ctx.scale(scale, scale);
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = bg;
  const metrics = ctx.measureText(text);
  const pad = 10;
  ctx.fillRect(128 - metrics.width / 2 - pad, 18, metrics.width + pad * 2, 28);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 38);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4, 1, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function makeWindowTexture(baseHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${baseHex.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 4, rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const roll = Math.random();
      ctx.fillStyle = roll > 0.5 ? 'rgba(255,214,140,0.95)'
        : roll > 0.3 ? 'rgba(120,220,255,0.85)'
        : 'rgba(16,14,40,0.7)';
      const w = 128 / cols, h = 256 / rows;
      ctx.fillRect(c * w + w * 0.18, r * h + h * 0.22, w * 0.64, h * 0.56);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Low-poly humanoid: legs, torso in the agent's color, head. Feet at y=0.
function makeCharacter(color, scale = 1) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.13, 0.22, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x23233a, roughness: 0.8 })
  );
  legs.position.y = 0.3;
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.17, 0.32, 4, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.6 })
  );
  torso.position.y = 0.66;
  const armMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 3, 6), armMat);
  armL.position.set(0.24, 0.66, 0);
  const armR = armL.clone();
  armR.position.x = -0.24;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8c9a8, roughness: 0.6 })
  );
  head.position.y = 1.02;
  g.add(legs, torso, armL, armR, head);
  g.scale.setScalar(scale);
  return g;
}

class City {
  constructor(canvas) {
    this.canvas = canvas;
    this.buildings = new Map();
    this.agents = new Map();
    this.clock = new THREE.Clock();
    this.walkMode = false;
    this.player = { pos: new THREE.Vector3(COFFEE_POS.x + 3, 0, COFFEE_POS.z + 3), keys: {}, heading: 0 };
    this.firstPerson = false;
    this.currentInterior = null;
    this.citizens = [];
    this.population = 0;
    this.weather = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(COLORS.bg, 30, 80);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 250);
    this.camera.position.set(10, 17, 26);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 60;
    this.controls.target.set(4, 1, 3);

    this._setupSky();
    this._setupLights();
    this._setupGround();
    this._setupStreets();
    this._setupCore();
    this._setupCoffeeShop();
    this._setupFireStation();
    this._setupTradingRoom();
    this._setupDowntown();
    this._setupHouses();
    this._setupPlayer();
    this._setupWeatherParticles();
    this._updateDayNight();

    this.linkGroup = new THREE.Group();
    this.scene.add(this.linkGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.fpYaw = 0;
    this.fpPitch = 0;
    this._dragging = false;
    canvas.addEventListener('click', (e) => { if (!this._dragMoved) this._onClick(e); });
    canvas.addEventListener('mousedown', (e) => { this._dragging = true; this._dragMoved = false; this._lastX = e.clientX; this._lastY = e.clientY; });
    window.addEventListener('mouseup', () => { this._dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this._dragging || !this.firstPerson) return;
      const dx = e.clientX - this._lastX, dy = e.clientY - this._lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this._dragMoved = true;
      this._lastX = e.clientX; this._lastY = e.clientY;
      this.fpYaw -= dx * 0.004;
      this.fpPitch = Math.max(-1.3, Math.min(1.3, this.fpPitch - dy * 0.004));
    });
    window.addEventListener('keydown', (e) => { this.player.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.player.keys[e.code] = false; });

    window.addEventListener('resize', () => this._resize());
    this._resize();
    this._animate();
  }

  // ---------- environment ----------

  _setupSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 256;
    this._skyCtx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    this._skyTexture = tex;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(110, 16, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    );
    this.scene.add(sky);
    this._paintSky(['#1a0b30', '#2a1045', '#0b0d14']);
  }

  _paintSky(stops) {
    const ctx = this._skyCtx;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(0.55, stops[1]);
    grad.addColorStop(1, stops[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    this._skyTexture.needsUpdate = true;
  }

  _setupLights() {
    this.ambientLight = new THREE.AmbientLight(0x6a5aa0, 1.25);
    this.scene.add(this.ambientLight);
    const point = new THREE.PointLight(COLORS.core, 3.6, 44);
    point.position.set(0, 8, 0);
    this.scene.add(point);
    this.sunLight = new THREE.DirectionalLight(0xcfb8ff, 0.6);
    this.sunLight.position.set(12, 18, 6);
    this.scene.add(this.sunLight);
    // Warm accent rim light so buildings/agents aren't all lit from one flat purple wash.
    const rim = new THREE.PointLight(0xffb454, 1.6, 30);
    rim.position.set(-10, 6, -10);
    this.scene.add(rim);
  }

  _updateDayNight() {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const t = hour / 24;
    const dayness = Math.max(0, Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);

    // Palette stays neon-purple; day lightens it slightly, night deepens it.
    if (dayness > 0.6) {
      this._paintSky(['#332057', '#5c338a', '#150f22']);
    } else if (dayness > 0.25) {
      this._paintSky(['#2a1650', '#7a3080', '#120c1e']);
    } else {
      this._paintSky(['#1a0b30', '#2a1045', '#0b0d14']);
    }
    this.sunLight.intensity = 0.3 + dayness * 0.7;
    this.ambientLight.intensity = 0.8 + dayness * 0.5;
  }

  _setupGround() {
    // Purple ground with a hot magenta glow toward the horizon, like the reference.
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 360);
    grad.addColorStop(0, '#241448');
    grad.addColorStop(0.6, '#3a1a66');
    grad.addColorStop(1, '#b02c96');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(canvas);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.02;
    this.scene.add(plane);

    const grid = new THREE.GridHelper(110, 55, 0x3a2a66, 0x2a1a50);
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    this.scene.add(grid);
  }

  // Street grid: dark slabs with neon edge strips running from the center to every
  // block slot, the meeting hall, and the outer ring -- reads like real roads.
  _setupStreets() {
    const group = new THREE.Group();
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x120b26, roughness: 1 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x5a3aa8, emissive: 0x5a3aa8, emissiveIntensity: 0.7 });
    const targets = [...SLOTS, [COFFEE_POS.x, COFFEE_POS.z]];
    targets.forEach(([x, z]) => {
      const len = Math.hypot(x, z);
      const street = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, len), slabMat);
      slab.position.y = 0.02;
      street.add(slab);
      [-1.05, 1.05].forEach((off) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, len), edgeMat);
        strip.position.set(off, 0.025, 0);
        street.add(strip);
      });
      // Sidewalks flanking the road.
      const walkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a48, roughness: 0.95 });
      [-1.75, 1.75].forEach((off) => {
        const walk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, len), walkMat);
        walk.position.set(off, 0.03, 0);
        street.add(walk);
      });
      street.position.set(x / 2, 0, z / 2);
      street.rotation.y = Math.atan2(x, z);
      group.add(street);
    });
    this.scene.add(group);
  }

  // Decorative downtown filler -- pure scenery so the skyline reads as a city.
  // No labels, no data, no interaction: only project buildings mean something.
  _setupDowntown() {
    const ring = [
      [22, 8], [22, -8], [-22, 8], [-22, -8],
      [8, 22], [-8, 22], [8, -22], [-8, -22],
      [22, 22], [-22, -22],
    ];
    ring.forEach(([x, z], i) => {
      const island = this._makeIsland(4.5, 4.5, 0x3a4a8a);
      island.position.set(x, 0, z);
      const h = 2.5 + (i % 4) * 1.4;
      const geo = i % 3 === 0
        ? new THREE.CylinderGeometry(1, 1.2, h, 8)
        : new THREE.BoxGeometry(1.8, h, 1.8);
      const tex = makeWindowTexture(0x161e38);
      tex.repeat.set(1, Math.max(1, Math.round(h / 2)));
      const tower = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      tower.position.y = h / 2 + 0.5;
      island.add(tower);
      if (i % 2 === 0) {
        const tier = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 1, 1.2),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })
        );
        tier.position.y = h + 1;
        island.add(tier);
      }
      this._addTrees(island, 4.5, 4.5, 2);
      this.scene.add(island);
    });
  }

  // A glass tower with a scrolling-ticker texture, purely a landmark like the
  // fire station / coffee shop -- interior shows the simulated portfolio.
  _setupTradingRoom() {
    const pos = new THREE.Vector3(-8, 0, -8);
    const island = this._makeIsland(5, 5, 0x4ade9c);
    island.position.copy(pos);
    this.scene.add(island);
    this._addTrees(island, 5, 5, 1);
    this._addLamps(island, 5, 5);
    this.tradingRoomIsland = island;

    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a1a14';
    ctx.fillRect(0, 0, 64, 256);
    ctx.fillStyle = '#4ade9c';
    ctx.font = 'bold 11px monospace';
    for (let y = 10; y < 256; y += 22) ctx.fillText(y % 44 === 10 ? '▲' : '▼', 20, y);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 3.4, 1.8),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.2 })
    );
    tower.position.y = 2.2;
    island.add(tower);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x4ade9c, transparent: true, opacity: 0.35, emissive: 0x4ade9c, emissiveIntensity: 0.3 });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 4), glassMat);
    cap.position.y = 4.3;
    cap.rotation.y = Math.PI / 4;
    island.add(cap);

    const label = makeLabelSprite('📈 Trading Room', '#c8ffe4');
    label.position.set(0, 5.1, 0);
    island.add(label);

    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.8, 2.4), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 2.4;
    island.add(hitbox);
    this.tradingRoomHitbox = hitbox;
  }

  _makeIsland(w, d, rimColor = COLORS.islandRim) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.5, d),
      new THREE.MeshStandardMaterial({ color: COLORS.island, roughness: 0.8 })
    );
    base.position.y = 0.25;
    group.add(base);
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.5, d)),
      new THREE.LineBasicMaterial({ color: rimColor })
    );
    rim.position.y = 0.25;
    group.add(rim);
    // Neon underglow strip.
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.25, 0.06, d + 0.25),
      new THREE.MeshStandardMaterial({ color: rimColor, emissive: rimColor, emissiveIntensity: 0.9 })
    );
    glow.position.y = 0.02;
    group.add(glow);
    return group;
  }

  _addTrees(parent, w, d, count) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: COLORS.leaf, roughness: 0.7 });
    for (let i = 0; i < count; i++) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 6), trunkMat);
      trunk.position.y = 0.2;
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), leafMat);
      leaves.position.y = 0.62;
      leaves.scale.y = 1.25;
      tree.add(trunk, leaves);
      const edge = Math.floor(Math.random() * 4);
      const along = (Math.random() - 0.5) * (w - 1.2);
      const off = (edge < 2 ? w : d) / 2 - 0.45;
      if (edge === 0) tree.position.set(along, 0.5, off);
      else if (edge === 1) tree.position.set(along, 0.5, -off);
      else if (edge === 2) tree.position.set(off, 0.5, along);
      else tree.position.set(-off, 0.5, along);
      parent.add(tree);
    }
  }

  _addLamps(parent, w, d) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a });
    const bulbMat = new THREE.MeshStandardMaterial({ color: COLORS.lamp, emissive: COLORS.lamp, emissiveIntensity: 1.2 });
    [[w / 2 - 0.3, d / 2 - 0.3], [-w / 2 + 0.3, d / 2 - 0.3], [w / 2 - 0.3, -d / 2 + 0.3], [-w / 2 + 0.3, -d / 2 + 0.3]].forEach(([x, z]) => {
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), poleMat);
      pole.position.y = 0.45;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), bulbMat);
      bulb.position.y = 0.95;
      lamp.add(pole, bulb);
      lamp.position.set(x, 0.5, z);
      parent.add(lamp);
    });
  }

  // ---------- landmarks ----------

  _setupCore() {
    const island = this._makeIsland(9, 8, 0x9a6aff);
    island.position.set(0, 0, 0);
    this.scene.add(island);
    this._addTrees(island, 9, 8, 6);
    this._addLamps(island, 9, 8);

    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: COLORS.coreStone, roughness: 0.55 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: COLORS.coreStoneDark, roughness: 0.6 });
    const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.coreRoof, roughness: 0.5 });
    const glowMat = new THREE.MeshStandardMaterial({ color: COLORS.core, emissive: COLORS.core, emissiveIntensity: 0.8 });
    this.coreGlowMat = glowMat;

    for (let i = 0; i < 3; i++) {
      const w = 5.2 - i * 0.5;
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, w * 0.7), stoneDark);
      step.position.set(0, 0.09 + i * 0.18, 2.6 - i * 0.3);
      group.add(step);
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 3.6), stone);
    body.position.set(0, 1.65, 0);
    group.add(body);
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.4, 12), stone);
      col.position.set(i * 0.65, 1.75, 1.9);
      group.add(col);
    }
    const pediment = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.6, 0.9, 3), roofMat);
    pediment.rotation.x = Math.PI / 2;
    pediment.rotation.z = Math.PI / 2;
    pediment.position.set(0, 3.05, 1.9);
    pediment.scale.set(1, 1, 0.6);
    group.add(pediment);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), stone);
    dome.position.set(0, 2.85, -0.2);
    group.add(dome);
    const domeGlow = new THREE.Mesh(new THREE.SphereGeometry(1.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glowMat);
    domeGlow.position.copy(dome.position);
    group.add(domeGlow);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 8), glowMat);
    spire.position.set(0, 3.95, -0.2);
    group.add(spire);

    const label = makeLabelSprite('Command Center', '#2a2733', 'rgba(232,226,208,0.92)');
    label.position.set(0, 5, 0);
    group.add(label);

    group.position.y = 0.5;
    island.add(group);
    this.core = group;
    this.core.footprint = 3.5;

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 4.6, 4.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.set(0, 2.5, 0.2);
    island.add(hitbox);
    this.coreHitbox = hitbox;
  }

  _setupCoffeeShop() {
    const island = this._makeIsland(5, 5, 0xffb454);
    island.position.copy(COFFEE_POS);
    this.scene.add(island);
    this._addTrees(island, 5, 5, 3);
    this._addLamps(island, 5, 5);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.4, 2),
      new THREE.MeshStandardMaterial({ color: COLORS.coffee, roughness: 0.7 })
    );
    base.position.y = 1.2;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 0.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x5a3a24 })
    );
    roof.position.y = 1.1;
    roof.rotation.y = Math.PI / 4;
    base.add(roof);
    const label = makeLabelSprite('☕ Meeting Hall', '#ffd9a8');
    label.position.set(0, 2.2, 0);
    base.add(label);
    island.add(base);
  }

  _setupFireStation() {
    const pos = new THREE.Vector3(-8, 0, 8);
    const island = this._makeIsland(5, 5, 0xff5a4a);
    island.position.copy(pos);
    this.scene.add(island);
    this._addTrees(island, 5, 5, 2);
    this._addLamps(island, 5, 5);

    const brick = new THREE.MeshStandardMaterial({ color: 0x8a2f28, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 2), brick);
    body.position.y = 1.25;
    island.add(body);
    // Engine bay doors.
    [-0.65, 0.65].forEach((x) => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), trim);
      door.position.set(x, 0.95, 1.02);
      island.add(door);
    });
    // Hose tower with a beacon light.
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.7), brick);
    tower.position.set(1.5, 1.8, -0.6);
    island.add(tower);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xff4433, emissive: 0xff4433, emissiveIntensity: 1.4 })
    );
    beacon.position.set(1.5, 3.25, -0.6);
    island.add(beacon);
    this.fireBeacon = beacon;

    const label = makeLabelSprite('🚒 Fire Department', '#ffd0c8');
    label.position.set(0, 3.9, 0);
    island.add(label);
  }

  _setupHouses() {
    this.houses = [];
    const count = 18;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.3;
      const r = 36 + (i % 3) * 3;
      const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      const island = this._makeIsland(3, 3, 0x6a4aff);
      island.position.set(x, 0, z);
      const houseMat = new THREE.MeshStandardMaterial({ color: COLORS.house, roughness: 0.7 });
      const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.houseRoof, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), houseMat);
      body.position.y = 1;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.7, 4), roofMat);
      roof.position.y = 1.85;
      roof.rotation.y = Math.PI / 4;
      island.add(body, roof);
      this._addTrees(island, 3, 3, 1);
      island.scale.setScalar(0.001);
      this.scene.add(island);
      this.houses.push(island);
    }
  }

  _setupPlayer() {
    const geo = new THREE.CapsuleGeometry(0.35, 0.7, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.player, emissive: 0x444466, roughness: 0.4 });
    this.playerMesh = new THREE.Mesh(geo, mat);
    this.playerMesh.position.copy(this.player.pos).setY(0.9);
    const label = makeLabelSprite('You', '#ffffff');
    label.position.set(0, 0.9, 0);
    this.playerMesh.add(label);
    this.playerMesh.visible = false;
    this.scene.add(this.playerMesh);
  }

  _setupWeatherParticles() {
    const makeParticles = (count, spread, color, size) => {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = Math.random() * 22;
        positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.7 });
      const points = new THREE.Points(geo, mat);
      points.visible = false;
      this.scene.add(points);
      return points;
    };
    this.rainParticles = makeParticles(600, 70, 0x9ecbff, 0.14);
    this.snowParticles = makeParticles(450, 70, 0xffffff, 0.2);
  }

  _animateWeatherParticles(dt) {
    const fall = (points, speed) => {
      if (!points.visible) return;
      const pos = points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - speed * dt;
        if (y < 0) y = 22;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    };
    fall(this.rainParticles, 14);
    fall(this.snowParticles, 3);
  }

  applyWeather(weather) {
    this.weather = weather;
    const code = weather && weather.weather_code;
    const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
    const isSnow = [71, 73, 75, 77, 85, 86].includes(code);
    const isFoggy = [45, 48].includes(code);
    this.rainParticles.visible = isRain;
    this.snowParticles.visible = isSnow;
    if (this.scene.fog) {
      this.scene.fog.near = isFoggy ? 10 : 30;
      this.scene.fog.far = isFoggy ? 35 : 80;
    }
  }

  // ---------- data-driven scene ----------

  _buildingHeight(p) {
    return 2 + Math.min(p.council_count + p.content_count + p.research_count, 10) * 0.7;
  }

  setProjects(projects) {
    this._allProjects = projects;
    const seen = new Set();

    projects.forEach((p, i) => {
      seen.add(p.name);
      const [x, z] = SLOTS[i % SLOTS.length];
      let b = this.buildings.get(p.name);
      const height = this._buildingHeight(p);
      const hueSeed = Array.from(p.name).reduce((a, c) => a + c.charCodeAt(0), 0);
      const buildingColor = new THREE.Color().setHSL(((hueSeed % 360) / 360), 0.55, 0.5);

      if (!b) {
        const island = this._makeIsland(7, 7, buildingColor.getHex());
        island.position.set(x, 0, z);
        this.scene.add(island);
        this._addTrees(island, 7, 7, 5);
        this._addLamps(island, 7, 7);

        const geo = new THREE.BoxGeometry(2.6, height, 2.6);
        const tex = makeWindowTexture(0x1b2440);
        tex.repeat.set(1, Math.max(1, Math.round(height / 2)));
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, height / 2 + 0.5, 0);
        mesh.userData.project = p.name;
        const rim = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: buildingColor })
        );
        mesh.add(rim);
        const label = makeLabelSprite(p.name.replace(/\s*\(.*\)$/, ''));
        label.position.set(0, height / 2 + 1.1, 0);
        mesh.add(label);
        island.add(mesh);
        b = { mesh, island, geo, label, x, z, footprint: 1.8, baseHeight: height };
        this.buildings.set(p.name, b);
      } else {
        const scaleY = height / b.baseHeight;
        b.mesh.scale.y = scaleY;
        b.mesh.position.y = (b.baseHeight * scaleY) / 2 + 0.5;
        b.label.position.y = b.baseHeight / 2 + 1.1 / scaleY;
      }
      b.data = p;
    });

    for (const [name, b] of this.buildings) {
      if (!seen.has(name)) {
        this.scene.remove(b.island);
        this.buildings.delete(name);
      }
    }

    this._rebuildLinks();
    this._syncAgents(projects);
    this._syncPopulation(projects);
    this._updateChips();
  }

  _rebuildLinks() {
    this.linkGroup.clear();
    for (const b of this.buildings.values()) {
      const pts = [new THREE.Vector3(0, 4.5, 0), new THREE.Vector3(b.x, b.baseHeight + 1.5, b.z)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({
        color: 0x9a8aff, dashSize: 0.6, gapSize: 0.45, transparent: true, opacity: 0.6,
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      this.linkGroup.add(line);
    }
  }

  _syncAgents(projects) {
    const merged = new Map();
    projects.forEach((p) => {
      p.roster.forEach((a) => {
        if (!merged.has(a.name)) merged.set(a.name, { ...a });
      });
    });

    let i = this.agents.size;
    for (const [name, data] of merged) {
      let a = this.agents.get(name);
      if (!a) {
        const color = new THREE.Color(data.color || '#35d0ba');
        const char = makeCharacter(color, 1);
        // Vertical light beacon rising off the character, like the reference pillars.
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 4.5, 8),
          new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false,
          })
        );
        pillar.position.y = 3.4;
        char.add(pillar);
        const label = makeLabelSprite(data.char_name || name, '#ffffff');
        label.position.set(0, 5.9, 0);
        label.scale.set(2.6, 0.65, 1);
        char.add(label);
        this.scene.add(char);
        a = {
          mesh: char,
          state: 'idle', travelT: 0, target: null,
          // Free-roam state: wander to random spots around town, pause, pick a new one.
          roamPos: COFFEE_POS.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)),
          roamTarget: null,
          roamPause: Math.random() * 1.2,
          pillar,
        };
        this.agents.set(name, a);
        i++;
      }
      a.data = data;
    }
    for (const [name, a] of this.agents) {
      if (!merged.has(name)) { this.scene.remove(a.mesh); this.agents.delete(name); }
    }
  }

  _syncPopulation(projects) {
    const real = projects.reduce((a, p) => a + p.leads_count + p.content_count + p.council_count, 0);
    this.population = real;
    const target = Math.min(real, 30);
    const wardrobe = [0x8a94b8, 0x7a6a9a, 0x5a8a7a, 0x9a7a5a, 0x6a7aaa];
    while (this.citizens.length < target) {
      const mesh = makeCharacter(wardrobe[this.citizens.length % wardrobe.length], 0.6);
      const angle = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 14;
      mesh.userData = { angle, radius: r, speed: 0.03 + Math.random() * 0.05 };
      this.scene.add(mesh);
      this.citizens.push(mesh);
    }
    while (this.citizens.length > target) {
      this.scene.remove(this.citizens.pop());
    }
  }

  updateActivity(projects) {
    const isTargeted = (name) => [...this.agents.values()].some((a) => a.state !== 'idle' && a.target === name);
    let assigned = false;
    projects.forEach((p) => {
      if (!p.queue || !p.queue.length) return;
      if (isTargeted(p.name)) return;
      const idleAgent = [...this.agents.values()].find((a) => a.state === 'idle');
      const building = this.buildings.get(p.name);
      if (idleAgent && building) {
        idleAgent.state = 'to-target';
        idleAgent.travelT = 0;
        idleAgent.target = p.name;
        assigned = true;
      }
    });
    // No pending approvals right now -- still send agents to work at projects with real
    // recorded activity, so "working" isn't gated entirely on there being something to approve.
    if (!assigned && Math.random() < 0.5) {
      const active = projects.filter((p) =>
        (p.council_count + p.content_count + p.research_count + p.leads_count) > 0 && !isTargeted(p.name));
      const idleAgent = [...this.agents.values()].find((a) => a.state === 'idle');
      if (idleAgent && active.length) {
        const pick = active[Math.floor(Math.random() * active.length)];
        const building = this.buildings.get(pick.name);
        if (building) { idleAgent.state = 'to-target'; idleAgent.travelT = 0; idleAgent.target = pick.name; }
      }
    }
    this._updateChips();
  }

  _updateChips() {
    const bar = document.getElementById('chips-bar');
    if (!bar) return;
    const chips = [];
    for (const a of this.agents.values()) {
      const status = a.state === 'idle'
        ? 'roaming'
        : a.state === 'at-target'
        ? `working: ${(a.target || '').replace(/\s*\(.*\)$/, '')}`
        : `heading to: ${(a.target || '').replace(/\s*\(.*\)$/, '')}`;
      chips.push(
        `<div class="chip" title="${(a.data.line || '').replace(/"/g, '&quot;')}">` +
        `<span class="chip-dot" style="background:${a.data.color}"></span>` +
        `<strong>${a.data.char_name}</strong><span class="chip-status">${status}</span></div>`
      );
    }
    bar.innerHTML = chips.join('');
  }

  // ---------- interaction ----------

  setWalkMode(on) {
    this.walkMode = on;
    this.playerMesh.visible = on;
    if (!on) this.setFirstPerson(false);
  }

  setFirstPerson(on) {
    this.firstPerson = on && this.walkMode;
    if (this.firstPerson) {
      this.fpYaw = this.playerMesh.rotation.y || 0;
      this.fpPitch = 0;
    } else {
      this.controls.enabled = true;
    }
  }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const agentGroups = [...this.agents.values()].map((a) => a.mesh);
    const agentHits = this.raycaster.intersectObjects(agentGroups, true);
    if (agentHits.length) {
      let node = agentHits[0].object;
      while (node && !agentGroups.includes(node)) node = node.parent;
      const hitAgent = [...this.agents.values()].find((a) => a.mesh === node);
      if (hitAgent) { this._showConversation(hitAgent); return; }
    }

    const coreHits = this.raycaster.intersectObject(this.coreHitbox, false);
    if (coreHits.length) {
      this.enterCommandCenter();
      return;
    }

    if (this.tradingRoomHitbox) {
      const tradeHits = this.raycaster.intersectObject(this.tradingRoomHitbox, false);
      if (tradeHits.length) {
        this.enterTradingRoom();
        return;
      }
    }

    // Recursive intersect -- building meshes carry a rim (LineSegments) and a label
    // (Sprite) as children, and a raycast against the group's children can resolve to
    // one of those instead of the box itself, so walk up to find the tracked mesh.
    const buildingMeshes = [...this.buildings.values()].map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(buildingMeshes, true);
    const tooltip = document.getElementById('city-tooltip');
    if (hits.length) {
      let node = hits[0].object;
      while (node && !buildingMeshes.includes(node)) node = node.parent;
      const b = [...this.buildings.values()].find((bb) => bb.mesh === node);
      if (b) {
        // One click, straight in -- no intermediate tooltip step to miss.
        tooltip.hidden = true;
        this.enterBuilding(b.data.name);
        return;
      }
    }
    tooltip.hidden = true;
  }

  _showConversation(centerAgent) {
    const box = document.getElementById('dialogue-box');
    const radius = 4;
    const nearby = [...this.agents.values()].filter(
      (a) => a.mesh.position.distanceTo(centerAgent.mesh.position) < radius
    );
    box.hidden = false;
    box.innerHTML = nearby.map((a) => `
      <div class="dialogue-line"><span class="dialogue-name" style="color:${a.data.color}">${a.data.char_name}:</span>${a.data.line}</div>
    `).join('');
    clearTimeout(this._chatTimer);
    this._chatTimer = setTimeout(() => { box.hidden = true; }, 8000);
  }

  enterBuilding(projectName) {
    const b = this.buildings.get(projectName);
    if (!b) return;
    this.currentInterior = projectName;
    const panel = document.getElementById('interior-panel');
    document.getElementById('interior-title').textContent = `Inside ${projectName}`;
    const body = document.getElementById('interior-body');
    const roster = b.data.roster || [];
    body.innerHTML = roster.map((a) => `
      <div class="desk">
        <div class="avatar" style="background:${a.color}">${(a.char_name || a.name)[0]}</div>
        <div>
          <div class="who">${a.char_name || a.name} <span class="role">— ${a.role}</span></div>
          <div class="line">${a.line}</div>
        </div>
      </div>
    `).join('') || '<div class="empty">Nobody assigned here yet.</div>';
    panel.hidden = false;
  }

  enterCommandCenter() {
    this.currentInterior = '__command_center__';
    const projects = this._allProjects || [];
    const panel = document.getElementById('interior-panel');
    document.getElementById('interior-title').textContent = 'Inside the Command Center';
    const body = document.getElementById('interior-body');

    const totalQueue = projects.reduce((a, p) => a + p.queue.length, 0);
    const chairman = projects.flatMap((p) => p.roster).find((a) => a.name === 'council-chairman');

    const summary = `
      <div class="desk" style="background:#1a1730;border-color:#3a3060">
        <div class="avatar" style="background:${chairman ? chairman.color : '#7c5cff'}">${chairman ? chairman.char_name[0] : 'P'}</div>
        <div>
          <div class="who">${chairman ? chairman.char_name : 'Priya'} <span class="role">— speaking for the Command Center</span></div>
          <div class="line">${totalQueue > 0
            ? `${totalQueue} thing${totalQueue === 1 ? '' : 's'} waiting on you across ${projects.length} project${projects.length === 1 ? '' : 's'}. Nothing moves to real-world action without your say.`
            : `All ${projects.length} project${projects.length === 1 ? '' : 's'} caught up -- nothing waiting on you right now.`}</div>
        </div>
      </div>`;

    const projectRows = projects.map((p) => `
      <div class="desk">
        <div class="avatar" style="background:#35d0ba">${p.name[0]}</div>
        <div>
          <div class="who">${p.name}</div>
          <div class="role">${p.council_count} council · ${p.content_count} content · ${p.hired_count} hired specialist${p.hired_count === 1 ? '' : 's'}</div>
          <div class="line">${p.queue.length ? `${p.queue.length} waiting on you` : 'nothing pending'}</div>
        </div>
      </div>`).join('');

    body.innerHTML = summary + (projectRows || '<div class="empty">No projects yet.</div>');
    panel.hidden = false;
  }

  enterTradingRoom() {
    this.currentInterior = '__trading_room__';
    const panel = document.getElementById('interior-panel');
    document.getElementById('interior-title').textContent = 'Inside the Trading Room';
    const body = document.getElementById('interior-body');
    const t = this._trading;
    if (!t) {
      body.innerHTML = '<div class="empty">Loading...</div>';
      panel.hidden = false;
      return;
    }
    const sign = t.gain_loss >= 0 ? '+' : '';
    const holdingsRows = Object.entries(t.holdings || {})
      .filter(([, shares]) => shares > 0.0001)
      .map(([tk, shares]) => `<div class="desk"><div class="avatar" style="background:#4ade9c">${tk[0]}</div><div><div class="who">${tk}</div><div class="role">${shares.toFixed(3)} shares @ $${(t.prices[tk] || 0).toFixed(2)}</div></div></div>`)
      .join('') || '<div class="empty">No positions held right now.</div>';
    const tradeRows = (t.trades || []).slice(0, 6).map((tr) => `
      <div class="desk">
        <div class="avatar" style="background:${tr.action === 'BUY' ? '#4ade9c' : '#ff8a6a'}">${tr.action[0]}</div>
        <div>
          <div class="who">${tr.action} ${tr.ticker} — ${tr.shares} sh @ $${tr.price}</div>
          <div class="role">${tr.reason}</div>
        </div>
      </div>`).join('') || '<div class="empty">No trades yet -- waiting for a >=1.5% move.</div>';

    body.innerHTML = `
      <div class="notice-box" style="margin-bottom:16px">SIMULATED PAPER TRADING — real market prices, fake $${t.starting_value.toLocaleString()} starting cash, no real account, no real money. A simple rule (buy small dips, trim small rallies), not live AI decision-making.</div>
      <div class="desk" style="background:#0f2018;border-color:#2a5a40">
        <div class="avatar" style="background:#4ade9c">S</div>
        <div>
          <div class="who">Sterling <span class="role">— runs this simulated desk</span></div>
          <div class="line">Portfolio value: $${t.portfolio_value.toLocaleString()} (${sign}$${t.gain_loss.toLocaleString()}, ${sign}${t.gain_loss_pct}%) · Cash: $${t.cash.toLocaleString()}</div>
        </div>
      </div>
      <h3 style="margin-top:16px">Holdings</h3>
      ${holdingsRows}
      <h3 style="margin-top:16px">Recent simulated trades</h3>
      ${tradeRows}
    `;
    panel.hidden = false;
  }

  leaveBuilding() {
    document.getElementById('interior-panel').hidden = true;
    this.currentInterior = null;
  }

  _resize() {
    const wrap = this.canvas.parentElement;
    this.renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
    this.camera.aspect = wrap.clientWidth / wrap.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  _updatePlayer(dt) {
    const speed = 6;
    const k = this.player.keys;
    const inX = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    const inZ = (k['KeyS'] || k['ArrowDown'] ? 1 : 0) - (k['KeyW'] || k['ArrowUp'] ? 1 : 0);
    const move = new THREE.Vector3(inX, 0, inZ);
    if (this.firstPerson && move.lengthSq() > 0) {
      // Movement relative to look direction, not world axes.
      const fwd = new THREE.Vector3(Math.sin(this.fpYaw), 0, Math.cos(this.fpYaw));
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      move.set(0, 0, 0)
        .addScaledVector(right, inX)
        .addScaledVector(fwd, -inZ);
    }
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      const next = this.player.pos.clone().add(move);
      let blocked = false;
      if (Math.abs(next.x) < this.core.footprint && Math.abs(next.z - 0.2) < this.core.footprint) {
        if (this.currentInterior !== '__command_center__') blocked = true;
      }
      if (this.tradingRoomIsland && Math.abs(next.x - this.tradingRoomIsland.position.x) < 1.8 && Math.abs(next.z - this.tradingRoomIsland.position.z) < 1.8) {
        if (this.currentInterior !== '__trading_room__') blocked = true;
      }
      for (const b of this.buildings.values()) {
        if (Math.abs(next.x - b.x) < b.footprint && Math.abs(next.z - b.z) < b.footprint) {
          if (this.currentInterior !== b.data.name) { blocked = true; break; }
        }
      }
      if (!blocked) this.player.pos.copy(next);
    }
    this.playerMesh.position.set(this.player.pos.x, 0.9, this.player.pos.z);
    if (this.firstPerson) {
      this.playerMesh.rotation.y = this.fpYaw;
    }

    if (this.firstPerson) {
      this.controls.enabled = false;
      this.playerMesh.visible = false; // hide "self" body in first person
      const eye = new THREE.Vector3(this.player.pos.x, 1.55, this.player.pos.z);
      this.camera.position.copy(eye);
      const look = new THREE.Vector3(
        eye.x + Math.sin(this.fpYaw) * Math.cos(this.fpPitch),
        eye.y + Math.sin(this.fpPitch),
        eye.z + Math.cos(this.fpYaw) * Math.cos(this.fpPitch)
      );
      this.camera.lookAt(look);
    } else if (this.walkMode) {
      this.controls.enabled = true;
      this.playerMesh.visible = true;
      this.controls.target.lerp(new THREE.Vector3(this.player.pos.x, 1, this.player.pos.z), 0.1);
    } else {
      this.controls.enabled = true;
    }

    if (Math.abs(this.player.pos.x) < 2.4 && Math.abs(this.player.pos.z - 0.2) < 2.4) {
      if (this.currentInterior !== '__command_center__') this.enterCommandCenter();
      return;
    }
    if (this.tradingRoomIsland && Math.abs(this.player.pos.x - this.tradingRoomIsland.position.x) < 1.4 && Math.abs(this.player.pos.z - this.tradingRoomIsland.position.z) < 1.4) {
      if (this.currentInterior !== '__trading_room__') this.enterTradingRoom();
      return;
    }
    for (const b of this.buildings.values()) {
      if (Math.abs(this.player.pos.x - b.x) < 1.6 && Math.abs(this.player.pos.z - b.z) < 1.6) {
        if (this.currentInterior !== b.data.name) this.enterBuilding(b.data.name);
        return;
      }
    }
    if (this.currentInterior) this.leaveBuilding();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const t = this.clock.getElapsedTime();
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.coreGlowMat) this.coreGlowMat.emissiveIntensity = 0.6 + Math.sin(t * 1.5) * 0.25;
    if (this.fireBeacon) this.fireBeacon.material.emissiveIntensity = 0.9 + Math.abs(Math.sin(t * 3)) * 1.2;
    this._chipTimer = (this._chipTimer || 0) + dt;
    if (this._chipTimer > 2) { this._updateChips(); this._chipTimer = 0; }

    this._dayNightTimer = (this._dayNightTimer || 0) + dt;
    if (this._dayNightTimer > 5) { this._updateDayNight(); this._dayNightTimer = 0; }

    this._animateWeatherParticles(dt);

    for (const c of this.citizens) {
      c.userData.angle += c.userData.speed * dt;
      c.position.set(
        Math.cos(c.userData.angle) * c.userData.radius,
        0.04 + Math.abs(Math.sin(t * 6 + c.userData.radius)) * 0.05,
        Math.sin(c.userData.angle) * c.userData.radius
      );
      c.rotation.y = -c.userData.angle;
    }

    for (const h of (this.houses || [])) {
      if (h.scale.x < 1) h.scale.setScalar(Math.min(1, h.scale.x + dt * 0.5));
    }

    for (const agent of this.agents.values()) {
      if (agent.state === 'idle') {
        // Free roam: pick a destination anywhere in town, walk there, pause, repeat.
        if (!agent.roamTarget) {
          if (agent.roamPause > 0) {
            agent.roamPause -= dt;
          } else {
            const spots = [
              COFFEE_POS, new THREE.Vector3(-8, 0, 8), new THREE.Vector3(0, 0, 0),
              ...[...this.buildings.values()].map((b) => new THREE.Vector3(b.x, 0, b.z)),
            ];
            const pick = spots[Math.floor(Math.random() * spots.length)];
            agent.roamTarget = pick.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
          }
        } else {
          const to = agent.roamTarget;
          const dir = new THREE.Vector3().subVectors(to, agent.roamPos);
          const dist = dir.length();
          if (dist < 0.35) {
            agent.roamTarget = null;
            agent.roamPause = 0.6 + Math.random() * 1.8;
          } else {
            dir.normalize().multiplyScalar(Math.min(2.4 * dt, dist));
            agent.roamPos.add(dir);
            agent.mesh.rotation.y = Math.atan2(dir.x, dir.z);
          }
        }
        agent.mesh.position.set(
          agent.roamPos.x,
          0.06 + (agent.roamTarget ? Math.abs(Math.sin(t * 7)) * 0.05 : 0),
          agent.roamPos.z
        );
      } else if (agent.state === 'to-target' || agent.state === 'to-home') {
        agent.travelT += dt * 0.45;
        const building = this.buildings.get(agent.target);
        if (!building) { agent.state = 'idle'; continue; }
        // Walk street-style: down to ground, along x, then along z -- not a straight float.
        const start = agent.state === 'to-target' ? agent.roamPos.clone().setY(0) : new THREE.Vector3(building.x, 0, building.z);
        const end = agent.state === 'to-target' ? new THREE.Vector3(building.x, 0, building.z) : COFFEE_POS.clone();
        const corner = new THREE.Vector3(end.x, 0, start.z);
        const tt = Math.min(agent.travelT, 1);
        const pos = new THREE.Vector3();
        if (tt < 0.5) pos.lerpVectors(start, corner, tt * 2);
        else pos.lerpVectors(corner, end, (tt - 0.5) * 2);
        pos.y = 0.06 + Math.abs(Math.sin(t * 7)) * 0.05;
        const dir = (tt < 0.5)
          ? Math.atan2(corner.x - start.x, corner.z - start.z)
          : Math.atan2(end.x - corner.x, end.z - corner.z);
        agent.mesh.rotation.y = dir;
        agent.mesh.position.copy(pos);
        if (tt >= 1) {
          agent.roamPos.copy(pos).setY(0);
          if (agent.state === 'to-target') { agent.state = 'at-target'; agent.travelT = 0; }
          else {
            agent.state = 'idle'; agent.target = null;
            agent.roamTarget = null; agent.roamPause = 0.4 + Math.random() * 1.2;
            if (agent.pillar) agent.pillar.material.opacity = 0.5;
            this._updateChips();
          }
        }
      } else if (agent.state === 'at-target') {
        agent.travelT += dt;
        // Visibly "working": brisk pulse and a little heads-down bob, distinct from idle roaming.
        if (agent.pillar) agent.pillar.material.opacity = 0.55 + Math.abs(Math.sin(t * 9)) * 0.45;
        agent.mesh.position.y = 0.06 + Math.abs(Math.sin(t * 10)) * 0.03;
        agent.mesh.rotation.z = Math.sin(t * 9) * 0.05;
        if (agent.travelT > 4) { agent.state = 'to-home'; agent.travelT = 0; agent.mesh.rotation.z = 0; }
      }
    }

    this._updatePlayer(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

let city;

function wireWalkToggle() {
  const btn = document.getElementById('walk-toggle');
  const fpBtn = document.getElementById('fp-toggle');
  const hint = document.getElementById('city-hint');
  btn.addEventListener('click', () => {
    if (!city) { alert('3D view failed to load in this browser, so there\'s no character to control.'); return; }
    const on = !city.walkMode;
    city.setWalkMode(on);
    btn.classList.toggle('active', on);
    btn.textContent = on ? '🖱️ Free camera' : '🚶 Join as character';
    fpBtn.hidden = !on;
    if (!on) { fpBtn.classList.remove('active'); fpBtn.textContent = '👁️ First person'; }
    hint.textContent = on
      ? 'WASD / arrows to walk · walk into a building to enter it'
      : 'Drag to look around · scroll to zoom · click a building or character';
  });
  fpBtn.addEventListener('click', () => {
    if (!city) return;
    const on = !city.firstPerson;
    city.setFirstPerson(on);
    fpBtn.classList.toggle('active', on);
    fpBtn.textContent = on ? '🖱️ Overhead view' : '👁️ First person';
    hint.textContent = on
      ? 'Drag to look around · WASD to walk in the direction you\'re facing'
      : 'WASD / arrows to walk · walk into a building to enter it';
  });
  document.getElementById('interior-leave').addEventListener('click', () => { if (city) city.leaveBuilding(); });
}

let cityFailed = false;

function fallBackTo2D(err) {
  console.warn('WebGL city failed, switching to 2D canvas fallback:', err && err.message);
  document.getElementById('city-canvas').hidden = true;
  document.getElementById('city-canvas-2d').hidden = false;
  const banner = document.createElement('div');
  banner.className = 'city-2d-banner';
  banner.textContent = '2D view (WebGL unavailable in this browser) — same real data, simpler graphics.';
  document.getElementById('city-canvas').parentElement.prepend(banner);
  window.__startCity2D();
}

async function refresh() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();
    if (!city && !cityFailed) {
      try {
        city = new City(document.getElementById('city-canvas'));
        wireWalkToggle();
      } catch (err) {
        cityFailed = true;
        fallBackTo2D(err); // this wires its own 2D toggle button handlers instead
      }
    }
    if (!city) return;
    city.setProjects(s.projects);
    city.updateActivity(s.projects);
    city.applyWeather(s.weather);
    city._trading = s.trading;
    if (city.currentInterior === '__trading_room__') city.enterTradingRoom();
  } catch (err) {
    console.error('city refresh failed', err);
  }
}

refresh();
setInterval(refresh, 8000);
