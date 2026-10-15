import * as THREE from 'three';
import { Agent, type AgentStatus } from './vendor/agent-office/character/agent';
import { FLOOR_PALETTES, PALETTE, floorTexture, glassPane } from './vendor/agent-office/materials';
import { mesh, roundedBox, textPlane, textSprite, toon } from './vendor/agent-office/toon';
import type { Collider } from './vendor/agent-office/types';

// The office: one floor with the CEO's room on the north side of a hallway and the four agents'
// cubicles on the south side, left to right (from the hallway) in the order work goes through them. Forward is -z
// (north); the floor runs from (-12, -10) to (12, 10).

export const ROLES = [
  { role: 'planner', title: 'Planner', color: '#d3a3ff', palette: 3 },
  { role: 'implementer', title: 'Implementer', color: '#6edcce', palette: 1 },
  { role: 'reviewer', title: 'Reviewer', color: '#ffc56e', palette: 4 },
  { role: 'merger', title: 'Merger', color: '#89b6ff', palette: 2 },
] as const;
export type Role = (typeof ROLES)[number]['role'];

const FLOOR = { minX: -12, maxX: 12, minZ: -10, maxZ: 10 };
const WALL_H = 3;
const WALL_T = 0.2;
/** How high the cubicles' partitions come: over a desk, under your eyes. */
const PARTITION_H = 1.5;
const CEO = { minX: -6, maxX: 6, minZ: -10, maxZ: -2 };
/** The hallway between the CEO's room and the cubicles. */
const HALL = { minZ: -2, maxZ: 2 };
const DOOR = 0.9;

/** Something you can walk up to and press E at. */
export type Interactable = { x: number; z: number; radius: number; label: string } & ({ kind: 'files' } | { kind: 'agent'; role: Role });

/** Where you start: in the CEO's room, in front of your desk, looking at it. */
export const SPAWN = { x: 0, z: -4.2, yaw: 0 };

export interface ProjectFile {
  id: string;
  name: string;
}

export class Office {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly interactables: Interactable[] = [];
  readonly agents = new Map<Role, Agent>();
  private screens = new Map<Role, LogScreen>();
  private stack = new THREE.Group();
  private projectSign: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private wall = toon(FLOOR_PALETTES[0].wall);
  private trim = toon(FLOOR_PALETTES[0].trim);

  constructor() {
    this.buildShell();
    this.buildCeoRoom();
    ROLES.forEach((r, i) => this.buildCubicle(r, i));
    this.buildHall();
  }

