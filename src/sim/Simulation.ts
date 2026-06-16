import { idmAccel } from "./idm";
import { mobilIncentive } from "./mobil";
import type { Network, Segment } from "./network";
import {
  buildMerge,
  buildRing,
  buildRoundabout,
  buildSignalCross,
  type Scenario,
} from "./scenarios";
import { VehicleStore } from "./VehicleStore";
import {
  DEFAULT_IDM,
  DEFAULT_MOBIL,
  type IdmParams,
  type MetricsHistory,
  type MobilParams,
  type SimMetrics,
} from "./types";

export interface SimConfig {
  scenario: Scenario;
  /** Ring: circumference (m), lane count, and fixed vehicle population. */
  roadLength: number;
  lanes: number;
  vehicleCount: number;
  /** Merge: inflow rates (veh/h) on the major and minor roads. */
  majorRate: number;
  minorRate: number;
  /** Signal/roundabout: per-arm inflow (veh/h) and signal green time (s). */
  armRate: number;
  greenTime: number;
  /** Shared. */
  vehicleLength: number;
  speedVariation: number;
  /** Minimum acceptable time gap to enter a yield-controlled junction, s. */
  criticalGap: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  scenario: "merge",
  roadLength: 700,
  lanes: 2,
  vehicleCount: 40,
  majorRate: 900,
  minorRate: 500,
  armRate: 600,
  greenTime: 10,
  vehicleLength: 5,
  speedVariation: 0.15,
  criticalGap: 3,
};

const LC_COOLDOWN = 2; // s between lane changes
const LC_VISUAL_RATE = 3; // visual lane easing (1/s)
const COMMIT_DIST = 60; // commit to a turn within this distance of the end, m
const STOP_MARGIN = 2; // stop this far back from a junction mouth, m
const SPAWN_GAP = 12; // keep the source entry clear by this much, m

/**
 * Network traffic simulation: IDM longitudinally, MOBIL laterally, and
 * conflict/gap-acceptance at junctions. Vehicles traverse a segment graph, so
 * the same core runs the closed ring and the open priority-merge scenarios.
 * Deterministic given config + seed.
 */
export class Simulation {
  config: SimConfig;
  idm: IdmParams;
  mobil: MobilParams;
  readonly store: VehicleStore;
  net!: Network;

  time = 0;
  laneChanges = 0;
  arrived = 0;
  private meanTravelTime = 0;
  private seed: number;

  /** Rolling time-series for charts, sampled at a fixed sim-time cadence. */
  readonly history: MetricsHistory = { t: [], speed: [], flow: [], queue: [] };
  private histTimer = 0;

  private accel: Float32Array;
  private targetSeg: Int32Array; // MOBIL: lateral move target (or current)
  private buckets: number[][] = [];
  private bucketPos: Int32Array;

  constructor(
    config: SimConfig = DEFAULT_CONFIG,
    idm: IdmParams = DEFAULT_IDM,
    mobil: MobilParams = DEFAULT_MOBIL,
    seed = 1,
  ) {
    this.config = { ...config };
    this.idm = { ...idm };
    this.mobil = { ...mobil };
    this.seed = seed >>> 0;
    this.store = new VehicleStore(20_000);
    this.accel = new Float32Array(this.store.capacity);
    this.targetSeg = new Int32Array(this.store.capacity);
    this.bucketPos = new Int32Array(this.store.capacity);
    this.reset();
  }

