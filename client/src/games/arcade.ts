import * as THREE from 'three';
import { Blocks } from './blocks';
import { Breakout } from './breakout';
import { Invaders } from './invaders';
import { H, Keys, TOP, W, isAction, text, type Game, type GameInfo, type Sfx, type Sound } from './kit';
import { Pong } from './pong';
import { Snake } from './snake';

// The CEO's retro computer: a menu of classic games, played up close in a window, and shown on the
// CRT on the desk for anyone walking past. High scores are kept in this browser.

export const GAMES: GameInfo[] = [
  { id: 'blocks', name: 'Tetris', blurb: 'Stack the falling blocks. Fill a row to clear it.', color: '#4cc9f0', make: (s) => new Blocks(s) },
  { id: 'snake', name: 'Snake', blurb: 'Eat the apples and grow. Mind the walls and your tail.', color: '#7cff6b', make: (s) => new Snake(s) },
  { id: 'invaders', name: 'Invaders', blurb: 'Shoot them down before they land.', color: '#ff6ad5', make: (s) => new Invaders(s) },
  { id: 'breakout', name: 'Breakout', blurb: 'Bounce the ball. Smash every brick.', color: '#ff8a5b', make: (s) => new Breakout(s) },
  { id: 'pong', name: 'Pong', blurb: 'Beat the computer. First to 7.', color: '#ffd166', make: (s) => new Pong(s) },
];

const HI_KEY = 'pixel-office.hiscores';
const TONES: Record<Sound, [number, number, number, OscillatorType]> = {
  // start Hz, end Hz, seconds, wave
  blip: [520, 520, 0.03, 'square'],
  hit: [300, 220, 0.06, 'square'],
  score: [880, 1320, 0.1, 'square'],
  shoot: [1200, 300, 0.1, 'square'],
  clear: [520, 1560, 0.3, 'square'],
  die: [300, 50, 0.5, 'sawtooth'],
};

