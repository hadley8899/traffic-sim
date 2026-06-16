import { describe, it, expect } from "vitest";
import { Simulation, DEFAULT_CONFIG } from "./Simulation";

const DT = 1 / 60;

function mergeSegs(sim: Simulation) {
  const segs = sim.net.segments;
  const mergeConn = segs.find((g) => g.kind === "conn" && g.control === "yield")!;
  const M = segs.find((g) => g.successors.includes(mergeConn.id))!;
  const A1 = segs.find(
    (g) =>
      g.kind === "lane" &&
      g.successors.some((id) => segs[id].kind === "conn" && segs[id].control === "none"),
  )!;
  return { mergeConn, M, A1 };
}

describe("ring scenario", () => {
  it("conserves a closed population and keeps traffic moving", () => {
    const sim = new Simulation({ ...DEFAULT_CONFIG, scenario: "ring", lanes: 2, vehicleCount: 40 });
    for (let t = 0; t < 1200; t++) sim.step(DT);
    expect(sim.store.count).toBe(40); // closed: no spawn, no removal
    expect(sim.metrics().meanSpeed).toBeGreaterThan(0);
    expect(sim.laneChanges).toBeGreaterThan(0); // MOBIL active on 2 lanes
  });
});

describe("metrics history", () => {
  it("samples a rolling time-series with aligned series", () => {
    const sim = new Simulation({ ...DEFAULT_CONFIG, scenario: "ring", lanes: 2, vehicleCount: 40 });
    for (let t = 0; t < 1200; t++) sim.step(DT); // 20s -> ~40 samples at 0.5s
    const h = sim.history;
    expect(h.t.length).toBeGreaterThan(30);
    expect(h.speed.length).toBe(h.t.length);
    expect(h.flow.length).toBe(h.t.length);
    expect(h.queue.length).toBe(h.t.length);
    expect(sim.metrics().queue).toBeGreaterThanOrEqual(0);
  });
});

function signalApproach(sim: Simulation, group: number) {
  const segs = sim.net.segments;
  const conn = segs.find((g) => g.control === "signal" && g.signalGroup === group)!;
  const approach = segs.find((g) => g.successors.includes(conn.id))!;
  return { conn, approach };
}

describe("signalised cross", () => {
  it("holds an approach whose phase is red and releases it when green", () => {
    // Cycle starts on group 0 (E–W) green, so group 1 (N–S) is red.
    const sim = new Simulation({ ...DEFAULT_CONFIG, scenario: "signal", armRate: 0, greenTime: 10 });
    const red = signalApproach(sim, 1);
    sim.store.clear();
    const car = sim.store.add(red.approach.id, red.approach.length - 2, 0, 5, 12, 0);
    sim.store.nextSeg[car] = red.conn.id;

    for (let t = 0; t < 240; t++) sim.step(DT); // 4s, still inside the first green
    expect(sim.net.signal!.group).toBe(0);
    expect(sim.store.seg[car]).toBe(red.approach.id); // held at the red light
    expect(sim.arrived).toBe(0);
  });

  it("lets a green-phase approach proceed through to the sink", () => {
    const sim = new Simulation({ ...DEFAULT_CONFIG, scenario: "signal", armRate: 0, greenTime: 10 });
    const grn = signalApproach(sim, 0); // green at t=0
    sim.store.clear();
    const car = sim.store.add(grn.approach.id, grn.approach.length - 2, 8, 5, 12, 0);
    sim.store.nextSeg[car] = grn.conn.id;

    for (let t = 0; t < 3000; t++) sim.step(DT);
    expect(sim.arrived).toBe(1);
  });
});

describe("live parameter updates", () => {
  it("applies inflow-rate changes without a rebuild", () => {
    const sim = new Simulation({ ...DEFAULT_CONFIG, scenario: "merge", majorRate: 1500, minorRate: 800 });
    for (let t = 0; t < 600; t++) sim.step(DT);
    expect(sim.store.count).toBeGreaterThan(0); // traffic present

    // Turn inflow off live (no reset) — existing cars drain, none replace them.
    sim.config.majorRate = 0;
    sim.config.minorRate = 0;
    for (let t = 0; t < 3000; t++) sim.step(DT);
    expect(sim.store.count).toBe(0);
  });

  it("applies the green-time slider to the live signal cycle", () => {
    const sim = new Simulation({ ...DEFAULT_CONFIG, scenario: "signal", greenTime: 10 });
    sim.config.greenTime = 5;
    sim.step(DT);
    const greens = sim.net.signal!.phases.filter((p) => p.group >= 0);
    expect(greens.every((p) => p.duration === 5)).toBe(true);
  });
});

describe("roundabout", () => {
  it("circulates entering traffic and discharges it at the exits", () => {
    const sim = new Simulation({ ...DEFAULT_CONFIG, scenario: "roundabout", armRate: 500 });
    for (let t = 0; t < 6000; t++) sim.step(DT);
    expect(sim.arrived).toBeGreaterThan(0);
    expect(sim.store.count).toBeLessThan(400); // bounded — no runaway
  });
});

describe("priority merge — gap acceptance", () => {
  it("a minor-road vehicle merges and reaches the sink when the major road is clear", () => {
    const sim = new Simulation({
      ...DEFAULT_CONFIG,
      scenario: "merge",
      majorRate: 0,
      minorRate: 0,
    });
    const { M, mergeConn } = mergeSegs(sim);
    sim.store.clear();
    const minor = sim.store.add(M.id, M.length - 2, 8, 5, 12, M.laneIndex);
    sim.store.nextSeg[minor] = mergeConn.id;

    for (let t = 0; t < 5000; t++) sim.step(DT); // ~83s, ample to cross + drive to sink
    expect(sim.arrived).toBe(1);
    expect(sim.store.count).toBe(0);
  });

  it("a minor-road vehicle holds at the line while a major vehicle is in conflict", () => {
    const sim = new Simulation({
      ...DEFAULT_CONFIG,
      scenario: "merge",
      majorRate: 0,
      minorRate: 0,
      criticalGap: 3,
    });
    const { M, A1, mergeConn } = mergeSegs(sim);
    sim.store.clear();
    const minor = sim.store.add(M.id, M.length - 2, 0, 5, 12, M.laneIndex);
    sim.store.nextSeg[minor] = mergeConn.id;
    const major = sim.store.add(A1.id, A1.length - 25, 15, 5, 15, A1.laneIndex);

    for (let t = 0; t < 300; t++) {
      // Hold the major vehicle perpetually ~1.7s from the junction (a standing
      // conflict), so the gap never opens.
      sim.store.s[major] = A1.length - 25;
      sim.store.speed[major] = 15;
      sim.store.nextSeg[major] = -1;
      sim.step(DT);
    }
    expect(sim.arrived).toBe(0); // never got an acceptable gap
    expect(sim.store.seg[minor]).toBe(M.id); // still waiting on the approach
  });
});