  /** A solid box from (x0, z0) to (x1, z1), `h` tall from `y`, that you bump into. */
  private solid(x0: number, x1: number, z0: number, z1: number, h: number, mat: THREE.Material, y = 0, collide = true): THREE.Mesh {
    const m = mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), mat, (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    this.group.add(m);
    if (collide) this.colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: y + h });
    return m;
  }

  /** A wall along x at `z` from x0 to x1, `h` tall, with doorways (centers) `DOOR` either side of each. */
  private wallX(z: number, x0: number, x1: number, h: number, mat: THREE.Material, doors: number[] = []) {
    for (const [a, b] of gaps(x0, x1, doors)) this.solid(a, b, z - WALL_T / 2, z + WALL_T / 2, h, mat);
  }

  /** A wall along z at `x` from z0 to z1. */
  private wallZ(x: number, z0: number, z1: number, h: number, mat: THREE.Material, doors: number[] = []) {
    for (const [a, b] of gaps(z0, z1, doors)) this.solid(x - WALL_T / 2, x + WALL_T / 2, a, b, h, mat);
  }

  private buildShell() {
    const w = FLOOR.maxX - FLOOR.minX;
    const d = FLOOR.maxZ - FLOOR.minZ;
    // The hallway and the lounges in maple, the CEO's room in walnut, each cubicle in its own color.
    const floorPlane = (p: number, x0: number, x1: number, z0: number, z1: number, y = 0) => {
      const tex = floorTexture(FLOOR_PALETTES[p], x1 - x0, z1 - z0);
      const m = mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshToonMaterial({ map: tex }), (x0 + x1) / 2, y, (z0 + z1) / 2, false);
      m.rotation.x = -Math.PI / 2;
      this.group.add(m);
    };
    floorPlane(0, FLOOR.minX, FLOOR.maxX, FLOOR.minZ, FLOOR.maxZ);
    floorPlane(5, CEO.minX, CEO.maxX, CEO.minZ, CEO.maxZ, 0.002);
    ROLES.forEach((r, i) => floorPlane(r.palette, cubicleX(i), cubicleX(i) + 6, HALL.maxZ, FLOOR.maxZ, 0.002));
    // The ground you stand on.
    this.colliders.push({ minX: FLOOR.minX - 1, maxX: FLOOR.maxX + 1, minZ: FLOOR.minZ - 1, maxZ: FLOOR.maxZ + 1, top: 0, bottom: -1 });

    const ceiling = mesh(new THREE.PlaneGeometry(w, d), toon('#fbf7f0'), 0, WALL_H, 0, false);
    ceiling.rotation.x = Math.PI / 2;
    this.group.add(ceiling);

    const t = WALL_T;
    this.wallX(FLOOR.minZ - t / 2, FLOOR.minX - t, FLOOR.maxX + t, WALL_H, this.wall);
    this.wallX(FLOOR.maxZ + t / 2, FLOOR.minX - t, FLOOR.maxX + t, WALL_H, this.wall);
    this.wallZ(FLOOR.minX - t / 2, FLOOR.minZ, FLOOR.maxZ, WALL_H, this.wall);
    this.wallZ(FLOOR.maxX + t / 2, FLOOR.minZ, FLOOR.maxZ, WALL_H, this.wall);
    // Skirting all round, in the trim color.
    for (const [x0, x1, z0, z1] of [
      [FLOOR.minX, FLOOR.maxX, FLOOR.minZ, FLOOR.minZ + 0.04],
      [FLOOR.minX, FLOOR.maxX, FLOOR.maxZ - 0.04, FLOOR.maxZ],
      [FLOOR.minX, FLOOR.minX + 0.04, FLOOR.minZ, FLOOR.maxZ],
      [FLOOR.maxX - 0.04, FLOOR.maxX, FLOOR.minZ, FLOOR.maxZ],
    ])
      this.solid(x0, x1, z0, z1, 0.14, this.trim, 0, false);
  }

  private buildCeoRoom() {
    // Side walls, and a glass front onto the hallway so you see in, with the door in the middle.
    this.wallZ(CEO.minX, CEO.minZ, CEO.maxZ + WALL_T / 2, WALL_H, this.wall);
    this.wallZ(CEO.maxX, CEO.minZ, CEO.maxZ + WALL_T / 2, WALL_H, this.wall);
    const z = CEO.maxZ;
    for (const [a, b] of gaps(CEO.minX, CEO.maxX, [0])) {
      this.solid(a, b, z - WALL_T / 2, z + WALL_T / 2, 0.9, this.trim);
      this.colliders.push({ minX: a, maxX: b, minZ: z - WALL_T / 2, maxZ: z + WALL_T / 2, top: WALL_H });
      const pane = glassPane(b - a, 1.6);
      pane.position.set((a + b) / 2, 1.7, z);
      this.group.add(pane);
      this.solid(a, b, z - WALL_T / 2, z + WALL_T / 2, 0.5, this.trim, 2.5, false);
    }
    // Over the door.
    this.solid(-DOOR, DOOR, z - WALL_T / 2, z + WALL_T / 2, 0.5, this.trim, 2.5, false);
    const sign = textPlane('👑 CEO', { bg: '#fffaf3', size: 56 });
    sign.position.set(0, 2.75, z + WALL_T / 2 + 0.01);
    this.group.add(sign);

    // A rug, the desk and its chair, facing the door.
    const rug = mesh(new THREE.CircleGeometry(2.6, 40), toon(PALETTE.rugs[1]), 0, 0.01, -6.2, false);
    rug.rotation.x = -Math.PI / 2;
    this.group.add(rug);
    const wood = toon(PALETTE.wood);
    this.solid(-1.4, 1.4, -7.5, -6.6, 0.06, wood, 0.72);
    for (const sx of [-1, 1]) this.solid(sx * 1.4 - (sx > 0 ? 0.12 : 0), sx * 1.4 + (sx < 0 ? 0.12 : 0), -7.5, -6.6, 0.72, toon(PALETTE.deskLeg), 0, false);
    this.colliders.push({ minX: -1.4, maxX: 1.4, minZ: -7.5, maxZ: -6.6, top: 0.78 });
    const plate = textPlane('CEO', { bg: '#2b2d42', color: '#ffd166', size: 40, border: '#ffd166' });
    plate.position.set(0, 0.5, -6.59);
    this.group.add(plate);
    this.group.add(laptop(0.4, 0.78, -7.05, Math.PI));
    this.group.add(mug('#e63946', -0.6, 0.78, -6.9));
    this.group.add(chair(PALETTE.chairs[3], 0, -8.1, 0, 1.15));

    // The wall behind the desk: the company's name, and which project you're looking at.
    const back = textPlane('🏰 Sandcastle HQ', { bg: '#fffaf3', size: 64 });
    back.position.set(0, 2.3, CEO.minZ + 0.01);
    this.group.add(back);

    // The file stack: a cabinet by the west wall with a file on it for each project.
    const cab = toon('#8b5e3c');
    this.solid(CEO.minX + WALL_T / 2, CEO.minX + 1.05, -7.6, -5.4, 0.95, cab);
    for (const zz of [-7.05, -5.95]) {
      const handle = mesh(new THREE.BoxGeometry(0.04, 0.05, 0.35), toon('#ffd166'), CEO.minX + 1.07, 0.7, zz, false);
      this.group.add(handle);
    }
    this.stack.position.set(CEO.minX + 0.6, 0.95, -6.5);
    this.group.add(this.stack);
    const label = textSprite('📁 Project files', { bg: '#fffaf3', size: 40 });
    label.position.set(CEO.minX + 0.6, 2.05, -6.5);
    this.group.add(label);
    this.interactables.push({ kind: 'files', x: CEO.minX + 1.3, z: -6.5, radius: 1.7, label: 'Project files' });

    // Plants in the corners.
    this.group.add(plant(CEO.maxX - 0.6, CEO.minZ + 0.6, 1.2));
    this.group.add(plant(CEO.minX + 0.6, CEO.maxZ - 0.6, 1));
    this.colliders.push(box(CEO.maxX - 0.6, CEO.minZ + 0.6, 0.35, 1));
    this.colliders.push(box(CEO.minX + 0.6, CEO.maxZ - 0.6, 0.35, 1));
  }

  private buildCubicle(r: (typeof ROLES)[number], i: number) {
    const x0 = cubicleX(i);
    const x1 = x0 + 6;
    const west = x0 === FLOOR.minX;
    const east = x1 === FLOOR.maxX;
    const cx = x0 + 3;
    const accent = toon(FLOOR_PALETTES[r.palette].trim);
    const panel = toon(FLOOR_PALETTES[r.palette].wall);
    // Partitions between cubicles, and the front onto the hallway with a doorway in it.
    if (!west) this.wallZ(x0, HALL.maxZ, FLOOR.maxZ, PARTITION_H, panel);
    this.wallX(HALL.maxZ, x0 + (west ? 0 : WALL_T / 2), x1 - (east ? 0 : WALL_T / 2), PARTITION_H, panel, [cx]);
    // Their tops in the cubicle's color.
    for (const [a, b] of gaps(x0, x1, [cx])) this.solid(a, b, HALL.maxZ - 0.13, HALL.maxZ + 0.13, 0.05, accent, PARTITION_H, false);
    if (!west) this.solid(x0 - 0.13, x0 + 0.13, HALL.maxZ, FLOOR.maxZ, 0.05, accent, PARTITION_H, false);
    // A sign hung over the doorway, and the back wall painted in the cubicle's color.
    const sign = textPlane(r.title, { bg: FLOOR_PALETTES[r.palette].trim, color: '#ffffff', size: 52, border: '#2b2d42' });
    sign.position.set(cx, 2.2, HALL.maxZ - 0.02);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
    for (const sx of [-1, 1]) this.group.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), toon(PALETTE.ink), cx + sx * 0.5, 2.72, HALL.maxZ - 0.02, false));
    this.solid(x0 + 0.1, x1 - 0.1, FLOOR.maxZ - 0.02, FLOOR.maxZ, 2.2, accent, 0.14, false);

    // The desk, the agent on its stool behind it facing the doorway, and its laptop.
    const deskZ = 6.8;
    this.solid(cx - 1.1, cx + 1.1, deskZ - 0.4, deskZ + 0.4, 0.06, toon(PALETTE.desk), 0.69);
    for (const sx of [-1, 1]) this.solid(cx + sx * 1.0 - 0.04, cx + sx * 1.0 + 0.04, deskZ - 0.35, deskZ + 0.35, 0.69, toon(PALETTE.deskLeg), 0, false);
    this.colliders.push({ minX: cx - 1.1, maxX: cx + 1.1, minZ: deskZ - 0.4, maxZ: deskZ + 0.4, top: 0.75 });
    // The laptop off to its side, turned to it, so its face shows over the desk.
    this.group.add(laptop(cx + 0.55, 0.75, deskZ + 0.05, -0.45));
    this.group.add(mug(PALETTE.chairs[i], cx - 0.75, 0.75, deskZ - 0.1));
    const stool = mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.5, 16), toon(PALETTE.chairs[i]), cx, 0.25, 7.65);
    this.group.add(stool);
    this.colliders.push(box(cx, 7.65, 0.3, 0.5));
    const agent = new Agent(r.title, r.color);
    agent.root.position.set(cx, 0.4, 7.65);
    agent.root.rotation.y = Math.PI;
    this.group.add(agent.root);
    this.agents.set(r.role, agent);
    this.interactables.push({ kind: 'agent', role: r.role, x: cx, z: deskZ - 0.9, radius: 1.5, label: `Read ${r.title}'s log` });

    // Its log, up on the back wall beside it.
    const screen = new LogScreen(r.title, FLOOR_PALETTES[r.palette].trim);
    screen.mesh.position.set(cx + 1.65, 1.65, FLOOR.maxZ - 0.04);
    screen.mesh.rotation.y = Math.PI;
    this.group.add(screen.mesh);
    this.screens.set(r.role, screen);

    this.group.add(plant(x0 + 0.55, FLOOR.maxZ - 0.55, 0.9));
    this.colliders.push(box(x0 + 0.55, FLOOR.maxZ - 0.55, 0.32, 0.9));
  }

  private buildHall() {
    // A lounge either side of the CEO's room: a sofa on a rug, a plant.
    for (const sx of [-1, 1]) {
      const cx = sx * 9;
      const rug = mesh(new THREE.PlaneGeometry(4, 3), toon(PALETTE.rugs[sx < 0 ? 0 : 2]), cx, 0.01, -6.5, false);
      rug.rotation.x = -Math.PI / 2;
      this.group.add(rug);
      const sofa = toon(sx < 0 ? '#5bc0eb' : '#ff8a5b');
      this.solid(cx - 1.5, cx + 1.5, -9.9, -8.9, 0.45, sofa);
      this.solid(cx - 1.5, cx + 1.5, -9.9, -9.55, 0.95, sofa);
      for (const ax of [-1, 1]) this.solid(cx + ax * 1.5 - 0.15, cx + ax * 1.5 + 0.15, -9.9, -8.9, 0.65, sofa);
      this.solid(cx - 0.7, cx + 0.7, -6.9, -6.1, 0.4, toon(PALETTE.wood));
      this.group.add(plant(cx + sx * 2.4, -9.4, 1.3));
      this.colliders.push(box(cx + sx * 2.4, -9.4, 0.4, 1.3));
    }
    // Pendant lamps down the hallway.
    for (let x = -10; x <= 10; x += 4) {
      this.group.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), toon(PALETTE.ink), x, WALL_H - 0.25, 0, false));
      const shade = mesh(new THREE.ConeGeometry(0.28, 0.24, 18, 1, true), toon('#2b2d42'), x, WALL_H - 0.55, 0, false);
      this.group.add(shade);
      this.group.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), toon('#fff3c4', { emissive: '#ffe08a' }), x, WALL_H - 0.64, 0, false));
    }
  }

  /** The project files on the cabinet, `current` on top and sticking out. */
  setProjects(files: ProjectFile[], current: string) {
    for (const o of this.stack.children) o.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    this.stack.clear();
    const colors = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#9d4edd', '#e9c46a', '#ff8fab', '#264653'];
    const order = [...files.filter((f) => f.id !== current), ...files.filter((f) => f.id === current)].slice(-12);
    order.forEach((f, i) => {
      const top = f.id === current;
      const folder = mesh(roundedBox(0.62, 0.07, 0.85, 0.03), toon(colors[files.indexOf(f) % colors.length]), 0, 0.04 + i * 0.075, 0);
      folder.rotation.y = top ? 0 : Math.sin(i * 7.3) * 0.12;
      if (top) folder.position.x = 0.12;
      this.stack.add(folder);
      // Paper peeking out of each.
      const paper = mesh(new THREE.BoxGeometry(0.56, 0.05, 0.78), toon('#fffaf3'), 0.03, 0, 0, false);
      folder.add(paper);
      if (top) {
        const tag = textSprite(f.name, { bg: '#ffd166', size: 34 });
        tag.position.set(0.1, 0.32, 0);
        folder.add(tag);
      }
    });
  }

  /** Which project the office is showing, on the wall behind the CEO's desk. */
  setProjectName(name: string) {
    if (this.projectSign) {
      this.group.remove(this.projectSign);
      this.projectSign.material.map?.dispose();
      this.projectSign.material.dispose();
      this.projectSign.geometry.dispose();
    }
    this.projectSign = textPlane(`📁 ${name}`, { bg: '#ffd166', size: 44 });
    this.projectSign.position.set(0, 1.75, CEO.minZ + 0.02);
    this.group.add(this.projectSign);
  }

  setAgent(role: Role, status: AgentStatus, events: string[]) {
    this.agents.get(role)?.setStatus(status, events.at(-1) ?? '');
    this.screens.get(role)?.draw(status, events);
  }

  update(t: number, dt: number) {
    for (const a of this.agents.values()) a.update(dt, t);
  }
}

