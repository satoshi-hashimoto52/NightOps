import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { getCodexStats } from "../utils/codexLog";
import { getSystemUsage } from "../utils/system";
import { calculateUsage, formatResetDateTime } from "../utils/codexLimits";

function getRemainingTone(value) {
  if (value >= 80) {
    return "ok";
  }
  if (value >= 50) {
    return "caution";
  }
  if (value >= 30) {
    return "warn";
  }
  return "danger";
}

function Metric({
  value,
  meta = "",
  subMeta = "",
  tone = "default",
  barValue = null,
  barClassName = "",
  plain = false
}) {
  return (
    <div className={`metric metric-${tone} ${plain ? "metric-plain" : ""} ${typeof barValue === "number" ? "metric-with-bar" : ""}`}>
      <div className="metric-content">
        <strong className="metric-value">{value}</strong>
        {meta ? <span className="metric-meta">{meta}</span> : null}
        {subMeta ? <span className="metric-submeta">{subMeta}</span> : null}
      </div>
      {typeof barValue === "number" ? (
        <div className="metric-bar" aria-hidden="true">
          <div
            className={`metric-bar-fill ${barClassName}`}
            style={{ width: `${Math.max(0, Math.min(100, barValue))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function TokMetric({ value, subMeta = "" }) {
  return (
    <div className="metric metric-plain metric-tok">
      <div className="metric-tok-content">
        <div className="metric-tok-main">
          <span className="metric-tok-label">TOK :</span>
          <strong className="metric-tok-number">{value}</strong>
        </div>
        <div className="metric-tok-submeta">{subMeta}</div>
      </div>
    </div>
  );
}

export default function TopBar({
  codexModels,
  usageModel,
  weeklyDivisor,
  limit5hDivisor,
  limit5hBaselineTokenEstimate,
  weeklyBaselineTokenEstimate,
  limit5hNextResetAt,
  weeklyNextResetAt
}) {
  const [system, setSystem] = useState({
    cpuName: "",
    cpu: 0,
    memoryUsedGb: 0,
    memoryTotalGb: 0,
    memoryPercent: 0
  });
  const [history, setHistory] = useState([]);
  const [codex, setCodex] = useState({
    requestCount: 0,
    sessionCount: 0,
    tokenEstimate: 0,
    tokenEstimate5h: 0,
    tokenEstimateWeek: 0,
    previousTokenEstimate: 0
  });

  const usage = calculateUsage({
    weeklyBaselineTokenEstimate,
    limit5hBaselineTokenEstimate,
    weeklyUsedTokenEstimate: codex.tokenEstimateWeek,
    limit5hUsedTokenEstimate: codex.tokenEstimate5h
  });

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [nextSystem, nextCodex] = await Promise.all([getSystemUsage(), getCodexStats()]);
        if (!cancelled) {
          setSystem(nextSystem);
          setCodex({
            requestCount: Number(nextCodex.requestCount) || 0,
            sessionCount: Number(nextCodex.sessionCount) || 0,
            tokenEstimate: Number(nextCodex.tokenEstimate) || 0,
            tokenEstimate5h: Number(nextCodex.tokenEstimate5h) || 0,
            tokenEstimateWeek: Number(nextCodex.tokenEstimateWeek) || 0,
            previousTokenEstimate: Number(nextCodex.previousTokenEstimate) || 0
          });
          setHistory((prev) =>
            [...prev, { cpu: nextSystem.cpu || 0, mem: nextSystem.memoryPercent || 0 }].slice(-30)
          );
        }
      } catch {
        if (!cancelled) {
          setSystem({
            cpuName: "",
            cpu: 0,
            memoryUsedGb: 0,
            memoryTotalGb: 0,
            memoryPercent: 0
          });
          setCodex({
            requestCount: 0,
            sessionCount: 0,
            tokenEstimate: 0,
            tokenEstimate5h: 0,
            tokenEstimateWeek: 0,
            previousTokenEstimate: 0
          });
          setHistory((prev) => [...prev, { cpu: 0, mem: 0 }].slice(-30));
        }
      }
    }

    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-group topbar-group-monitor">
        <div className="topbar-group-header">
          <span className="topbar-title">Monitor</span>
        </div>
        <div className="topbar-group-metrics topbar-group-metrics-compact topbar-group-metrics-monitor">
          <Metric
            plain
            value={`CPU : ${`${system.cpu}%`.padStart(7, " ")}`}
            meta={system.cpuName}
            tone={system.cpu > 80 ? "warn" : "ok"}
          />
          <Metric
            plain
            value={`MEM : ${`${system.memoryPercent}%`.padStart(7, " ")}`}
            meta={`${system.memoryUsedGb} / ${system.memoryTotalGb} GB`}
            tone={system.memoryPercent > 80 ? "danger" : "default"}
          />
        </div>
        <div className="topbar-inline-graph">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <YAxis hide domain={[0, 100]} />
              <CartesianGrid
                vertical={false}
                horizontal
                stroke="rgba(230, 233, 238, 0.12)"
                strokeDasharray="2 3"
                horizontalPoints={[0, 14, 28, 42, 56]}
              />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="#00d4ff"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="mem"
                stroke="#7cff00"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="topbar-group topbar-group-codex">
        <div className="topbar-group-header">
          <span className="topbar-title">Codex</span>
        </div>
        <div className="topbar-group-metrics topbar-group-metrics-codex-grid">
          <Metric plain value={`REQ : ${String(codex.requestCount).padStart(7, " ")}`} />
          <Metric
            plain
            value={`5H  : ${`${Math.round(usage.limit5hRemaining)}%`.padStart(7, " ")}`}
            meta={limit5hNextResetAt ? `next ${formatResetDateTime(new Date(limit5hNextResetAt))}` : ""}
            tone={getRemainingTone(usage.limit5hRemaining)}
          />
          <TokMetric
            value={codex.tokenEstimate.toLocaleString().padStart(7, " ")}
            subMeta={Number(codex.previousTokenEstimate || 0).toLocaleString()}
          />
          <Metric
            plain
            value={`WEEK : ${`${Math.round(usage.weeklyRemaining)}%`.padStart(5, " ")}`}
            meta={weeklyNextResetAt ? `next ${formatResetDateTime(new Date(weeklyNextResetAt))}` : ""}
            tone={getRemainingTone(usage.weeklyRemaining)}
          />
        </div>
      </div>
    </header>
  );
}
