import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { clipboard, shell } from "electron";
import fs from "fs/promises";
import { createReadStream, existsSync, watch } from "fs";
import os from "os";
import path from "path";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import si from "systeminformation";
import {
  DEFAULT_LIMIT5H_RESET_TIME,
  DEFAULT_WEEKLY_RESET_MONTH,
  DEFAULT_WEEKLY_RESET_DAY,
  DEFAULT_WEEKLY_RESET_TIME,
  calculateUsage,
  estimateCodexTokens,
  getCurrentLimit5hWindowStart,
  getCurrentWeeklyWindowStart,
  normalizeCodexLimitSettings,
  normalizeHexColor,
  normalizeHexColorList,
  normalizeTimeString,
  normalizeDayOfMonth,
  normalizeMonth
} from "../src/utils/codexLimits.js";

const execFileAsync = promisify(execFile);
const isDev = !app.isPackaged;
const MAX_PREVIEW_FILE_SIZE = 5 * 1024 * 1024;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(app.getAppPath(), "settings.json");
const DEFAULT_CODEX_MODELS = [
  { id: "gpt-5.5", factor: 1.2 },
  { id: "gpt-5.4", factor: 1.0 },
  { id: "gpt-5.4-mini", factor: 0.8 },
  { id: "gpt-5.3-codex", factor: 0.7 },
  { id: "gpt-5.2", factor: 0.9 }
];
const DEFAULT_MARKDOWN_HEADING_COLORS = ["#8fd3ff", "#7bdc6a", "#f5c542", "#c18cff", "#e88787", "#9dd6c4"];
const DEFAULT_MARKDOWN_HEADING_SIZES = [1.65, 1.4, 1.22, 1.08, 0.98, 0.98];
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' file: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: http://127.0.0.1:5173 http://localhost:5173",
  "worker-src 'self' blob:"
].join("; ");

const DEFAULT_LIMITS_SETTINGS = {
  limit5hResetTime: DEFAULT_LIMIT5H_RESET_TIME,
  weeklyResetMonth: DEFAULT_WEEKLY_RESET_MONTH,
  weeklyResetDay: DEFAULT_WEEKLY_RESET_DAY,
  weeklyResetTime: DEFAULT_WEEKLY_RESET_TIME,
  limit5hNextResetAt: "",
  weeklyNextResetAt: "",
  limit5hBaselineTokenEstimate: 0,
  weeklyBaselineTokenEstimate: 0
};

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

let activeFileWatcher = null;
let activeWatchedPath = "";
let heicQueue = Promise.resolve();
const pendingExternalDropPaths = [];
const heicCache = new Map();
const ignoreCache = new Map();

function broadcastExternalDropPaths(paths) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send("nightops:external-drop", paths);
  }
}

function flushPendingExternalDropPaths() {
  if (pendingExternalDropPaths.length === 0) {
    return;
  }

  const paths = pendingExternalDropPaths.splice(0, pendingExternalDropPaths.length);
  broadcastExternalDropPaths(paths);
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  pendingExternalDropPaths.push(filePath);
  flushPendingExternalDropPaths();
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 540,
    minHeight: 360,
    transparent: true,
    backgroundColor: "#00000000",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on("did-fail-load", (_event, code, desc) => {
    console.error("Load failed:", code, desc);
  });
  win.webContents.on("did-finish-load", () => {
    flushPendingExternalDropPaths();
  });
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CONTENT_SECURITY_POLICY]
      }
    });
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
}

function focusWindow() {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window || window.isDestroyed()) {
    return { ok: false };
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
  window.moveTop();
  return { ok: true };
}

app.on("browser-window-created", (_event, window) => {
  window.webContents.on("will-navigate", (event) => event.preventDefault());
});

function sanitizeText(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function quoteShellArg(value) {
  return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

function normalizeMarkdownHeadingSizes(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.map((item, index) => {
    const fallbackValue = fallback[index] ?? fallback[0] ?? 1;
    const parsed = Number(item);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallbackValue;
    }
    return Math.min(3, Math.max(0.5, parsed));
  });

  return normalized.length === 6 ? normalized : fallback;
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath).toLowerCase();
  const textExts = new Set([
    ".txt",
    ".md",
    ".markdown",
    ".mdown",
    ".mkdn",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".css",
    ".html",
    ".py",
    ".swift",
    ".yml",
    ".yaml",
    ".csv",
    ".sh",
    ".env",
    ".toml",
    ".xml"
  ]);
  return textExts.has(ext) || baseName === ".gitignore";
}

function getImageMimeType(ext) {
  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };
  return mimeMap[ext] || "";
}

