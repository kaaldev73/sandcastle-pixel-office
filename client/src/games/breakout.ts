import { H, TOP, W, isAction, text, type Game, type Keys, type Sfx } from './kit';

// Breakout: bounce the ball off your paddle and knock out every brick. Three balls.

const LEFT = 6;
const RIGHT = W - 6;
const CEIL = TOP + 4;
const COLS = 14;
const ROWS = 6;
const BW = 21;
const BH = 7;
const BX = (W - COLS * (BW + 1)) / 2;
const BY = 40;
const ROW_COLORS = ['#ef476f', '#ff8a5b', '#ffd166', '#06d6a0', '#4cc9f0', '#4f86f7'];
const ROW_POINTS = [7, 7, 4, 4, 1, 1];
const PY = 226;
const PW = 44;
const BALL = 4;

export class Breakout implements Game {
  score = 0;
  over = false;
  private lives = 3;
  private level = 1;
  private bricks: boolean[] = [];
  private px = W / 2 - PW / 2;
  private ball = { x: 0, y: 0, vx: 0, vy: 0 };
  private speed = 150;
  /** On the paddle, waiting for Space. */
  private stuck = true;

  constructor(private sfx: Sfx) {
    this.build();
  }

  private build() {
    this.bricks = Array<boolean>(COLS * ROWS).fill(true);
    this.speed = 140 + this.level * 15;
    this.stuck = true;
  }

  press(code: string) {
    if (!isAction(code) || !this.stuck) return;
    this.stuck = false;
    const a = (Math.random() - 0.5) * 0.9;
    this.ball.vx = Math.sin(a) * this.speed;
    this.ball.vy = -Math.cos(a) * this.speed;
  }

  update(dt: number, keys: Keys) {
    const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    this.px = Math.min(RIGHT - PW, Math.max(LEFT, this.px + move * 240 * dt));
    const b = this.ball;
    if (this.stuck) {
      b.x = this.px + PW / 2 - BALL / 2;
      b.y = PY - BALL - 1;
      return;
    }
    const n = Math.ceil((this.speed * dt) / 3);
    for (let i = 0; i < n && !this.stuck; i++) this.step(dt / n);
  }

  private step(h: number) {
    const b = this.ball;
    const ox = b.x;
    const oy = b.y;
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.x < LEFT) (b.x = LEFT), (b.vx = Math.abs(b.vx));
    if (b.x + BALL > RIGHT) (b.x = RIGHT - BALL), (b.vx = -Math.abs(b.vx));
    if (b.y < CEIL) (b.y = CEIL), (b.vy = Math.abs(b.vy));
    if (b.vy > 0 && b.y + BALL >= PY && b.y + BALL <= PY + 6 && b.x + BALL >= this.px && b.x <= this.px + PW) {
      // Where it hits the paddle sends it off: straight up in the middle, out wide at the ends.
      const off = Math.max(-1, Math.min(1, (b.x + BALL / 2 - (this.px + PW / 2)) / (PW / 2)));
      b.vx = Math.sin(off * 1.05) * this.speed;
      b.vy = -Math.cos(off * 1.05) * this.speed;
      b.y = PY - BALL;
      this.sfx('hit');
    }
    if (b.y > H) {
      this.lives--;
      this.sfx('die');
      if (this.lives <= 0) this.over = true;
      else this.stuck = true;
      return;
    }
    for (let i = 0; i < this.bricks.length; i++) {
      if (!this.bricks[i]) continue;
      const x = BX + (i % COLS) * (BW + 1);
      const y = BY + Math.floor(i / COLS) * (BH + 2);
      if (b.x + BALL <= x || b.x >= x + BW || b.y + BALL <= y || b.y >= y + BH) continue;
      this.bricks[i] = false;
      this.score += ROW_POINTS[Math.floor(i / COLS)] * this.level;
      // Coming in from above or below, it bounces up or down; from the side, sideways.
      if (ox + BALL > x && ox < x + BW) b.vy = -b.vy;
      else b.vx = -b.vx;
      b.x = ox;
      b.y = oy;
      this.speed = Math.min(300, this.speed * 1.012);
      const k = this.speed / Math.hypot(b.vx, b.vy);
      b.vx *= k;
      b.vy *= k;
      this.sfx('blip');
      if (this.bricks.every((v) => !v)) {
        this.level++;
        this.sfx('clear');
        this.build();
      }
      break;
    }
  }

  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#0b0b1e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a3a6a';
    g.fillRect(0, CEIL - 3, W, 3);
    g.fillRect(0, CEIL, LEFT, H);
    g.fillRect(RIGHT, CEIL, W - RIGHT, H);
    this.bricks.forEach((alive, i) => {
      if (!alive) return;
      const r = Math.floor(i / COLS);
      const x = BX + (i % COLS) * (BW + 1);
      const y = BY + r * (BH + 2);
      g.fillStyle = ROW_COLORS[r];
      g.fillRect(x, y, BW, BH);
      g.fillStyle = '#ffffff44';
      g.fillRect(x, y, BW, 2);
    });
    g.fillStyle = '#e0e6ff';
    g.fillRect(this.px, PY, PW, 5);
    g.fillStyle = '#4cc9f0';
    g.fillRect(this.px + 3, PY + 1, PW - 6, 3);
    g.fillStyle = '#fff';
    g.fillRect(Math.round(this.ball.x), Math.round(this.ball.y), BALL, BALL);
    for (let i = 0; i < this.lives; i++) g.fillRect(LEFT + 4 + i * 8, H - 6, 4, 4);
    text(g, `LEVEL ${this.level}`, RIGHT - 4, H - 6, '#8892b0', 1, 'right');
    if (this.stuck && !this.over) text(g, 'SPACE TO LAUNCH', W / 2, 150, '#ffd166', 2, 'center');
  }
}
