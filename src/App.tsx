import { useEffect, useRef, useState } from "react";
import { Engine } from "./app/Engine";
import { useStore } from "./ui/store";
import { Controls } from "./ui/Controls";
import { Stats } from "./ui/Stats";
import { ChartPanel } from "./ui/ChartPanel";

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Mount the engine once against the canvas host.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const engine = new Engine();
    engineRef.current = engine;
    engine.onMetrics = (m) => useStore.getState().setMetrics(m);
    engine.onHistory = (h) => useStore.getState().setHistory(h);

    let disposed = false;
    engine
      .mount(host)
      .then(() => {
        // If the component unmounted while init was in flight, tear down now.
        if (disposed) engine.destroy();
      })
      // Surface init failures loudly — a rejected mount otherwise leaves a
      // blank canvas with no error (the renderer never starts its loop).
      .catch((err) => console.error("Engine mount failed:", err));

    return () => {
      disposed = true;
      engineRef.current = null;
      // Only destroy synchronously if init already finished; otherwise the
      // .then above handles it once the async mount resolves.
      if (engine.mounted) engine.destroy();
    };
  }, []);

  // Push UI state changes into the engine.
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        const engine = engineRef.current;
        if (!engine) return;
        if (state.idm !== prev.idm) engine.setIdm(state.idm);
        if (state.mobil !== prev.mobil) engine.setMobil(state.mobil);
        if (state.config !== prev.config) engine.setConfig(state.config);
        if (state.speed !== prev.speed) engine.speed = state.speed;
        if (state.playing !== prev.playing) engine.setPlaying(state.playing);
      }),
    [],
  );

  return (
    <div className="app">
      <button
        className="sidebar-toggle"
        aria-label={sidebarOpen ? "Close controls" : "Open controls"}
        onClick={() => setSidebarOpen((o) => !o)}
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Close controls"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setSidebarOpen(false);
          }}
        />
      )}

      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}>
        <Controls />
      </aside>

      <main className="viewport">
        <div ref={hostRef} className="canvas-host" />
        <Stats />
        <ChartPanel />
      </main>
    </div>
  );
}
