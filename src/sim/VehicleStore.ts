/**
 * Structure-of-Arrays vehicle storage for the network model.
 *
 * A vehicle lives on (segment, s). Every per-vehicle field is a flat typed
 * array indexed by slot — cache-friendly, allocation-free on the hot path, and
 * the shape a future Rust/WASM port expects. Removal is swap-with-last (O(1)),
 * so slot identity is not stable across a tick; that is fine because the
 * renderer treats all vehicles interchangeably.
 */
export class VehicleStore {
  readonly capacity: number;
  count = 0;

  /** Current segment id. */
  readonly seg: Int32Array;
  /** Longitudinal position along the segment, m. */
  readonly s: Float32Array;
  /** Segment / position one tick ago (for render interpolation). */
  readonly prevSeg: Int32Array;
  readonly prevS: Float32Array;

  readonly speed: Float32Array;
  readonly length: Float32Array;
  readonly desiredSpeed: Float32Array;

  /** Lane index within the current link (for MOBIL + lateral render offset). */
  readonly laneIndex: Int32Array;
  /** Smoothly-eased lane for rendering; lerps toward laneIndex on a change. */
  readonly visualLane: Float32Array;
  /** Committed next segment (chosen near a junction), or -1. */
  readonly nextSeg: Int32Array;
  /** Seconds until this vehicle may change lanes again (anti-flicker). */
  readonly lcCooldown: Float32Array;
  /** Sim time when this vehicle entered (for travel-time metrics). */
  readonly entryTime: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.seg = new Int32Array(capacity);
    this.s = new Float32Array(capacity);
    this.prevSeg = new Int32Array(capacity);
    this.prevS = new Float32Array(capacity);
    this.speed = new Float32Array(capacity);
    this.length = new Float32Array(capacity);
    this.desiredSpeed = new Float32Array(capacity);
    this.laneIndex = new Int32Array(capacity);
    this.visualLane = new Float32Array(capacity);
    this.nextSeg = new Int32Array(capacity);
    this.lcCooldown = new Float32Array(capacity);
    this.entryTime = new Float32Array(capacity);
  }

  clear(): void {
    this.count = 0;
  }

  /** Append a vehicle; returns its slot index, or -1 if at capacity. */
  add(
    seg: number,
    s: number,
    speed: number,
    length: number,
    desiredSpeed: number,
    laneIndex: number,
  ): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.seg[i] = seg;
    this.s[i] = s;
    this.prevSeg[i] = seg;
    this.prevS[i] = s;
    this.speed[i] = speed;
    this.length[i] = length;
    this.desiredSpeed[i] = desiredSpeed;
    this.laneIndex[i] = laneIndex;
    this.visualLane[i] = laneIndex;
    this.nextSeg[i] = -1;
    this.lcCooldown[i] = 0;
    this.entryTime[i] = 0;
    return i;
  }

  /** Remove a vehicle by swapping the last slot into its place. */
  remove(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.seg[i] = this.seg[last];
      this.s[i] = this.s[last];
      this.prevSeg[i] = this.prevSeg[last];
      this.prevS[i] = this.prevS[last];
      this.speed[i] = this.speed[last];
      this.length[i] = this.length[last];
      this.desiredSpeed[i] = this.desiredSpeed[last];
      this.laneIndex[i] = this.laneIndex[last];
      this.visualLane[i] = this.visualLane[last];
      this.nextSeg[i] = this.nextSeg[last];
      this.lcCooldown[i] = this.lcCooldown[last];
      this.entryTime[i] = this.entryTime[last];
    }
  }
}