function queueHeic(task) {
  const next = heicQueue.then(task, task);
  heicQueue = next.catch(() => {});
  return next;
}

async function realConvertHeicToJpeg(filePath) {
  const tempDir = path.join(os.tmpdir(), "nightops-heic-cache");
  await fs.mkdir(tempDir, { recursive: true });
  const outputPath = path.join(
    tempDir,
    `${path.basename(filePath, path.extname(filePath))}-${Date.now()}.jpg`
  );

  await execFileAsync("sips", ["-Z", "1024", "-s", "format", "jpeg", filePath, "--out", outputPath]);
  console.log("HEIC output:", outputPath, existsSync(outputPath));
  const buffer = await fs.readFile(outputPath);
  return { buffer, mimeType: "image/jpeg" };
}

async function readHeicDimensions(filePath) {
  const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
  return {
    width,
    height
  };
}

async function convertHeicToJpegUrl(filePath) {
  if (heicCache.has(filePath)) {
    return heicCache.get(filePath);
  }

  const pending = queueHeic(() => realConvertHeicToJpeg(filePath))
    .then((result) => {
      heicCache.set(filePath, result);
      return result;
    })
    .catch((error) => {
      heicCache.delete(filePath);
      throw error;
    });

  heicCache.set(filePath, pending);
  return pending;
}

async function readCodexHistory(settings = null) {
  const historyPath = path.join(os.homedir(), ".codex", "history.jsonl");
  console.log("[codex:stats] historyPath =", historyPath);
  try {
    const raw = await fs.readFile(historyPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const sessionIds = new Set();
    const requestCount = lines.length;
    const currentTime = new Date();
    const limit5hWindowStart = settings
      ? getCurrentLimit5hWindowStart(currentTime, settings.limit5hResetTime)
      : null;
    const weeklyWindowStart = settings
      ? getCurrentWeeklyWindowStart(
          currentTime,
          settings.weeklyResetMonth,
          settings.weeklyResetDay,
          settings.weeklyResetTime
        )
      : null;
    let tokenEstimate = 0;
    let tokenEstimate5h = 0;
    let tokenEstimateWeek = 0;
    let previousTokenEstimate = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.session_id || entry.sessionId) {
          sessionIds.add(entry.session_id || entry.sessionId);
        }
        const tokenCount = estimateCodexTokens(entry.text || "");
        tokenEstimate += tokenCount;
        previousTokenEstimate = tokenCount;
        const entryTime = new Date(Number(entry.ts) * 1000);
        if (settings && !Number.isNaN(entryTime.getTime())) {
          if (entryTime >= limit5hWindowStart) {
            tokenEstimate5h += tokenCount;
          }
          if (entryTime >= weeklyWindowStart) {
            tokenEstimateWeek += tokenCount;
          }
        }
      } catch {
        continue;
      }
    }

    return {
      historyPath,
      requestCount,
      sessionCount: sessionIds.size,
      tokenEstimate,
      tokenEstimate5h,
      tokenEstimateWeek,
      previousTokenEstimate
    };
  } catch (error) {
    return {
      historyPath,
      requestCount: 0,
      sessionCount: 0,
      tokenEstimate: 0,
      tokenEstimate5h: 0,
      tokenEstimateWeek: 0,
      previousTokenEstimate: 0,
      error: error.message
    };
  }
}

async function listDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const normalizedEntries = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith(".DS_Store"))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) {
        return -1;
      }
      if (!a.isDirectory() && b.isDirectory()) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map(async (entry) => {
      const ignored = await isIgnoredPath(dirPath, entry.name);
      const stats = await fs.stat(path.join(dirPath, entry.name));
      return {
        name: entry.name,
        path: path.join(dirPath, entry.name),
        type: entry.isDirectory() ? "directory" : "file",
        ignored,
        mtime: stats.mtimeMs || 0
      };
    }));
  return normalizedEntries;
}

async function isIgnoredPath(dirPath, entryName) {
  if (entryName === ".gitignore") {
    return true;
  }

  const cacheKey = `${dirPath}::${entryName}`;
  if (ignoreCache.has(cacheKey)) {
    return ignoreCache.get(cacheKey);
  }

  const pending = execFileAsync("git", ["-C", dirPath, "check-ignore", "-q", "--", entryName])
    .then(() => true)
    .catch(() => false);

  ignoreCache.set(cacheKey, pending);
  return pending;
}

