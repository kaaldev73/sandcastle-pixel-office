// What every game on the CEO's retro computer shares: the screen it draws on, a chunky pixel font,
// the keys, and the beeps it asks for.

/** The screen, in its own pixels (drawn big and blocky on the CRT). */
export const W = 320;
export const H = 240;
/** The status bar across the top: games play below it. */
export const TOP = 14;

export type Sound = 'blip' | 'hit' | 'score' | 'die' | 'shoot' | 'clear';
export type Sfx = (s: Sound) => void;

/** One game: the arcade runs it while you play and draws it on the screen. */
export interface Game {
  score: number;
  over: boolean;
  /** A key going down (not its auto-repeat). */
  press(code: string): void;
  update(dt: number, keys: Keys): void;
  draw(g: CanvasRenderingContext2D): void;
}

export interface GameInfo {
  id: string;
  name: string;
  blurb: string;
  color: string;
  make(sfx: Sfx): Game;
}

/** The keys held down, read by direction: the arrows or WASD. */
export class Keys {
  readonly held = new Set<string>();
  get left() {
    return this.held.has('ArrowLeft') || this.held.has('KeyA');
  }
  get right() {
    return this.held.has('ArrowRight') || this.held.has('KeyD');
  }
  get up() {
    return this.held.has('ArrowUp') || this.held.has('KeyW');
  }
  get down() {
    return this.held.has('ArrowDown') || this.held.has('KeyS');
  }
}

/** The way a key points, or null. */
export function dirOf(code: string): { x: number; y: number } | null {
  if (code === 'ArrowLeft' || code === 'KeyA') return { x: -1, y: 0 };
  if (code === 'ArrowRight' || code === 'KeyD') return { x: 1, y: 0 };
  if (code === 'ArrowUp' || code === 'KeyW') return { x: 0, y: -1 };
  if (code === 'ArrowDown' || code === 'KeyS') return { x: 0, y: 1 };
  return null;
}

export const isAction = (code: string) => code === 'Space' || code === 'Enter';

/** A 3×5 pixel font: each glyph's rows, top to bottom. */
const GLYPHS: Record<string, string> = {
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  J: '..# ..# ..# #.# .#.',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###',
  V: '#.# #.# #.# #.# .#.',
  W: '#.# #.# ### ### #.#',
  X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.',
  Z: '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###',
  '1': '.#. ##. .#. .#. ###',
  '2': '##. ..# .#. #.. ###',
  '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#',
  '5': '### #.. ##. ..# ##.',
  '6': '.## #.. ### #.# ###',
  '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###',
  '9': '### #.# ### ..# ##.',
  ' ': '... ... ... ... ...',
  '.': '... ... ... ... .#.',
  ',': '... ... ... .#. #..',
  ':': '... .#. ... .#. ...',
  '-': '... ... ### ... ...',
  '+': '... .#. ### .#. ...',
  '=': '... ### ... ### ...',
  '!': '.#. .#. .#. ... .#.',
  '?': '##. ..# .#. ... .#.',
  '/': '..# ..# .#. #.. #..',
  '>': '#.. .#. ..# .#. #..',
  '<': '..# .#. #.. .#. ..#',
  '^': '.#. #.# ... ... ...',
  "'": '.#. .#. ... ... ...',
  '(': '.#. #.. #.. #.. .#.',
  ')': '.#. ..# ..# ..# .#.',
  '*': '... #.# .#. #.# ...',
};
const ROWS = Object.fromEntries(Object.entries(GLYPHS).map(([k, v]) => [k, v.split(' ')]));

/** How wide `s` is in the pixel font at `scale`. */
export function textWidth(s: string, scale = 1): number {
  return s.length ? (s.length * 4 - 1) * scale : 0;
}

/** Writes `s` in the pixel font, its top edge at `y`, from `x` (or centered on it, or ending at it). */
export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color = '#fff', scale = 1, align: 'left' | 'center' | 'right' = 'left') {
  s = s.toUpperCase();
  if (align === 'center') x -= Math.floor(textWidth(s, scale) / 2);
  else if (align === 'right') x -= textWidth(s, scale);
  g.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const rows = ROWS[s[i]] ?? ROWS['?'];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) if (rows[r][c] === '#') g.fillRect(x + (i * 4 + c) * scale, y + r * scale, scale, scale);
  }
}

/** Draws a pixel sprite: rows of '#' for lit pixels, `scale` screen pixels each. */
export function sprite(g: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string, scale = 1) {
  g.fillStyle = color;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '#') g.fillRect(x + c * scale, y + r * scale, scale, scale);
  });
}
