import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  copyFilePath,
  copyFileToDirectory,
  createDirectory,
  createFile,
  deleteFile,
  focusWindow,
  listDirectory,
  moveFile,
  renameFile,
  revealFile
} from "../utils/fileLoader";
import { handleDragOver as handleExternalDragOver } from "../utils/drop";

const LARGE_DIRECTORY_THRESHOLD = 1000;
const ROW_HEIGHT = 24;
const TREE_STATE_KEY_PREFIX = "nightops:tree:expanded:";
const PREVIEWABLE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "mdown",
  "mkdn",
  "js",
  "jsx",
  "ts",
  "tsx",
  "json",
  "css",
  "html",
  "py",
  "swift",
  "yml",
  "yaml",
  "csv",
  "sh",
  "env",
  "toml",
  "xml",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "heic",
  "heif"
]);

function normalizeEntries(entries, parentPath) {
  return entries.map((entry) => ({ ...entry, parentPath }));
}

function getEntrySortKey(entry, mode) {
  if (mode === "ext") {
    return getFileNameParts(entry.name || "").ext.replace(/^\./, "").toLowerCase();
  }

  return entry.name || "";
}

function sortFiles(files, mode) {
  return [...files].sort((a, b) => {
    const aIsDir = a.type === "directory";
    const bIsDir = b.type === "directory";
    if (aIsDir !== bIsDir) {
      return aIsDir ? -1 : 1;
    }

    if (mode === "update") {
      const timeDiff = (Number(b.mtime) || 0) - (Number(a.mtime) || 0);
      if (timeDiff !== 0) {
        return timeDiff;
      }
    }

    if (mode === "ext") {
      const extDiff = getEntrySortKey(a, mode).localeCompare(getEntrySortKey(b, mode));
      if (extDiff !== 0) {
        return extDiff;
      }
      return (a.name || "").localeCompare(b.name || "");
    }

    const nameDiff = (a.name || "").localeCompare(b.name || "");
    if (nameDiff !== 0) {
      return nameDiff;
    }

    return (Number(b.mtime) || 0) - (Number(a.mtime) || 0);
  });
}

function buildVisibleRows(rootNode, expandedPaths, warningMap, sortMode) {
  if (!rootNode) {
    return [];
  }

  const rows = [];
  const stack = [{ node: rootNode, level: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    const { node, level } = current;
    const isExpanded = expandedPaths.has(node.path);

    rows.push({
      kind: "node",
      key: node.path,
      node,
      level,
      isExpanded
    });

    if (node.type !== "directory" || !isExpanded) {
      continue;
    }

    if (warningMap[node.path]) {
      rows.push({
        kind: "warning",
        key: `${node.path}::warning`,
        level: level + 1,
        message: `This directory contains over ${LARGE_DIRECTORY_THRESHOLD} items.`
      });
    }

    const children = sortFiles(Array.isArray(node.children) ? node.children : [], sortMode);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], level: level + 1 });
    }
  }

  return rows;
}

function flattenTree(rootNode, expandedPaths, warningMap, sortMode) {
  return buildVisibleRows(rootNode, expandedPaths, warningMap, sortMode);
}

function findNodeByPath(rootNode, targetPath) {
  if (!rootNode) {
    return null;
  }

  const stack = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.path === targetPath) {
      return node;
    }
    if (Array.isArray(node.children)) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]);
      }
    }
  }

  return null;
}

function getExpandedStateKey(rootPath) {
  return `${TREE_STATE_KEY_PREFIX}${rootPath}`;
}

function loadExpandedPaths(rootPath) {
  try {
    const raw = localStorage.getItem(getExpandedStateKey(rootPath));
    if (!raw) {
      return new Set(rootPath ? [rootPath] : []);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set(rootPath ? [rootPath] : []);
    }
    return new Set([rootPath, ...parsed].filter(Boolean));
  } catch {
    return new Set(rootPath ? [rootPath] : []);
  }
}

function saveExpandedPaths(rootPath, expandedPaths) {
  try {
    localStorage.setItem(getExpandedStateKey(rootPath), JSON.stringify(Array.from(expandedPaths || []).filter(Boolean)));
  } catch {
    return;
  }
}

function getFileTypeClass(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const baseName = fileName.toLowerCase();

  if (["js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "php", "sh", "bash", "zsh", "fish", "swift", "lua", "pl"].includes(ext)) {
    return "tree-file-script";
  }

  if (["json", "yaml", "yml", "toml", "ini", "conf", "config", "cfg", "env", "properties", "plist", "lock"].includes(ext) || baseName === ".gitignore") {
    return "tree-file-config";
  }

  if (["db", "sqlite", "sqlite3", "csv", "tsv", "parquet"].includes(ext)) {
    return "tree-file-data";
  }

  if (["md", "markdown", "mdown", "mkdn", "txt", "rst", "adoc", "rtf"].includes(ext)) {
    if (["md", "markdown", "mdown", "mkdn"].includes(ext)) {
      return "tree-file-markdown";
    }
    return "tree-file-doc";
  }

  if (["html", "htm", "xml", "css", "scss", "sass", "less", "svg"].includes(ext)) {
    return "tree-file-markup";
  }

  if (["pdf"].includes(ext)) {
    return "tree-file-pdf";
  }

  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "icns", "tiff", "heic", "heif"].includes(ext)) {
    return "tree-file-image";
  }

  if (["mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "m4a", "flac", "aac"].includes(ext)) {
    return "tree-file-media";
  }

  if (["zip", "tar", "gz", "tgz", "rar", "7z"].includes(ext)) {
    return "tree-file-archive";
  }

  if (["sql"].includes(ext)) {
    return "tree-file-sql";
  }

  return "tree-file-default";
}

function isPreviewableFile(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return PREVIEWABLE_EXTENSIONS.has(ext) || fileName.toLowerCase() === ".gitignore";
}

function getPathSegments(filePath) {
  return filePath.split("/").filter(Boolean);
}

function getDirectoryPath(filePath) {
  const segments = getPathSegments(filePath);
  if (segments.length <= 1) {
    return filePath;
  }
  return `/${segments.slice(0, -1).join("/")}`;
}

function getBaseName(filePath) {
  return getPathSegments(filePath).at(-1) || filePath;
}

function getFileNameParts(fileName) {
  const baseName = fileName || "";
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return { stem: baseName, ext: "" };
  }

  return {
    stem: baseName.slice(0, dotIndex),
    ext: baseName.slice(dotIndex)
  };
}

function remapPathWithinMovedTree(originalPath, sourcePath, destinationPath) {
  if (originalPath === sourcePath) {
    return destinationPath;
  }

  const prefix = `${sourcePath}/`;
  if (originalPath.startsWith(prefix)) {
    return `${destinationPath}${originalPath.slice(sourcePath.length)}`;
  }

  return originalPath;
}