async function readFileContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stats = await fs.stat(filePath);

  if (ext === ".pdf") {
    const buffer = await fs.readFile(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      type: "pdf",
      mimeType: "application/pdf",
      buffer,
      editable: false
    };
  }

  if (ext === ".heic" || ext === ".heif") {
    if (stats.size >= MAX_PREVIEW_FILE_SIZE) {
      throw new Error("File too large for preview");
    }

    const dimensions = await readHeicDimensions(filePath);
    const { buffer, mimeType } = await convertHeicToJpegUrl(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      type: "image",
      mimeType,
      buffer,
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      editable: false
    };
  }

  const imageMimeType = getImageMimeType(ext);
  if (imageMimeType) {
    if (stats.size >= MAX_PREVIEW_FILE_SIZE) {
      throw new Error("File too large for preview");
    }

    const buffer = await fs.readFile(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      type: "image",
      mimeType: imageMimeType,
      content: buffer.toString("base64"),
      editable: false
    };
  }

  if (!isTextFile(filePath)) {
    throw new Error("Unsupported file type for preview");
  }

  if (stats.size >= MAX_PREVIEW_FILE_SIZE) {
    throw new Error("File too large for preview");
  }

  const raw = await fs.readFile(filePath, "utf8");
  return {
    path: filePath,
    name: path.basename(filePath),
    type: ext === ".csv" ? "csv" : ext === ".json" ? "json" : "text",
    mimeType: "text/plain",
    content: raw,
    editable: ext !== ".csv"
  };
}

async function saveFileContent(filePath, content) {
  await fs.writeFile(filePath, content, "utf8");
  return { ok: true };
}

function validateEntryName(nextName) {
  const safeName = typeof nextName === "string" ? nextName.trim() : "";
  if (!safeName || safeName.includes("/") || safeName.includes("\\") || safeName === "." || safeName === "..") {
    throw new Error("Invalid file name");
  }
  return safeName;
}

function toFriendlyEntryNameError(error) {
  if (error?.code === "EEXIST") {
    return new Error("A file or folder with this name already exists.");
  }
  return error;
}

async function renameFilePath(filePath, nextName) {
  const parentPath = path.dirname(filePath);
  const safeName = validateEntryName(nextName);

  const nextPath = path.join(parentPath, safeName);
  try {
    await fs.access(nextPath);
    throw new Error("A file or folder with this name already exists.");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw toFriendlyEntryNameError(error);
    }
  }

  try {
    await fs.rename(filePath, nextPath);
  } catch (error) {
    throw toFriendlyEntryNameError(error);
  }
  return {
    path: nextPath,
    name: safeName,
    directoryPath: parentPath
  };
}

async function deleteFilePath(filePath) {
  await fs.rm(filePath, { force: true, recursive: false });
  return { ok: true };
}

async function createFilePath(directoryPath, nextName) {
  const safeName = validateEntryName(nextName);
  const nextPath = path.join(directoryPath, safeName);
  try {
    await fs.writeFile(nextPath, "", { flag: "wx" });
  } catch (error) {
    throw toFriendlyEntryNameError(error);
  }
  return getEntryInfo(nextPath);
}

function normalizeBinaryContent(content) {
  if (typeof content === "string") {
    return Buffer.from(content, "base64");
  }

  if (content instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(content));
  }

  if (ArrayBuffer.isView(content)) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  }

  if (content?.type === "Buffer" && Array.isArray(content.data)) {
    return Buffer.from(content.data);
  }

  throw new Error("Unsupported binary content");
}

async function createFileFromBuffer(directoryPath, nextName, content) {
  const safeName = validateEntryName(nextName);
  const nextPath = await getAvailableDestinationPath(directoryPath, safeName);
  const buffer = normalizeBinaryContent(content);
  await fs.writeFile(nextPath, buffer);
  return getEntryInfo(nextPath);
}

async function createDirectoryPath(directoryPath, nextName) {
  const safeName = validateEntryName(nextName);
  const nextPath = path.join(directoryPath, safeName);
  try {
    await fs.mkdir(nextPath);
  } catch (error) {
    throw toFriendlyEntryNameError(error);
  }
  return getEntryInfo(nextPath);
}

async function getEntryInfo(entryPath) {
  const stats = await fs.stat(entryPath);
  return {
    path: entryPath,
    name: path.basename(entryPath),
    directoryPath: path.dirname(entryPath),
    type: stats.isDirectory() ? "directory" : "file"
  };
}

