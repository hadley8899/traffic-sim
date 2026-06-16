import {
  Application,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Texture,
} from "pixi.js";
import { offsetPose } from "../sim/geometry";
import type { Network, Segment } from "../sim/network";
import type { VehicleStore } from "../sim/VehicleStore";

/** Rendered car size, world units (metres). Length < vehicle spacing so queued
 *  cars show the IDM minimum gap rather than fusing into a bar. */
const CAR_LEN = 4.4;
const CAR_W = 3.2;
/** Texture is drawn larger for crispness, then scaled down to CAR_LEN/CAR_W. */
const TEX_LEN = 60;
const TEX_W = 28;

/**
 * Top-down renderer for an arbitrary road network.
 *
 * Roads are drawn by sampling each segment's geometry; vehicles are placed by
 * mapping (segment, s, visualLane) through the same geometry. Cars draw through
 * a single instanced ParticleContainer so the draw cost stays flat into the
 * thousands. Read-only consumer of VehicleStore — it interpolates between the
 * last two ticks and snaps across segment transitions.
 */
export class Renderer {
  private app = new Application();
  private world = new Container();
  private road = new Graphics();
  private signalGfx = new Graphics();
  private cars = new ParticleContainer({
    dynamicProperties: { position: true, rotation: true, color: true },
  });
  private particles: Particle[] = [];
  private carTexture!: Texture;
  private net: Network | null = null;

  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      preference: "webgl", // WebGPU's software fallback can hang in some browsers
      antialias: true,
      resizeTo: container,
      background: 0x0f1115,
      autoDensity: true,
      autoStart: false, // we drive rendering from Engine's fixed-timestep loop
      resolution: window.devicePixelRatio || 1,
    });
    this.app.canvas.classList.add("canvas");
    container.appendChild(this.app.canvas);
    if (import.meta.env.DEV) (window as unknown as { __pixiApp?: unknown }).__pixiApp = this.app;

    this.app.stage.addChild(this.world);
    this.world.addChild(this.road);
    this.world.addChild(this.cars);
    this.world.addChild(this.signalGfx);

    this.carTexture = this.makeCarTexture();

    this.app.renderer.on("resize", () => this.fit());
  }

  /** A simple top-down car: white body (tinted by speed) with a dark cabin. */
  private makeCarTexture(): Texture {
    const g = new Graphics();
    // Body — front is +x (matches heading at rotation 0).
    g.roundRect(0, 0, TEX_LEN, TEX_W, 7).fill(0xffffff);
    // Windscreen / cabin nearer the front, and a smaller rear window. Drawn
    // dark so the per-vehicle tint reads them as windows, not body colour.
    g.roundRect(TEX_LEN * 0.55, TEX_W * 0.18, TEX_LEN * 0.22, TEX_W * 0.64, 3).fill(0x20242c);
    g.roundRect(TEX_LEN * 0.2, TEX_W * 0.22, TEX_LEN * 0.16, TEX_W * 0.56, 3).fill(0x2a2f38);
    const tex = this.app.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    return tex;
  }

  /** Set the network to display; redraws roads and refits the view. */
  configure(net: Network): void {
    this.net = net;
    this.drawRoad();
    this.fit();
  }

  private fit(): void {
    if (!this.net) return;
    const { minX, minY, maxX, maxY } = this.net.bounds;
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const margin = 40;
    const scale = Math.min(
      (this.app.screen.width - margin * 2) / bw,
      (this.app.screen.height - margin * 2) / bh,
      2.5,
    );
    this.world.scale.set(scale);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.world.position.set(
      this.app.screen.width / 2 - cx * scale,
      this.app.screen.height / 2 - cy * scale,
    );
  }

  /** Sample a segment centreline (offset laterally) into a flat [x,y,...] list. */
  private polyline(seg: Segment, lateral: number): number[] {
    const samples = Math.max(2, Math.ceil(seg.length / 8));
    const pts: number[] = [];
    for (let k = 0; k <= samples; k++) {
      const p = seg.geom.poseAt((seg.length * k) / samples);
      const o = offsetPose(p, lateral);
      pts.push(o.x, o.y);
    }
    return pts;
  }

  private strokePolyline(pts: number[], width: number, color: number, alpha = 1): void {
    this.road.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) this.road.lineTo(pts[k], pts[k + 1]);
    this.road.stroke({ width, color, alpha, cap: "round", join: "round" });
  }

  private drawRoad(): void {
    if (!this.net) return;
    this.road.clear();
    // Asphalt: each lane segment + connection as a stroked centreline.
    for (const seg of this.net.segments) {
      const lateral =
        seg.kind === "lane" ? (seg.laneIndex - (seg.laneCount - 1) / 2) * seg.laneWidth : 0;
      const color = seg.kind === "conn" ? 0x262b34 : 0x2a2f3a;
      this.strokePolyline(this.polyline(seg, lateral), seg.laneWidth, color);
    }
    // Thin centre dashes per lane for a sense of motion/direction.
    for (const seg of this.net.segments) {
      if (seg.kind !== "lane") continue;
      const lateral = (seg.laneIndex - (seg.laneCount - 1) / 2) * seg.laneWidth;
      this.strokePolyline(this.polyline(seg, lateral), 0.8, 0x3a4250, 0.5);
    }
  }

  /**
   * Draw one frame.
   * @param alpha interpolation factor in [0,1] between prevS and s.
   */
  render(store: VehicleStore, alpha: number): void {
    if (!this.net) return;
    const n = store.count;
    this.resizePool(n);

    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      const seg = this.net.segments[store.seg[i]];

      // Interpolate s; snap across a segment transition.
      let s: number;
      if (store.prevSeg[i] === store.seg[i]) {
        let prev = store.prevS[i];
        let cur = store.s[i];
        if (seg.loop) {
          if (cur - prev > seg.length / 2) prev += seg.length;
          else if (prev - cur > seg.length / 2) cur += seg.length;
        }
        s = prev + (cur - prev) * alpha;
        if (seg.loop) s %= seg.length;
      } else {
        s = store.s[i];
      }

      const pose = seg.geom.poseAt(Math.max(0, Math.min(s, seg.length)));
      const lateral = (store.visualLane[i] - (seg.laneCount - 1) / 2) * seg.laneWidth;
      const o = offsetPose(pose, lateral);
      p.x = o.x;
      p.y = o.y;
      p.rotation = pose.heading;
      p.tint = speedTint(store.speed[i], store.desiredSpeed[i]);
    }

    this.drawSignals();
    this.app.render();
  }

  /** Per-frame signal heads at each signalled connection's stop line. */
  private drawSignals(): void {
    const signal = this.net?.signal;
    this.signalGfx.clear();
    if (!signal) return;
    for (const seg of this.net!.segments) {
      if (seg.control !== "signal") continue;
      const p = seg.geom.poseAt(0);
      const green = signal.group === seg.signalGroup;
      this.signalGfx.circle(p.x, p.y, 3.2).fill(green ? 0x3ad17a : 0xe8413c);
    }
  }

  private resizePool(n: number): void {
    while (this.particles.length < n) {
      const p = new Particle({
        texture: this.carTexture,
        anchorX: 0.5,
        anchorY: 0.5,
        // Map the texture onto real-world car dimensions (static per particle).
        scaleX: CAR_LEN / TEX_LEN,
        scaleY: CAR_W / TEX_W,
      });
      this.cars.addParticle(p);
      this.particles.push(p);
    }
    while (this.particles.length > n) {
      const p = this.particles.pop()!;
      this.cars.removeParticle(p);
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }
}

/** Map speed (0..desired) to a red->amber->green tint. */
function speedTint(speed: number, desired: number): number {
  const t = Math.max(0, Math.min(1, desired > 0 ? speed / desired : 0));
  const r = Math.round(0xe8 + (0x3a - 0xe8) * t);
  const g = Math.round(0x41 + (0xd1 - 0x41) * t);
  const b = Math.round(0x3c + (0x7a - 0x3c) * t);
  return (r << 16) | (g << 8) | b;
}
