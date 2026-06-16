import type { Geometry } from "./geometry";

/** How a vehicle entering a segment is regulated. */
export type Control = "none" | "yield" | "signal";

/**
 * A traversable segment — either a lane on a link, or a connection through a
 * junction. Vehicles live on (segment, s). The segment graph (successors)
 * carries them across junctions; loop segments wrap (the ring). This single
 * abstraction covers both the closed ring and open junction networks.
 */
export interface Segment {
  id: number;
  kind: "lane" | "conn";
  geom: Geometry;
  length: number;

  /** Lane index within the parent link and the link's total lane count. */
  laneIndex: number;
  laneCount: number;
  laneWidth: number;

  /** Ring loop: wrap s past the end and treat the leader as wrapping. */
  loop: boolean;
  /** Downstream segments and their turn-ratio weights (parallel arrays). */
  successors: number[];
  succWeights: number[];

  /** Adjacent lane segments for MOBIL (same link), or -1. */
  leftSeg: number;
  rightSeg: number;

  /**
   * Gate on entry. "yield" => must accept a gap on `conflicts` first.
   * "signal" => may proceed only while this segment's `signalGroup` is green.
   */
  control: Control;
  /** Approach/connection segments this one must yield to (gap acceptance). */
  conflicts: number[];
  /** Signal group this connection belongs to (-1 if not signal-controlled). */
  signalGroup: number;

  /** Vehicles leaving a sink segment are removed from the simulation. */
  isSink: boolean;
}

/** Which config field drives a source's live inflow rate. */
export type RateKey = "major" | "minor" | "arm";

export interface SourceSpec {
  /** Segment vehicles are injected onto (at s = 0). */
  seg: number;
  /** Inflow rate, vehicles per hour (fallback if no live key). */
  rate: number;
  /** Live rate role — lets the UI sliders change inflow without a rebuild. */
  key?: RateKey;
}

/** One stage of a signal cycle: a green group (-1 = all-red) held for a time. */
export interface SignalPhase {
  group: number;
  duration: number;
}

/**
 * Cycles a fixed-time traffic signal. A signal-controlled connection is green
 * iff its `signalGroup` equals the controller's current group. All-red
 * clearance phases (group -1) separate conflicting movements. Time-driven, so
 * runs are deterministic.
 */
export class SignalController {
  private idx = 0;
  private timer = 0;

  constructor(readonly phases: SignalPhase[]) {}

  update(dt: number): void {
    this.timer += dt;
    while (this.timer >= this.phases[this.idx].duration) {
      this.timer -= this.phases[this.idx].duration;
      this.idx = (this.idx + 1) % this.phases.length;
    }
  }

  get group(): number {
    return this.phases[this.idx].group;
  }
}

export interface Network {
  segments: Segment[];
  sources: SourceSpec[];
  /** Closed (ring, fixed population) vs open (sources/sinks). */
  closed: boolean;
  /** Fixed-time signal controller, if this network is signalised. */
  signal?: SignalController;
  /** World-space bounds for the renderer to fit the view. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Builds a network: hands out segment ids, wires links, computes bounds. */
export class NetworkBuilder {
  private segs: Segment[] = [];
  private sources: SourceSpec[] = [];

  add(s: Omit<Segment, "id">): number {
    const id = this.segs.length;
    this.segs.push({ ...s, id });
    return id;
  }

  source(seg: number, rate: number, key?: RateKey): void {
    this.sources.push({ seg, rate, key });
  }

  seg(id: number): Segment {
    return this.segs[id];
  }

  /** Wire a one-way edge from one segment to another with a turn weight. */
  link(from: number, to: number, weight = 1): void {
    this.segs[from].successors.push(to);
    this.segs[from].succWeights.push(weight);
  }

  finish(closed: boolean, signal?: SignalController): Network {
    // Bounds from sampling each segment's geometry.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const half = (s: Segment) => ((s.laneCount - 1) / 2) * s.laneWidth + s.laneWidth;
    for (const s of this.segs) {
      for (let k = 0; k <= 16; k++) {
        const p = s.geom.poseAt((s.length * k) / 16);
        const m = half(s);
        minX = Math.min(minX, p.x - m);
        minY = Math.min(minY, p.y - m);
        maxX = Math.max(maxX, p.x + m);
        maxY = Math.max(maxY, p.y + m);
      }
    }
    return { segments: this.segs, sources: this.sources, closed, signal, bounds: { minX, minY, maxX, maxY } };
  }
}

/** Common segment defaults; override the fields a scenario cares about. */
export function laneDefaults(): Omit<Segment, "id" | "geom" | "length"> {
  return {
    kind: "lane",
    laneIndex: 0,
    laneCount: 1,
    laneWidth: 9,
    loop: false,
    successors: [],
    succWeights: [],
    leftSeg: -1,
    rightSeg: -1,
    control: "none",
    conflicts: [],
    signalGroup: -1,
    isSink: false,
  };
}