function isDescendantPath(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function getAvailableDestinationPath(targetDirectoryPath, baseName) {
  const parsed = path.parse(baseName);
  let attempt = path.join(targetDirectoryPath, baseName);
  let index = 2;

  while (existsSync(attempt)) {
    attempt = path.join(targetDirectoryPath, `${parsed.name} ${index}${parsed.ext}`);
    index += 1;
  }

  return attempt;
}

async function moveEntryToDirectory(sourcePath, targetDirectoryPath) {
  const sourceStats = await fs.stat(sourcePath);
  const sourceParentPath = path.dirname(sourcePath);

  if (path.resolve(targetDirectoryPath) === path.resolve(sourcePath) || sourceParentPath === targetDirectoryPath) {
    return getEntryInfo(sourcePath);
  }

  if (sourceStats.isDirectory() && isDescendantPath(sourcePath, targetDirectoryPath)) {
    throw new Error("Cannot move a directory into itself");
  }

  const destinationPath = await getAvailableDestinationPath(targetDirectoryPath, path.basename(sourcePath));

  try {
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }

    await fs.cp(sourcePath, destinationPath, { recursive: sourceStats.isDirectory(), force: false, errorOnExist: true });
    await fs.rm(sourcePath, { recursive: true, force: true });
  }

  return getEntryInfo(destinationPath);
}

async function copyEntryToDirectory(sourcePath, targetDirectoryPath) {
  const sourceStats = await fs.stat(sourcePath);
  const destinationPath = await getAvailableDestinationPath(targetDirectoryPath, path.basename(sourcePath));

  await fs.cp(sourcePath, destinationPath, { recursive: sourceStats.isDirectory(), force: false, errorOnExist: true });
  return getEntryInfo(destinationPath);
}

async function revealInFinder(filePath) {
  shell.showItemInFolder(filePath);
  return { ok: true };
}

async function copyFullPath(filePath) {
  clipboard.writeText(filePath);
  return { ok: true };
}

async function launchCodex(directoryPath, model, promptTemplate = "") {
  const safeDirectory = sanitizeText(directoryPath);
  const command = [`codex -m ${quoteShellArg(model)}`];

  if (promptTemplate.trim()) {
    command.push(quoteShellArg(promptTemplate.trim()));
  }

  const safeCommand = sanitizeText(command.join(" "));
  const script = `tell application "Terminal"
activate
do script "cd \\"${safeDirectory}\\" && ${safeCommand}"
end tell`;
  try {
    await execFileAsync("osascript", ["-e", script]);
    return { ok: true };
  } catch (error) {
    throw new Error(error.stderr?.trim() || error.message || "Failed to launch Terminal");
  }
}

