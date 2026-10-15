// Adapted from agent-office client/world/character/worker.ts and worker-badges.ts (https://github.com/AgentSystemLabs/agent-office, commit 852e2ab).
// Copyright (c) 2026 AgentSystemLabs. MIT License: see THIRD_PARTY_NOTICES.md.
// Changes: the Worker's body and status light only, with Sandcastle's statuses acted out more simply;
// no dances, props, costumes, jail or walking.

import * as THREE from 'three';
import { cardSprite, disposeSprite, mesh, toon, toonUnique } from '../toon';

export type AgentStatus = 'waiting' | 'idle' | 'working' | 'done' | 'error';

export const STATUS_BULB: Record<AgentStatus, string> = {
  waiting: '#adb5bd',
  idle: '#8ecae6',
  working: '#ffd166',
  done: '#06d6a0',
  error: '#ef476f',
};

/** Status pill on an agent's card: [text, background, text color]. */
const CHIP: Record<AgentStatus, [string, string, string]> = {
  waiting: ['⏳ WAITING', STATUS_BULB.waiting, '#2b2d42'],
  idle: ['💤 IDLE', STATUS_BULB.idle, '#2b2d42'],
  working: ['⌨️ WORKING', STATUS_BULB.working, '#2b2d42'],
  done: ['✅ DONE', STATUS_BULB.done, '#2b2d42'],
  error: ['⚠️ ERROR', STATUS_BULB.error, '#ffffff'],
};

/** A little Claude agent at its cubicle desk, showing a Sandcastle role's status. Forward is +z. */
export class Agent {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private bulb: THREE.MeshToonMaterial;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private feet: THREE.Mesh[] = [];
  private eyes: THREE.Mesh[] = [];
  private blinkAt = Math.random() * 4;
  private card: THREE.Sprite | null = null;
  private cardKey = '';
  private phase = Math.random() * Math.PI * 2;
  status: AgentStatus = 'waiting';

  constructor(
    private title: string,
    color: string,
  ) {
    const skin = toonUnique(color);
    const white = toon('#ffffff');
    const ink = toon('#1d1d1d');

    this.root.add(this.body);
    // Bean-shaped body
    this.body.add(mesh(new THREE.CapsuleGeometry(0.28, 0.3, 8, 16), skin, 0, 0.55, 0));
    // Big cartoon eyes
    for (const sx of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.09, 12, 10), white, sx * 0.11, 0.7, 0.23, false);
      eye.scale.z = 0.6;
      this.body.add(eye);
      const pupil = mesh(new THREE.SphereGeometry(0.045, 10, 8), ink, sx * 0.11, 0.7, 0.29, false);
      this.body.add(pupil);
      this.eyes.push(eye, pupil);
    }
    // Headset: band + ear cups
    const band = mesh(new THREE.TorusGeometry(0.29, 0.025, 6, 20, Math.PI), toon('#2b2d42'), 0, 0.72, 0, false);
    band.rotation.y = Math.PI / 2;
    this.body.add(band);
    for (const sx of [-1, 1]) this.body.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), toon('#2b2d42'), sx * 0.29, 0.72, 0, false));
    // Antenna with status bulb
    this.body.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), toon('#2b2d42'), 0, 1.07, 0, false));
    this.bulb = toonUnique(STATUS_BULB.waiting);
    this.body.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), this.bulb, 0, 1.2, 0, false));

    const arm = (x: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.55, 0.05);
      pivot.add(mesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 8), skin, 0, -0.12, 0));
      this.body.add(pivot);
      return pivot;
    };
    this.armL = arm(-0.3);
    this.armR = arm(0.3);
    for (const sx of [-1, 1]) {
      const foot = mesh(new THREE.CapsuleGeometry(0.06, 0.1, 4, 8), skin, sx * 0.12, 0.2, 0.05);
      this.body.add(foot);
      this.feet.push(foot);
    }
    this.setStatus('waiting', '');
  }

  /** Its Sandcastle status, and the latest line of its log for its card. */
  setStatus(status: AgentStatus, line: string) {
    this.status = status;
    this.bulb.color.set(STATUS_BULB[status]);
    this.bulb.emissive = new THREE.Color(STATUS_BULB[status]).multiplyScalar(status === 'working' || status === 'error' ? 0.6 : 0.3);
    const body = line || (status === 'waiting' ? 'No log yet' : '');
    const key = `${status}|${body}`;
    if (key === this.cardKey) return;
    this.cardKey = key;
    if (this.card) {
      this.root.remove(this.card);
      disposeSprite(this.card);
    }
    const [text, bg, color] = CHIP[status];
    this.card = cardSprite({ chip: { text, bg, color }, title: this.title, body: body || undefined, bg: '#fffaf3', border: status === 'error' ? STATUS_BULB.error : undefined, maxWidth: 360 });
    this.card.position.y = 1.4;
    this.root.add(this.card);
  }

  update(dt: number, t: number) {
    const p = t * 1 + this.phase;
    let y = 0;
    let lean = 0;
    let armX = 0;
    let armXR = 0;
    let armZ = 0;
    switch (this.status) {
      case 'working':
        // Typing: both hands on the keys, out of step, and a little bounce.
        armX = armXR = -1.1;
        armX += Math.sin(t * 18) * 0.18;
        armXR += Math.sin(t * 18 + 1.7) * 0.18;
        y = Math.abs(Math.sin(t * 9)) * 0.03;
        lean = 0.12;
        break;
      case 'done':
        // A happy hop every couple of seconds, arms up.
        y = Math.max(0, Math.sin(p * 3)) ** 2 * 0.18;
        armZ = 2.3;
        break;
      case 'error':
        // Slumped over, shaking its head.
        lean = 0.35;
        this.body.rotation.y = Math.sin(t * 5) * 0.25;
        armX = armXR = -0.3;
        break;
      case 'idle':
        // Leant back, breathing slowly.
        lean = -0.1;
        y = Math.sin(p * 1.5) * 0.015;
        break;
      case 'waiting':
        // Looking round for something to do.
        this.body.rotation.y = Math.sin(p * 0.8) * 0.5;
        y = Math.sin(p * 1.5) * 0.015;
        break;
    }
    if (this.status !== 'error' && this.status !== 'waiting') this.body.rotation.y *= Math.exp(-dt * 6);
    this.body.position.y += (y - this.body.position.y) * Math.min(1, dt * 12);
    this.body.rotation.x += (lean - this.body.rotation.x) * Math.min(1, dt * 6);
    this.armL.rotation.x += (armX - this.armL.rotation.x) * Math.min(1, dt * 12);
    this.armR.rotation.x += (armXR - this.armR.rotation.x) * Math.min(1, dt * 12);
    this.armL.rotation.z += (-armZ - this.armL.rotation.z) * Math.min(1, dt * 8);
    this.armR.rotation.z += (armZ - this.armR.rotation.z) * Math.min(1, dt * 8);
    // Blink now and then.
    this.blinkAt -= dt;
    const blink = this.blinkAt < 0.12 && this.blinkAt > 0;
    if (this.blinkAt <= 0) this.blinkAt = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = blink ? 0.15 : 1;
    if (this.status === 'working') this.bulb.emissive.setScalar(0).add(new THREE.Color(STATUS_BULB.working).multiplyScalar(0.4 + 0.3 * Math.sin(t * 8)));
  }
}
