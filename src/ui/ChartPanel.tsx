import { Chart, FLOW_COLOR, SPEED_COLOR } from "./Chart";
import { useStore } from "./store";

/**
 * Bottom-docked analysis panel: live speed/flow chart, a button to pin the
 * current scenario's metrics, and a comparison table of pinned runs.
 */
export function ChartPanel() {
  const pinned = useStore((s) => s.pinned);
  const pinResult = useStore((s) => s.pinResult);
  const clearPinned = useStore((s) => s.clearPinned);

  return (
    <div className="chart-panel">
      <div className="chart-head">
        <div className="legend">
          <span className="chip" style={{ color: SPEED_COLOR }}>● Speed (km/h)</span>
          <span className="chip" style={{ color: FLOW_COLOR }}>● Flow (veh/h)</span>
        </div>
        <div className="row">
          <button onClick={pinResult}>Pin result</button>
          {pinned.length > 0 && <button onClick={clearPinned}>Clear</button>}
        </div>
      </div>

      <Chart />

      {pinned.length > 0 && (
        <table className="compare">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Speed</th>
              <th>Flow</th>
              <th>Queue</th>
              <th>Travel</th>
            </tr>
          </thead>
          <tbody>
            {pinned.map((p) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td>{p.speed.toFixed(0)} km/h</td>
                <td>{p.flow.toFixed(0)}</td>
                <td>{p.queue}</td>
                <td>{p.travelTime > 0 ? `${p.travelTime.toFixed(0)} s` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