  private rand(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private buildNetwork(): Network {
    const c = this.config;
    switch (c.scenario) {
      case "ring":
        return buildRing({ roadLength: c.roadLength, lanes: c.lanes });
      case "signal":
        return buildSignalCross({ armRate: c.armRate, greenTime: c.greenTime });
      case "roundabout":
        return buildRoundabout({ armRate: c.armRate });
      case "merge":
      default:
        return buildMerge({ majorRate: c.majorRate, minorRate: c.minorRate });
    }
  }

  reset(): void {
    this.time = 0;
    this.laneChanges = 0;
    this.arrived = 0;
    this.meanTravelTime = 0;
    this.histTimer = 0;
    this.history.t.length = 0;
    this.history.speed.length = 0;
    this.history.flow.length = 0;
    this.history.queue.length = 0;
    this.seed = 1 >>> 0;
    this.net = this.buildNetwork();
    const s = this.store;
    s.clear();

    if (this.net.closed) this.populateRing();
    this.rebuildBuckets();
  }

  /** Closed scenarios start with a fixed, evenly-spaced population. */
  private populateRing(): void {
    const s = this.store;
    const laneSegs = this.net.segments.filter((g) => g.kind === "lane");
    const n = Math.min(this.config.vehicleCount, s.capacity);
    const perLane = Math.ceil(n / laneSegs.length);
    for (let i = 0; i < n; i++) {
      const seg = laneSegs[i % laneSegs.length];
      const slot = Math.floor(i / laneSegs.length);
      const spacing = seg.length / perLane;
      const jitter = (this.rand() - 0.5) * spacing * 0.05;
      const pos = (slot * spacing + jitter + seg.length) % seg.length;
      const desired = this.idm.v0 * (1 + (this.rand() - 0.5) * 2 * this.config.speedVariation);
      s.add(seg.id, pos, this.idm.v0 * 0.5, this.config.vehicleLength, desired, seg.laneIndex);
    }
  }

  private rebuildBuckets(): void {
    const s = this.store;
    const segCount = this.net.segments.length;
    while (this.buckets.length < segCount) this.buckets.push([]);
    for (let g = 0; g < segCount; g++) this.buckets[g].length = 0;
    for (let i = 0; i < s.count; i++) this.buckets[s.seg[i]].push(i);
    for (let g = 0; g < segCount; g++) {
      const b = this.buckets[g];
      b.sort((x, y) => s.s[x] - s.s[y]);
      for (let k = 0; k < b.length; k++) this.bucketPos[b[k]] = k;
    }
  }

  step(dt: number): void {
    if (this.net.signal) {
      // Apply the live green-time slider to the green phases before advancing.
      for (const ph of this.net.signal.phases) if (ph.group >= 0) ph.duration = this.config.greenTime;
      this.net.signal.update(dt);
    }
    if (!this.net.closed) this.spawn(dt);
    this.rebuildBuckets();

    const s = this.store;
    const n = s.count;
    if (n === 0) {
      this.time += dt;
      return;
    }

    // Commit a downstream segment when approaching a junction.
    for (let i = 0; i < n; i++) this.commitRoute(i);

    // Longitudinal acceleration (same-segment leader, downstream, or stop line).
    for (let i = 0; i < n; i++) this.accel[i] = this.followAccel(i);

    // MOBIL lateral decisions (multi-lane links only); applied after integrate.
    for (let i = 0; i < n; i++) this.targetSeg[i] = s.seg[i];
    this.decideLaneChanges();

    // Integrate longitudinally and handle segment transitions / removals.
    const remove: number[] = [];
    for (let i = 0; i < n; i++) {
      s.prevSeg[i] = s.seg[i];
      s.prevS[i] = s.s[i];
      let v = s.speed[i] + this.accel[i] * dt;
      if (v < 0) v = 0;
      s.s[i] += (s.speed[i] + v) * 0.5 * dt;
      s.speed[i] = v;
      this.advanceSegment(i, remove);
    }

    // Commit lane changes for vehicles that did not transition this tick.
    for (let i = 0; i < n; i++) {
      if (this.targetSeg[i] !== s.seg[i] && s.seg[i] === s.prevSeg[i]) {
        s.seg[i] = this.targetSeg[i];
        s.laneIndex[i] = this.net.segments[s.seg[i]].laneIndex;
        s.lcCooldown[i] = LC_COOLDOWN;
        this.laneChanges++;
      }
      const dl = s.laneIndex[i] - s.visualLane[i];
      const stepAmt = LC_VISUAL_RATE * dt;
      s.visualLane[i] += Math.abs(dl) <= stepAmt ? dl : Math.sign(dl) * stepAmt;
      if (s.lcCooldown[i] > 0) s.lcCooldown[i] = Math.max(0, s.lcCooldown[i] - dt);
    }

    // Apply removals (descending so swap-remove never clobbers a pending index).
    remove.sort((a, b) => b - a);
    for (const i of remove) {
      const travel = this.time - s.entryTime[i];
      // EMA of arrived-vehicle travel time (seed on the first arrival).
      this.meanTravelTime = this.arrived === 0 ? travel : this.meanTravelTime * 0.95 + travel * 0.05;
      s.remove(i);
      this.arrived++;
    }

    this.time += dt;
    this.sampleHistory(dt);
  }

  /** Append a metrics sample to the rolling history at a fixed cadence. */
  private sampleHistory(dt: number): void {
    const INTERVAL = 0.5; // s between samples
    const MAX = 240; // ~120s window
    this.histTimer += dt;
    if (this.histTimer < INTERVAL) return;
    this.histTimer = 0;
    const m = this.metrics();
    const h = this.history;
    h.t.push(m.time);
    h.speed.push(m.meanSpeed * 3.6);
    h.flow.push(m.flow);
    h.queue.push(m.queue);
    if (h.t.length > MAX) {
      h.t.shift();
      h.speed.shift();
      h.flow.shift();
      h.queue.shift();
    }
  }

  /** Live inflow rate for a source — driven by the UI sliders, not baked in. */
  private rateFor(src: { rate: number; key?: string }): number {
    switch (src.key) {
      case "major":
        return this.config.majorRate;
      case "minor":
        return this.config.minorRate;
      case "arm":
        return this.config.armRate;
      default:
        return src.rate;
    }
  }

  /** Inject vehicles at source segments per a Poisson-ish arrival process. */
  private spawn(dt: number): void {
    const s = this.store;
    for (const src of this.net.sources) {
      if (this.rand() > (this.rateFor(src) / 3600) * dt) continue;
      // Keep the entry clear.
      let minS = Infinity;
      for (let i = 0; i < s.count; i++) if (s.seg[i] === src.seg) minS = Math.min(minS, s.s[i]);
      if (minS < SPAWN_GAP) continue;
      const seg = this.net.segments[src.seg];
      const desired = this.idm.v0 * (1 + (this.rand() - 0.5) * 2 * this.config.speedVariation);
      const i = s.add(seg.id, 0, desired * 0.7, this.config.vehicleLength, desired, seg.laneIndex);
      if (i >= 0) s.entryTime[i] = this.time;
    }
  }

  private commitRoute(i: number): void {
    const s = this.store;
    if (s.nextSeg[i] >= 0) return;
    const seg = this.net.segments[s.seg[i]];
    if (seg.loop || seg.successors.length === 0) return;
    if (seg.length - s.s[i] > COMMIT_DIST) return;
    // Pick a successor by turn-ratio weight.
    let r = this.rand();
    let total = 0;
    for (const w of seg.succWeights) total += w;
    r *= total;
    let pick = seg.successors[0];
    for (let k = 0; k < seg.successors.length; k++) {
      r -= seg.succWeights[k];
      if (r <= 0) {
        pick = seg.successors[k];
        break;
      }
    }
    s.nextSeg[i] = pick;
  }

  private free(i: number): number {
    return idmAccel(this.store.speed[i], this.store.desiredSpeed[i], Infinity, 0, this.idm);
  }

  /** IDM accel of vehicle i given a leader index and a precomputed gap. */
  private accelTo(i: number, lead: number, gap: number): number {
    const s = this.store;
    const dv = s.speed[i] - s.speed[lead];
    return idmAccel(s.speed[i], s.desiredSpeed[i], Math.max(gap, 0.05), dv, this.idm);
  }

  private followAccel(i: number): number {
    const s = this.store;
    const seg = this.net.segments[s.seg[i]];
    const b = this.buckets[s.seg[i]];
    const k = this.bucketPos[i];
    const m = b.length;

    // Leader ahead within the same segment.
    if (seg.loop) {
      if (m <= 1) return this.free(i);
      const lead = b[(k + 1) % m];
      let gap = s.s[lead] - s.s[i] - s.length[lead];
      if (k + 1 >= m) gap += seg.length; // wrap-around leader
      return this.accelTo(i, lead, gap);
    }
    if (k < m - 1) {
      const lead = b[k + 1];
      return this.accelTo(i, lead, s.s[lead] - s.s[i] - s.length[lead]);
    }

    // Front of the segment: look downstream.
    const distToEnd = seg.length - s.s[i];
    const next = s.nextSeg[i];
    if (next < 0) return this.free(i); // not yet committed (or sink ahead)

    const nextSeg = this.net.segments[next];
    if (this.entryBlocked(nextSeg)) {
      // Hold at the stop line: a stationary virtual leader at the segment end.
      const gap = Math.max(distToEnd - STOP_MARGIN, 0.05);
      return idmAccel(s.speed[i], s.desiredSpeed[i], gap, s.speed[i], this.idm);
    }
    const nb = this.buckets[next];
    if (nb.length > 0) {
      const lead = nb[0];
      return this.accelTo(i, lead, distToEnd + s.s[lead] - s.length[lead]);
    }
    return this.free(i);
  }

  /** Whether a controlled connection currently forbids entry. */
  private entryBlocked(conn: Segment): boolean {
    if (conn.control === "yield") return !this.gapAcceptable(conn);
    if (conn.control === "signal") {
      return !this.net.signal || this.net.signal.group !== conn.signalGroup;
    }
    return false;
  }

  /** True if no conflicting vehicle will reach the junction within criticalGap. */
  private gapAcceptable(conn: Segment): boolean {
    const s = this.store;
    for (const cId of conn.conflicts) {
      const cseg = this.net.segments[cId];
      for (const j of this.buckets[cId]) {
        const distToEnd = cseg.length - s.s[j];
        const tta = distToEnd / Math.max(s.speed[j], 0.5);
        if (tta < this.config.criticalGap) return false;
      }
    }
    return true;
  }

  /** Move a vehicle onto its next segment when it passes the current end. */
  private advanceSegment(i: number, remove: number[]): void {
    const s = this.store;
    const seg = this.net.segments[s.seg[i]];
    if (seg.loop) {
      if (s.s[i] >= seg.length) s.s[i] -= seg.length;
      return;
    }
    if (s.s[i] < seg.length) return;
    const overshoot = s.s[i] - seg.length;
    const next = s.nextSeg[i] >= 0 ? s.nextSeg[i] : seg.successors[0] ?? -1;
    if (next < 0) {
      remove.push(i); // reached a sink / dead end
      return;
    }
    s.seg[i] = next;
    s.s[i] = overshoot;
    s.nextSeg[i] = -1;
    s.laneIndex[i] = this.net.segments[next].laneIndex;
    s.visualLane[i] = s.laneIndex[i];
  }

  private decideLaneChanges(): void {
    const s = this.store;
    const n = s.count;
    for (let i = 0; i < n; i++) {
      if (s.lcCooldown[i] > 0) continue;
      const seg = this.net.segments[s.seg[i]];
      if (seg.leftSeg < 0 && seg.rightSeg < 0) continue;

      const aSelfOld = this.accel[i];
      const cb = this.buckets[s.seg[i]];
      const cm = cb.length;
      const k = this.bucketPos[i];
      const oldFollow = seg.loop && cm > 1 ? cb[(k - 1 + cm) % cm] : k > 0 ? cb[k - 1] : -1;
      const oldLeader = seg.loop && cm > 1 ? cb[(k + 1) % cm] : k < cm - 1 ? cb[k + 1] : -1;
      const aOldFollOld = oldFollow >= 0 ? this.accel[oldFollow] : 0;
      const aOldFollNew = oldFollow >= 0 ? this.followFrom(oldFollow, oldLeader, seg) : 0;

      let bestSeg = s.seg[i];
      let bestIncentive = 0;
      for (const target of [seg.leftSeg, seg.rightSeg]) {
        if (target < 0) continue;
        const { lead, follow } = this.neighborsInSeg(target, s.s[i]);
        const aSelfNew = lead >= 0 ? this.gapAccel(i, lead, target) : this.free(i);
        const aNewFollOld = follow >= 0 ? this.accel[follow] : 0;
        const aNewFollNew = follow >= 0 ? this.gapAccel(follow, i, target) : 0;
        const incentive = mobilIncentive(
          aSelfNew,
          aSelfOld,
          aNewFollNew,
          aNewFollOld,
          aOldFollNew,
          aOldFollOld,
          this.mobil,
        );
        if (incentive !== null && incentive > bestIncentive) {
          bestIncentive = incentive;
          bestSeg = target;
        }
      }
      this.targetSeg[i] = bestSeg;
    }
  }

  /** IDM accel of `follow` behind `lead`, both treated as on segment `seg`. */
  private followFrom(follow: number, lead: number, seg: Segment): number {
    const s = this.store;
    if (lead < 0) return this.free(follow);
    let gap = s.s[lead] - s.s[follow] - s.length[lead];
    if (seg.loop && gap < 0) gap += seg.length;
    return this.accelTo(follow, lead, gap);
  }

  /** Like followFrom but for a (follow, lead) pair on a given target segment. */
  private gapAccel(follow: number, lead: number, segId: number): number {
    return this.followFrom(follow, lead, this.net.segments[segId]);
  }

  /** Leader/follower bracketing position `pos` within a segment's bucket. */
  private neighborsInSeg(segId: number, pos: number): { lead: number; follow: number } {
    const b = this.buckets[segId];
    const m = b.length;
    if (m === 0) return { lead: -1, follow: -1 };
    const s = this.store;
    const loop = this.net.segments[segId].loop;
    let lo = 0;
    let hi = m;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s.s[b[mid]] < pos) lo = mid + 1;
      else hi = mid;
    }
    if (loop) return { lead: b[lo % m], follow: b[(lo - 1 + m) % m] };
    return { lead: lo < m ? b[lo] : -1, follow: lo > 0 ? b[lo - 1] : -1 };
  }

  metrics(): SimMetrics {
    const s = this.store;
    const n = s.count;
    let sum = 0;
    let queue = 0;
    for (let i = 0; i < n; i++) {
      sum += s.speed[i];
      if (s.speed[i] < 2) queue++;
    }
    const meanSpeed = n > 0 ? sum / n : 0;

    let totalLen = 0;
    for (const g of this.net.segments) if (g.kind === "lane") totalLen += g.length;
    const density = totalLen > 0 ? (n / totalLen) * 1000 : 0;
    const flow = this.net.closed
      ? meanSpeed * 3.6 * density // fundamental flow (closed)
      : this.time > 0
        ? (this.arrived / this.time) * 3600 // throughput (open)
        : 0;

    return {
      count: n,
      meanSpeed,
      density,
      flow,
      time: this.time,
      laneChanges: this.laneChanges,
      arrived: this.arrived,
      queue,
      meanTravelTime: this.meanTravelTime,
    };
  }
}