async function readSettings() {
  const fallbackPath = os.homedir();
  const defaultSettings = {
    initialDirectory: fallbackPath,
    codexModels: DEFAULT_CODEX_MODELS,
    selectedLaunchModel: "gpt-5.4-mini",
    usageModel: "gpt-5.4",
    weeklyDivisor: 750,
    limit5hDivisor: 350,
    limit5hRemainingPercent: 100,
    weeklyRemainingPercent: 100,
    backgroundOpacity: 18,
    containerOpacity: 28,
    backgroundBlur: 28,
    uiBackgroundBlur: 28,
    markdownHeadingColors: DEFAULT_MARKDOWN_HEADING_COLORS,
    markdownHeadingSizes: DEFAULT_MARKDOWN_HEADING_SIZES,
    markdownHeadingColor: DEFAULT_MARKDOWN_HEADING_COLORS[0],
    ...DEFAULT_LIMITS_SETTINGS
  };

  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const initialDirectory = parsed.initialDirectory || fallbackPath;
    const codexModels = Array.isArray(parsed.codexModels)
      ? parsed.codexModels
          .filter((item) => item && typeof item.id === "string" && item.id.trim())
          .map((item) => ({
            id: item.id.trim(),
            factor: Number(item.factor) > 0 ? Number(item.factor) : 1
          }))
      : defaultSettings.codexModels;
    const modelIds = codexModels.map((item) => item.id);
    const selectedLaunchModel =
      typeof parsed.selectedLaunchModel === "string" && parsed.selectedLaunchModel.trim()
        ? parsed.selectedLaunchModel.trim()
        : defaultSettings.selectedLaunchModel;
    const usageModel =
      typeof parsed.usageModel === "string" && parsed.usageModel.trim()
        ? parsed.usageModel.trim()
        : defaultSettings.usageModel;
    const weeklyDivisor = Number(parsed.weeklyDivisor) > 0 ? Number(parsed.weeklyDivisor) : defaultSettings.weeklyDivisor;
    const limit5hDivisor =
      Number(parsed.limit5hDivisor) > 0 ? Number(parsed.limit5hDivisor) : defaultSettings.limit5hDivisor;
    const limit5hRemainingPercent = normalizeOpacityPercent(
      parsed.limit5hRemainingPercent,
      defaultSettings.limit5hRemainingPercent
    );
    const weeklyRemainingPercent = normalizeOpacityPercent(
      parsed.weeklyRemainingPercent,
      defaultSettings.weeklyRemainingPercent
    );
    const backgroundOpacity = normalizeOpacityPercent(parsed.backgroundOpacity, defaultSettings.backgroundOpacity);
    const containerOpacity = normalizeOpacityPercent(parsed.containerOpacity, defaultSettings.containerOpacity);
    const backgroundBlur =
      Number(parsed.backgroundBlur) >= 0 ? Math.min(100, Number(parsed.backgroundBlur)) : defaultSettings.backgroundBlur;
    const uiBackgroundBlur =
      Number(parsed.uiBackgroundBlur) >= 0 ? Math.min(100, Number(parsed.uiBackgroundBlur)) : backgroundBlur;
    const markdownHeadingColors = Array.isArray(parsed.markdownHeadingColors)
      ? normalizeHexColorList(parsed.markdownHeadingColors, defaultSettings.markdownHeadingColors)
      : typeof parsed.markdownHeadingColor === "string"
        ? Array.from({ length: 6 }, () => normalizeHexColor(parsed.markdownHeadingColor, defaultSettings.markdownHeadingColors[0]))
        : defaultSettings.markdownHeadingColors;
    const markdownHeadingSizes = Array.isArray(parsed.markdownHeadingSizes)
      ? normalizeMarkdownHeadingSizes(parsed.markdownHeadingSizes, defaultSettings.markdownHeadingSizes)
      : defaultSettings.markdownHeadingSizes;
    const markdownHeadingColor = markdownHeadingColors[0];
    const codexLimitSettings = normalizeCodexLimitSettings(
      {
        limit5hResetTime: parsed.limit5hResetTime,
        weeklyResetMonth: parsed.weeklyResetMonth,
        weeklyResetDay: parsed.weeklyResetDay,
        weeklyResetTime: parsed.weeklyResetTime,
        limit5hNextResetAt: parsed.limit5hNextResetAt,
        weeklyNextResetAt: parsed.weeklyNextResetAt
      },
      new Date()
    );
    const codexHistory = await readCodexHistory(codexLimitSettings);
    const currentTokenEstimate = Number(codexHistory.tokenEstimate) || 0;
    const limit5hBaselineTokenEstimate = Object.hasOwn(parsed, "limit5hBaselineTokenEstimate")
      ? Number.isFinite(Number(parsed.limit5hBaselineTokenEstimate))
        ? Number(parsed.limit5hBaselineTokenEstimate)
        : currentTokenEstimate
      : currentTokenEstimate;
    const weeklyBaselineTokenEstimate = Object.hasOwn(parsed, "weeklyBaselineTokenEstimate")
      ? Number.isFinite(Number(parsed.weeklyBaselineTokenEstimate))
        ? Number(parsed.weeklyBaselineTokenEstimate)
        : currentTokenEstimate
      : currentTokenEstimate;
    const normalizedSelectedLaunchModel = modelIds.includes(selectedLaunchModel)
      ? selectedLaunchModel
      : codexModels[0].id;
    const normalizedUsageModel = modelIds.includes(usageModel) ? usageModel : codexModels[0].id;
    try {
      const stats = await fs.stat(initialDirectory);
      if (!stats.isDirectory()) {
        return {
          ...defaultSettings,
          codexModels,
          selectedLaunchModel: normalizedSelectedLaunchModel,
          usageModel: normalizedUsageModel,
          weeklyDivisor,
          limit5hDivisor,
          limit5hRemainingPercent,
          weeklyRemainingPercent,
          backgroundOpacity,
          containerOpacity,
          backgroundBlur,
          uiBackgroundBlur,
          ...codexLimitSettings,
          limit5hBaselineTokenEstimate,
          weeklyBaselineTokenEstimate,
          markdownHeadingColors,
          markdownHeadingSizes,
          markdownHeadingColor
        };
      }
      return {
        initialDirectory,
        codexModels,
        selectedLaunchModel: normalizedSelectedLaunchModel,
        usageModel: normalizedUsageModel,
        weeklyDivisor,
        limit5hDivisor,
        limit5hRemainingPercent,
        weeklyRemainingPercent,
        backgroundOpacity,
        containerOpacity,
        backgroundBlur,
        uiBackgroundBlur,
        ...codexLimitSettings,
        limit5hBaselineTokenEstimate,
        weeklyBaselineTokenEstimate,
        markdownHeadingColors,
        markdownHeadingSizes,
        markdownHeadingColor
      };
    } catch {
      return {
        ...defaultSettings,
        codexModels,
        selectedLaunchModel: normalizedSelectedLaunchModel,
        usageModel: normalizedUsageModel,
        weeklyDivisor,
        limit5hDivisor,
        limit5hRemainingPercent,
        weeklyRemainingPercent,
        backgroundOpacity,
        containerOpacity,
        backgroundBlur,
        uiBackgroundBlur,
        ...codexLimitSettings,
        limit5hBaselineTokenEstimate,
        weeklyBaselineTokenEstimate,
        markdownHeadingColors,
        markdownHeadingSizes,
        markdownHeadingColor
      };
    }
  } catch {
    return defaultSettings;
  }
}

