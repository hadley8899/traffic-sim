import { ArcGeometry, StraightGeometry } from "./geometry";
import {
  laneDefaults,
  NetworkBuilder,
  SignalController,
  type Network,
} from "./network";

export type Scenario = "merge" | "signal" | "roundabout" | "ring";

/** Metadata for the scenario-picker UI. */
export const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "merge", label: "Priority merge" },
  { id: "signal", label: "Signalised cross" },
  { id: "roundabout", label: "Roundabout" },
  { id: "ring", label: "Ring" },
];

const LW = 9; // lane width, m
const ARM = 320; // approach/departure arm length, m

// ----------------------------------------------------------------------------
// Ring — the M1/M2 closed loop, expressed as a network.
// ----------------------------------------------------------------------------

export interface RingConfig {
  roadLength: number;
  lanes: number;
}

export function buildRing(cfg: RingConfig): Network {
  const b = new NetworkBuilder();
  const r = cfg.roadLength / (2 * Math.PI);
  const ids: number[] = [];
  for (let l = 0; l < cfg.lanes; l++) {
    const geom = new ArcGeometry(0, 0, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);
    ids.push(
      b.add({
        ...laneDefaults(),
        geom,
        length: cfg.roadLength,
        laneIndex: l,
        laneCount: cfg.lanes,
        laneWidth: LW,
        loop: true,
      }),
    );
  }
  for (let l = 0; l < cfg.lanes; l++) {
    b.seg(ids[l]).leftSeg = l > 0 ? ids[l - 1] : -1;
    b.seg(ids[l]).rightSeg = l < cfg.lanes - 1 ? ids[l + 1] : -1;
  }
  return b.finish(true);
}

// ----------------------------------------------------------------------------
// Priority merge (T-junction) — minor road yields to the major flow.
// ----------------------------------------------------------------------------

export interface MergeConfig {
  majorRate: number;
  minorRate: number;
}

export function buildMerge(cfg: MergeConfig): Network {
  const b = new NetworkBuilder();
  const a2 = b.add({ ...laneDefaults(), geom: new StraightGeometry(20, 0, 340, 0), length: 320, isSink: true });
  const a1 = b.add({ ...laneDefaults(), geom: new StraightGeometry(-340, 0, -20, 0), length: 320 });
  const m = b.add({ ...laneDefaults(), geom: new StraightGeometry(0, 260, 0, 36), length: 224 });
  const through = b.add({ ...laneDefaults(), kind: "conn", geom: new StraightGeometry(-20, 0, 20, 0), length: 40 });
  const merge = b.add({
    ...laneDefaults(),
    kind: "conn",
    geom: new StraightGeometry(0, 36, 20, 0),
    length: Math.hypot(20, 36),
    control: "yield",
    conflicts: [a1, through],
  });

  b.link(a1, through);
  b.link(through, a2);
  b.link(m, merge);
  b.link(merge, a2);

  b.source(a1, cfg.majorRate, "major");
  b.source(m, cfg.minorRate, "minor");
  return b.finish(false);
}

// ----------------------------------------------------------------------------
// Signalised cross — 4-way crossroads, fixed-time signal, straight-through only.
// ----------------------------------------------------------------------------

export interface SignalCrossConfig {
  armRate: number;
  greenTime: number;
}

