import * as THREE from 'three';
import { mesh, toon } from './vendor/agent-office/toon';

// What you see out of the lounge's windows (the office's north-west corner): a beach and the sea to the
// north with hills across the bay, and to the west a lawn, woods, and mountains. Seen from inside
// only, so none of it is anything you can walk on or bump into.

/** The same scenery every time: a small seeded random. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const flat = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
  const m = mesh(geo, toon(color), x, y, z, false);
  m.rotation.x = -Math.PI / 2;
  return m;
};

export class Outdoors {
  readonly group = new THREE.Group();
  private waves: THREE.Mesh[] = [];

  constructor() {
    const g = this.group;
    const rand = seeded(7);
    // The ground: grass all round, a beach along the north, and the sea beyond it.
    g.add(flat(new THREE.PlaneGeometry(400, 400), '#8fd16a', 0, -0.05, 0));
    g.add(flat(new THREE.PlaneGeometry(260, 12), '#f4dfa8', -40, -0.03, -21));
    g.add(flat(new THREE.PlaneGeometry(260, 180), '#3fa7d6', -40, -0.04, -117));
    g.add(flat(new THREE.PlaneGeometry(260, 0.6), '#ffffff', -40, -0.025, -26.8));
    for (let i = 0; i < 26; i++) {
      const w = flat(new THREE.PlaneGeometry(3 + rand() * 5, 0.25), '#9bd8f2', -110 + rand() * 120, -0.035, -30 - rand() * 60);
      w.userData.phase = rand() * Math.PI * 2;
      this.waves.push(w);
      g.add(w);
    }

    // Mountains: to the west behind the woods, and low hills across the bay to the north.
    const mountain = (x: number, z: number, r: number, h: number, color: string, snow: boolean) => {
      const m = mesh(new THREE.ConeGeometry(r, h, 7), toon(color), x, h / 2 - 0.5, z, false);
      m.rotation.y = rand() * Math.PI;
      g.add(m);
      if (snow) {
        const cap = mesh(new THREE.ConeGeometry(r * 0.3, h * 0.3, 7), toon('#ffffff'), x, h * 0.85 - 0.5, z, false);
        cap.rotation.y = m.rotation.y;
        g.add(cap);
      }
    };
    for (let i = 0; i < 9; i++) {
      const z = -70 + i * 17 + rand() * 6;
      mountain(-80 - rand() * 20, z, 14 + rand() * 10, 24 + rand() * 22, i % 2 ? '#6c8a9e' : '#7d98a8', rand() < 0.7);
    }
    for (let i = 0; i < 6; i++) mountain(-55 - rand() * 15, -45 + i * 19 + rand() * 6, 10 + rand() * 6, 10 + rand() * 8, '#5f9e5a', false);
    for (let i = 0; i < 8; i++) mountain(-100 + i * 18 + rand() * 6, -95 - rand() * 10, 12 + rand() * 8, 10 + rand() * 14, '#8aa7b8', false);

    // Woods on the lawn to the west, thinning out towards the house; a hedge and flowers by the window.
    for (let i = 0; i < 70; i++) {
      const x = -18 - rand() * 36;
      const z = -14 + rand() * 50;
      if (rand() < 0.5) this.pine(x, z, 0.8 + rand() * 0.8);
      else this.tree(x, z, 0.8 + rand() * 0.7);
    }
    for (let i = 0; i < 14; i++) {
      const bush = mesh(new THREE.SphereGeometry(0.5 + rand() * 0.3, 8, 6), toon(rand() < 0.5 ? '#4f9d47' : '#5cb85c'), -13.2 - rand() * 2, 0.3, -11 + rand() * 9, false);
      g.add(bush);
    }
    for (let i = 0; i < 40; i++) {
      const color = ['#ff6b9a', '#ffd166', '#ffffff', '#b388eb'][i % 4];
      g.add(mesh(new THREE.SphereGeometry(0.09, 6, 4), toon(color), -12.6 - rand() * 5, 0.08, -12 + rand() * 11, false));
    }

    // Palms along the beach, and a sunshade.
    for (let i = 0; i < 9; i++) this.palm(-50 + i * 6 + rand() * 3, -17 - rand() * 4, rand() * Math.PI * 2);
    const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), toon('#ffffff'), -9, 1.1, -20, false);
    g.add(pole);
    const shade = mesh(new THREE.ConeGeometry(1.6, 0.6, 10), toon('#ef476f'), -9, 2.2, -20, false);
    g.add(shade);
    const towel = flat(new THREE.PlaneGeometry(1, 2), '#4cc9f0', -8, -0.02, -21);
    g.add(towel);

    // The sun, and some clouds.
    g.add(mesh(new THREE.SphereGeometry(6, 20, 14), toon('#fff3b0', { emissive: '#ffe066' }), -60, 45, -100, false));
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      c.position.set(-100 + rand() * 110, 25 + rand() * 15, -100 + rand() * 140);
      if (c.position.x > -20 && c.position.z > -20) c.position.x -= 40;
      for (let k = 0; k < 4; k++) c.add(mesh(new THREE.SphereGeometry(2 + rand() * 2, 10, 8), toon('#ffffff'), k * 2.5 - 4, rand(), rand() * 2, false));
      c.scale.y = 0.6;
      g.add(c);
    }
  }

  private pine(x: number, z: number, s: number) {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.scale.setScalar(s);
    t.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), toon('#8b5e3c'), 0, 0.5, 0, false));
    for (let k = 0; k < 3; k++) t.add(mesh(new THREE.ConeGeometry(1.3 - k * 0.3, 1.6, 7), toon(k % 2 ? '#2f7d4a' : '#3a8f55'), 0, 1.5 + k * 0.9, 0, false));
    this.group.add(t);
  }

  private tree(x: number, z: number, s: number) {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.scale.setScalar(s);
    t.add(mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), toon('#8b5e3c'), 0, 0.8, 0, false));
    t.add(mesh(new THREE.IcosahedronGeometry(1.2, 0), toon('#6cbf4a'), 0, 2.3, 0, false));
    t.add(mesh(new THREE.IcosahedronGeometry(0.8, 0), toon('#7fd35a'), 0.5, 2.9, 0.3, false));
    this.group.add(t);
  }

  private palm(x: number, z: number, turn: number) {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    p.rotation.y = turn;
    // A trunk that leans, in segments, with the leaves on top.
    let top = new THREE.Vector3();
    for (let k = 0; k < 6; k++) {
      const seg = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.75, 6), toon(k % 2 ? '#a0754c' : '#8b6239'), k * k * 0.03, 0.37 + k * 0.7, 0, false);
      seg.rotation.z = -k * 0.05;
      p.add(seg);
      top = new THREE.Vector3(k * k * 0.03, 0.37 + k * 0.7 + 0.35, 0);
    }
    for (let k = 0; k < 7; k++) {
      const arm = new THREE.Group();
      arm.position.copy(top);
      arm.rotation.y = (k / 7) * Math.PI * 2;
      const leaf = mesh(new THREE.BoxGeometry(1.8, 0.04, 0.42), toon(k % 2 ? '#3fae49' : '#4cc05a'), 0.85, -0.25, 0, false);
      leaf.rotation.z = -0.35;
      arm.add(leaf);
      p.add(arm);
    }
    p.add(mesh(new THREE.SphereGeometry(0.14, 6, 5), toon('#6b4a2b'), top.x + 0.15, top.y - 0.15, 0, false));
    this.group.add(p);
  }

  update(t: number) {
    // The waves drift in and out a little.
    for (const w of this.waves) w.position.z += Math.sin(t * 0.6 + w.userData.phase) * 0.004;
  }
}