/** The west edge of the `i`th cubicle: the first is on the east, so from the hallway (looking south) they read left to right. */
function cubicleX(i: number): number {
  return FLOOR.maxX - (i + 1) * 6;
}

/** The stretches of [a, b] left between doorways centered at `doors`. */
function gaps(a: number, b: number, doors: number[]): [number, number][] {
  const out: [number, number][] = [];
  let from = a;
  for (const d of [...doors].sort((p, q) => p - q)) {
    if (d - DOOR > from) out.push([from, d - DOOR]);
    from = d + DOOR;
  }
  if (b > from) out.push([from, b]);
  return out;
}

/** A square collider `r` either side of (x, z), `top` high. */
function box(x: number, z: number, r: number, top: number): Collider {
  return { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top };
}

/** A laptop on a desk at (x, y, z), its screen facing whoever's on its +z side once turned `rotY`. */
function laptop(x: number, y: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const shell = toon('#adb5bd');
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.025, 0.34), shell, 0, 0.012, 0.05));
  const lid = new THREE.Group();
  lid.position.set(0, 0.025, -0.12);
  lid.rotation.x = -0.25;
  lid.add(mesh(new THREE.BoxGeometry(0.5, 0.32, 0.02), shell, 0, 0.16, 0));
  lid.add(mesh(new THREE.PlaneGeometry(0.44, 0.27), toon('#1f3b57', { emissive: '#1d4e89' }), 0, 0.16, 0.011, false));
  // The logo on its back, where you see it from the front of the desk.
  const logo = mesh(new THREE.CircleGeometry(0.04, 16), toon('#fffaf3'), 0, 0.17, -0.011, false);
  logo.rotation.y = Math.PI;
  lid.add(logo);
  g.add(lid);
  return g;
}

