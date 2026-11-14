import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const $ = selector => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const NAMES = ['Mika', 'Jonah', 'Claudette', 'Felix'];
const vec = (x = 0, z = 0) => new THREE.Vector3(x, 0, z);
let game;

document.querySelectorAll('[data-role]').forEach(button => button.onclick = () => start(button.dataset.role));
$('#again').onclick = () => location.reload();

function start(role) {
  $('#lobby').hidden = true;
  $('#game').hidden = false;
  game = new Game(role);
  window.dbdGame = game;
  game.run();
}

class Game {
  constructor(role) {
    this.role = role;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x182019);
    this.scene.fog = new THREE.FogExp2(0x182019, .028);
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 160);
    this.renderer = new THREE.WebGLRenderer({ canvas: $('#world'), antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.clock = new THREE.Clock();
    this.keys = {};
    this.yaw = 0;
    this.pitch = -0.42;
    this.time = 0;
    this.completed = 0;
    this.ended = false;
    this.holdAction = false;
    this.mouseDownAt = 0;
    this.longSwing = false;
    this.action = null;
    this.skill = null;
    this.walls = [];
    this.tiles = [];
    this.pallets = [];
    this.windows = [];
    this.generators = [];
    this.gates = [];
    this.hooks = [];
    this.survivors = [];
    this.traces = [];
    this.spawnPositions = [];
    this.tileCenters = [];
    this.audioContext = null;
    this.setupWorld();
    this.setupInput();
  }

  setupWorld() {
    this.scene.add(new THREE.HemisphereLight(0xb7c9a8, 0x121812, 2.4));
    const sun = new THREE.DirectionalLight(0xffe9af, 1.7);
    sun.position.set(30, 42, -10);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), new THREE.MeshStandardMaterial({ color: 0x334431, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(96, 96, 0x647257, 0x42503e);
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    this.scene.add(grid);
    const boundary = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(96, 0.08, 96)), new THREE.LineBasicMaterial({ color: 0xb2935d }));
    boundary.position.y = 0.08;
    this.scene.add(boundary);
    this.addTiles();
    this.addObjectives();
    this.addScenery();
    NAMES.forEach((name, index) => this.makeSurvivor(name, index));
    this.makeKiller();
    this.player = this.role === 'killer' ? this.killer : this.survivors[0];
    if (this.role === 'killer') {
      this.killer.mesh.visible = false;
      this.weaponView = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, 1.3), new THREE.MeshStandardMaterial({ color: 0xc9d0d3, metalness: .9, roughness: .2 }));
      this.weaponView.position.set(.42, -.32, -.75);
      this.weaponView.rotation.z = -.35;
      this.camera.add(this.weaponView);
      this.scene.add(this.camera);
    }
    if (this.role === 'killer') this.generators.forEach(generator => { generator.mesh.material.emissive.set(0x315c70); generator.aura.visible = true; });
    $('#role').textContent = `PLAYING AS ${this.role.toUpperCase()}`;
  }

  clearPosition(minEdge = 7, minDistance = 7) {
    let point;
    const objects = [...this.walls, ...this.generators, ...this.gates, ...this.hooks];
    for (let attempt = 0; attempt < 150; attempt++) {
      point = vec((Math.random() - .5) * (96 - minEdge * 2), (Math.random() - .5) * (96 - minEdge * 2));
      if (!objects.some(object => object.pos.distanceTo(point) < minDistance)) return point;
    }
    // Never block match initialization if procedural placement becomes crowded.
    return point;
  }

  spawnPosition(side = 0) {
    let point = this.clearPosition(14, 7);
    for (let attempt = 0; attempt < 80 && (this.spawnPositions.some(other => other.distanceTo(point) < 6) || (side && Math.sign(point.x) !== side)); attempt++) point = this.clearPosition(14, 7);
    this.spawnPositions.push(point.clone());
    return point;
  }

  addWall(pos, width, depth) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 4.8, depth), new THREE.MeshStandardMaterial({ color: 0x363b33, roughness: .95 }));
    mesh.position.copy(pos);
    mesh.position.y = 2.4;
    this.scene.add(mesh);
    const wall = { pos: pos.clone(), width, depth, mesh, active: true };
    this.walls.push(wall);
    return wall;
  }

  addTiles() {
    // 22m grid spacing keeps tile footprints from merging into unreadable clusters.
    const slots = [-30, -8, 14, 36].flatMap(x => [-30, -8, 14].map(z => vec(x, z))).sort(() => Math.random() - .5);
    for (let index = 0; index < 10; index++) {
      const p = slots[index].clone().add(vec((Math.random() - .5) * 4, (Math.random() - .5) * 4));
      this.tileCenters.push(p.clone());
      const form = index % 5;
      if (form === 0) {
        this.addWall(p.clone().add(vec(-2.5, 0)), 1, 9);
        this.addWall(p.clone().add(vec(2, 3.5)), 8, 1);
      } else if (form === 1) {
        this.addWall(p, 9, 1);
        this.addWall(p.clone().add(vec(0, 4)), 1, 8);
      } else if (form === 2) {
        this.addWall(p.clone().add(vec(-3, 0)), 1, 8);
        this.addWall(p.clone().add(vec(3, 0)), 1, 8);
        this.addWall(p.clone().add(vec(0, -3.5)), 7, 1);
      } else if (form === 3) this.addWall(p, 7, 4);
      else {
        this.addWall(p.clone().add(vec(-4, -3)), 8, 1);
        this.addWall(p.clone().add(vec(4, 3)), 8, 1);
        this.addWall(p.clone().add(vec(-7.5, 0)), 1, 7);
      }
      this.addWindow(p.clone().add(vec(4.5, 0)), index % 2 === 0 ? 0 : Math.PI / 2);
      this.addPallet(p.clone().add(vec(-4.5, 0)), index % 2 === 0 ? 0 : Math.PI / 2);
    }
  }

  addScenery() {
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x435a36, roughness: 1 });
    for (let index = 0; index < 110; index++) {
      const pos = vec((Math.random() - .5) * 90, (Math.random() - .5) * 90);
      if (this.walls.some(wall => wall.pos.distanceTo(pos) < 2)) continue;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(.16 + Math.random() * .16, .55 + Math.random() * .45, 4), grassMaterial);
      tuft.position.copy(pos);
      tuft.position.y = .3;
      tuft.rotation.y = Math.random() * Math.PI;
      this.scene.add(tuft);
    }
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x30372e, roughness: .95 });
    [[-46, -46], [46, -46], [-46, 46], [46, 46]].forEach(([x, z]) => {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 5), wallMaterial);
      corner.position.set(x, 1.75, z);
      this.scene.add(corner);
    });
    // Solid visual perimeter so the arena feels contained rather than cut off.
    this.addWall(vec(0, -47.5), 96, 1);
    this.addWall(vec(0, 47.5), 96, 1);
    this.addWall(vec(-47.5, 0), 1, 96);
    this.addWall(vec(47.5, 0), 1, 96);
    const mistMaterial = new THREE.MeshBasicMaterial({ color: 0xa5b8a0, transparent: true, opacity: .055, depthWrite: false, side: THREE.DoubleSide });
    for (let index = 0; index < 22; index++) {
      const bank = new THREE.Mesh(new THREE.PlaneGeometry(10 + Math.random() * 10, 1.8 + Math.random() * 2), mistMaterial);
      bank.position.set((Math.random() - .5) * 84, .8 + Math.random() * 1.6, (Math.random() - .5) * 84);
      bank.rotation.y = Math.random() * Math.PI;
      this.scene.add(bank);
    }
  }

  addWindow(pos, rotation) {
    const frame = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x8a6b43, roughness: .9 });
    [-1.1, 1.1].forEach(x => { const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 3.2, .28), material); post.position.set(x, 1.6, 0); frame.add(post); });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.4, .25, .28), material);
    lintel.position.y = 3.15;
    frame.add(lintel);
    frame.position.copy(pos);
    frame.rotation.y = rotation;
    this.scene.add(frame);
    // A window is a gap between two wall sections, not a solid panel.
    if (rotation === 0) {
      this.addWall(pos.clone().add(vec(-3.2, 0)), 4, .7);
      this.addWall(pos.clone().add(vec(3.2, 0)), 4, .7);
    } else {
      this.addWall(pos.clone().add(vec(0, -3.2)), .7, 4);
      this.addWall(pos.clone().add(vec(0, 3.2)), .7, 4);
    }
    this.windows.push({ pos, mesh: frame, rotation });
  }

  addPallet(pos, rotation) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.15, .22), new THREE.MeshStandardMaterial({ color: 0x94633d, roughness: 1 }));
    mesh.position.copy(pos);
    mesh.position.y = 1.08;
    mesh.rotation.y = rotation;
    this.scene.add(mesh);
    const pallet = { pos, mesh, rotation, state: 'upright', wall: null };
    this.pallets.push(pallet);
  }

  addObjective(pos, color, type) {
    const mesh = type === 'gate'
      ? new THREE.Mesh(new THREE.BoxGeometry(5, 4.8, .8), new THREE.MeshStandardMaterial({ color, emissive: 0x000000, roughness: .7 }))
      : new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 2.25, 8), new THREE.MeshStandardMaterial({ color, emissive: 0x000000, roughness: .7 }));
    mesh.position.copy(pos);
    mesh.position.y = type === 'gate' ? 2.4 : 1.125;
    if (type === 'generator') {
      const motor = new THREE.Mesh(new THREE.BoxGeometry(1.45, .45, .65), new THREE.MeshStandardMaterial({ color: 0x20251f, roughness: .75 }));
      motor.position.y = .8;
      [-.48, .48].forEach(x => { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0x857c68, metalness: .4, roughness: .55 })); pipe.position.set(x, 1.6, 0); mesh.add(pipe); });
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .9, 10), new THREE.MeshStandardMaterial({ color: 0xb69040, emissive: 0x2c2109 }));
      pump.rotation.z = Math.PI / 2;
      pump.position.set(0, 1.25, 0);
      mesh.add(motor, pump);
      mesh.pump = pump;
    }
    if (type === 'hook') {
      mesh.scale.set(.45, 1.8, .45);
      const hookMaterial = new THREE.MeshStandardMaterial({ color: 0x534c43, metalness: .7, roughness: .45 });
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, .14, .14), hookMaterial);
      arm.position.set(.45, 2.8, 0);
      const curve = new THREE.Mesh(new THREE.TorusGeometry(.38, .07, 8, 14, Math.PI * 1.35), hookMaterial);
      curve.rotation.set(0, Math.PI / 2, Math.PI * .32);
      curve.position.set(.95, 2.43, 0);
      mesh.add(arm, curve);
    }
    if (type === 'gate') {
      [-1.9, 1.9].forEach(x => { const post = new THREE.Mesh(new THREE.BoxGeometry(.35, 5.4, .35), new THREE.MeshStandardMaterial({ color: 0x28231b, roughness: .85 })); post.position.set(x, 0, 0); mesh.add(post); });
    }
    this.scene.add(mesh);
    const aura = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 20), new THREE.MeshBasicMaterial({ color: 0x5da9d1, transparent: true, opacity: .78, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    aura.position.copy(pos);
    aura.position.y = type === 'gate' ? 6.3 : 3.7;
    aura.rotation.x = -Math.PI / 2;
    aura.visible = false;
    aura.renderOrder = 10;
    this.scene.add(aura);
    return { pos: pos.clone(), mesh, aura, type };
  }

  addObjectives() {
    for (let index = 0; index < 7; index++) {
      const generator = this.addObjective(this.clearPosition(9, 9), 0x4b6755, 'generator');
      Object.assign(generator, { progress: 0, done: false, workers: [], nextSkill: 5 + Math.random() * 6, alert: 0 });
      this.generators.push(generator);
    }
    [[-41, -35], [41, 35]].forEach(([x, z]) => {
      const gate = this.addObjective(vec(x, z), 0x876331, 'gate');
      Object.assign(gate, { progress: 0, open: false });
      gate.aura.material.color.set(0xa04a39);
      gate.aura.visible = this.role === 'killer';
      this.gates.push(gate);
    });
    for (let index = 0; index < 16; index++) {
      const hook = this.addObjective(this.clearPosition(5, 6), 0x857565, 'hook');
      hook.mesh.scale.set(.6, 1.15, .6);
      this.hooks.push(hook);
    }
  }

  makeActor(name, color, pos, type) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, roughness: .68 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.42, .72, 5, 10), material);
    body.position.y = 1.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.31, 14, 12), new THREE.MeshStandardMaterial({ color: type === 'killer' ? 0x9e3932 : 0xd5ad8f, roughness: .8 }));
    head.position.y = 2.23;
    const armMaterial = new THREE.MeshStandardMaterial({ color: type === 'killer' ? 0x72251f : 0x487f89, roughness: .72 });
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(.12, .48, 4, 8), armMaterial);
    const rightArm = leftArm.clone();
    leftArm.position.set(-.5, 1.48, 0);
    rightArm.position.set(.5, 1.48, 0);
    const legMaterial = new THREE.MeshStandardMaterial({ color: type === 'killer' ? 0x321715 : 0x233c46, roughness: .8 });
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(.14, .5, 4, 8), legMaterial);
    const rightLeg = leftLeg.clone();
    leftLeg.position.set(-.2, .48, 0);
    rightLeg.position.set(.2, .48, 0);
    let weapon;
    if (type === 'killer') {
      weapon = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 1.25), new THREE.MeshStandardMaterial({ color: 0xb8bbc0, metalness: .85, roughness: .28 }));
      weapon.position.set(0, -.42, -.55);
      rightArm.add(weapon);
    }
    group.add(body, head, leftArm, rightArm, leftLeg, rightLeg);
    group.position.copy(pos);
    this.scene.add(group);
    return { name, type, mesh: group, body, head, arms: [leftArm, rightArm], legs: [leftLeg, rightLeg], weapon, pos: group.position, state: 'active', health: 'healthy', marks: 0, cooldown: 0, healProgress: 0, hookTime: 0, bleed: 0, stun: 0, animation: 'idle', animationTime: 0 };
  }

  makeSurvivor(name, index) {
    const survivor = this.makeActor(name, 0x5197a4, this.spawnPosition(-1), 'survivor');
    survivor.isPlayer = this.role === 'survivor' && index === 0;
    this.survivors.push(survivor);
  }

  makeKiller() {
    this.killer = this.makeActor('The Hunter', 0x9d382e, this.spawnPosition(1), 'killer');
    this.killer.isPlayer = this.role === 'killer';
  }

  setupInput() {
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); });
    addEventListener('keydown', event => { this.keys[event.code] = true; if (event.code === 'Space') { event.preventDefault(); this.space(); } });
    addEventListener('keyup', event => this.keys[event.code] = false);
    const canvas = $('#world');
    canvas.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      canvas.requestPointerLock();
      this.enableAudio();
      this.holdAction = true;
      this.mouseDownAt = performance.now();
      if (this.player.type === 'killer' && this.player.cooldown <= 0) this.startLongSwing();
    });
    addEventListener('mouseup', event => {
      if (event.button !== 0) return;
      const held = performance.now() - this.mouseDownAt;
      this.holdAction = false;
      if (this.player.type === 'killer' && this.player.longSwing && held < 660) {
        clearTimeout(this.player.swingTimer);
        this.player.longSwing = false;
        this.attack();
      }
    });
    addEventListener('mousemove', event => {
      if (document.pointerLockElement !== canvas) return;
    this.yaw -= event.movementX * .0025;
      this.pitch = clamp(this.pitch - event.movementY * .0025, -1.1, .12);
    });
  }

  enableAudio() {
    if (!this.audioContext) this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
  }

  sound(type) {
    if (!this.audioContext || this.audioContext.state !== 'running') return;
    const settings = {
      step: [95, .035, 'triangle'], swing: [150, .12, 'sawtooth'], hit: [65, .22, 'square'],
      pickup: [105, .18, 'triangle'], hook: [52, .28, 'sawtooth'], unhook: [175, .16, 'triangle'], vault: [240, .1, 'triangle'],
      pallet: [70, .18, 'square'], repair: [180, .045, 'square'], fail: [360, .22, 'sawtooth'],
      generator: [82, .12, 'square'], gate: [310, .2, 'sine'], moan: [130, .2, 'sine'], stun: [48, .25, 'sawtooth'], wiggle: [150, .09, 'triangle']
    }[type];
    if (!settings) return;
    const [frequency, duration, wave] = settings;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * .55), this.audioContext.currentTime + duration);
    gain.gain.setValueAtTime(.055, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, this.audioContext.currentTime + duration);
    oscillator.connect(gain).connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  move(actor, direction, speed, dt) {
    if (actor.state !== 'active' || actor.stun > 0 || actor.vaulting || !direction.length()) return false;
    const next = actor.pos.clone().addScaledVector(direction.normalize(), speed * dt);
    if (this.isBlocked(next, actor)) return false;
    actor.pos.copy(next);
    actor.mesh.rotation.y = Math.atan2(direction.x, direction.z);
    actor.walking = true;
    if (actor === this.player && actor.type === 'killer' && (!actor.lastStep || this.time - actor.lastStep > .42)) { actor.lastStep = this.time; this.sound('step'); }
    return true;
  }

  isBlocked(point, actor = null) {
    const actors = [this.killer, ...this.survivors].filter(other => other && other !== actor && other.state === 'active');
    const solidObjectives = [...this.generators, ...this.hooks].some(object => object.pos.distanceTo(point) < 1.05) || this.gates.some(gate => Math.abs(point.x - gate.pos.x) < 2.8 && Math.abs(point.z - gate.pos.z) < .75);
    return Math.abs(point.x) > 47 || Math.abs(point.z) > 47 || solidObjectives || this.walls.some(wall => wall.active && Math.abs(point.x - wall.pos.x) < wall.width / 2 + .42 && Math.abs(point.z - wall.pos.z) < wall.depth / 2 + .42) || actors.some(other => other.pos.distanceTo(point) < .8);
  }

  canSee(observer, target) {
    const distance = observer.pos.distanceTo(target.pos);
    if (distance > 24) return false;
    const steps = Math.ceil(distance / .6);
    for (let step = 1; step < steps; step++) {
      const point = observer.pos.clone().lerp(target.pos, step / steps);
      if (this.walls.some(wall => wall.active && Math.abs(point.x - wall.pos.x) < wall.width / 2 && Math.abs(point.z - wall.pos.z) < wall.depth / 2)) return false;
    }
    return true;
  }

  moveToward(actor, target, speed, dt) {
    const direction = target.clone().sub(actor.pos);
    const angles = [0, .32, -.32, .65, -.65, 1, -1, 1.45, -1.45, Math.PI];
    for (const angle of angles) {
      const candidate = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      if (this.move(actor, candidate, speed, dt)) return;
    }
  }

  gridCell(point) { return { x: clamp(Math.floor((point.x + 48) / 2), 0, 47), z: clamp(Math.floor((point.z + 48) / 2), 0, 47) }; }

  gridPoint(cell) { return vec(cell.x * 2 - 47, cell.z * 2 - 47); }

  staticBlocked(cell) {
    const point = this.gridPoint(cell);
    return this.walls.some(wall => wall.active && Math.abs(point.x - wall.pos.x) < wall.width / 2 + .25 && Math.abs(point.z - wall.pos.z) < wall.depth / 2 + .25) || this.generators.some(generator => generator.pos.distanceTo(point) < 1) || this.hooks.some(hook => hook.pos.distanceTo(point) < 1);
  }

  findPath(from, to) {
    const start = this.gridCell(from);
    let goal = this.gridCell(to);
    if (this.staticBlocked(goal)) {
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => ({ x: goal.x + x, z: goal.z + z })).filter(cell => cell.x >= 0 && cell.x < 48 && cell.z >= 0 && cell.z < 48 && !this.staticBlocked(cell));
      goal = options.sort((a, b) => this.gridPoint(a).distanceTo(to) - this.gridPoint(b).distanceTo(to))[0] || goal;
    }
    const key = cell => `${cell.x},${cell.z}`;
    const open = [start], came = new Map(), score = new Map([[key(start), 0]]), estimate = cell => Math.abs(cell.x - goal.x) + Math.abs(cell.z - goal.z);
    while (open.length) {
      open.sort((a, b) => (score.get(key(a)) + estimate(a)) - (score.get(key(b)) + estimate(b)));
      const current = open.shift();
      if (current.x === goal.x && current.z === goal.z) {
        const path = [];
        let node = current;
        while (came.has(key(node))) { path.unshift(this.gridPoint(node)); node = came.get(key(node)); }
        return path;
      }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([x, z]) => {
        const next = { x: current.x + x, z: current.z + z };
        if (next.x < 0 || next.x >= 48 || next.z < 0 || next.z >= 48 || this.staticBlocked(next)) return;
        const nextKey = key(next), value = score.get(key(current)) + 1;
        if (value < (score.get(nextKey) ?? Infinity)) { came.set(nextKey, current); score.set(nextKey, value); if (!open.some(cell => cell.x === next.x && cell.z === next.z)) open.push(next); }
      });
    }
    return [];
  }

  navigate(actor, target, speed, dt) {
    const targetCell = this.gridCell(target);
    if (!actor.route || !actor.routeTarget || actor.routeTarget.x !== targetCell.x || actor.routeTarget.z !== targetCell.z || this.time - actor.routeAt > .9) {
      actor.route = this.findPath(actor.pos, target);
      actor.routeIndex = 0;
      actor.routeTarget = targetCell;
      actor.routeAt = this.time;
    }
    while (actor.route && actor.routeIndex < actor.route.length && actor.pos.distanceTo(actor.route[actor.routeIndex]) < .6) actor.routeIndex++;
    const waypoint = actor.route?.[actor.routeIndex] || target;
    this.moveToward(actor, waypoint, speed, dt);
  }

  playerMove(dt) {
    const player = this.player;
    if (player.state !== 'active' || this.action || (player.type === 'survivor' && this.holdAction && player.repairing)) return;
    const forward = vec(Math.sin(this.yaw), Math.cos(this.yaw));
    const right = vec(forward.z, -forward.x);
    const direction = vec();
    if (this.keys.KeyW) direction.add(forward);
    if (this.keys.KeyS) direction.sub(forward);
    if (this.keys.KeyA) direction.add(right);
    if (this.keys.KeyD) direction.sub(right);
    let speed = player.type === 'killer' ? 4.6 : 2.2;
    if (player.type === 'survivor') {
      if (this.keys.ControlLeft || this.keys.ControlRight) speed = 1.3;
      else if (this.keys.ShiftLeft || this.keys.ShiftRight) speed = 4;
      if (speed === 4 && direction.length()) this.leaveTrace(player, 'foot');
    }
    if (player.carrying) speed = 3;
    if (player.longSwing) speed = 5;
    if (player.cooldown > 0) speed = 2;
    this.move(player, direction, speed, dt);
  }

  leaveTrace(survivor, type) {
    if (survivor.lastTrace && this.time - survivor.lastTrace < .35) return;
    survivor.lastTrace = this.time;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(type === 'blood' ? .13 : .1, 8), new THREE.MeshBasicMaterial({ color: type === 'blood' ? 0x711b15 : 0x161817, transparent: true }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(survivor.pos);
    mesh.position.y = .025;
    this.scene.add(mesh);
    this.traces.push({ mesh, time: 5 });
    if (type === 'foot' && survivor === this.player) this.sound('step');
  }

  nearest(list, actor, radius = 2) { return list.filter(item => item.pos.distanceTo(actor.pos) < radius).sort((a, b) => a.pos.distanceTo(actor.pos) - b.pos.distanceTo(actor.pos))[0]; }

  startAction(label, duration, target, complete) {
    if (!this.action || this.action.target !== target || this.action.label !== label) {
      this.action = { label, duration, target, complete, progress: 0 };
      this.player.animation = label === 'BREAKING PALLET' ? 'break' : label === 'PICKING UP SURVIVOR' ? 'pickup' : 'interact';
      this.player.animationTime = 0;
    }
    return this.action;
  }

  cancelAction() { this.action = null; if (this.player.animation === 'interact') this.player.animation = 'idle'; }

  progressAction(dt) {
    if (!this.action) return;
    this.action.progress += dt / this.action.duration;
    if (this.action.progress >= 1) {
      const done = this.action.complete;
      this.action = null;
      this.player.animation = 'idle';
      done();
    }
  }

  survivorAction(dt) {
    const player = this.player;
    if (!this.holdAction || player.state !== 'active' || this.skill) { if (!this.holdAction) this.cancelAction(); return; }
    const generator = this.nearest(this.generators.filter(item => !item.done), player);
    const gate = this.completed >= 5 && this.nearest(this.gates.filter(item => !item.open), player);
    const hooked = this.nearest(this.survivors.filter(item => item.state === 'hooked'), player);
    const dying = this.nearest(this.survivors.filter(item => item !== player && item.health === 'dying'), player);
    const injured = this.nearest(this.survivors.filter(item => item !== player && item.health === 'injured'), player);
    if (generator) {
      this.cancelAction();
      this.repair(generator, player, dt);
    } else if (gate) {
      const action = this.startAction('OPENING EXIT GATE', 15, gate, () => { gate.open = true; gate.mesh.material.emissive.set(0x2d9e40); this.sound('gate'); });
      this.progressAction(dt);
    } else if (hooked) {
      const action = this.startAction('UNHOOKING', 2, hooked, () => { hooked.state = 'active'; hooked.hook.occupant = null; hooked.hook = null; hooked.health = 'injured'; hooked.body.material.emissive.set(0xa32620); this.sound('unhook'); });
      this.progressAction(dt);
    } else if (dying) {
      const action = this.startAction('REVIVING', 15, dying, () => { dying.health = 'injured'; dying.body.material.emissive.set(0xa32620); });
      this.progressAction(dt);
    } else if (injured) {
      const action = this.startAction('HEALING', 25 * (1 - injured.healProgress), injured, () => { injured.health = 'healthy'; injured.healProgress = 0; injured.body.material.emissive.set(0x5197a4); });
      this.progressAction(dt);
      injured.healProgress = clamp(action.progress, 0, 1);
    } else { player.repairing = null; this.cancelAction(); }
  }

  repair(generator, survivor, dt) {
    const workers = this.survivors.filter(item => item.state === 'active' && item.pos.distanceTo(generator.pos) < 2 && item.repairing === generator);
    if (!workers.includes(survivor)) workers.push(survivor);
    generator.workers = workers;
    if (survivor === this.player && (!generator.lastSound || this.time - generator.lastSound > .7)) { generator.lastSound = this.time; this.sound('repair'); }
    survivor.repairing = generator;
    survivor.animation = 'repair';
    const rate = (1 + .15 * Math.min(2, workers.length - 1)) / 100;
    generator.progress = clamp(generator.progress + rate * dt, 0, 1);
    if (generator.mesh.pump) generator.mesh.pump.rotation.x += dt * (2 + generator.progress * 14) * workers.length;
    generator.nextSkill -= dt;
    if (generator.nextSkill <= 0 && survivor.isPlayer && !this.skill) this.startSkill(generator);
    if (generator.progress >= 1) this.completeGenerator(generator);
  }

  startSkill(generator) {
    this.skill = { generator, elapsed: 0, zone: .15 + Math.random() * .55, type: generator ? 'generator' : 'hook' };
    $('#skill').hidden = false;
  }

  resolveSkill() {
    if (!this.skill) return false;
    const skill = this.skill;
    const success = skill.elapsed >= skill.zone && skill.elapsed <= skill.zone + .2;
    if (skill.type === 'generator') {
      skill.generator.progress = clamp(skill.generator.progress + (success ? .02 : -.1), 0, 1);
      if (!success) { skill.generator.alert = 3; skill.generator.mesh.material.emissive.set(0xc74a28); this.sound('fail'); }
      skill.generator.nextSkill = 5 + Math.random() * 6;
    } else if (!success) skill.hooked.hookTime = Math.max(0, skill.hooked.hookTime - 7);
    this.skill = null;
    $('#skill').hidden = true;
    return true;
  }

  completeGenerator(generator) {
    if (generator.done) return;
    generator.done = true;
    this.sound('generator');
    generator.aura.visible = false;
    generator.mesh.material.emissive.set(0xd2b039);
    this.completed++;
    if (this.completed >= 5) this.gates.forEach(gate => { gate.aura.material.color.set(0xd0b143); gate.aura.visible = this.role === 'killer'; });
    setTimeout(() => { if (generator.done) generator.mesh.material.emissive.set(0x000000); }, 3000);
  }

  space() {
    if (this.resolveSkill()) return;
    const player = this.player;
    if (player.type === 'survivor') {
      const window = this.nearest(this.windows, player, 1.8);
      const pallet = this.nearest(this.pallets.filter(item => item.state === 'upright' || item.state === 'dropped'), player, 1.8);
      if (window) this.vault(player, window, 1);
      else if (pallet?.state === 'upright') this.dropPallet(pallet);
      else if (pallet) this.vault(player, pallet, .7);
      return;
    }
    const carried = player.carrying;
    const hook = this.nearest(this.hooks.filter(item => !item.occupant), player);
    const dying = this.nearest(this.survivors.filter(item => item.health === 'dying' && item.state === 'active'), player);
    const generator = this.nearest(this.generators.filter(item => !item.done && item.progress > 0), player);
    const pallet = this.nearest(this.pallets.filter(item => item.state === 'dropped'), player);
    const window = this.nearest(this.windows, player, 1.8);
    if (carried && hook) this.startAction('HOOKING SURVIVOR', 2, hook, () => this.hookSurvivor(carried, hook));
    else if (dying) this.pickup(dying);
    else if (generator) this.startAction('DAMAGING GENERATOR', 2, generator, () => { generator.progress = Math.max(0, generator.progress - .1); generator.alert = 1; this.sound('generator'); });
    else if (pallet) this.breakPallet(pallet);
    else if (window) this.vault(player, window, 1.5);
  }

  vault(actor, window, seconds) {
    if (actor.vaulting || actor.state !== 'active') return;
    actor.vaulting = true;
    actor.stun = seconds;
    actor.animation = 'vault';
    actor.animationTime = 0;
    if (actor === this.player) this.sound('vault');
    const normal = vec(Math.sin(window.rotation), Math.cos(window.rotation));
    const direction = actor.pos.clone().sub(window.pos).dot(normal) >= 0 ? normal : normal.clone().negate();
    setTimeout(() => {
      const distance = actor.type === 'killer' ? 1.7 : 2.2;
      const choices = [direction, vec(direction.z, -direction.x), vec(-direction.z, direction.x), direction.clone().negate()];
      const landing = choices.map(choice => actor.pos.clone().addScaledVector(choice, distance)).find(point => !this.isBlocked(point));
      if (landing) actor.pos.copy(landing);
      actor.vaulting = false;
      actor.animation = 'idle';
    }, seconds * 1000);
  }

  dropPallet(pallet) {
    pallet.state = 'dropped';
    pallet.mesh.position.y = .14;
    pallet.mesh.rotation.x = Math.PI / 2;
    pallet.mesh.rotation.y = pallet.rotation;
    pallet.wall = { pos: pallet.pos, width: pallet.rotation ? .75 : 2.4, depth: pallet.rotation ? 2.4 : .75, active: true };
    this.walls.push(pallet.wall);
    this.sound('pallet');
    if (this.killer.pos.distanceTo(pallet.pos) < 2.1) { this.killer.stun = 2; this.sound('stun'); }
  }

  breakPallet(pallet) {
    this.startAction('BREAKING PALLET', 2, pallet, () => { pallet.state = 'broken'; pallet.wall.active = false; this.scene.remove(pallet.mesh); });
  }

  attack() {
    const killer = this.killer;
    if (killer.cooldown > 0 || killer.stun > 0) return;
    killer.animation = 'swing';
    this.sound('swing');
    killer.animationTime = 0;
    const target = this.nearest(this.survivors.filter(item => item.state === 'active'), killer, 2.3);
    if (target) this.hit(target);
    else killer.cooldown = 1;
  }

  startLongSwing() {
    const killer = this.killer;
    killer.longSwing = true;
    killer.animation = 'lunge';
    killer.animationTime = 0;
    killer.swingTimer = setTimeout(() => { if (this.holdAction && killer.longSwing) { killer.longSwing = false; this.attack(); } }, 660);
  }

  hit(survivor) {
    const killer = this.killer;
    if (!survivor || killer.cooldown > 0) return;
    killer.cooldown = killer.isPlayer ? 2 : 3;
    survivor.animation = 'flinch';
    this.sound('hit');
    survivor.animationTime = 0;
    survivor.healProgress = 0;
    if (survivor.health === 'healthy') {
      survivor.health = 'injured';
      survivor.body.material.emissive.set(0xa32620);
    } else {
      survivor.health = 'dying';
      survivor.body.material.emissive.set(0x651712);
    }
  }

  pickup(survivor) {
    this.startAction('PICKING UP SURVIVOR', 1, survivor, () => this.carrySurvivor(survivor));
  }

  carrySurvivor(survivor) {
    this.killer.carrying = survivor;
    survivor.state = 'carried';
    survivor.mesh.visible = false;
    survivor.wiggle = 0;
    this.killer.animation = 'carry';
    this.sound('pickup');
    this.killer.animationTime = 0;
    this.hooks.forEach(hook => hook.mesh.material.emissive.set(0x8d793d));
    this.hooks.forEach(hook => { hook.aura.material.color.set(0xd6af53); hook.aura.visible = this.role === 'killer'; });
  }

  hookSurvivor(survivor, hook) {
    if (hook.occupant) return;
    this.killer.carrying = null;
    this.killer.animation = 'hook';
    this.sound('hook');
    this.killer.animationTime = 0;
    survivor.state = 'hooked';
    survivor.hook = hook;
    hook.occupant = survivor;
    survivor.marks++;
    survivor.hookTime = survivor.marks === 2 ? 45 : 90;
    survivor.pos.copy(hook.pos);
    survivor.mesh.rotation.z = 0;
    survivor.mesh.visible = true;
    survivor.body.material.emissive.set(0xc6a767);
    this.hooks.forEach(item => item.mesh.material.emissive.set(0x000000));
    this.hooks.forEach(item => item.aura.visible = false);
  }

  aiTimedAction(actor, target, seconds, complete, dt) {
    if (!actor.aiTask || actor.aiTask.target !== target) actor.aiTask = { target, progress: 0 };
    actor.aiTask.progress += dt / seconds;
    actor.animation = 'interact';
    if (actor.aiTask.progress >= 1) {
      actor.aiTask = null;
      actor.animation = 'idle';
      complete();
    }
  }

  updateAI(dt) {
    this.survivors.filter(item => !item.isPlayer && item.state === 'active').forEach(survivor => {
      if (survivor.health === 'dying') { this.move(survivor, vec(Math.random() - .5, Math.random() - .5), .5, dt); return; }
      const threat = this.killer.pos.distanceTo(survivor.pos) < 10;
      const hooked = this.survivors.find(item => item.state === 'hooked');
      const dying = this.survivors.find(item => item.health === 'dying' && item !== survivor);
      const injured = this.survivors.find(item => item.health === 'injured' && item !== survivor);
      const unfinished = this.generators.filter(item => !item.done);
      if (!survivor.preferredGenerator || survivor.preferredGenerator.done || (survivor.preferredGenerator.workers?.length || 0) >= 3) {
        survivor.preferredGenerator = unfinished.sort((a, b) => {
          const crowd = (a.workers?.length || 0) - (b.workers?.length || 0);
          return crowd || a.pos.distanceTo(survivor.pos) - b.pos.distanceTo(survivor.pos);
        })[0];
      }
      const objective = this.completed >= 5 ? this.gates.find(item => !item.open) : survivor.preferredGenerator;
      let target = objective;
      if (!threat && hooked && this.killer.pos.distanceTo(hooked.pos) > 14 && (hooked.hookTime < 65 || Math.random() < dt * .5)) target = hooked;
      else if (!threat && dying) target = dying;
      else if (!threat && injured) target = injured;
      if (threat) {
        const escape = survivor.pos.clone().add(survivor.pos.clone().sub(this.killer.pos).normalize().multiplyScalar(16));
        this.navigate(survivor, escape, 4, dt);
      }
      else if (target) {
        const direction = target.pos.clone().sub(survivor.pos);
        if (direction.length() > 1.7) this.navigate(survivor, target.pos, 4, dt);
        else if (target.type === 'generator') this.repair(target, survivor, dt);
        else if (target.type === 'gate') {
          if (!target.worker || target.worker === survivor) {
            target.worker = survivor;
            this.aiTimedAction(survivor, target, 15, () => { target.open = true; target.worker = null; target.mesh.material.emissive.set(0x2d9e40); this.sound('gate'); }, dt);
          }
        } else if (target.state === 'hooked') this.aiTimedAction(survivor, target, 2, () => { target.state = 'active'; target.hook.occupant = null; target.hook = null; target.health = 'injured'; target.body.material.emissive.set(0xa32620); this.sound('unhook'); }, dt);
        else if (target.health === 'dying') this.aiTimedAction(survivor, target, 15, () => { target.health = 'injured'; target.body.material.emissive.set(0xa32620); }, dt);
        else if (target.health === 'injured') this.aiTimedAction(survivor, target, 25, () => { target.health = 'healthy'; target.body.material.emissive.set(0x5197a4); }, dt);
      }
    });
    if (!this.killer.isPlayer && this.killer.state === 'active') {
      if (this.killer.carrying) { const hook = this.hooks.filter(item => !item.occupant).sort((a, b) => a.pos.distanceTo(this.killer.pos) - b.pos.distanceTo(this.killer.pos))[0]; if (hook) { this.navigate(this.killer, hook.pos, 3, dt); if (hook.pos.distanceTo(this.killer.pos) < 1.8) this.hookSurvivor(this.killer.carrying, hook); } return; }
      const dying = this.nearest(this.survivors.filter(item => item.health === 'dying' && item.state === 'active'), this.killer);
      if (dying) { this.navigate(this.killer, dying.pos, 4.6, dt); if (dying.pos.distanceTo(this.killer.pos) < 1.7) this.carrySurvivor(dying); return; }
      const target = this.survivors.filter(item => item.state === 'active' && this.canSee(this.killer, item)).sort((a, b) => a.pos.distanceTo(this.killer.pos) - b.pos.distanceTo(this.killer.pos))[0];
      if (target) this.killer.lastKnown = target.pos.clone();
      const activeGenerator = this.generators.filter(item => !item.done && (item.alert > 0 || item.workers?.length)).sort((a, b) => b.progress - a.progress)[0];
      if (activeGenerator && target && target.pos.distanceTo(this.killer.pos) > 18 && Math.random() < dt * .8) this.navigate(this.killer, activeGenerator.pos, 4.6, dt);
      else if (target) { this.navigate(this.killer, target.pos, 4.6, dt); if (target.pos.distanceTo(this.killer.pos) < 2.1) this.hit(target); }
      else if (this.killer.lastKnown && this.killer.pos.distanceTo(this.killer.lastKnown) > 1.5) this.navigate(this.killer, this.killer.lastKnown, 4.2, dt);
      else if (activeGenerator) this.navigate(this.killer, activeGenerator.pos, 4.2, dt);
    }
  }

  animateActor(actor, dt) {
    actor.animationTime += dt;
    const t = actor.animationTime;
    const walking = actor.walking && actor.animation === 'idle';
    let arm = 0;
    let leg = 0;
    actor.mesh.rotation.z = 0;
    actor.body.rotation.z = actor.health === 'dying' ? Math.PI / 2 : 0;
    actor.body.position.y = 1.35 + (walking ? Math.abs(Math.sin(t * 10)) * .08 : 0);
    if (walking) { arm = Math.sin(t * 10) * .65; leg = -arm; }
    if (actor.animation === 'repair' || actor.animation === 'interact') { arm = .85 + Math.sin(t * 12) * .38; }
    if (actor.animation === 'vault') { actor.body.position.y = 1.35 + Math.sin(Math.min(t / Math.max(.1, actor.stun), 1) * Math.PI) * .55; arm = -1.1; leg = .8; }
    if (actor.animation === 'swing') { actor.arms[1].rotation.x = -Math.min(t * 8, 1.8); actor.arms[0].rotation.x = .4; return; }
    if (actor.animation === 'lunge') { actor.arms[1].rotation.x = -1.5; actor.mesh.rotation.z = Math.sin(t * 13) * .08; return; }
    if (actor.animation === 'pickup' || actor.animation === 'carry' || actor.animation === 'hook') { arm = -1.2; }
    if (actor.animation === 'break') { arm = -1.5 + Math.sin(t * 8) * .25; }
    if (actor.animation === 'flinch') { actor.mesh.rotation.z = Math.sin(t * 18) * .13; }
    if (actor.stun > 0) { actor.mesh.rotation.z = Math.sin(t * 16) * .18; arm = Math.sin(t * 14) * 1.1; }
    actor.arms[0].rotation.x = arm;
    actor.arms[1].rotation.x = -arm;
    actor.legs[0].rotation.x = leg;
    actor.legs[1].rotation.x = -leg;
    if (['swing', 'lunge', 'flinch', 'hook'].includes(actor.animation) && t > .55) actor.animation = actor.carrying ? 'carry' : 'idle';
  }

  updateStates(dt) {
    this.survivors.forEach(survivor => {
      if (survivor.health === 'injured' && survivor.state === 'active') {
        this.leaveTrace(survivor, 'blood');
        if (!survivor.lastMoan || this.time - survivor.lastMoan > 5 + Math.random() * 4) { survivor.lastMoan = this.time; this.sound('moan'); }
      }
      if (survivor.state === 'carried') {
        survivor.wiggle += dt / 16;
        if (survivor.wiggle >= 1) { survivor.state = 'active'; survivor.health = 'injured'; survivor.mesh.visible = true; survivor.pos.copy(this.killer.pos).add(vec(2, 0)); this.killer.carrying = null; this.killer.stun = 2; }
      }
      if (survivor.state === 'hooked') {
        survivor.hookTime -= dt;
        if (survivor.hookTime <= 45 && survivor.marks < 3) {
          survivor.stageTwo = true;
          if (!survivor.nextHookSkill) survivor.nextHookSkill = 4 + Math.random() * 2;
          survivor.nextHookSkill -= dt;
          if (survivor.isPlayer && survivor.nextHookSkill <= 0 && !this.skill) {
            this.skill = { hooked: survivor, elapsed: 0, zone: .15 + Math.random() * .55, type: 'hook' };
            survivor.nextHookSkill = 4 + Math.random() * 2;
            $('#skill').hidden = false;
          }
        }
        if (survivor.hookTime <= 0 || survivor.marks >= 3) { if (survivor.hook) survivor.hook.occupant = null; survivor.hook = null; survivor.state = 'dead'; survivor.mesh.visible = false; }
      }
    });
    [this.killer, ...this.survivors].forEach(actor => { this.animateActor(actor, dt); actor.walking = false; });
    this.traces = this.traces.filter(trace => { trace.time -= dt; trace.mesh.material.opacity = trace.time / 5; if (trace.time <= 0) { this.scene.remove(trace.mesh); return false; } return true; });
    this.generators.forEach(generator => { if (generator.alert > 0) { generator.alert -= dt; if (generator.alert <= 0 && !generator.done) generator.mesh.material.emissive.set(0); } });
    if (this.skill) { this.skill.elapsed += dt; $('#skill i').style.width = `${this.skill.elapsed * 100}%`; $('#skill b').style.left = `${this.skill.zone * 100}%`; if (this.skill.elapsed > 1) this.resolveSkill(); }
    [this.killer, ...this.survivors].forEach(actor => { actor.cooldown = Math.max(0, actor.cooldown - dt); actor.stun = Math.max(0, actor.stun - dt); });
  }

  updateCamera() {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (this.player.state === 'carried') {
      this.camera.position.copy(this.killer.pos).add(new THREE.Vector3(0, 3.1, 0)).addScaledVector(forward, -4.4);
      this.camera.lookAt(this.killer.pos.clone().addScaledVector(forward, 4.5).add(new THREE.Vector3(0, 1.3, 0)));
      return;
    }
    if (this.player.type === 'killer') {
      this.camera.position.copy(this.player.pos).add(new THREE.Vector3(0, 2.05, 0));
      this.camera.lookAt(this.camera.position.clone().add(forward).add(new THREE.Vector3(0, Math.sin(this.pitch) * 1.2, 0)));
      if (this.weaponView) {
        const animation = this.player.animation;
        const swing = animation === 'swing' || animation === 'lunge' ? Math.min(this.player.animationTime * 7, 1) : 0;
        this.weaponView.rotation.x = -swing * 1.5 + (this.player.stun > 0 ? Math.sin(this.time * 16) * .35 : 0);
        this.weaponView.rotation.z = -.35 + swing * .8;
      }
      return;
    }
    const cameraPos = this.player.pos.clone().addScaledVector(forward, -4.1).add(new THREE.Vector3(0, 3.05, 0));
    this.camera.position.copy(cameraPos);
    this.camera.lookAt(this.player.pos.clone().addScaledVector(forward, 5.4).add(new THREE.Vector3(0, 1.75 + this.pitch * 1.2, 0)));
  }

  updateUI() {
    $('#timer').textContent = `${String(Math.floor(this.time / 60)).padStart(2, '0')}:${String(Math.floor(this.time % 60)).padStart(2, '0')}`;
    $('#objective').textContent = this.completed < 5 ? `GENERATORS: ${this.completed} / 5` : 'EXIT GATES POWERED';
    const repairing = this.player.repairing && this.player.repairing.pos.distanceTo(this.player.pos) < 2;
    const carried = this.player.state === 'carried';
    const display = carried ? { label: 'WIGGLING FREE', progress: this.player.wiggle } : repairing ? { label: 'REPAIRING GENERATOR', progress: this.player.repairing.progress } : this.action;
    $('#action').classList.toggle('on', !!display);
    $('#action-label').textContent = display?.label || '';
    $('#action i').style.width = `${(display?.progress || 0) * 100}%`;
    const nearby = this.player.type === 'killer' ? 'CLICK: strike  |  HOLD: lunge  |  SPACE: pickup, hook, break, vault' : 'HOLD CLICK: interact  |  SPACE: skill check, vault, drop pallet';
    $('#prompt').textContent = this.player.state === 'hooked' ? 'ON HOOK: survive until rescued' : this.player.state === 'carried' ? 'WIGGLING FREE...' : nearby;
    $('#roster').innerHTML = this.survivors.map(survivor => `<div class="card ${survivor.health} ${survivor.state}">${survivor.state === 'dead' ? '☠' : survivor.state === 'hooked' ? '⚓' : survivor.state === 'dying' ? '▰' : survivor.name[0]}<span class="marks">${'◆'.repeat(survivor.marks)}</span>${survivor.state === 'hooked' ? `<i class="hookbar" style="width:${survivor.hookTime / 90 * 100}%"></i>` : ''}</div>`).join('');
  }

  checkEnd() {
    const remaining = this.survivors.filter(survivor => !['dead', 'escaped'].includes(survivor.state));
    if (!remaining.length) this.finish(this.survivors.some(survivor => survivor.state === 'escaped') ? 'SURVIVORS ESCAPED' : 'THE KILLER PREVAILED');
    this.gates.filter(gate => gate.open).forEach(gate => this.survivors.filter(survivor => survivor.state === 'active' && survivor.pos.distanceTo(gate.pos) < 2.4).forEach(survivor => { survivor.state = 'escaped'; survivor.mesh.visible = false; }));
  }

  tick(dt) {
    if (this.ended) return;
    this.time += dt;
    this.playerMove(dt);
    if (this.player.type === 'survivor') this.survivorAction(dt);
    else if (this.action) this.progressAction(dt);
    this.updateAI(dt);
    this.updateStates(dt);
    this.checkEnd();
    this.updateCamera();
    this.updateUI();
    this.renderer.render(this.scene, this.camera);
  }

  finish(title) { this.ended = true; $('#result').hidden = false; $('#result-title').textContent = title; document.exitPointerLock(); }

  run() { const frame = () => { this.tick(Math.min(this.clock.getDelta(), .05)); requestAnimationFrame(frame); }; frame(); }
}
