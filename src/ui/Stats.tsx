import { useStore } from "./store";

export function Stats() {
  const metrics = useStore((s) => s.metrics);
  if (!metrics) return null;

  const items = [
    { label: "Vehicles", value: metrics.count.toFixed(0) },
    { label: "Mean speed", value: `${(metrics.meanSpeed * 3.6).toFixed(1)} km/h` },
    { label: "Flow", value: `${metrics.flow.toFixed(0)} veh/h` },
    { label: "Queue", value: metrics.queue.toFixed(0) },
    { label: "Arrived", value: metrics.arrived.toFixed(0) },
    {
      label: "Travel",
      value: metrics.meanTravelTime > 0 ? `${metrics.meanTravelTime.toFixed(0)} s` : "—",
    },
    { label: "Sim time", value: `${metrics.time.toFixed(0)} s` },
  ];

  return (
    <div className="stats">
      {items.map((it) => (
        <div className="stat" key={it.label}>
          <span className="stat-value">{it.value}</span>
          <span className="stat-label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
