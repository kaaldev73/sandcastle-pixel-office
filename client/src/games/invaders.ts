import { H, TOP, W, sprite, text, type Game, type Keys, type Sfx } from './kit';

// Invaders: the rows march side to side and down, faster as you thin them out. Shoot them before
// they land, hide behind the bunkers, and pick off the saucer for a bonus.

const COLS = 9;
const ROWS = 5;
const SCALE = 2;
const DX = 22;
const DY = 18;
const ALIEN = 8 * SCALE;
const SHIP_Y = 222;
const SHIP_W = 13;
const LAND = 206;

const SQUID = [
  ['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
  ['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.'],
];
const CRAB = [
  ['.#....#.', '..#..#..', '.######.', '##.##.##', '########', '#.####.#', '#.#..#.#', '...##...'],
  ['.#....#.', '#.#..#.#', '#.####.#', '##.##.##', '########', '.######.', '..#..#..', '.#....#.'],
];
const OCTO = [
  ['..####..', '.######.', '########', '#..##..#', '########', '..#..#..', '.#.##.#.', '#......#'],
  ['..####..', '.######.', '########', '#..##..#', '########', '.##..##.', '#..##..#', '.#....#.'],
];
/** Each row's look, color and worth, top to bottom. */
const ROW_KIND = [
  { frames: SQUID, color: '#ff6ad5', points: 30 },
  { frames: CRAB, color: '#4cc9f0', points: 20 },
  { frames: CRAB, color: '#4cc9f0', points: 20 },
  { frames: OCTO, color: '#06d6a0', points: 10 },
  { frames: OCTO, color: '#06d6a0', points: 10 },
];
const SHIP = ['......#......', '.....###.....', '.###########.', '#############', '#############', '#############'];
const SAUCER = ['....####....', '..########..', '.##.##.##.##', '############', '..###..###..', '...#....#...'];
const BUNKER = ['..#######..', '.#########.', '###########', '###########', '###########', '###########', '###.....###', '##.......##'];
const BUNKER_CELL = 2;

interface Shot {
  x: number;
  y: number;
}

export class Invaders implements Game {
  score = 0;
  over = false;
  private lives = 3;
  private wave = 1;
  private alive: boolean[] = [];
  private gx = 0;
  private gy = 0;
  private dir = 1;
  private frame = 0;
  private marchT = 0;
  private shipX = W / 2 - SHIP_W / 2;
  private bullet: Shot | null = null;
  private bombs: Shot[] = [];
  private bombT = 1;
  private bunkers: { x: number; y: number; cells: boolean[][] }[] = [];
  private saucer: { x: number; dir: number } | null = null;
  private saucerT = 15;
  private booms: { x: number; y: number; t: number; label?: string }[] = [];
  /** Time left knocked out, after a bomb hits you. */
  private down = 0;

  constructor(private sfx: Sfx) {
    this.newWave();
    this.bunkers = [0, 1, 2, 3].map((i) => ({
      x: Math.round(W / 8 + (i * W) / 4 - 11),
      y: 190,
      cells: BUNKER.map((row) => [...row].map((c) => c === '#')),
    }));
  }

  private newWave() {
    this.alive = Array<boolean>(COLS * ROWS).fill(true);
    this.gx = (W - (COLS - 1) * DX - ALIEN) / 2;
    this.gy = 34 + Math.min(this.wave - 1, 4) * 8;
    this.dir = 1;
    this.bombs = [];
  }

  private alienAt(i: number) {
    return { x: this.gx + (i % COLS) * DX, y: this.gy + Math.floor(i / COLS) * DY };
  }

  press(code: string) {
    if (code === 'Space' && !this.bullet && this.down <= 0) {
      this.bullet = { x: this.shipX + SHIP_W / 2 - 0.5, y: SHIP_Y - 4 };
      this.sfx('shoot');
    }
  }

  update(dt: number, keys: Keys) {
    for (const b of this.booms) b.t -= dt;
    this.booms = this.booms.filter((b) => b.t > 0);
    if (this.down > 0) {
      this.down -= dt;
      if (this.down <= 0 && this.lives <= 0) this.over = true;
      return;
    }
    const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    this.shipX = Math.min(W - 6 - SHIP_W, Math.max(6, this.shipX + move * 130 * dt));

    // The march: one step at a time, quicker the fewer there are.
    const left = this.alive.filter(Boolean).length;
    this.marchT -= dt;
    if (this.marchT <= 0) {
      this.marchT = 0.03 + (0.55 * left) / this.alive.length / (1 + (this.wave - 1) * 0.15);
      this.frame ^= 1;
      let minX = Infinity;
      let maxX = -Infinity;
      this.alive.forEach((a, i) => {
        if (!a) return;
        const { x } = this.alienAt(i);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + ALIEN);
      });
      if ((this.dir > 0 && maxX + 3 > W - 6) || (this.dir < 0 && minX - 3 < 6)) {
        this.gy += 8;
        this.dir = -this.dir;
      } else this.gx += 3 * this.dir;
      this.sfx('blip');
    }

    // Your shot.
    const b = this.bullet;
    if (b) {
      b.y -= 300 * dt;
      if (b.y < TOP) this.bullet = null;
      else if (this.hitBunker(b)) this.bullet = null;
      else {
        for (let i = 0; i < this.alive.length; i++) {
          if (!this.alive[i]) continue;
          const a = this.alienAt(i);
          if (b.x >= a.x && b.x <= a.x + ALIEN && b.y >= a.y && b.y <= a.y + ALIEN) {
            this.alive[i] = false;
            this.score += ROW_KIND[Math.floor(i / COLS)].points;
            this.booms.push({ x: a.x + ALIEN / 2, y: a.y + ALIEN / 2, t: 0.2 });
            this.bullet = null;
            this.sfx('hit');
            break;
          }
        }
        const s = this.saucer;
        if (this.bullet && s && b.y <= 30 && b.y >= 18 && b.x >= s.x && b.x <= s.x + 24) {
          const pts = [100, 150, 300][Math.floor(Math.random() * 3)];
          this.score += pts;
          this.booms.push({ x: s.x + 12, y: 24, t: 1, label: String(pts) });
          this.saucer = null;
          this.bullet = null;
          this.sfx('score');
        }
      }
    }

    // Their bombs, dropped from the bottom of a column.
    this.bombT -= dt;
    if (this.bombT <= 0 && this.bombs.length < 3) {
      this.bombT = Math.max(0.35, 1 - this.wave * 0.08) * (0.6 + Math.random() * 0.8);
      const cols = [...new Set(this.alive.flatMap((a, i) => (a ? [i % COLS] : [])))];
      const col = cols[Math.floor(Math.random() * cols.length)];
      for (let r = ROWS - 1; r >= 0; r--) {
        const i = r * COLS + col;
        if (!this.alive[i]) continue;
        const a = this.alienAt(i);
        this.bombs.push({ x: a.x + ALIEN / 2, y: a.y + ALIEN });
        break;
      }
    }
    for (const m of this.bombs) m.y += (95 + this.wave * 8) * dt;
    this.bombs = this.bombs.filter((m) => {
      if (m.y > H || this.hitBunker(m)) return false;
      if (m.y >= SHIP_Y && m.y <= SHIP_Y + 6 && m.x >= this.shipX && m.x <= this.shipX + SHIP_W) {
        this.lives--;
        this.down = 1.2;
        this.booms.push({ x: this.shipX + SHIP_W / 2, y: SHIP_Y + 3, t: 1 });
        this.sfx('die');
        return false;
      }
      return true;
    });
    if (this.down > 0) this.bombs = [];

    // Marching through the bunkers wears them away; reaching the ground ends it.
    this.alive.forEach((a, i) => {
      if (!a) return;
      const p = this.alienAt(i);
      if (p.y + ALIEN >= 186) for (let x = p.x; x < p.x + ALIEN; x += 2) for (let y = p.y; y < p.y + ALIEN; y += 2) this.hitBunker({ x, y }, false);
      if (p.y + ALIEN >= LAND) {
        this.lives = 0;
        this.down = 1;
        this.sfx('die');
      }
    });

    this.saucerT -= dt;
    if (!this.saucer && this.saucerT <= 0) {
      this.saucer = Math.random() < 0.5 ? { x: -24, dir: 1 } : { x: W, dir: -1 };
      this.saucerT = 18 + Math.random() * 12;
    }
    if (this.saucer) {
      this.saucer.x += this.saucer.dir * 55 * dt;
      if (this.saucer.x < -30 || this.saucer.x > W + 6) this.saucer = null;
    }

    if (!this.alive.some(Boolean)) {
      this.wave++;
      this.sfx('clear');
      this.newWave();
    }
  }

  /** Knocks a bit out of whichever bunker is at `p` (a little more round it if `spread`); true if one was. */
  private hitBunker(p: Shot, spread = true): boolean {
    for (const k of this.bunkers) {
      const c = Math.floor((p.x - k.x) / BUNKER_CELL);
      const r = Math.floor((p.y - k.y) / BUNKER_CELL);
      if (r < 0 || r >= k.cells.length || c < 0 || c >= k.cells[0].length || !k.cells[r][c]) continue;
      k.cells[r][c] = false;
      if (spread)
        for (const [dr, dc] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ])
          if (k.cells[r + dr]?.[c + dc] !== undefined && Math.random() < 0.6) k.cells[r + dr][c + dc] = false;
      return true;
    }
    return false;
  }

  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#05050f';
    g.fillRect(0, 0, W, H);
    this.alive.forEach((a, i) => {
      if (!a) return;
      const p = this.alienAt(i);
      const kind = ROW_KIND[Math.floor(i / COLS)];
      sprite(g, kind.frames[this.frame], p.x, p.y, kind.color, SCALE);
    });
    if (this.saucer) sprite(g, SAUCER, Math.round(this.saucer.x), 18, '#ef476f', 2);
    for (const k of this.bunkers)
      k.cells.forEach((row, r) =>
        row.forEach((on, c) => {
          if (!on) return;
          g.fillStyle = '#06d6a0';
          g.fillRect(k.x + c * BUNKER_CELL, k.y + r * BUNKER_CELL, BUNKER_CELL, BUNKER_CELL);
        }),
      );
    if (this.down <= 0 || Math.floor(this.down * 10) % 2) sprite(g, SHIP, Math.round(this.shipX), SHIP_Y, this.down > 0 ? '#ef476f' : '#7cff6b');
    g.fillStyle = '#fff';
    if (this.bullet) g.fillRect(Math.round(this.bullet.x), Math.round(this.bullet.y), 1, 5);
    g.fillStyle = '#ffd166';
    for (const m of this.bombs) {
      g.fillRect(Math.round(m.x), Math.round(m.y), 2, 6);
    }
    for (const b of this.booms) {
      if (b.label) text(g, b.label, b.x, b.y - 2, '#ef476f', 1, 'center');
      else sprite(g, ['#..#..#', '.#.#.#.', '..###..', '##.#.##', '..###..', '.#.#.#.', '#..#..#'], b.x - 7, b.y - 7, '#fff', 2);
    }
    g.fillStyle = '#7cff6b';
    g.fillRect(0, LAND + 26, W, 1);
    for (let i = 0; i < this.lives; i++) sprite(g, SHIP, 8 + i * 18, H - 7, '#7cff6b', 0.75);
    text(g, `WAVE ${this.wave}`, W - 8, H - 6, '#8892b0', 1, 'right');
  }
}