export function buildSignalCross(cfg: SignalCrossConfig): Network {
  const b = new NetworkBuilder();
  const J = 26; // junction half-size
  const O = LW / 2; // offset of opposing one-way flows

  /** One straight-through arm: approach -> signalled connection -> departure. */
  const arm = (
    ax: number, ay: number, bx: number, by: number, // approach
    cx: number, cy: number, dx: number, dy: number, // through conn
    ex: number, ey: number, fx: number, fy: number, // departure (sink)
    group: number,
  ) => {
    const approach = b.add({ ...laneDefaults(), geom: new StraightGeometry(ax, ay, bx, by), length: Math.hypot(bx - ax, by - ay) });
    const conn = b.add({
      ...laneDefaults(),
      kind: "conn",
      geom: new StraightGeometry(cx, cy, dx, dy),
      length: Math.hypot(dx - cx, dy - cy),
      control: "signal",
      signalGroup: group,
    });
    const exit = b.add({ ...laneDefaults(), geom: new StraightGeometry(ex, ey, fx, fy), length: Math.hypot(fx - ex, fy - ey), isSink: true });
    b.link(approach, conn);
    b.link(conn, exit);
    b.source(approach, cfg.armRate, "arm");
  };

  // Group 0 = east-west, group 1 = north-south.
  arm(-(J + ARM), O, -J, O, -J, O, J, O, J, O, J + ARM, O, 0); // eastbound
  arm(J + ARM, -O, J, -O, J, -O, -J, -O, -J, -O, -(J + ARM), -O, 0); // westbound
  arm(O, -(J + ARM), O, -J, O, -J, O, J, O, J, O, J + ARM, 1); // southbound
  arm(-O, J + ARM, -O, J, -O, J, -O, -J, -O, -J, -O, -(J + ARM), 1); // northbound

  const signal = new SignalController([
    { group: 0, duration: cfg.greenTime },
    { group: -1, duration: 2 },
    { group: 1, duration: cfg.greenTime },
    { group: -1, duration: 2 },
  ]);
  return b.finish(false, signal);
}

// ----------------------------------------------------------------------------
// Roundabout — one-way circulatory ring; entries yield to circulating traffic.
// ----------------------------------------------------------------------------

export interface RoundaboutConfig {
  armRate: number;
}

export function buildRoundabout(cfg: RoundaboutConfig): Network {
  const b = new NetworkBuilder();
  const R = 95; // circulatory radius
  const legLen = 150;
  const O = LW / 2;
  const ang = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  // Circulatory quadrants (one-way, increasing angle).
  const Q = ang.map((a) =>
    b.add({ ...laneDefaults(), geom: new ArcGeometry(0, 0, R, a, a + Math.PI / 2), length: (R * Math.PI) / 2 }),
  );

  for (let i = 0; i < 4; i++) {
    const a = ang[i];
    const nx = Math.cos(a) * R;
    const ny = Math.sin(a) * R;
    const rx = Math.cos(a); // radial (outward)
    const ry = Math.sin(a);
    const tx = -Math.sin(a); // tangential (separates entry/exit legs)
    const ty = Math.cos(a);
    const prev = Q[(i + 3) % 4]; // circulating traffic arriving at this node

    // Entry leg (offset +O) and exit leg (offset -O).
    const entryStart = { x: nx + rx * (legLen + 18) + tx * O, y: ny + ry * (legLen + 18) + ty * O };
    const entryMouth = { x: nx + rx * 18 + tx * O, y: ny + ry * 18 + ty * O };
    const exitMouth = { x: nx + rx * 18 - tx * O, y: ny + ry * 18 - ty * O };
    const exitEnd = { x: nx + rx * (legLen + 18) - tx * O, y: ny + ry * (legLen + 18) - ty * O };

    const approach = b.add({ ...laneDefaults(), geom: new StraightGeometry(entryStart.x, entryStart.y, entryMouth.x, entryMouth.y), length: legLen });
    const exitLeg = b.add({ ...laneDefaults(), geom: new StraightGeometry(exitMouth.x, exitMouth.y, exitEnd.x, exitEnd.y), length: legLen, isSink: true });
    const entryConn = b.add({
      ...laneDefaults(),
      kind: "conn",
      geom: new StraightGeometry(entryMouth.x, entryMouth.y, nx, ny),
      length: Math.hypot(nx - entryMouth.x, ny - entryMouth.y),
      control: "yield",
      conflicts: [prev],
    });
    const exitConn = b.add({
      ...laneDefaults(),
      kind: "conn",
      geom: new StraightGeometry(nx, ny, exitMouth.x, exitMouth.y),
      length: Math.hypot(exitMouth.x - nx, exitMouth.y - ny),
    });

    b.link(approach, entryConn);
    b.link(entryConn, Q[i]);
    b.link(prev, Q[i], 0.62); // continue around
    b.link(prev, exitConn, 0.38); // leave here
    b.link(exitConn, exitLeg);
    b.source(approach, cfg.armRate, "arm");
  }

  return b.finish(false);
}
