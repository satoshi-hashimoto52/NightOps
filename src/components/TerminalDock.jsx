import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  onTerminalSessionData,
  onTerminalSessionExit,
  killTerminalSession,
  resizeTerminalSession,
  startTerminalSession,
  writeTerminalSession
} from "../utils/system";

const MAX_PANES = 3;
const MIN_RIGHT_WIDTH = 220;
const MIN_BOTTOM_HEIGHT = 180;
const MIN_PANE_SIZE = 0.35;
const DIVIDER_SIZE = 6;
const MAX_LOG_LINES = 1000;

function normalizeTerminalFontSize(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.max(6, Math.min(20, Math.round(parsed)));
}

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

function TerminalPane({
  pane,
  isActive,
  rootPath,
  paneCount,
  terminalFontSize,
  terminalFontFamily,
  layoutDock,
  layoutVisible,
  onSelectPane,
  onRemovePane,
  onRegisterTerminalActions,
  onRegisterPaneBody,
  onStatusChange
}) {
  const terminalHostRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const currentLineRef = useRef("");
  const isActiveRef = useRef(isActive);
  const isMountedRef = useRef(false);
  const suppressExitEventRef = useRef(false);
  const suppressExitPtyIdRef = useRef("");
  const previousRootPathRef = useRef(rootPath);
  const ptyIdRef = useRef("");
  const ptyStateRef = useRef({
    status: "starting",
    failed: false,
    errorMessage: ""
  });
  const [ptyState, setPtyState] = useState({
    status: "starting",
    failed: false,
    errorMessage: ""
  });

  function fitTerminal() {
    const host = terminalHostRef.current;
    if (!host || !fitAddonRef.current) {
      return;
    }

    const rect = host.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) {
      return;
    }

    fitAddonRef.current.fit();
    const ptyId = ptyIdRef.current;
    if (terminalRef.current && ptyId) {
      void resizeTerminalSession({
        ptyId,
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows
      });
    }
  }

  function setSessionState(status, errorMessage = "") {
    const nextState = {
      status,
      failed: status === "failed",
      errorMessage
    };
    ptyStateRef.current = nextState;
    setPtyState(nextState);
    onStatusChange?.(pane.id, status);
  }

  function clearTerminalScreen() {
    currentLineRef.current = "";
    terminalRef.current?.clear();
  }

  function writeTerminalMessage(message) {
    if (!terminalRef.current) {
      return;
    }

    terminalRef.current.write(`\r\n${message}\r\n`);
  }

  async function killCurrentSession(nextStatus = "killed", message = "[terminal] session killed", suppressExit = true) {
    const currentPtyId = ptyIdRef.current;
    if (suppressExit) {
      suppressExitPtyIdRef.current = currentPtyId;
    }

    ptyIdRef.current = "";

    if (currentPtyId) {
      try {
        await killTerminalSession({ ptyId: currentPtyId });
      } catch {
        // IPC failures are handled by the UI state below.
      }
    }

    clearTerminalScreen();
    writeTerminalMessage(message);
    setSessionState(nextStatus);
  }

  async function startCurrentSession() {
    const previousRootPath = previousRootPathRef.current;
    previousRootPathRef.current = rootPath;
    suppressExitEventRef.current = false;

    setSessionState("starting");

    const result = await startTerminalSession({
      paneId: pane.id,
      cwd: rootPath,
      cols: terminalRef.current?.cols || 80,
      rows: terminalRef.current?.rows || 24
    });

    ptyIdRef.current = result?.ptyId || "";
    setSessionState("ready");

    if (previousRootPath && previousRootPath !== rootPath) {
      writeTerminalMessage("Session restored:");
    }

    requestAnimationFrame(() => {
      fitTerminal();
      terminalRef.current?.focus();
    });

    return result;
  }

  async function restartCurrentSession() {
    const currentPtyId = ptyIdRef.current;
    if (currentPtyId) {
      suppressExitEventRef.current = true;
      ptyIdRef.current = "";
      suppressExitPtyIdRef.current = currentPtyId;
      try {
        await killTerminalSession({ ptyId: currentPtyId });
      } catch {
        // ignore and continue with restart
      }
    }

    clearTerminalScreen();
    writeTerminalMessage("[terminal] session restarting...");
    try {
      await startCurrentSession();
    } catch (error) {
      const errorMessage = error?.message || String(error);
      setSessionState("failed", errorMessage);
      writeTerminalMessage(`[terminal] failed to restart PTY: ${errorMessage}`);
    } finally {
      suppressExitEventRef.current = false;
    }
  }

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    ptyStateRef.current = ptyState;
  }, [ptyState]);

  useEffect(() => {
    if (!terminalHostRef.current || terminalRef.current) {
      return undefined;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: terminalFontFamily,
      fontSize: normalizeTerminalFontSize(terminalFontSize),
      lineHeight: 1.35,
      allowTransparency: true,
      theme: {
        background: "rgba(0, 0, 0, 0)",
        foreground: "#e5e7eb",
        cursor: "#facc15"
      }
    });
    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);
    term.open(terminalHostRef.current);

    const handleData = term.onData((data) => {
      if (!isActiveRef.current) {
        return;
      }

      const ptyId = ptyIdRef.current;
      if (!ptyId) {
        if (ptyStateRef.current.status !== "failed") {
          return;
        }

        if (data === "\r") {
          term.write("\r\n❯ ");
          currentLineRef.current = "";
          return;
        }

        if (data === "\u007f") {
          if (currentLineRef.current.length > 0) {
            currentLineRef.current = currentLineRef.current.slice(0, -1);
            term.write("\b \b");
          }
          return;
        }

        if (data === "\u0003") {
          currentLineRef.current = "";
          term.write("^C\r\n❯ ");
          return;
        }

        currentLineRef.current += data;
        term.write(data);
        return;
      }

      currentLineRef.current += data;
      void writeTerminalSession({
        ptyId,
        data
      });
    });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    onRegisterTerminalActions?.(pane.id, {
      clear: () => {
        clearTerminalScreen();
      },
      restart: () => {
        void restartCurrentSession();
      },
      kill: () => {
        void killCurrentSession();
      },
      focus: () => {
        term.focus();
      },
      write: (data) => {
        term.write(data);
      },
      resize: () => {
        const currentPtyId = ptyIdRef.current;
        if (terminalRef.current && currentPtyId) {
          void resizeTerminalSession({
            ptyId: currentPtyId,
            cols: terminalRef.current.cols,
            rows: terminalRef.current.rows
          });
        }
      }
    });

    requestAnimationFrame(() => {
      fitTerminal();
      term.focus();
    });

    return () => {
      handleData.dispose();
      onRegisterTerminalActions?.(pane.id, null);
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      currentLineRef.current = "";
    };
  }, [pane.id, onRegisterTerminalActions]);

  useEffect(() => {
    if (!terminalHostRef.current || !fitAddonRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitTerminal();
      });
    });

    observer.observe(terminalHostRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cleanup = null;
    let cancelled = false;

    async function subscribe() {
      cleanup = await onTerminalSessionData((payload) => {
        if (cancelled) {
          return;
        }

        if (!isMountedRef.current) {
          return;
        }

        if (!payload || payload.paneId !== pane.id) {
          return;
        }

        if (payload.ptyId && ptyIdRef.current && payload.ptyId !== ptyIdRef.current) {
          return;
        }

        if (typeof payload.data === "string" && payload.data.length > 0) {
          terminalRef.current?.write(payload.data);
        }
      });
    }

    subscribe();

    return () => {
      cancelled = true;
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [pane.id]);

  useEffect(() => {
    let cleanup = null;
    let cancelled = false;

    async function subscribe() {
      cleanup = await onTerminalSessionExit((payload) => {
        if (cancelled) {
          return;
        }

        if (!isMountedRef.current) {
          return;
        }

        if (suppressExitEventRef.current) {
          return;
        }

        if (payload?.ptyId && payload.ptyId === suppressExitPtyIdRef.current) {
          suppressExitPtyIdRef.current = "";
          return;
        }

        if (!payload || payload.paneId !== pane.id) {
          return;
        }

        if (payload.ptyId && ptyIdRef.current && payload.ptyId !== ptyIdRef.current) {
          return;
        }

        if (ptyIdRef.current === payload.ptyId) {
          ptyIdRef.current = "";
        }

        const exitCode = Number.isFinite(payload.exitCode) ? payload.exitCode : 0;
        const signalValue = payload.signal ?? null;
        writeTerminalMessage(`[terminal] session exited. code=${exitCode} signal=${signalValue}`);
        setSessionState("exited");
      });
    }

    subscribe();

    return () => {
      cancelled = true;
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [pane.id]);

  useEffect(() => {
    if (!rootPath) {
      return undefined;
    }

    let cancelled = false;
    isMountedRef.current = true;
    const previousRootPath = previousRootPathRef.current;
    previousRootPathRef.current = rootPath;

    if (previousRootPath && previousRootPath !== rootPath) {
      clearTerminalScreen();
      writeTerminalMessage("[terminal] workspace changed. restarting session...");
    }

    void startCurrentSession().catch((error) => {
      if (cancelled) {
        return;
      }

      ptyIdRef.current = "";
      const errorMessage = error?.message || String(error);
      setSessionState("failed", errorMessage);
      writeTerminalMessage(`[terminal] failed to start PTY: ${errorMessage}`);
    });

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      const ptyId = ptyIdRef.current;
      ptyIdRef.current = "";
      if (ptyId) {
        suppressExitEventRef.current = true;
        suppressExitPtyIdRef.current = ptyId;
        void killTerminalSession({ ptyId });
      }
    };
  }, [pane.id, rootPath]);

  useEffect(() => {
    requestAnimationFrame(() => {
      fitTerminal();
    });
  }, [layoutDock, layoutVisible, paneCount, terminalFontSize, terminalFontFamily]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) {
      return undefined;
    }

    term.options.fontSize = normalizeTerminalFontSize(terminalFontSize);
    term.options.fontFamily = terminalFontFamily;

    requestAnimationFrame(() => {
      fitTerminal();
    });
  }, [terminalFontSize, terminalFontFamily]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (isActive) {
        terminalRef.current?.focus();
      }
    });
  }, [isActive]);

  const statusLabel =
    ptyState.status === "ready"
      ? "READY"
      : ptyState.status === "starting"
        ? "STARTING"
        : ptyState.status === "exited"
          ? "EXITED"
          : ptyState.status === "killed"
            ? "KILLED"
            : ptyState.status === "failed"
              ? "FAILED"
              : String(ptyState.status || "").toUpperCase();
  const paneBodyClassName = `terminal-pane-body terminal-pane-content ${ptyState.status === "failed" ? "failed" : ""}`;

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

  return (
    <article
      key={pane.id}
      className={`terminal-pane ${isActive ? "active" : ""} ${ptyState.status}`}
      onPointerDown={() => {
        isActiveRef.current = true;
        onSelectPane(pane.id);
      }}
    >
      <div className="terminal-pane-header">
        <span className="terminal-pane-title">{pane.title}</span>
        <span className={`terminal-pane-status ${ptyState.status}`}>{statusLabel}</span>
        <button
          type="button"
          className="terminal-pane-close"
          onClick={(event) => {
            event.stopPropagation();
            onRemovePane(pane.id);
          }}
        >
          ×
        </button>
      </div>
      <div
        className={paneBodyClassName}
        ref={(element) => {
          onRegisterPaneBody?.(pane.id, element);
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
        <div
          className="terminal-xterm-host"
          ref={terminalHostRef}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelectPane(pane.id);
            requestAnimationFrame(() => {
              terminalRef.current?.focus();
            });
          }}
        />
      </div>
    </article>
  );
}

