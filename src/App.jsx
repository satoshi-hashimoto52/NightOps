import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import FileTree from "./components/FileTree";
import PaneContainer from "./components/PreviewPane";
import LaunchPanel from "./components/LaunchPanel";
import SettingsPanel from "./components/SettingsPanel";
import BootScreen from "./components/BootScreen";
import { extractPathsFromEvent, handleDragOver as handleExternalDragOver } from "./utils/drop";
import { getCodexStats } from "./utils/codexLog";
import {
  getNextLimit5hResetAt,
  getNextWeeklyResetAt,
  needsReset
} from "./utils/codexLimits";
import {
  browseDirectory,
  copyFilePath,
  copyFileToDirectory,
  createFileFromBuffer,
  getSettings,
  listDirectory,
  revealFile,
  saveSettings
} from "./utils/fileLoader";
import { confirmDiscardUnsaved, getTopStatus, openExternalUrl } from "./utils/system";

const SELECTED_FILE_KEY = "nightops:selected-file";
const TREE_SORT_KEY = "treeSortMode";

function loadTreeSortMode() {
  try {
    const value = localStorage.getItem(TREE_SORT_KEY);
    return value === "ext" || value === "update" ? value : "name";
  } catch {
    return "name";
  }
}

function getDiskColor(free, total) {
  if (!(total > 0)) {
    return "#ef4444";
  }

  const percent = (free / total) * 100;
  if (percent >= 80) return "#22c55e";
  if (percent >= 60) return "#84cc16";
  if (percent >= 40) return "#eab308";
  if (percent >= 20) return "#f97316";
  return "#ef4444";
}

function clampBlurStrength(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

function normalizeOpacityPercent(value, fallback) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  if (parsed >= 0 && parsed <= 1) {
    return Math.round(parsed * 100);
  }

  return Math.max(0, Math.min(100, parsed));
}

function normalizeSettingsOpacity(settings) {
  if (!settings || typeof settings !== "object") {
    return settings;
  }

  return {
    ...settings,
    backgroundOpacity: normalizeOpacityPercent(settings.backgroundOpacity, 18),
    containerOpacity: normalizeOpacityPercent(settings.containerOpacity, 28)
  };
}

