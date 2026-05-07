import { useEffect, useState } from "react";
import { launchCodex } from "../utils/fileLoader";

export default function LaunchPanel({
  initialDirectory,
  initialModel,
  models,
  onClose,
  onLaunchModelChange,
  onLaunched
}) {
  const [directoryPath, setDirectoryPath] = useState(initialDirectory || "");
  const [model, setModel] = useState(initialModel || models[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const commandPreview = `cd "${directoryPath || ""}"\ncodex -m "${model}"`;

  useEffect(() => {
    setDirectoryPath(initialDirectory || "");
  }, [initialDirectory]);

  useEffect(() => {
    setModel(initialModel || models[0]?.id || "");
  }, [initialModel, models]);

  async function submitLaunch() {
    try {
      setSubmitting(true);
      setError("");
      await launchCodex({ directoryPath, model, promptTemplate: "" });
      onLaunched();
    } catch (launchError) {
      setError(launchError?.message || "Launch failed");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    function handleLaunchSubmit() {
      if (!submitting && directoryPath) {
        submitLaunch();
      }
    }

    window.addEventListener("nightops:launch-submit", handleLaunchSubmit);
    return () => window.removeEventListener("nightops:launch-submit", handleLaunchSubmit);
  }, [submitting, directoryPath, model]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="launch-panel" onClick={(event) => event.stopPropagation()}>
        <div className="launch-header">
          <h2>Launch Codex</h2>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="field">
          <span>Directory Path</span>
          <input value={directoryPath} onChange={(event) => setDirectoryPath(event.target.value)} />
        </label>
        <label className="field">
          <span>Model</span>
          <select
            value={model}
            onChange={(event) => {
              setModel(event.target.value);
              if (onLaunchModelChange) {
                onLaunchModelChange(event.target.value);
              }
            }}
          >
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Command Preview</span>
          <pre className="launch-command-preview">{commandPreview}</pre>
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <button
          className="launch-button launch-button-wide"
          disabled={submitting || !directoryPath}
          onClick={submitLaunch}
        >
          {submitting ? "Launching..." : "Open Terminal"}
        </button>
      </div>
    </div>
  );
}
