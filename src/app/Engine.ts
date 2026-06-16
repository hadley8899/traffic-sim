import { Renderer } from "../render/Renderer";
import { Simulation, type SimConfig } from "../sim/Simulation";
import type { IdmParams, MetricsHistory, MobilParams, SimMetrics } from "../sim/types";

/** Fixed simulation tick — the sim ALWAYS advances in steps of this size. */
const SIM_DT = 1 / 60;
/** Guard against the "spiral of death" when a frame is very long. */
const MAX_STEPS_PER_FRAME = 240;

/**
 * Owns the render loop and glues the (pure) Simulation to the (Pixi) Renderer.
 *
 * Decoupling rule: the simulation only ever advances by SIM_DT, regardless of
 * display framerate or speed multiplier. Faster playback = more ticks per
 * frame, never a larger dt. This keeps results reproducible.
 */
export class Engine {
  readonly sim: Simulation;
  private renderer = new Renderer();
  private accumulator = 0;
  private lastTime = 0;
  private raf = 0;
  private running = false;

  /** Wall-clock seconds of sim time to run per real second (playback speed). */
  speed = 1;

  onMetrics?: (m: SimMetrics) => void;
  onHistory?: (h: MetricsHistory) => void;
  private metricsTimer = 0;
  private historyTimer = 0;

  /** True once the renderer has finished its async init. */
  mounted = false;
  private destroyed = false;

  constructor() {
    this.sim = new Simulation();
  }

  async mount(container: HTMLElement): Promise<void> {
    await this.renderer.init(container);
    this.renderer.configure(this.sim.net);
    this.mounted = true;
    this.start();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      this.tick(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private playing = true;
  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  private tick(now: number): void {
    let frame = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frame > 0.25) frame = 0.25; // clamp huge stalls (tab refocus etc.)

    if (this.playing) {
      this.accumulator += frame * this.speed;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
        this.sim.step(SIM_DT);
        this.accumulator -= SIM_DT;
        steps++;
      }
      if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }

    const alpha = this.playing ? this.accumulator / SIM_DT : 1;
    this.renderer.render(this.sim.store, alpha);

    // Throttle metrics to ~10 Hz so React isn't re-rendered every frame.
    this.metricsTimer += frame;
    if (this.metricsTimer >= 0.1 && this.onMetrics) {
      this.metricsTimer = 0;
      this.onMetrics(this.sim.metrics());
    }

    // Push a chart-history snapshot at ~4 Hz (copies so React sees a new value).
    this.historyTimer += frame;
    if (this.historyTimer >= 0.25 && this.onHistory) {
      this.historyTimer = 0;
      const h = this.sim.history;
      this.onHistory({ t: [...h.t], speed: [...h.speed], flow: [...h.flow], queue: [...h.queue] });
    }
  }

  setIdm(idm: Partial<IdmParams>): void {
    Object.assign(this.sim.idm, idm);
  }

  setMobil(mobil: Partial<MobilParams>): void {
    Object.assign(this.sim.mobil, mobil);
  }

  /**
   * Apply config. Geometry/population changes rebuild the network and the road
   * graphics; live params (rates, critical gap, driver spread) apply in place.
   */
  setConfig(config: Partial<SimConfig>): void {
    const cur = this.sim.config;
    const changed = (k: keyof SimConfig) => config[k] !== undefined && config[k] !== cur[k];
    const needsReset =
      changed("scenario") || changed("roadLength") || changed("lanes") || changed("vehicleCount");
    Object.assign(cur, config);
    if (needsReset) this.reset();
  }

  /** Rebuild the simulation network and re-sync the renderer to it. */
  reset(): void {
    this.sim.reset();
    if (this.mounted) this.renderer.configure(this.sim.net);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    if (this.mounted) this.renderer.destroy();
  }
}