async function findFileByName(rootPath, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const stack = [rootPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    const entries = await listDirectory(currentPath);

    for (const entry of entries) {
      if (entry.type === "file" && entry.name.toLowerCase().includes(normalizedQuery)) {
        return {
          path: entry.path,
          name: entry.name,
          directoryPath: currentPath
        };
      }
    }

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry.type === "directory") {
        stack.push(entry.path);
      }
    }
  }

  return null;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [rootPath, setRootPath] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewMarkdownHeadingColors, setPreviewMarkdownHeadingColors] = useState([]);
  const [previewMarkdownHeadingSizes, setPreviewMarkdownHeadingSizes] = useState([]);
  const [notice, setNotice] = useState("");
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(140);
  const [treeReloadToken, setTreeReloadToken] = useState(0);
  const [browseMenu, setBrowseMenu] = useState(null);
  const [sortMode, setSortMode] = useState(() => loadTreeSortMode());
  const [unsavedCount, setUnsavedCount] = useState(0);
  const leftPanelRef = useRef(null);
  const paneContainerRef = useRef(null);
  const [settings, setSettings] = useState({
    initialDirectory: "",
    codexModels: [],
    selectedLaunchModel: "",
    usageModel: "",
    weeklyDivisor: 750,
    limit5hDivisor: 350,
    limit5hResetTime: "00:00",
    weeklyResetMonth: 1,
    weeklyResetDay: 1,
    weeklyResetTime: "00:00",
    limit5hNextResetAt: "",
    weeklyNextResetAt: "",
    limit5hBaselineTokenEstimate: 0,
    weeklyBaselineTokenEstimate: 0,
    backgroundOpacity: 0.18,
    containerOpacity: 0.28,
    backgroundBlur: 28,
    uiBackgroundBlur: 28,
    markdownHeadingColors: ["#8fd3ff", "#7bdc6a", "#f5c542", "#c18cff", "#e88787", "#9dd6c4"],
    markdownHeadingSizes: [1.65, 1.4, 1.22, 1.08, 0.98, 0.98]
  });
  const [topStatus, setTopStatus] = useState({
    userName: "unknown",
    diskFreeGb: 0,
    diskTotalGb: 0,
    gitBranch: "-",
    remoteBranchUrl: ""
  });

  function handleSelectFile(file) {
    setSelectedFile(file);
    if (file?.path) {
      paneContainerRef.current?.openFile?.(file);
    }
  }

  const handlePaneStateChange = useCallback((nextPanes) => {
    setUnsavedCount(
      (nextPanes || []).reduce(
        (count, pane) => count + (pane?.tabs || []).filter((tab) => tab?.isDirty).length,
        0
      )
    );
  }, []);

  const backgroundOpacity = normalizeOpacityPercent(settings.backgroundOpacity, 18);
  const containerOpacity = normalizeOpacityPercent(settings.containerOpacity, 28);

  const appStyle = {
    "--app-shell-alpha": String(backgroundOpacity / 100),
    "--surface-alpha": String(containerOpacity / 100),
    "--app-shell-blur": String(clampBlurStrength(settings.backgroundBlur)),
    "--surface-blur": String(clampBlurStrength(settings.uiBackgroundBlur ?? settings.backgroundBlur ?? 0))
  };

  useEffect(() => {
    try {
      if (selectedFile) {
        localStorage.setItem(SELECTED_FILE_KEY, JSON.stringify(selectedFile));
        return;
      }
      localStorage.removeItem(SELECTED_FILE_KEY);
    } catch {
      return;
    }
  }, [selectedFile]);

  useEffect(() => {
    try {
      localStorage.setItem(TREE_SORT_KEY, sortMode);
    } catch {
      return;
    }
  }, [sortMode]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setBooting(false);
    }, 820);

    if (!window.api && !window.nightOps) {
      return () => window.clearTimeout(timerId);
    }

    async function init() {
      try {
        const result = await getSettings();
        const normalizedResult = normalizeSettingsOpacity(result);
        setSettings(normalizedResult);
        setRootPath(normalizedResult.initialDirectory);
      } catch (error) {
        setNotice(error?.message || "Failed to load initial directory");
      }
    }

    init();
    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    setPreviewMarkdownHeadingColors(settings.markdownHeadingColors || []);
  }, [settings.markdownHeadingColors]);

  useEffect(() => {
    setPreviewMarkdownHeadingSizes(settings.markdownHeadingSizes || []);
  }, [settings.markdownHeadingSizes]);

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    try {
      const raw = localStorage.getItem(SELECTED_FILE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed?.path && parsed.path.startsWith(rootPath)) {
        setSelectedFile(parsed);
      }
    } catch {
      return;
    }
  }, [rootPath]);

  useEffect(() => {
    if (!rootPath) {
      setTopStatus({
        userName: "unknown",
        diskFreeGb: 0,
        diskTotalGb: 0,
        gitBranch: "-",
        remoteBranchUrl: ""
      });
      return;
    }

    let cancelled = false;

    async function refreshTopStatus() {
      try {
        const status = await getTopStatus(rootPath);
        if (!cancelled) {
          setTopStatus({
            userName: status?.userName || "unknown",
            diskFreeGb: Number(status?.diskFreeGb) || 0,
            diskTotalGb: Number(status?.diskTotalGb) || 0,
            gitBranch: status?.gitBranch || "-",
            remoteBranchUrl: status?.remoteBranchUrl || ""
          });
        }
      } catch {
        if (!cancelled) {
          setTopStatus({
            userName: "unknown",
            diskFreeGb: 0,
            diskTotalGb: 0,
            gitBranch: "-",
            remoteBranchUrl: ""
          });
        }
      }
    }

    refreshTopStatus();
    const timer = window.setInterval(refreshTopStatus, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rootPath]);

  useEffect(() => {
    let cancelled = false;

    async function syncCodexLimits() {
      if (!settings.limit5hNextResetAt && !settings.weeklyNextResetAt) {
        return;
      }

      try {
        const stats = await getCodexStats();
        if (cancelled) {
          return;
        }

        const now = new Date();
        const nextSettings = { ...settings };
        let updated = false;

        if (needsReset(nextSettings.limit5hNextResetAt, now)) {
          nextSettings.limit5hNextResetAt = getNextLimit5hResetAt(
            now,
            nextSettings.limit5hResetTime,
            nextSettings.limit5hNextResetAt
          ).toISOString();
          updated = true;
        }

        if (needsReset(nextSettings.weeklyNextResetAt, now)) {
          nextSettings.weeklyNextResetAt = getNextWeeklyResetAt(
            now,
            nextSettings.weeklyResetMonth,
            nextSettings.weeklyResetDay,
            nextSettings.weeklyResetTime,
            nextSettings.weeklyNextResetAt
          ).toISOString();
          updated = true;
        }

        if (updated) {
          const saved = await saveSettings(nextSettings);
          if (!cancelled) {
            setSettings(normalizeSettingsOpacity(saved));
          }
        }
      } catch {
        return;
      }
    }

    syncCodexLimits();
    const timer = setInterval(syncCodexLimits, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    settings.limit5hBaselineTokenEstimate,
    settings.limit5hNextResetAt,
    settings.limit5hResetTime,
    settings.weeklyBaselineTokenEstimate,
    settings.weeklyNextResetAt,
    settings.weeklyResetMonth,
    settings.weeklyResetDay,
    settings.weeklyResetTime
  ]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const id = setTimeout(() => setNotice(""), 2400);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    async function handleKeyDown(event) {
      if (event.metaKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setTreeCollapsed((prev) => !prev);
        return;
      }

      if (!event.ctrlKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "r") {
        event.preventDefault();
        window.location.reload();
        return;
      }

      if (key === "l") {
        event.preventDefault();
        if (launchOpen) {
          window.dispatchEvent(new CustomEvent("nightops:launch-submit"));
        } else {
          setLaunchOpen(true);
        }
        return;
      }

      if (key === "p") {
        event.preventDefault();
        const query = window.prompt("Search file");
        if (!query || !rootPath) {
          return;
        }

        const found = await findFileByName(rootPath, query);
        if (found) {
          setSelectedFile(found);
          setNotice(`Opened ${found.name}`);
        } else {
          setNotice("File not found");
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [launchOpen, rootPath]);

  useEffect(() => {
    if (treeCollapsed) {
      return undefined;
    }

    let resizing = false;

    function handleMouseMove(event) {
      if (!resizing) {
        return;
      }

      const nextWidth = Math.min(Math.max(event.clientX - 16, 140), Math.floor(window.innerWidth * 0.6));
      setSidebarWidth(nextWidth);
    }

    function handleMouseUp() {
      resizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function handleResizeStart() {
      resizing = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    window.addEventListener("nightops:tree-resize-start", handleResizeStart);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("nightops:tree-resize-start", handleResizeStart);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [treeCollapsed]);

  async function handleDirectoryChange(nextPath) {
    const nextSettings = await saveSettings({ ...settings, initialDirectory: nextPath });
    setSettings(normalizeSettingsOpacity(nextSettings));
    setRootPath(nextPath);
    setSelectedFile(null);
    setNotice("Directory applied");
  }

  async function handleBrowseDirectory() {
    try {
      const browseResult = await browseDirectory();
      if (!browseResult.canceled && browseResult.path) {
        if (unsavedCount > 0) {
          const ok = await confirmDiscardUnsaved(unsavedCount);
          if (!ok) {
            return;
          }
        }

        paneContainerRef.current?.resetWorkspace?.();
        await handleDirectoryChange(browseResult.path);
      }
    } catch (error) {
      setNotice(error?.message || "Browse failed");
    }
  }

  async function handleCopyRootPath() {
    if (!rootPath) {
      return;
    }

    await copyFilePath(rootPath);
    setBrowseMenu(null);
    setNotice(`Copied: ${rootPath}`);
  }

  async function handleRevealRootPath() {
    if (!rootPath) {
      return;
    }

    await revealFile(rootPath);
    setBrowseMenu(null);
  }

  function openBrowseMenuFromButton(target) {
    if (!rootPath || !target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const menuWidth = 200;
    const menuHeight = 88;
    const padding = 8;
    setBrowseMenu({
      x: Math.max(padding, Math.min(rect.left, window.innerWidth - menuWidth - padding)),
      y: Math.max(padding, Math.min(rect.bottom + 6, window.innerHeight - menuHeight - padding))
    });
  }

  useEffect(() => {
    function handlePointerDown() {
      setBrowseMenu(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  async function handleLaunchModelChange(nextModel) {
    const nextSettings = await saveSettings({ ...settings, selectedLaunchModel: nextModel });
    setSettings(normalizeSettingsOpacity(nextSettings));
  }

  async function handleSaveSettings(nextSettings, options = {}) {
    try {
      setSettings(nextSettings);
      setPreviewMarkdownHeadingColors(nextSettings.markdownHeadingColors || []);
      setPreviewMarkdownHeadingSizes(nextSettings.markdownHeadingSizes || []);
      setRootPath(nextSettings.initialDirectory || "");
      const saved = await saveSettings(nextSettings);
      setSettings(normalizeSettingsOpacity(saved));
      setPreviewMarkdownHeadingColors(saved.markdownHeadingColors || []);
      setPreviewMarkdownHeadingSizes(saved.markdownHeadingSizes || []);
      setRootPath(saved.initialDirectory);
      if (!options.keepOpen) {
        setSettingsOpen(false);
      }
      setNotice("Settings saved");
    } catch (error) {
      setNotice(error?.message || "Failed to save settings");
      throw error;
    }
  }

  async function handleImport(paths) {
    if (!rootPath || !paths || paths.length === 0) {
      return;
    }

    try {
      for (const sourcePath of paths) {
        await copyFileToDirectory(sourcePath, rootPath);
      }
      setTreeReloadToken((current) => current + 1);
    } catch (error) {
      setNotice(error?.message || "Failed to drop items");
    }
  }

  async function addFile(file, targetDirectoryPath = rootPath) {
    if (!file || !targetDirectoryPath) {
      return;
    }

    await createFileFromBuffer(targetDirectoryPath, file.name, file.content);
  }

  async function handleImportBuffers(files, targetDirectoryPath = rootPath) {
    if (!targetDirectoryPath) {
      return;
    }

    for (const file of files || []) {
      await addFile(
        {
          name: file.name,
          content: file.buffer,
          mimeType: file.type,
          type: "file"
        },
        targetDirectoryPath
      );
    }

    setTreeReloadToken((current) => current + 1);
  }

  async function onDropFiles(files, targetDirectoryPath = rootPath) {
    const list = Array.from(files || []);

    const results = await Promise.all(
      list.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
              resolve({
                name: file.name,
                buffer: reader.result,
                type: file.type
              });
            };

            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          })
      )
    );

    console.log("Loaded files:", results);
    await handleImportBuffers(results, targetDirectoryPath);
  }

  useEffect(() => {
    const container = leftPanelRef.current;
    if (!container) {
      return undefined;
    }

    async function handleTreePanelDrop(event) {
      event.preventDefault();
      event.stopPropagation();

      if (!rootPath) {
        return;
      }

      const droppedPaths = extractPathsFromEvent(event);
      if (droppedPaths.length > 0) {
        await handleImport(droppedPaths);
        return;
      }

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        await onDropFiles(files, rootPath);
      }
    }

    function handleTreePanelDragOver(event) {
      handleExternalDragOver(event);
      event.dataTransfer.dropEffect = "copy";
    }

    container.addEventListener("dragover", handleTreePanelDragOver);
    container.addEventListener("drop", handleTreePanelDrop);
    return () => {
      container.removeEventListener("dragover", handleTreePanelDragOver);
      container.removeEventListener("drop", handleTreePanelDrop);
    };
  }, [rootPath]);

  useEffect(() => {
    function handleExternalDrop(event) {
      const paths = event.detail;
      if (!paths || paths.length === 0) {
        return;
      }

      console.log("External drop:", paths);
      handleImport(paths);
    }

    window.addEventListener("external-drop", handleExternalDrop);
    return () => window.removeEventListener("external-drop", handleExternalDrop);
  }, [rootPath]);

  return (
    <div className="app-shell" style={appStyle}>
      <div className="window-drag-bar">
        <span className="top-status-strip">
          <span className="top-status-user">{topStatus.userName}</span>
          <span
            className="top-status-disk"
            style={{ color: getDiskColor(topStatus.diskFreeGb, topStatus.diskTotalGb) }}
          >
            {`${Math.round(topStatus.diskFreeGb)}GB / ${Math.round(topStatus.diskTotalGb)}GB`}
          </span>
          {topStatus.remoteBranchUrl ? (
            <button
              type="button"
              className="top-status-git clickable"
              onClick={() => openExternalUrl(topStatus.remoteBranchUrl)}
            >
              Git: {topStatus.gitBranch || "-"}
            </button>
          ) : (
            <span className="top-status-git">Git: {topStatus.gitBranch || "-"}</span>
          )}
          <span className="top-status-unsaved">Unsaved: {unsavedCount}</span>
        </span>
        <div className="window-path-area">
          <div className="window-path">{`NightOps — ${rootPath || "No directory selected"}`}</div>
          <button
            type="button"
            className="window-browse-button"
            onClick={handleBrowseDirectory}
            onMouseDown={(event) => {
              if (event.button !== 2) {
                return;
              }
              event.preventDefault();
              openBrowseMenuFromButton(event.currentTarget);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              openBrowseMenuFromButton(event.currentTarget);
            }}
          >
            Browse
          </button>
        </div>
        <button className="window-launch-button" onClick={() => setLaunchOpen(true)}>
          Launch
        </button>
        <button className="window-settings-button" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>
      {browseMenu ? (
        <div
          className="window-browse-menu"
          style={{ left: `${browseMenu.x}px`, top: `${browseMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="window-browse-menu-item" onClick={handleCopyRootPath} disabled={!rootPath}>
            Copy Full Path
          </button>
          <button type="button" className="window-browse-menu-item" onClick={handleRevealRootPath} disabled={!rootPath}>
            Show in Finder
          </button>
        </div>
      ) : null}
      <TopBar
        codexModels={settings.codexModels}
        usageModel={settings.usageModel}
        weeklyDivisor={settings.weeklyDivisor}
        limit5hDivisor={settings.limit5hDivisor}
        limit5hBaselineTokenEstimate={settings.limit5hBaselineTokenEstimate}
        weeklyBaselineTokenEstimate={settings.weeklyBaselineTokenEstimate}
        limit5hNextResetAt={settings.limit5hNextResetAt}
        weeklyNextResetAt={settings.weeklyNextResetAt}
      />
      <div
        className={`workspace ${treeCollapsed ? "workspace-tree-collapsed" : ""}`}
        style={treeCollapsed ? undefined : { gridTemplateColumns: `${sidebarWidth}px 2px 1fr` }}
      >
        <aside
          ref={leftPanelRef}
          className={`left-panel ${treeCollapsed ? "left-panel-collapsed" : ""}`}
        >
          <div className="panel-title panel-title-with-hint">
            <span>Tree</span>
            <span className="panel-title-hint">Fold(Cmd+B)</span>
            <button
              type="button"
              className="tree-sort-btn"
              onClick={() => {
                setSortMode((current) => {
                  if (current === "name") return "ext";
                  if (current === "ext") return "update";
                  return "name";
                });
              }}
            >
              {sortMode === "ext" ? "Ext ▼" : sortMode === "update" ? "Update ▼" : "Name ▼"}
            </button>
          </div>
          {!treeCollapsed ? (
            <>
              {rootPath ? (
                <FileTree
                  rootPath={rootPath}
                  selectedFilePath={selectedFile?.path}
                  sortMode={sortMode}
                  onSelectFile={handleSelectFile}
                  onDropFiles={onDropFiles}
                  onNotify={setNotice}
                  reloadToken={treeReloadToken}
                />
              ) : (
                <div className="panel-empty">Loading root...</div>
              )}
            </>
          ) : null}
        </aside>
        {!treeCollapsed ? (
          <div
            className="panel-resizer"
            onMouseDown={() => window.dispatchEvent(new Event("nightops:tree-resize-start"))}
          />
        ) : null}
        <main className="right-panel">
          <div className="panel-title">Preview / Editor</div>
          <PaneContainer
            ref={paneContainerRef}
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
            onSaved={() => setNotice("Saved")}
            onPaneStateChange={handlePaneStateChange}
            markdownHeadingColors={previewMarkdownHeadingColors.length > 0 ? previewMarkdownHeadingColors : settings.markdownHeadingColors}
            markdownHeadingSizes={previewMarkdownHeadingSizes.length > 0 ? previewMarkdownHeadingSizes : settings.markdownHeadingSizes}
          />
        </main>
      </div>
      {launchOpen ? (
        <LaunchPanel
          initialDirectory={selectedFile?.directoryPath || rootPath}
          initialModel={settings.selectedLaunchModel}
          models={settings.codexModels}
          onLaunchModelChange={handleLaunchModelChange}
          onClose={() => setLaunchOpen(false)}
          onLaunched={() => {
            setLaunchOpen(false);
            setNotice("Terminal launched");
          }}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          onClose={() => {
            setPreviewMarkdownHeadingColors(settings.markdownHeadingColors || []);
            setPreviewMarkdownHeadingSizes(settings.markdownHeadingSizes || []);
            setSettingsOpen(false);
          }}
          onSave={handleSaveSettings}
          onPreviewMarkdownHeadingColorsChange={setPreviewMarkdownHeadingColors}
          onPreviewMarkdownHeadingSizesChange={setPreviewMarkdownHeadingSizes}
        />
      ) : null}
      {notice ? <div className="toast">{notice}</div> : null}
      {booting ? <BootScreen onDone={() => setBooting(false)} /> : null}
    </div>
  );
}
