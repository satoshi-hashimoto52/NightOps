import { useEffect, useState } from "react";

const BOOT_LINES = [
  "initializing modules...",
  "loading tree...",
  "connecting codex..."
];

export default function BootScreen({ onDone }) {
  const [visibleLines, setVisibleLines] = useState([BOOT_LINES[0]]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => {
        setVisibleLines((current) => (current.includes(BOOT_LINES[1]) ? current : [...current, BOOT_LINES[1]]));
      }, 180),
      window.setTimeout(() => {
        setVisibleLines((current) => (current.includes(BOOT_LINES[2]) ? current : [...current, BOOT_LINES[2]]));
      }, 380),
      window.setTimeout(() => {
        setReady(true);
      }, 620),
      window.setTimeout(() => {
        onDone?.();
      }, 820)
    ];

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [onDone]);

  return (
    <div className="boot-screen" role="status" aria-live="polite" aria-label="NightOps boot screen">
      <div className="boot-screen-panel">
        <div className="boot-screen-title">NightOps Boot</div>
        <div className="boot-screen-log">
          {visibleLines.map((line) => (
            <div key={line} className="boot-screen-line">
              <span className="boot-screen-prompt">&gt;</span>
              <span>{line}</span>
            </div>
          ))}
        </div>
        <div className="boot-screen-metrics" aria-hidden="true">
          <div className="boot-screen-metric">
            <span className="boot-screen-metric-label">[CPU]</span>
            <span className="boot-screen-meter">███░░</span>
          </div>
          <div className="boot-screen-metric">
            <span className="boot-screen-metric-label">[MEM]</span>
            <span className="boot-screen-meter">████░</span>
          </div>
        </div>
        <div className={`boot-screen-ready${ready ? " is-visible" : ""}`}>READY</div>
      </div>
    </div>
  );
}
