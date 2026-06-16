import type { IdmParams } from "./types";

/**
 * Compute IDM acceleration for one vehicle.
 *
 * Pure function — no allocation, no state. This is the hot path; keep it
 * branch-light and WASM-portable (only scalar float math).
 *
 * @param v       current speed (m/s)
 * @param v0      this vehicle's desired speed (m/s)
 * @param gap     bumper-to-bumper distance to the leader (m); use Infinity for free road
 * @param dv      approach rate = v - v_leader (m/s); positive means closing in
 * @param p       shared IDM parameters
 */
export function idmAccel(
  v: number,
  v0: number,
  gap: number,
  dv: number,
  p: IdmParams,
): number {
  // Free-road term: ease off as we approach desired speed.
  const free = 1 - Math.pow(v / v0, p.delta);

  // Desired dynamical gap s*.
  const sStar =
    p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)));

  // Interaction term vanishes on a free road (gap -> Infinity).
  const interaction = (sStar / gap) ** 2;

  return p.a * (free - interaction);
}