function mug(color: string, x: number, y: number, z: number): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 12), toon(color), x, y + 0.055, z);
}

/** A desk chair with its back to +z once turned `rotY`, `scale` times the usual size. */
function chair(color: string, x: number, z: number, rotY: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);
  const m = toon(color);
  g.add(mesh(roundedBox(0.5, 0.08, 0.5, 0.08), m, 0, 0.45, 0));
  g.add(mesh(roundedBox(0.5, 0.55, 0.08, 0.04), m, 0, 0.78, 0.22));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), toon(PALETTE.deskLeg), 0, 0.22, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 5), toon(PALETTE.deskLeg), 0, 0.03, 0));
  return g;
}

/** A potted plant, `scale` times the usual size. */
function plant(x: number, z: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.45, 14), toon(PALETTE.pot), 0, 0.225, 0));
  for (const [lx, ly, lz, r, c] of [
    [0, 0.8, 0, 0.32, PALETTE.plant],
    [0.15, 0.62, 0.1, 0.24, PALETTE.plantDark],
    [-0.14, 0.66, -0.08, 0.25, PALETTE.plantDark],
    [0.02, 1.05, 0.03, 0.2, PALETTE.plant],
  ] as const)
    g.add(mesh(new THREE.IcosahedronGeometry(r, 1), toon(c), lx, ly, lz));
  return g;
}

