# ContextCapsule — Future Work & Expansion Roadmap

> A living document for contributors outlining developer improvements, feature ideas, and the long-term vision of evolving ContextCapsule from a Chrome extension into a **device-wide context management platform**.

---

## Table of Contents

1. [Immediate Technical Debt](#1-immediate-technical-debt)
2. [Developer Experience Improvements](#2-developer-experience-improvements)
3. [Feature Enhancements (Extension)](#3-feature-enhancements-extension)
4. [UX / UI Polish](#4-ux--ui-polish)
5. [Performance & Reliability](#5-performance--reliability)
6. [Testing Infrastructure](#6-testing-infrastructure)
7. [Device-Wide Expansion Plan](#7-device-wide-expansion-plan)

---

## 1. Immediate Technical Debt

These are low-risk, high-value cleanup items that should be tackled first.

### 1.1 Rename Legacy CSS Classes
All injected UI elements in `content.js` still use `tilantra-*` class names (e.g., `tilantra-capsule-button-container`, `tilantra-capsule-menu`, `tilantra-dc-checkbox`). These are internal CSS selectors injected into host pages and don't affect functionality, but should be renamed to `cc-*` or `capsule-*` for consistency and to avoid confusion for new contributors.

**Files affected:** `content.js` (~45 occurrences across class definitions and selectors)

### 1.2 Remove Dead CSS
`popup.css` still contains ~200 lines of unused styles from the old team/auth system:
- `.team-item`, `.team-color-tag`, `.team-member-item`, `.add-member-form`
- `.team-details-panel`, `.team-mini-dropdown`, `.team-selector-container`
- `.admin-badge`, `.color-swatch-grid`, `.color-input-group`
- `.btn-google`, `.register-link`, `.login-mode`

These should be pruned to reduce file size and improve maintainability.

### 1.3 Unused Variables in `showCustomModal()`
The `headerTitle` and `primaryBtnText` constants are now hardcoded — they can be removed entirely and inlined into the template literal for simplicity.

### 1.4 `update_url` in `manifest.json`
Line 2 still contains `"update_url": "https://clients2.google.com/service/update2/crx"`, which is a Chrome Web Store auto-update endpoint. For a self-distributed open-source extension, this should be removed.

---

## 2. Developer Experience Improvements

### 2.1 TypeScript Migration
The codebase is ~5,000+ lines of vanilla JavaScript across 10+ files. A gradual TypeScript migration would provide:
- Type safety for the complex message-passing system between `popup.js` ↔ `background.js` ↔ `content.js`
- Better IDE autocompletion for the `db.js` IndexedDB API
- Compile-time catching of broken message type strings

**Suggested approach:** Start by adding JSDoc type annotations (`@typedef`, `@param`) before doing a full `.ts` conversion. This gives 80% of the benefit with 0% build tooling overhead.

### 2.2 Build Pipeline
Currently, the extension has no build step — raw JS files are loaded directly. A minimal build system would enable:
- **Bundling** — Combine `content.js` + `content-utils.js` (currently 4,800+ lines total) into a single minified file
- **Environment variables** — Default API endpoints, feature flags
- **CSS preprocessing** — PostCSS/Sass for the popup styles
- **Source maps** — For debugging in production

**Recommended tool:** [Vite](https://vitejs.dev/) with the [CRXJS plugin](https://crxjs.dev/vite-plugin/) — purpose-built for Chrome extension development with hot reload.

### 2.3 Constants Extraction
Hardcoded values like token limits (`30000` char cap in `background.js`), timing constants (`SEND_WAIT = 3000`, `CLEANUP_WAIT = 4000`), and model defaults (`llama3-70b-8192`, `llama3`) should be extracted into a shared `constants.js` module.

### 2.4 Error Handling Standardization
Error handling is inconsistent across the codebase:
- Some places use `alert()`, others use `showCustomModal()`, others use `console.error()` silently
- Background worker errors aren't surfaced to the user in many cases

**Suggestion:** Create a unified `notify(message, level)` utility that routes errors to the appropriate UI surface depending on context (content script → toast, popup → inline alert, background → badge icon).

---

## 3. Feature Enhancements (Extension)

### 3.1 Multi-Provider Support
Currently supports **Groq** and **Ollama**. High-demand additions:
| Provider | Effort | Notes |
|----------|--------|-------|
| **OpenAI API** | Low | Same OpenAI-compatible format as Groq |
| **Anthropic API** | Low | Different payload shape, straightforward |
| **Google Gemini API** | Medium | Requires Google AI Studio key |
| **OpenRouter** | Low | Unified API for 100+ models |
| **LM Studio** | Low | OpenAI-compatible local server |

**Implementation:** Abstract the `summarizeText()` function into a provider interface pattern. Each provider becomes a module with `summarize(text, config) → Promise<string>`.

### 3.2 Capsule Categories & Tags
- Allow users to organize capsules into **folders** or **categories** (e.g., "Work", "Research", "Code")
- Support **multiple tags** per capsule (currently single tag)
- Add a **color-coding** system for visual organization in the library

### 3.3 Export / Import / Backup
- **Export:** Download all capsules as a single JSON file (including attachments as base64 or as separate files in a zip)
- **Import:** Upload a JSON backup to restore capsules
- **Auto-backup:** Periodic backup to a user-specified local directory using the `File System Access API` or download-based approach

### 3.4 Capsule Sharing (Privacy-Respecting)
- Generate a **shareable JSON snippet** that another ContextCapsule user can import
- No cloud involved — sharing happens via file transfer, email attachment, or copy-paste
- Optional: QR code generation for quick mobile-to-desktop capsule transfer

### 3.5 Summarization Customization
- Allow users to provide a **custom system prompt** for summarization (e.g., "Focus on code snippets and technical decisions")
- Adjustable **summary length** (brief / standard / detailed)
- Option to **skip summarization entirely** and store raw conversation text

### 3.6 Smart Capsule Merging
- When two capsules cover related topics, allow users to **merge** them into a composite capsule
- The merged capsule could re-summarize the combined content for a unified context block

### 3.7 Conversation History Tracking
- Track which capsules have been dropped into which conversations
- Show a **usage history** per capsule: "Used 3 times: ChatGPT (2x), Claude (1x)"
- Help users understand which contexts they rely on most

### 3.8 Platform Coverage Expansion
- **Grok (x.ai)** — Twitter/X's AI chat
- **Copilot (Microsoft)** — Bing Chat / Copilot
- **HuggingChat** — Open-source chat interface
- **Poe** — Multi-model chat aggregator
- **Slack / Discord Bots** — Context injection into team chat AI bots

---

## 4. UX / UI Polish

### 4.1 First-Run Onboarding
New users currently see a blank extension with no guidance. Add:
- A **setup wizard** that walks through: Choose Provider → Enter API Key → Generate First Capsule
- The existing tutorial overlay system is already in the HTML — wire it up to trigger on first install

### 4.2 Settings Validation & Feedback
- **API key validation:** Make a test API call when the user saves settings and show a ✅ or ❌
- **Ollama connection test:** Ping the `/api/tags` endpoint to verify Ollama is running and show available models
- **Model autocomplete:** For Groq, fetch available models from the API and present a dropdown

### 4.3 Capsule Preview Panel
- Clicking a capsule in the library should expand an **inline preview** showing the full summary, timestamps, source platform, and attachment count
- Currently the summary is truncated to 2 lines with no way to see the full text inside the popup

### 4.4 Dark/Light Theme Toggle
The extension is dark-mode only. Some users work in light environments. Adding a theme toggle using the existing CSS variable system (`--bg`, `--card`, `--text`, etc.) would be straightforward.

### 4.5 Keyboard Shortcuts
- `Ctrl+Shift+G` — Generate capsule from current conversation
- `Ctrl+Shift+D` — Open capsule library (Drop mode)
- These can be registered via `manifest.json` `commands` API

---

## 5. Performance & Reliability

### 5.1 Lazy Model Loading
The Transformers.js semantic model (`all-MiniLM-L6-v2`) is loaded eagerly on service worker boot. This adds ~2-3s startup time and ~50MB memory. Consider:
- **Lazy loading:** Only initialize the model when Dynamic Context is actually enabled
- **Model caching:** Use the browser's Cache API to persist the ONNX model files across sessions (partially done via `env.useBrowserCache = true`)

### 5.2 IndexedDB Pagination
`getAllCapsules()` currently loads every capsule into memory at once. For power users with 100+ capsules, this will cause jank. Implement cursor-based pagination in the library view.

### 5.3 Content Script Size
`content-utils.js` is 115KB — most of it is platform-specific message extraction. Consider:
- **Lazy loading per platform:** Only load the ChatGPT extractor on `chatgpt.com`, the Gemini extractor on `gemini.google.com`, etc.
- **Dynamic import:** Use `import()` within the content script (requires MV3 module support)

### 5.4 Summarization Token Management
The 30,000 character cap is arbitrary. Better approaches:
- Use a proper tokenizer (tiktoken or approximation) to calculate actual token count
- Implement **sliding window summarization:** For very long conversations, summarize in chunks and then summarize the summaries
- Show estimated token count to the user before generation

---

## 6. Testing Infrastructure

### 6.1 Unit Tests
- Test `db.js` CRUD operations using a mocked IndexedDB (e.g., `fake-indexeddb` npm package)
- Test `summarizeText()` provider routing logic
- Test `extractConvoId()` URL parsing for all supported platforms

### 6.2 Integration Tests
- Use Puppeteer or Playwright to load the extension and verify:
  - Settings save/load cycle
  - Capsule generation flow (with mocked API responses)
  - Drag-and-drop injection into a test page

### 6.3 Platform Regression Tests
Each AI platform frequently changes their DOM structure, breaking selectors. Maintain a test suite that:
- Loads each platform's chat page
- Verifies the capsule button injects correctly
- Verifies message extraction returns valid data

---

## 7. Device-Wide Expansion Plan

> **Vision:** Transform ContextCapsule from a browser-only tool into a **universal context management layer** that works across browsers, desktop apps, terminals, IDEs, and mobile devices.

### Phase 1: Cross-Browser Extension (Months 1-2)

**Goal:** ContextCapsule works in all major browsers sharing the same data.

| Browser | Approach |
|---------|----------|
| **Firefox** | Port using WebExtension APIs (90% compatible with MV3) |
| **Edge** | Direct compatibility — same Chromium base, minimal changes |
| **Safari** | Use Safari Web Extension converter tool + adapt APIs |
| **Arc / Brave / Vivaldi** | Chromium-based — works out-of-the-box as unpacked extension |

**Key Challenge:** IndexedDB is per-browser. To share capsules across browsers, you need Phase 2.

---

### Phase 2: Local Context Server (Months 2-4)

**Goal:** A lightweight local daemon that acts as the centralized capsule store, accessible by any browser or app on the device.

```
┌─────────────────────────────────────────────────────────┐
│                    User's Device                        │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Chrome   │  │  Firefox  │  │   Edge   │   Browser   │
│  │Extension  │  │Extension  │  │Extension │   Layer     │
│  └─────┬─────┘  └─────┬─────┘  └─────┬────┘             │
│        │              │              │                   │
│        └──────────────┼──────────────┘                   │
│                       │                                  │
│                       ▼                                  │
│        ┌──────────────────────────┐                      │
│        │  ContextCapsule Server   │  ← REST/WebSocket    │
│        │  (localhost:7742)        │     API               │
│        │                         │                       │
│        │  • SQLite Database      │                       │
│        │  • Summarization Engine │                       │
│        │  • Semantic Index       │                       │
│        │  • File Attachment Store│                       │
│        └──────────────────────────┘                      │
│                       │                                  │
│              ┌────────┼────────┐                         │
│              ▼        ▼        ▼                         │
│          ┌──────┐ ┌──────┐ ┌──────┐                     │
│          │Ollama│ │ Groq │ │OpenAI│  LLM Providers      │
│          └──────┘ └──────┘ └──────┘                     │
└─────────────────────────────────────────────────────────┘
```

#### Architecture Details

**Technology:** A single-binary local server built with one of:
- **Rust + Tauri** — Best for a lightweight desktop app with system tray icon (recommended)
- **Go** — Excellent for a headless daemon with tiny binary size
- **Electron** — Easiest path if you want a full management UI, but heavier

**Storage:** Replace IndexedDB with **SQLite** (via `better-sqlite3`, `rusqlite`, or `go-sqlite3`):
- Capsules table, Attachments table, Tags table
- Full-text search via SQLite FTS5 extension
- File-based — trivially backupable, portable across OS

**API Design (REST):**
```
GET    /api/capsules                 — List all capsules
POST   /api/capsules                 — Create new capsule
GET    /api/capsules/:id             — Get capsule details
PUT    /api/capsules/:id             — Update capsule
DELETE /api/capsules/:id             — Delete capsule
POST   /api/capsules/:id/summarize   — Re-summarize a capsule
GET    /api/capsules/search?q=...    — Full-text search
POST   /api/capsules/semantic-search — Vector similarity search
GET    /api/attachments/:id          — Get attachment content
GET    /api/settings                 — Get current settings
PUT    /api/settings                 — Update settings
GET    /api/health                   — Server health check
```

**Browser Extension Change:** The extensions become thin clients — they replace IndexedDB calls with `fetch("http://localhost:7742/api/...")` calls. The core injection/extraction logic stays in the content scripts.

---

### Phase 3: MCP Server Integration (Months 3-5)

**Goal:** Expose capsules as a **Model Context Protocol (MCP)** server, making them accessible to any MCP-compatible AI tool.

[MCP](https://modelcontextprotocol.io/) is an emerging open standard that allows AI applications (Claude Desktop, Cursor, Windsurf, etc.) to access external context sources.

```
┌────────────────────────┐
│  Claude Desktop App    │ ←──── MCP Protocol ────→ ┌─────────────────────┐
│  Cursor IDE            │                           │ ContextCapsule      │
│  Windsurf IDE          │                           │ MCP Server          │
│  VS Code + Copilot     │                           │                     │
│  Any MCP Client        │                           │ Tools:              │
└────────────────────────┘                           │  • list_capsules    │
                                                     │  • get_capsule      │
                                                     │  • search_capsules  │
                                                     │  • create_capsule   │
                                                     │  • inject_context   │
                                                     └─────────────────────┘
```

**Impact:** This single integration would make ContextCapsule available to ~20+ AI tools simultaneously without building custom integrations for each.

**Implementation:** Add MCP transport (stdio or SSE) to the Phase 2 local server. The MCP server exposes capsules as **resources** and summarization as a **tool**.

---

### Phase 4: System-Wide Context Capture (Months 5-7)

**Goal:** Capture context from **any** application, not just browser-based AI chats.

#### 4.1 Clipboard Monitor
- Watch the system clipboard for text content
- When the user copies a substantial text block (>100 words), offer to capture it as a capsule via a system notification
- Configurable: always capture, ask first, or only when a hotkey is held

#### 4.2 Global Hotkey Injection
- Register a system-wide hotkey (e.g., `Ctrl+Shift+C`) that opens a context search palette
- User types to fuzzy-search capsules → selects one → content is pasted into the active application's text field
- Works in any app: terminals, IDEs, email clients, word processors

#### 4.3 File Watcher
- Monitor a designated folder (e.g., `~/CapsuleDropbox/`) for new files
- When a `.txt`, `.md`, or `.pdf` is dropped in, automatically generate a capsule from its content
- Enables workflows like: export chat from ChatGPT mobile → save to folder → capsule auto-created on desktop

#### 4.4 Screenshot-to-Context
- Hotkey-triggered screenshot → OCR (via Tesseract.js or system OCR) → capsule creation
- Useful for capturing context from non-text-selectable sources: images, videos, whiteboard photos

---

### Phase 5: Mobile Companion (Months 7-10)

**Goal:** Access and manage capsules from mobile devices.

#### Option A: Progressive Web App (PWA)
- The Phase 2 local server serves a web UI at `http://localhost:7742`
- When on the same network, mobile devices can access it via the local IP
- Works on both iOS and Android with zero app store friction
- Limited to WiFi/LAN access

#### Option B: Native Mobile App
- **React Native** or **Flutter** app
- Syncs with the desktop local server via a simple file-based sync (e.g., Syncthing, iCloud Drive, Google Drive)
- The SQLite database file from Phase 2 is the sync unit
- Share capsules by exporting JSON + QR code

#### Mobile-Specific Features:
- **Share Sheet Integration:** "Share to ContextCapsule" from any mobile app
- **Quick Capture Widget:** Home screen widget with a text field for instant capsule creation
- **Voice-to-Capsule:** Dictate context via speech-to-text → auto-summarize → capsule

---

### Phase 6: Intelligence Layer (Months 10+)

**Goal:** ContextCapsule becomes proactively intelligent.

#### 6.1 Auto-Capsule Suggestions
- Monitor browsing/app activity (with explicit user opt-in)
- When the user has a long conversation, proactively suggest: *"This looks important — want to save it as a capsule?"*

#### 6.2 Context Graph
- Build a **knowledge graph** linking related capsules
- "This capsule about React state management is related to your capsule about Redux middleware"
- Visualize connections in an interactive node graph

#### 6.3 Temporal Context
- Capsules gain a **timeline view** — see how your context on a topic evolved over days/weeks
- "Show me everything I discussed about the database migration, chronologically"

#### 6.4 Multi-Modal Intelligence
- Audio capsules: Capture and summarize voice conversations (meeting recordings)
- Video capsules: Extract key frames and transcripts from recorded sessions
- Code capsules: Automatically capture git diffs and PR context as capsules

---

## Implementation Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | Rename `tilantra-*` CSS classes | Low | Contributor clarity |
| 🔴 P0 | Remove dead CSS from `popup.css` | Low | Code hygiene |
| 🔴 P0 | Remove `update_url` from manifest | Trivial | Open-source readiness |
| 🟠 P1 | First-run onboarding wizard | Medium | User retention |
| 🟠 P1 | API key validation on save | Low | User confidence |
| 🟠 P1 | Export/Import capsules | Medium | Data portability |
| 🟠 P1 | Multi-provider support (OpenAI, Anthropic) | Medium | User reach |
| 🟡 P2 | Build pipeline (Vite + CRXJS) | Medium | Developer velocity |
| 🟡 P2 | Capsule categories & multi-tag | Medium | Organization |
| 🟡 P2 | Cross-browser support (Firefox, Edge) | Medium | Market reach |
| 🟢 P3 | Local Context Server (Phase 2) | High | Platform play |
| 🟢 P3 | MCP Server (Phase 3) | Medium | Ecosystem integration |
| 🔵 P4 | System-wide capture (Phase 4) | High | Vision realization |
| 🔵 P4 | Mobile companion (Phase 5) | High | Full-device coverage |

---

## Contributing

If you're interested in working on any of these items:
1. Open an issue on the repository referencing the specific section
2. Discuss the approach before starting implementation
3. Keep PRs focused — one feature or fix per PR
4. Follow the existing code style (vanilla JS, no frameworks in content scripts)

---

*Last updated: May 2026*
