// Adapted from agent-office client/world/office/materials.ts and shared/floors.ts (https://github.com/AgentSystemLabs/agent-office, commit 852e2ab).
// Copyright (c) 2026 AgentSystemLabs. MIT License: see THIRD_PARTY_NOTICES.md.
// Changes: just the palette, the planks and the window glass.

import * as THREE from 'three';
import { mesh } from './toon';

/** How a room looks: its walls, their trim, and its planks. */
export interface FloorPalette {
  name: string;
  wall: string;
  trim: string;
  floor: string;
  floorAlt: string;
  /** The gaps between planks. */
  seam: string;
}

export const FLOOR_PALETTES: FloorPalette[] = [
  { name: 'Maple', wall: '#fff6ea', trim: '#e8a87c', floor: '#f2d7b0', floorAlt: '#e9c89a', seam: '#d9b88c' },
  { name: 'Mint', wall: '#e3f6ec', trim: '#40a878', floor: '#cfe6d9', floorAlt: '#bcdcc9', seam: '#9fc6b0' },
  { name: 'Sky', wall: '#e7f0ff', trim: '#4f7fe0', floor: '#d6dde9', floorAlt: '#c5cedd', seam: '#aab5c8' },
  { name: 'Lavender', wall: '#f2eaff', trim: '#9470e0', floor: '#e1d7ef', floorAlt: '#d2c4e7', seam: '#b8a6d6' },
  { name: 'Peach', wall: '#ffefe6', trim: '#ea7352', floor: '#efc6a5', floorAlt: '#e5b48e', seam: '#cf9c76' },
  { name: 'Walnut', wall: '#f5eee5', trim: '#8b5e3c', floor: '#aa7650', floorAlt: '#9b6845', seam: '#7c5236' },
];

export const PALETTE = {
  desk: '#f7f3ea',
  deskLeg: '#3d405b',
  wood: '#c98b5a',
  chairs: ['#ff8a5b', '#5bc0eb', '#9bc53d', '#b388eb', '#ffb400', '#f7aef8'],
  rugs: ['#bde0fe', '#ffd6a5', '#caffbf', '#ffc6ff'],
  plant: '#5fb760',
  plantDark: '#3f8f45',
  pot: '#e76f51',
  ink: '#2b2d42',
};

/** Window glass: faintly blue and see-through. */
export const GLASS = new THREE.MeshBasicMaterial({ color: '#d6f1ff', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
const SHINE = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

/** A sheet of glass `w` by `h`, centered, with a cartoon glint so it reads as glass. */
export function glassPane(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(w, h), GLASS, 0, 0, 0, false));
  const glint = mesh(new THREE.PlaneGeometry(Math.min(0.18, w * 0.2), h * 0.55), SHINE, -w * 0.2, h * 0.07, 0.01, false);
  glint.rotation.z = -0.5;
  g.add(glint);
  return g;
}

/** Chunky planks in a palette's colors. */
export function paintPlanks(c: HTMLCanvasElement, p: FloorPalette) {
  const g = c.getContext('2d')!;
  g.fillStyle = p.floor;
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 128;
    for (let col = -1; col < 3; col++) {
      const x = col * 256 + offset;
      g.fillStyle = (row + col) % 3 === 0 ? p.floorAlt : p.floor;
      g.fillRect(x + 2, row * 64 + 2, 252, 60);
    }
    g.fillStyle = p.seam;
    g.fillRect(0, row * 64, 512, 3);
  }
}

export function floorTexture(p: FloorPalette, width: number, depth: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  paintPlanks(c, p);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(width / 6, depth / 6);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
