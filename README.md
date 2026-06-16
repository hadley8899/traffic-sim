# Traffic Simulator

A microscopic traffic simulator for studying junctions, motorway merges, and
roundabouts. Top-down 2D, web-based, built for **realistic analysis** — flow,
density, and delay metrics — not just a toy.

> **Status: M5.** A prebuilt junction library — **priority merge**, **signalised
> cross**, **roundabout**, and the **multi-lane ring** — on one segment-graph
> simulation, now with **live analysis**: a speed/throughput time-series chart
> (uPlot), queue & travel-time metrics, JSON save/load, and a pin-to-compare
> table for benchmarking junction types head-to-head.

## Stack

- **Vite + TypeScript (strict)** — tooling
- **Pixi.js (WebGL)** — top-down rendering, built to scale to thousands of vehicles
- **React + Zustand** — control panel and live metrics
- **Vitest** — model-correctness tests

## Architecture

Three strictly one-directional layers:

```
React UI  (sliders, metrics)      src/ui/      reads state, sends commands
   │
Sim Core  (pure TS, no DOM)       src/sim/     network, IDM/MOBIL, gap acceptance
   │
Renderer  (Pixi, read-only)       src/render/  draws sim state, interpolates
```

`src/app/Engine.ts` owns the render loop and glues the layers together.

### Key invariants

- **The sim core has zero rendering/DOM imports.** It is deterministic and
  unit-tested, and is written in a WASM-portable style (Structure-of-Arrays,
  scalar float math) so the hot loop can be ported to Rust later.
- **Fixed timestep** (`SIM_DT = 1/60`). The simulation only ever advances in
  steps of this size; playback speed changes *how many* ticks run per frame,
  never the step size. Same config → identical run, every time.
- **The renderer interpolates** between the last two ticks, so motion is smooth
  even at a low tick rate.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # run model tests
npm run typecheck  # strict type check
```

## Models

- **Car-following:** IDM (Intelligent Driver Model) — `src/sim/idm.ts`
- **Lane-changing:** MOBIL — `src/sim/mobil.ts`

## Roadmap

| Milestone | Scope |
|-----------|-------|
| **M1 ✅** | Ring road, IDM, SoA core, fixed timestep, interpolated render |
| **M2 ✅** | Multi-lane ring, MOBIL lane changes, per-lane neighbour buckets, instanced ParticleContainer |
| **M3 ✅** | Network core (segment graph, routing, sources/sinks), priority-merge gap acceptance, arbitrary-geometry renderer |
| **M4 ✅** | Junction library (merge · signalised cross · roundabout · ring), fixed-time signals, JSON save/load |
| **M5 ✅** | Live speed/throughput chart (uPlot), queue & travel-time metrics, pin-to-compare scenario table |
| M6 | Optional: Rust/WASM hot loop, 3D view, freeform road editor |
