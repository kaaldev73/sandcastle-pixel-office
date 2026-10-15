// Adapted from agent-office client/player/index.ts and camera.ts (https://github.com/AgentSystemLabs/agent-office, commit 852e2ab).
// Copyright (c) 2026 AgentSystemLabs. MIT License: see THIRD_PARTY_NOTICES.md.
// Changes: first person only, on one floor: no seats, paths, ladders, cars, street or effects.

import * as THREE from 'three';
import type { Collider } from '../types';
import { PlayerInput } from './pointer';
import { HEIGHT, STEP, ceilingAt, groundAt, stepTo } from './collide';

// You: walking, running and jumping, bumping into things and climbing stairs, and the camera at
// your eyes. The keys and the mouse are PlayerInput's (pointer.ts).

const WALK = 4.6;
const RUN = 7.5;
const JUMP_V = 6.4;
const GRAVITY = 18;
/** Camera height above your feet (the Person's eyes). */
export const EYE_HEIGHT = 1.4;

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
    this.facing = Math.atan2(Math.sin(this.camYaw + Math.PI), Math.cos(this.camYaw + Math.PI));
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
    this.updateCamera();
  }

  updateCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT + this.bob + this.stepOffset, this.pos.z);
    this.camera.rotation.set(this.lookPitch, this.camYaw, 0);
  }

  /** Unit vector you're facing, on the XZ plane. */
  forward(): THREE.Vector2 {
    return new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
  }
}