function remapPathAcrossMoves(originalPath, moves) {
  return moves.reduce((currentPath, move) => remapPathWithinMovedTree(currentPath, move.sourcePath, move.destinationPath), originalPath);
}

function isSameOrDescendantPath(candidatePath, parentPath) {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`);
}

function uniquePaths(paths) {
  return Array.from(new Set(paths.filter(Boolean)));
}

function filterTopLevelPaths(paths) {
  const unique = uniquePaths(paths);
  return unique.filter((candidatePath) => !unique.some((otherPath) => otherPath !== candidatePath && isSameOrDescendantPath(candidatePath, otherPath)));
}

function getSelectionDirectoryPath(node) {
  if (!node) {
    return "";
  }

  return node.type === "directory" ? node.path : node.parentPath || "";
}

function getUniqueName(existingNames, baseName, extension = "") {
  const nameSet = new Set((existingNames || []).map((name) => String(name || "").toLowerCase()));
  const firstName = `${baseName}${extension}`;
  if (!nameSet.has(firstName.toLowerCase())) {
    return firstName;
  }

  let index = 2;
  while (true) {
    const nextName = `${baseName} ${index}${extension}`;
    if (!nameSet.has(nextName.toLowerCase())) {
      return nextName;
    }
    index += 1;
  }
}

function getEntryNamesFromNode(node) {
  if (!node || node.type !== "directory" || !Array.isArray(node.children)) {
    return null;
  }

  return node.children.map((child) => child.name).filter(Boolean);
}

async function bringWindowToFront() {
  try {
    await focusWindow();
  } catch {
    return;
  }
}

export default function FileTree({ rootPath, onSelectFile, selectedFilePath, reloadToken = 0, sortMode = "name", onDropFiles, onNotify }) {
  const TREE_CONTEXT_MENU_WIDTH = 220;
  const TREE_CONTEXT_MENU_HEIGHT = 320;
  const INLINE_EDITOR_MIN_WIDTH = 260;
  const INLINE_EDITOR_MAX_WIDTH = 420;
  const INLINE_EDITOR_HEIGHT = 88;
  const [tree, setTree] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(() => loadExpandedPaths(rootPath));
  const [warningMap, setWarningMap] = useState({});
  const [error, setError] = useState("");
  const [activePath, setActivePath] = useState(rootPath);
  const [selectedPaths, setSelectedPaths] = useState(() => new Set(rootPath ? [rootPath] : []));
  const [contextMenu, setContextMenu] = useState(null);
  const [renameDialog, setRenameDialog] = useState(null);
  const [createDialog, setCreateDialog] = useState(null);
  const [dragTargetPath, setDragTargetPath] = useState("");
  const [clipboardMode, setClipboardMode] = useState(null);
  const treeRootRef = useRef(null);
  const loadingExpandedPathRef = useRef("");
  const isInternalTreeDragRef = useRef(false);
  const pendingInternalDragPathsRef = useRef([]);
  const pendingSelectionPathsRef = useRef(null);
  const selectionAnchorPathRef = useRef(rootPath);
  const [anchorPath, setAnchorPath] = useState(rootPath || null);
  const clipboardRef = useRef({ mode: "", paths: [] });
  const rowElementRefs = useRef(new Map());
  const hoverExpandTimerRef = useRef(null);
  const inlineEditorInputRef = useRef(null);

  function closeContextMenu() {
    setContextMenu(null);
  }

  function clearDragState() {
    if (hoverExpandTimerRef.current) {
      clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }
    pendingInternalDragPathsRef.current = [];
    isInternalTreeDragRef.current = false;
    setDragTargetPath("");
  }

  function setSelectionPaths(nextPaths, options = {}) {
    const normalizedPaths = uniquePaths(Array.isArray(nextPaths) ? nextPaths : Array.from(nextPaths || []));
    const nextSet = new Set(normalizedPaths);
    setSelectedPaths(nextSet);
    if (!options.preserveActive && normalizedPaths.length > 0) {
      setActivePath(normalizedPaths[0]);
    }
    if (normalizedPaths.length > 0) {
      selectionAnchorPathRef.current = normalizedPaths[0];
      setAnchorPath(normalizedPaths[0]);
    }
  }

  function getSelectionPayload(pathValue) {
    return {
      path: pathValue,
      name: getBaseName(pathValue),
      directoryPath: getDirectoryPath(pathValue)
    };
  }

  function getSelectedItemsForDrag(node) {
    const selectedPathList = Array.from(selectedPaths);
    if (selectedPaths.has(node.path)) {
      return filterTopLevelPaths(selectedPathList);
    }
    return [node.path];
  }

  function isPathSelected(pathValue) {
    return selectedPaths.has(pathValue);
  }

  function getSelectedPathList() {
    return Array.from(selectedPaths);
  }

  function selectPath(pathValue, options = {}) {
    setSelectionPaths([pathValue], options);
    selectionAnchorPathRef.current = pathValue;
    setAnchorPath(pathValue);
  }

  function toggleSelectionPath(pathValue) {
    const nextPaths = new Set(selectedPaths);
    if (nextPaths.has(pathValue)) {
      nextPaths.delete(pathValue);
    } else {
      nextPaths.add(pathValue);
    }
    setSelectedPaths(nextPaths);
    selectionAnchorPathRef.current = pathValue;
    setAnchorPath(pathValue);
  }

  function toggleExpand(dirPath) {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }

  function openContextMenu(node, event) {
    event.preventDefault();
    event.stopPropagation();
    void bringWindowToFront();

    const x = Math.min(event.clientX, window.innerWidth - TREE_CONTEXT_MENU_WIDTH - 8);
    const y = Math.min(event.clientY, window.innerHeight - TREE_CONTEXT_MENU_HEIGHT - 8);

    if (!isPathSelected(node.path)) {
      selectPath(node.path, { preserveActive: true });
    }
    setActivePath(node.path);
    setContextMenu({
      x: Math.max(8, x),
      y: Math.max(8, y),
      node
    });
  }

  function getActiveNode() {
    return findNodeByPath(tree, activePath) || findNodeByPath(tree, rootPath);
  }

  function getInlineEditorPlacement(targetPath, fallbackPosition = {}) {
    const targetElement = targetPath ? rowElementRefs.current.get(targetPath) : null;
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, INLINE_EDITOR_MIN_WIDTH), INLINE_EDITOR_MAX_WIDTH);
      const x = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const y = Math.max(8, Math.min(rect.bottom + 2, window.innerHeight - INLINE_EDITOR_HEIGHT));
      return { x, y, width };
    }

    const width = Math.min(Math.max(Number(fallbackPosition.width) || INLINE_EDITOR_MIN_WIDTH, INLINE_EDITOR_MIN_WIDTH), INLINE_EDITOR_MAX_WIDTH);
    const xFallback = Number.isFinite(Number(fallbackPosition.x)) ? Number(fallbackPosition.x) : 8;
    const yFallback = Number.isFinite(Number(fallbackPosition.y)) ? Number(fallbackPosition.y) : 8;
    const x = Math.max(8, Math.min(xFallback, window.innerWidth - width - 8));
    const y = Math.max(8, Math.min(yFallback, window.innerHeight - INLINE_EDITOR_HEIGHT));
    return { x, y, width };
  }

  async function getExistingEntryNames(directoryPath, fallbackNode = null) {
    const targetNode = fallbackNode && fallbackNode.type === "directory"
      ? fallbackNode
      : findNodeByPath(tree, directoryPath);
    const namesFromTree = getEntryNamesFromNode(targetNode);
    if (namesFromTree) {
      return namesFromTree;
    }

    try {
      const entries = await listDirectory(directoryPath);
      return entries.map((entry) => entry.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  function getCreationDirectoryPath(targetNode = null) {
    const resolvedNode =
      targetNode && typeof targetNode === "object"
        ? targetNode
        : targetNode
          ? findNodeByPath(tree, targetNode)
          : getActiveNode();
    return getSelectionDirectoryPath(resolvedNode) || rootPath;
  }

  async function openCreateDialog(type, targetNode = null, fallbackPosition = null) {
    void bringWindowToFront();
    const directoryPath = getCreationDirectoryPath(targetNode);
    const placement = getInlineEditorPlacement(directoryPath, fallbackPosition || {});
    const existingNames = await getExistingEntryNames(directoryPath, targetNode);
    const value =
      type === "file"
        ? getUniqueName(existingNames, "untitled", ".txt")
        : getUniqueName(existingNames, "New Folder");
    setCreateDialog({
      type,
      directoryPath,
      value,
      error: "",
      ...placement
    });
  }

  async function submitCreateDialog() {
    if (!createDialog) {
      return;
    }

    const nextName = createDialog.value.trim();
    if (!nextName) {
      setCreateDialog((prev) => (prev ? { ...prev, error: "Name is required." } : prev));
      return;
    }

    try {
      const targetNode = findNodeByPath(tree, createDialog.directoryPath);
      const existingNames = await getExistingEntryNames(createDialog.directoryPath, targetNode);
      if (existingNames.some((name) => String(name || "").toLowerCase() === nextName.toLowerCase())) {
        setCreateDialog((prev) =>
          prev ? { ...prev, error: "A file or folder with this name already exists." } : prev
        );
        return;
      }

      await bringWindowToFront();
      if (createDialog.type === "file") {
        const created = await createFile(createDialog.directoryPath, nextName);
        pendingSelectionPathsRef.current = [created.path];
        setSelectionPaths([created.path]);
        setActivePath(created.path);
        onSelectFile(getSelectionPayload(created.path));
        await loadRoot();
      } else {
        const created = await createDirectory(createDialog.directoryPath, nextName);
        pendingSelectionPathsRef.current = [created.path];
        setSelectionPaths([created.path]);
        setActivePath(created.path);
        await loadRoot();
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.add(createDialog.directoryPath);
          next.add(created.path);
          return next;
        });
      }
      setCreateDialog(null);
    } catch (createError) {
      setCreateDialog((prev) =>
        prev ? { ...prev, error: createError?.message || "Failed to create entry" } : prev
      );
    }
  }

  async function renameNode(node) {
    closeContextMenu();
    await bringWindowToFront();
    const placement = getInlineEditorPlacement(node.path);
    setRenameDialog({
      node,
      value: node.name || "",
      originalName: node.name || "",
      error: "",
      ...placement
    });
  }

  async function renameSelectedNode(node = null) {
    const targetNode = node || findNodeByPath(tree, activePath) || findNodeByPath(tree, rootPath);
    if (!targetNode || targetNode.path === rootPath) {
      return;
    }
    await renameNode(targetNode);
  }

  function previewFile(pathValue) {
    const targetNode = findNodeByPath(tree, pathValue);
    if (!targetNode || targetNode.type !== "file") {
      return;
    }
    void bringWindowToFront();
    setActivePath(targetNode.path);
    onSelectFile(getSelectionPayload(targetNode.path));
  }

  function getClipboardSelectionPaths() {
    return filterTopLevelPaths(getSelectedPathList());
  }

  function getPasteTargetPath(node = null) {
    if (node) {
      return node.type === "directory" ? node.path : node.parentPath || rootPath;
    }
    const activeNode = getActiveNode();
    return getSelectionDirectoryPath(activeNode) || rootPath;
  }

  async function handleCopy() {
    await bringWindowToFront();
    clipboardRef.current = {
      mode: "copy",
      paths: getClipboardSelectionPaths()
    };
    setClipboardMode("copy");
    closeContextMenu();
  }

  async function handleCut() {
    await bringWindowToFront();
    clipboardRef.current = {
      mode: "cut",
      paths: getClipboardSelectionPaths()
    };
    setClipboardMode("cut");
    closeContextMenu();
  }

  function resolveConflictName(occupiedNames, name) {
    const { stem, ext } = getFileNameParts(name);
    let candidate = name;
    let index = 1;

    while (occupiedNames.has(candidate)) {
      candidate = `${stem} copy${index > 1 ? ` ${index}` : ""}${ext}`;
      index += 1;
    }

    occupiedNames.add(candidate);
    return candidate;
  }

  async function handlePaste(targetDirectoryPath) {
    await bringWindowToFront();
    const { mode, paths } = clipboardRef.current;
    if (!targetDirectoryPath || !mode || !paths.length) {
      return;
    }

    const existingEntries = await listDirectory(targetDirectoryPath);
    const occupiedNames = new Set(existingEntries.map((entry) => entry.name));
    const movedEntries = [];

    for (const sourcePath of paths) {
      const sourceName = getBaseName(sourcePath);
      const nextName = resolveConflictName(occupiedNames, sourceName);
      const sourceParentPath = getDirectoryPath(sourcePath);

      if (mode === "cut" && sourceParentPath === targetDirectoryPath) {
        continue;
      }

      try {
        if (mode === "copy") {
          const copiedEntry = await copyFileToDirectory(sourcePath, targetDirectoryPath);
          let finalEntry = copiedEntry;
          if (copiedEntry.name !== nextName) {
            finalEntry = await renameFile(copiedEntry.path, nextName);
          }
          movedEntries.push({
            sourcePath,
            destinationPath: finalEntry.path
          });
        } else if (mode === "cut") {
          const movedEntry = await moveFile(sourcePath, targetDirectoryPath);
          let finalEntry = movedEntry;
          if (movedEntry.name !== nextName) {
            finalEntry = await renameFile(movedEntry.path, nextName);
          }
          movedEntries.push({
            sourcePath,
            destinationPath: finalEntry.path
          });
        }
      } catch (pasteError) {
        console.error("Paste failed:", pasteError);
        onNotify?.(pasteError?.message || "Failed to paste items");
        throw pasteError;
      }
    }

    if (mode === "cut") {
      clipboardRef.current = { mode: null, paths: [] };
      setClipboardMode(null);
      if (movedEntries.length > 0) {
        updateSelectionAfterMove(movedEntries);
      }
    }

    await loadRoot();
  }

  async function pasteSelectionInto(node = null) {
    await bringWindowToFront();
    await handlePaste(getPasteTargetPath(node));
    closeContextMenu();
  }

  async function deleteSelectedNodes(nodes) {
    await bringWindowToFront();
    const topLevelPaths = filterTopLevelPaths(nodes.map((item) => item.path));
    if (topLevelPaths.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${topLevelPaths.length} item${topLevelPaths.length > 1 ? "s" : ""}?`);
    if (!confirmed) {
      return;
    }

    for (const pathValue of topLevelPaths) {
      if (pathValue === rootPath) {
        continue;
      }
      await deleteFile(pathValue);
    }

    if (selectedFilePath && topLevelPaths.includes(selectedFilePath)) {
      onSelectFile(null);
    }

    if (topLevelPaths.includes(activePath)) {
      setActivePath(rootPath);
    }

    pendingSelectionPathsRef.current = [rootPath];
    setSelectedPaths(new Set([rootPath]));
    selectionAnchorPathRef.current = rootPath;
    await loadRoot();
  }

  function updateSelectionAfterMove(moves) {
    const nextSelectedPaths = getSelectedPathList().map((pathValue) => remapPathAcrossMoves(pathValue, moves));
    pendingSelectionPathsRef.current = nextSelectedPaths;
    setSelectedPaths(new Set(nextSelectedPaths));

    const nextActivePath = remapPathAcrossMoves(activePath, moves);
    setActivePath(nextActivePath);

    if (selectedFilePath) {
      const nextSelectedPath = remapPathAcrossMoves(selectedFilePath, moves);
      if (nextSelectedPath !== selectedFilePath) {
        onSelectFile(getSelectionPayload(nextSelectedPath));
      }
    }
  }

  async function handleDropOnDirectory(targetDirectoryPath, dataTransfer) {
    await bringWindowToFront();
    const pendingDragPaths = pendingInternalDragPathsRef.current || [];
    if (pendingDragPaths.length > 0) {
      if (dataTransfer) {
        dataTransfer.dropEffect = "move";
      }
      const moveTargets = filterTopLevelPaths(pendingDragPaths);

      if (moveTargets.length === 0) {
        return;
      }

      if (moveTargets.some((sourcePath) => isSameOrDescendantPath(targetDirectoryPath, sourcePath))) {
        throw new Error("Cannot move into the selected item");
      }

      const movedEntries = [];
      for (const sourcePath of moveTargets) {
        const movedEntry = await moveFile(sourcePath, targetDirectoryPath);
        movedEntries.push({
          sourcePath,
          destinationPath: movedEntry.path
        });
      }

      if (movedEntries.length > 0) {
        updateSelectionAfterMove(movedEntries);
      }

      await loadRoot();
      setDragTargetPath("");
      return;
    }

    const files = dataTransfer?.files;
    if (files && files.length > 0 && onDropFiles) {
      await onDropFiles(files, targetDirectoryPath);
      setDragTargetPath("");
      return;
    }

    if (!files || files.length === 0) {
      setDragTargetPath("");
      return;
    }
  }

  async function loadRoot() {
    try {
      setError("");
      const entries = await listDirectory(rootPath);
      const initialExpandedMap = loadExpandedPaths(rootPath);
      setTree({
        name: rootPath.split("/").filter(Boolean).pop() || rootPath,
        path: rootPath,
        type: "directory",
        parentPath: rootPath,
        children: normalizeEntries(entries, rootPath)
      });
      setExpandedPaths(initialExpandedMap);
      setWarningMap({
        [rootPath]: entries.length > LARGE_DIRECTORY_THRESHOLD
      });
      setActivePath((prev) => prev || rootPath);
      const nextSelectionPaths =
        pendingSelectionPathsRef.current || (selectedFilePath ? [selectedFilePath] : [rootPath]);
      setSelectedPaths(new Set(nextSelectionPaths));
      pendingSelectionPathsRef.current = null;
    } catch (loadError) {
      setTree(null);
      setError(loadError?.message || "Failed to load tree");
    }
  }

  useEffect(() => {
    setActivePath(selectedFilePath || rootPath);
    if (pendingSelectionPathsRef.current) {
      return;
    }
    setSelectedPaths(new Set(selectedFilePath ? [selectedFilePath] : rootPath ? [rootPath] : []));
    if (selectedFilePath || rootPath) {
      const nextAnchor = selectedFilePath || rootPath;
      selectionAnchorPathRef.current = nextAnchor;
      setAnchorPath(nextAnchor);
    }
  }, [rootPath, selectedFilePath]);

  useEffect(() => {
    loadRoot();
  }, [rootPath, reloadToken]);

  useEffect(() => {
    if (!rootPath) {
      return;
    }
    saveExpandedPaths(rootPath, expandedPaths);
  }, [expandedPaths, rootPath]);

  useEffect(() => {
    async function loadExpandedChildren() {
      if (!tree) {
        return;
      }

      const rows = buildVisibleRows(tree, expandedPaths, warningMap, sortMode);
      const pendingRow = rows.find((row) => {
        if (row.kind !== "node" || row.node.type !== "directory" || !row.isExpanded) {
          return false;
        }
        if (row.node.path === rootPath) {
          return false;
        }
        return !Array.isArray(row.node.children);
      });

      if (!pendingRow) {
        return;
      }

      if (loadingExpandedPathRef.current === pendingRow.node.path) {
        return;
      }

      loadingExpandedPathRef.current = pendingRow.node.path;
      try {
        await handleToggle(pendingRow.node.path, true);
      } finally {
        loadingExpandedPathRef.current = "";
      }
    }

    loadExpandedChildren();
  }, [expandedPaths, rootPath, tree, warningMap, sortMode]);

  async function handleToggle(dirPath, forceExpand = false) {
    const nextExpanded = forceExpand ? true : !expandedPaths.has(dirPath);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (nextExpanded) {
        next.add(dirPath);
      } else {
        next.delete(dirPath);
      }
      return next;
    });

    if (!nextExpanded) {
      return;
    }

    const targetNode = findNodeByPath(tree, dirPath);
    const needsLoad = targetNode ? !Array.isArray(targetNode.children) : false;

    if (!needsLoad) {
      return;
    }

    let entries = [];
    try {
      entries = await listDirectory(dirPath);
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Failed to load tree");
      return;
    }

    const children = normalizeEntries(entries, dirPath);

    setWarningMap((prev) => ({
      ...prev,
      [dirPath]: entries.length > LARGE_DIRECTORY_THRESHOLD
    }));

    setTree((prev) => {
      if (!prev) {
        return prev;
      }

      const rootCopy = { ...prev };
      const stack = [rootCopy];

      while (stack.length > 0) {
        const node = stack.pop();
        if (node.path === dirPath) {
          node.children = children;
          break;
        }

        if (Array.isArray(node.children)) {
          node.children = node.children.map((child) => ({ ...child }));
          for (let index = node.children.length - 1; index >= 0; index -= 1) {
            stack.push(node.children[index]);
          }
        }
      }

      return rootCopy;
    });
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    function handleWindowPointerDown() {
      closeContextMenu();
    }

    window.addEventListener("pointerdown", handleWindowPointerDown);
    return () => {
      window.removeEventListener("pointerdown", handleWindowPointerDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!renameDialog && !createDialog) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      inlineEditorInputRef.current?.focus();
      inlineEditorInputRef.current?.select?.();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [createDialog, renameDialog]);

  useEffect(() => {
    if (!renameDialog && !createDialog) {
      return undefined;
    }

    function handleInlineEditorPointerDown() {
      setRenameDialog(null);
      setCreateDialog(null);
    }

    function handleInlineEditorKeyDown(event) {
      if (event.key === "Escape") {
        setRenameDialog(null);
        setCreateDialog(null);
      }
    }

    window.addEventListener("pointerdown", handleInlineEditorPointerDown);
    window.addEventListener("keydown", handleInlineEditorKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handleInlineEditorPointerDown);
      window.removeEventListener("keydown", handleInlineEditorKeyDown);
    };
  }, [createDialog, renameDialog]);

  async function handleRename(node) {
    closeContextMenu();
    await bringWindowToFront();
    setRenameDialog({
      node,
      value: node.name || "",
      originalName: node.name || ""
    });
  }

  async function handleDelete(node) {
    closeContextMenu();
    const nodesToDelete = isPathSelected(node.path) ? getSelectedPathList().map((pathValue) => findNodeByPath(tree, pathValue)).filter(Boolean) : [node];
    await deleteSelectedNodes(nodesToDelete);
  }

  async function handleReveal(node) {
    closeContextMenu();
    await bringWindowToFront();
    await revealFile(node.path);
  }

  async function handleCopyPath(node) {
    closeContextMenu();
    await bringWindowToFront();
    await copyFilePath(node.path);
  }

  function handleDragStart(node, event) {
    closeContextMenu();
    if (node.type === "directory" && node.path === rootPath) {
      event.preventDefault();
      return;
    }

    const dragPaths = getSelectedItemsForDrag(node);
    isInternalTreeDragRef.current = true;
    pendingInternalDragPathsRef.current = dragPaths;
    event.dataTransfer.effectAllowed = "move";
    if (!selectedPaths.has(node.path)) {
      setSelectionPaths([node.path], { preserveActive: true });
      setActivePath(node.path);
    }
  }

  function handleDragOver(targetPath, event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = pendingInternalDragPathsRef.current.length > 0 ? "move" : "copy";
    setDragTargetPath(targetPath);
  }

  function handleDragEnter(targetPath, event) {
    if (hoverExpandTimerRef.current) {
      clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }

    if (pendingInternalDragPathsRef.current.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDragTargetPath(targetPath);
      const targetNode = findNodeByPath(tree, targetPath);
      if (targetNode?.type === "directory" && !expandedPaths.has(targetPath)) {
        hoverExpandTimerRef.current = setTimeout(() => {
          handleToggle(targetPath, true);
        }, 500);
      }
      return;
    }

    handleExternalDragOver(event);
    event.dataTransfer.dropEffect = "copy";
    setDragTargetPath(targetPath);
    const targetNode = findNodeByPath(tree, targetPath);
    if (targetNode?.type === "directory" && !expandedPaths.has(targetPath)) {
      hoverExpandTimerRef.current = setTimeout(() => {
        handleToggle(targetPath, true);
      }, 500);
    }
  }

  function handleDragLeave(targetPath, event) {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    if (hoverExpandTimerRef.current) {
      clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }

    if (dragTargetPath === targetPath) {
      setDragTargetPath("");
    }
  }

  async function handleDrop(targetPath, event) {
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();

    try {
      await handleDropOnDirectory(targetPath, event.dataTransfer);
    } catch (dropError) {
      setError(dropError?.message || "Failed to drop items");
    } finally {
      clearDragState();
    }
  }

  async function submitRename() {
    if (!renameDialog) {
      return;
    }

    const nextName = renameDialog.value.trim();
    if (!nextName || nextName === renameDialog.originalName) {
      setRenameDialog(null);
      return;
    }

    try {
      const parentPath = renameDialog.node.parentPath || rootPath;
      const existingNames = await getExistingEntryNames(parentPath, findNodeByPath(tree, parentPath));
      const currentNameKey = String(renameDialog.originalName || renameDialog.node.name || "").toLowerCase();
      const conflictExists = existingNames.some((name) => {
        const nameKey = String(name || "").toLowerCase();
        return nameKey === nextName.toLowerCase() && nameKey !== currentNameKey;
      });
      if (conflictExists) {
        setRenameDialog((prev) =>
          prev ? { ...prev, error: "A file or folder with this name already exists." } : prev
        );
        return;
      }

      const renamed = await renameFile(renameDialog.node.path, nextName);
      if (selectedFilePath === renameDialog.node.path) {
        onSelectFile(renamed);
      }
      if (activePath === renameDialog.node.path) {
        setActivePath(renamed.path);
      }
      setRenameDialog(null);
      await loadRoot();
    } catch (renameError) {
      setRenameDialog((prev) =>
        prev ? { ...prev, error: renameError?.message || "Failed to rename entry" } : prev
      );
    }
  }

  const visibleNodes = useMemo(() => flattenTree(tree, expandedPaths, warningMap, sortMode), [tree, expandedPaths, warningMap, sortMode]);
  const rows = visibleNodes;
  const selectedPathList = useMemo(() => Array.from(selectedPaths), [selectedPaths]);
  const dragTargetNode = dragTargetPath ? visibleNodes.find((row) => row.kind === "node" && row.node.path === dragTargetPath)?.node || null : null;
  const dragTargetLabel = dragTargetNode
    ? dragTargetNode.path === rootPath
      ? "ここにドロップ"
      : `ここにドロップ: ${dragTargetNode.name}`
    : "";

  function setRowElementRef(pathValue) {
    return (element) => {
      if (element) {
        rowElementRefs.current.set(pathValue, element);
        return;
      }
      rowElementRefs.current.delete(pathValue);
    };
  }

  useEffect(() => {
    const targetElement = rowElementRefs.current.get(activePath);
    if (!targetElement) {
      return;
    }

    targetElement.scrollIntoView({ block: "nearest" });
  }, [activePath, visibleNodes]);

  function selectRangeToPath(targetPath) {
    const visibleNodes = rows.filter((row) => row.kind === "node").map((row) => row.node.path);
    const anchorPathValue = anchorPath || selectionAnchorPathRef.current || activePath || targetPath;
    const anchorIndex = visibleNodes.indexOf(anchorPathValue);
    const targetIndex = visibleNodes.indexOf(targetPath);

    if (anchorIndex === -1 || targetIndex === -1) {
      setSelectionPaths([targetPath], { preserveActive: true });
      selectionAnchorPathRef.current = targetPath;
      setAnchorPath(targetPath);
      return;
    }

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    setSelectionPaths(visibleNodes.slice(start, end + 1), { preserveActive: true });
    setAnchorPath(anchorPathValue);
    selectionAnchorPathRef.current = anchorPathValue;
  }

  function openFileNode(node) {
    setActivePath(node.path);
    onSelectFile({
      path: node.path,
      name: node.name,
      directoryPath: node.parentPath
    });
  }

  function moveFocusByOffset(offset, { extendSelection = false, preserveSelection = false } = {}) {
    const visibleNodes = rows.filter((row) => row.kind === "node").map((row) => row.node.path);
    if (visibleNodes.length === 0) {
      return;
    }

    const currentIndex = Math.max(0, visibleNodes.indexOf(activePath));
    const nextIndex = Math.min(Math.max(currentIndex + offset, 0), visibleNodes.length - 1);
    const nextPath = visibleNodes[nextIndex];

    if (extendSelection) {
      selectRangeToPath(nextPath);
    } else if (!preserveSelection) {
      selectPath(nextPath, { preserveActive: true });
    }

    setActivePath(nextPath);
    if (!extendSelection && !preserveSelection) {
      selectionAnchorPathRef.current = nextPath;
      setAnchorPath(nextPath);
    }
  }

  function moveFocusToEdge(position, { extendSelection = false, preserveSelection = false } = {}) {
    const visibleNodes = rows.filter((row) => row.kind === "node").map((row) => row.node.path);
    if (visibleNodes.length === 0) {
      return;
    }

    const nextPath = position === "start" ? visibleNodes[0] : visibleNodes.at(-1);
    if (!nextPath) {
      return;
    }

    if (extendSelection) {
      selectRangeToPath(nextPath);
    } else if (!preserveSelection) {
      selectPath(nextPath, { preserveActive: true });
    }

    setActivePath(nextPath);
    if (!extendSelection && !preserveSelection) {
      selectionAnchorPathRef.current = nextPath;
      setAnchorPath(nextPath);
    }
  }

  function moveFocusByPage(direction, { extendSelection = false, preserveSelection = false } = {}) {
    const visibleNodes = rows.filter((row) => row.kind === "node").map((row) => row.node.path);
    if (visibleNodes.length === 0) {
      return;
    }

    const currentIndex = Math.max(0, visibleNodes.indexOf(activePath));
    const rowHeight = 24;
    const viewportRows = Math.max(1, Math.floor((treeRootRef.current?.clientHeight || 240) / rowHeight) - 1);
    const offset = viewportRows * direction;
    const nextIndex = Math.min(Math.max(currentIndex + offset, 0), visibleNodes.length - 1);
    const nextPath = visibleNodes[nextIndex];

    if (extendSelection) {
      selectRangeToPath(nextPath);
    } else if (!preserveSelection) {
      selectPath(nextPath, { preserveActive: true });
    }

    setActivePath(nextPath);
    if (!extendSelection && !preserveSelection) {
      selectionAnchorPathRef.current = nextPath;
      setAnchorPath(nextPath);
    }
  }

  function moveFocusToParent({ extendSelection = false, preserveSelection = false } = {}) {
    const currentNode = findNodeByPath(tree, activePath);
    if (!currentNode || !currentNode.parentPath) {
      return;
    }

    const nextPath = currentNode.parentPath;
    if (extendSelection) {
      selectRangeToPath(nextPath);
    } else if (!preserveSelection) {
      selectPath(nextPath, { preserveActive: true });
    }

    setActivePath(nextPath);
    if (!extendSelection && !preserveSelection) {
      selectionAnchorPathRef.current = nextPath;
      setAnchorPath(nextPath);
    }
  }

  function moveFocusToFirstChild({ extendSelection = false, preserveSelection = false } = {}) {
    const currentIndex = rows.findIndex((row) => row.kind === "node" && row.node.path === activePath);
    if (currentIndex === -1) {
      return;
    }

    const currentRow = rows[currentIndex];
    if (!currentRow || currentRow.kind !== "node" || currentRow.node.type !== "directory") {
      return;
    }

    if (!currentRow.isExpanded) {
      return;
    }

    const nextRow = rows.slice(currentIndex + 1).find((row) => row.kind === "node" && row.level === currentRow.level + 1);
    if (!nextRow) {
      return;
    }

    if (extendSelection) {
      selectRangeToPath(nextRow.node.path);
    } else if (!preserveSelection) {
      selectPath(nextRow.node.path, { preserveActive: true });
    }

    setActivePath(nextRow.node.path);
    if (!extendSelection && !preserveSelection) {
      selectionAnchorPathRef.current = nextRow.node.path;
      setAnchorPath(nextRow.node.path);
    }
  }

  async function handleTreeKeyDown(event) {
    const visibleNodes = rows.filter((row) => row.kind === "node");
    const currentIndex = visibleNodes.findIndex((row) => row.node.path === activePath);
    const currentRow = currentIndex >= 0 ? visibleNodes[currentIndex] : visibleNodes[0];

    if (!currentRow) {
      return;
    }

    const isShift = event.shiftKey;
    const isModifierMoveOnly = event.metaKey || event.ctrlKey;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (isShift) {
        moveFocusByOffset(1, { extendSelection: true });
        return;
      }
      if (isModifierMoveOnly) {
        moveFocusByOffset(1, { preserveSelection: true });
        return;
      }
      moveFocusByOffset(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (isShift) {
        moveFocusByOffset(-1, { extendSelection: true });
        return;
      }
      if (isModifierMoveOnly) {
        moveFocusByOffset(-1, { preserveSelection: true });
        return;
      }
      moveFocusByOffset(-1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (isShift) {
        if (currentRow.node.type === "directory" && !currentRow.isExpanded) {
          await handleToggle(currentRow.node.path, true);
          selectRangeToPath(currentRow.node.path);
        } else {
          moveFocusToFirstChild({ extendSelection: true });
        }
        return;
      }
      if (isModifierMoveOnly) {
        moveFocusToFirstChild({ preserveSelection: true });
        return;
      }
      if (currentRow.node.type === "directory") {
        if (!currentRow.isExpanded) {
          await handleToggle(currentRow.node.path, true);
          return;
        }
        moveFocusToFirstChild();
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (isShift) {
        moveFocusToParent({ extendSelection: true });
        return;
      }
      if (isModifierMoveOnly) {
        moveFocusToParent({ preserveSelection: true });
        return;
      }
      if (currentRow.node.type === "directory" && currentRow.isExpanded) {
        await handleToggle(currentRow.node.path);
        return;
      }
      if (currentRow.node.parentPath && currentRow.node.path !== rootPath) {
        setActivePath(currentRow.node.parentPath);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (currentRow.node.type === "directory") {
        await handleToggle(currentRow.node.path);
        return;
      }
      openFileNode(currentRow.node);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      previewFile(activePath);
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      await renameSelectedNode(currentRow.node);
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const selectedNodes = getSelectedPathList()
        .map((pathValue) => findNodeByPath(tree, pathValue))
        .filter(Boolean);
      await deleteSelectedNodes(selectedNodes.length > 0 ? selectedNodes : [currentRow.node]);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      await handleCopy();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
      event.preventDefault();
      await handleCut();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      await pasteSelectionInto(currentRow.node);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (isShift) {
        moveFocusToEdge("start", { extendSelection: true });
        return;
      }
      if (isModifierMoveOnly) {
        moveFocusToEdge("start", { preserveSelection: true });
        return;
      }
      moveFocusToEdge("start");
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (isShift) {
        moveFocusToEdge("end", { extendSelection: true });
        return;
      }
      if (isModifierMoveOnly) {
        moveFocusToEdge("end", { preserveSelection: true });
        return;
      }
      moveFocusToEdge("end");
      return;
    }

    if (event.key === "PageDown") {
      event.preventDefault();
      if (isShift) {
        moveFocusByPage(1, { extendSelection: true });
        return;
      }
      if (isModifierMoveOnly) {
        moveFocusByPage(1, { preserveSelection: true });
        return;
      }
      moveFocusByPage(1);
      return;
    }

    if (event.key === "PageUp") {
      event.preventDefault();
      if (isShift) {
        moveFocusByPage(-1, { extendSelection: true });
        return;
      }
      if (isModifierMoveOnly) {
        moveFocusByPage(-1, { preserveSelection: true });
        return;
      }
      moveFocusByPage(-1);
    }
  }

  const renderRow = useCallback(
    (row) => {
      if (row.kind === "warning") {
        return (
          <div
            key={row.key}
            className="tree-row"
            style={{ height: `${ROW_HEIGHT}px`, paddingLeft: `${10 + row.level * 14}px`, color: "var(--orange)" }}
          >
            <span className="tree-icon">!</span>
            <span className="tree-name">{row.message}</span>
          </div>
        );
      }

      const { node, level, isExpanded } = row;
      const isSelected = selectedPaths.has(node.path);
      const isActive = activePath === node.path;
      const isDropTarget = dragTargetPath === node.path;
      const isClipboardCut = clipboardMode === "cut" && clipboardRef.current.paths.includes(node.path);
      const rowClassName = `tree-row ${node.type === "directory" ? "tree-row-directory" : `tree-row-file ${getFileTypeClass(node.name)} ${isPreviewableFile(node.name) ? "" : "tree-row-unpreviewable"}`} ${node.ignored ? "tree-row-ignored" : ""} ${isSelected ? "selected" : ""} ${isActive ? "active" : ""} ${isDropTarget ? "tree-row-drop-target" : ""} ${isClipboardCut ? "tree-row-cut" : ""}`;

      if (node.path === rootPath) {
        return (
          <div
            key={row.key}
            ref={setRowElementRef(node.path)}
            className={`tree-row tree-row-root ${node.ignored ? "tree-row-ignored" : ""} ${isSelected ? "selected" : ""} ${isActive ? "active" : ""} ${isDropTarget ? "tree-row-drop-target" : ""}`}
            style={{ height: `${ROW_HEIGHT}px`, paddingLeft: `${10 + level * 14}px` }}
          >
            <button
              type="button"
              className={`tree-row-main ${node.type === "directory" ? "tree-row-directory" : `tree-row-file ${getFileTypeClass(node.name)} ${isPreviewableFile(node.name) ? "" : "tree-row-unpreviewable"}`}`}
              onClick={(event) => {
                const isMultiSelectToggle = event.metaKey || event.ctrlKey;
                const isRangeSelect = event.shiftKey;
                treeRootRef.current?.focus();
                if (isRangeSelect) {
                  selectRangeToPath(node.path);
                  setActivePath(node.path);
                  return;
                }
                if (isMultiSelectToggle) {
                  toggleSelectionPath(node.path);
                  setActivePath(node.path);
                  return;
                }

                selectPath(node.path, { preserveActive: true });
                setActivePath(node.path);
                if (node.type === "directory") {
                  handleToggle(node.path);
                }
              }}
              onDragStart={(event) => handleDragStart(node, event)}
              onDragEnd={clearDragState}
              onDragEnter={(event) => handleDragEnter(node.path, event)}
              onDragOver={(event) => handleDragOver(node.path, event)}
              onDragLeave={(event) => handleDragLeave(node.path, event)}
              onDrop={(event) => handleDrop(node.path, event)}
              onContextMenu={(event) => openContextMenu(node, event)}
            >
              <span className="tree-icon">{node.type === "directory" ? (isExpanded ? "v" : ">") : ""}</span>
              <span className="tree-name">{node.name}</span>
            </button>
            <div className="tree-row-actions">
              <button
                type="button"
                className="tree-row-action-button"
                title="新規ファイル"
                aria-label="新規ファイル"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openCreateDialog("file", node);
                }}
              >
                <span className="tree-action-icon tree-action-icon-file" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="tree-row-action-button"
                title="新規フォルダ"
                aria-label="新規フォルダ"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openCreateDialog("directory", node);
                }}
              >
                <span className="tree-action-icon tree-action-icon-folder" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      }

      return (
        <button
          key={row.key}
          ref={setRowElementRef(node.path)}
          draggable={node.path !== rootPath}
          className={rowClassName}
          style={{ height: `${ROW_HEIGHT}px`, paddingLeft: `${10 + level * 14}px` }}
          onClick={(event) => {
            const isMultiSelectToggle = event.metaKey || event.ctrlKey;
            const isRangeSelect = event.shiftKey;
            treeRootRef.current?.focus();
            if (isRangeSelect) {
              selectRangeToPath(node.path);
              setActivePath(node.path);
              return;
            }
            if (isMultiSelectToggle) {
              event.preventDefault();
              event.stopPropagation();
              toggleSelectionPath(node.path);
              setActivePath(node.path);
              return;
            }

            selectPath(node.path, { preserveActive: true });
            if (node.type === "directory") {
              setActivePath(node.path);
              handleToggle(node.path);
              return;
            }
            openFileNode(node);
          }}
          onDragStart={(event) => handleDragStart(node, event)}
          onDragEnd={clearDragState}
          onDragEnter={
            node.type === "directory"
              ? (event) => handleDragEnter(node.path, event)
              : (event) => {
                  const targetDirectoryPath = node.parentPath || rootPath;
                  handleExternalDragOver(event);
                  event.dataTransfer.dropEffect = "copy";
                  setDragTargetPath(targetDirectoryPath);
                }
          }
          onDragOver={
            node.type === "directory"
              ? (event) => handleDragOver(node.path, event)
              : (event) => {
                  const targetDirectoryPath = node.parentPath || rootPath;
                  handleExternalDragOver(event);
                  event.dataTransfer.dropEffect = "copy";
                  setDragTargetPath(targetDirectoryPath);
                }
          }
          onDragLeave={
            node.type === "directory"
              ? (event) => handleDragLeave(node.path, event)
              : (event) => {
                  if (dragTargetPath === (node.parentPath || rootPath)) {
                    setDragTargetPath("");
                  }
                  event.stopPropagation();
                }
          }
          onDrop={
            node.type === "directory"
              ? (event) => handleDrop(node.path, event)
              : (event) => {
                  handleDrop(node.parentPath || rootPath, event);
                }
          }
          onContextMenu={(event) => openContextMenu(node, event)}
        >
          <span className="tree-icon">{node.type === "directory" ? (isExpanded ? "v" : ">") : ""}</span>
          <span className="tree-name">{node.name}</span>
        </button>
      );
    },
    [
      activePath,
      clearDragState,
      dragTargetPath,
      getFileTypeClass,
      handleExternalDragOver,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      handleDragStart,
      handleToggle,
      isPreviewableFile,
      openContextMenu,
      openCreateDialog,
      openFileNode,
      rootPath,
      selectRangeToPath,
      selectedPaths,
      setActivePath,
      setDragTargetPath,
      toggleSelectionPath
    ]
  );

  if (error) {
    return <div className="panel-empty">{error}</div>;
  }

  if (!tree) {
    return <div className="panel-empty">Loading tree...</div>;
  }

  return (
    <div
      className={`tree-root ${dragTargetPath === rootPath ? "tree-root-drop-target" : ""}`}
    >
      {dragTargetNode ? <div className="tree-drop-indicator">{dragTargetLabel}</div> : null}
      <div
        ref={treeRootRef}
        className="tree-virtual-viewport"
        tabIndex={0}
        onKeyDown={handleTreeKeyDown}
        onDragEnd={clearDragState}
        onDragEnter={(event) => handleDragEnter(rootPath, event)}
        onDragOver={(event) => handleDragOver(rootPath, event)}
        onDragLeave={(event) => {
          handleDragLeave(rootPath, event);
          if (event.currentTarget === event.target) {
            clearDragState();
          }
        }}
        onDrop={(event) => handleDrop(rootPath, event)}
      >
        <div className="tree-virtual-list">{visibleNodes.map((row) => renderRow(row))}</div>
      </div>
      {contextMenu && typeof document !== "undefined" ? createPortal(
        <div
          className="tree-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" className="tree-context-menu-item" onClick={() => {
            closeContextMenu();
            selectPath(contextMenu.node.path, { preserveActive: true });
            setActivePath(contextMenu.node.path);
            openCreateDialog("file", contextMenu.node, { x: contextMenu.x, y: contextMenu.y });
          }}>
            新規ファイル
          </button>
          <button type="button" className="tree-context-menu-item" onClick={() => {
            closeContextMenu();
            selectPath(contextMenu.node.path, { preserveActive: true });
            setActivePath(contextMenu.node.path);
            openCreateDialog("directory", contextMenu.node, { x: contextMenu.x, y: contextMenu.y });
          }}>
            新規フォルダ
          </button>
          <button type="button" className="tree-context-menu-item" onClick={() => handleRename(contextMenu.node)}>
            Rename
          </button>
          <button type="button" className="tree-context-menu-item danger" onClick={() => handleDelete(contextMenu.node)}>
            Delete
          </button>
          <button type="button" className="tree-context-menu-item" onClick={handleCopy}>
            Copy
          </button>
          <button type="button" className="tree-context-menu-item" onClick={handleCut}>
            Cut
          </button>
          <button type="button" className="tree-context-menu-item" onClick={() => pasteSelectionInto(contextMenu.node)}>
            Paste
          </button>
          <button type="button" className="tree-context-menu-item" onClick={() => handleReveal(contextMenu.node)}>
            Finderで表示
          </button>
          <button type="button" className="tree-context-menu-item" onClick={() => handleCopyPath(contextMenu.node)}>
            フルパスをコピー
          </button>
        </div>,
        document.body
      ) : null}
      {renameDialog && typeof document !== "undefined" ? createPortal(
        <div
          className="tree-inline-editor-portal tree-inline-editor-rename"
          style={{ left: renameDialog.x, top: renameDialog.y, width: renameDialog.width }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <input
            ref={inlineEditorInputRef}
            className="tree-inline-editor-input tree-rename-input"
            value={renameDialog.value}
            onChange={(event) =>
              setRenameDialog((prev) => (prev ? { ...prev, value: event.target.value, error: "" } : prev))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setRenameDialog(null);
              }
            }}
          />
          {renameDialog.error ? <div className="tree-inline-editor-error">{renameDialog.error}</div> : null}
          <div className="tree-inline-editor-actions">
            <button type="button" className="tree-context-menu-item" onClick={submitRename}>
              Rename
            </button>
            <button type="button" className="tree-context-menu-item" onClick={() => setRenameDialog(null)}>
              Cancel
            </button>
          </div>
        </div>,
        document.body
      ) : null}
      {createDialog && typeof document !== "undefined" ? createPortal(
        <>
          <div className="modal-backdrop tree-inline-editor-backdrop" onPointerDown={() => setCreateDialog(null)} />
          <div
            className="tree-inline-editor-portal tree-inline-editor-create"
            style={{ left: createDialog.x, top: createDialog.y, width: createDialog.width }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <input
              ref={inlineEditorInputRef}
              className="tree-inline-editor-input tree-rename-input"
              value={createDialog.value}
              onChange={(event) =>
                setCreateDialog((prev) => (prev ? { ...prev, value: event.target.value, error: "" } : prev))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitCreateDialog();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCreateDialog(null);
                }
              }}
            />
            {createDialog.error ? <div className="tree-inline-editor-error">{createDialog.error}</div> : null}
            <div className="tree-inline-editor-actions">
              <button type="button" className="tree-context-menu-item" onClick={submitCreateDialog}>
                Create
              </button>
              <button type="button" className="tree-context-menu-item" onClick={() => setCreateDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        </>,
        document.body
      ) : null}
    </div>
  );
}
