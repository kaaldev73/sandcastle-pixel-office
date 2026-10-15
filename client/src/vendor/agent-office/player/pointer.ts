// Adapted from agent-office client/player/pointer.ts (https://github.com/AgentSystemLabs/agent-office, commit 852e2ab).
// Copyright (c) 2026 AgentSystemLabs. MIT License: see THIRD_PARTY_NOTICES.md.
// Changes: first person only (no third-person orbit or zoom), and none of the window hand-back logic.

import * as THREE from 'three';

// Your hands on the controls: the keys you hold, and the mouse, which looks around. A click on the
// scene captures the mouse (pointer lock); where it won't lock, you drag to look.

const LOOK_SPEED = 0.0022; // radians per pixel of mouse movement while the pointer is locked
const DRAG_LOOK_SPEED = 0.005;

/** Where you look and what steers it: the PlayerController is built on this (see controller.ts). */
export abstract class PlayerInput {
  /** Heading of the camera. You look along (-sin, -cos) of it on the XZ plane. */
  camYaw = 0;
  /** Look up (+) / down (-). */
  lookPitch = -0.08;
  protected keys = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  /** Set when this browser won't lock the pointer; falls back to drag-to-look. */
  private lockFailed = false;
  enabled = true;

  constructor(private dom: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || isTyping(e)) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && !this.lockFailed && !this.locked) this.lock();
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => (this.drag = null));
    window.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        // Some platforms report a bogus huge jump right after locking.
        const clamp = (v: number) => THREE.MathUtils.clamp(v, -250, 250);
        this.look(clamp(e.movementX) * LOOK_SPEED, clamp(e.movementY) * LOOK_SPEED);
        return;
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.look(dx * DRAG_LOOK_SPEED, dy * DRAG_LOOK_SPEED);
    });
    document.addEventListener('pointerlockerror', () => (this.lockFailed = true));
  }

  get locked(): boolean {
    return document.pointerLockElement === this.dom;
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  lock() {
    if (this.locked) return;
    if (typeof this.dom.requestPointerLock !== 'function') {
      this.lockFailed = true;
      return;
    }
    try {
      // Newer browsers return a promise; older ones report through pointerlockerror.
      const p = this.dom.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      this.lockFailed = true;
    }
  }

  clearKeys() {
    this.keys.clear();
  }

  private look(dx: number, dy: number) {
    this.camYaw -= dx;
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - dy, -1.45, 1.45);
  }
}

export function isTyping(e?: Event): boolean {
  const el = (e?.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