export class RetroArcade {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private keys = new Keys();
  private pick = 0;
  private game: Game | null = null;
  private info: GameInfo | null = null;
  private paused = false;
  private ended = false;
  private newHi = false;
  private open = false;
  private t = 0;
  private sinceDraw = Infinity;
  private hi: Record<string, number>;
  private muted = false;
  private audio: AudioContext | null = null;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    try {
      this.hi = JSON.parse(localStorage.getItem(HI_KEY) ?? '{}') ?? {};
    } catch {
      this.hi = {};
    }
  }

  show() {
    this.open = true;
  }

  /** Put away: a game in progress waits, paused. */
  hide() {
    this.open = false;
    this.keys.held.clear();
    if (this.game && !this.ended) this.paused = true;
  }

  keydown(code: string, repeat: boolean) {
    if (code === 'KeyM') {
      this.muted = !this.muted;
      return;
    }
    if (!this.game) {
      if (code === 'ArrowUp' || code === 'KeyW') this.move(-1);
      else if (code === 'ArrowDown' || code === 'KeyS') this.move(1);
      else if (isAction(code) && !repeat) this.start(GAMES[this.pick]);
      return;
    }
    if (repeat) return;
    if (this.ended) {
      if (isAction(code)) this.start(this.info!);
      return;
    }
    if (this.paused) {
      if (isAction(code) || code === 'KeyP') this.paused = false;
      return;
    }
    if (code === 'KeyP') {
      this.paused = true;
      return;
    }
    this.keys.held.add(code);
    this.game.press(code);
  }

  keyup(code: string) {
    this.keys.held.delete(code);
  }

  /** Esc: out of a game back to the menu (true), or nothing left to back out of (false). */
  back(): boolean {
    if (!this.game) return false;
    this.record();
    this.game = null;
    this.info = null;
    this.keys.held.clear();
    return true;
  }

  update(dt: number) {
    this.t += dt;
    const g = this.game;
    if (this.open && g && !this.paused && !this.ended) {
      g.update(dt, this.keys);
      if (g.over) {
        this.ended = true;
        this.record();
        this.sound('die');
      }
    }
    // Up close it's drawn every frame; from across the room a few times a second does.
    this.sinceDraw += dt;
    if (!this.open && this.sinceDraw < 0.25) return;
    this.sinceDraw = 0;
    this.draw();
    this.texture.needsUpdate = true;
  }

  private move(d: number) {
    this.pick = (this.pick + d + GAMES.length) % GAMES.length;
    this.sound('blip');
  }

  private start(info: GameInfo) {
    this.info = info;
    this.game = info.make(this.sfx);
    this.paused = false;
    this.ended = false;
    this.newHi = false;
    this.keys.held.clear();
    this.sound('score');
  }

  private record() {
    const { game, info } = this;
    if (!game || !info || game.score <= (this.hi[info.id] ?? 0)) return;
    this.hi[info.id] = game.score;
    this.newHi = true;
    localStorage.setItem(HI_KEY, JSON.stringify(this.hi));
  }

  private sfx: Sfx = (s) => this.sound(s);

  private sound(s: Sound) {
    if (this.muted || !this.open) return;
    try {
      this.audio ??= new AudioContext();
      const a = this.audio;
      const [from, to, len, wave] = TONES[s];
      const o = a.createOscillator();
      const v = a.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(from, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(to, a.currentTime + len);
      v.gain.setValueAtTime(0.06, a.currentTime);
      v.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + len);
      o.connect(v).connect(a.destination);
      o.start();
      o.stop(a.currentTime + len);
    } catch {
      // No sound here: play on in silence.
    }
  }

  private draw() {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    if (!this.game || !this.info) {
      this.drawMenu();
      return;
    }
    this.game.draw(g);
    // The status bar.
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, TOP - 2);
    text(g, this.info.name, 4, 3, this.info.color);
    text(g, `SCORE ${this.game.score}`, W / 2, 3, '#fff', 1, 'center');
    text(g, `HI ${Math.max(this.hi[this.info.id] ?? 0, this.game.score)}`, W - 4, 3, '#ffd166', 1, 'right');
    if (this.ended) {
      this.panel(78);
      text(g, 'GAME OVER', W / 2, 88, '#ef476f', 3, 'center');
      text(g, `SCORE ${this.game.score}`, W / 2, 112, '#fff', 2, 'center');
      if (this.newHi && Math.floor(this.t * 3) % 2) text(g, 'NEW HIGH SCORE!', W / 2, 128, '#ffd166', 1, 'center');
      text(g, 'ENTER AGAIN   ESC MENU', W / 2, 140, '#8892b0', 1, 'center');
    } else if (this.paused) {
      this.panel(90);
      text(g, 'PAUSED', W / 2, 100, '#ffd166', 3, 'center');
      text(g, 'ENTER TO PLAY ON', W / 2, 126, '#8892b0', 1, 'center');
    }
  }

  private panel(y: number) {
    const g = this.g;
    g.fillStyle = '#000000cc';
    g.fillRect(40, y, W - 80, 76);
    g.strokeStyle = '#ffd166';
    g.lineWidth = 2;
    g.strokeRect(41, y + 1, W - 82, 74);
  }

  private drawMenu() {
    const g = this.g;
    g.fillStyle = '#0a0a18';
    g.fillRect(0, 0, W, H);
    // A starfield drifting past.
    g.fillStyle = '#ffffff55';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + this.t * (10 + (i % 3) * 12)) % W;
      g.fillRect(Math.floor(W - x), (i * 53) % H, 1, 1);
    }
    text(g, 'SANDCASTLE', W / 2, 14, '#ffd166', 3, 'center');
    text(g, 'ARCADE', W / 2, 34, '#ef476f', 4, 'center');
    GAMES.forEach((game, i) => {
      const y = 72 + i * 22;
      const on = i === this.pick;
      if (on) {
        g.fillStyle = '#ffffff14';
        g.fillRect(40, y - 4, W - 80, 18);
        if (Math.floor(this.t * 3) % 2) text(g, '>', 48, y, game.color, 2);
      }
      text(g, game.name, 64, y, on ? game.color : '#8892b0', 2);
      text(g, String(this.hi[game.id] ?? 0), W - 52, y + 2, on ? '#fff' : '#555b78', 1, 'right');
    });
    text(g, 'HI', W - 52, 62, '#555b78', 1, 'right');
    text(g, GAMES[this.pick].blurb, W / 2, 190, '#fff', 1, 'center');
    text(g, '^ PICK   ENTER PLAY   M SOUND   ESC LEAVE', W / 2, 220, '#8892b0', 1, 'center');
  }
}