/** A screen on a cubicle's back wall showing its agent's status and the end of its log. */
class LogScreen {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private key = '';

  constructor(
    private title: string,
    private accent: string,
  ) {
    this.canvas.width = 900;
    this.canvas.height = 560;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.31), new THREE.MeshBasicMaterial({ map: this.tex }));
    this.draw('waiting', []);
  }

  draw(status: AgentStatus, events: string[]) {
    const key = `${status}|${events.slice(-9).join('\n')}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    const { width: w, height: h } = this.canvas;
    g.fillStyle = '#2b2d42';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0f1724';
    g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = this.accent;
    g.fillRect(14, 14, w - 28, 64);
    g.fillStyle = '#ffffff';
    g.font = '800 38px Nunito, ui-rounded, system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(`${this.title} · ${status.toUpperCase()}`, 36, 47);
    g.font = '24px ui-monospace, SFMono-Regular, Consolas, monospace';
    const lines = events.length ? events.slice(-9) : ['No activity recorded yet.'];
    lines.forEach((line, i) => {
      g.fillStyle = i === lines.length - 1 ? '#80e6bd' : '#adc2dc';
      g.fillText(fit(g, line, w - 72), 36, 112 + i * 48);
    });
    this.tex.needsUpdate = true;
  }
}

function fit(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s;
  while (s && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}
