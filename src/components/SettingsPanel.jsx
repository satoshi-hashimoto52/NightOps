import { useEffect, useMemo, useRef, useState } from "react";
import { getCodexStats } from "../utils/codexLog";
import {
  DEFAULT_LIMIT5H_RESET_TIME,
  DEFAULT_WEEKLY_RESET_MONTH,
  DEFAULT_WEEKLY_RESET_DAY,
  DEFAULT_WEEKLY_RESET_TIME,
  formatResetDateTime,
  calculateUsage,
  getNextLimit5hResetAt,
  getNextWeeklyResetAt
} from "../utils/codexLimits";

const DEFAULT_MODEL_OPTIONS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2"];

const DEFAULT_MARKDOWN_HEADING_COLORS = ["#8fd3ff", "#7bdc6a", "#f5c542", "#c18cff", "#e88787", "#9dd6c4"];
function getInitialPanelPosition() {
  if (typeof window === "undefined") {
    return { x: 16, y: 16 };
  }

  const width = 920;
  const height = 820;
  return {
    x: Math.max(16, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(16, Math.round((window.innerHeight - height) / 2))
  };
}

function getInitialPanelSize() {
  if (typeof window === "undefined") {
    return { width: 560, height: 720 };
  }

  return {
    width: Math.min(560, window.innerWidth - 32),
    height: Math.min(720, window.innerHeight - 32)
  };
}

function FieldHelp({ children }) {
  return <span className="field-help">{children}</span>;
}

export default function SettingsPanel({ settings, onClose, onSave, onPreviewMarkdownHeadingColorsChange }) {
  const panelRef = useRef(null);
  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const resizeRef = useRef({ resizing: false, startX: 0, startY: 0, width: 0, height: 0 });
  const [models, setModels] = useState(settings.codexModels || []);
  const [usageModel, setUsageModel] = useState(settings.usageModel || "");
  const [selectedLaunchModel, setSelectedLaunchModel] = useState(settings.selectedLaunchModel || "");
  const [weeklyDivisor, setWeeklyDivisor] = useState(String(settings.weeklyDivisor || 750));
  const [limit5hDivisor, setLimit5hDivisor] = useState(String(settings.limit5hDivisor || 350));
  const [limit5hRemainingPercent, setLimit5hRemainingPercent] = useState(
    String(settings.limit5hRemainingPercent ?? 100)
  );
  const [weeklyRemainingPercent, setWeeklyRemainingPercent] = useState(
    String(settings.weeklyRemainingPercent ?? 100)
  );
  const [backgroundOpacity, setBackgroundOpacity] = useState(String(settings.backgroundOpacity ?? 0.32));
  const [containerOpacity, setContainerOpacity] = useState(String(settings.containerOpacity ?? 0.46));
  const [backgroundBlur, setBackgroundBlur] = useState(String(settings.backgroundBlur ?? 28));
  const [uiBackgroundBlur, setUiBackgroundBlur] = useState(String(settings.uiBackgroundBlur ?? settings.backgroundBlur ?? 28));
  const [limit5hResetTime, setLimit5hResetTime] = useState(settings.limit5hResetTime || DEFAULT_LIMIT5H_RESET_TIME);
  const [weeklyResetMonth, setWeeklyResetMonth] = useState(String(settings.weeklyResetMonth ?? DEFAULT_WEEKLY_RESET_MONTH));
  const [weeklyResetDay, setWeeklyResetDay] = useState(String(settings.weeklyResetDay ?? DEFAULT_WEEKLY_RESET_DAY));
  const [weeklyResetTime, setWeeklyResetTime] = useState(settings.weeklyResetTime || DEFAULT_WEEKLY_RESET_TIME);
  const [markdownHeadingColors, setMarkdownHeadingColors] = useState(
    Array.isArray(settings.markdownHeadingColors) && settings.markdownHeadingColors.length > 0
      ? settings.markdownHeadingColors.slice(0, 6)
      : DEFAULT_MARKDOWN_HEADING_COLORS
  );
  const [newModelId, setNewModelId] = useState("");
  const [newModelFactor, setNewModelFactor] = useState("1");
  const [error, setError] = useState("");
  const [requestCount, setRequestCount] = useState(0);
  const [tokenEstimate, setTokenEstimate] = useState(0);
  const [tokenEstimate5h, setTokenEstimate5h] = useState(0);
  const [tokenEstimateWeek, setTokenEstimateWeek] = useState(0);
  const [panelPosition, setPanelPosition] = useState(() => getInitialPanelPosition());
  const [panelSize, setPanelSize] = useState(() => getInitialPanelSize());

  const modelOptions = useMemo(
    () => Array.from(new Set([...DEFAULT_MODEL_OPTIONS, ...models.map((item) => item.id).filter(Boolean)])),
    [models]
  );
  const usageFactor = models.find((item) => item.id === usageModel)?.factor || 1;
  const weeklyBaseline = Number(settings.weeklyBaselineTokenEstimate) || 0;
  const limit5hBaseline = Number(settings.limit5hBaselineTokenEstimate) || 0;
  const usagePreview = calculateUsage({
    requestCount,
    tokenEstimate,
    weeklyBaselineTokenEstimate: weeklyBaseline,
    limit5hBaselineTokenEstimate: limit5hBaseline,
    weeklyUsedTokenEstimate: tokenEstimateWeek,
    limit5hUsedTokenEstimate: tokenEstimate5h
  });
  const next5hReset = getNextLimit5hResetAt(new Date(), limit5hResetTime);
  const nextWeeklyReset = getNextWeeklyResetAt(new Date(), weeklyResetMonth, weeklyResetDay, weeklyResetTime);

  useEffect(() => {
    setModels(settings.codexModels || []);
    setUsageModel(settings.usageModel || "");
    setSelectedLaunchModel(settings.selectedLaunchModel || "");
    setWeeklyDivisor(String(settings.weeklyDivisor || 750));
    setLimit5hDivisor(String(settings.limit5hDivisor || 350));
    setLimit5hRemainingPercent(String(settings.limit5hRemainingPercent ?? 100));
    setWeeklyRemainingPercent(String(settings.weeklyRemainingPercent ?? 100));
    setBackgroundOpacity(String(settings.backgroundOpacity ?? 0.32));
    setContainerOpacity(String(settings.containerOpacity ?? 0.46));
    setBackgroundBlur(String(settings.backgroundBlur ?? 28));
    setUiBackgroundBlur(String(settings.uiBackgroundBlur ?? settings.backgroundBlur ?? 28));
    setLimit5hResetTime(settings.limit5hResetTime || DEFAULT_LIMIT5H_RESET_TIME);
    setWeeklyResetMonth(String(settings.weeklyResetMonth ?? DEFAULT_WEEKLY_RESET_MONTH));
    setWeeklyResetDay(String(settings.weeklyResetDay ?? DEFAULT_WEEKLY_RESET_DAY));
    setWeeklyResetTime(settings.weeklyResetTime || DEFAULT_WEEKLY_RESET_TIME);
    setMarkdownHeadingColors(
      Array.isArray(settings.markdownHeadingColors) && settings.markdownHeadingColors.length > 0
        ? settings.markdownHeadingColors.slice(0, 6)
        : DEFAULT_MARKDOWN_HEADING_COLORS
    );
  }, [settings]);

  useEffect(() => {
    async function loadCodexStats() {
      try {
        const stats = await getCodexStats();
        setRequestCount(Number(stats.requestCount) || 0);
        setTokenEstimate(stats.tokenEstimate || 0);
        setTokenEstimate5h(stats.tokenEstimate5h || 0);
        setTokenEstimateWeek(stats.tokenEstimateWeek || 0);
      } catch {
        setRequestCount(0);
        setTokenEstimate(0);
        setTokenEstimate5h(0);
        setTokenEstimateWeek(0);
      }
    }

    loadCodexStats();
  }, []);

  useEffect(() => {
    setPanelPosition(getInitialPanelPosition());
  }, []);

  useEffect(() => {
    if (!newModelId || !modelOptions.includes(newModelId)) {
      setNewModelId(modelOptions[0] || "");
    }
  }, [modelOptions, newModelId]);

  function updateModel(index, patch) {
    setModels((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateUsageModelFactor(value) {
    setModels((prev) =>
      prev.map((item) =>
        item.id === usageModel ? { ...item, factor: value } : item
      )
    );
  }

  function handleApplyRemainingPercent(kind) {
    const currentUsed = kind === "limit5h" ? usagePreview.limit5hUsedTokenEstimate : usagePreview.weeklyUsedTokenEstimate;
    const targetRemaining = Number(kind === "limit5h" ? limit5hRemainingPercent : weeklyRemainingPercent);
    const baselineKey = kind === "limit5h" ? "limit5hBaselineTokenEstimate" : "weeklyBaselineTokenEstimate";
    const ratio = Math.max(0.01, 1 - Number(targetRemaining) / 100);
    const nextBaseline = currentUsed / ratio;

    if (!(Number(targetRemaining) >= 0 && Number(targetRemaining) <= 100)) {
      setError("Remaining percent must be between 0 and 100");
      return;
    }

    onSave(
      {
        ...settings,
        [baselineKey]: nextBaseline,
        limit5hBaselineTokenEstimate:
          kind === "limit5h" ? nextBaseline : Number(settings.limit5hBaselineTokenEstimate) || 0,
        weeklyBaselineTokenEstimate:
          kind === "weekly" ? nextBaseline : Number(settings.weeklyBaselineTokenEstimate) || 0
      },
      { keepOpen: true }
    );
  }

  function removeModel(index) {
    setModels((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function addModel() {
    const id = newModelId.trim();
    const factor = Number(newModelFactor);

    if (!id) {
      setError("Model name is required");
      return;
    }

    if (!(factor > 0)) {
      setError("Factor must be greater than 0");
      return;
    }

    setModels((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return [...next, { id, factor }];
    });
    setNewModelId("");
    setNewModelFactor("1");
    setError("");
  }

  function handleHeaderPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    if (event.target.closest("button, input, select, textarea")) {
      return;
    }

    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragRef.current = {
      dragging: true,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height
    };
    event.preventDefault();
  }

  function handleResizePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    resizeRef.current = {
      resizing: true,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height
    };
    event.preventDefault();
    event.stopPropagation();
  }

  async function handleSave() {
    const normalizedModels = models
      .filter((item) => item.id?.trim())
      .map((item) => ({ id: item.id.trim(), factor: Number(item.factor) > 0 ? Number(item.factor) : 1 }));

    if (normalizedModels.length === 0) {
      setError("At least one model is required");
      return;
    }

    if (!(Number(weeklyDivisor) > 0) || !(Number(limit5hDivisor) > 0)) {
      setError("Usage divisors must be greater than 0");
      return;
    }

    if (
      !(
        Number(limit5hRemainingPercent) >= 0 &&
        Number(limit5hRemainingPercent) <= 100 &&
        Number(weeklyRemainingPercent) >= 0 &&
        Number(weeklyRemainingPercent) <= 100
      )
    ) {
      setError("Remaining percent must be between 0 and 100");
      return;
    }

    const nextBackgroundOpacity = Number(backgroundOpacity);
    const nextContainerOpacity = Number(containerOpacity);
    const nextBackgroundBlur = Number(backgroundBlur);

    if (!(nextBackgroundOpacity >= 0 && nextBackgroundOpacity <= 1) || !(nextContainerOpacity >= 0 && nextContainerOpacity <= 1)) {
      setError("Opacity must be between 0 and 1");
      return;
    }

    if (!(nextBackgroundBlur >= 0 && nextBackgroundBlur <= 100)) {
      setError("Background Blur must be between 0 and 100");
      return;
    }

    const nextUiBackgroundBlur = Number(uiBackgroundBlur);

    if (!(nextUiBackgroundBlur >= 0 && nextUiBackgroundBlur <= 100)) {
      setError("UI Background Blur must be between 0 and 100");
      return;
    }

    const nextUsageModel = modelOptions.includes(usageModel) ? usageModel : normalizedModels[0].id;
    const nextLaunchModel = modelOptions.includes(selectedLaunchModel)
      ? selectedLaunchModel
      : normalizedModels[0].id;

    try {
      await onSave({
        ...settings,
        codexModels: normalizedModels,
        usageModel: nextUsageModel,
        selectedLaunchModel: nextLaunchModel,
        weeklyDivisor: Number(weeklyDivisor),
        limit5hDivisor: Number(limit5hDivisor),
        limit5hResetTime,
        weeklyResetMonth: Number(weeklyResetMonth),
        weeklyResetDay: Number(weeklyResetDay),
        weeklyResetTime,
        limit5hNextResetAt: next5hReset.toISOString(),
        weeklyNextResetAt: nextWeeklyReset.toISOString(),
        backgroundOpacity: nextBackgroundOpacity,
        containerOpacity: nextContainerOpacity,
        backgroundBlur: nextBackgroundBlur,
        uiBackgroundBlur: nextUiBackgroundBlur,
        markdownHeadingColors
      });
      setError("");
    } catch (saveError) {
      setError(saveError?.message || "Failed to save settings");
    }
  }

  useEffect(() => {
    function handlePointerMove(event) {
      if (!dragRef.current.dragging) {
        if (!resizeRef.current.resizing) {
          return;
        }
      }

      if (resizeRef.current.resizing) {
        const minWidth = 560;
        const minHeight = 720;
        const maxWidth = Math.max(minWidth, window.innerWidth - 32);
        const maxHeight = Math.max(minHeight, window.innerHeight - 32);
        const nextWidth = Math.max(
          minWidth,
          Math.min(maxWidth, resizeRef.current.width + (event.clientX - resizeRef.current.startX))
        );
        const nextHeight = Math.max(
          minHeight,
          Math.min(maxHeight, resizeRef.current.height + (event.clientY - resizeRef.current.startY))
        );
        setPanelSize({ width: nextWidth, height: nextHeight });
        return;
      }

      const { offsetX, offsetY, width, height } = dragRef.current;
      const nextX = Math.max(16, Math.min(event.clientX - offsetX, window.innerWidth - width - 16));
      const nextY = Math.max(16, Math.min(event.clientY - offsetY, window.innerHeight - height - 16));
      setPanelPosition({ x: nextX, y: nextY });
    }

    function handlePointerUp() {
      dragRef.current.dragging = false;
      resizeRef.current.resizing = false;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="launch-panel settings-panel"
        onClick={(event) => event.stopPropagation()}
        style={{
          left: `${panelPosition.x}px`,
          top: `${panelPosition.y}px`,
          width: `${panelSize.width}px`,
          height: `${panelSize.height}px`
        }}
      >
        <div className="launch-header settings-header" onPointerDown={handleHeaderPointerDown}>
          <h2>Settings</h2>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <button
          type="button"
          className="settings-resize-handle"
          aria-label="Resize settings panel"
          onPointerDown={handleResizePointerDown}
        />
        <div className="settings-panel-body">
          <section className="settings-section">
            <div className="settings-section-title">Appearance</div>
            <div className="settings-appearance-grid">
              <label className="field">
                <span>Background Opacity</span>
                <FieldHelp>全体の透過度。</FieldHelp>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={backgroundOpacity}
                  onChange={(event) => setBackgroundOpacity(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Container Opacity</span>
                <FieldHelp>パネルの透過度。</FieldHelp>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={containerOpacity}
                  onChange={(event) => setContainerOpacity(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Background Blur</span>
                <FieldHelp>外側背景のぼかし。</FieldHelp>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={backgroundBlur}
                  onChange={(event) => setBackgroundBlur(event.target.value)}
                />
              </label>
              <label className="field">
                <span>UI Background Blur</span>
                <FieldHelp>UI背面のぼかし。</FieldHelp>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={uiBackgroundBlur}
                  onChange={(event) => setUiBackgroundBlur(event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">Markdown</div>
            <div className="settings-appearance-grid settings-markdown-grid">
              {markdownHeadingColors.map((color, index) => (
                <label key={index} className="field">
                  <span>{`Markdown H${index + 1} Color`}</span>
                  <FieldHelp>{`H${index + 1}の色。`}</FieldHelp>
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => {
                      const nextColors = markdownHeadingColors.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item
                      );
                      setMarkdownHeadingColors(nextColors);
                      if (onPreviewMarkdownHeadingColorsChange) {
                        onPreviewMarkdownHeadingColorsChange(nextColors);
                      }
                    }}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">Codex Reset</div>
            <div className="settings-reset-stack">
              <label className="field">
                <span>5H Reset Time</span>
                <FieldHelp>5Hの時刻。</FieldHelp>
                <input type="time" value={limit5hResetTime} onChange={(event) => setLimit5hResetTime(event.target.value)} />
              </label>
              <div className="field settings-reset-weekly">
                <span>Weekly Reset</span>
                <FieldHelp>月・日・時刻。</FieldHelp>
                <div className="settings-reset-weekly-row">
                  <label className="settings-inline-field settings-reset-mini-field">
                    <span>Month</span>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      step="1"
                      value={weeklyResetMonth}
                      onChange={(event) => setWeeklyResetMonth(event.target.value)}
                    />
                  </label>
                  <label className="settings-inline-field settings-reset-mini-field">
                    <span>Day</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      step="1"
                      value={weeklyResetDay}
                      onChange={(event) => setWeeklyResetDay(event.target.value)}
                    />
                  </label>
                  <label className="settings-inline-field settings-reset-mini-field">
                    <span>Time</span>
                    <input type="time" value={weeklyResetTime} onChange={(event) => setWeeklyResetTime(event.target.value)} />
                  </label>
                </div>
              </div>
            </div>
            <div className="settings-usage-preview">
              <div>{`5H 次回リセット: ${formatResetDateTime(next5hReset)}`}</div>
              <div>{`Weekly 次回リセット: ${formatResetDateTime(nextWeeklyReset)}`}</div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">CODEX</div>
            <label className="field">
              <span>Launch Default Model</span>
              <FieldHelp>Launch時の既定。</FieldHelp>
              <select value={selectedLaunchModel} onChange={(event) => setSelectedLaunchModel(event.target.value)}>
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Usage Model</span>
              <FieldHelp>利用量に使うモデル。</FieldHelp>
              <div className="settings-model-row">
                <select value={usageModel} onChange={(event) => setUsageModel(event.target.value)}>
                  {models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id}
                    </option>
                  ))}
                </select>
                <input
                  value={String(usageFactor)}
                  onChange={(event) => updateUsageModelFactor(event.target.value)}
                />
              </div>
            </label>

            <div className="field">
              <span>Usage Divisors</span>
              <FieldHelp>利用量の分母。</FieldHelp>
              <div className="settings-usage-grid settings-usage-grid-inline">
                <label className="settings-inline-field">
                  <span>Weekly</span>
                  <input value={weeklyDivisor} onChange={(event) => setWeeklyDivisor(event.target.value)} />
                </label>
                <label className="settings-inline-field">
                  <span>5H</span>
                  <input value={limit5hDivisor} onChange={(event) => setLimit5hDivisor(event.target.value)} />
                </label>
              </div>
            </div>

            <div className="field">
              <span>Usage Preview</span>
              <FieldHelp>残量の確認。</FieldHelp>
              <div className="settings-usage-preview">
                <div>{`トークン: ${tokenEstimate.toLocaleString()}`}</div>
                <div>{`係数: ${usageFactor}`}</div>
                <div>{`5H: ${Math.round(usagePreview.limit5hRemaining)}%`}</div>
                <div>{`Week: ${Math.round(usagePreview.weeklyRemaining)}%`}</div>
              </div>
            </div>

            <div className="field">
              <span>Current Remaining %</span>
              <FieldHelp>表示残量。</FieldHelp>
              <div className="settings-usage-grid settings-usage-grid-inline">
                <label className="settings-inline-field">
                  <span>5H</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={limit5hRemainingPercent}
                    onChange={(event) => setLimit5hRemainingPercent(event.target.value)}
                  />
                  <button type="button" className="ghost-button" onClick={() => handleApplyRemainingPercent("limit5h")}>
                    Reflect
                  </button>
                </label>
                <label className="settings-inline-field">
                  <span>Week</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={weeklyRemainingPercent}
                    onChange={(event) => setWeeklyRemainingPercent(event.target.value)}
                  />
                  <button type="button" className="ghost-button" onClick={() => handleApplyRemainingPercent("weekly")}>
                    Reflect
                  </button>
                </label>
              </div>
            </div>

            <div className="field">
              <span>Models</span>
              <FieldHelp>1行1モデル。</FieldHelp>
              <div className="settings-model-list settings-model-list-vertical">
                {models.map((item, index) => (
                  <div key={item.id} className="settings-model-row">
                    <select value={item.id} onChange={(event) => updateModel(index, { id: event.target.value })}>
                      {modelOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <input
                      value={String(item.factor)}
                      onChange={(event) => updateModel(index, { factor: event.target.value })}
                    />
                    <button type="button" className="ghost-button" onClick={() => removeModel(index)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Add Model</span>
              <FieldHelp>モデルを追加。</FieldHelp>
              <div className="settings-model-row">
                <select value={newModelId} onChange={(event) => setNewModelId(event.target.value)}>
                  {modelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Factor"
                  value={newModelFactor}
                  onChange={(event) => setNewModelFactor(event.target.value)}
                />
                <button type="button" className="ghost-button" onClick={addModel}>
                  Add
                </button>
              </div>
            </div>
          </section>

          {error ? <div className="form-error">{error}</div> : null}

          <button className="launch-button launch-button-wide" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
