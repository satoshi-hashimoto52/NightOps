import { useEffect, useRef } from "react";

const MAX_PANES = 3;
const MIN_RIGHT_WIDTH = 220;
const MIN_BOTTOM_HEIGHT = 180;
const MIN_PANE_SIZE = 0.35;
const DIVIDER_SIZE = 6;
const MAX_LOG_LINES = 1000;

function clampDockSize(dock, nextSize) {
  const numericSize = Number(nextSize) || 0;
  const minSize = dock === "right" ? MIN_RIGHT_WIDTH : MIN_BOTTOM_HEIGHT;
  const viewportLimit =
    dock === "right"
      ? Math.max(minSize, Math.floor((window.innerWidth || 0) * 0.55))
      : Math.max(minSize, Math.floor((window.innerHeight || 0) * 0.45));
  return Math.max(minSize, Math.min(numericSize, viewportLimit));
}

function formatLogTime(timestamp) {
  return new Date(Number(timestamp) || Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function normalizePaneSizes(panes, paneSizes) {
  const nextSizes = Array.isArray(paneSizes) ? paneSizes.slice(0, panes.length) : [];
  while (nextSizes.length < panes.length) {
    nextSizes.push(1);
  }
  return nextSizes.length > 0 ? nextSizes : [1];
}

function buildPaneGridTemplate(paneSizes) {
  const parts = [];
  paneSizes.forEach((size, index) => {
    parts.push(`minmax(0, ${size}fr)`);
    if (index < paneSizes.length - 1) {
      parts.push(`${DIVIDER_SIZE}px`);
    }
  });
  return parts.join(" ");
}

export default function TerminalDock({
  layout,
  onChangeLayout,
  rootPath,
  onClearPaneLogs,
  onChangePaneInput,
  onRunCommand
}) {
  const resizeStateRef = useRef(null);
  const paneResizeStateRef = useRef(null);
  const paneBodyRefs = useRef(new Map());

  useEffect(() => {
    return () => {
      const activeResize = resizeStateRef.current;
      if (activeResize?.handleMove) {
        window.removeEventListener("pointermove", activeResize.handleMove);
      }
      if (activeResize?.handleUp) {
        window.removeEventListener("pointerup", activeResize.handleUp);
      }
      const activePaneResize = paneResizeStateRef.current;
      if (activePaneResize?.handleMove) {
        window.removeEventListener("pointermove", activePaneResize.handleMove);
      }
      if (activePaneResize?.handleUp) {
        window.removeEventListener("pointerup", activePaneResize.handleUp);
      }
      resizeStateRef.current = null;
      paneResizeStateRef.current = null;
    };
  }, []);

  const panes = Array.isArray(layout.panes) ? layout.panes : [];
  const paneSizes = normalizePaneSizes(panes, layout.paneSizes);
  const activePaneId = layout.activePaneId || panes[0]?.id || "";
  const activePane = panes.find((pane) => pane.id === activePaneId) || panes[0] || null;
  const dockClassName = layout.dock === "bottom" ? "bottom" : "right";
  const paneLogSignature = panes.map((pane) => `${pane.id}:${(pane.logs || pane.entries || []).length}`).join("|");
  const nextSizeStyle =
    dockClassName === "right"
      ? { width: `clamp(${MIN_RIGHT_WIDTH}px, ${layout.size || MIN_RIGHT_WIDTH}px, 55vw)` }
      : { height: `clamp(${MIN_BOTTOM_HEIGHT}px, ${layout.size || MIN_BOTTOM_HEIGHT}px, 45vh)` };

  function updateLayout(updater) {
    onChangeLayout((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function setDock(nextDock) {
    updateLayout((current) => ({
      ...current,
      dock: nextDock,
      size: clampDockSize(nextDock, current.size)
    }));
  }

  function addPane() {
    updateLayout((current) => {
      const currentPanes = Array.isArray(current.panes) ? current.panes : [];
      const currentPaneSizes = normalizePaneSizes(currentPanes, current.paneSizes);
      if (currentPanes.length >= MAX_PANES) {
        return current;
      }

      const nextIndex = currentPanes.length + 1;
      const nextPane = {
        id: `term-${Date.now()}-${nextIndex}`,
        title: `Log ${nextIndex}`,
        logs: [
          {
            id: `boot-${Date.now()}`,
            level: "info",
            message: "Log pane ready",
            timestamp: Date.now()
          }
        ],
        inputValue: "",
        running: false
      };

      return {
        ...current,
        visible: true,
        panes: [...currentPanes, nextPane],
        activePaneId: nextPane.id,
        paneSizes: [...currentPaneSizes, 1]
      };
    });
  }

  function removePane(paneId) {
    updateLayout((current) => {
      const currentPanes = Array.isArray(current.panes) ? current.panes : [];
      const currentPaneSizes = normalizePaneSizes(currentPanes, current.paneSizes);
      if (currentPanes.length <= 1) {
        return {
          ...current,
          visible: false,
          paneSizes: [1]
        };
      }

      const removeIndex = currentPanes.findIndex((pane) => pane.id === paneId);
      const nextPanes = currentPanes.filter((pane) => pane.id !== paneId);
      const nextPaneSizes = currentPaneSizes.filter((_, index) => index !== removeIndex);
      const nextActivePaneId =
        current.activePaneId === paneId ? nextPanes[0]?.id || "" : current.activePaneId;

      return {
        ...current,
        panes: nextPanes,
        activePaneId: nextActivePaneId || nextPanes[0]?.id || "",
        paneSizes: nextPaneSizes.length > 0 ? nextPaneSizes : [1]
      };
    });
  }

  function selectPane(paneId) {
    updateLayout((current) => ({
      ...current,
      activePaneId: paneId
    }));
  }

  function startResize(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startDock = layout.dock;
    const startSize = Number(layout.size) || (startDock === "right" ? MIN_RIGHT_WIDTH : MIN_BOTTOM_HEIGHT);
    const startX = event.clientX;
    const startY = event.clientY;

    const handleMove = (moveEvent) => {
      const delta = startDock === "right" ? moveEvent.clientX - startX : moveEvent.clientY - startY;
      const nextSize = clampDockSize(startDock, startSize - delta);
      onChangeLayout((current) => ({
        ...current,
        size: nextSize
      }));
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      resizeStateRef.current = null;
    };

    resizeStateRef.current = { startDock, startSize, startX, startY, handleMove, handleUp };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function handlePaneResizeStart(event, dividerIndex) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const gridElement = event.currentTarget.parentElement;
    if (!gridElement) {
      return;
    }

    const startDock = layout.dock;
    const startPaneSizes = normalizePaneSizes(panes, layout.paneSizes);
    const containerRect = gridElement.getBoundingClientRect();
    const startPosition = startDock === "right" ? event.clientY : event.clientX;
    const totalSize = startPaneSizes.reduce((sum, size) => sum + size, 0);

    const handleMove = (moveEvent) => {
      const currentPosition = startDock === "right" ? moveEvent.clientY : moveEvent.clientX;
      const delta = currentPosition - startPosition;
      const containerLength = startDock === "right" ? containerRect.height : containerRect.width;
      if (!(containerLength > 0)) {
        return;
      }

      const deltaRatio = (delta / containerLength) * totalSize;
      const maxIncrease = startPaneSizes[dividerIndex + 1] - MIN_PANE_SIZE;
      const maxDecrease = startPaneSizes[dividerIndex] - MIN_PANE_SIZE;
      const clampedDelta = Math.max(-maxDecrease, Math.min(deltaRatio, maxIncrease));

      const nextPaneSizes = [...startPaneSizes];
      nextPaneSizes[dividerIndex] = startPaneSizes[dividerIndex] + clampedDelta;
      nextPaneSizes[dividerIndex + 1] = startPaneSizes[dividerIndex + 1] - clampedDelta;

      onChangeLayout((current) => ({
        ...current,
        paneSizes: nextPaneSizes
      }));
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      paneResizeStateRef.current = null;
    };

    paneResizeStateRef.current = {
      startDock,
      dividerIndex,
      startPaneSizes,
      containerRect,
      startPosition,
      totalSize,
      handleMove,
      handleUp
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  useEffect(() => {
    panes.forEach((pane) => {
      const body = paneBodyRefs.current.get(pane.id);
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    });
  }, [paneLogSignature, dockClassName]);

  const paneGridStyle =
    dockClassName === "right"
      ? { gridTemplateRows: buildPaneGridTemplate(paneSizes) }
      : { gridTemplateColumns: buildPaneGridTemplate(paneSizes) };

  const paneChildren = [];
  panes.forEach((pane, index) => {
    const isActive = pane.id === activePaneId;
    const isRunning = Boolean(pane.running);
    const paneLogs = Array.isArray(pane.logs)
      ? pane.logs
      : Array.isArray(pane.entries)
        ? pane.entries.map((message, messageIndex) => ({
            id: `${pane.id}-legacy-${messageIndex}`,
            level: "info",
            message,
            timestamp: Date.now()
          }))
        : [];
    paneChildren.push(
      <article
        key={pane.id}
        className={`terminal-pane ${isActive ? "active" : ""} ${isRunning ? "running" : ""}`}
        onClick={() => selectPane(pane.id)}
      >
        <div className="terminal-pane-header">
          <span className="terminal-pane-title">{pane.title}</span>
          <button
            type="button"
            className="terminal-pane-close"
            onClick={(event) => {
              event.stopPropagation();
              removePane(pane.id);
            }}
          >
            ×
          </button>
        </div>
        <div
          className="terminal-pane-body terminal-pane-content"
          ref={(element) => {
            if (element) {
              paneBodyRefs.current.set(pane.id, element);
              return;
            }
            paneBodyRefs.current.delete(pane.id);
          }}
        >
          <div className="terminal-pane-log">
            {paneLogs.length > 0 ? (
              paneLogs.map((log) => (
                <div key={log.id} className={`terminal-log-line terminal-log-${log.level || "info"}`}>
                  <span className="terminal-log-time">{formatLogTime(log.timestamp)}</span>
                  <span className="terminal-log-level">{String(log.level || "info").toUpperCase()}</span>
                  <span className="terminal-log-message">{log.message}</span>
                </div>
              ))
            ) : (
              <div className="terminal-pane-empty">No logs.</div>
            )}
          </div>
          <div className="terminal-pane-prompt">
            <span className="terminal-pane-prompt-symbol">❯</span>
            <span className="terminal-pane-prompt-path">{rootPath || "~"}</span>
          </div>
          <form
            className="terminal-command-form"
            onSubmit={(event) => {
              event.preventDefault();
              onRunCommand?.(pane.id);
            }}
          >
            <span className="terminal-command-prompt">❯</span>
            <input
              className="terminal-command-input"
              type="text"
              value={pane.inputValue || ""}
              placeholder={isRunning ? "Running..." : "Type a command"}
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              disabled={isRunning}
              onChange={(event) => onChangePaneInput?.(pane.id, event.target.value)}
            />
          </form>
          {activePane?.id === pane.id ? <div className="terminal-pane-active-marker">ACTIVE</div> : null}
        </div>
      </article>
    );

    if (index < panes.length - 1) {
      paneChildren.push(
        <div
          key={`divider-${pane.id}`}
          className={`terminal-pane-divider ${dockClassName === "right" ? "horizontal" : "vertical"}`}
          onPointerDown={(event) => handlePaneResizeStart(event, index)}
          role="separator"
          aria-orientation={dockClassName === "right" ? "horizontal" : "vertical"}
          aria-label="Resize terminal pane"
        />
      );
    }
  });

  if (!layout?.visible) {
    return null;
  }

  return (
    <section className={`terminal-dock terminal-dock-${dockClassName}`} style={nextSizeStyle}>
      <header className="terminal-dock-header">
        <span className="terminal-dock-title">TERMINAL</span>
        <div className="terminal-dock-toolbar">
          <button
            type="button"
            className="terminal-dock-toggle"
            onClick={() => setDock(layout.dock === "right" ? "bottom" : "right")}
            aria-label={`Switch terminal dock to ${layout.dock === "right" ? "bottom" : "right"}`}
          >
            {layout.dock === "right" ? "Dock: Right" : "Dock: Bottom"}
          </button>
          <button type="button" className="terminal-dock-action" onClick={addPane}>
            +
          </button>
          <button type="button" className="terminal-dock-action" onClick={() => onClearPaneLogs?.(layout.activePaneId)}>
            Clear
          </button>
          <button type="button" className="terminal-dock-action terminal-dock-close" onClick={() => onChangeLayout((current) => ({ ...current, visible: false }))}>
            ×
          </button>
        </div>
      </header>
      <div className={`terminal-dock-body ${dockClassName}`} style={paneGridStyle}>
        {paneChildren}
      </div>
      <div
        className={`terminal-dock-resizer terminal-resizer-${dockClassName}`}
        role="separator"
        aria-orientation={dockClassName === "right" ? "vertical" : "horizontal"}
        aria-label="Resize terminal dock"
        onPointerDown={startResize}
      />
    </section>
  );
}
