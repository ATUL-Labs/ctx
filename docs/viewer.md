# Viewer

```bash
node <lex-repo>/bin/lex.js serve        # http://127.0.0.1:4747 (or next free port)
node <lex-repo>/bin/lex.js serve 3000   # specific port
```

A live mission-control dashboard for your project:

- **Now panel** - live status, agent activity banner, current task list from `wip.md`
- **Codebase panel** - file/symbol/link stats, full-text search, MCP suggestions
- **Graph panel** - API-to-frontend link graph, filterable by URL, color-coded by HTTP method
- **Schema panel** - tables, columns, FK relationships from real migrations. Fullscreen pannable/zoomable ERD canvas
- **Memory panel** - knowledge pages with markdown rendering, session summaries, activity timeline

**Dark/light theme** - moon/sun toggle in the header. Persists in `localStorage`.

**Collapsible panels** - each panel has a collapse button. The **View** dropdown in
the header hides/shows any panel. Layout reflows automatically. State persists in
`localStorage`.

Read-only and localhost-bound - never modifies your project.

## Console error capture

The viewer automatically intercepts `console.error`, `console.warn`, uncaught errors,
and unhandled promise rejections from any page it serves. For your own dev pages,
inject the capture script:

```html
<script src="http://127.0.0.1:4747/api/error-capture.js"></script>
```

Then `lex errors` or the gateway `errors` command will show all JS errors from any
page that loaded the script - the agent gets a complete picture of frontend runtime
issues without you copy-pasting from devtools.
