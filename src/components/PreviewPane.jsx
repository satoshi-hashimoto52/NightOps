import { useEffect, useMemo, useRef, useState } from "react";
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
import { listDirectory, onFileChanged, readFile, saveFile, unwatchFile, watchFile } from "../utils/fileLoader";

const MAX_CSV_ROWS = 1000;
const RECENT_FILES_KEY = "nightops:recent-files";
const MAX_RECENT_FILES = 10;
const MAX_PDF_DIMENSION = 1200;
const IMAGE_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "heic", "heif"]);

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
  return fileName.toLowerCase().endsWith(".md");
}

function escapeHtml(code) {
  return String(code ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isImageFileName(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return IMAGE_FILE_EXTENSIONS.has(ext);
}

function renderMarkdownInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function parseMarkdownDocument(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const headings = [];
  let paragraphLines = [];
  let listItems = [];
  let codeLines = [];
  let inCodeBlock = false;
  let codeLanguage = "";

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      kind: "paragraph",
      html: paragraphLines.map((line) => renderMarkdownInline(line)).join("<br>")
    });
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      kind: "list",
      items: [...listItems]
    });
    listItems = [];
  }

  function flushCodeBlock() {
    if (!inCodeBlock) {
      return;
    }

    const code = codeLines.join("\n");
    const highlightedCode = codeLanguage && hljs.getLanguage(codeLanguage)
      ? hljs.highlight(code, { language: codeLanguage, ignoreIllegals: true }).value
      : escapeHtml(code);
    blocks.push({
      kind: "code",
      language: codeLanguage,
      html: highlightedCode
    });
    codeLines = [];
    codeLanguage = "";
    inCodeBlock = false;
  }

  for (const line of lines) {
    if (inCodeBlock) {
      if (/^```/.test(line)) {
        flushCodeBlock();
        continue;
      }
      codeLines.push(line);
      continue;
    }

    const fenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      inCodeBlock = true;
      codeLanguage = fenceMatch[1] || "";
      codeLines = [];
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const id = `heading-${headings.length}`;
      const html = renderMarkdownInline(headingMatch[2]);
      const heading = {
        kind: "heading",
        id,
        level,
        html,
        text: headingMatch[2]
      };
      headings.push(heading);
      blocks.push(heading);
      continue;
    }

    const listMatch = line.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(`<li>${renderMarkdownInline(listMatch[1])}</li>`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (listItems.length > 0) {
      flushList();
    }
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
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

export default function PreviewPane({ selectedFile, onSelectFile, onSaved, markdownHeadingColors }) {
  const [fileData, setFileData] = useState(null);
  const [editValue, setEditValue] = useState("");
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
  const [collapsedMarkdownHeadings, setCollapsedMarkdownHeadings] = useState(() => new Set());
  const previewShellRef = useRef(null);
  const pdfWrapRef = useRef(null);
  const pdfPageUrlsRef = useRef([]);
  const editorGutterRef = useRef(null);
  const markdownSplitRef = useRef(null);
  const markdownSplitDragRef = useRef({ dragging: false });
  const isMarkdown = Boolean(fileData && isMarkdownFileName(fileData.name));
  const markdownDocument = useMemo(
    () => (isMarkdown ? parseMarkdownDocument(editValue) : { blocks: [], headings: [] }),
    [editValue, isMarkdown]
  );

  const editorLineCount = useMemo(
    () => Math.max(1, editValue.split(/\r\n|\r|\n/).length),
    [editValue]
  );

  const editorLineNumbers = useMemo(
    () => Array.from({ length: editorLineCount }, (_, index) => index + 1),
    [editorLineCount]
  );

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

  function handleEditorScroll(event) {
    if (editorGutterRef.current) {
      editorGutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
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

    if (!selectedFile?.path) {
      unwatchFile();
      setFileData(null);
      setEditValue("");
      setError("");
      setImageSrc("");
      setCurrentPage(1);
      setTotalPages(0);
      setCollapsedMarkdownHeadings(new Set());
      return;
    }

    async function load() {
      try {
        await watchFile(selectedFile.path);
        setLoading(true);
        setError("");
        setPdfPages([]);
        setCurrentPage(1);
        setTotalPages(0);
        const next = await readFile(selectedFile.path);
        if (cancelled) {
          return;
        }
        setFileData(next);
        try {
          setEditValue(next.type === "json" ? JSON.stringify(JSON.parse(next.content), null, 2) : next.content || "");
        } catch {
          setEditValue(next.content || "");
        }
        setMode("preview");
        setCollapsedMarkdownHeadings(new Set());
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
        setCollapsedMarkdownHeadings(new Set());
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      unwatchFile();
    };
  }, [selectedFile]);

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
    if (!selectedFile?.path) {
      return;
    }

    const nextRecentFiles = [
      selectedFile,
      ...recentFiles.filter((item) => item.path !== selectedFile.path)
    ].slice(0, MAX_RECENT_FILES);

    setRecentFiles(nextRecentFiles);
    saveRecentFiles(nextRecentFiles);
  }, [selectedFile]);

  useEffect(() => {
    let unsubscribe;

    async function init() {
      unsubscribe = onFileChanged(async (filePath) => {
        if (filePath !== selectedFile?.path) {
          return;
        }
        try {
          const next = await readFile(filePath);
          setFileData(next);
          try {
            setEditValue(next.type === "json" ? JSON.stringify(JSON.parse(next.content), null, 2) : next.content || "");
          } catch {
            setEditValue(next.content || "");
          }
          setError("");
        } catch (loadError) {
          setError(loadError.message);
          setFileData(null);
        }
      });
    }

    init();

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [selectedFile]);

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
      if (fileData?.type !== "image" || !selectedFile?.directoryPath) {
        setImageNavFiles([]);
        return;
      }

      try {
        const entries = await listDirectory(selectedFile.directoryPath);
        const nextFiles = entries
          .filter((entry) => entry.type === "file" && isImageFileName(entry.name))
          .map((entry) => ({
            path: entry.path,
            name: entry.name,
            directoryPath: selectedFile.directoryPath
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
  }, [fileData, selectedFile]);

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

  if (!selectedFile) {
    return (
      <div className="preview-shell">
        <div className="panel-empty">Select a file from the tree.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="panel-empty">Loading preview...</div>;
  }

  if (error) {
    return <div className="panel-empty">{error}</div>;
  }

  if (!fileData) {
    return <div className="panel-empty">No preview available.</div>;
  }

  const isPdf = fileData.type === "pdf";
  const isImage = fileData.type === "image";
  const isCsv = fileData.type === "csv";
  const canEdit = fileData.editable;
  const csvRows = isCsv ? parseCsv(fileData.content) : [];
  const imageNavIndex = isImage ? imageNavFiles.findIndex((item) => item.path === selectedFile.path) : -1;
  const canNavigateImages = isImage && imageNavIndex >= 0 && imageNavFiles.length > 1;
  const resolvedImageSize =
    isImage && fileData.sourceWidth && fileData.sourceHeight
      ? { width: fileData.sourceWidth, height: fileData.sourceHeight }
      : imageSize;
  const fileTitle = isImage && resolvedImageSize ? `${fileData.name} (${resolvedImageSize.width}x${resolvedImageSize.height})` : fileData.name;

  function toggleMarkdownHeading(headingId) {
    setCollapsedMarkdownHeadings((current) => {
      const next = new Set(current);
      if (next.has(headingId)) {
        next.delete(headingId);
      } else {
        next.add(headingId);
      }
      return next;
    });
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
        const isCollapsed = collapsedMarkdownHeadings.has(block.id);
        const isHiddenHeading = hidden;
        if (!isHiddenHeading) {
          rendered.push(
            <div key={block.id} className={`markdown-heading markdown-heading-level-${block.level}`}>
              <button
                type="button"
                className={`markdown-heading-toggle${isCollapsed ? "" : " markdown-heading-toggle-open"}`}
                aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                onClick={() => toggleMarkdownHeading(block.id)}
              >
                &gt;
              </button>
              <div
                className="markdown-heading-label"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            </div>
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
          <ul key={`list-${rendered.length}`} className="markdown-list">
            {block.items.map((item, index) => (
              <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>
        );
        continue;
      }

      if (block.kind === "code") {
        rendered.push(
          <pre key={`code-${rendered.length}`} className="markdown-code-block">
            <code
              className={block.language ? `language-${block.language}` : ""}
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          </pre>
        );
      }
    }

    return rendered;
  }

  return (
    <div
      ref={previewShellRef}
      className="preview-shell"
      style={{
        "--preview-font-scale": previewFontScale,
        "--markdown-heading-color-1": markdownHeadingColors?.[0] || "#8fd3ff",
        "--markdown-heading-color-2": markdownHeadingColors?.[1] || "#7bdc6a",
        "--markdown-heading-color-3": markdownHeadingColors?.[2] || "#f5c542",
        "--markdown-heading-color-4": markdownHeadingColors?.[3] || "#c18cff",
        "--markdown-heading-color-5": markdownHeadingColors?.[4] || "#e88787",
        "--markdown-heading-color-6": markdownHeadingColors?.[5] || "#9dd6c4"
      }}
    >
      <div className="preview-toolbar">
        <div className="preview-toolbar-main">
          <div className="preview-toolbar-row">
            <strong className="preview-file-name">{fileTitle}</strong>
            <div className="preview-actions">
              {canEdit ? (
                <>
                  <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>
                    Preview
                  </button>
                  <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>
                    Edit
                  </button>
                  <button
                    className="save-button"
                    onClick={async () => {
                      await saveFile(fileData.path, editValue);
                      onSaved();
                    }}
                  >
                    Save
                  </button>
                </>
              ) : null}
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

      {isPdf ? (
        <div ref={pdfWrapRef} className="pdf-preview-wrap">
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
        <div className="image-preview-wrap">
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
        <div className="table-wrap">
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

      {!isPdf && !isImage && !isCsv && mode === "preview" ? (
        isMarkdown ? (
          <div className="code-preview markdown-preview">{renderMarkdownBlocks()}</div>
        ) : (
          <pre className="code-preview">
            <code dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          </pre>
        )
      ) : null}

      {!isPdf && !isImage && !isCsv && mode === "edit" ? (
        isMarkdown ? (
          <div
            ref={markdownSplitRef}
            className="markdown-edit-split"
            style={{
              gridTemplateColumns: `${Math.round(markdownSplitRatio * 1000) / 10}% 4px minmax(0, 1fr)`
            }}
          >
            <div className="markdown-edit-split-pane markdown-edit-split-pane-editor">
              <div className="editor-shell">
                <div className="editor-line-numbers" ref={editorGutterRef} aria-hidden="true">
                  {editorLineNumbers.map((lineNumber) => (
                    <div key={lineNumber} className="editor-line-number">
                      {lineNumber}
                    </div>
                  ))}
                </div>
                <textarea
                  className="editor-area"
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onScroll={handleEditorScroll}
                  spellCheck={false}
                />
              </div>
            </div>
            <button
              type="button"
              className="markdown-edit-split-divider"
              aria-label="Resize markdown editor preview split"
              onPointerDown={handleMarkdownSplitPointerDown}
            />
            <div className="markdown-edit-split-pane markdown-edit-split-pane-preview">
              <div className="code-preview markdown-preview">{renderMarkdownBlocks()}</div>
            </div>
          </div>
        ) : (
          <div className="editor-shell">
            <div className="editor-line-numbers" ref={editorGutterRef} aria-hidden="true">
              {editorLineNumbers.map((lineNumber) => (
                <div key={lineNumber} className="editor-line-number">
                  {lineNumber}
                </div>
              ))}
            </div>
            <textarea
              className="editor-area"
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              onScroll={handleEditorScroll}
              spellCheck={false}
            />
          </div>
        )
      ) : null}
    </div>
  );
}
