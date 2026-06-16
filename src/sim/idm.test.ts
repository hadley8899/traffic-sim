import { describe, it, expect } from "vitest";
import { idmAccel } from "./idm";
import { DEFAULT_IDM } from "./types";

describe("idmAccel", () => {
  const p = DEFAULT_IDM;

  it("accelerates from standstill on a free road", () => {
    const a = idmAccel(0, p.v0, Infinity, 0, p);
    expect(a).toBeCloseTo(p.a, 5); // free term = 1 at v=0
  });

  it("produces ~zero acceleration at desired speed on a free road", () => {
    const a = idmAccel(p.v0, p.v0, Infinity, 0, p);
    expect(a).toBeCloseTo(0, 5);
  });

  it("brakes hard when the gap collapses", () => {
    // Travelling at speed, almost touching a stationary leader.
    const a = idmAccel(20, p.v0, p.s0 * 0.5, 20, p);
    expect(a).toBeLessThan(-p.b); // emergency braking exceeds comfortable decel
  });

  it("maintains a roughly steady gap behind an equal-speed leader", () => {
    // At the equilibrium gap s0 + v*T with zero approach rate, accel ~ 0.
    const v = 20;
    const equilibriumGap = p.s0 + v * p.T;
    const a = idmAccel(v, p.v0, equilibriumGap, 0, p);
    // Equilibrium also includes the small free-road pull toward v0; just
    // assert it is gentle (not a hard accel/brake).
    expect(Math.abs(a)).toBeLessThan(0.5);
  });
});
