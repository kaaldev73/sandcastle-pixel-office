// Adapted from agent-office client/player/index.ts and camera.ts (https://github.com/AgentSystemLabs/agent-office, commit 852e2ab).
// Copyright (c) 2026 AgentSystemLabs. MIT License: see THIRD_PARTY_NOTICES.md.
// Changes: one floor, no seats, paths, ladders, cars, street or effects; in third person the camera
// pulls in front of whatever's between it and you, instead of keeping to the room.

import * as THREE from 'three';
import type { Collider } from '../types';
import { PlayerInput, type ViewMode } from './pointer';
import { HEIGHT, STEP, ceilingAt, groundAt, stepTo } from './collide';

// You: walking, running and jumping, bumping into things and climbing stairs, and the camera, at
// your eyes in first person or behind you in third. The keys and the mouse are PlayerInput's
// (pointer.ts).

const WALK = 4.6;
const RUN = 7.5;
const JUMP_V = 6.4;
const GRAVITY = 18;
/** Camera height above your feet (the Person's eyes). */
export const EYE_HEIGHT = 1.4;
/** What the third-person camera looks at, above your feet, and how far it keeps off walls. */
const FOLLOW_HEIGHT = 1.3;
const CAM_GAP = 0.2;

export class PlayerController extends PlayerInput {
  pos = new THREE.Vector3();
  vy = 0;
  facing = Math.PI;
  moving = false;
  running = false;
  grounded = true;
  /** Walk cycle phase, shared by the camera bob and your body. */
  walkPhase = 0;
  private bob = 0;
  /** Eased out after a step up or down, so the camera glides up stairs instead of popping. */
  stepOffset = 0;
  /** The third-person camera stays under this (the ceiling). */
  roof = Infinity;
  /** How far back the third-person camera is now: in at once when something's in the way, out gently. */
  private followDist = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    /** What you bump into and stand on. */
    public colliders: Collider[],
  ) {
    super(dom);
    camera.rotation.order = 'YXZ';
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    let ix = 0;
    let iz = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    }
    const steering = ix !== 0 || iz !== 0;
    this.moving = steering;
    this.running = steering && (k.has('ShiftLeft') || k.has('ShiftRight'));
    if (this.view === 'first') this.facing = Math.atan2(Math.sin(this.camYaw + Math.PI), Math.cos(this.camYaw + Math.PI));
    if (steering) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      // Camera-relative: "forward" is where the camera looks.
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const dx = ix * cos + iz * sin;
      const dz = -ix * sin + iz * cos;
      const speed = this.running ? RUN : WALK;
      stepTo(this, this.pos.x + dx * speed * dt, this.pos.z);
      stepTo(this, this.pos.x, this.pos.z + dz * speed * dt);
      if (this.view === 'third') {
        // Turn to walk the way you're going.
        const diff = Math.atan2(dx, dz) - this.facing;
        this.facing += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, dt * 14);
      }
    }

    const ground = Math.max(groundAt(this.colliders, this.pos.x, this.pos.z, this.pos.y), 0);
    const jump = this.enabled && k.has('Space') && this.grounded;
    if (jump) {
      this.vy = JUMP_V;
      this.grounded = false;
    } else if (this.grounded && this.pos.y > ground && this.pos.y - ground <= STEP + 0.02) {
      // Walking down a stair: stay on your feet rather than falling a step.
      this.stepOffset += this.pos.y - ground;
      this.pos.y = ground;
    }
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.02) {
      this.grounded = false;
    }
    const ceiling = ceilingAt(this.colliders, this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y + HEIGHT > ceiling) {
      this.pos.y = Math.max(ground, ceiling - HEIGHT);
      this.vy = Math.min(this.vy, 0);
    }
    this.stepOffset *= Math.exp(-dt * 16);
    const walking = this.moving && this.grounded;
    this.walkPhase += dt * (walking ? (this.running ? 14 : 11) : 0);
    const bob = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.035 : 0;
    this.bob += (bob - this.bob) * Math.min(1, dt * 18);
    this.updateCamera(dt);
  }

  setView(view: ViewMode) {
    if (view === this.view) return;
    // Either way you keep looking the way you were.
    if (view === 'first') this.lookPitch = -0.08;
    else this.camYaw = this.facing - Math.PI;
    this.view = view;
    this.followDist = 0;
    this.updateCamera(0);
  }

  updateCamera(dt: number) {
    if (this.view === 'first') {
      this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT + this.bob + this.stepOffset, this.pos.z);
      this.camera.rotation.set(this.lookPitch, this.camYaw, 0);
      return;
    }
    const target = new THREE.Vector3(this.pos.x, this.pos.y + this.stepOffset + FOLLOW_HEIGHT, this.pos.z);
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch),
    );
    let dist = Math.min(this.camDist, this.clearance(target, dir));
    if (this.roof < Infinity && dir.y > 0) dist = Math.min(dist, (this.roof - target.y) / dir.y);
    if (dir.y < 0) dist = Math.min(dist, (0.3 - target.y) / dir.y);
    this.followDist = dist < this.followDist || !this.followDist ? dist : this.followDist + (dist - this.followDist) * Math.min(1, dt * 6);
    this.camera.position.copy(target).addScaledVector(dir, Math.max(this.followDist, 0.3));
    this.camera.lookAt(target);
  }

  /** How far the camera can go from `from` along `dir` before it comes within CAM_GAP of a collider. */
  private clearance(from: THREE.Vector3, dir: THREE.Vector3): number {
    let best = Infinity;
    const o = [from.x, from.y, from.z];
    const d = [dir.x, dir.y, dir.z];
    for (const c of this.colliders) {
      if (c.top <= 0.05) continue; // the floor
      const lo = [c.minX - CAM_GAP, (c.bottom ?? 0) - CAM_GAP, c.minZ - CAM_GAP];
      const hi = [c.maxX + CAM_GAP, c.top + CAM_GAP, c.maxZ + CAM_GAP];
      let near = 0;
      let far = Infinity;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) {
          if (o[i] < lo[i] || o[i] > hi[i]) far = -1;
          continue;
        }
        const a = (lo[i] - o[i]) / d[i];
        const b = (hi[i] - o[i]) / d[i];
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
      // Starting inside one (you're up against it), it doesn't count: only what's beyond you does.
      const inside = o.every((v, i) => v > lo[i] && v < hi[i]);
      if (!inside && near <= far && near < best) best = near;
    }
    return best;
  }

  /** Unit vector you're facing, on the XZ plane. */
  forward(): THREE.Vector2 {
    return new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
  }
}
