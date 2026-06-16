/**
 * IDM (Intelligent Driver Model) parameters.
 * These are the knobs that govern longitudinal car-following behaviour.
 * See https://en.wikipedia.org/wiki/Intelligent_driver_model
 */
export interface IdmParams {
  /** Desired (free-flow) speed, m/s. Per-vehicle variation is applied on top. */
  v0: number;
  /** Safe time headway to the leader, s. */
  T: number;
  /** Maximum acceleration, m/s^2. */
  a: number;
  /** Comfortable deceleration, m/s^2. */
  b: number;
  /** Minimum bumper-to-bumper gap at standstill, m. */
  s0: number;
  /** Acceleration exponent (free-road softness). Conventionally 4. */
  delta: number;
}

export const DEFAULT_IDM: IdmParams = {
  v0: 30, // ~108 km/h
  T: 1.5,
  a: 1.2,
  b: 2.0,
  s0: 2.0,
  delta: 4,
};

/**
 * MOBIL lane-changing parameters.
 * "Minimizing Overall Braking Induced by Lane changes" — the lateral companion
 * to IDM. See https://traffic-simulation.de/info/info_MOBIL.html
 */
export interface MobilParams {
  /** Politeness: how much a driver weighs the (dis)advantage to others (0..1). */
  politeness: number;
  /** Switching threshold: minimum accel gain to bother changing, m/s^2. */
  threshold: number;
  /** Maximum braking a change may impose on the new follower, m/s^2 (positive). */
  bSafe: number;
}

export const DEFAULT_MOBIL: MobilParams = {
  politeness: 0.2,
  threshold: 0.2,
  bSafe: 4,
};

/** Live, aggregate readouts the UI displays. */
export interface SimMetrics {
  /** Number of active vehicles. */
  count: number;
  /** Mean speed across all vehicles, m/s. */
  meanSpeed: number;
  /** Flow past a fixed point, veh/h (mean speed * density). */
  flow: number;
  /** Density, veh/km (summed across all lanes). */
  density: number;
  /** Simulated time elapsed, s. */
  time: number;
  /** Total lane changes since the last reset. */
  laneChanges: number;
  /** Vehicles that have reached a sink (open networks). */
  arrived: number;
  /** Vehicles currently stopped or crawling (< 2 m/s) — queue proxy. */
  queue: number;
  /** EMA of arrived vehicles' travel time, s (open networks; 0 on the ring). */
  meanTravelTime: number;
}

/** Rolling time-series of key metrics for live charts. */
export interface MetricsHistory {
  /** Sample times, s. */
  t: number[];
  /** Mean speed at each sample, km/h. */
  speed: number[];
  /** Flow/throughput at each sample, veh/h. */
  flow: number[];
  /** Queue length at each sample, vehicles. */
  queue: number[];
}
