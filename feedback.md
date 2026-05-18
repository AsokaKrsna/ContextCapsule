## ContextCapsule Review

Review basis: static code inspection of the repository contents in this folder. I did not run the extension end-to-end in Chrome, so this focuses on implementation correctness, likely runtime behavior, maintainability, and functional completeness.

## Main Findings

### 1. Gmail integration is currently not wired into the extension
Severity: High

The repo advertises Gmail capture support, and there is a dedicated `gmail-inserter.js` implementation, but Gmail is not actually registered in `manifest.json`.

Evidence:
- `README.md:8-9` documents Gmail integration.
- `gmail-inserter.js:1-90` contains Gmail button injection logic.
- `manifest.json:17-33` does not include `https://mail.google.com/*` in `host_permissions`.
- `manifest.json:109-125` does not inject any content script on Gmail.
- `manifest.json:34-92` does not expose `capsule.png` or Gmail-specific assets to Gmail pages.

Impact:
- The Gmail feature will not load on `mail.google.com`, so the user-facing functionality described in the README is effectively unavailable.

Recommendation:
- Add Gmail match patterns to `host_permissions` and `content_scripts`.
- Decide whether Gmail should use `content.js`, `gmail-inserter.js`, or both.
- Add any required Gmail-side assets to `web_accessible_resources`.

### 2. Dynamic context injection is globally tied to `lastCapsuleId`, not to the active conversation
Severity: High

The auto-injection pipeline appears to use whichever capsule was most recently viewed or generated, even if that capsule is unrelated to the current chat.

Evidence:
- `content.js:2020-2037` sends `conversationId`, `history`, and `platform` to the background fast-filter.
- `background.js:1140-1174` ignores `conversationId`, `history`, and `platform`, and only loads `lastCapsuleId` from storage.
- `background.js:49-57` also lazily reloads semantic context from `lastCapsuleId`.
- `background.js:1022-1042` updates `lastCapsuleId` every time a capsule is fetched, not only when it is intentionally activated for a conversation.

Impact:
- Opening or previewing a capsule can silently change the capsule used for future automatic injections.
- Users can get irrelevant context inserted into the wrong chat, which is a functional correctness issue for a tool whose main purpose is context transfer.

Recommendation:
- Bind active context to a conversation-specific mapping rather than a single global `lastCapsuleId`.
- Treat viewing a capsule and activating a capsule as separate actions.
- Either use the provided `conversationId/history/platform` in relevance decisions, or remove them if they are intentionally unused.

### 3. There is no automated validation or reproducible development setup in the repo
Severity: Medium

This repository appears to have no package manifest, dependency lockfile, test suite, or linting/formatting scripts.

Evidence:
- No `package.json` is present in the project root.
- No test files or test runner config were found in the repository contents.

Impact:
- Functional regressions across multiple supported platforms will be hard to catch.
- Updating large DOM scrapers and injection flows becomes risky because there is no verification harness.
- Reproducibility is weaker, especially with a vendored `lib/transformers.js` bundle and several platform-specific integration files.

Recommendation:
- Add a minimal dev manifest such as `package.json`.
- Add at least smoke-level checks for message extraction and background capsule generation utilities.
- Add a lightweight lint step so selector-heavy scripts fail faster on obvious mistakes.

## Additional Observations

### Strengths
- The extension has a reasonably clear separation between popup UI, content scripts, background logic, and IndexedDB persistence.
- The capsule format is more structured than a simple summary string. The semantic state plus artifacts/critical exact fields is a strong direction for cross-chat handoff quality.
- Attachment handling is implemented consistently enough that the architecture can support richer workflows beyond plain text.

### Technical Risks To Watch
- The code relies heavily on brittle DOM selectors across third-party sites. That is normal for this type of extension, but it means breakage risk is permanently high unless selectors are centralized and regression-tested.
- The repo includes very large vendor files like `lib/transformers.js` and `jspdf.min.js` directly in source. That is fine for distribution, but it makes auditing and upgrades harder without version metadata.
- Several flows use `alert()` for error handling in production paths, which will feel rough in a browser extension and makes error recovery harder.

## Suggested Priority Order

1. Fix the Gmail manifest wiring so documented functionality actually loads.
2. Redesign active capsule tracking so auto-injection is conversation-scoped instead of globally scoped.
3. Add minimal tooling: project manifest, linting, and a small verification layer for core logic.

## Overall Assessment

The project has a solid product idea and some thoughtful internal structure, especially around capsule representation and attachment support. The biggest current issues are functional wiring gaps and state-management correctness, not lack of ambition. If the Gmail integration and active-context scoping are fixed first, the extension will be much more reliable in real use.
