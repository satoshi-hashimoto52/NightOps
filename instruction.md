# Copy Button Icon Modernization Instructions

## Goal

Replace emoji-based copy UI icons with compact IDE-style icon components.

Current state:

* CopyButton component already unified
* copy interactions centralized
* 📋 / ✓ currently used
* copied state behavior already shared

Next goal:
improve visual consistency and cross-platform rendering quality.

---

# IMPORTANT

Do NOT redesign the copy interaction system.

Maintain:

* existing CopyButton behavior
* copied-state timing
* accessibility behavior
* keyboard support
* outline integration
* heading integration

Only modernize the icon rendering.

---

# Requirements

## 1. Replace Emoji Icons

Replace:

| Current | Replace With |
| ------- | ------------ |
| 📋      | copy icon    |
| ✓       | check icon   |

Recommended library:

```text id="djlwm1"
lucide-react
```

Recommended icons:

* Copy
* Check

Alternative lightweight icon systems are acceptable if visually compact.

---

# 2. Maintain Compact IDE Appearance

Requirements:

* compact sizing
* low visual noise
* thin stroke appearance
* aligned baseline rendering

Recommended size:

```text id="qjlwm2"
14px - 16px
```

Recommended style:

```css id="zjlwm3"
opacity: 0.45;
```

Increase visibility on:

* hover
* focus
* active

Avoid oversized icons.

---

# 3. Preserve Existing UX

Maintain:

* copied-state transition
* copied timeout behavior
* keyboard accessibility
* aria-label behavior
* touch compatibility

Do NOT change interaction flow.

---

# 4. Accessibility

CopyButton must remain:

* focusable
* keyboard operable
* screen-reader compatible

Preserve:

```jsx id="mjlwm4"
aria-label
```

behavior.

---

# 5. Avoid Heavy Animation

Do NOT add:

* bounce effects
* scale animations
* toast notifications
* large transitions

Recommended:

* subtle opacity transition
* lightweight color shift
* minimal motion

This is an IDE-oriented interface.

---

# 6. Shared Component Integrity

All copy UI locations must continue using:

```text id="vjlwm5"
CopyButton.jsx
```

Avoid reintroducing duplicated copy icon logic.

---

# 7. Touch Device Compatibility

Icons must remain visible and usable on:

* touch devices
* narrow layouts
* split preview mode

Avoid hover-only visibility.

---

# 8. Styling Requirements

Maintain NightOps visual language:

* dense
* technical
* compact
* IDE-oriented

Avoid:

* glossy buttons
* floating action UI
* oversized hit areas
* decorative effects

---

# 9. Future-Proofing

Prepare CopyButton for future extensibility:

Potential future additions:

* tooltip
* copy format selection
* keyboard shortcut hints
* long press behavior

Do NOT implement these yet.

Only keep architecture extensible.

---

# 10. Validation

Verify:

* heading copy still works
* outline copy still works
* copied state still resets
* icon alignment consistency
* touch usability
* keyboard accessibility
* no layout jitter
* build success

```bash id="pjlwm6"
npm run build
```

---

# Recommended Incremental Refactor

If markdown-related shared components are increasing:

begin organizing toward:

```text id="rjlwm7"
src/components/markdown/
```

Suggested future structure:

```text id="kjlwm8"
markdown/
 ├─ CopyButton.jsx
 ├─ renderers/
 ├─ hooks/
 └─ utils/
```

Do NOT perform a large-scale migration yet.

Only move shared logic incrementally.

---

# Output Rules

* modify changed sections only
* avoid unrelated refactors
* preserve markdown parser behavior
* preserve copy interaction behavior
* preserve outline behavior
* preserve current accessibility behavior
