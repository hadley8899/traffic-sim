import type { MobilParams } from "./types";

/**
 * Bumper-to-bumper gap on a ring of length L, clamped to a small positive value
 * so IDM never divides by zero when vehicles are bunched.
 */
export function ringGap(
  leaderPos: number,
  followerPos: number,
  leaderLength: number,
  L: number,
): number {
  let g = leaderPos - followerPos - leaderLength;
  g %= L;
  if (g < 0) g += L;
  return g < 0.01 ? 0.01 : g;
}

/**
 * MOBIL acceptance test (symmetric — no keep-right bias, suitable for a ring).
 *
 * All four "follower" accelerations are IDM accelerations evaluated in the
 * hypothetical configurations:
 *
 * @param aSelfNew      subject's accel in the TARGET lane (behind new leader)
 * @param aSelfOld      subject's accel in its CURRENT lane (behind old leader)
 * @param aNewFollNew   target-lane follower's accel AFTER subject cuts in
 * @param aNewFollOld   target-lane follower's accel BEFORE (its current leader)
 * @param aOldFollNew   current-lane follower's accel AFTER subject leaves
 * @param aOldFollOld   current-lane follower's accel BEFORE (following subject)
 *
 * Returns the incentive value if the change is both safe and worthwhile, or
 * null if it should be rejected. Higher incentive = more desirable change.
 */
export function mobilIncentive(
  aSelfNew: number,
  aSelfOld: number,
  aNewFollNew: number,
  aNewFollOld: number,
  aOldFollNew: number,
  aOldFollOld: number,
  p: MobilParams,
): number | null {
  // Safety: do not force the prospective new follower to brake harder than bSafe.
  if (aNewFollNew < -p.bSafe) return null;

  const advantageSelf = aSelfNew - aSelfOld;
  const disadvantageOthers =
    aNewFollOld - aNewFollNew + (aOldFollOld - aOldFollNew);

  const incentive = advantageSelf - p.politeness * disadvantageOthers;
  return incentive > p.threshold ? incentive : null;
}
