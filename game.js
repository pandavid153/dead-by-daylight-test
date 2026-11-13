import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const $ = s => document.querySelector(s), clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const NAMES = ['Mika', 'Jonah', 'Claudette', 'Felix'];
let game;
document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => start(b.dataset.role));
$('#again').onclick = () => location.reload();

function start(role) {
  $('#lobby').hidden = true; $('#game').hidden = false;
  game = new Game(role); game.start();
}

class Game {
  constructor(role) {
    this.role = role; this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x1b241c); this.scene.fog = new THREE.Fog(0x1b241c, 32, 104);
    this.camera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, .1, 160); this.renderer = new THREE.WebGLRenderer({canvas:$('#world'),antialias:true}); this.renderer.setSize(innerWidth,innerHeight); this.renderer.setPixelRatio(devicePixelRatio);
    this.clock = new THREE.Clock(); this.keys={}; this.yaw=0; this.pitch=-.48; this.elapsed=0; this.completed=0; this.ended=false; this.interaction=null; this.action=0; this.lastPrint=0;
    this.entities=[]; this.generators=[]; this.hooks=[]; this.gates=[]; this.traces=[]; this.survivors=[];
    this.ray = new THREE.Raycaster(); this.setupWorld(); this.setupInput();
  }
  setupWorld() {
    const amb = new THREE.HemisphereLight(0x9dbb96,0x192018,2); this.scene.add(amb); const light=new THREE.DirectionalLight(0xd5c993,2); light.position.set(25,45,5); this.scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(96,96),new THREE.MeshStandardMaterial({color:0x334331,roughness:1})); floor.rotation.x=-Math.PI/2; this.scene.add(floor);
    const grid = new THREE.GridHelper(96,96,0x586450,0x40503e); grid.position.y=.01; grid.material.opacity=.28; grid.material.transparent=true; this.scene.add(grid);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(96,.1,96)),new THREE.LineBasicMaterial({color:0xa28653})); edge.position.y=.1; this.scene.add(edge);
    this.addTiles(); this.addObjects();
    NAMES.forEach((name,i)=>this.makeSurvivor(name,i)); this.makeKiller(); this.player = role==='killer'?this.killer:this.survivors[0];
    $('#role').textContent = `PLAYING AS ${role.toUpperCase()}`;
  }
  randomPos(min=8) { let p; do p=new THREE.Vector3((Math.random()-.5)*(96-min*2),0,(Math.random()-.5)*(96-min*2)); while(this.entities.some(e=>e.pos.distanceTo(p)<7)); return p; }
  addBox(pos,scale,color) { const m=new THREE.Mesh(new THREE.BoxGeometry(...scale),new THREE.MeshStandardMaterial({color,roughness:.9})); m.position.copy(pos).add(new THREE.Vector3(0,scale[1]/2,0)); this.scene.add(m); this.entities.push({pos:m.position, radius:Math.max(scale[0],scale[2])*.48, mesh:m, type:'wall'}); return m; }
  addTiles() { for(let i=0;i<24;i++){ const p=this.randomPos(10), type=i%4; if(type===0){this.addBox(p.clone().add(new THREE.Vector3(-2,0,0)),[1,2.8,7],0x4b5146);this.addBox(p.clone().add(new THREE.Vector3(1.5,0,2.5)),[6,2.8,1],0x4b5146);} else if(type===1){this.addBox(p,[7,2.8,1],0x4b5146);this.addBox(p.clone().add(new THREE.Vector3(0,0,3)),[1,2.8,6],0x4b5146);} else this.addBox(p,[type===2?6:3,2.8,type===2?3:6],0x4b5146); } }
  addObjects() {
    for(let i=0;i<7;i++){const p=this.randomPos(10);const g=this.object(p,0x526b59,'generator');g.progress=0;g.done=false;g.workers=[];this.generators.push(g);}
    [[-40,-30],[40,30]].forEach(([x,z])=>{const g=this.object(new THREE.Vector3(x,0,z),0x856a38,'gate');g.progress=0;g.open=false;this.gates.push(g);});
    for(let i=0;i<16;i++){const h=this.object(this.randomPos(6),0x8a7661,'hook'); this.hooks.push(h);}
  }
  object(pos,color,type) { const m=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,2.2,8),new THREE.MeshStandardMaterial({color,emissive:0x000000}));m.position.copy(pos).y=1.1;this.scene.add(m);return {pos:m.position.clone().setY(0),mesh:m,type}; }
  makeSurvivor(name,i) { const s=this.actor(name,0x5294a2,new THREE.Vector3(-8+i*4,0,-4),'survivor');s.health='healthy';s.marks=0;s.hookTime=0;s.heal=0;s.isPlayer=this.role==='survivor'&&i===0;this.survivors.push(s); }
  makeKiller() { this.killer=this.actor('The Hunter',0x9f3b32,new THREE.Vector3(5,0,5),'killer');this.killer.isPlayer=this.role==='killer'; }
  actor(name,color,pos,type) { const group=new THREE.Group(), body=new THREE.Mesh(new THREE.CapsuleGeometry(.45,1.25,5,10),new THREE.MeshStandardMaterial({color,emissive:color}));body.position.y=1.1;group.add(body);group.position.copy(pos);this.scene.add(group);return {name,type,mesh:group,body,pos:group.position,vel:new THREE.Vector3(),cooldown:0,state:'active',target:null}; }
  setupInput() {
    addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight)});
    addEventListener('keydown',e=>{this.keys[e.code]=true;if(e.code==='Space')this.special();}); addEventListener('keyup',e=>this.keys[e.code]=false);
    $('#world').onclick=()=>{ $('#world').requestPointerLock(); if(this.player.type==='killer')this.attack(false); else this.hold=true;}; addEventListener('mouseup',()=>this.hold=false);
    addEventListener('mousemove',e=>{if(document.pointerLockElement===$('#world')){this.yaw-=e.movementX*.0025;this.pitch=clamp(this.pitch-e.movementY*.0025,-1.15,.1)}});
  }
  move(actor,dir,speed,dt) { if(!dir.length()||actor.state!=='active')return;dir.normalize();const next=actor.pos.clone().addScaledVector(dir,speed*dt); if(Math.abs(next.x)>47||Math.abs(next.z)>47||this.entities.some(e=>e.type==='wall'&&next.distanceTo(e.pos)<e.radius+.55))return; actor.pos.copy(next);actor.mesh.rotation.y=Math.atan2(dir.x,dir.z); }
  playerMove(dt) { const p=this.player;if(p.state!=='active')return;const f=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw)), r=new THREE.Vector3(f.z,0,-f.x),d=new THREE.Vector3();if(this.keys.KeyW)d.add(f);if(this.keys.KeyS)d.sub(f);if(this.keys.KeyA)d.sub(r);if(this.keys.KeyD)d.add(r);let speed=p.type==='killer'?4.6:this.keys.ShiftLeft||this.keys.ShiftRight?4:this.keys.ControlLeft?1.3:2.2;if(p.carrying)speed=3;if(p.cooldown>0)speed=2;this.move(p,d,speed,dt);if(p.type==='survivor'&&speed===4&&d.length()&&this.elapsed-this.lastPrint>.35){this.lastPrint=this.elapsed;this.footprint(p.pos);}}
  footprint(pos){const m=new THREE.Mesh(new THREE.CircleGeometry(.12,8),new THREE.MeshBasicMaterial({color:0x202020,transparent:true}));m.rotation.x=-Math.PI/2;m.position.copy(pos).y=.03;this.scene.add(m);this.traces.push({m,t:5});}
  ai(dt) { this.survivors.filter(s=>!s.isPlayer&&s.state==='active').forEach(s=>{let target;if(s.health==='dying'){this.move(s,new THREE.Vector3(Math.random()-.5,0,Math.random()-.5),.5,dt);return;} if(this.killer.pos.distanceTo(s.pos)<10){this.move(s,s.pos.clone().sub(this.killer.pos),4,dt);return;}target=this.generators.filter(g=>!g.done).sort((a,b)=>a.pos.distanceTo(s.pos)-b.pos.distanceTo(s.pos))[0];if(target){let d=target.pos.clone().sub(s.pos);if(d.length()>1.8)this.move(s,d,4,dt);else this.workGen(s,target,dt);}});
    if(!this.killer.isPlayer&&this.killer.state==='active'){let targets=this.survivors.filter(s=>s.state==='active').sort((a,b)=>a.pos.distanceTo(this.killer.pos)-b.pos.distanceTo(this.killer.pos));let s=targets[0];if(s){let d=s.pos.clone().sub(this.killer.pos);this.move(this.killer,d,4.6,dt);if(d.length()<2.05)this.hit(s);}}
  }
  workGen(s,g,dt) { if(g.done)return;g.workers=[...new Set([...g.workers,s])];const count=g.workers.filter(w=>w.state==='active'&&w.pos.distanceTo(g.pos)<2).length;g.progress=clamp(g.progress+dt*(1+.15*(count-1))/100,0,1);g.mesh.rotation.y+=dt*count*3;if(g.progress>=1){g.done=true;this.completed++;g.mesh.material.emissive.set(0xd0a728);setTimeout(()=>g.mesh.material.emissive.set(0),3000);} }
  hit(s) { const k=this.killer;if(k.cooldown>0||s.state!=='active')return;k.cooldown=2;if(s.health==='healthy'){s.health='injured';s.body.material.emissive.set(0xa52620);}else{s.health='dying';s.state='active';s.body.material.emissive.set(0x641510);} }
  attack(long) { const k=this.killer;if(k.cooldown>0)return;let s=this.survivors.filter(x=>x.state==='active'&&x.pos.distanceTo(k.pos)<2.3).sort((a,b)=>a.pos.distanceTo(k.pos)-b.pos.distanceTo(k.pos))[0];if(long){k.cooldown=.66;setTimeout(()=>this.hit(s),660)} else if(s)this.hit(s); else k.cooldown=1; }
  special() { const p=this.player;if(p.type==='killer'){let dying=this.survivors.find(s=>s.health==='dying'&&s.pos.distanceTo(p.pos)<2);if(dying){p.carrying=dying;dying.state='carried';dying.mesh.visible=false;setTimeout(()=>{if(p.carrying===dying){dying.state='active';dying.health='injured';dying.pos.copy(p.pos).add(new THREE.Vector3(2,0,0));dying.mesh.visible=true;p.carrying=null;p.cooldown=2;}},16000);return;}let h=this.hooks.find(x=>x.pos.distanceTo(p.pos)<2);if(h&&p.carrying){let s=p.carrying;p.carrying=null;s.mesh.visible=true;s.pos.copy(h.pos);s.state='hooked';s.marks++;s.hookTime=90;}} }
  interact(dt) { const p=this.player;if(!this.hold||p.type==='killer'||p.state!=='active')return;let g=this.generators.find(x=>!x.done&&x.pos.distanceTo(p.pos)<2), gate=this.gates.find(x=>this.completed>=5&&!x.open&&x.pos.distanceTo(p.pos)<2), hooked=this.survivors.find(s=>s.state==='hooked'&&s.pos.distanceTo(p.pos)<2), dying=this.survivors.find(s=>s.health==='dying'&&s.pos.distanceTo(p.pos)<2);if(g){this.action='REPAIRING GENERATOR';this.workGen(p,g,dt);if(Math.random()<dt/8){if(this.keys.Space)g.progress=clamp(g.progress+.02,0,1);else g.progress=clamp(g.progress-.1,0,1);}}else if(gate){this.action='OPENING EXIT GATE';gate.progress+=dt/15;if(gate.progress>=1){gate.open=true;gate.mesh.material.emissive.set(0x37a843);}}else if(hooked){this.action='UNHOOKING';hooked.hookTime-=dt*6;if(hooked.hookTime<70){hooked.state='active';hooked.health='injured';hooked.body.material.emissive.set(0xa52620);}}else if(dying){this.action='REVIVING';dying.heal+=dt/15;if(dying.heal>=1){dying.health='injured';dying.heal=0;dying.body.material.emissive.set(0xa52620);}}else this.action=null; }
  update(dt) { if(this.ended)return;this.elapsed+=dt;this.playerMove(dt);this.ai(dt);this.interact(dt);this.killer.cooldown=Math.max(0,this.killer.cooldown-dt);this.traces=this.traces.filter(t=>{t.t-=dt;t.m.material.opacity=t.t/5;if(t.t<=0){this.scene.remove(t.m);return false}return true});this.survivors.forEach(s=>{if(s.state==='hooked'){s.hookTime-=dt;if(s.hookTime<=0||s.marks>=3){s.state='dead';s.mesh.visible=false;}}});
    this.gates.filter(g=>g.open).forEach(g=>this.survivors.filter(s=>s.state==='active'&&s.pos.distanceTo(g.pos)<2.4).forEach(s=>{s.state='escaped';s.mesh.visible=false;}));let live=this.survivors.filter(s=>!['dead','escaped'].includes(s.state));if(!live.length)this.finish(this.survivors.some(s=>s.state==='escaped')?'SURVIVORS ESCAPED':'THE KILLER PREVAILED');this.ui();this.camera.position.copy(this.player.pos).add(new THREE.Vector3(Math.sin(this.yaw)*-10,7,Math.cos(this.yaw)*-10));this.camera.lookAt(this.player.pos.clone().add(new THREE.Vector3(0,1.2,0)));this.renderer.render(this.scene,this.camera);
  }
  ui() { $('#timer').textContent=`${String(Math.floor(this.elapsed/60)).padStart(2,'0')}:${String(Math.floor(this.elapsed%60)).padStart(2,'0')}`;$('#objective').textContent=this.completed<5?`GENERATORS: ${this.completed} / 5`:'EXIT GATES POWERED';$('#action').classList.toggle('on',!!this.action);$('#action-label').textContent=this.action||'';$('#action i').style.width=this.action&&this.generators[0]?`${this.action==='REPAIRING GENERATOR'?((this.generators.find(g=>!g.done)?.progress||1)*100):45}%`:'0%';$('#roster').innerHTML=this.survivors.map(s=>`<div class="card ${s.health} ${s.state}">${s.state==='dead'?'☠':s.state==='hooked'?'⚓':s.state==='dying'?'▰':s.name[0]}<span class="marks">${'◆'.repeat(s.marks||0)}</span>${s.state==='hooked'?`<i class="hookbar" style="width:${s.hookTime/90*100}%"></i>`:''}</div>`).join('');this.action=null; }
  finish(text){this.ended=true;$('#result').hidden=false;$('#result-title').textContent=text;document.exitPointerLock();}
  start(){const loop=()=>{this.update(Math.min(this.clock.getDelta(),.05));requestAnimationFrame(loop)};loop();}
}
