export default function CodeBlockRenderer({ block, onCopy }) {
  return (
    <div className="markdown-code-shell">
      <button
        type="button"
        className="markdown-code-copy-button"
        aria-label="Copy code block"
        title="Copy code block"
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await onCopy?.(block);
        }}
      >
        ⧉
      </button>
      <pre className="markdown-code-block">
        <code
          className={block.language ? `language-${block.language}` : ""}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      </pre>
    </div>
  );
}
