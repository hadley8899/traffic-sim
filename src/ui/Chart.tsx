import "uplot/dist/uPlot.min.css";
import uPlot from "uplot";
import { useEffect, useRef } from "react";
import { useStore } from "./store";

export const SPEED_COLOR = "#3ad17a";
export const FLOW_COLOR = "#4b8dff";
const HEIGHT = 150;

/**
 * Live time-series of mean speed (km/h) and throughput (veh/h) on dual axes.
 * uPlot is imperative — created once, fed new data via setData when the rolling
 * history snapshot in the store changes.
 */
export function Chart() {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const history = useStore((s) => s.history);

  useEffect(() => {
    const host = hostRef.current!;
    const axis = (scale: string, stroke: string, side: 1 | 3): uPlot.Axis => ({
      scale,
      stroke,
      side,
      grid: { show: false },
      ticks: { stroke: "#272d39" },
      font: "10px sans-serif",
    });
    const opts: uPlot.Options = {
      width: host.clientWidth || 480,
      height: HEIGHT,
      padding: [10, 6, 0, 6],
      legend: { show: false },
      cursor: { show: false },
      scales: {
        x: { time: false },
        speed: { range: [0, 120] },
        flow: { range: [0, 2500] },
      },
      axes: [
        { stroke: "#8b94a7", grid: { stroke: "#272d3955", width: 1 }, ticks: { stroke: "#272d39" }, font: "10px sans-serif" },
        axis("speed", SPEED_COLOR, 3),
        axis("flow", FLOW_COLOR, 1),
      ],
      series: [
        {},
        { label: "Speed", scale: "speed", stroke: SPEED_COLOR, width: 2, points: { show: false } },
        { label: "Flow", scale: "flow", stroke: FLOW_COLOR, width: 2, points: { show: false } },
      ],
    };
    const plot = new uPlot(opts, [[], [], []], host);
    plotRef.current = plot;
    const ro = new ResizeObserver(() => plot.setSize({ width: host.clientWidth, height: HEIGHT }));
    ro.observe(host);
    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (history && plotRef.current) {
      plotRef.current.setData([history.t, history.speed, history.flow]);
    }
  }, [history]);

  return <div ref={hostRef} className="chart" />;
}
