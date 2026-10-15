import * as THREE from 'three';
import { HAIR_COLORS, HAIR_COLOR_NAMES, HAIR_STYLES, SKIN_TONES } from './vendor/agent-office/avatar';
import { Person } from './vendor/agent-office/character/person';
import { FirstPersonBody } from './vendor/agent-office/character/person-first';
import { STATUS_BULB } from './vendor/agent-office/character/agent';
import { PlayerController } from './vendor/agent-office/player/controller';
import { mesh, toon } from './vendor/agent-office/toon';
import { fetchProjects, fetchStatus, type ProjectSummary, type StatusSnapshot } from './api';
import { SHIRTS, loadCeo, randomCeo, saveCeo, type Ceo } from './ceo';
import { Office, ROLES, SPAWN, type Interactable, type Role } from './office';

// The page: the character screen where you make your CEO, then the office you walk round in first
// person, with the project picker at the file stack and each agent's log at its desk.

const POLL_MS = 3000;
const PROJECT_KEY = 'pixel-office.project';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);

function lights(scene: THREE.Scene, shadowSize: number) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#d9c7a8', 1.9));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
  sun.position.set(6, 14, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = c.bottom = -shadowSize;
  c.right = c.top = shadowSize;
  c.near = 1;
  c.far = 40;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}

// ---- The office ----
const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe3ff');
lights(scene, 14);
const office = new Office();
scene.add(office.group);
const player = new PlayerController(camera, canvas, office.colliders);
player.pos.set(SPAWN.x, 0, SPAWN.z);
player.camYaw = SPAWN.yaw;
player.enabled = false;

let ceo: Ceo = loadCeo() ?? randomCeo();
const me = new Person('', ceo.shirt, ceo.look);
scene.add(me.root);
const myBody = new FirstPersonBody(me.rig);

// ---- The character screen: your CEO on a little stage, spinning ----
const stage = new THREE.Scene();
stage.background = new THREE.Color('#bfe3ff');
lights(stage, 4);
const model = new Person('', ceo.shirt, ceo.look);
stage.add(model.root);
const disc = mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.12, 40), toon('#e8a87c'), 0, -0.06, 0);
stage.add(disc);
let spin = 0.4;
let spinV = 0.6;
let dragX: number | null = null;

type Mode = 'creator' | 'office' | 'picker' | 'log';
let mode: Mode = 'creator';

function swatches(el: HTMLElement, colors: string[], names: string[] | null, pick: (i: number) => void) {
  el.innerHTML = '';
  colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = c;
    b.title = names?.[i] ?? c;
    b.onclick = () => pick(i);
    el.append(b);
  });
}

function chips(el: HTMLElement, labels: string[], pick: (i: number) => void) {
  el.innerHTML = '';
  labels.forEach((l, i) => {
    const b = document.createElement('button');
    b.textContent = l;
    b.onclick = () => pick(i);
    el.append(b);
  });
}

function markOn(el: HTMLElement, i: number) {
  [...el.children].forEach((c, j) => c.classList.toggle('on', i === j));
}

function refreshCreator() {
  $<HTMLInputElement>('ceo-name').value = ceo.name;
  markOn($('ceo-skin'), ceo.look.skin);
  markOn($('ceo-hair'), ceo.look.hair);
  markOn($('ceo-style'), ceo.look.style);
  markOn($('ceo-shirt'), SHIRTS.indexOf(ceo.shirt));
  model.setLook(ceo.look, ceo.shirt);
}

swatches($('ceo-skin'), SKIN_TONES, null, (i) => ((ceo.look.skin = i), refreshCreator()));
swatches($('ceo-hair'), HAIR_COLORS, HAIR_COLOR_NAMES, (i) => ((ceo.look.hair = i), refreshCreator()));
chips($('ceo-style'), HAIR_STYLES, (i) => ((ceo.look.style = i), refreshCreator()));
swatches($('ceo-shirt'), SHIRTS, null, (i) => ((ceo.shirt = SHIRTS[i]), refreshCreator()));
$<HTMLInputElement>('ceo-name').oninput = (e) => (ceo.name = (e.target as HTMLInputElement).value);
$('ceo-random').onclick = () => {
  ceo = randomCeo();
  refreshCreator();
};
$('ceo-enter').onclick = () => enterOffice();
$<HTMLInputElement>('ceo-name').onkeydown = (e) => e.key === 'Enter' && enterOffice();

function openCreator() {
  mode = 'creator';
  player.enabled = false;
  player.unlock();
  player.clearKeys();
  $('creator').hidden = false;
  $('hud').hidden = true;
  refreshCreator();
}

function enterOffice() {
  ceo.name = ceo.name.trim() || randomCeo().name;
  saveCeo(ceo);
  me.setLook(ceo.look, ceo.shirt);
  $('creator').hidden = true;
  $('hud').hidden = false;
  mode = 'office';
  player.enabled = true;
  player.lock();
}

canvas.addEventListener('pointerdown', (e) => mode === 'creator' && (dragX = e.clientX));
window.addEventListener('pointerup', () => (dragX = null));
window.addEventListener('pointermove', (e) => {
  if (mode !== 'creator' || dragX === null) return;
  spinV = 0;
  spin += (e.clientX - dragX) * 0.01;
  dragX = e.clientX;
});

// ---- Projects and agents ----
let projects: ProjectSummary[] = [];
let current = localStorage.getItem(PROJECT_KEY) ?? '';
let snapshot: StatusSnapshot | null = null;

async function loadProjects() {
  try {
    projects = await fetchProjects();
  } catch {
    return;
  }
  if (!projects.some((p) => p.id === current)) current = projects[0]?.id ?? '';
  office.setProjects(projects, current);
  if (mode === 'picker') drawPicker();
}

