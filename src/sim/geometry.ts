/**
 * Road geometry: maps a longitudinal coordinate s ∈ [0, length] along a
 * centreline to a world-space pose. Lanes share their link's s coordinate and
 * are offset laterally at render time, so geometry is per-link, not per-lane.
 */
export interface Pose {
  x: number;
  y: number;
  /** Heading of travel, radians (atan2 convention, screen y-down). */
  heading: number;
}

export interface Geometry {
  readonly length: number;
  poseAt(s: number): Pose;
}

/** A straight segment from (x0,y0) to (x1,y1). */
export class StraightGeometry implements Geometry {
  readonly length: number;
  private readonly heading: number;

  constructor(
    private readonly x0: number,
    private readonly y0: number,
    private readonly x1: number,
    private readonly y1: number,
  ) {
    this.length = Math.hypot(x1 - x0, y1 - y0);
    this.heading = Math.atan2(y1 - y0, x1 - x0);
  }

  poseAt(s: number): Pose {
    const t = this.length > 0 ? s / this.length : 0;
    return {
      x: this.x0 + (this.x1 - this.x0) * t,
      y: this.y0 + (this.y1 - this.y0) * t,
      heading: this.heading,
    };
  }
}

/**
 * A circular arc centred at (cx,cy), radius r, sweeping from angle a0 to a1.
 * A full circle (a1 = a0 ± 2π) gives the M1/M2 ring as a closed loop.
 */
export class ArcGeometry implements Geometry {
  readonly length: number;
  private readonly span: number;

  constructor(
    private readonly cx: number,
    private readonly cy: number,
    private readonly r: number,
    private readonly a0: number,
    a1: number,
  ) {
    this.span = a1 - a0;
    this.length = Math.abs(this.span) * r;
  }

  poseAt(s: number): Pose {
    const t = this.length > 0 ? s / this.length : 0;
    const a = this.a0 + this.span * t;
    const dir = this.span >= 0 ? 1 : -1;
    return {
      x: this.cx + Math.cos(a) * this.r,
      y: this.cy + Math.sin(a) * this.r,
      heading: a + (dir * Math.PI) / 2,
    };
  }
}

/** Offset a pose laterally (positive = to the right of travel). */
export function offsetPose(p: Pose, lateral: number): { x: number; y: number } {
  return {
    x: p.x + Math.sin(p.heading) * lateral,
    y: p.y - Math.cos(p.heading) * lateral,
  };
}