export default function TerminalDock({
  layout,
  onChangeLayout,
  rootPath,
  terminalFontSize = 12,
  terminalFontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
}) {
  const resizeStateRef = useRef(null);
  const paneResizeStateRef = useRef(null);
  const paneBodyRefs = useRef(new Map());
  const paneTerminalActionsRef = useRef(new Map());
  const [paneStatuses, setPaneStatuses] = useState({});

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

  const registerTerminalActions = useCallback((paneId, actions) => {
    if (!paneId) {
      return;
    }

    if (actions) {
      paneTerminalActionsRef.current.set(paneId, actions);
      return;
    }

    paneTerminalActionsRef.current.delete(paneId);
  }, []);

  const registerPaneBody = useCallback((paneId, element) => {
    if (!paneId) {
      return;
    }

    if (element) {
      paneBodyRefs.current.set(paneId, element);
      return;
    }

    paneBodyRefs.current.delete(paneId);
  }, []);

  const registerPaneStatus = useCallback((paneId, status) => {
    if (!paneId) {
      return;
    }

    setPaneStatuses((current) => {
      if (!status) {
        const next = { ...current };
        delete next[paneId];
        return next;
      }

      if (current[paneId] === status) {
        return current;
      }

      return {
        ...current,
        [paneId]: status
      };
    });
  }, []);

  function getActivePaneActions() {
    const targetPaneId = layout.activePaneId || panes[0]?.id;
    if (!targetPaneId) {
      return null;
    }

    return paneTerminalActionsRef.current.get(targetPaneId) || null;
  }

  function clearActivePane() {
    getActivePaneActions()?.clear?.();
  }

  function restartActivePane() {
    getActivePaneActions()?.restart?.();
  }

  function killActivePane() {
    getActivePaneActions()?.kill?.();
  }

  const activePane = panes.find((pane) => pane.id === activePaneId) || panes[0] || null;
  const activeStatus = paneStatuses[activePane?.id] || "starting";
  const showKillButton = activeStatus === "ready" || activeStatus === "starting";
  const activeActionLabel = showKillButton ? "KILL" : "RST";
  const activeActionTitle = showKillButton ? "Kill active terminal" : "Restart active terminal";
  const activeActionHandler = showKillButton ? killActivePane : restartActivePane;
  const activeActionDisabled = activeStatus === "starting" && showKillButton;
  const activeActionClassName = showKillButton
    ? "terminal-dock-action terminal-dock-button-danger"
    : "terminal-dock-action terminal-dock-button-restart";

  function addPane() {
    updateLayout((current) => {
      const currentPanes = Array.isArray(current.panes) ? current.panes : [];
      const currentPaneSizes = normalizePaneSizes(currentPanes, current.paneSizes);
      if (currentPanes.length >= MAX_PANES) {
        return current;
      }

      const paneNumber = current.nextPaneNumber || currentPanes.length + 1;
      const nextPane = {
        id: `term-${Date.now()}-${paneNumber}`,
        title: `Log ${paneNumber}`,
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
        paneSizes: [...currentPaneSizes, 1],
        nextPaneNumber: paneNumber + 1
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
    setPaneStatuses((current) => {
      if (!current[paneId]) {
        return current;
      }
      const next = { ...current };
      delete next[paneId];
      return next;
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
    paneChildren.push(
      <TerminalPane
        key={pane.id}
        pane={pane}
        isActive={isActive}
        rootPath={rootPath}
        paneCount={panes.length}
        terminalFontSize={terminalFontSize}
        terminalFontFamily={terminalFontFamily}
        layoutDock={layout.dock}
        layoutVisible={layout.visible}
        onSelectPane={selectPane}
        onRemovePane={removePane}
        onRegisterTerminalActions={registerTerminalActions}
        onRegisterPaneBody={registerPaneBody}
        onStatusChange={registerPaneStatus}
      />
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

  const isHidden = !layout.visible;
  return (
    <section
      className={`terminal-dock terminal-dock-${dockClassName} ${isHidden ? `is-hidden is-${dockClassName}` : ""}`}
      style={nextSizeStyle}
    >
      <header className="terminal-dock-header">
        <span className="terminal-dock-title">TERMINAL</span>
        <div className="terminal-dock-toolbar">
          <button
            type="button"
            className="terminal-dock-toggle"
            onClick={() => setDock(layout.dock === "right" ? "bottom" : "right")}
            aria-label={`Switch terminal dock to ${layout.dock === "right" ? "bottom" : "right"}`}
            title={`Switch terminal dock to ${layout.dock === "right" ? "bottom" : "right"}`}
          >
            {layout.dock === "right" ? "→" : "↓"}
          </button>
          {panes.length < MAX_PANES ? (
            <button type="button" className="terminal-dock-action" onClick={addPane} title="Add terminal pane">
              +
            </button>
          ) : null}
          <button type="button" className="terminal-dock-action" onClick={clearActivePane}>
            CLR
          </button>
          <button
            type="button"
            className={activeActionClassName}
            onClick={activeActionHandler}
            title={activeActionTitle}
            aria-label={activeActionTitle}
            disabled={activeActionDisabled}
          >
            {activeActionLabel}
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
