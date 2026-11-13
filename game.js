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
  game.run();
}

class Game {
  constructor(role) {
    this.role = role;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x182019);
    this.scene.fog = new THREE.Fog(0x182019, 28, 110);
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
    NAMES.forEach((name, index) => this.makeSurvivor(name, index));
    this.makeKiller();
    this.player = role === 'killer' ? this.killer : this.survivors[0];
    if (role === 'killer') this.generators.forEach(generator => generator.mesh.material.emissive.set(0x315c70));
    $('#role').textContent = `PLAYING AS ${role.toUpperCase()}`;
  }

  clearPosition(minEdge = 7, minDistance = 7) {
    let point;
    const objects = [...this.walls, ...this.generators, ...this.gates, ...this.hooks];
    do point = vec((Math.random() - .5) * (96 - minEdge * 2), (Math.random() - .5) * (96 - minEdge * 2));
    while (objects.some(object => object.pos.distanceTo(point) < minDistance));
    return point;
  }

  addWall(pos, width, depth) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2.8, depth), new THREE.MeshStandardMaterial({ color: 0x4b5045, roughness: .95 }));
    mesh.position.copy(pos);
    mesh.position.y = 1.4;
    this.scene.add(mesh);
    const wall = { pos: pos.clone(), width, depth, mesh, active: true };
    this.walls.push(wall);
    return wall;
  }

  addTiles() {
    for (let index = 0; index < 20; index++) {
      const p = this.clearPosition(10, 9);
      const form = index % 4;
      if (form === 0) {
        this.addWall(p.clone().add(vec(-2, 0)), 1, 7);
        this.addWall(p.clone().add(vec(1.5, 2.5)), 6, 1);
      } else if (form === 1) {
        this.addWall(p, 7, 1);
        this.addWall(p.clone().add(vec(0, 3)), 1, 6);
      } else if (form === 2) {
        this.addWall(p.clone().add(vec(-2, 0)), 1, 6);
        this.addWall(p.clone().add(vec(2, 0)), 1, 6);
        this.addWall(p.clone().add(vec(0, -2.5)), 5, 1);
      } else this.addWall(p, 5, 3);
      this.addWindow(p.clone().add(vec(3, 0)), index % 2 === 0 ? 0 : Math.PI / 2);
      this.addPallet(p.clone().add(vec(-3, 0)), index % 2 === 0 ? 0 : Math.PI / 2);
    }
  }

  addWindow(pos, rotation) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, .18), new THREE.MeshStandardMaterial({ color: 0x8fbece, emissive: 0x173744, transparent: true, opacity: .8 }));
    mesh.position.copy(pos);
    mesh.position.y = 1.35;
    mesh.rotation.y = rotation;
    this.scene.add(mesh);
    this.windows.push({ pos, mesh, rotation });
  }

  addPallet(pos, rotation) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, .22, .75), new THREE.MeshStandardMaterial({ color: 0x94633d, roughness: 1 }));
    mesh.position.copy(pos);
    mesh.position.y = 1.3;
    mesh.rotation.y = rotation;
    this.scene.add(mesh);
    const pallet = { pos, mesh, rotation, state: 'upright', wall: null };
    this.pallets.push(pallet);
  }

  addObjective(pos, color, type) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 2.25, 8), new THREE.MeshStandardMaterial({ color, emissive: 0x000000, roughness: .7 }));
    mesh.position.copy(pos);
    mesh.position.y = 1.125;
    this.scene.add(mesh);
    return { pos: pos.clone(), mesh, type };
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
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.46, 1.2, 5, 10), new THREE.MeshStandardMaterial({ color, emissive: color }));
    body.position.y = 1.12;
    group.add(body);
    group.position.copy(pos);
    this.scene.add(group);
    return { name, type, mesh: group, body, pos: group.position, state: 'active', health: 'healthy', marks: 0, cooldown: 0, healProgress: 0, hookTime: 0, bleed: 0, stun: 0 };
  }

  makeSurvivor(name, index) {
    const survivor = this.makeActor(name, 0x5197a4, vec(-7 + index * 4, -5), 'survivor');
    survivor.isPlayer = this.role === 'survivor' && index === 0;
    this.survivors.push(survivor);
  }

  makeKiller() {
    this.killer = this.makeActor('The Hunter', 0x9d382e, vec(7, 5), 'killer');
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
      this.holdAction = true;
      this.mouseDownAt = performance.now();
      if (this.player.type === 'killer') setTimeout(() => { if (this.holdAction && this.player.cooldown <= 0) this.startLongSwing(); }, 660);
    });
    addEventListener('mouseup', event => {
      if (event.button !== 0) return;
      const held = performance.now() - this.mouseDownAt;
      this.holdAction = false;
      if (this.player.type === 'killer' && !this.longSwing && held < 660) this.attack();
    });
    addEventListener('mousemove', event => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= event.movementX * .0025;
      this.pitch = clamp(this.pitch - event.movementY * .0025, -1.1, .12);
    });
  }

  move(actor, direction, speed, dt) {
    if (actor.state !== 'active' || actor.stun > 0 || !direction.length()) return;
    const next = actor.pos.clone().addScaledVector(direction.normalize(), speed * dt);
    if (Math.abs(next.x) > 47 || Math.abs(next.z) > 47 || this.walls.some(w => w.active && Math.abs(next.x - w.pos.x) < w.width / 2 + .42 && Math.abs(next.z - w.pos.z) < w.depth / 2 + .42)) return;
    actor.pos.copy(next);
    actor.mesh.rotation.y = Math.atan2(direction.x, direction.z);
  }

  playerMove(dt) {
    const player = this.player;
    if (player.state !== 'active') return;
    const forward = vec(Math.sin(this.yaw), Math.cos(this.yaw));
    const right = vec(forward.z, -forward.x);
    const direction = vec();
    if (this.keys.KeyW) direction.add(forward);
    if (this.keys.KeyS) direction.sub(forward);
    if (this.keys.KeyA) direction.sub(right);
    if (this.keys.KeyD) direction.add(right);
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
  }

  nearest(list, actor, radius = 2) { return list.filter(item => item.pos.distanceTo(actor.pos) < radius).sort((a, b) => a.pos.distanceTo(actor.pos) - b.pos.distanceTo(actor.pos))[0]; }

  startAction(label, duration, target, complete) {
    if (!this.action || this.action.target !== target || this.action.label !== label) this.action = { label, duration, target, complete, progress: 0 };
    return this.action;
  }

  cancelAction() { this.action = null; }

  progressAction(dt) {
    if (!this.action) return;
    this.action.progress += dt / this.action.duration;
    if (this.action.progress >= 1) {
      const done = this.action.complete;
      this.action = null;
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
      const action = this.startAction('OPENING EXIT GATE', 15, gate, () => { gate.open = true; gate.mesh.material.emissive.set(0x2d9e40); });
      this.progressAction(dt);
    } else if (hooked) {
      const action = this.startAction('UNHOOKING', 1, hooked, () => { hooked.state = 'active'; hooked.health = 'injured'; hooked.body.material.emissive.set(0xa32620); });
      this.progressAction(dt);
    } else if (dying) {
      const action = this.startAction('REVIVING', 15, dying, () => { dying.health = 'injured'; dying.body.material.emissive.set(0xa32620); });
      this.progressAction(dt);
    } else if (injured) {
      const action = this.startAction('HEALING', 25 * (1 - injured.healProgress), injured, () => { injured.health = 'healthy'; injured.healProgress = 0; injured.body.material.emissive.set(0x5197a4); });
      this.progressAction(dt);
      injured.healProgress = clamp(action.progress, 0, 1);
    } else this.cancelAction();
  }

  repair(generator, survivor, dt) {
    const workers = this.survivors.filter(item => item.state === 'active' && item.pos.distanceTo(generator.pos) < 2 && item.repairing === generator);
    if (!workers.includes(survivor)) workers.push(survivor);
    survivor.repairing = generator;
    const rate = (1 + .15 * Math.min(2, workers.length - 1)) / 100;
    generator.progress = clamp(generator.progress + rate * dt, 0, 1);
    generator.mesh.rotation.y += dt * workers.length * 2.8;
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
      if (!success) { skill.generator.alert = 3; skill.generator.mesh.material.emissive.set(0xc74a28); }
      skill.generator.nextSkill = 5 + Math.random() * 6;
    } else if (!success) skill.hooked.hookTime = Math.max(0, skill.hooked.hookTime - 7);
    this.skill = null;
    $('#skill').hidden = true;
    return true;
  }

  completeGenerator(generator) {
    if (generator.done) return;
    generator.done = true;
    generator.mesh.material.emissive.set(0xd2b039);
    this.completed++;
    setTimeout(() => { if (generator.done) generator.mesh.material.emissive.set(0x000000); }, 3000);
  }

  space() {
    if (this.resolveSkill()) return;
    const player = this.player;
    if (player.type === 'survivor') {
      const window = this.nearest(this.windows, player, 1.8);
      const pallet = this.nearest(this.pallets.filter(item => item.state === 'upright'), player, 1.8);
      if (window) this.vault(player, window, 1);
      else if (pallet) this.dropPallet(pallet);
      return;
    }
    const carried = player.carrying;
    const hook = this.nearest(this.hooks, player);
    const dying = this.nearest(this.survivors.filter(item => item.health === 'dying' && item.state === 'active'), player);
    const pallet = this.nearest(this.pallets.filter(item => item.state === 'dropped'), player);
    const window = this.nearest(this.windows, player, 1.8);
    if (carried && hook) this.hookSurvivor(carried, hook);
    else if (dying) this.pickup(dying);
    else if (pallet) this.breakPallet(pallet);
    else if (window) this.vault(player, window, 1.5);
  }

  vault(actor, window, seconds) {
    if (actor.vaulting || actor.state !== 'active') return;
    actor.vaulting = true;
    actor.stun = seconds;
    const direction = vec(Math.sin(window.rotation), Math.cos(window.rotation));
    setTimeout(() => { actor.pos.addScaledVector(direction, actor.type === 'killer' ? 1.6 : 2); actor.vaulting = false; }, seconds * 1000);
  }

  dropPallet(pallet) {
    pallet.state = 'dropped';
    pallet.mesh.position.y = .18;
    pallet.mesh.rotation.y = pallet.rotation;
    pallet.wall = { pos: pallet.pos, width: pallet.rotation ? .75 : 2.4, depth: pallet.rotation ? 2.4 : .75, active: true };
    this.walls.push(pallet.wall);
    if (this.killer.pos.distanceTo(pallet.pos) < 2.1) this.killer.stun = 2;
  }

  breakPallet(pallet) {
    this.startAction('BREAKING PALLET', 2, pallet, () => { pallet.state = 'broken'; pallet.wall.active = false; this.scene.remove(pallet.mesh); });
  }

  attack() {
    const killer = this.killer;
    if (killer.cooldown > 0 || killer.stun > 0) return;
    const target = this.nearest(this.survivors.filter(item => item.state === 'active'), killer, 2.3);
    if (target) this.hit(target);
    else killer.cooldown = 1;
  }

  startLongSwing() {
    const killer = this.killer;
    killer.longSwing = true;
    setTimeout(() => { if (killer.longSwing) { killer.longSwing = false; this.attack(); } }, 20);
  }

  hit(survivor) {
    const killer = this.killer;
    if (!survivor || killer.cooldown > 0) return;
    killer.cooldown = 2;
    survivor.healProgress = 0;
    if (survivor.health === 'healthy') {
      survivor.health = 'injured';
      survivor.body.material.emissive.set(0xa32620);
    } else {
      survivor.health = 'dying';
      survivor.body.material.emissive.set(0x651712);
      survivor.mesh.rotation.z = Math.PI / 2;
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
    this.hooks.forEach(hook => hook.mesh.material.emissive.set(0x8d793d));
  }

  hookSurvivor(survivor, hook) {
    this.killer.carrying = null;
    survivor.state = 'hooked';
    survivor.marks++;
    survivor.hookTime = 90;
    survivor.pos.copy(hook.pos);
    survivor.mesh.rotation.z = 0;
    survivor.mesh.visible = true;
    survivor.body.material.emissive.set(0xc6a767);
    this.hooks.forEach(item => item.mesh.material.emissive.set(0x000000));
  }

  updateAI(dt) {
    this.survivors.filter(item => !item.isPlayer && item.state === 'active').forEach(survivor => {
      if (survivor.health === 'dying') { this.move(survivor, vec(Math.random() - .5, Math.random() - .5), .5, dt); return; }
      const threat = this.killer.pos.distanceTo(survivor.pos) < 10;
      const hooked = this.survivors.find(item => item.state === 'hooked');
      const dying = this.survivors.find(item => item.health === 'dying' && item !== survivor);
      const injured = this.survivors.find(item => item.health === 'injured' && item !== survivor);
      const objective = this.completed >= 5 ? this.gates.find(item => !item.open) : this.generators.filter(item => !item.done).sort((a, b) => a.pos.distanceTo(survivor.pos) - b.pos.distanceTo(survivor.pos))[0];
      let target = objective;
      if (!threat && hooked) target = hooked;
      else if (!threat && dying) target = dying;
      else if (!threat && injured) target = injured;
      if (threat) this.move(survivor, survivor.pos.clone().sub(this.killer.pos), 4, dt);
      else if (target) {
        const direction = target.pos.clone().sub(survivor.pos);
        if (direction.length() > 1.7) this.move(survivor, direction, 4, dt);
        else if (target.type === 'generator') this.repair(target, survivor, dt);
        else if (target.type === 'gate') { target.progress += dt / 15; if (target.progress >= 1) { target.open = true; target.mesh.material.emissive.set(0x2d9e40); } }
        else if (target.state === 'hooked') { target.state = 'active'; target.health = 'injured'; target.body.material.emissive.set(0xa32620); }
        else if (target.health === 'dying') { target.health = 'injured'; target.body.material.emissive.set(0xa32620); }
        else if (target.health === 'injured') { target.health = 'healthy'; target.body.material.emissive.set(0x5197a4); }
      }
    });
    if (!this.killer.isPlayer && this.killer.state === 'active') {
      if (this.killer.carrying) { const hook = this.hooks.sort((a, b) => a.pos.distanceTo(this.killer.pos) - b.pos.distanceTo(this.killer.pos))[0]; this.move(this.killer, hook.pos.clone().sub(this.killer.pos), 3, dt); if (hook.pos.distanceTo(this.killer.pos) < 1.8) this.hookSurvivor(this.killer.carrying, hook); return; }
      const dying = this.nearest(this.survivors.filter(item => item.health === 'dying' && item.state === 'active'), this.killer);
      if (dying) { this.move(this.killer, dying.pos.clone().sub(this.killer.pos), 4.6, dt); if (dying.pos.distanceTo(this.killer.pos) < 1.7) this.carrySurvivor(dying); return; }
      const target = this.survivors.filter(item => item.state === 'active').sort((a, b) => a.pos.distanceTo(this.killer.pos) - b.pos.distanceTo(this.killer.pos))[0];
      if (target) { this.move(this.killer, target.pos.clone().sub(this.killer.pos), 4.6, dt); if (target.pos.distanceTo(this.killer.pos) < 2.1) this.hit(target); }
    }
  }

  updateStates(dt) {
    this.survivors.forEach(survivor => {
      if (survivor.health === 'injured' && survivor.state === 'active') this.leaveTrace(survivor, 'blood');
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
        if (survivor.hookTime <= 0 || survivor.marks >= 3) { survivor.state = 'dead'; survivor.mesh.visible = false; }
      }
    });
    this.traces = this.traces.filter(trace => { trace.time -= dt; trace.mesh.material.opacity = trace.time / 5; if (trace.time <= 0) { this.scene.remove(trace.mesh); return false; } return true; });
    this.generators.forEach(generator => { if (generator.alert > 0) { generator.alert -= dt; if (generator.alert <= 0 && !generator.done) generator.mesh.material.emissive.set(0); } });
    if (this.skill) { this.skill.elapsed += dt; $('#skill i').style.width = `${this.skill.elapsed * 100}%`; $('#skill b').style.left = `${this.skill.zone * 100}%`; if (this.skill.elapsed > 1) this.resolveSkill(); }
    [this.killer, ...this.survivors].forEach(actor => { actor.cooldown = Math.max(0, actor.cooldown - dt); actor.stun = Math.max(0, actor.stun - dt); });
  }

  updateCamera() {
    const distance = 10;
    const horizontal = Math.cos(this.pitch) * distance;
    this.camera.position.copy(this.player.pos).add(new THREE.Vector3(Math.sin(this.yaw) * -horizontal, -Math.sin(this.pitch) * distance + 1.4, Math.cos(this.yaw) * -horizontal));
    this.camera.lookAt(this.player.pos.clone().add(new THREE.Vector3(0, 1.1, 0)));
  }

  updateUI() {
    $('#timer').textContent = `${String(Math.floor(this.time / 60)).padStart(2, '0')}:${String(Math.floor(this.time % 60)).padStart(2, '0')}`;
    $('#objective').textContent = this.completed < 5 ? `GENERATORS: ${this.completed} / 5` : 'EXIT GATES POWERED';
    $('#action').classList.toggle('on', !!this.action);
    $('#action-label').textContent = this.action?.label || '';
    $('#action i').style.width = `${(this.action?.progress || 0) * 100}%`;
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
