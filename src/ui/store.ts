import { create } from "zustand";
import {
  DEFAULT_IDM,
  DEFAULT_MOBIL,
  type IdmParams,
  type MetricsHistory,
  type MobilParams,
  type SimMetrics,
} from "../sim/types";
import { DEFAULT_CONFIG, type SimConfig } from "../sim/Simulation";
import { SCENARIOS } from "../sim/scenarios";

/** A captured scenario result for side-by-side comparison. */
export interface PinnedResult {
  id: number;
  label: string;
  speed: number; // km/h
  flow: number; // veh/h
  queue: number;
  travelTime: number; // s
}

interface UiState {
  idm: IdmParams;
  mobil: MobilParams;
  config: SimConfig;
  speed: number;
  playing: boolean;
  metrics: SimMetrics | null;
  history: MetricsHistory | null;
  pinned: PinnedResult[];

  setIdm: (patch: Partial<IdmParams>) => void;
  setMobil: (patch: Partial<MobilParams>) => void;
  setConfig: (patch: Partial<SimConfig>) => void;
  setSpeed: (speed: number) => void;
  togglePlaying: () => void;
  setMetrics: (m: SimMetrics) => void;
  setHistory: (h: MetricsHistory) => void;
  /** Capture the current scenario's metrics for comparison. */
  pinResult: () => void;
  clearPinned: () => void;
  /** Replace the whole tunable setup (used by Load). */
  applySetup: (s: { idm: IdmParams; mobil: MobilParams; config: SimConfig }) => void;
}

/** The serialisable setup, for save/load. */
export interface Setup {
  idm: IdmParams;
  mobil: MobilParams;
  config: SimConfig;
}

export const useStore = create<UiState>((set) => ({
  idm: { ...DEFAULT_IDM },
  mobil: { ...DEFAULT_MOBIL },
  config: { ...DEFAULT_CONFIG },
  speed: 1,
  playing: true,
  metrics: null,
  history: null,
  pinned: [],

  setIdm: (patch) => set((s) => ({ idm: { ...s.idm, ...patch } })),
  setMobil: (patch) => set((s) => ({ mobil: { ...s.mobil, ...patch } })),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  setSpeed: (speed) => set({ speed }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setMetrics: (metrics) => set({ metrics }),
  setHistory: (history) => set({ history }),
  pinResult: () =>
    set((s) => {
      if (!s.metrics) return {};
      const scenarioLabel =
        SCENARIOS.find((x) => x.id === s.config.scenario)?.label ?? s.config.scenario;
      const result: PinnedResult = {
        id: s.pinned.length + 1,
        label: scenarioLabel,
        speed: s.metrics.meanSpeed * 3.6,
        flow: s.metrics.flow,
        queue: s.metrics.queue,
        travelTime: s.metrics.meanTravelTime,
      };
      return { pinned: [...s.pinned, result] };
    }),
  clearPinned: () => set({ pinned: [] }),
  applySetup: ({ idm, mobil, config }) => set({ idm, mobil, config }),
}));