async function poll() {
  if (!current) return;
  const asked = current;
  try {
    const snap = await fetchStatus(asked);
    if (asked !== current) return;
    snapshot = snap;
    $('connection').textContent = `Live · ${new Date().toLocaleTimeString()} · ${snap.branches.length} worktree${snap.branches.length === 1 ? '' : 's'}`;
  } catch {
    $('connection').textContent = 'Disconnected · retrying…';
    return;
  }
  $('project-name').textContent = snapshot.name;
  office.setProjectName(snapshot.name);
  for (const a of snapshot.agents) office.setAgent(a.role, a.status, a.events);
  $('agent-dots').innerHTML = ROLES.map((r) => {
    const s = snapshot!.agents.find((a) => a.role === r.role)?.status ?? 'waiting';
    return `<span><i class="dot" style="background:${STATUS_BULB[s]}"></i>${r.title} <span class="muted">${s}</span></span>`;
  }).join('');
  if (mode === 'log') drawLog();
}

function choose(id: string) {
  current = id;
  localStorage.setItem(PROJECT_KEY, id);
  office.setProjects(projects, current);
  snapshot = null;
  closeModal();
  void poll();
}

function drawPicker() {
  const list = $('project-list');
  list.innerHTML = '';
  if (!projects.length) list.textContent = 'No projects yet.';
  projects.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = `file${p.id === current ? ' on' : ''}`;
    const counts = Object.entries(p.counts)
      .map(([s, n]) => `<span style="background:${STATUS_BULB[s as keyof typeof STATUS_BULB]}">${n} ${s}</span>`)
      .join('');
    b.innerHTML = `<i class="tab"></i><div class="meta"><div></div><div class="key"></div></div><div class="counts">${counts}</div>`;
    (b.querySelector('.tab') as HTMLElement).style.background = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#9d4edd', '#e9c46a', '#ff8fab', '#264653'][i % 8];
    (b.querySelector('.meta div') as HTMLElement).textContent = p.name;
    (b.querySelector('.key') as HTMLElement).textContent = `${i < 9 ? `[${i + 1}] ` : ''}${p.found ? `${p.branches} worktree${p.branches === 1 ? '' : 's'}` : 'no .sandcastle folder found'}`;
    b.onclick = () => choose(p.id);
    list.append(b);
  });
}

let logRole: Role = 'planner';
function drawLog() {
  const a = snapshot?.agents.find((x) => x.role === logRole);
  const title = ROLES.find((r) => r.role === logRole)!.title;
  $('log-title').textContent = `${title} · ${a?.status ?? 'waiting'}`;
  $('log-file').textContent = a?.log ? `${snapshot!.name} / .sandcastle/logs/${a.log}` : 'No log file yet';
  const feed = $('log-lines');
  const near = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 40;
  feed.innerHTML = '';
  for (const line of a?.events.length ? a.events : ['No activity recorded yet.']) {
    const d = document.createElement('div');
    d.textContent = line;
    feed.append(d);
  }
  if (near) feed.scrollTop = feed.scrollHeight;
}

function openModal(which: 'picker' | 'log') {
  mode = which;
  player.enabled = false;
  player.clearKeys();
  player.unlock();
  $(which).hidden = false;
  if (which === 'picker') {
    drawPicker();
    void loadProjects();
  } else drawLog();
}

function closeModal() {
  if (mode !== 'picker' && mode !== 'log') return;
  $(mode).hidden = true;
  mode = 'office';
  player.enabled = true;
  player.lock();
}

for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) b.onclick = () => closeModal();

function use(it: Interactable) {
  if (it.kind === 'files') openModal('picker');
  else {
    logRole = it.role;
    openModal('log');
  }
}

/** What you're near enough to press E at, the closest first. */
function nearby(): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of office.interactables) {
    const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
    if (d < it.radius && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (mode === 'office') {
    if (e.code === 'KeyE') {
      const it = nearby();
      if (it) use(it);
    } else if (e.code === 'KeyC') openCreator();
  } else if (mode === 'picker' || mode === 'log') {
    if (e.code === 'Escape' || e.code === 'KeyE') closeModal();
    const n = Number(e.key);
    if (mode === 'picker' && n >= 1 && n <= projects.length) choose(projects[n - 1].id);
  }
});

// ---- Every frame ----
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (mode === 'creator') {
    spin += spinV * dt;
    if (dragX === null) spinV += (0.6 - spinV) * Math.min(1, dt * 2);
    model.root.rotation.y = spin;
    model.update(dt, false, false);
    // Straight on, but shifted right of the creator panel on a wide screen.
    camera.position.set(0, 1.35, 3);
    camera.lookAt(0, 0.85, 0);
    if (innerWidth > 800) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.18, 0, innerWidth, innerHeight);
    renderer.render(stage, camera);
    camera.clearViewOffset();
    return;
  }
  player.update(dt);
  office.update(t, dt);
  me.root.position.copy(player.pos);
  me.root.rotation.y = player.facing;
  me.update(dt, player.moving && player.grounded, !player.grounded, player.running ? 1.3 : 1);
  myBody.set(true, camera);
  const it = mode === 'office' ? nearby() : null;
  const hint = $('hint');
  hint.hidden = !it;
  if (it) hint.innerHTML = `<kbd>E</kbd>${it.label}`;
  $('click-to-look').hidden = mode !== 'office' || player.locked;
  const restore = myBody.hideExtras();
  renderer.render(scene, camera);
  restore();
});

openCreator();
void loadProjects().then(poll);
setInterval(poll, POLL_MS);
setInterval(() => mode !== 'picker' && void loadProjects(), POLL_MS * 4);

// For poking at the office from the console (and headless screenshots) while developing.
if (import.meta.env.DEV) Object.assign(window, { pixelOffice: { player, office, choose } });
