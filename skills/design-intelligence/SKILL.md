---
name: design-intelligence
description: Design intelligence for UI and frontend work. Never boring, never template-looking. Use when building any visual component, page, or layout. Forces intentional, distinctive design.
---

# Design Intelligence

Every UI you build should look like a human designer made deliberate choices. Not like an AI generated a template.

## The Test

Before shipping any UI, ask: "Could I tell this was AI-generated?" If yes, redo it.

Signs of AI-generated UI:
- Perfectly symmetrical grids with identical cards
- Generic gradient backgrounds
- "Hero section + features grid + testimonials + CTA" formula
- Rounded corners on everything at the same radius
- Generic stock-photo-style placeholder content
- Every section looks like it came from a different template

## What Makes Design Intentional

- **Hierarchy**: One thing is clearly most important on every screen. Not everything is equal
- **Restraint**: Pick 2-3 colors. Pick 1-2 fonts. Pick a consistent radius. Stick with them
- **Density**: Information-dense where it matters (dashboards, tables). Breathing room where it matters (landing pages, forms)
- **Consistency**: Same component looks the same everywhere. Same spacing. Same shadow. Same hover state
- **Typography**: Font sizes have a clear scale. Weights are used for hierarchy, not decoration

## Before Building UI

1. Check `.ctx/pages/design.md` - what design rules exist for this project?
2. Check `.ctx/pages/patterns.md` - what UI components/patterns are already established?
3. Reference existing layouts - new pages should feel like part of the same app

## Rules

- Use the project's existing design system (CSS variables, component library, color tokens)
- Match existing page patterns for consistency
- No gratuitous animations. Motion should communicate state change, not decorate
- Tables for tabular data. Cards for entity summaries. Lists for sequential items. Pick the right container
- Dark mode: if the project has it, support it. If not, do not add it
- Mobile: if the project is responsive, maintain it. Match existing breakpoint patterns
- Never add a UI library the project doesn't already use without asking
