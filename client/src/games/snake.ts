import { TOP, W, dirOf, type Game, type Sfx } from './kit';

// Snake: eat the apples, grow longer, and don't run into the walls or yourself.

const CELL = 10;
const COLS = 30;
const ROWS = 21;
const X0 = (W - COLS * CELL) / 2;
const Y0 = TOP + 6;

interface P {
  x: number;
  y: number;
}

export class Snake implements Game {
  score = 0;
  over = false;
  private body: P[];
  private dir: P = { x: 1, y: 0 };
  /** Turns pressed but not taken yet, so two quick ones both happen. */
  private turns: P[] = [];
  private food: P;
  private step = 0.12;
  private acc = 0;
  private grow = 0;
  private t = 0;

  constructor(private sfx: Sfx) {
    const y = ROWS >> 1;
    this.body = [9, 8, 7, 6].map((x) => ({ x, y }));
    this.food = this.place();
  }

  private place(): P {
    for (;;) {
      const p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (!this.body.some((b) => b.x === p.x && b.y === p.y)) return p;
    }
  }

  press(code: string) {
    const d = dirOf(code);
    if (!d) return;
    const last = this.turns.at(-1) ?? this.dir;
    if ((d.x === -last.x && d.y === -last.y) || (d.x === last.x && d.y === last.y)) return;
    if (this.turns.length < 2) this.turns.push(d);
  }

  update(dt: number) {
    this.t += dt;
    this.acc += dt;
    while (this.acc >= this.step && !this.over) {
      this.acc -= this.step;
      this.tick();
    }
  }

  private tick() {
    if (this.turns.length) this.dir = this.turns.shift()!;
    const h = this.body[0];
    const n = { x: h.x + this.dir.x, y: h.y + this.dir.y };
    // The tail moves out of the way, unless you're growing.
    const tail = this.grow > 0 ? this.body.length : this.body.length - 1;
    if (n.x < 0 || n.x >= COLS || n.y < 0 || n.y >= ROWS || this.body.some((b, i) => i < tail && b.x === n.x && b.y === n.y)) {
      this.over = true;
      return;
    }
    this.body.unshift(n);
    if (n.x === this.food.x && n.y === this.food.y) {
      this.score += 10;
      this.grow += 2;
      this.step = Math.max(0.055, this.step * 0.96);
      this.food = this.place();
      this.sfx('score');
    }
    if (this.grow > 0) this.grow--;
    else this.body.pop();
  }

  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#08140a';
    g.fillRect(0, 0, W, 240);
    g.strokeStyle = '#2f6b3a';
    g.lineWidth = 2;
    g.strokeRect(X0 - 2, Y0 - 2, COLS * CELL + 4, ROWS * CELL + 4);
    g.fillStyle = '#12261a';
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) g.fillRect(X0 + x * CELL + 4, Y0 + y * CELL + 4, 2, 2);
    g.fillStyle = Math.floor(this.t * 4) % 2 ? '#ff5d5d' : '#ff9a9a';
    g.fillRect(X0 + this.food.x * CELL + 1, Y0 + this.food.y * CELL + 1, CELL - 2, CELL - 2);
    this.body.forEach((b, i) => {
      g.fillStyle = i === 0 ? '#c6ff7a' : i % 2 ? '#5ec84a' : '#4fb03e';
      g.fillRect(X0 + b.x * CELL, Y0 + b.y * CELL, CELL - 1, CELL - 1);
    });
    const h = this.body[0];
    g.fillStyle = '#08140a';
    g.fillRect(X0 + h.x * CELL + 3 + this.dir.x * 2, Y0 + h.y * CELL + 3 + this.dir.y * 2, 3, 3);
  }
}
