import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import swift from "highlight.js/lib/languages/swift";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import "highlight.js/styles/github-dark.css";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker?url";
import CopyButton from "./markdown/CopyButton";
import CodeBlockRenderer from "./markdown/renderers/CodeBlockRenderer";
import { parseFenceMeta } from "../utils/markdown/fenceMeta";
import { listDirectory, onFileChanged, readFile, saveFile, unwatchFile, watchFile } from "../utils/fileLoader";

const MAX_CSV_ROWS = 1000;
const RECENT_FILES_KEY = "nightops:recent-files";
const MAX_RECENT_FILES = 10;
const MAX_PDF_DIMENSION = 1200;
const IMAGE_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "heic", "heif"]);
const MARKDOWN_FILE_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkdn"]);
const MARKDOWN_FOLD_STORAGE_PREFIX = "nightops:markdown-fold";
const MARKDOWN_OUTLINE_PANE_VISIBLE_KEY = "nightops:markdown:outline-pane-visible";
const MARKDOWN_OUTLINE_WIDTH_KEY = "nightops:markdown:outline-width";
const MARKDOWN_OUTLINE_MIN_WIDTH = 160;
const MARKDOWN_OUTLINE_MAX_WIDTH = 600;
const MARKDOWN_OUTLINE_DEFAULT_WIDTH = 240;

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m14.5 5.5 4 4L9 19H5v-4Z" />
      <path d="M13 7 17 11" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
      <path d="M9 9h2" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  );
}
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

function parseCsv(content) {
  return content
    .split("\n")
    .filter(Boolean)
    .slice(0, MAX_CSV_ROWS)
    .map((line) => line.split(","));
}

function splitMarkdownTableRow(line) {
  return String(line ?? "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparatorRow(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownHorizontalRule(line) {
  return /^\s*(?:---|\*\*\*|___)\s*$/.test(String(line ?? ""));
}

function resolveMarkdownResourceUrl(rawUrl, basePath = "") {
  const value = String(rawUrl ?? "").trim();
  if (!value) {
    return "";
  }

  if (/^(?:https?:|mailto:|tel:|data:|blob:|file:|#)/i.test(value)) {
    return value;
  }

  if (!basePath) {
    return value;
  }

  const segments = basePath.split("/").filter(Boolean);
  if (segments.length > 0) {
    segments.pop();
  }

  for (const part of value.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  return `file:///${segments.join("/")}`.replace(/\/{3,}/g, "///");
}

function getLineIndent(line) {
  const indentMatch = String(line ?? "").match(/^[ \t]*/);
  const indentText = indentMatch ? indentMatch[0] : "";
  return indentText.replace(/\t/g, "    ").length;
}

function parseMarkdownListItem(line) {
  const match = String(line ?? "").match(/^([ \t]*)([-*+]|\d+\.)\s+(.*)$/);
  if (!match) {
    return null;
  }

  const marker = match[2];
  const type = /\d+\./.test(marker) ? "ordered" : "unordered";
  const indent = getLineIndent(match[1]);
  const rawText = match[3];
  const taskMatch = rawText.match(/^\[( |x|X)\]\s+(.*)$/);

  return {
    indent,
    type,
    task: Boolean(taskMatch),
    checked: taskMatch ? taskMatch[1].toLowerCase() === "x" : false,
    text: taskMatch ? taskMatch[2] : rawText
  };
}

function parseMarkdownListBlock(lines, basePath = "") {
  const root = { indent: -1, nodes: [], lastNode: null };
  const stack = [root];

  for (const line of lines) {
    const item = parseMarkdownListItem(line);
    if (!item) {
      continue;
    }

    while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) {
      stack.pop();
    }

    const currentLevel = stack[stack.length - 1];
    if (item.indent > currentLevel.indent && currentLevel.lastNode) {
      stack.push({
        indent: item.indent,
        nodes: currentLevel.lastNode.children,
        lastNode: null
      });
    }

    const activeLevel = stack[stack.length - 1];
    const node = {
      type: item.type,
      task: item.task,
      checked: item.checked,
      textHtml: renderMarkdownInline(item.text, basePath),
      children: []
    };
    activeLevel.nodes.push(node);
    activeLevel.lastNode = node;
  }

  return root.nodes;
}

function parseMarkdownQuoteBlock(lines, basePath = "") {
  const strippedLines = lines.map((line) => String(line ?? "").replace(/^\s*>\s?/, ""));
  const firstLine = strippedLines[0] || "";
  const calloutMatch = firstLine.match(/^\[!(note|tip|warning|danger|info)\]\s*(.*)$/i);

  if (calloutMatch) {
    const calloutType = calloutMatch[1].toLowerCase();
    const bodyLines = calloutMatch[2] ? [calloutMatch[2], ...strippedLines.slice(1)] : strippedLines.slice(1);
    return {
      kind: "callout",
      calloutType,
      title: calloutType.toUpperCase(),
      html: bodyLines.map((line) => renderMarkdownInline(line, basePath)).join("<br>")
    };
  }

  return {
    kind: "quote",
    html: strippedLines.map((line) => renderMarkdownInline(line, basePath)).join("<br>")
  };
}

function detectLanguage(fileName) {
  if (fileName.toLowerCase() === ".gitignore") {
    return "plaintext";
  }

  const ext = fileName.split(".").pop()?.toLowerCase();
  const map = {
    js: "javascript",
    jsx: "javascript",
    ts: "javascript",
    tsx: "javascript",
    json: "json",
    py: "python",
    swift: "swift",
    html: "xml",
    xml: "xml",
    css: "css"
  };
  return map[ext] || "plaintext";
}

function isMarkdownFileName(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return MARKDOWN_FILE_EXTENSIONS.has(ext);
}

function escapeHtml(code) {
  return String(code ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampEditorPosition(value, max) {
  return Math.max(0, Math.min(max, Number(value) || 0));
}

function normalizeEditorRanges(ranges, textLength) {
  return (ranges || [])
    .map((range) => {
      const start = clampEditorPosition(Math.min(range?.start ?? 0, range?.end ?? 0), textLength);
      const end = clampEditorPosition(Math.max(range?.start ?? 0, range?.end ?? 0), textLength);
      return { start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function rangeKey(range) {
  return `${range.start}:${range.end}`;
}

function findTextMatches(text, query, limit = 1000) {
  const normalizedQuery = String(query ?? "").toLowerCase();
  const sourceText = String(text ?? "");
  if (!normalizedQuery) {
    return [];
  }

  const normalizedText = sourceText.toLowerCase();
  const matches = [];
  let fromIndex = 0;

  while (fromIndex <= normalizedText.length && matches.length < limit) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, fromIndex);
    if (matchIndex === -1) {
      break;
    }

    matches.push({
      start: matchIndex,
      end: matchIndex + normalizedQuery.length
    });
    fromIndex = matchIndex + Math.max(1, normalizedQuery.length);
  }

  return matches;
}

function findNextMatch(text, query, fromIndex) {
  const sourceText = String(text ?? "");
  const normalizedQuery = String(query ?? "");
  if (!normalizedQuery) {
    return -1;
  }

  return sourceText.indexOf(normalizedQuery, Math.max(0, Number(fromIndex) || 0));
}

function buildEditorHighlightHtml(text, matches, currentMatchIndex, selections, primarySelectionIndex = -1) {
  const sourceText = String(text ?? "");
  if (!sourceText) {
    return "";
  }

  const activeSelections = normalizeEditorRanges(selections || [], sourceText.length);
  const activeMatches = normalizeEditorRanges(matches || [], sourceText.length).map((match, index) => ({
    ...match,
    active: index === currentMatchIndex
  }));

  if (activeSelections.length === 0 && activeMatches.length === 0) {
    return escapeHtml(sourceText);
  }

  const boundaries = new Set([0, sourceText.length]);
  [...activeSelections, ...activeMatches].forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });

  const points = Array.from(boundaries).sort((a, b) => a - b);
  const decorations = [
    ...activeSelections.map((range, index) => ({
      ...range,
      kind: "selection",
      primary: index === primarySelectionIndex
    })),
    ...activeMatches.map((range) => ({ ...range, kind: "match" }))
  ];

  let html = "";

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) {
      continue;
    }

    const segment = sourceText.slice(start, end);
    const segmentClasses = [];
    let hasSelection = false;
    let hasMatch = false;
    let isActiveMatch = false;

    for (const decoration of decorations) {
      if (decoration.start <= start && decoration.end > start) {
        if (decoration.kind === "selection") {
          hasSelection = true;
        } else if (decoration.kind === "match") {
          hasMatch = true;
          isActiveMatch = isActiveMatch || Boolean(decoration.active);
        }
      }
    }

    if (hasMatch) {
      segmentClasses.push("highlight");
      if (isActiveMatch) {
        segmentClasses.push("active");
      }
    }

    if (hasSelection) {
      segmentClasses.push("selection-multi");
      segmentClasses.push("multi");
      if (decorations.some((decoration) => decoration.kind === "selection" && decoration.start <= start && decoration.end > start && decoration.primary)) {
        segmentClasses.push("primary-selection");
        segmentClasses.push("primary");
      }
    }

    const escaped = escapeHtml(segment);
    html += segmentClasses.length > 0 ? `<span class="${segmentClasses.join(" ")}">${escaped}</span>` : escaped;
  }

  return html;
}

function findNextEditableMatchIndex(matches, startPosition, excludedKeys = new Set()) {
  if (!matches.length) {
    return -1;
  }

  const normalizedStart = Math.max(0, Number(startPosition) || 0);
  let candidateIndex = matches.findIndex((match) => match.start >= normalizedStart);
  if (candidateIndex === -1) {
    candidateIndex = 0;
  }

  for (let offset = 0; offset < matches.length; offset += 1) {
    const index = (candidateIndex + offset) % matches.length;
    const match = matches[index];
    if (!excludedKeys.has(rangeKey(match))) {
      return index;
    }
  }

  return -1;
}

function applyMultiSelectionEdit(text, ranges, editType, insertText = "") {
  const sourceText = String(text ?? "");
  const orderedRanges = normalizeEditorRanges(ranges, sourceText.length);
  if (orderedRanges.length === 0) {
    return {
      value: sourceText,
      selections: []
    };
  }

  let nextText = sourceText;
  const nextSelections = [];
  const insertValue = String(insertText ?? "");

  for (let index = orderedRanges.length - 1; index >= 0; index -= 1) {
    const range = orderedRanges[index];
    const start = range.start;
    const end = range.end;

    if (editType === "insert") {
      nextText = `${nextText.slice(0, start)}${insertValue}${nextText.slice(end)}`;
      nextSelections.unshift({
        start: start + insertValue.length,
        end: start + insertValue.length
      });
      continue;
    }

    if (editType === "backspace") {
      if (start !== end) {
        nextText = `${nextText.slice(0, start)}${nextText.slice(end)}`;
        nextSelections.unshift({
          start,
          end: start
        });
        continue;
      }

      if (start > 0) {
        nextText = `${nextText.slice(0, start - 1)}${nextText.slice(start)}`;
        nextSelections.unshift({
          start: start - 1,
          end: start - 1
        });
        continue;
      }

      nextSelections.unshift({
        start,
        end
      });
      continue;
    }

    if (editType === "delete") {
      if (start !== end) {
        nextText = `${nextText.slice(0, start)}${nextText.slice(end)}`;
        nextSelections.unshift({
          start,
          end: start
        });
        continue;
      }

      if (start < nextText.length) {
        nextText = `${nextText.slice(0, start)}${nextText.slice(start + 1)}`;
      }

      nextSelections.unshift({
        start,
        end: start
      });
    }
  }

  return {
    value: nextText,
    selections: nextSelections
  };
}

async function copyTextToClipboard(text) {
  const value = String(text ?? "");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function isImageFileName(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return IMAGE_FILE_EXTENSIONS.has(ext);
}

function renderMarkdownInline(text, basePath = "") {
  const segments = String(text ?? "").split(/(`[^`]*`)/g);

  return segments
    .map((segment) => {
      if (/^`[^`]*`$/.test(segment)) {
        return `<code class="markdown-inline-code">${escapeHtml(segment.slice(1, -1))}</code>`;
      }

      const escaped = escapeHtml(segment);
      const withImages = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, rawUrl) => {
        const resolvedUrl = resolveMarkdownResourceUrl(rawUrl, basePath);
        return `<img class="markdown-inline-image" alt="${escapeHtml(alt)}" src="${escapeHtml(resolvedUrl)}" loading="lazy" />`;
      });
      const withLinks = withImages.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, rawUrl) => {
        const resolvedUrl = resolveMarkdownResourceUrl(rawUrl, basePath);
        const isExternal = /^(?:https?:|mailto:|tel:|data:|blob:|file:|#)/i.test(resolvedUrl);
        const attrs = isExternal
          ? ' target="_blank" rel="noopener noreferrer"'
          : "";
        return `<a class="markdown-inline-link" href="${escapeHtml(resolvedUrl)}"${attrs}>${label}</a>`;
      });
      return withLinks
        .replace(/\[\[([^\]]+)\]\]/g, '<span class="markdown-wiki-link">[[$1]]</span>')
        .replace(/\*\*\*\*([\s\S]+?)\*\*\*\*/g, '<span class="markdown-inline-red">$1</span>')
        .replace(/\*\*([\s\S]+?)\*\*/g, '<span class="markdown-inline-blue">$1</span>')
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    })
    .join("");
}

