import { TOP, W, dirOf, text, type Game, type Keys, type Sfx } from './kit';

// Falling blocks: steer each piece as it drops, fill a row across and it clears. The game everyone
// knows as Tetris.

const COLS = 10;
const ROWS = 20;
const CELL = 11;
const X0 = (W - COLS * CELL) / 2;
const Y0 = TOP + 4;
const SHAPES = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
];
const COLORS = ['#4cc9f0', '#ffd166', '#b388eb', '#06d6a0', '#ef476f', '#4f86f7', '#ff8a5b'];
/** Points for clearing 1 to 4 rows at once, times the level. */
const LINE_POINTS = [0, 100, 300, 500, 800];
/** Holding left or right: the wait before it slides on, and then how often. */
const SLIDE_WAIT = 0.17;
const SLIDE_EVERY = 0.05;

interface Piece {
  shape: number[][];
  kind: number;
  x: number;
  y: number;
}

/** `s` turned a quarter clockwise. */
function rotate(s: number[][]): number[][] {
  return s[0].map((_, c) => s.map((row) => row[c]).reverse());
}

export class Blocks implements Game {
  score = 0;
  over = false;
  /** 0 empty, else the kind of piece that left it, plus one. */
  private well: number[][] = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  private bag: number[] = [];
  private next: number;
  private piece!: Piece;
  private fall = 0;
  private lines = 0;
  private slide = { dir: 0, wait: 0 };
  /** Full rows, flashing before they go. */
  private clearing: number[] = [];
  private clearT = 0;

  constructor(private sfx: Sfx) {
    this.next = this.deal();
    this.spawn();
  }

  private get level() {
    return 1 + Math.floor(this.lines / 10);
  }

  /** The next piece from a shuffled bag of all seven, so none goes missing for long. */
  private deal(): number {
    if (!this.bag.length) {
      this.bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = 6; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  private spawn() {
    const kind = this.next;
    this.next = this.deal();
    const shape = SHAPES[kind];
    this.piece = { shape, kind, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
    if (this.hits(shape, this.piece.x, 0)) this.over = true;
  }

  private hits(s: number[][], x: number, y: number): boolean {
    for (let r = 0; r < s.length; r++)
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const wx = x + c;
        const wy = y + r;
        if (wx < 0 || wx >= COLS || wy >= ROWS || (wy >= 0 && this.well[wy][wx])) return true;
      }
    return false;
  }

  private move(dx: number, dy: number): boolean {
    const p = this.piece;
    if (this.hits(p.shape, p.x + dx, p.y + dy)) return false;
    p.x += dx;
    p.y += dy;
    return true;
  }

  private turn() {
    const p = this.piece;
    const s = rotate(p.shape);
    // Up against a wall it nudges over to fit.
    for (const k of [0, -1, 1, -2, 2])
      if (!this.hits(s, p.x + k, p.y)) {
        p.shape = s;
        p.x += k;
        this.sfx('blip');
        return;
      }
  }

  private lock() {
    const p = this.piece;
    p.shape.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v) this.well[p.y + r][p.x + c] = p.kind + 1;
      }),
    );
    this.clearing = this.well.flatMap((row, i) => (row.every((v) => v) ? [i] : []));
    if (!this.clearing.length) {
      this.sfx('hit');
      this.spawn();
      return;
    }
    this.lines += this.clearing.length;
    this.score += LINE_POINTS[this.clearing.length] * this.level;
    this.clearT = 0.3;
    this.sfx('clear');
  }

  press(code: string) {
    if (this.over || this.clearing.length) return;
    const d = dirOf(code);
    if (d?.x) {
      this.move(d.x, 0);
      this.slide = { dir: d.x, wait: SLIDE_WAIT };
    } else if (d?.y === -1 || code === 'KeyX') this.turn();
    else if (code === 'Space') {
      let n = 0;
      while (this.move(0, 1)) n++;
      this.score += n * 2;
      this.lock();
    }
  }

  update(dt: number, keys: Keys) {
    if (this.clearing.length) {
      this.clearT -= dt;
      if (this.clearT > 0) return;
      this.well = this.well.filter((_, i) => !this.clearing.includes(i));
      while (this.well.length < ROWS) this.well.unshift(Array<number>(COLS).fill(0));
      this.clearing = [];
      this.spawn();
      return;
    }
    const dir = keys.left === keys.right ? 0 : keys.left ? -1 : 1;
    if (dir !== this.slide.dir) this.slide = { dir, wait: SLIDE_WAIT };
    else if (dir) {
      this.slide.wait -= dt;
      while (this.slide.wait <= 0) {
        this.move(dir, 0);
        this.slide.wait += SLIDE_EVERY;
      }
    }
    const soft = keys.down;
    const every = soft ? 0.035 : Math.max(0.07, 0.8 - (this.level - 1) * 0.07);
    this.fall += dt;
    while (this.fall >= every) {
      this.fall -= every;
      if (this.move(0, 1)) {
        if (soft) this.score += 1;
      } else {
        this.fall = 0;
        this.lock();
        break;
      }
    }
  }

  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#0d0d1a';
    g.fillRect(0, 0, W, 240);
    g.fillStyle = '#4f86f7';
    g.fillRect(X0 - 3, Y0 - 1, COLS * CELL + 6, ROWS * CELL + 4);
    g.fillStyle = '#000';
    g.fillRect(X0, Y0, COLS * CELL, ROWS * CELL);
    const cell = (c: number, r: number, color: string) => {
      g.fillStyle = color;
      g.fillRect(X0 + c * CELL, Y0 + r * CELL, CELL - 1, CELL - 1);
      g.fillStyle = '#ffffff55';
      g.fillRect(X0 + c * CELL, Y0 + r * CELL, CELL - 1, 2);
    };
    const flash = this.clearT > 0 && Math.floor(this.clearT * 20) % 2 === 0;
    this.well.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v) cell(c, r, flash && this.clearing.includes(r) ? '#ffffff' : COLORS[v - 1]);
      }),
    );
    if (!this.clearing.length && !this.over) {
      const p = this.piece;
      // Where it'll land, outlined.
      let gy = p.y;
      while (!this.hits(p.shape, p.x, gy + 1)) gy++;
      g.strokeStyle = '#ffffff44';
      p.shape.forEach((row, r) =>
        row.forEach((v, c) => {
          if (v) g.strokeRect(X0 + (p.x + c) * CELL + 0.5, Y0 + (gy + r) * CELL + 0.5, CELL - 2, CELL - 2);
        }),
      );
      p.shape.forEach((row, r) =>
        row.forEach((v, c) => {
          if (v && p.y + r >= 0) cell(p.x + c, p.y + r, COLORS[p.kind]);
        }),
      );
    }
    const right = X0 + COLS * CELL + 16;
    text(g, 'NEXT', right, Y0 + 4, '#ffd166', 2);
    SHAPES[this.next].forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return;
        g.fillStyle = COLORS[this.next];
        g.fillRect(right + c * CELL, Y0 + 22 + r * CELL, CELL - 1, CELL - 1);
      }),
    );
    text(g, 'LEVEL', 14, Y0 + 4, '#ffd166', 2);
    text(g, String(this.level), 14, Y0 + 18, '#fff', 2);
    text(g, 'LINES', 14, Y0 + 44, '#ffd166', 2);
    text(g, String(this.lines), 14, Y0 + 58, '#fff', 2);
    text(g, '^ TURN', 14, 190, '#8892b0');
    text(g, 'SPACE DROP', 14, 200, '#8892b0');
  }
}
