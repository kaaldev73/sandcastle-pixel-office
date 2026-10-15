import type { Agent } from './vendor/agent-office/character/agent';

// Where the agents go when they've nothing to do: off their stools and round the office (the lounge
// sofas, the window, a chat in the hallway or at a colleague's door) until work comes in, and then back
// to their desks.

export interface Point {
  x: number;
  z: number;
}

/** Somewhere to go: reached from the hallway at `hallX`, then along `path`, to stand (or sit) facing `face`. */
export interface Spot {
  /** Said in conversation: "I'm taking a break on the sofa". */
  doing: string;
  hallX: number;
  /** From the hallway in, the last point being the spot itself. */
  path: Point[];
  /** Heading to face once there (rotation.y: 0 faces +z). */
  face: number;
  /** Sitting at this height (on a sofa or the stool), or standing on the floor. */
  sitY?: number;
}

const SPEED = 1.25;
/** A leg of a walk: out of where it was to the hallway, along the hallway, then in to where it's going. */
type Leg = 'out' | 'hall' | 'in';
const TURN = 8;

export class Wanderer {
  /** Where it is or is heading for. */
  private at: Spot;
  private route: { p: Point; leg: Leg }[] = [];
  /** The points of the way in it's got past, to back out by if it changes its mind. */
  private walkedIn: Point[] = [];
  private stay: number;
  /** Who it's talking to, if anyone: it stops and faces them. */
  talkingTo: Point | null = null;

  constructor(
    readonly agent: Agent,
    /** Its stool at its desk. */
    readonly desk: Spot,
    private spots: Spot[],
    /** The spots someone's at or heading for, shared by all the wanderers. */
    private taken: Set<Spot>,
    /** How far off the hallway's middle it walks, so they don't walk through each other. */
    private lane: number,
  ) {
    this.at = desk;
    this.stay = 4 + Math.random() * 6;
    const p = desk.path.at(-1)!;
    agent.root.position.set(p.x, desk.sitY ?? 0, p.z);
    agent.root.rotation.y = desk.face;
  }

  get atDesk(): boolean {
    return this.at === this.desk && !this.route.length;
  }

  /** What it's up to, for conversation. */
  get doing(): string {
    if (this.route.length) return this.at === this.desk ? 'heading back to my desk' : `on my way to ${this.at.doing}`;
    return this.at.doing;
  }

  update(dt: number) {
    const a = this.agent;
    const root = a.root;
    const busy = a.status === 'working' || a.status === 'error';
    if (this.talkingTo) {
      a.walking = false;
      this.turnTo(Math.atan2(this.talkingTo.x - root.position.x, this.talkingTo.z - root.position.z), dt);
      return;
    }
    if (busy && this.at !== this.desk) this.go(this.desk);
    else if (!busy && !this.route.length) {
      this.stay -= dt;
      if (this.stay <= 0) this.go(this.pick());
    }

    const p = this.route[0]?.p;
    a.walking = !!p;
    if (!p) {
      root.position.y = this.at.sitY ?? 0;
      this.turnTo(this.at.face, dt);
      return;
    }
    root.position.y = 0;
    const dx = p.x - root.position.x;
    const dz = p.z - root.position.z;
    const d = Math.hypot(dx, dz);
    const step = SPEED * dt;
    if (d <= step) {
      root.position.x = p.x;
      root.position.z = p.z;
      if (this.route.shift()!.leg === 'in') this.walkedIn.push(p);
      if (!this.route.length) this.stay = this.at === this.desk ? 6 + Math.random() * 10 : 10 + Math.random() * 14;
    } else {
      root.position.x += (dx / d) * step;
      root.position.z += (dz / d) * step;
      this.turnTo(Math.atan2(dx, dz), dt);
    }
  }

  /** Somewhere free to go next, not where it is. */
  private pick(): Spot {
    const free = this.spots.filter((s) => s !== this.at && !this.taken.has(s));
    // Now and then back to its desk for a bit.
    if (!free.length || (this.at !== this.desk && Math.random() < 0.15)) return this.desk;
    return free[Math.floor(Math.random() * free.length)];
  }

  /** Sets off for `to`, from where it is or, part way somewhere else, turning round. */
  private go(to: Spot) {
    if (to === this.at) return;
    const lane = (x: number) => ({ x, z: this.lane });
    let out: Point[];
    if (!this.route.length) out = [...[...this.at.path].reverse().slice(1), lane(this.at.hallX)];
    else if (this.route[0].leg === 'in') out = [...[...this.walkedIn].reverse(), lane(this.at.hallX)];
    else out = this.route.filter((r) => r.leg === 'out').map((r) => r.p);
    this.taken.delete(this.at);
    if (to !== this.desk) this.taken.add(to);
    this.route = [
      ...out.map((p) => ({ p, leg: 'out' as const })),
      { p: lane(to.hallX), leg: 'hall' },
      ...to.path.map((p) => ({ p, leg: 'in' as const })),
    ];
    this.walkedIn = [];
    this.at = to;
  }

  private turnTo(want: number, dt: number) {
    const r = this.agent.root.rotation;
    const diff = Math.atan2(Math.sin(want - r.y), Math.cos(want - r.y));
    r.y += diff * Math.min(1, dt * TURN);
  }
}
