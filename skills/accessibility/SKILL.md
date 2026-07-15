---
name: accessibility
description: Ensure UI is accessible to all users. Use when building UI components, designing interactions, or auditing accessibility. WCAG 2.1 AA compliance minimum.
argument-hint: "[component or page]"
---

# Accessibility

Build for everyone. Accessibility is not a feature, it's a baseline.

<HARD-GATE>
No UI component ships without: keyboard navigation, screen reader labels, sufficient contrast, and focus management.
</HARD-GATE>

## WCAG 2.1 AA Checklist

### Perceivable
- Images have `alt` text (empty `alt=""` for decorative)
- Color contrast: 4.5:1 for normal text, 3:1 for large text
- Don't rely on color alone to convey meaning (add icons or text)
- Form inputs have associated `<label>` elements
- Tables use `<th>` with `scope` attributes

### Operable
- All actions reachable by keyboard (Tab, Enter, Space, Escape)
- Focus order follows visual order (DOM order = tab order)
- Focus is visible (never `outline: none` without a replacement)
- No keyboard traps (user can always Tab/Escape out)
- Skip-to-content link as the first focusable element
- Autoplay disabled. User controls media

### Understandable
- Language set: `<html lang="en">`
- Form errors are descriptive and associated with the input
- Instructions are clear and present before the input
- Error recovery is possible (don't trap users in an error state)

### Robust
- Valid HTML (run through validator)
- ARIA only when HTML semantics are insufficient
- Custom widgets follow ARIA patterns (roles, states, properties)

## Common Patterns

| Pattern | Implementation |
|---------|---------------|
| Modal dialog | `role="dialog"`, `aria-modal="true"`, focus trap, Escape to close |
| Dropdown | `role="listbox"`, arrow keys, `aria-expanded` |
| Tab interface | `role="tablist"`, `role="tab"`, `aria-selected`, arrow keys |
| Toast/notification | `role="status"` or `role="alert"`, auto-dismiss with pause |
| Loading state | `aria-busy="true"`, live region for completion |
| Form error | `aria-invalid="true"`, `aria-describedby` pointing to error text |

## Testing

1. **Keyboard test** - unplug mouse. Can you use everything?
2. **Screen reader test** - NVDA (Windows), VoiceOver (Mac), or Talkback (Android)
3. **Contrast test** - browser DevTools or WebAIM contrast checker
4. **Automated test** - axe-core, Lighthouse accessibility audit
5. **Zoom test** - 200% zoom, does layout still work?

## Rules

- Check `.lex/pages/design.md` for project-specific a11y decisions
- Semantic HTML first. ARIA only when HTML can't express it
- Never remove focus outlines without providing an alternative
- Test with a keyboard on every PR that touches UI
- `aria-label` when visible text isn't enough. `aria-labelledby` when text exists
- Don't use `display: none` for content screen readers should announce. Use `sr-only` class
