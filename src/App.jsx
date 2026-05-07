import { useEffect, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import FileTree from "./components/FileTree";
import PaneContainer from "./components/PreviewPane";
import LaunchPanel from "./components/LaunchPanel";
import SettingsPanel from "./components/SettingsPanel";
import { extractPathsFromEvent, handleDragOver as handleExternalDragOver } from "./utils/drop";
import { getCodexStats } from "./utils/codexLog";
import {
  getNextLimit5hResetAt,
  getNextWeeklyResetAt,
  needsReset
} from "./utils/codexLimits";
import { browseDirectory, copyFileToDirectory, createFileFromBuffer, getSettings, listDirectory, saveSettings } from "./utils/fileLoader";

const SELECTED_FILE_KEY = "nightops:selected-file";

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
  const [rootPath, setRootPath] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewMarkdownHeadingColors, setPreviewMarkdownHeadingColors] = useState([]);
  const [notice, setNotice] = useState("");
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [treeReloadToken, setTreeReloadToken] = useState(0);
  const leftPanelRef = useRef(null);
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
    backgroundOpacity: 0.32,
    containerOpacity: 0.46,
    backgroundBlur: 28,
    uiBackgroundBlur: 28,
    markdownHeadingColors: ["#8fd3ff", "#7bdc6a", "#f5c542", "#c18cff", "#e88787", "#9dd6c4"]
  });
  const [systemStatus, setSystemStatus] = useState({
    userName: "hashimoto",
    diskFreeGb: 0,
    diskTotalGb: 0
  });

  const appStyle = {
    "--app-shell-alpha": String(settings.backgroundOpacity),
    "--surface-alpha": String(settings.containerOpacity),
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
    if (!window.api && !window.nightOps) {
      return;
    }

    async function init() {
      try {
        const result = await getSettings();
        setSettings(result);
        setRootPath(result.initialDirectory);
      } catch (error) {
        setNotice(error?.message || "Failed to load initial directory");
      }
    }

    init();
  }, []);

  useEffect(() => {
    setPreviewMarkdownHeadingColors(settings.markdownHeadingColors || []);
  }, [settings.markdownHeadingColors]);

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
    const api = window.api || window.nightOps;
    if (!rootPath || !api) {
      return;
    }

    let cancelled = false;

    async function refreshSystemStatus() {
      try {
        const status = await api.getSystemStatus(rootPath);
        if (!cancelled) {
          setSystemStatus({
            userName: status?.userName || "hashimoto",
            diskFreeGb: Number(status?.diskFreeGb) || 0,
            diskTotalGb: Number(status?.diskTotalGb) || 0
          });
        }
      } catch {
        if (!cancelled) {
          setSystemStatus({
            userName: "hashimoto",
            diskFreeGb: 0,
            diskTotalGb: 0
          });
        }
      }
    }

    refreshSystemStatus();
    return () => {
      cancelled = true;
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
        const currentTokenEstimate = Number(stats?.tokenEstimate) || 0;

        if (needsReset(nextSettings.limit5hNextResetAt, now)) {
          nextSettings.limit5hBaselineTokenEstimate = currentTokenEstimate;
          nextSettings.limit5hNextResetAt = getNextLimit5hResetAt(
            now,
            nextSettings.limit5hResetTime,
            nextSettings.limit5hNextResetAt
          ).toISOString();
          updated = true;
        }

        if (needsReset(nextSettings.weeklyNextResetAt, now)) {
          nextSettings.weeklyBaselineTokenEstimate = currentTokenEstimate;
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
            setSettings(saved);
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

      const nextWidth = Math.min(Math.max(event.clientX - 16, 220), Math.floor(window.innerWidth * 0.6));
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
    setSettings(nextSettings);
    setRootPath(nextPath);
    setSelectedFile(null);
    setNotice("Directory applied");
  }

  async function handleBrowseDirectory() {
    try {
      const browseResult = await browseDirectory();
      if (!browseResult.canceled && browseResult.path) {
        await handleDirectoryChange(browseResult.path);
      }
    } catch (error) {
      setNotice(error?.message || "Browse failed");
    }
  }

  async function handleLaunchModelChange(nextModel) {
    const nextSettings = await saveSettings({ ...settings, selectedLaunchModel: nextModel });
    setSettings(nextSettings);
  }

  async function handleSaveSettings(nextSettings) {
    try {
      const saved = await saveSettings(nextSettings);
      setSettings(saved);
      setPreviewMarkdownHeadingColors(saved.markdownHeadingColors || []);
      setRootPath(saved.initialDirectory);
      setSettingsOpen(false);
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
        <div className="window-path-area">
          <div className="window-path">{`NightOps — ${rootPath || "No directory selected"}`}</div>
          <button type="button" className="window-browse-button" onClick={handleBrowseDirectory}>
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
          </div>
          {!treeCollapsed ? (
            <>
              {rootPath ? (
                <FileTree
                  rootPath={rootPath}
                  selectedFilePath={selectedFile?.path}
                  onSelectFile={setSelectedFile}
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
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            onSaved={() => setNotice("Saved")}
            markdownHeadingColors={previewMarkdownHeadingColors.length > 0 ? previewMarkdownHeadingColors : settings.markdownHeadingColors}
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
            setSettingsOpen(false);
          }}
          onSave={handleSaveSettings}
          onPreviewMarkdownHeadingColorsChange={setPreviewMarkdownHeadingColors}
        />
      ) : null}
      {notice ? <div className="toast">{notice}</div> : null}
    </div>
  );
}
