import { H, TOP, W, isAction, text, type Game, type Keys, type Sfx } from './kit';

// Pong against the computer: first to 7.

const PW = 4;
const PH = 32;
const ME_X = 10;
const CPU_X = W - 10 - PW;
const FLOOR = H - 2;
const CEIL = TOP + 2;
const BALL = 4;
const WIN = 7;

export class Pong implements Game {
  score = 0;
  over = false;
  private me = 0;
  private cpu = 0;
  private myY = (H - PH) / 2;
  private cpuY = (H - PH) / 2;
  private ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  private speed = 150;
  /** Waiting for Space to serve, towards `serveTo`. */
  private serving = true;
  private serveTo = 1;

  constructor(private sfx: Sfx) {}

  press(code: string) {
    if (!isAction(code) || !this.serving) return;
    this.serving = false;
    this.speed = 150;
    const a = (Math.random() - 0.5) * 0.8;
    this.ball.vx = Math.cos(a) * this.speed * this.serveTo;
    this.ball.vy = Math.sin(a) * this.speed;
  }

  update(dt: number, keys: Keys) {
    const move = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    this.myY = Math.min(FLOOR - PH, Math.max(CEIL, this.myY + move * 210 * dt));
    const b = this.ball;
    // The computer follows the ball when it's coming its way, a bit slower than it could.
    const want = (b.vx > 0 && !this.serving ? b.y + BALL / 2 : H / 2) - PH / 2;
    const reach = (125 + this.me * 8) * dt;
    this.cpuY += Math.max(-reach, Math.min(reach, want - this.cpuY));
    this.cpuY = Math.min(FLOOR - PH, Math.max(CEIL, this.cpuY));
    if (this.serving) {
      b.x = W / 2 - BALL / 2;
      b.y = H / 2;
      return;
    }
    const n = Math.ceil((this.speed * dt) / 3);
    for (let i = 0; i < n && !this.serving; i++) this.step(dt / n);
  }

  private step(h: number) {
    const b = this.ball;
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.y < CEIL) (b.y = CEIL), (b.vy = Math.abs(b.vy));
    if (b.y + BALL > FLOOR) (b.y = FLOOR - BALL), (b.vy = -Math.abs(b.vy));
    const bounce = (py: number, dir: number) => {
      this.speed = Math.min(330, this.speed * 1.06);
      const off = (b.y + BALL / 2 - (py + PH / 2)) / (PH / 2);
      b.vx = dir * this.speed * Math.cos(off * 0.8);
      b.vy = this.speed * Math.sin(off * 0.8);
      this.sfx('hit');
    };
    if (b.vx < 0 && b.x <= ME_X + PW && b.x >= ME_X - BALL && b.y + BALL >= this.myY && b.y <= this.myY + PH) {
      b.x = ME_X + PW;
      bounce(this.myY, 1);
    }
    if (b.vx > 0 && b.x + BALL >= CPU_X && b.x <= CPU_X + PW && b.y + BALL >= this.cpuY && b.y <= this.cpuY + PH) {
      b.x = CPU_X - BALL;
      bounce(this.cpuY, -1);
    }
    if (b.x < -BALL || b.x > W) {
      const mine = b.x > W;
      if (mine) this.me++;
      else this.cpu++;
      this.score = this.me * 100 + (this.me >= WIN ? 1000 : 0);
      this.sfx(mine ? 'score' : 'die');
      this.serving = true;
      this.serveTo = mine ? 1 : -1;
      if (this.me >= WIN || this.cpu >= WIN) this.over = true;
    }
  }

  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#444';
    for (let y = CEIL + 2; y < FLOOR; y += 10) g.fillRect(W / 2 - 1, y, 2, 6);
    text(g, String(this.me), W / 2 - 24, CEIL + 8, '#fff', 4, 'right');
    text(g, String(this.cpu), W / 2 + 24, CEIL + 8, '#fff', 4, 'left');
    g.fillStyle = '#fff';
    g.fillRect(ME_X, Math.round(this.myY), PW, PH);
    g.fillRect(CPU_X, Math.round(this.cpuY), PW, PH);
    g.fillRect(Math.round(this.ball.x), Math.round(this.ball.y), BALL, BALL);
    text(g, 'YOU', ME_X + 10, FLOOR - 9, '#666');
    text(g, 'CPU', CPU_X - 4, FLOOR - 9, '#666', 1, 'right');
    if (this.serving && !this.over) text(g, 'SPACE TO SERVE', W / 2, 150, '#ffd166', 2, 'center');
  }
}