async function saveSettings(settings) {
  const current = await readSettings();
  const nextSettings = {
    initialDirectory: settings.initialDirectory || current.initialDirectory || os.homedir(),
    codexModels:
      Array.isArray(settings.codexModels) && settings.codexModels.length > 0
        ? settings.codexModels
            .filter((item) => item && typeof item.id === "string" && item.id.trim())
            .map((item) => ({
              id: item.id.trim(),
              factor: Number(item.factor) > 0 ? Number(item.factor) : 1
            }))
        : current.codexModels,
    selectedLaunchModel:
      typeof settings.selectedLaunchModel === "string" && settings.selectedLaunchModel.trim()
        ? settings.selectedLaunchModel.trim()
        : current.selectedLaunchModel,
    usageModel:
      typeof settings.usageModel === "string" && settings.usageModel.trim()
        ? settings.usageModel.trim()
        : current.usageModel,
    weeklyDivisor: Number(settings.weeklyDivisor) > 0 ? Number(settings.weeklyDivisor) : current.weeklyDivisor,
    limit5hDivisor: Number(settings.limit5hDivisor) > 0 ? Number(settings.limit5hDivisor) : current.limit5hDivisor,
    limit5hRemainingPercent: normalizeOpacityPercent(
      settings.limit5hRemainingPercent,
      current.limit5hRemainingPercent ?? 100
    ),
    weeklyRemainingPercent: normalizeOpacityPercent(
      settings.weeklyRemainingPercent,
      current.weeklyRemainingPercent ?? 100
    ),
    backgroundOpacity: normalizeOpacityPercent(settings.backgroundOpacity, current.backgroundOpacity),
    containerOpacity: normalizeOpacityPercent(settings.containerOpacity, current.containerOpacity),
    backgroundBlur:
      Number(settings.backgroundBlur) >= 0
        ? Math.min(100, Number(settings.backgroundBlur))
        : current.backgroundBlur,
    uiBackgroundBlur:
      Number(settings.uiBackgroundBlur) >= 0
        ? Math.min(100, Number(settings.uiBackgroundBlur))
        : current.uiBackgroundBlur || current.backgroundBlur,
    markdownHeadingColors: normalizeHexColorList(
      settings.markdownHeadingColors,
      current.markdownHeadingColors || DEFAULT_MARKDOWN_HEADING_COLORS
    ),
    markdownHeadingSizes: normalizeMarkdownHeadingSizes(
      settings.markdownHeadingSizes,
      current.markdownHeadingSizes || DEFAULT_MARKDOWN_HEADING_SIZES
    ),
    limit5hResetTime: normalizeTimeString(
      settings.limit5hResetTime,
      current.limit5hResetTime || DEFAULT_LIMITS_SETTINGS.limit5hResetTime
    ),
    weeklyResetMonth: normalizeMonth(
      settings.weeklyResetMonth,
      current.weeklyResetMonth ?? DEFAULT_LIMITS_SETTINGS.weeklyResetMonth
    ),
    weeklyResetDay: normalizeDayOfMonth(
      settings.weeklyResetDay,
      current.weeklyResetDay ?? DEFAULT_LIMITS_SETTINGS.weeklyResetDay
    ),
    weeklyResetTime: normalizeTimeString(
      settings.weeklyResetTime,
      current.weeklyResetTime || DEFAULT_LIMITS_SETTINGS.weeklyResetTime
    ),
    limit5hNextResetAt:
      typeof settings.limit5hNextResetAt === "string" ? settings.limit5hNextResetAt : current.limit5hNextResetAt,
    weeklyNextResetAt:
      typeof settings.weeklyNextResetAt === "string" ? settings.weeklyNextResetAt : current.weeklyNextResetAt,
    limit5hBaselineTokenEstimate:
      Number.isFinite(Number(settings.limit5hBaselineTokenEstimate))
        ? Number(settings.limit5hBaselineTokenEstimate)
        : current.limit5hBaselineTokenEstimate,
    weeklyBaselineTokenEstimate:
      Number.isFinite(Number(settings.weeklyBaselineTokenEstimate))
        ? Number(settings.weeklyBaselineTokenEstimate)
        : current.weeklyBaselineTokenEstimate
  };
  nextSettings.markdownHeadingColor = nextSettings.markdownHeadingColors[0];
  nextSettings.markdownHeadingSizes = nextSettings.markdownHeadingSizes || DEFAULT_MARKDOWN_HEADING_SIZES;
  const nextModelIds = nextSettings.codexModels.map((item) => item.id);
  nextSettings.selectedLaunchModel = nextModelIds.includes(nextSettings.selectedLaunchModel)
    ? nextSettings.selectedLaunchModel
    : nextSettings.codexModels[0].id;
  nextSettings.usageModel = nextModelIds.includes(nextSettings.usageModel)
    ? nextSettings.usageModel
    : nextSettings.codexModels[0].id;
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
  return nextSettings;
}

