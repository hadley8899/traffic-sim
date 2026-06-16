import { describe, it, expect } from "vitest";
import { mobilIncentive, ringGap } from "./mobil";
import { DEFAULT_MOBIL } from "./types";

describe("ringGap", () => {
  it("measures bumper-to-bumper distance forward on the ring", () => {
    // leader at 100, follower at 50, leader 5m long, ring 700.
    expect(ringGap(100, 50, 5, 700)).toBeCloseTo(45, 5);
  });

  it("wraps around the ring when the leader is behind in raw coordinates", () => {
    // follower near the end, leader just past zero.
    expect(ringGap(10, 690, 5, 700)).toBeCloseTo(15, 5);
  });
});

describe("mobilIncentive", () => {
  const p = DEFAULT_MOBIL;

  it("rejects a change that forces the new follower to brake too hard", () => {
    // new follower would decelerate at -6 (> bSafe of 4).
    const r = mobilIncentive(1, 0, -6, 0, 0, 0, p);
    expect(r).toBeNull();
  });

  it("accepts a clearly advantageous, safe change", () => {
    // Subject gains +2 m/s^2, nobody is hurt.
    const r = mobilIncentive(2, 0, 0, 0, 0, 0, p);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(p.threshold);
  });

  it("rejects a change below the switching threshold", () => {
    // Tiny gain, under threshold.
    const r = mobilIncentive(0.1, 0, 0, 0, 0, 0, p);
    expect(r).toBeNull();
  });

  it("lets politeness suppress a selfish change that hurts others", () => {
    // Subject gains +1, but the new follower loses 3 (accel drops 0 -> -3).
    // Selfish (p=0) would accept; polite (p=1) should reject.
    const selfish = mobilIncentive(1, 0, -3, 0, 0, 0, { ...p, politeness: 0 });
    const polite = mobilIncentive(1, 0, -3, 0, 0, 0, { ...p, politeness: 1 });
    expect(selfish).not.toBeNull();
    expect(polite).toBeNull();
  });
});
