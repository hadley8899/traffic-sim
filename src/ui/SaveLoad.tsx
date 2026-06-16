import { useState } from "react";
import { useStore, type Setup } from "./store";

/**
 * Export/import the current tunable setup as JSON. "Copy current" serialises
 * the live config + driver params (and copies to the clipboard); "Load" applies
 * a pasted setup, which the engine picks up via the store subscription.
 */
export function SaveLoad() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  const copy = () => {
    const { idm, mobil, config } = useStore.getState();
    const json = JSON.stringify({ idm, mobil, config } satisfies Setup, null, 2);
    setText(json);
    navigator.clipboard?.writeText(json).then(
      () => setMsg("Copied to clipboard"),
      () => setMsg("Copied to the box below"),
    );
  };

  const load = () => {
    try {
      const parsed = JSON.parse(text) as Setup;
      if (!parsed.config || !parsed.idm || !parsed.mobil) throw new Error("missing fields");
      useStore.getState().applySetup(parsed);
      setMsg("Loaded");
    } catch {
      setMsg("Invalid setup JSON");
    }
  };

  return (
    <section>
      <h2>Save / load</h2>
      <div className="row">
        <button onClick={copy}>Copy current</button>
        <button onClick={load}>Load</button>
      </div>
      <textarea
        className="setup-json"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a saved setup here, then Load"
        spellCheck={false}
      />
      {msg && <p className="setup-msg">{msg}</p>}
    </section>
  );
}
