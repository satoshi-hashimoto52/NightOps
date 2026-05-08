以下は、御自身のNightOps系Markdown Previewシステムへ
「1〜15の機能追加」を安全に段階実装させるための、
Codex向け実装指示です。

特に、

* 独自Markdownパーサ崩壊防止
* UI劣化防止
* 長文性能維持
* 将来的なAST移行余地維持

を重視しています。

---

# Codex指示全文

# Markdown Preview System Enhancement Instructions

## Goal

Extend the existing custom Markdown Preview system incrementally without breaking:

* current rendering behavior
* heading folding system
* live preview
* syntax highlighting
* copy buttons
* editor split layout

The application is evolving from a generic markdown viewer into an AI-oriented documentation IDE.

Preserve existing UX and architecture as much as possible.

---

# IMPORTANT RULES

## DO NOT

* replace the entire markdown renderer
* migrate immediately to react-markdown
* migrate immediately to remark/markdown-it
* remove custom folding behavior
* rewrite PreviewPane from scratch
* change existing CSS variable naming conventions
* break current markdown rendering

This project currently depends on a custom block parser.
All enhancements must be additive and incremental.

---

# PRIORITY ORDER

Implement features in the following order.

Each phase must remain stable before the next.

---

# PHASE 1 (Highest Priority)

## 1. Nested List Support

Support:

* nested unordered lists
* nested ordered lists
* mixed nesting

Examples:

```md
- A
  - B
    - C

1. One
   1. Child
```

Requirements:

* preserve indentation
* preserve folding compatibility
* preserve live preview performance

---

## 2. Callout Support (Obsidian Compatible)

Support syntax:

```md
> [!tip]
> text
```

```md
> [!warning]
> text
```

Supported types:

* note
* tip
* warning
* danger
* info

Requirements:

* dedicated styling
* colored border/background
* collapsible support optional
* preserve plain quote compatibility

Strongly prioritize Obsidian compatibility.

---

## 3. Checkbox / Task List Support

Support:

```md
- [ ] TODO
- [x] DONE
```

Requirements:

* visual checkbox rendering
* completed style
* optional interactive toggle
* no backend persistence required initially

---

## 4. Quote Block Rendering

Support standard markdown quote rendering:

```md
> quoted text
```

Requirements:

* left border
* padding
* muted text style

---

## 5. Horizontal Rule Support

Support:

```md
---
```

and

```md
***
```

Requirements:

* lightweight rendering
* section separation styling

---

# PHASE 2

## 6. Link Support

Support:

```md
[title](url)
```

Requirements:

* open external links safely
* target=_blank
* rel=noopener noreferrer

Additionally support internal wiki-style links:

```md
[[SPEC]]
```

Initial implementation may simply emit clickable spans.

---

## 7. Image Support

Support:

```md
![alt](path)
```

Requirements:

* responsive scaling
* max-width protection
* dark mode compatibility
* lazy loading preferred

Do NOT implement heavy image processing initially.

---

## 8. Mermaid Support

Support fenced mermaid blocks:

````md
```mermaid
graph TD
A --> B
```
````

Requirements:

* lazy rendering
* avoid blocking editor performance
* fallback UI if parse fails

---

## 9. Outline / TOC Pane

Add a heading outline panel.

Requirements:

* sync with heading hierarchy
* clickable navigation
* auto-scroll to heading
* preserve existing folding behavior

Avoid expensive DOM traversal.

---

# PHASE 3

## 10. Enhanced Code Blocks

Add:

* optional filename labels
* optional line numbers
* diff highlighting

Examples:

````md
```python:title=app.py
```
````

````md
```diff
+ added
- removed
```
````

Requirements:

* preserve existing copy button
* preserve highlight.js integration

---

## 11. Persistent Fold State

Persist fold state using localStorage.

Requirements:

* restore fold state per file
* avoid excessive localStorage writes
* debounce updates

---

## 12. Section Copy

Add "Copy Section" capability per heading section.

Requirements:

* copy heading + body
* preserve markdown formatting
* avoid DOM-based copy extraction when possible

---

## 13. AI-Oriented Custom Blocks

Support custom syntax blocks:

```md
:::prompt
text
```

````

```md
=== src/main.py ===
````

Requirements:

* visually distinct rendering
* optimized for AI workflow readability

---

# PHASE 4

## 14. Virtualized Rendering

For extremely large markdown documents.

Requirements:

* preserve folding behavior
* preserve scroll position
* avoid breaking syntax highlight

Do NOT implement until previous phases stabilize.

---

## 15. Parser Architecture Refactor Preparation

Current parser is regex/block based.

Prepare architecture for future AST migration.

Requirements:

* isolate parser utilities
* separate:

  * tokenize
  * parse
  * render
* reduce PreviewPane.jsx complexity
* DO NOT fully migrate yet

Goal:
future compatibility with remark/markdown-it while preserving custom IDE behaviors.

---

# PERFORMANCE REQUIREMENTS

Markdown rendering must remain responsive for:

* large AI-generated documents
* long code blocks
* multi-thousand-line specs

Avoid:

* repeated full-document regex scans
* unnecessary React rerenders
* synchronous expensive parsing

Memoize aggressively where appropriate.

---

# UI REQUIREMENTS

This project is an AI-oriented documentation IDE.

Optimize for:

* long-form technical specs
* AI prompt workflows
* multi-file outputs
* AGENTS.md workflows
* TODO management
* code review readability

Not for generic blog-style markdown rendering.

---

# STYLING REQUIREMENTS

Maintain existing visual language.

Do NOT introduce:

* excessive gradients
* heavy shadows
* oversized padding
* animated UI everywhere

Prefer:

* dense information layout
* IDE-like appearance
* readable spacing
* collapsible structures

---

# IMPLEMENTATION STRATEGY

For each feature:

1. inspect current parser behavior
2. minimally extend parser
3. preserve backward compatibility
4. validate live preview
5. validate folding behavior
6. validate performance

Avoid large-scale rewrites.

---

# OUTPUT FORMAT

For each phase:

* explain implementation strategy first
* then modify code
* show changed files only
* avoid rewriting entire files unless necessary

Always prioritize stability over feature count.