function parseMarkdownDocument(markdown, basePath = "") {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const headings = [];
  const headingStack = [];
  let paragraphLines = [];
  let listItems = [];
  let quoteLines = [];
  let codeLines = [];
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeMetadata = {};

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      kind: "paragraph",
      html: paragraphLines.map((line) => renderMarkdownInline(line, basePath)).join("<br>")
    });
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      kind: "list",
      items: parseMarkdownListBlock(listItems, basePath)
    });
    listItems = [];
  }

  function flushQuote() {
    if (quoteLines.length === 0) {
      return;
    }

    blocks.push(parseMarkdownQuoteBlock(quoteLines, basePath));
    quoteLines = [];
  }

  function flushHorizontalRule() {
    blocks.push({
      kind: "hr"
    });
  }

  function flushCodeBlock() {
    if (!inCodeBlock) {
      return;
    }

    const code = codeLines.join("\n");
    const highlightedCode = codeLanguage && hljs.getLanguage(codeLanguage)
      ? hljs.highlight(code, { language: codeLanguage, ignoreIllegals: true }).value
      : escapeHtml(code);
    blocks.push(
      codeLanguage === "mermaid"
        ? {
            kind: "mermaid",
            code,
            raw: code,
            language: codeLanguage,
            metadata: codeMetadata,
            html: highlightedCode
          }
        : {
            kind: "code",
            language: codeLanguage,
            metadata: codeMetadata,
            code,
            raw: code,
            html: highlightedCode
          }
    );
    codeLines = [];
    codeLanguage = "";
    codeMetadata = {};
    inCodeBlock = false;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (inCodeBlock) {
      if (/^```\s*$/.test(line)) {
        flushCodeBlock();
        continue;
      }
      codeLines.push(line);
      continue;
    }

    const fenceMatch = line.match(/^```(.*)\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      inCodeBlock = true;
      const fenceInfo = parseFenceMeta(fenceMatch[1] || "");
      codeLanguage = fenceInfo.language || "";
      codeMetadata = fenceInfo.metadata || {};
      codeLines = [];
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = headingMatch[1].length;
      const id = `heading-${headings.length}`;
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      const parentId = headingStack.length > 0 ? headingStack[headingStack.length - 1].id : "";
      const html = renderMarkdownInline(headingMatch[2], basePath);
      const heading = {
        kind: "heading",
        id,
        parentId,
        level,
        startLine: index,
        html,
        text: headingMatch[2]
      };
      headings.push(heading);
      blocks.push(heading);
      headingStack.push(heading);
      continue;
    }

    const nextLine = lines[index + 1] || "";
    if (line.includes("|") && isMarkdownTableSeparatorRow(nextLine)) {
      flushParagraph();
      flushList();
      flushQuote();

      const headers = splitMarkdownTableRow(line).map((cell) => renderMarkdownInline(cell, basePath));
      const rows = [];
      index += 1;

      while (index + 1 < lines.length) {
        const rowLine = lines[index + 1];
        if (!rowLine.trim() || !rowLine.includes("|")) {
          break;
        }
        if (isMarkdownTableSeparatorRow(rowLine)) {
          break;
        }

        const rowCells = splitMarkdownTableRow(rowLine).map((cell) => renderMarkdownInline(cell, basePath));
        const normalizedRow = headers.map((_, cellIndex) => rowCells[cellIndex] || "");
        rows.push(normalizedRow);
        index += 1;
      }

      blocks.push({
        kind: "table",
        headers,
        rows
      });
      continue;
    }

    if (isMarkdownHorizontalRule(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      flushHorizontalRule();
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushParagraph();
      flushList();
      quoteLines.push(line);
      continue;
    }

    const indentedListMatch = parseMarkdownListItem(line);
    if (indentedListMatch) {
      flushParagraph();
      flushQuote();
      listItems.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    flushQuote();
    if (listItems.length > 0) {
      flushList();
    }
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushCodeBlock();

  return { blocks, headings };
}

function loadRecentFiles() {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.path === "string" &&
        typeof item.name === "string"
    );
  } catch {
    return [];
  }
}

function saveRecentFiles(files) {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  } catch {
    return;
  }
}

function getMarkdownFoldStorageKey(filePath, stateType) {
  return `${MARKDOWN_FOLD_STORAGE_PREFIX}:${filePath}:${stateType}`;
}

