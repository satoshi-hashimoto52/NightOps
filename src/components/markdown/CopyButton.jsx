import { useEffect, useRef, useState } from "react";

const COPIED_RESET_MS = 1100;

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="10" height="10" rx="2" ry="2" />
      <path d="M7 15H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m20 7-9 9-4.5-4.5" />
    </svg>
  );
}

export default function CopyButton({
  className = "",
  onCopy,
  copyLabel = "Copy section",
  copiedLabel = "Section copied",
  title = "Copy section"
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const copiedOk = await onCopy?.();
    if (!copiedOk) {
      return;
    }

    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, COPIED_RESET_MS);
  }

  return (
    <button
      type="button"
      className={`markdown-copy-button ${className} ${copied ? "markdown-copy-button-copied" : ""}`.trim()}
      aria-label={copied ? copiedLabel : copyLabel}
      title={copied ? copiedLabel : title}
      onClick={handleClick}
    >
      <span className="markdown-copy-button-icon" aria-hidden="true">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </span>
    </button>
  );
}
