import { SCENARIOS } from "../sim/scenarios";
import { SaveLoad } from "./SaveLoad";
import { useStore } from "./store";

/** A "?" icon revealing an explanation on hover/focus. */
function Help({ text }: { text: string }) {
  return (
    <span className="help" tabIndex={0} role="note">
      ?<span className="tip">{text}</span>
    </span>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  help?: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, unit, help, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-label">
        <span className="label-text">
          {label}
          {help && <Help text={help} />}
        </span>
        <span className="slider-value">
          {value}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

const SPEEDS = [0.5, 1, 2, 4, 8, 16];

export function Controls() {
  const {
    idm,
    mobil,
    config,
    speed,
    playing,
    setIdm,
    setMobil,
    setConfig,
    setSpeed,
    togglePlaying,
  } = useStore();

  return (
    <div className="panel">
      <h1>Traffic Sim</h1>
      <p className="subtitle">M3 · road network · IDM + MOBIL + gap acceptance</p>

      <div className="row">
        <button className="primary" onClick={togglePlaying}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div className="speeds">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={s === speed ? "speed active" : "speed"}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <section>
        <h2>Scenario</h2>
        <div className="speeds">
          {SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              className={sc.id === config.scenario ? "speed active" : "speed"}
              onClick={() => setConfig({ scenario: sc.id })}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </section>

      {config.scenario === "ring" && (
        <section>
          <h2>Ring</h2>
          <Slider label="Lanes" value={config.lanes} min={1} max={4} step={1} help="Number of concentric lanes. With 2+, faster cars overtake slower ones (MOBIL). Restarts the sim." onChange={(lanes) => setConfig({ lanes })} />
          <Slider label="Vehicles" value={config.vehicleCount} min={1} max={300} step={1} help="How many cars are placed on the loop. More cars → higher density → jams form sooner. Restarts the sim." onChange={(vehicleCount) => setConfig({ vehicleCount })} />
          <Slider label="Road length" value={config.roadLength} min={200} max={2000} step={50} unit="m" help="Circumference of the ring. Longer road at the same car count = lower density. Restarts the sim." onChange={(roadLength) => setConfig({ roadLength })} />
        </section>
      )}

      {config.scenario === "merge" && (
        <section>
          <h2>Merge</h2>
          <Slider label="Major inflow" value={config.majorRate} min={0} max={2000} step={50} unit="veh/h" help="Cars per hour on the main road. Raise it and the side road struggles to find gaps and backs up. Applies live." onChange={(majorRate) => setConfig({ majorRate })} />
          <Slider label="Minor inflow" value={config.minorRate} min={0} max={1500} step={50} unit="veh/h" help="Cars per hour on the merging side road. Applies live." onChange={(minorRate) => setConfig({ minorRate })} />
          <Slider label="Critical gap" value={config.criticalGap} min={1} max={6} step={0.5} unit="s" help="Smallest time gap in the major flow a side-road car will accept to merge. Lower = pushier, more aggressive merging. Applies live." onChange={(criticalGap) => setConfig({ criticalGap })} />
        </section>
      )}

      {config.scenario === "signal" && (
        <section>
          <h2>Signalised cross</h2>
          <Slider label="Inflow / arm" value={config.armRate} min={0} max={1500} step={50} unit="veh/h" help="Cars per hour entering on each of the four arms. Applies live." onChange={(armRate) => setConfig({ armRate })} />
          <Slider label="Green time" value={config.greenTime} min={3} max={30} step={1} unit="s" help="Seconds each axis stays green. Short = more switching overhead; long = the cross street waits longer. Applies live." onChange={(greenTime) => setConfig({ greenTime })} />
        </section>
      )}

      {config.scenario === "roundabout" && (
        <section>
          <h2>Roundabout</h2>
          <Slider label="Inflow / arm" value={config.armRate} min={0} max={1500} step={50} unit="veh/h" help="Cars per hour entering on each of the four arms. Push it up to lock the circle. Applies live." onChange={(armRate) => setConfig({ armRate })} />
          <Slider label="Critical gap" value={config.criticalGap} min={1} max={6} step={0.5} unit="s" help="Smallest time gap in circulating traffic an entering car will accept. Lower = cars nose in more readily. Applies live." onChange={(criticalGap) => setConfig({ criticalGap })} />
        </section>
      )}

      <section>
        <h2>Drivers</h2>
        <Slider
          label="Driver variation"
          value={config.speedVariation}
          min={0}
          max={0.4}
          step={0.01}
          help="Spread in preferred speed between drivers. 0 = identical robots; higher = a mix of fast and slow drivers. Applies to newly-spawned cars."
          onChange={(speedVariation) => setConfig({ speedVariation })}
        />
      </section>

      <section>
        <h2>Driver model (IDM)</h2>
        <Slider
          label="Desired speed"
          value={idm.v0}
          min={5}
          max={45}
          step={1}
          unit="m/s"
          help="The speed drivers aim for on open road (30 m/s ≈ 108 km/h). The clearest slider to test — drop it and watch everyone slow down. Applies live."
          onChange={(v0) => setIdm({ v0 })}
        />
        <Slider
          label="Time headway"
          value={idm.T}
          min={0.5}
          max={3}
          step={0.1}
          unit="s"
          help="Target time gap to the car ahead. Bigger = more cautious, longer following distances, lower capacity. Applies live."
          onChange={(T) => setIdm({ T })}
        />
        <Slider
          label="Max accel"
          value={idm.a}
          min={0.3}
          max={3}
          step={0.1}
          unit="m/s²"
          help="How hard cars accelerate. Higher = quicker getaways from a stop or a green light. Applies live."
          onChange={(a) => setIdm({ a })}
        />
        <Slider
          label="Comfort brake"
          value={idm.b}
          min={0.5}
          max={4}
          step={0.1}
          unit="m/s²"
          help="Comfortable deceleration. Lower = drivers brake earlier and gentler; higher = later, sharper braking. Applies live."
          onChange={(b) => setIdm({ b })}
        />
        <Slider
          label="Min gap"
          value={idm.s0}
          min={1}
          max={6}
          step={0.5}
          unit="m"
          help="Bumper-to-bumper distance kept when stopped. This is the visible gap between queued cars. Applies live."
          onChange={(s0) => setIdm({ s0 })}
        />
      </section>

      {config.scenario === "ring" && config.lanes > 1 && (
        <section>
          <h2>Lane changing (MOBIL)</h2>
          <Slider
            label="Politeness"
            value={mobil.politeness}
            min={0}
            max={1}
            step={0.05}
            help="How much a driver weighs the inconvenience caused to others before changing lanes. 0 = selfish; 1 = very considerate. Applies live."
            onChange={(politeness) => setMobil({ politeness })}
          />
          <Slider
            label="Change threshold"
            value={mobil.threshold}
            min={0}
            max={1}
            step={0.05}
            unit="m/s²"
            help="Minimum advantage a driver needs before bothering to switch lanes. Higher = fewer, lazier lane changes. Applies live."
            onChange={(threshold) => setMobil({ threshold })}
          />
          <Slider
            label="Safe braking"
            value={mobil.bSafe}
            min={1}
            max={8}
            step={0.5}
            unit="m/s²"
            help="Hardest braking a lane change may force on the car behind. Lower = only very safe merges allowed. Applies live."
            onChange={(bSafe) => setMobil({ bSafe })}
          />
        </section>
      )}

      <SaveLoad />

      <p className="hint">{HINTS[config.scenario]}</p>
    </div>
  );
}

const HINTS: Record<string, string> = {
  merge:
    "Tip: minor-road cars wait for a gap in the major flow. Raise major inflow until the side road backs up; lower the critical gap for pushier merges.",
  signal:
    "Tip: each axis gets green in turn. Short green times raise switching overhead; long ones starve the cross street. Watch queues build and discharge.",
  roundabout:
    "Tip: entering cars yield to circulating traffic. Push the per-arm inflow until the circle locks up — the classic roundabout failure mode.",
  ring: "Tip: with 2+ lanes, faster drivers (driver variation up) overtake via MOBIL. Raise vehicle count until lanes saturate and jams form.",
};