function loadMarkdownFoldIds(filePath, stateType) {
  if (!filePath) {
    return [];
  }

  try {
    const raw = localStorage.getItem(getMarkdownFoldStorageKey(filePath, stateType));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveMarkdownFoldIds(filePath, stateType, ids) {
  if (!filePath) {
    return;
  }

  try {
    localStorage.setItem(getMarkdownFoldStorageKey(filePath, stateType), JSON.stringify(ids));
  } catch {
    return;
  }
}

function loadMarkdownOutlinePaneVisible() {
  try {
    const raw = localStorage.getItem(MARKDOWN_OUTLINE_PANE_VISIBLE_KEY);
    if (raw === null) {
      return true;
    }
    return raw !== "false";
  } catch {
    return true;
  }
}

function saveMarkdownOutlinePaneVisible(value) {
  try {
    localStorage.setItem(MARKDOWN_OUTLINE_PANE_VISIBLE_KEY, value ? "true" : "false");
  } catch {
    return;
  }
}

function loadMarkdownOutlineWidth() {
  try {
    const raw = localStorage.getItem(MARKDOWN_OUTLINE_WIDTH_KEY);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return MARKDOWN_OUTLINE_DEFAULT_WIDTH;
    }
    return Math.min(MARKDOWN_OUTLINE_MAX_WIDTH, Math.max(MARKDOWN_OUTLINE_MIN_WIDTH, value));
  } catch {
    return MARKDOWN_OUTLINE_DEFAULT_WIDTH;
  }
}

function saveMarkdownOutlineWidth(value) {
  try {
    localStorage.setItem(MARKDOWN_OUTLINE_WIDTH_KEY, String(value));
  } catch {
    return;
  }
}

function getNormalizedEditValue(fileData) {
  if (!fileData) {
    return "";
  }

  if (fileData.type === "json") {
    try {
      return JSON.stringify(JSON.parse(fileData.content), null, 2);
    } catch {
      return fileData.content || "";
    }
  }

  return fileData.content || "";
}

function createEmptyTabState(path, name) {
  return {
    path,
    name,
    fileData: null,
    isDirty: false,
    content: "",
    editValue: "",
    baseEditValue: "",
    undoStack: [],
    redoStack: [],
    mode: "preview",
    previewFontScale: 1,
    markdownSplitRatio: 0.52,
    loading: false,
    error: "",
    pdfPages: [],
    pdfDualPage: false,
    currentPage: 1,
    totalPages: 0,
    imageSrc: "",
    imageSize: null,
    pdfViewport: { width: 0, height: 0 },
    imageNavFiles: [],
    collapsedOutlineIds: [],
    collapsedPreviewSectionIds: [],
    previewScrollTop: 0,
    editorScrollTop: 0,
    editorScrollLeft: 0,
    editorSelection: null
  };
}

function Pane({
  pane,
  isActivePane,
  selectedFile,
  onSelectFile,
  onSaved,
  markdownHeadingColors,
  markdownHeadingSizes,
  onUpdatePane,
  onSplitRight,
  onPaneFocus,
  draggingTab,
  dragOverPaneId,
  dragOverIndex,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
  onTabDragEnd,
  onPaneDragOver,
  onPaneDrop,
  onPaneDragLeave,
  edgeDropPosition,
  onPaneEmpty
}) {
  const tabStateRef = useRef(new Map());
  const previewScrollRef = useRef(null);
  const editorAreaRef = useRef(null);
  const [fileData, setFileData] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [baseEditValue, setBaseEditValue] = useState("");
  const [mode, setMode] = useState("preview");
  const [previewFontScale, setPreviewFontScale] = useState(1);
  const [markdownSplitRatio, setMarkdownSplitRatio] = useState(0.52);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentFiles, setRecentFiles] = useState(() => loadRecentFiles());
  const [pdfPages, setPdfPages] = useState([]);
  const [pdfDualPage, setPdfDualPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [imageSrc, setImageSrc] = useState("");
  const [imageSize, setImageSize] = useState(null);
  const [pdfViewport, setPdfViewport] = useState({ width: 0, height: 0 });
  const [imageNavFiles, setImageNavFiles] = useState([]);
  const [collapsedOutlineIds, setCollapsedOutlineIds] = useState(() => new Set());
  const [collapsedPreviewSectionIds, setCollapsedPreviewSectionIds] = useState(() => new Set());
  const [showMarkdownOutlinePane, setShowMarkdownOutlinePane] = useState(() => loadMarkdownOutlinePaneVisible());
  const [outlineWidth, setOutlineWidth] = useState(() => loadMarkdownOutlineWidth());
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [editorSelection, setEditorSelection] = useState(null);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [selections, setSelections] = useState([]);
  const [primarySelectionIndex, setPrimarySelectionIndex] = useState(-1);
  const [lastQuery, setLastQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const previewShellRef = useRef(null);
  const pdfWrapRef = useRef(null);
  const pdfPageUrlsRef = useRef([]);
  const editorSearchInputRef = useRef(null);
  const markdownPreviewOutlineLayoutRef = useRef(null);
  const markdownSplitOutlineLayoutRef = useRef(null);
  const markdownPreviewOutlineDividerRef = useRef(null);
  const markdownSplitOutlineDividerRef = useRef(null);
  const editorGutterRef = useRef(null);
  const markdownSplitRef = useRef(null);
  const markdownSplitDragRef = useRef({ dragging: false });
  const markdownOutlineResizeRef = useRef({
    resizing: false,
    pointerId: null,
    startX: 0,
    startWidth: MARKDOWN_OUTLINE_DEFAULT_WIDTH,
    containerLeft: 0
  });
  const markdownOutlineResizeRafRef = useRef(0);
  const openTabs = pane?.tabs || [];
  const activeTabPath = pane?.activeTabPath || "";
  const activeTab = openTabs.find((tab) => tab.path === activeTabPath) || null;
  const activeTabName = activeTab?.name || selectedFile?.name || "";
  const [tabContextMenu, setTabContextMenu] = useState(null);
  const isMarkdown = Boolean(fileData && isMarkdownFileName(fileData.name));
  const markdownDocument = useMemo(
    () => (isMarkdown ? parseMarkdownDocument(editValue, fileData?.path || "") : { blocks: [], headings: [] }),
    [editValue, fileData?.path, isMarkdown]
  );

  const editorLineCount = useMemo(
    () => Math.max(1, editValue.split(/\r\n|\r|\n/).length),
    [editValue]
  );

  const editorLineNumbers = useMemo(
    () => Array.from({ length: editorLineCount }, (_, index) => index + 1),
    [editorLineCount]
  );

  const editorOverlayHtml = useMemo(() => {
    const selectedRanges = selections.length > 0 ? selections : editorSelection?.start !== editorSelection?.end ? [editorSelection] : [];
    return buildEditorHighlightHtml(editValue, matches, currentMatchIndex, selectedRanges, primarySelectionIndex);
  }, [currentMatchIndex, editValue, editorSelection, matches, primarySelectionIndex, selections]);

  useEffect(() => {
    saveMarkdownOutlineWidth(outlineWidth);
  }, [outlineWidth]);

  useEffect(() => {
    setSearchQuery("");
    setMatches([]);
    setCurrentMatchIndex(-1);
    setSelections([]);
    setPrimarySelectionIndex(-1);
    setLastQuery("");
    setSearchOpen(false);
    setEditorSelection(null);
    setEditorScroll({ top: 0, left: 0 });
  }, [activeTabPath]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      const query = searchQuery.trim();
      if (!query) {
        setMatches([]);
        setCurrentMatchIndex(-1);
        return;
      }

      const nextMatches = findTextMatches(editValue, query, 1000);
      setMatches(nextMatches);
      setCurrentMatchIndex(nextMatches.length > 0 ? Math.min(Math.max(currentMatchIndex, 0), nextMatches.length - 1) : -1);
    }, 100);

    return () => window.clearTimeout(timerId);
  }, [editValue, searchQuery]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const timerId = window.setTimeout(() => {
      editorSearchInputRef.current?.focus();
      editorSearchInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [searchOpen]);

  useEffect(() => {
    function handlePointerMove(event) {
      const state = markdownOutlineResizeRef.current;
      if (!state.resizing) {
        return;
      }

      const nextWidth = Math.min(
        MARKDOWN_OUTLINE_MAX_WIDTH,
        Math.max(MARKDOWN_OUTLINE_MIN_WIDTH, event.clientX - state.containerLeft)
      );

      if (markdownOutlineResizeRafRef.current) {
        cancelAnimationFrame(markdownOutlineResizeRafRef.current);
      }

      markdownOutlineResizeRafRef.current = requestAnimationFrame(() => {
        setOutlineWidth(nextWidth);
      });
    }

    function stopResize() {
      const state = markdownOutlineResizeRef.current;
      if (!state.resizing) {
        return;
      }

      state.resizing = false;
      state.pointerId = null;
      if (markdownOutlineResizeRafRef.current) {
        cancelAnimationFrame(markdownOutlineResizeRafRef.current);
        markdownOutlineResizeRafRef.current = 0;
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      if (markdownOutlineResizeRafRef.current) {
        cancelAnimationFrame(markdownOutlineResizeRafRef.current);
        markdownOutlineResizeRafRef.current = 0;
      }
    };
  }, []);

  const markdownOutlineHighlightIds = useMemo(() => {
    if (!activeHeadingId) {
      return new Set();
    }

    const activeIndex = markdownDocument.headings.findIndex((heading) => heading.id === activeHeadingId);
    if (activeIndex === -1) {
      return new Set();
    }

    const highlighted = new Set([activeHeadingId]);
    const ancestorStack = [];

    for (let index = 0; index <= activeIndex; index += 1) {
      const heading = markdownDocument.headings[index];
      while (ancestorStack.length > 0 && ancestorStack[ancestorStack.length - 1].level >= heading.level) {
        ancestorStack.pop();
      }
      ancestorStack.push(heading);
    }

    for (const heading of ancestorStack) {
      highlighted.add(heading.id);
    }

    return highlighted;
  }, [activeHeadingId, markdownDocument.headings]);

  const markdownOutlineTree = useMemo(() => {
    if (!markdownDocument.headings.length) {
      return [];
    }

    const nodeById = new Map();
    const roots = [];

    for (const heading of markdownDocument.headings) {
      nodeById.set(heading.id, {
        ...heading,
        children: []
      });
    }

    for (const heading of markdownDocument.headings) {
      const node = nodeById.get(heading.id);
      if (!node) {
        continue;
      }

      const parentNode = heading.parentId ? nodeById.get(heading.parentId) : null;
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }, [markdownDocument.headings]);

  useEffect(() => {
    if (!isMarkdown) {
      setActiveHeadingId("");
      return undefined;
    }

    const container = previewScrollRef.current;
    if (!container || markdownDocument.headings.length === 0) {
      setActiveHeadingId("");
      return undefined;
    }

    const headingElements = markdownDocument.headings
      .map((heading) => container.querySelector(`#${heading.id}`))
      .filter(Boolean);

    if (headingElements.length === 0) {
      setActiveHeadingId("");
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length === 0) {
          return;
        }

        const rootBounds = visibleEntries[0].rootBounds;
        const rootCenter = rootBounds ? rootBounds.top + rootBounds.height / 2 : 0;
        let bestEntry = visibleEntries[0];
        let bestDistance = Math.abs(bestEntry.boundingClientRect.top - rootCenter);

        for (const entry of visibleEntries.slice(1)) {
          const distance = Math.abs(entry.boundingClientRect.top - rootCenter);
          if (distance < bestDistance) {
            bestEntry = entry;
            bestDistance = distance;
          }
        }

        const nextId = bestEntry.target.id || "";
        if (nextId) {
          setActiveHeadingId((current) => (current === nextId ? current : nextId));
        }
      },
      {
        root: container,
        rootMargin: "-30% 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1]
      }
    );

    headingElements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [activeHeadingId, isMarkdown, markdownDocument.headings]);

  function setOpenTabs(updater) {
    if (!onUpdatePane) {
      return;
    }
    onUpdatePane((currentPane) => ({
      ...currentPane,
      tabs: typeof updater === "function" ? updater(currentPane.tabs || []) : updater
    }));
  }

  function setActiveTabPath(nextValue) {
    if (!onUpdatePane) {
      return;
    }
    onUpdatePane((currentPane) => ({
      ...currentPane,
      activeTabPath: typeof nextValue === "function" ? nextValue(currentPane.activeTabPath || "") : nextValue
    }));
  }

  function syncActiveTabState(nextOverrides = {}) {
    if (!activeTabPath) {
      return;
    }

    const nextState = {
      ...(tabStateRef.current.get(activeTabPath) || createEmptyTabState(activeTabPath, activeTabName)),
      path: activeTabPath,
      name: activeTabName,
      fileData,
      content: nextOverrides.content ?? editValue,
      editValue,
      baseEditValue,
      mode,
      previewFontScale,
      markdownSplitRatio,
      loading,
      error,
      pdfPages,
      pdfDualPage,
      currentPage,
      totalPages,
      imageSrc,
      imageSize,
      pdfViewport,
      imageNavFiles,
      collapsedOutlineIds: Array.from(collapsedOutlineIds),
      collapsedPreviewSectionIds: Array.from(collapsedPreviewSectionIds),
      previewScrollTop: previewScrollRef.current?.scrollTop || 0,
      editorScrollTop: editorAreaRef.current?.scrollTop || 0,
      editorScrollLeft: editorAreaRef.current?.scrollLeft || 0,
      editorSelection,
      ...nextOverrides
    };

    tabStateRef.current.set(activeTabPath, nextState);

    const resolvedName = activeTabName || nextState.name;
    const currentTabSummary = {
      name: resolvedName,
      content: nextState.content ?? nextState.editValue,
      isDirty: Boolean(nextState.isDirty)
    };

    setOpenTabs((current) =>
      current.some((tab) => {
        if (tab.path !== activeTabPath) {
          return false;
        }

        return (
          tab.name === currentTabSummary.name &&
          (tab.content ?? "") === (currentTabSummary.content ?? "") &&
          Boolean(tab.isDirty) === currentTabSummary.isDirty
        );
      })
        ? current
        : current.map((tab) =>
            tab.path === activeTabPath
              ? {
                  ...tab,
                  name: resolvedName,
                  content: currentTabSummary.content,
                  isDirty: currentTabSummary.isDirty
                }
              : tab
          )
    );
  }

  function restoreTabState(tabPath, nextName) {
    const savedState = tabStateRef.current.get(tabPath);
    const nextState = savedState || createEmptyTabState(tabPath, nextName);
    tabStateRef.current.set(tabPath, {
      ...nextState,
      path: tabPath,
      name: nextName || nextState.name || tabPath
    });

    setFileData(nextState.fileData || null);
    setEditValue(nextState.content ?? nextState.editValue ?? "");
    setBaseEditValue(nextState.baseEditValue || "");
    setMode(nextState.mode || "preview");
    setPreviewFontScale(Number(nextState.previewFontScale) || 1);
    setMarkdownSplitRatio(Number(nextState.markdownSplitRatio) || 0.52);
    setLoading(Boolean(nextState.loading));
    setError(nextState.error || "");
    setPdfPages(Array.isArray(nextState.pdfPages) ? nextState.pdfPages : []);
    setPdfDualPage(Boolean(nextState.pdfDualPage));
    setCurrentPage(Number(nextState.currentPage) || 1);
    setTotalPages(Number(nextState.totalPages) || 0);
    setImageSrc(nextState.imageSrc || "");
    setImageSize(nextState.imageSize || null);
    setPdfViewport(nextState.pdfViewport || { width: 0, height: 0 });
    setImageNavFiles(Array.isArray(nextState.imageNavFiles) ? nextState.imageNavFiles : []);
    setCollapsedOutlineIds(new Set(nextState.collapsedOutlineIds || []));
    setCollapsedPreviewSectionIds(new Set(nextState.collapsedPreviewSectionIds || []));
    setActiveHeadingId(nextState.activeHeadingId || "");
    setEditorSelection(nextState.editorSelection || null);
    setEditorScroll({
      top: Number(nextState.editorScrollTop) || 0,
      left: Number(nextState.editorScrollLeft) || 0
    });
  }

  function handlePreviewWheel(event) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    setPreviewFontScale((current) => {
      const next = current + direction * 0.1;
      return Math.min(1.8, Math.max(0.8, Number(next.toFixed(2))));
    });
  }

  useEffect(() => {
    function handleWheel(event) {
      if (!previewShellRef.current || !previewShellRef.current.contains(event.target)) {
        return;
      }
      handlePreviewWheel(event);
    }

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    function handleTabShortcuts(event) {
      const isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) {
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        switchTabByOffset(event.shiftKey ? -1 : 1);
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setShowMarkdownOutlinePane((current) => !current);
        return;
      }

      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        closeTab(activeTabPath);
      }
    }

    window.addEventListener("keydown", handleTabShortcuts);
    return () => window.removeEventListener("keydown", handleTabShortcuts);
  }, [activeTabPath, openTabs]);

  function handleEditorScroll(event) {
    if (editorGutterRef.current) {
      editorGutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
    setEditorScroll({
      top: event.currentTarget.scrollTop,
      left: event.currentTarget.scrollLeft
    });
    syncActiveTabState({
      editorScrollTop: event.currentTarget.scrollTop,
      editorScrollLeft: event.currentTarget.scrollLeft
    });
  }

  function handlePreviewScroll(event) {
    syncActiveTabState({
      previewScrollTop: event.currentTarget.scrollTop
    });
  }

  function handleEditorSelect(event) {
    if (editorAreaRef.current?.dataset.ignoreSelect === "1") {
      delete editorAreaRef.current.dataset.ignoreSelect;
      return;
    }

    syncActiveTabState({
      editorSelection: {
        start: event.currentTarget.selectionStart,
        end: event.currentTarget.selectionEnd
      }
    });
    setEditorSelection({
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd
    });
    if (selections.length > 0) {
      setSelections([]);
      setPrimarySelectionIndex(-1);
    }
  }

  function clearSearchState() {
    setSearchOpen(false);
    setSearchQuery("");
    setMatches([]);
    setCurrentMatchIndex(-1);
    setSelections([]);
    setPrimarySelectionIndex(-1);
    setEditorSelection(null);
  }

  function getEditorSelectionRange() {
    const start = editorAreaRef.current?.selectionStart ?? 0;
    const end = editorAreaRef.current?.selectionEnd ?? start;
    return {
      start: Math.min(start, end),
      end: Math.max(start, end)
    };
  }

  function getWordRangeAtCursor() {
    const sourceText = String(editValue ?? "");
    const target = editorAreaRef.current;
    if (!target || sourceText.length === 0) {
      return null;
    }

    const cursor = clampEditorPosition(target.selectionStart ?? 0, sourceText.length);
    const isWordChar = (character) => /[A-Za-z0-9_$]/.test(character);
    const currentChar = sourceText[cursor] || "";
    const previousChar = cursor > 0 ? sourceText[cursor - 1] : "";

    if (!isWordChar(currentChar) && !isWordChar(previousChar)) {
      return null;
    }

    let start = cursor;
    if (!isWordChar(currentChar) && isWordChar(previousChar)) {
      start = cursor - 1;
    }
    while (start > 0 && isWordChar(sourceText[start - 1])) {
      start -= 1;
    }

    let end = cursor;
    if (!isWordChar(currentChar) && isWordChar(previousChar)) {
      end = cursor;
    } else {
      while (end < sourceText.length && isWordChar(sourceText[end])) {
        end += 1;
      }
    }

    if (start >= end) {
      return null;
    }

    return { start, end };
  }

  function focusEditorSelection(range) {
    const target = editorAreaRef.current;
    if (!target) {
      return;
    }

    target.dataset.ignoreSelect = "1";
    try {
      editorSearchInputRef.current?.blur?.();
      target.focus();
      target.setSelectionRange(range.start, range.end);
      const beforeSelection = String(editValue ?? "").slice(0, range.start);
      const lineIndex = beforeSelection ? beforeSelection.split(/\r\n|\r|\n/).length - 1 : 0;
      const computedStyle = window.getComputedStyle(target);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 18;
      const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
      const nextScrollTop = Math.max(0, Math.floor(lineIndex * lineHeight - target.clientHeight * 0.35 + paddingTop));
      target.scrollTop = nextScrollTop;
      if (editorGutterRef.current) {
        editorGutterRef.current.scrollTop = nextScrollTop;
      }
      setEditorScroll((current) => ({
        top: nextScrollTop,
        left: current.left
      }));
      syncActiveTabState({
        editorScrollTop: nextScrollTop,
        editorScrollLeft: editorScroll.left
      });
    } catch {
      // Ignore selection failures for unsupported browser states.
    }

    window.setTimeout(() => {
      if (target.dataset.ignoreSelect === "1") {
        delete target.dataset.ignoreSelect;
      }
    }, 0);
  }

  function selectMatchAtIndex(index) {
    const match = matches[index];
    if (!match) {
      return;
    }

    setCurrentMatchIndex(index);
    setEditorSelection(match);
    focusEditorSelection(match);
  }

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const query = searchQuery.trim();
    if (!query || matches.length === 0) {
      return;
    }

    const nextIndex = currentMatchIndex >= 0 && currentMatchIndex < matches.length ? currentMatchIndex : 0;
    const nextMatch = matches[nextIndex];
    if (!nextMatch) {
      return;
    }

    if (editorSelection?.start === nextMatch.start && editorSelection?.end === nextMatch.end) {
      return;
    }

    selectMatchAtIndex(nextIndex);
  }, [currentMatchIndex, editorSelection?.end, editorSelection?.start, matches, searchOpen, searchQuery]);

  function handleSearchNavigate(delta) {
    if (!matches.length) {
      return;
    }

    const nextIndex = (currentMatchIndex + delta + matches.length) % matches.length;
    selectMatchAtIndex(nextIndex);
  }

  function handleSearchQueryChange(value) {
    setSearchQuery(value);
    setCurrentMatchIndex(0);
    setSelections([]);
    setPrimarySelectionIndex(-1);
    setEditorSelection(null);
  }

  function seedSearchFromSelection() {
    const range = getEditorSelectionRange();
    const selectedText = editValue.slice(range.start, range.end);
    if (!selectedText) {
      return "";
    }

    setSearchOpen(true);
    handleSearchQueryChange(selectedText);
    return selectedText;
  }

  function handleAddNextSelection(textarea, reverse = false) {
    const sourceValue = String(textarea?.value ?? editValue ?? "");
    const selectedRange = {
      start: Number(textarea?.selectionStart ?? 0),
      end: Number(textarea?.selectionEnd ?? 0)
    };
    const selectedText = sourceValue.slice(selectedRange.start, selectedRange.end);
    const currentSelections = selections.length > 0 ? normalizeEditorRanges(selections, sourceValue.length) : [];
    const nextSelections = [...currentSelections];

    if (nextSelections.length === 0) {
      const initialRange = selectedText ? selectedRange : getWordRangeAtCursor();
      if (!initialRange) {
        return;
      }

      const initialText = sourceValue.slice(initialRange.start, initialRange.end);
      if (!initialText) {
        return;
      }

      setSelections([initialRange]);
      setPrimarySelectionIndex(0);
      setLastQuery(initialText);
      setEditorSelection(initialRange);
      textarea?.setSelectionRange?.(initialRange.start, initialRange.end);
      focusEditorSelection(initialRange);
      return;
    }

    const query = selectedText || lastQuery;
    if (!query) {
      return;
    }

    const selectedKeys = new Set(nextSelections.map(rangeKey));
    const basePosition = reverse ? nextSelections[0].start : nextSelections[nextSelections.length - 1].end;
    let searchFrom = reverse ? 0 : basePosition;
    let nextSelection = null;

    while (searchFrom >= 0 && searchFrom <= sourceValue.length) {
      const nextIndex = reverse
        ? sourceValue.lastIndexOf(query, Math.max(0, selectedRange.start - 1))
        : findNextMatch(sourceValue, query, searchFrom);

      if (nextIndex === -1) {
        break;
      }

      const candidate = { start: nextIndex, end: nextIndex + query.length };
      const candidateKey = rangeKey(candidate);
      if (!selectedKeys.has(candidateKey)) {
        nextSelection = candidate;
        break;
      }

      searchFrom = reverse ? nextIndex - 1 : nextIndex + Math.max(1, query.length);
    }

    if (!nextSelection) {
      return;
    }

    nextSelections.push(nextSelection);
    setSelections(normalizeEditorRanges(nextSelections, sourceValue.length));
    setPrimarySelectionIndex(nextSelections.length - 1);
    setLastQuery(query);
    setEditorSelection(nextSelection);
    textarea?.setSelectionRange?.(nextSelection.start, nextSelection.end);
    focusEditorSelection(nextSelection);
  }

  function getTextDiff(oldText, newText) {
    let start = 0;

    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
      start += 1;
    }

    let oldEnd = oldText.length;
    let newEnd = newText.length;

    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd -= 1;
      newEnd -= 1;
    }

    return {
      start,
      removedText: oldText.slice(start, oldEnd),
      insertedText: newText.slice(start, newEnd)
    };
  }

  function applyDiffToSelections(oldText, nextSelections, diff) {
    let nextText = oldText;
    const sortedSelections = [...nextSelections].sort((a, b) => b.start - a.start);

    for (const range of sortedSelections) {
      nextText = `${nextText.slice(0, range.start)}${diff.insertedText}${nextText.slice(range.end)}`;
    }

    return nextText;
  }

  function getEditorHistoryState() {
    const currentState = tabStateRef.current.get(activeTabPath) || createEmptyTabState(activeTabPath, activeTabName);
    return {
      undoStack: Array.isArray(currentState.undoStack) ? currentState.undoStack : [],
      redoStack: Array.isArray(currentState.redoStack) ? currentState.redoStack : []
    };
  }

  function commitEditorContent(nextContent, nextSelections = null, previousContent = null) {
    const currentContent = String(previousContent ?? activeTab?.content ?? editValue ?? "");
    const historyState = getEditorHistoryState();
    const undoStack = currentContent !== nextContent
      ? [...historyState.undoStack, currentContent].slice(-100)
      : historyState.undoStack;

    setEditValue(nextContent);
    if (nextSelections) {
      setSelections(nextSelections);
      setPrimarySelectionIndex(nextSelections.length - 1);
      setEditorSelection(nextSelections.at(-1) || null);
    }

    syncActiveTabState({
      content: nextContent,
      editValue: nextContent,
      isDirty: true,
      undoStack,
      redoStack: []
    });

    if (nextSelections && nextSelections.at(-1)) {
      window.requestAnimationFrame(() => {
        const last = nextSelections.at(-1);
        if (last && editorAreaRef.current) {
          editorAreaRef.current.setSelectionRange(last.start, last.end);
        }
      });
    }
  }

  function handleEditorHistory(step) {
    const historyState = getEditorHistoryState();
    const currentContent = String(activeTab?.content ?? editValue ?? "");
    const baseContent = String(baseEditValue ?? "");

    if (step < 0) {
      if (historyState.undoStack.length === 0) {
        return;
      }

      const nextContent = historyState.undoStack[historyState.undoStack.length - 1];
      const nextUndoStack = historyState.undoStack.slice(0, -1);
      const nextRedoStack = [...historyState.redoStack, currentContent].slice(-100);

      setEditValue(nextContent);
      setSelections([]);
      setPrimarySelectionIndex(-1);
      setEditorSelection(null);
      syncActiveTabState({
        content: nextContent,
        editValue: nextContent,
        isDirty: nextContent !== baseContent,
        undoStack: nextUndoStack,
        redoStack: nextRedoStack
      });
      return;
    }

    if (historyState.redoStack.length === 0) {
      return;
    }

    const nextContent = historyState.redoStack[historyState.redoStack.length - 1];
    const nextRedoStack = historyState.redoStack.slice(0, -1);
    const nextUndoStack = [...historyState.undoStack, currentContent].slice(-100);

    setEditValue(nextContent);
    setSelections([]);
    setPrimarySelectionIndex(-1);
    setEditorSelection(null);
    syncActiveTabState({
      content: nextContent,
      editValue: nextContent,
      isDirty: nextContent !== baseContent,
      undoStack: nextUndoStack,
      redoStack: nextRedoStack
    });
  }

  function replaceSelections(insertedText) {
    const currentContent = String(activeTab?.content ?? editValue ?? "");
    const sortedSelections = [...selections].sort((a, b) => b.start - a.start);

    let nextContent = currentContent;

    for (const range of sortedSelections) {
      nextContent = `${nextContent.slice(0, range.start)}${insertedText}${nextContent.slice(range.end)}`;
    }

    const nextSelections = selections.map((range) => ({
      start: range.start,
      end: range.start + insertedText.length
    }));

    commitEditorContent(nextContent, nextSelections, currentContent);
  }

  function applyEditFromValue(newValue) {
    const nextValue = String(newValue ?? "");
    const oldValue = String(activeTab?.content ?? editValue ?? "");

    if (selections.length <= 1) {
      setEditValue(nextValue);
      syncActiveTabState({
        content: nextValue,
        isDirty: true
      });
      return nextValue;
    }

    let value = oldValue;

    for (let index = selections.length - 1; index >= 0; index -= 1) {
      const sel = selections[index];
      value = `${value.slice(0, sel.start)}${nextValue.slice(sel.start, sel.end)}${value.slice(sel.end)}`;
    }

    setEditValue(value);
    syncActiveTabState({
      content: value,
      isDirty: true
    });
    return value;
  }

  function handleEditorChange(event) {
    const textarea = event.currentTarget;
    const domValue = String(textarea.value ?? "");
    const currentContent = String(activeTab?.content ?? editValue ?? "");

    if (selections.length <= 1) {
      commitEditorContent(domValue, null, currentContent);
      return;
    }

    const diff = getTextDiff(currentContent, domValue);

    const nextText = applyDiffToSelections(currentContent, selections, diff);
    const nextSelections = selections.map((sel) => ({
      start: sel.start,
      end: sel.start + diff.insertedText.length
    }));

    commitEditorContent(nextText, nextSelections, currentContent);
  }

  function handleEditorKeyDownCapture(event) {
    const key = event.key.toLowerCase();

    if ((event.metaKey || event.ctrlKey) && key === "z") {
      event.preventDefault();
      event.stopPropagation();
      handleEditorHistory(event.shiftKey ? 1 : -1);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === "y") {
      event.preventDefault();
      event.stopPropagation();
      handleEditorHistory(1);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === "d") {
      event.preventDefault();
      event.stopPropagation();
      handleAddNextSelection(event.currentTarget, event.shiftKey);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === "f") {
      return;
    }
  }

  function handleEditorKeyDown(event) {
    if (selections.length > 1) {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        replaceSelections("");
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        replaceSelections("\n");
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        replaceSelections("  ");
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      return;
    }

    if (event.key === "Escape") {
      if (selections.length > 0) {
        event.preventDefault();
        setSelections([]);
        setPrimarySelectionIndex(null);
        return;
      }

      if (searchOpen || searchQuery) {
        event.preventDefault();
        clearSearchState();
      }
      return;
    }

    if (searchOpen) {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSearchNavigate(event.shiftKey ? -1 : 1);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        handleSearchNavigate(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        handleSearchNavigate(-1);
        return;
      }
    }
  }

  function handleEditorMouseDown(event) {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
      setSelections([]);
      setPrimarySelectionIndex(null);
    }
  }

  function handleEditorPaste(event) {
    if (selections.length <= 1) {
      return;
    }

    event.preventDefault();
    const text = event.clipboardData?.getData("text") || "";
    replaceSelections(text);
  }

  function openOrActivateTab(filePath, fileName) {
    if (!filePath) {
      return;
    }

    syncActiveTabState();
    setOpenTabs((current) => {
      if (current.some((tab) => tab.path === filePath)) {
        return current;
      }
      return [...current, { path: filePath, name: fileName || filePath, content: "", isDirty: false }];
    });
    setActiveTabPath(filePath);
  }

  function switchTabByOffset(offset) {
    if (openTabs.length === 0) {
      return;
    }

    const currentIndex = Math.max(0, openTabs.findIndex((tab) => tab.path === activeTabPath));
    const nextIndex = (currentIndex + offset + openTabs.length) % openTabs.length;
    const nextTab = openTabs[nextIndex];
    if (!nextTab) {
      return;
    }

    syncActiveTabState();
    setActiveTabPath(nextTab.path);
  }

  function closeTab(tabPath) {
    if (!tabPath) {
      return;
    }

    syncActiveTabState();
    const index = openTabs.findIndex((tab) => tab.path === tabPath);
    if (index === -1) {
      return;
    }

    const nextTabs = openTabs.filter((tab) => tab.path !== tabPath);
    if (tabStateRef.current.has(tabPath)) {
      tabStateRef.current.delete(tabPath);
    }

    setOpenTabs(nextTabs);
    if (nextTabs.length === 0) {
      onPaneEmpty?.(pane.id);
    }

    if (activeTabPath !== tabPath) {
      return;
    }

    const nextActive = nextTabs[index] || nextTabs[index - 1] || null;
    if (nextActive) {
      setActiveTabPath(nextActive.path);
      const saved = tabStateRef.current.get(nextActive.path);
      if (saved) {
        restoreTabState(nextActive.path, nextActive.name);
      }
      return;
    }

    setActiveTabPath("");
    unwatchFile();
    setFileData(null);
    setEditValue("");
    setBaseEditValue("");
    setMode("preview");
    setLoading(false);
    setError("");
    setPdfPages([]);
    setImageNavFiles([]);
  }

  function handleTabContextMenu(tab, event) {
    event.preventDefault();
    event.stopPropagation();
    onPaneFocus?.(pane.id);
    setTabContextMenu({
      x: event.clientX,
      y: event.clientY,
      tabPath: tab.path,
      tabName: tab.name
    });
  }

  function handleMarkdownSplitPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    markdownSplitDragRef.current.dragging = true;
    event.preventDefault();
  }

  useEffect(() => {
    function handlePointerMove(event) {
      if (!markdownSplitDragRef.current.dragging) {
        return;
      }

      const rect = markdownSplitRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return;
      }

      const nextRatio = (event.clientX - rect.left) / rect.width;
      setMarkdownSplitRatio(Math.max(0.24, Math.min(0.76, nextRatio)));
    }

    function handlePointerUp() {
      markdownSplitDragRef.current.dragging = false;
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

  useEffect(() => {
    let cancelled = false;

    if (!activeTabPath) {
      unwatchFile();
      setFileData(null);
      setEditValue("");
      setBaseEditValue("");
      setError("");
      setImageSrc("");
      setCurrentPage(1);
      setTotalPages(0);
      setCollapsedOutlineIds(new Set());
      setCollapsedPreviewSectionIds(new Set());
      setPdfPages([]);
      setImageNavFiles([]);
      return () => {
        cancelled = true;
      };
    }

    const savedState = tabStateRef.current.get(activeTabPath);
    if (savedState) {
      restoreTabState(activeTabPath, savedState.name || activeTab?.name || selectedFile?.name || activeTabPath);
    }

    const hasCachedFile = Boolean(savedState?.fileData?.path === activeTabPath);
    if (hasCachedFile) {
      watchFile(activeTabPath).catch(() => {});
      return () => {
        cancelled = true;
        unwatchFile();
      };
    }

    setFileData(null);
    setEditValue("");
    setBaseEditValue("");
    setMode("preview");
    setError("");
    setImageSrc("");
    setImageSize(null);
    setPdfPages([]);
    setPdfDualPage(false);
    setCurrentPage(1);
    setTotalPages(0);
    setImageNavFiles([]);
    setCollapsedOutlineIds(new Set());
    setCollapsedPreviewSectionIds(new Set());

    async function load() {
      try {
        await watchFile(activeTabPath);
        setLoading(true);
        setError("");
        setPdfPages([]);
        setCurrentPage(1);
        setTotalPages(0);
        const next = await readFile(activeTabPath);
        if (cancelled) {
          return;
        }
        setFileData(next);
        setActiveHeadingId("");
        const nextEditValue = getNormalizedEditValue(next);
        setEditValue(nextEditValue);
        setBaseEditValue(nextEditValue);
        setMode("preview");
        const nextCollapsedOutlineIds = loadMarkdownFoldIds(next.path, "outline");
        const nextCollapsedPreviewSectionIds = loadMarkdownFoldIds(next.path, "preview");
        setCollapsedOutlineIds(new Set(nextCollapsedOutlineIds));
        setCollapsedPreviewSectionIds(new Set(nextCollapsedPreviewSectionIds));
        setImageNavFiles([]);
        syncActiveTabState({
          fileData: next,
          isDirty: false,
          content: nextEditValue,
          editValue: nextEditValue,
          baseEditValue: nextEditValue,
          loading: false,
          error: "",
          pdfPages: [],
          currentPage: 1,
          totalPages: 0,
          collapsedOutlineIds: nextCollapsedOutlineIds,
          collapsedPreviewSectionIds: nextCollapsedPreviewSectionIds,
          imageNavFiles: []
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        if (loadError.message === "Unsupported file type for preview") {
          setError("プレビュー不可");
        } else if (loadError.message === "File too large for preview") {
          setError("5MB以上のファイルはプレビュー不可");
        } else {
          setError(loadError.message);
        }
        setFileData(null);
        setImageSrc("");
        setActiveHeadingId("");
        setCollapsedOutlineIds(new Set());
        setCollapsedPreviewSectionIds(new Set());
        syncActiveTabState({
          fileData: null,
          editValue: "",
          baseEditValue: "",
          loading: false,
          error: loadError?.message || ""
        });
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      unwatchFile();
    };
  }, [activeTabPath]);

  useEffect(() => {
    if (!fileData) {
      setImageSrc("");
      setImageSize(null);
      return undefined;
    }

    if (fileData.type === "image" && fileData.buffer) {
      const blob = new Blob([fileData.buffer], { type: fileData.mimeType });
      const url = URL.createObjectURL(blob);
      setImageSrc(url);
      setImageSize(
        fileData.sourceWidth && fileData.sourceHeight
          ? {
              width: fileData.sourceWidth,
              height: fileData.sourceHeight
            }
          : null
      );
      return undefined;
    }

    if (fileData.type === "image") {
      setImageSrc(fileData.sourceUrl || `data:${fileData.mimeType};base64,${fileData.content}`);
      setImageSize(null);
      return undefined;
    }

    setImageSrc("");
    setImageSize(null);
    return undefined;
  }, [fileData]);

  useEffect(() => {
    if (fileData?.type !== "pdf") {
      setPdfPages([]);
      setTotalPages(0);
      return;
    }

    let cancelled = false;

    async function renderPdfPages() {
      try {
        const bytes = new Uint8Array(fileData.buffer);
        const pdfDocument = await pdfjsLib.getDocument({
          data: bytes
        }).promise;
        const pageNumber = Math.min(Math.max(currentPage, 1), pdfDocument.numPages);
        setTotalPages(pdfDocument.numPages);
        const pagesToRender = pdfDualPage
          ? pageNumber === pdfDocument.numPages
            ? [pageNumber]
            : [pageNumber, pageNumber + 1].filter((page) => page <= pdfDocument.numPages)
          : [pageNumber];
        const renderTargets = [];

        for (const nextPageNumber of pagesToRender) {
          const page = await pdfDocument.getPage(nextPageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          renderTargets.push({ pageNumber: nextPageNumber, page, baseViewport });
        }

        const targetHeight =
          pdfDualPage && renderTargets.length > 1
            ? Math.min(
                MAX_PDF_DIMENSION,
                pdfViewport.width > 0 && pdfViewport.height > 0
                  ? Math.min(
                      pdfViewport.height,
                      pdfViewport.width /
                        renderTargets.reduce(
                          (sum, target) => sum + target.baseViewport.width / target.baseViewport.height,
                          0
                        )
                    )
                  : Math.max(...renderTargets.map((target) => target.baseViewport.height))
              )
            : null;
        const nextPages = [];

        for (const target of renderTargets) {
          const { page, pageNumber: nextPageNumber, baseViewport } = target;
          const targetScale = 1.2;
          const scale = targetHeight
            ? targetHeight / baseViewport.height
            : Math.min(1.2, MAX_PDF_DIMENSION / Math.max(baseViewport.width, baseViewport.height), targetScale);
          const scaledViewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("PDF canvas context unavailable");
          }

          canvas.width = Math.ceil(scaledViewport.width);
          canvas.height = Math.ceil(scaledViewport.height);

          await page.render({
            canvasContext: context,
            viewport: scaledViewport
          }).promise;

          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
          if (!blob) {
            continue;
          }

          const url = URL.createObjectURL(blob);
          canvas.width = 0;
          canvas.height = 0;
          nextPages.push({
            pageNumber: nextPageNumber,
            src: url
          });
        }

        if (!cancelled) {
          pdfPageUrlsRef.current = nextPages.map((page) => page.src);
          setPdfPages(nextPages);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError?.message || "PDF preview failed");
          setPdfPages([]);
        }
      }
    }

    renderPdfPages();

    return () => {
      cancelled = true;
    };
  }, [fileData, currentPage, pdfDualPage, pdfViewport.width, pdfViewport.height]);

  useEffect(() => {
    pdfPageUrlsRef.current = pdfPages.map((page) => page.src);
    return undefined;
  }, [pdfPages]);

  useEffect(() => {
    if (!pdfWrapRef.current || fileData?.type !== "pdf") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setPdfDualPage(width > height * 1.15);
      setPdfViewport({ width, height });
    });

    observer.observe(pdfWrapRef.current);
    return () => observer.disconnect();
  }, [fileData]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (fileData?.type !== "pdf") {
        return;
      }

      const isPrev = event.key === "ArrowLeft" || event.key === "ArrowUp";
      const isNext = event.key === "ArrowRight" || event.key === "ArrowDown";

      if (!isPrev && !isNext) {
        return;
      }

      event.preventDefault();
      const step = pdfDualPage ? 2 : 1;

      if (isPrev) {
        setCurrentPage((page) => Math.max(1, page - step));
      } else {
        setCurrentPage((page) => Math.min(totalPages || 1, page + step));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fileData, pdfDualPage, totalPages]);

  useEffect(() => {
    if (!activeTabPath || !fileData?.path) {
      return;
    }

    const nextRecentFiles = [
      { path: fileData.path, name: fileData.name },
      ...recentFiles.filter((item) => item.path !== fileData.path)
    ].slice(0, MAX_RECENT_FILES);

    setRecentFiles(nextRecentFiles);
    saveRecentFiles(nextRecentFiles);
  }, [activeTabPath, fileData]);

  useEffect(() => {
    let unsubscribe;

    async function init() {
      unsubscribe = onFileChanged(async (filePath) => {
        if (filePath !== activeTabPath) {
          return;
        }
        try {
          const next = await readFile(filePath);
          const nextEditValue = getNormalizedEditValue(next);
          setFileData(next);
          setEditValue(nextEditValue);
          setBaseEditValue(nextEditValue);
          setError("");
          syncActiveTabState({
            fileData: next,
            isDirty: false,
            content: nextEditValue,
            editValue: nextEditValue,
            baseEditValue: nextEditValue,
            error: ""
          });
        } catch (loadError) {
          setError(loadError.message);
          setFileData(null);
          syncActiveTabState({
            fileData: null,
            error: loadError.message
          });
        }
      });
    }

    init();

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [activeTabPath]);

  useEffect(() => {
    if (!fileData) {
      setImageSrc("");
      return undefined;
    }

    if (fileData.buffer) {
      const blob = new Blob([fileData.buffer], { type: fileData.mimeType });
      const url = URL.createObjectURL(blob);
      setImageSrc(url);
      return undefined;
    }

    if (fileData.type === "image") {
      setImageSrc(fileData.sourceUrl || `data:${fileData.mimeType};base64,${fileData.content}`);
      return undefined;
    }

    setImageSrc("");
    return undefined;
  }, [fileData]);

  useEffect(() => {
    let cancelled = false;

    async function loadImageNavFiles() {
      if (fileData?.type !== "image" || !activeTabPath) {
        setImageNavFiles([]);
        return;
      }

      try {
        const directoryPath = activeTabPath.split("/").slice(0, -1).join("/") || "/";
        const entries = await listDirectory(directoryPath);
        const nextFiles = entries
          .filter((entry) => entry.type === "file" && isImageFileName(entry.name))
          .map((entry) => ({
            path: entry.path,
            name: entry.name,
            directoryPath
          }));

        if (!cancelled) {
          setImageNavFiles(nextFiles);
        }
      } catch {
        if (!cancelled) {
          setImageNavFiles([]);
        }
      }
    }

    loadImageNavFiles();

    return () => {
      cancelled = true;
    };
  }, [activeTabPath, fileData]);

  useEffect(() => {
    if (!activeTabPath) {
      return;
    }

    syncActiveTabState();
  }, [
    activeTabPath,
    fileData,
    editValue,
    baseEditValue,
    mode,
    previewFontScale,
    markdownSplitRatio,
    loading,
    error,
    pdfPages,
    pdfDualPage,
    currentPage,
    totalPages,
    imageSrc,
    imageSize,
    pdfViewport,
    imageNavFiles,
    collapsedOutlineIds,
    collapsedPreviewSectionIds,
    editorSelection
  ]);

  useEffect(() => {
    if (!fileData?.path) {
      return;
    }

    saveMarkdownFoldIds(fileData.path, "outline", Array.from(collapsedOutlineIds));
    saveMarkdownFoldIds(fileData.path, "preview", Array.from(collapsedPreviewSectionIds));
  }, [fileData?.path, collapsedOutlineIds, collapsedPreviewSectionIds]);

  useEffect(() => {
    saveMarkdownOutlinePaneVisible(showMarkdownOutlinePane);
  }, [showMarkdownOutlinePane]);

  useEffect(() => {
    if (!activeTabPath) {
      return;
    }

    const savedState = tabStateRef.current.get(activeTabPath);
    if (!savedState) {
      return;
    }

    const scrollTop = mode === "edit" ? savedState.editorScrollTop : savedState.previewScrollTop;
    const target = mode === "edit" ? editorAreaRef.current : previewScrollRef.current;
    if (!target) {
      return;
    }

    requestAnimationFrame(() => {
      target.scrollTop = Number(scrollTop) || 0;
      const nextScrollLeft = Number(savedState.editorScrollLeft) || 0;
      target.scrollLeft = nextScrollLeft;
      setEditorScroll({
        top: Number(scrollTop) || 0,
        left: nextScrollLeft
      });
      if (mode === "edit" && editorAreaRef.current && savedState.editorSelection) {
        const { start, end } = savedState.editorSelection;
        try {
          setEditorSelection({ start: start ?? 0, end: end ?? 0 });
          editorAreaRef.current.setSelectionRange(start ?? 0, end ?? 0);
        } catch {
          return;
        }
      }
    });
  }, [activeTabPath, mode, fileData]);

  const renderedHtml = useMemo(() => {
    if (!fileData || isMarkdown) {
      return "";
    }

    if (fileData.type === "json") {
      try {
        const pretty = JSON.stringify(JSON.parse(editValue), null, 2);
        return hljs.highlight(pretty, { language: "json" }).value;
      } catch {
        return hljs.highlight(editValue, { language: "json" }).value;
      }
    }

    const lang = detectLanguage(fileData.name);
    if (lang === "plaintext" || !hljs.getLanguage(lang)) {
      return escapeHtml(editValue);
    }

    return hljs.highlight(editValue, { language: lang, ignoreIllegals: true }).value;
  }, [editValue, fileData, isMarkdown]);

  if (!openTabs.length || !activeTabPath) {
    return (
      <div className="preview-shell">
        <div className="panel-empty">Select a file from the tree.</div>
      </div>
    );
  }

  const isPdf = Boolean(fileData && fileData.type === "pdf");
  const isImage = Boolean(fileData && fileData.type === "image");
  const isCsv = Boolean(fileData && fileData.type === "csv");
  const canEdit = Boolean(fileData && fileData.editable);
  const showEditButton = Boolean(canEdit && !isPdf && !isImage && !isCsv);
  const showSaveButton = Boolean(showEditButton && activeTab?.isDirty && mode === "edit");
  const csvRows = isCsv && fileData ? parseCsv(fileData.content) : [];
  const imageNavIndex = isImage ? imageNavFiles.findIndex((item) => item.path === activeTabPath) : -1;
  const canNavigateImages = isImage && imageNavIndex >= 0 && imageNavFiles.length > 1;
  const resolvedImageSize =
    isImage && fileData.sourceWidth && fileData.sourceHeight
      ? { width: fileData.sourceWidth, height: fileData.sourceHeight }
      : imageSize;
  const fileTitle =
    fileData && isImage && resolvedImageSize
      ? `${fileData.name} (${resolvedImageSize.width}x${resolvedImageSize.height})`
      : fileData?.name || activeTabName;

  function toggleSectionCollapse(headingId) {
    setCollapsedPreviewSectionIds((current) => {
      const next = new Set(current);
      if (next.has(headingId)) {
        next.delete(headingId);
      } else {
        next.add(headingId);
      }
      return next;
    });
  }

  function toggleOutlineCollapse(headingId) {
    setCollapsedOutlineIds((current) => {
      const next = new Set(current);
      if (next.has(headingId)) {
        next.delete(headingId);
      } else {
        next.add(headingId);
      }
      return next;
    });
  }

  function scrollToMarkdownHeading(headingId) {
    const container = previewScrollRef.current;
    if (!container) {
      return;
    }

    const target = container.querySelector(`[id="${headingId}"]`);
    if (!target) {
      return;
    }

    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function getMarkdownSectionSource(headingId) {
    const headingIndex = markdownDocument.headings.findIndex((heading) => heading.id === headingId);
    if (headingIndex === -1) {
      return "";
    }

    const lines = String(editValue ?? "").replace(/\r\n?/g, "\n").split("\n");
    const heading = markdownDocument.headings[headingIndex];
    let endLine = lines.length;

    for (let index = headingIndex + 1; index < markdownDocument.headings.length; index += 1) {
      const nextHeading = markdownDocument.headings[index];
      if (nextHeading.level <= heading.level) {
        endLine = nextHeading.startLine ?? lines.length;
        break;
      }
    }

    const startLine = Math.max(0, heading.startLine ?? 0);
    return lines.slice(startLine, endLine).join("\n").trimEnd();
  }

  async function handleCopyMarkdownSection(headingId) {
    const sectionSource = getMarkdownSectionSource(headingId);
    if (!sectionSource) {
      return false;
    }

    const copied = await copyTextToClipboard(sectionSource);
    if (!copied) {
      return false;
    }

    return true;
  }

  function renderMarkdownOutlineItem(heading) {
    const isActive = activeHeadingId === heading.id;
    const isAncestor = activeHeadingId !== heading.id && markdownOutlineHighlightIds.has(heading.id);
    const isOutlineCollapsed = collapsedOutlineIds.has(heading.id);
    const hasChildren = heading.children.length > 0;
    const isPreviewCollapsed = collapsedPreviewSectionIds.has(heading.id);

    return (
      <div
        key={heading.id}
        className={`markdown-outline-item markdown-outline-level-${heading.level}${isActive ? " markdown-outline-item-active" : ""}${isAncestor ? " markdown-outline-item-ancestor" : ""}`}
      >
        <button
          type="button"
          className={`markdown-outline-fold-toggle${isOutlineCollapsed ? " markdown-outline-fold-toggle-open" : ""}`}
          aria-label={isOutlineCollapsed ? "Expand outline branch" : "Collapse outline branch"}
          aria-expanded={!isOutlineCollapsed}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleOutlineCollapse(heading.id);
          }}
          disabled={!hasChildren}
          title={hasChildren ? (isOutlineCollapsed ? "Expand outline branch" : "Collapse outline branch") : "No child headings"}
        >
          {hasChildren ? (isOutlineCollapsed ? "▸" : "▾") : "·"}
        </button>
        <button
          type="button"
          className="markdown-outline-item-label"
          onClick={() => scrollToMarkdownHeading(heading.id)}
          title={heading.text}
        >
          <span className="markdown-outline-item-text">{heading.text}</span>
        </button>
        <button
          type="button"
          className="markdown-outline-preview-toggle"
          aria-label={isPreviewCollapsed ? "Expand preview section" : "Collapse preview section"}
          aria-expanded={!isPreviewCollapsed}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleSectionCollapse(heading.id);
          }}
          title={isPreviewCollapsed ? "Expand preview section" : "Collapse preview section"}
        >
          {isPreviewCollapsed ? "⊞" : "⊟"}
        </button>
      </div>
    );
  }

  function renderMarkdownOutlineNodes(nodes) {
    if (!nodes.length) {
      return null;
    }

    return nodes.map((heading) => {
      const isCollapsed = collapsedOutlineIds.has(heading.id);
      return (
        <div key={heading.id} className="markdown-outline-node">
          {renderMarkdownOutlineItem(heading)}
          {!isCollapsed ? <div className="markdown-outline-children">{renderMarkdownOutlineNodes(heading.children)}</div> : null}
        </div>
      );
    });
  }

  function handleMarkdownOutlineResizeStart(event) {
    if (event.button !== 0) {
      return;
    }

    const divider = event.currentTarget;
    const layout = divider?.parentElement;
    if (!layout) {
      return;
    }

    const rect = layout.getBoundingClientRect();
    markdownOutlineResizeRef.current = {
      resizing: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: outlineWidth,
      containerLeft: rect.left
    };

    event.preventDefault();
    event.stopPropagation();
    divider.setPointerCapture?.(event.pointerId);
  }

  function renderEditorShell() {
    return (
      <div className="editor-shell editor-shell-searchable">
        <div className="editor-line-numbers" ref={editorGutterRef} aria-hidden="true">
          {editorLineNumbers.map((lineNumber) => (
            <div key={lineNumber} className="editor-line-number">
              {lineNumber}
            </div>
          ))}
        </div>
        <div className="editor-textarea-stage">
          {searchOpen ? (
            <div className="editor-search-bar" role="search" aria-label="Editor search">
              <input
                ref={editorSearchInputRef}
                className="editor-search-input"
                type="text"
                value={searchQuery}
                onChange={(event) => handleSearchQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearchNavigate(event.shiftKey ? -1 : 1);
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    handleSearchNavigate(1);
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    handleSearchNavigate(-1);
                    return;
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    clearSearchState();
                    window.setTimeout(() => editorAreaRef.current?.focus(), 0);
                  }
                }}
                placeholder="Search"
                spellCheck={false}
              />
              <span className="editor-search-count" aria-live="polite">
                {matches.length > 0 && currentMatchIndex >= 0 ? `${currentMatchIndex + 1} / ${matches.length}` : `0 / ${matches.length}`}
              </span>
              <button
                type="button"
                className="editor-search-nav"
                onClick={() => handleSearchNavigate(-1)}
                disabled={!matches.length}
                aria-label="Previous match"
              >
                ↑
              </button>
              <button
                type="button"
                className="editor-search-nav"
                onClick={() => handleSearchNavigate(1)}
                disabled={!matches.length}
                aria-label="Next match"
              >
                ↓
              </button>
              <button
                type="button"
                className="editor-search-close"
                onClick={() => {
                  setSearchOpen(false);
                  window.setTimeout(() => editorAreaRef.current?.focus(), 0);
                }}
                aria-label="Close search"
              >
                ×
              </button>
            </div>
          ) : null}
          <div
            className="editor-highlight-layer"
            aria-hidden="true"
            style={{
              transform: `translate(${-editorScroll.left}px, ${-editorScroll.top}px)`
            }}
            dangerouslySetInnerHTML={{ __html: editorOverlayHtml }}
          />
          <textarea
            ref={editorAreaRef}
            className="editor-area editor-area-mirror"
            value={editValue}
            onChange={handleEditorChange}
            onScroll={handleEditorScroll}
            onSelect={handleEditorSelect}
            onMouseDown={handleEditorMouseDown}
            onKeyDownCapture={handleEditorKeyDownCapture}
            onKeyDown={handleEditorKeyDown}
            onPaste={handleEditorPaste}
            spellCheck={false}
          />
        </div>
      </div>
    );
  }

  function renderMarkdownListNodes(nodes, keyPrefix = "list") {
    if (!nodes.length) {
      return null;
    }

    const renderedGroups = [];
    let currentGroupType = nodes[0].type;
    let currentGroup = [];

    function flushGroup(groupIndex) {
      if (currentGroup.length === 0) {
        return;
      }

      const ListTag = currentGroupType === "ordered" ? "ol" : "ul";
      renderedGroups.push(
        <ListTag key={`${keyPrefix}-group-${groupIndex}`} className={`markdown-list markdown-list-${currentGroupType}`}>
          {currentGroup.map((node, index) => (
            <li
              key={`${keyPrefix}-${groupIndex}-${index}`}
              className={`markdown-list-item${node.task ? " markdown-task-item" : ""}${node.checked ? " markdown-task-item-complete" : ""}`}
            >
              <div className="markdown-list-item-content">
                {node.task ? (
                  <span className="markdown-task-checkbox" aria-hidden="true">
                    {node.checked ? "☑" : "☐"}
                  </span>
                ) : null}
                <span
                  className="markdown-list-item-text"
                  dangerouslySetInnerHTML={{ __html: node.textHtml }}
                />
              </div>
              {node.children.length > 0 ? (
                <div className="markdown-list-children">
                  {renderMarkdownListNodes(node.children, `${keyPrefix}-${groupIndex}-${index}`)}
                </div>
              ) : null}
            </li>
          ))}
        </ListTag>
      );
      currentGroup = [];
    }

    nodes.forEach((node, index) => {
      if (index === 0) {
        currentGroupType = node.type;
      }

      if (node.type !== currentGroupType) {
        flushGroup(renderedGroups.length);
        currentGroupType = node.type;
      }

      currentGroup.push(node);
    });

    flushGroup(renderedGroups.length);
    return renderedGroups;
  }

  function renderMarkdownBlocks() {
    if (!markdownDocument.blocks.length) {
      return <div className="panel-empty">Markdown content is empty.</div>;
    }

    const rendered = [];
    const headingStack = [];

    for (const block of markdownDocument.blocks) {
      while (headingStack.length > 0 && block.kind === "heading" && headingStack[headingStack.length - 1].level >= block.level) {
        headingStack.pop();
      }

      const hidden = headingStack.some((item) => item.collapsed);

      if (block.kind === "heading") {
        const isCollapsed = collapsedPreviewSectionIds.has(block.id);
        const isHiddenHeading = hidden;
        if (!isHiddenHeading) {
          const HeadingTag = `h${block.level}`;
          rendered.push(
            <HeadingTag key={block.id} id={block.id} className={`markdown-heading markdown-heading-level-${block.level}`}>
              <button
                type="button"
                className={`markdown-heading-toggle${isCollapsed ? "" : " markdown-heading-toggle-open"}`}
                aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                aria-expanded={!isCollapsed}
                onClick={() => toggleSectionCollapse(block.id)}
              >
                &gt;
              </button>
              <span
                className="markdown-heading-label"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
              <CopyButton
                className="markdown-heading-copy"
                onCopy={() => handleCopyMarkdownSection(block.id)}
                copyLabel={`Copy section for ${block.text}`}
                copiedLabel={`Section copied for ${block.text}`}
                title="Copy section"
              />
            </HeadingTag>
          );
        }
        headingStack.push({ level: block.level, collapsed: hidden || isCollapsed });
        continue;
      }

      if (hidden) {
        continue;
      }

      if (block.kind === "paragraph") {
        rendered.push(
          <p key={`paragraph-${rendered.length}`} className="markdown-paragraph" dangerouslySetInnerHTML={{ __html: block.html }} />
        );
        continue;
      }

      if (block.kind === "list") {
        rendered.push(
          <div key={`list-${rendered.length}`} className="markdown-list-shell">
            {renderMarkdownListNodes(block.items, `list-${rendered.length}`)}
          </div>
        );
        continue;
      }

      if (block.kind === "code") {
        rendered.push(
          <CodeBlockRenderer
            key={`code-${rendered.length}`}
            block={block}
            onCopy={async (codeBlock) => copyTextToClipboard(codeBlock.code || codeBlock.raw || "")}
          />
        );
        continue;
      }

      if (block.kind === "mermaid") {
        rendered.push(
          <div key={`mermaid-${rendered.length}`} className="markdown-mermaid-shell">
            <div className="markdown-mermaid-title">Mermaid</div>
            <pre className="markdown-mermaid-fallback">
              <code dangerouslySetInnerHTML={{ __html: block.html }} />
            </pre>
          </div>
        );
        continue;
      }

      if (block.kind === "quote") {
        rendered.push(
          <blockquote key={`quote-${rendered.length}`} className="markdown-quote">
            <div className="markdown-quote-body" dangerouslySetInnerHTML={{ __html: block.html }} />
          </blockquote>
        );
        continue;
      }

      if (block.kind === "callout") {
        rendered.push(
          <div key={`callout-${rendered.length}`} className={`markdown-callout markdown-callout-${block.calloutType}`}>
            <div className="markdown-callout-title">{block.title}</div>
            <div className="markdown-callout-body" dangerouslySetInnerHTML={{ __html: block.html }} />
          </div>
        );
        continue;
      }

      if (block.kind === "hr") {
        rendered.push(<hr key={`hr-${rendered.length}`} className="markdown-hr" />);
        continue;
      }

      if (block.kind === "table") {
        rendered.push(
          <div key={`table-${rendered.length}`} className="markdown-table-wrap">
            <table className="markdown-table">
              <thead>
                <tr>
                  {block.headers.map((header, index) => (
                    <th key={index} dangerouslySetInnerHTML={{ __html: header }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} dangerouslySetInnerHTML={{ __html: cell }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    return rendered;
  }

  return (
    <div
      ref={previewShellRef}
      id="pane-refactor-before-split"
      className={`preview-shell${dragOverPaneId === pane.id ? " drag-over" : ""}`}
      onDragOver={(event) => onPaneDragOver?.(pane.id, event)}
      onDrop={(event) => onPaneDrop?.(pane.id, event)}
      onDragLeave={(event) => onPaneDragLeave?.(pane.id, event)}
      style={{
        "--preview-font-scale": previewFontScale,
        "--markdown-heading-color-1": markdownHeadingColors?.[0] || "#8fd3ff",
        "--markdown-heading-color-2": markdownHeadingColors?.[1] || "#7bdc6a",
        "--markdown-heading-color-3": markdownHeadingColors?.[2] || "#f5c542",
        "--markdown-heading-color-4": markdownHeadingColors?.[3] || "#c18cff",
        "--markdown-heading-color-5": markdownHeadingColors?.[4] || "#e88787",
        "--markdown-heading-color-6": markdownHeadingColors?.[5] || "#9dd6c4",
        "--markdown-heading-size-1": String(markdownHeadingSizes?.[0] || 1.65),
        "--markdown-heading-size-2": String(markdownHeadingSizes?.[1] || 1.4),
        "--markdown-heading-size-3": String(markdownHeadingSizes?.[2] || 1.22),
        "--markdown-heading-size-4": String(markdownHeadingSizes?.[3] || 1.08),
        "--markdown-heading-size-5": String(markdownHeadingSizes?.[4] || 0.98),
        "--markdown-heading-size-6": String(markdownHeadingSizes?.[5] || 0.98)
      }}
    >
      {edgeDropPosition ? (
        <div
          className={`pane-edge-preview pane-edge-preview-${edgeDropPosition}`}
          aria-hidden="true"
        />
      ) : null}
      <div
        className="preview-tabs"
        role="tablist"
        aria-label="Opened files"
        onWheel={(event) => {
          if (openTabs.length <= 1) {
            return;
          }

          event.currentTarget.scrollLeft += event.deltaY || event.deltaX;
          event.preventDefault();
        }}
      >
        {openTabs.map((tab, tabIndex) => {
          const isActive = tab.path === activeTabPath;
          const isDragging = draggingTab?.path === tab.path && draggingTab?.fromPaneId === pane.id;
          const isDropBefore = dragOverPaneId === pane.id && dragOverIndex === tabIndex;
          const isDropAfter = dragOverPaneId === pane.id && dragOverIndex === tabIndex + 1;
          return (
            <div
              key={tab.path}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              draggable={openTabs.length > 1}
              className={`preview-tab${openTabs.length === 1 ? " single-tab" : ""}${isActive ? " active" : ""}${isActivePane && isActive && showEditButton ? " has-actions" : ""}${isDragging ? " dragging" : ""}${isDropBefore ? " drop-before" : ""}${isDropAfter ? " drop-after" : ""}`}
              title={tab.path}
              onClick={() => {
                onPaneFocus?.(pane.id);
                setActiveTabPath(tab.path);
              }}
              onDragStart={(event) => onTabDragStart?.(pane.id, tab.path, event)}
              onDragOver={(event) => onTabDragOver?.(pane.id, tab.path, tabIndex, event)}
              onDrop={(event) => onTabDrop?.(pane.id, tab.path, tabIndex, event)}
              onDragEnd={() => onTabDragEnd?.()}
              onContextMenu={(event) => handleTabContextMenu(tab, event)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  closeTab(tab.path);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }
                event.preventDefault();
                onPaneFocus?.(pane.id);
                setActiveTabPath(tab.path);
              }}
              onDoubleClick={() => {
                // Pinning is reserved for a later step.
              }}
            >
              <span className="preview-tab-title">
                <span className="preview-tab-name">{tab.name}</span>
                {tab.path === activeTabPath ? (
                  activeTab?.isDirty ? <span className="preview-tab-dirty" aria-hidden="true">●</span> : null
                ) : tab.isDirty ? (
                  <span className="preview-tab-dirty" aria-hidden="true">●</span>
                ) : null}
              </span>
              {isActivePane && isActive && showEditButton ? (
                <span className="preview-active-tab-actions icon-area">
                  {mode === "edit" ? (
                    <button
                      type="button"
                      className="tab-icon-button icon-btn active"
                      aria-label="Preview"
                      title="Preview"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setMode("preview");
                      }}
                    >
                      <FileTextIcon />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tab-icon-button icon-btn active"
                      aria-label="Edit"
                      title="Edit"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setMode("edit");
                      }}
                    >
                      <PenIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    className={`tab-icon-button icon-btn markdown-outline-toggle-button${showMarkdownOutlinePane ? " active" : ""}`}
                    aria-label="Outline"
                    aria-pressed={showMarkdownOutlinePane}
                    title="Outline"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setShowMarkdownOutlinePane((current) => !current);
                    }}
                  >
                    <ListIcon />
                  </button>
                  {showSaveButton ? (
                    <button
                      type="button"
                      className="save-button action-save"
                      onClick={async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        await saveFile(fileData.path, editValue);
                        setBaseEditValue(editValue);
                        syncActiveTabState({
                          content: editValue,
                          baseEditValue: editValue,
                          isDirty: false
                        });
                        onSaved();
                      }}
                    >
                      Save
                      </button>
                  ) : null}
                </span>
              ) : null}
              <span
                className="preview-tab-close"
                role="button"
                tabIndex={-1}
                aria-label={`Close ${tab.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeTab(tab.path);
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                ×
              </span>
            </div>
          );
        })}
      </div>
      {tabContextMenu ? (
        <div
          className="preview-tab-menu"
          style={{ left: `${tabContextMenu.x}px`, top: `${tabContextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="preview-tab-menu-item"
            onClick={() => {
              onSplitRight?.(pane.id, tabContextMenu.tabPath);
              setTabContextMenu(null);
            }}
          >
            Split Right
          </button>
          <button type="button" className="preview-tab-menu-item" onClick={() => setTabContextMenu(null)}>
            Close
          </button>
        </div>
      ) : null}
      <div className="preview-toolbar">
        <div className="preview-toolbar-main">
          <div className="preview-toolbar-row">
            <div className="preview-actions">
              {isPdf ? (
                <>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages || 1, page + (pdfDualPage ? 2 : 1)))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </button>
                  <span>{`${currentPage} / ${totalPages}`}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - (pdfDualPage ? 2 : 1)))}
                    disabled={currentPage <= 1}
                  >
                    Prev
                  </button>
                </>
              ) : null}
              {canNavigateImages ? (
                <>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      const nextIndex = Math.min(imageNavFiles.length - 1, imageNavIndex + 1);
                      const nextFile = imageNavFiles[nextIndex];
                      if (nextFile) {
                        onSelectFile(nextFile);
                      }
                    }}
                    disabled={imageNavIndex >= imageNavFiles.length - 1}
                  >
                    Next
                  </button>
                  <span>{`${imageNavIndex + 1} / ${imageNavFiles.length}`}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      const nextIndex = Math.max(0, imageNavIndex - 1);
                      const nextFile = imageNavFiles[nextIndex];
                      if (nextFile) {
                        onSelectFile(nextFile);
                      }
                    }}
                    disabled={imageNavIndex <= 0}
                  >
                    Prev
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="panel-empty">Loading preview...</div>
      ) : error ? (
        <div className="panel-empty">{error}</div>
      ) : !fileData ? (
        <div className="panel-empty">No preview available.</div>
      ) : (
        <>
          {isPdf ? (
            <div
              ref={(node) => {
                pdfWrapRef.current = node;
                previewScrollRef.current = node;
              }}
              className="pdf-preview-wrap"
              onScroll={handlePreviewScroll}
            >
              <div className={`pdf-pages ${pdfDualPage ? "dual" : "single"}`}>
                {pdfPages.map((page) => (
                  <img
                    key={page.pageNumber}
                    className="pdf-page-image"
                    alt={`${fileData.name} page ${page.pageNumber}`}
                    src={page.src}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {isImage ? (
            <div className="image-preview-wrap" ref={previewScrollRef} onScroll={handlePreviewScroll}>
              <img
                className="image-preview"
                alt={fileTitle}
                src={imageSrc}
                onLoad={(event) => {
                  if (fileData.sourceWidth && fileData.sourceHeight) {
                    return;
                  }
                  const target = event.currentTarget;
                  setImageSize({
                    width: target.naturalWidth,
                    height: target.naturalHeight
                  });
                }}
              />
            </div>
          ) : null}

          {isCsv ? (
            <div className="table-wrap" ref={previewScrollRef} onScroll={handlePreviewScroll}>
              <table className="csv-table">
                <tbody>
                  {csvRows.map((row, rowIndex) => (
                    <tr key={`${rowIndex}-${row.join("-")}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!isPdf && !isImage && !isCsv ? (
            <div className="preview-text-stage">
              {mode === "preview" ? (
                isMarkdown ? (
                  <div
                    ref={markdownPreviewOutlineLayoutRef}
                    className={`markdown-preview-layout${showMarkdownOutlinePane ? "" : " markdown-outline-hidden"}`}
                    style={showMarkdownOutlinePane ? { position: "relative" } : { position: "relative" }}
                  >
                    {showMarkdownOutlinePane ? (
                      <aside className="markdown-outline outline" aria-label="Markdown outline" style={{ width: `${outlineWidth}px` }}>
                        <div className="markdown-outline-title">Outline</div>
                        {markdownDocument.headings.length > 0 ? (
                          <div className="markdown-outline-list">
                            {renderMarkdownOutlineNodes(markdownOutlineTree)}
                          </div>
                        ) : (
                          <div className="markdown-outline-empty">No headings</div>
                        )}
                      </aside>
                    ) : null}
                    <div
                      className={`code-preview markdown-preview markdown-preview-scroll markdown-main${showMarkdownOutlinePane ? "" : " markdown-preview-fullwidth"}`}
                      ref={previewScrollRef}
                      onScroll={handlePreviewScroll}
                    >
                      {renderMarkdownBlocks()}
                    </div>
                    {showMarkdownOutlinePane ? (
                      <div
                        ref={markdownPreviewOutlineDividerRef}
                        className="outline-divider"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize outline panel"
                        style={{ left: `${outlineWidth}px` }}
                        onPointerDown={handleMarkdownOutlineResizeStart}
                      />
                    ) : null}
                  </div>
                ) : (
                  <pre className="code-preview" ref={previewScrollRef} onScroll={handlePreviewScroll}>
                    <code dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                  </pre>
                )
              ) : null}

              {mode === "edit" ? (
                isMarkdown ? (
                  <div
                    ref={markdownSplitRef}
                    className="markdown-edit-split"
                    style={{
                      gridTemplateColumns: `${Math.round(markdownSplitRatio * 1000) / 10}% 4px minmax(0, 1fr)`
                    }}
                  >
                    <div className="markdown-edit-split-pane markdown-edit-split-pane-editor">
                      {renderEditorShell()}
                    </div>
                    <button
                      type="button"
                      className="markdown-edit-split-divider"
                      aria-label="Resize markdown editor preview split"
                      onPointerDown={handleMarkdownSplitPointerDown}
                    />
                    <div className="markdown-edit-split-pane markdown-edit-split-pane-preview">
                      <div
                        ref={markdownSplitOutlineLayoutRef}
                        className={`markdown-preview-layout${showMarkdownOutlinePane ? "" : " markdown-outline-hidden"}`}
                        style={showMarkdownOutlinePane ? { position: "relative" } : { position: "relative" }}
                      >
                        {showMarkdownOutlinePane ? (
                          <aside className="markdown-outline outline" aria-label="Markdown outline" style={{ width: `${outlineWidth}px` }}>
                            <div className="markdown-outline-title">Outline</div>
                            {markdownDocument.headings.length > 0 ? (
                              <div className="markdown-outline-list">
                                {renderMarkdownOutlineNodes(markdownOutlineTree)}
                              </div>
                            ) : (
                              <div className="markdown-outline-empty">No headings</div>
                            )}
                          </aside>
                        ) : null}
                        <div
                          className={`code-preview markdown-preview markdown-preview-scroll markdown-main${showMarkdownOutlinePane ? "" : " markdown-preview-fullwidth"}`}
                          ref={previewScrollRef}
                          onScroll={handlePreviewScroll}
                        >
                          {renderMarkdownBlocks()}
                        </div>
                        {showMarkdownOutlinePane ? (
                          <div
                            ref={markdownSplitOutlineDividerRef}
                            className="outline-divider"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize outline panel"
                            style={{ left: `${outlineWidth}px` }}
                            onPointerDown={handleMarkdownOutlineResizeStart}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  renderEditorShell()
                )
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const PaneContainer = forwardRef(function PaneContainer({
  selectedFile,
  onSelectFile,
  onSaved,
  onPaneStateChange,
  markdownHeadingColors,
  markdownHeadingSizes
}, ref) {
  const emptyPaneState = () => [{ id: "pane-1", tabs: [], activeTabPath: "" }];
  const [panes, setPanes] = useState(() => [{ id: "pane-1", tabs: [], activeTabPath: "" }]);
  const [activePaneId, setActivePaneId] = useState("pane-1");
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [draggingTab, setDraggingTab] = useState(null);
  const [dragOverPaneId, setDragOverPaneId] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [edgeDropPosition, setEdgeDropPosition] = useState(null);
  const paneIdRef = useRef(2);
  const containerRef = useRef(null);
  const resizingRef = useRef(false);
  const resizeRafRef = useRef(0);
  const resizeRatioRef = useRef(0.5);
  const dragRafRef = useRef(0);
  const edgeDropPositionRef = useRef(null);

  useEffect(() => {
    onPaneStateChange?.(panes);
  }, [onPaneStateChange, panes]);

  function updatePane(paneId, updater) {
    setPanes((current) =>
      current.map((pane) => {
        if (pane.id !== paneId) {
          return pane;
        }
        return typeof updater === "function" ? updater(pane) : updater;
      })
    );
  }

  function openFile(file) {
    if (!file?.path) {
      return;
    }

    const targetPane = panes.find((pane) => pane.id === activePaneId) || panes[0];
    if (!targetPane) {
      return;
    }

    setPanes((current) =>
      current.map((pane) => {
        if (pane.id !== targetPane.id) {
          return pane;
        }

        if (pane.tabs.some((tab) => tab.path === file.path)) {
          return {
            ...pane,
            activeTabPath: file.path
          };
        }

        return {
          ...pane,
          tabs: [...pane.tabs, { path: file.path, name: file.name, content: "", isDirty: false }],
          activeTabPath: file.path
        };
      })
    );
  }

  useImperativeHandle(
    ref,
    () => ({
      openFile,
      resetWorkspace: () => {
        setPanes(emptyPaneState());
        setActivePaneId("pane-1");
      }
    }),
    [panes, activePaneId]
  );

  function removePane(paneId) {
    setPanes((current) => {
      if (current.length <= 1) {
        return current;
      }

      const nextPanes = current.filter((pane) => pane.id !== paneId);
      if (nextPanes.length === 0) {
        return current;
      }

      if (activePaneId === paneId) {
        setActivePaneId(nextPanes[0].id);
      }

      return nextPanes;
    });
  }

  function activatePane(paneId) {
    setActivePaneId(paneId);
  }

  function resetTabDragState() {
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = 0;
    }
    setDraggingTab(null);
    setDragOverPaneId("");
    setDragOverIndex(null);
    setEdgeDropPosition(null);
    edgeDropPositionRef.current = null;
  }

  function clampSplitRatio(value) {
    return Math.min(0.8, Math.max(0.2, value));
  }

  function updateSplitRatioFromPointer(clientX) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return;
    }

    const nextRatio = clampSplitRatio((clientX - rect.left) / rect.width);
    resizeRatioRef.current = nextRatio;

    if (resizeRafRef.current) {
      cancelAnimationFrame(resizeRafRef.current);
    }

    resizeRafRef.current = requestAnimationFrame(() => {
      setSplitRatio(resizeRatioRef.current);
    });
  }

  function splitPane(paneId, direction = "right", tabPath = "") {
    let nextTargetPaneId = "";
    setPanes((current) => {
      if (current.length >= 2) {
        return current;
      }

      const sourcePane = current.find((pane) => pane.id === paneId);
      if (!sourcePane) {
        return current;
      }

      const sourceTabPath = tabPath || sourcePane.activeTabPath || sourcePane.tabs[0]?.path || "";
      if (!sourceTabPath) {
        return current;
      }

      const sourceTab = sourcePane.tabs.find((tab) => tab.path === sourceTabPath);
      const targetPaneId = `pane-${paneIdRef.current++}`;
      nextTargetPaneId = targetPaneId;
      const nextPane = {
        id: targetPaneId,
        tabs: sourceTab ? [{ ...sourceTab }] : [],
        activeTabPath: sourceTabPath
      };

      const nextSourcePane = {
        ...sourcePane,
        tabs: sourcePane.tabs.filter((tab) => tab.path !== sourceTabPath),
        activeTabPath:
          sourcePane.activeTabPath === sourceTabPath
            ? sourcePane.tabs.find((tab) => tab.path !== sourceTabPath)?.path || ""
            : sourcePane.activeTabPath
      };

      const nextPanes = direction === "right" ? [nextSourcePane, nextPane] : [nextSourcePane, nextPane];
      return nextPanes.filter((pane) => pane.tabs.length > 0 || pane.id === targetPaneId);
    });

    if (nextTargetPaneId) {
      setActivePaneId(nextTargetPaneId);
    }
  }

  function updatePaneFromPaneComponent(paneId, updater) {
    updatePane(paneId, typeof updater === "function" ? updater : () => updater);
  }

  function insertTabAt(tabs, tab, index) {
    const nextTabs = [...tabs];
    const safeIndex = Math.max(0, Math.min(index, nextTabs.length));
    nextTabs.splice(safeIndex, 0, tab);
    return nextTabs;
  }

  function getPaneTabsLength(paneId) {
    return panes.find((pane) => pane.id === paneId)?.tabs.length || 0;
  }

  function moveDraggingTabToPane({ toPaneId, insertIndex, copy = false }) {
    if (!draggingTab?.path || !draggingTab?.fromPaneId || !toPaneId) {
      return;
    }

    setPanes((current) => {
      const sourcePane = current.find((pane) => pane.id === draggingTab.fromPaneId);
      const targetPane = current.find((pane) => pane.id === toPaneId);
      if (!sourcePane || !targetPane) {
        return current;
      }

      const sourceTab = sourcePane.tabs.find((tab) => tab.path === draggingTab.path);
      if (!sourceTab) {
        return current;
      }

      const samePane = sourcePane.id === targetPane.id;
      const sourceIndex = sourcePane.tabs.findIndex((tab) => tab.path === draggingTab.path);
      const shouldCopy = copy && !samePane;
      const moveTab = { ...sourceTab };

      let nextSourceTabs = sourcePane.tabs;
      let nextTargetTabs = targetPane.tabs;

      if (!shouldCopy) {
        nextSourceTabs = sourcePane.tabs.filter((tab) => tab.path !== draggingTab.path);
      }

      if (samePane) {
        const remaining = sourcePane.tabs.filter((tab) => tab.path !== draggingTab.path);
        const adjustedIndex = insertIndex > sourceIndex ? insertIndex - 1 : insertIndex;
        const targetPosition = Math.max(0, Math.min(adjustedIndex, remaining.length));
        if (targetPosition === sourceIndex || targetPosition === sourceIndex + 1) {
          return current;
        }
        nextTargetTabs = insertTabAt(remaining, moveTab, adjustedIndex);
      } else {
        const targetPosition = Math.max(0, Math.min(insertIndex, targetPane.tabs.length));
        const dedupedTarget = targetPane.tabs.filter((tab) => tab.path !== draggingTab.path);
        nextTargetTabs = insertTabAt(dedupedTarget, moveTab, targetPosition);
      }

      const nextPanes = current
        .map((pane) => {
          if (pane.id === sourcePane.id) {
            return {
              ...pane,
              tabs: nextSourceTabs,
              activeTabPath:
                pane.activeTabPath === draggingTab.path ? nextSourceTabs[0]?.path || "" : pane.activeTabPath
            };
          }
          if (pane.id === targetPane.id) {
            return {
              ...pane,
              tabs: nextTargetTabs,
              activeTabPath: draggingTab.path
            };
          }
          return pane;
        })
        .filter((pane) => pane.id !== sourcePane.id || samePane || nextSourceTabs.length > 0);

      if (!samePane && nextSourceTabs.length === 0 && activePaneId === sourcePane.id) {
        setActivePaneId(targetPane.id);
      }

      return nextPanes;
    });

    setActivePaneId(toPaneId);
  }

  function handleTabDragStart(paneId, tabPath, event) {
    if (event.button !== 0) {
      return;
    }

    setDraggingTab({
      path: tabPath,
      fromPaneId: paneId,
      copy: Boolean(event.ctrlKey || event.metaKey)
    });
    setDragOverPaneId(paneId);
    setDragOverIndex(getPaneTabsLength(paneId));
    setEdgeDropPosition(null);
    edgeDropPositionRef.current = null;
  }

  function getEdgeDropPositionFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;
    if (xRatio <= 0.2) {
      return "left";
    }
    if (xRatio >= 0.8) {
      return "right";
    }
    if (yRatio <= 0.2) {
      return "top";
    }
    if (yRatio >= 0.8) {
      return "bottom";
    }
    return null;
  }

  function handleTabDragOver(paneId, tabPath, tabIndex, event) {
    if (!draggingTab?.path) {
      return;
    }

    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const nextIndex = event.clientX < rect.left + rect.width / 2 ? tabIndex : tabIndex + 1;

    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
    }

    dragRafRef.current = requestAnimationFrame(() => {
      setDragOverPaneId(paneId);
      setDragOverIndex(nextIndex);
      setEdgeDropPosition(null);
      edgeDropPositionRef.current = null;
    });
  }

  function handlePaneDragOver(paneId, event) {
    if (!draggingTab?.path) {
      return;
    }

    event.preventDefault();

    const nextEdgeDropPosition = getEdgeDropPositionFromEvent(event);

    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
    }

    dragRafRef.current = requestAnimationFrame(() => {
      setDragOverPaneId(paneId);
      setDragOverIndex(getPaneTabsLength(paneId));
      setEdgeDropPosition(nextEdgeDropPosition);
      edgeDropPositionRef.current = nextEdgeDropPosition;
    });
  }

  function handleTabDrop(paneId, tabPath, tabIndex, event) {
    if (!draggingTab?.path) {
      return;
    }

    event.preventDefault();
    const nextEdgeDropPosition =
      edgeDropPositionRef.current || getEdgeDropPositionFromEvent(event) || edgeDropPosition;
    if (nextEdgeDropPosition) {
      splitPane(paneId, nextEdgeDropPosition === "bottom" ? "bottom" : "right", draggingTab.path);
      resetTabDragState();
      return;
    }
    const insertIndex = dragOverPaneId === paneId && dragOverIndex !== null ? dragOverIndex : tabIndex;
    moveDraggingTabToPane({
      toPaneId: paneId,
      insertIndex,
      copy: draggingTab.copy
    });
    resetTabDragState();
  }

  function handlePaneDrop(paneId, event) {
    if (!draggingTab?.path) {
      return;
    }

    event.preventDefault();
    const nextEdgeDropPosition =
      edgeDropPositionRef.current || getEdgeDropPositionFromEvent(event) || edgeDropPosition;
    if (nextEdgeDropPosition) {
      splitPane(paneId, nextEdgeDropPosition === "bottom" ? "bottom" : "right", draggingTab.path);
      resetTabDragState();
      return;
    }
    moveDraggingTabToPane({
      toPaneId: paneId,
      insertIndex: dragOverPaneId === paneId && dragOverIndex !== null ? dragOverIndex : getPaneTabsLength(paneId),
      copy: draggingTab.copy
    });
    resetTabDragState();
  }

  function handlePaneDragLeave(paneId, event) {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    if (dragOverPaneId === paneId) {
      setDragOverPaneId("");
      setDragOverIndex(null);
      setEdgeDropPosition(null);
    }
  }

  function handleTabDragEnd() {
    resetTabDragState();
  }

  useEffect(() => {
    function handlePointerMove(event) {
      if (!resizingRef.current) {
        return;
      }

      event.preventDefault();
      updateSplitRatioFromPointer(event.clientX);
    }

    function handlePointerUp() {
      if (!resizingRef.current) {
        return;
      }

      resizingRef.current = false;
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  function handlePaneUpdate(paneId, updater) {
    updatePane(paneId, updater);
  }

  return (
    <div
      ref={containerRef}
      className="pane-container"
      style={{ "--split-ratio": String(splitRatio) }}
    >
      {panes.map((pane, index) => {
        const isSplit = panes.length === 2;
        const paneStyle = isSplit
          ? index === 0
            ? { flex: "0 0 auto", width: "calc((100% - 4px) * var(--split-ratio))" }
            : { flex: "0 0 auto", width: "calc((100% - 4px) * (1 - var(--split-ratio)))" }
          : undefined;

        return (
          <Fragment key={pane.id}>
            <div className="pane-shell" style={paneStyle}>
              <Pane
                pane={pane}
                isActivePane={pane.id === activePaneId}
                selectedFile={pane.id === activePaneId ? selectedFile : null}
                onSelectFile={onSelectFile}
                onSaved={onSaved}
                markdownHeadingColors={markdownHeadingColors}
                markdownHeadingSizes={markdownHeadingSizes}
                onUpdatePane={(updater) => handlePaneUpdate(pane.id, updater)}
                onSplitRight={(paneId, tabPath) => splitPane(paneId, "right", tabPath)}
                onPaneFocus={() => setActivePaneId(pane.id)}
                draggingTab={draggingTab}
                dragOverPaneId={dragOverPaneId}
                dragOverIndex={dragOverIndex}
                edgeDropPosition={edgeDropPosition}
                onTabDragStart={handleTabDragStart}
                onTabDragOver={handleTabDragOver}
                onTabDrop={handleTabDrop}
                onTabDragEnd={handleTabDragEnd}
                onPaneDragOver={handlePaneDragOver}
                onPaneDrop={handlePaneDrop}
                onPaneDragLeave={handlePaneDragLeave}
                onPaneEmpty={removePane}
              />
            </div>
            {panes.length === 2 && index === 0 ? (
              <div
                className="pane-divider"
                role="separator"
                aria-orientation="vertical"
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  resizingRef.current = true;
                  updateSplitRatioFromPointer(event.clientX);
                }}
              />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
});

export default PaneContainer;
