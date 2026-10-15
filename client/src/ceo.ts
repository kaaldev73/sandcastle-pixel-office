import { randomLook, randomName, sanitizeLook, type Look } from './vendor/agent-office/avatar';
import { PALETTE } from './vendor/agent-office/materials';

// Who you are: the CEO you made on the character screen, kept in this browser.

export interface Ceo {
  name: string;
  look: Look;
  shirt: string;
}

export const SHIRTS = [...PALETTE.chairs, '#2b2d42', '#e63946', '#2a9d8f', '#fffaf3'];
const KEY = 'pixel-office.ceo';

export function loadCeo(): Ceo | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw.name !== 'string') return null;
    return { name: raw.name.slice(0, 24), look: sanitizeLook(raw.look, randomLook()), shirt: SHIRTS.includes(raw.shirt) ? raw.shirt : SHIRTS[0] };
  } catch {
    return null;
  }
}

export function saveCeo(ceo: Ceo) {
  localStorage.setItem(KEY, JSON.stringify(ceo));
}

export function randomCeo(): Ceo {
  return { name: randomName(), look: randomLook(), shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)] };
}