async function getSystemStatus(directoryPath = "") {
  const targetPath = directoryPath || os.homedir();
  const userName = process.env.USER || os.userInfo().username || "unknown";

  try {
    const stats = await fs.statfs(targetPath);
    const blockSize = stats.bsize || stats.frsize || 0;
    const totalBytes = Number(stats.blocks || 0) * blockSize;
    const freeBytes = Number(stats.bavail || 0) * blockSize;

    return {
      userName,
      diskFreeGb: Math.round((freeBytes / 1024 ** 3) * 10) / 10,
      diskTotalGb: Math.round((totalBytes / 1024 ** 3) * 10) / 10
    };
  } catch {
    return {
      userName,
      diskFreeGb: 0,
      diskTotalGb: 0
    };
  }
}

async function getGitBranch(directoryPath = "") {
  const targetPath = directoryPath || "/";

  try {
    const { stdout } = await execFileAsync("git", ["-C", targetPath, "branch", "--show-current"]);
    const branch = stdout.trim();
    return branch || "-";
  } catch {
    return "-";
  }
}

function toRemoteBranchUrl(remoteUrl, branch) {
  const normalizedBranch = String(branch || "").trim();
  const normalizedRemoteUrl = String(remoteUrl || "").trim();
  if (!normalizedBranch || normalizedBranch === "-" || !normalizedRemoteUrl) {
    return "";
  }

  const withoutGit = normalizedRemoteUrl.replace(/\.git$/, "");

  if (withoutGit.startsWith("https://") || withoutGit.startsWith("http://")) {
    return `${withoutGit}/tree/${encodeURIComponent(normalizedBranch)}`;
  }

  const sshMatch = withoutGit.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}/tree/${encodeURIComponent(normalizedBranch)}`;
  }

  const sshUrlMatch = withoutGit.match(/^ssh:\/\/git@([^/]+)\/(.+)$/);
  if (sshUrlMatch) {
    return `https://${sshUrlMatch[1]}/${sshUrlMatch[2]}/tree/${encodeURIComponent(normalizedBranch)}`;
  }

  return "";
}

async function getTopStatus(directoryPath = "") {
  const targetPath = directoryPath || "/";
  const [systemStatus, gitBranch, remoteUrl] = await Promise.all([
    getSystemStatus(targetPath),
    getGitBranch(targetPath),
    execFileAsync("git", ["-C", targetPath, "remote", "get-url", "origin"])
      .then(({ stdout }) => stdout.trim())
      .catch(() => "")
  ]);

  return {
    userName: process.env.USER || systemStatus.userName || "unknown",
    diskFreeGb: systemStatus.diskFreeGb,
    diskTotalGb: systemStatus.diskTotalGb,
    gitBranch,
    remoteBranchUrl: toRemoteBranchUrl(remoteUrl, gitBranch)
  };
}

async function browseDirectory() {
  const window = BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(window, {
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: "" };
  }

  return { canceled: false, path: result.filePaths[0] };
}

function clearFileWatcher() {
  if (activeFileWatcher) {
    activeFileWatcher.close();
    activeFileWatcher = null;
  }
  activeWatchedPath = "";
}

function watchCurrentFile(filePath) {
  clearFileWatcher();

  if (!filePath) {
    return { ok: true };
  }

  activeWatchedPath = filePath;
  activeFileWatcher = watch(filePath, { persistent: false }, () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.isDestroyed() && activeWatchedPath === filePath) {
      window.webContents.send("fs:file-changed", filePath);
    }
  });

  return { ok: true };
}

