// Adapted from agent-office client/world/character/person.ts (https://github.com/AgentSystemLabs/agent-office, commit 852e2ab).
// Copyright (c) 2026 AgentSystemLabs. MIT License: see THIRD_PARTY_NOTICES.md.
// Changes: just the body, its look and the walk; no props, voice, emotes, seats or costumes.

import * as THREE from 'three';
import { HAIR_COLORS, SKIN_TONES, type Look } from '../avatar';
import { HIPS, type PersonRig } from './rig';
import { disposeSprite, mesh, textSprite, toon, toonUnique } from '../toon';
import { styleHair } from './person-hair';

/** A chibi cartoon person: the CEO. Forward is +z. */
export class Person {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  /** Its moving parts, for FirstPersonBody (person-first.ts). */
  readonly rig: PersonRig;
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private shirt: THREE.MeshToonMaterial;
  private skin: THREE.MeshToonMaterial;
  private hairMat: THREE.MeshToonMaterial;
  private hair = new THREE.Group();
  private head: THREE.Group;
  private label: THREE.Sprite | null = null;
  private walkPhase = 0;

  constructor(name: string, color: string, look: Look) {
    this.shirt = toonUnique(color);
    const skin = (this.skin = toonUnique(SKIN_TONES[look.skin]));
    this.hairMat = toonUnique(HAIR_COLORS[look.hair]);
    this.hairMat.side = THREE.DoubleSide;
    const pants = toon('#3d405b');
    const ink = toon('#1d1d1d');

    this.root.add(this.body);
    const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.28, 6, 12), this.shirt, 0, 0.72, 0);
    this.body.add(torso);
    const head = (this.head = new THREE.Group());
    head.position.y = 1.32;
    head.add(mesh(new THREE.SphereGeometry(0.34, 20, 16), skin));
    head.add(this.hair);
    styleHair(this.hair, this.hairMat, look.style);
    for (const sx of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), ink, sx * 0.12, 0.02, 0.3, false));
      head.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), toon('#ff9f9f'), sx * 0.2, -0.08, 0.27, false));
    }
    const smile = mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), ink, 0, -0.08, 0.32, false);
    smile.rotation.z = Math.PI;
    head.add(smile);
    this.body.add(head);

    const limb = (len: number, r: number, mat: THREE.Material, x: number, y: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat, 0, -len / 2 - r / 2, 0));
      this.body.add(pivot);
      return pivot;
    };
    this.legL = limb(0.22, 0.1, pants, -0.12, HIPS);
    this.legR = limb(0.22, 0.1, pants, 0.12, HIPS);
    this.armL = limb(0.24, 0.08, this.shirt, -0.33, 0.9);
    this.armR = limb(0.24, 0.08, this.shirt, 0.33, 0.9);
    for (const arm of [this.armL, this.armR]) arm.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), skin, 0, -0.38, 0));
    this.rig = { root: this.root, body: this.body, torso, head, armL: this.armL, armR: this.armR, legL: this.legL, legR: this.legR };
    this.setName(name);
  }

  /** Repaints them in `look` and `shirt`, as the character creator changes them. */
  setLook(look: Look, shirt: string) {
    this.skin.color.set(SKIN_TONES[look.skin]);
    this.hairMat.color.set(HAIR_COLORS[look.hair]);
    this.shirt.color.set(shirt);
    styleHair(this.hair, this.hairMat, look.style);
  }

  setName(name: string) {
    if (this.label) {
      this.root.remove(this.label);
      disposeSprite(this.label);
      this.label = null;
    }
    if (!name) return;
    this.label = textSprite(name, { bg: '#fffaf3', size: 40 });
    this.label.position.y = 2.05;
    this.root.add(this.label);
  }

  update(dt: number, moving: boolean, airborne: boolean, pace = 1) {
    const target = moving ? 1 : 0;
    this.walkPhase += dt * 11 * target * pace;
    const swing = Math.sin(this.walkPhase) * 0.7 * target;
    if (airborne) {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.3;
      this.armL.rotation.z = -2.4;
      this.armR.rotation.z = 2.4;
      this.armL.rotation.x = this.armR.rotation.x = 0;
    } else {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing;
      this.armR.rotation.x = swing;
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, -0.1, 0.3);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, 0.1, 0.3);
    }
    this.body.position.y = moving && !airborne ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
  }
}