ipcMain.handle("system:usage", async () => {
  try {
    console.log("[system:usage] invoked");
    const [load, mem, cpuInfo] = await Promise.all([si.currentLoad(), si.mem(), si.cpu()]);
    console.log("[system:usage] load =", load.currentLoad, "mem =", {
      active: mem.active,
      total: mem.total
    });
    return {
      cpuName: cpuInfo.brand || cpuInfo.manufacturer || os.cpus()?.[0]?.model || "",
      cpu: Math.round(load.currentLoad || 0),
      memoryUsedGb: Math.round((mem.active / 1024 ** 3) * 10) / 10,
      memoryTotalGb: Math.round((mem.total / 1024 ** 3) * 10) / 10,
      memoryPercent: Math.round((mem.active / mem.total) * 100 || 0)
    };
  } catch (error) {
    console.error("[system:usage] failed", error);
    return {
      cpuName: "",
      cpu: 0,
      memoryUsedGb: 0,
      memoryTotalGb: 0,
      memoryPercent: 0
    };
  }
});

ipcMain.handle("codex:stats", async () => {
  console.log("[codex:stats] invoked");
  const settings = await readSettings();
  return readCodexHistory(settings);
});
ipcMain.handle("settings:get", async () => readSettings());
ipcMain.handle("settings:save", async (_event, settings) => saveSettings(settings));
ipcMain.handle("system:status", async (_event, directoryPath) => getSystemStatus(directoryPath));
ipcMain.handle("system:get-top-status", async (_event, directoryPath) => getTopStatus(directoryPath));
ipcMain.handle("system:open-external-url", async (_event, url) => shell.openExternal(url));
ipcMain.handle("dialog:confirm-discard-unsaved", async (_event, count) => {
  const result = await dialog.showMessageBox({
    type: "warning",
    buttons: ["キャンセル", "続行"],
    defaultId: 0,
    cancelId: 0,
    title: "未保存の変更",
    message: `未保存のファイルが ${count} 件あります。`,
    detail: "ディレクトリを切り替えると、未保存の変更は破棄されます。続行しますか？"
  });

  return result.response === 1;
});
ipcMain.handle("fs:browse-directory", async () => browseDirectory());
ipcMain.handle("window:focus", async () => focusWindow());
ipcMain.handle("fs:root", async () => {
  const settings = await readSettings();
  return { path: settings.initialDirectory };
});
ipcMain.handle("fs:list", async (_event, dirPath) => listDirectory(dirPath));
ipcMain.handle("fs:watch", async (_event, filePath) => watchCurrentFile(filePath));
ipcMain.handle("fs:unwatch", async () => {
  clearFileWatcher();
  return { ok: true };
});
ipcMain.handle("fs:read", async (_event, filePath) => readFileContent(filePath));
ipcMain.handle("fs:save", async (_event, filePath, content) => saveFileContent(filePath, content));
ipcMain.handle("fs:rename", async (_event, filePath, nextName) => renameFilePath(filePath, nextName));
ipcMain.handle("fs:delete", async (_event, filePath) => deleteFilePath(filePath));
ipcMain.handle("fs:create-file", async (_event, directoryPath, nextName) => createFilePath(directoryPath, nextName));
ipcMain.handle("fs:create-file-from-buffer", async (_event, directoryPath, nextName, content) =>
  createFileFromBuffer(directoryPath, nextName, content)
);
ipcMain.handle("fs:create-directory", async (_event, directoryPath, nextName) =>
  createDirectoryPath(directoryPath, nextName)
);
ipcMain.handle("fs:move", async (_event, sourcePath, targetDirectoryPath) => moveEntryToDirectory(sourcePath, targetDirectoryPath));
ipcMain.handle("fs:copy-into", async (_event, sourcePath, targetDirectoryPath) =>
  copyEntryToDirectory(sourcePath, targetDirectoryPath)
);
ipcMain.handle("fs:reveal", async (_event, filePath) => revealInFinder(filePath));
ipcMain.handle("fs:copy-path", async (_event, filePath) => copyFullPath(filePath));
ipcMain.handle("codex:launch", async (_event, payload) =>
  launchCodex(payload.directoryPath, payload.model, payload.promptTemplate)
);
ipcMain.handle("terminal:run-command", async (_event, { command, cwd }) => {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd,
        shell: "/bin/zsh",
        timeout: 30000,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          exitCode: error?.code ?? 0,
          signal: error?.signal ?? null,
          timedOut: Boolean(error?.killed)
        });
      }
    );
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  clearFileWatcher();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
