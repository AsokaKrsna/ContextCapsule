/**********************************************************
 * Utilities (TOP-LEVEL — shared by everything)
 **********************************************************/
let currentPlatform = detectPlatform();
let isGenerating = false;
let isBypassingFilter = false;

// Injection Constants
const CONTEXT_MARKERS = [
  "Adding capsule context",
  "Adding Context of Capsule",
  "Additional Context:",
  "**ACTIVE CAPSULE CONTEXT**",
  "Adding capsule context to this conversation! Say Hi."
];
const INJECTION_SUFFIX = "\n\nAdding capsule context to this conversation! Say Hi.";
const SEND_WAIT = 3000;
const CLEANUP_WAIT = 4000;
const STOP_WAIT = 4000;

function toggleLoading(loading) {
  isGenerating = loading;
  const btn = document.getElementById('cc-chat-button');
  if (btn) {
    if (loading) btn.classList.add('loading');
    else btn.classList.remove('loading');
  }
}

function getPlatformAdapterKey(platform = currentPlatform) {
  return globalThis.ContextCapsulePlatformAdapters.getAdapterKey(platform);
}

async function collectMessagesForCurrentPlatform(options) {
  return globalThis.ContextCapsulePlatformAdapters.collectMessages(currentPlatform, options);
}

function injectPlatformBridgeScript(platform = currentPlatform) {
  globalThis.ContextCapsulePlatformAdapters.injectBridgeScript(platform);
}

/**********************************************************
 * MESSAGE HANDLERS
 **********************************************************/

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "GET_CHAT_TITLE") {
    sendResponse({ title: getChatTitle() });
    return false;
  }

  // Use an async IIFE for the remaining logic
  (async () => {
    /* ===== GENERATE SUMMARY ===== */
    if (msg.type === "GENERATE_SUMMARY") {
      const tag = msg.payload?.tag || "auto-generated";

      // Notify popup that generation started
      if (isContextValid()) {
        chrome.runtime.sendMessage({ type: "GENERATION_STARTED" });
      }

      try {
        toggleLoading(true);
        const msgs = await collectMessagesForCurrentPlatform();
        await generateCapsuleFromMessages(msgs, tag);
      } catch (err) {
        showCustomModal("Summary failed: " + (err.message || err));
      } finally {
        toggleLoading(false);
      }
    }

    /* ===== GENERATE VERSION ===== */
    if (msg.type === "GENERATE_VERSION") {
      const capsuleId = msg.payload?.capsuleId;

      if (isContextValid()) {
        chrome.runtime.sendMessage({ type: "GENERATION_STARTED" });
      }

      let msgs = [];
      try {
        toggleLoading(true);
        msgs = await collectMessagesForCurrentPlatform();

        const filteredMsgs = getPostDropMessages(msgs);
        await generateVersionFromMessages(filteredMsgs, capsuleId);
      } catch (err) {
          showCustomModal("Version generation failed: " + (err.message || err));
        chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: false });
      } finally {
        toggleLoading(false);
      }
    }

    /* ===== ACTIVATE INJECTOR ===== */
    if (msg.type === "ACTIVATE_INJECTOR") {
      const capsuleIdFromMessage = msg.capsuleId;
      if (capsuleIdFromMessage) {
        showDroppingAnimation();
        fetchAndInjectCapsule(capsuleIdFromMessage).then(() => {
          sendResponse({ success: true });
        }).catch(err => {
          sendResponse({ success: false, error: err.toString() });
        });
      } else {
        if (isContextValid()) {
          chrome.storage.local.get("lastCapsuleId", data => {
            const capsuleId = data.lastCapsuleId;
            if (!capsuleId) {
              showCustomModal("No capsule ID found. Please generate a capsule first.");
              sendResponse({ success: false, error: "No capsule ID" });
              return;
            }
            fetchAndInjectCapsule(capsuleId).then(() => {
              sendResponse({ success: true });
            }).catch(err => {
              sendResponse({ success: false, error: err.toString() });
            });
          });
        } else {
          sendResponse({ success: false, error: "Context invalidated" });
        }
      }
    }
  })();

  return true; // Keep channel open
});

async function fetchAndInjectCapsule(capsuleId) {
  if (!isContextValid()) {
    showCustomModal("Extension context invalidated. Please refresh the page.");
    throw new Error("Context invalidated");
  }
  const conversationId = getConversationId();
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: "getCapsule",
      payload: { capsuleId, conversationId }
    }, (response) => resolve(response));
  });

  if (!res?.success) {
    console.error("❌ Failed to fetch capsule details:", res?.error);
    showCustomModal("Failed to fetch capsule summary: " + (res?.error || "Unknown error"));
    throw new Error(res?.error || "Fetch failed");
  }

  const capsuleData = res.data;
  const summary = capsuleData.rendered_handoff || capsuleData.summary || capsuleData.output || capsuleData.text || capsuleData.response;
  const capsuleTag = capsuleData.tag || "";
  const attachmentRefs = capsuleData.attachments || [];

  if (!summary) {
    console.error("❌ No handoff packet found in capsule data:", capsuleData);
    showCustomModal("Capsule data retrieved, but no transferable context was found.");
    throw new Error("No summary found");
  }

  if (conversationId) {
    chrome.storage.local.get("localConvoMappings", ({ localConvoMappings = {} }) => {
      localConvoMappings[conversationId] = capsuleId;
      chrome.storage.local.set({ localConvoMappings });
    });
  } else {
    pendingCapsuleId = capsuleId;
    startConversationIdWatcher();
  }

  const fetchFullContent = async (refs) => {
    if (refs.length === 0) return [];
    const fullAttachments = [];
    const fetchPromises = refs.map((ref) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: "GET_ATTACHMENT_CONTENT",
          payload: { assetId: ref.asset_id }
        }, (attRes) => {
          if (attRes?.success && attRes.data) {
            const fullAtt = attRes.data;
            fullAttachments.push({
              type: fullAtt.media_type || 'image',
              filename: fullAtt.filename,
              mime: fullAtt.content_type,
              base64: fullAtt.base64_data
            });
          } else {
            console.warn(`⚠️ [Content] Failed to fetch full metadata for asset: ${ref.asset_id}`, attRes?.error);
          }
          resolve();
        });
      });
    });

    await Promise.all(fetchPromises);
    let finalAttachments = fullAttachments;
    if (fullAttachments.length > 0) {
      finalAttachments = await showAttachmentSelector(fullAttachments);
      if (finalAttachments === null) {
        hideDroppingAnimation();
        return null;
      }
    }
    return finalAttachments;
  };

  if (attachmentRefs.length === 0 && (capsuleData.attachment_count || 0) > 0) {
    const listRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "GET_CAPSULE_ATTACHMENT_LIST",
        payload: { capsuleId: capsuleId }
      }, (res) => resolve(res));
    });
      if (listRes?.success && Array.isArray(listRes.data)) {
        const attachments = await fetchFullContent(listRes.data);
      if (attachments === null) throw new Error("Attachment selection cancelled");
      await injectCapsuleSummary(summary, attachments, capsuleTag);
    } else {
      console.error("❌ [Content] Failed to fetch attachment list:", listRes?.error);
      await injectCapsuleSummary(summary, [], capsuleTag);
    }
  } else {
    const attachments = await fetchFullContent(attachmentRefs);
    if (attachments === null) throw new Error("Attachment selection cancelled");
    await injectCapsuleSummary(summary, attachments, capsuleTag);
  }
}

async function injectCapsuleSummary(summary, attachments = [], capsuleTag = "") {
  // Build the tag pointer line — user-visible only, NOT part of the AI summary
  const MAX_TAG_LEN = 25;
  const tagLabel = capsuleTag
    ? (capsuleTag.length > MAX_TAG_LEN
      ? capsuleTag.slice(0, MAX_TAG_LEN) + "..."
      : capsuleTag)
    : null;
  // Single-line trigger visible as the user turn in the conversation
  const visibleTrigger = tagLabel
    ? `Adding Context of Capsule: ${tagLabel} ! Say Hi. 👀`
    : "Adding capsule context to this conversation ! Say Hi. 👀";
  // Trigger opening animation
  showOpeningAnimation();
  
  try {
    /* --- MULTIMODAL: Helper to drop files into ChatGPT --- */
    async function dropFilesIntoChatGPT(files) {
      const target = document.querySelector('#prompt-textarea') || document.querySelector('textarea');
      if (!target || files.length === 0) return;
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      target.dispatchEvent(mmCreateDragEvent('dragenter', dataTransfer));
      target.dispatchEvent(mmCreateDragEvent('dragover', dataTransfer));
      target.dispatchEvent(mmCreateDragEvent('drop', dataTransfer));
      await mmWait(200);
      const allDivs = document.querySelectorAll('div');
      let overlay = null;
      for (const div of allDivs) {
        if (div.textContent.includes("Drop any file here")) { overlay = div; break; }
      }
      const cleanupTargets = [target, document.body, window];
      if (overlay) cleanupTargets.unshift(overlay);
      cleanupTargets.forEach(el => {
        el.dispatchEvent(mmCreateDragEvent('dragleave', dataTransfer));
        el.dispatchEvent(mmCreateDragEvent('dragend', dataTransfer));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
    }

    /* --- MULTIMODAL: Helper to drop files into Gemini --- */
    async function dropFilesIntoGemini(files) {
      const editor = document.querySelector('.ql-editor');
      if (!editor || files.length === 0) return;

      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));

      // Method A: Paste (best for images)
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, composed: true,
        clipboardData: dataTransfer
      });
      editor.dispatchEvent(pasteEvent);

      // Method B: Drop (best for PDFs)
      editor.dispatchEvent(mmCreateDragEvent('dragenter', dataTransfer));
      editor.dispatchEvent(mmCreateDragEvent('dragover', dataTransfer));
      editor.dispatchEvent(mmCreateDragEvent('drop', dataTransfer));
    }

    /* --- MULTIMODAL: Helper to drop files into DeepSeek --- */
    async function dropFilesIntoDeepSeek(files) {
      // User reported dropping anywhere works
      const target = document.body;
      if (files.length === 0) return;

      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));

      target.dispatchEvent(mmCreateDragEvent('dragenter', dataTransfer));
      target.dispatchEvent(mmCreateDragEvent('dragover', dataTransfer));
      target.dispatchEvent(mmCreateDragEvent('drop', dataTransfer));
    }

    /* --- MULTIMODAL: Helper to drop files into Claude --- */
    async function dropFilesIntoClaude(files) {
      if (files.length === 0) return;

      for (const a of attachments) {
        window.dispatchEvent(
          new CustomEvent('CAPSULE_CLAUDE_INJECT_FILES', {
            detail: {
              attachments: [{
                base64: a.base64,
                filename: a.filename,
                mime: a.mime
              }]
            }
          })
        );

        await mmWait(1200);
      }
    }

    /* --- MULTIMODAL: Helper to drop files into Perplexity --- */
    async function dropFilesIntoPerplexity(files) {
      if (files.length === 0) return;
      // Prefer page-world file input injection (inserter listens for CAPSULE_PERPLEXITY_INJECT_FILES)
      window.dispatchEvent(new CustomEvent('CAPSULE_PERPLEXITY_INJECT_FILES', {
        detail: {
          attachments: attachments.map(a => ({ base64: a.base64, filename: a.filename, mime: a.mime }))
        }
      }));
      await mmWait(500);
      // Fallback: drag-drop on input area in case file input isn't found in page world
      const target = document.querySelector('#ask-input') || document.querySelector('div[role="textbox"][aria-placeholder*="follow-up"]') || document.querySelector('textarea[placeholder], textarea, div[contenteditable="true"]') || document.body;
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      if (target.focus) target.focus();
      target.dispatchEvent(mmCreateDragEvent('dragenter', dataTransfer));
      target.dispatchEvent(mmCreateDragEvent('dragover', dataTransfer));
      target.dispatchEvent(mmCreateDragEvent('drop', dataTransfer));
      target.dispatchEvent(mmCreateDragEvent('dragleave', dataTransfer));
    }

    // The actual injection logic is now handled by the injectorByPlatform registry
    // We just need to pass the correct payload.
    await globalThis.ContextCapsulePlatformInjectors.inject(getPlatformAdapterKey(), {
      summary,
      attachments,
      tagLabel,
      visibleTrigger,
      injectionSuffix: INJECTION_SUFFIX,
      helpers: {
        dropFilesIntoChatGPT,
        dropFilesIntoGemini,
        dropFilesIntoClaude,
        dropFilesIntoPerplexity,
        dropFilesIntoDeepSeek
      }
    });
    
    showToast("Capsule Injected Successfully!");
    return true;
  } catch (err) {
    console.error("Injection failed:", err);
    showCustomModal("Injection failed: " + err.message);
    throw err;
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.background = "#10b981";
  toast.style.color = "white";
  toast.style.padding = "10px 16px";
  toast.style.borderRadius = "8px";
  toast.style.fontFamily = "system-ui, sans-serif";
  toast.style.fontSize = "14px";
  toast.style.fontWeight = "600";
  toast.style.zIndex = "999999";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
  toast.style.transition = "opacity 0.3s, transform 0.3s";
  toast.style.transform = "translateY(20px)";
  toast.style.opacity = "0";

  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 10);

  // Remove toast
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**********************************************************
 * PLATFORM BRIDGE SCRIPTS
 **********************************************************/

injectPlatformBridgeScript();

/**********************************************************
 * BOOT LOG
 **********************************************************/
console.log("🧠 ContextCapsule loaded");

/**********************************************************
 * DRAG AND DROP HANDLER
 **********************************************************/

// We use capture: true to intercept the event BEFORE the site (e.g. Claude) sees it.
document.addEventListener("drop", (e) => {
  const data = e.dataTransfer.getData("text/plain");

  if (data && data.startsWith("CAPSULE_ID:")) {
    // Stop the site's default behavior (e.g. Claude pasting the ID)
    e.preventDefault();
    e.stopPropagation();

    const capsuleId = data.replace("CAPSULE_ID:", "");

    showDroppingAnimation();
    fetchAndInjectCapsule(capsuleId);
  }
}, true); // true = capture phase


// Necessary to allow dropping
document.addEventListener("dragover", (e) => {
  // If we don't preventDefault, drop event won't fire
  e.preventDefault();
}, true);

// Start fast filter watcher
if (isContextValid()) {
  initFastFilterWatcher();
}

/**********************************************************
 * FAST FILTER WATCHER (SEMANTIC TRIPWIRE)
 **********************************************************/
function initFastFilterWatcher() {
  const getActiveTextBox = () => {
    if (currentPlatform === 'chatgpt') return document.querySelector('#prompt-textarea');
    if (currentPlatform === 'gemini') return document.querySelector('rich-textarea div[contenteditable="true"]');
    if (currentPlatform.startsWith('claude')) {
      const el = document.querySelector('div[contenteditable="true"][data-testid*="input"]') ||
        document.querySelector('div[contenteditable="true"]') ||
        document.querySelector('.whitespace-pre-wrap[contenteditable="true"]');
      return el;
    }
    if (currentPlatform === 'deepseek') return document.querySelector('textarea#chat-input') ||
      document.querySelector('textarea[placeholder*="DeepSeek"]') ||
      document.querySelector('textarea.ds-scroll-area');
    return null;
  };

  const getInputValue = () => {
    const box = getActiveTextBox();
    if (!box) return "";
    if (box.tagName === 'TEXTAREA') return box.value;

    // For Claude's contenteditable (Tiptap/ProseMirror), try innerText then textContent
    let text = box.innerText || "";
    if (!text.trim()) text = box.textContent || "";

    // Some editors hide text in nested paragraphs
    if (!text.trim()) {
      const paragraphs = Array.from(box.querySelectorAll('p'));
      text = paragraphs.map(p => p.innerText || p.textContent).join('\n');
    }

    return text;
  };

}

/* ---------- CUSTOM MODAL ---------- */
function showCustomModal(message) {
  const existing = document.getElementById('cc-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'cc-modal';
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 12px;
    padding: 24px;
    z-index: 1000000;
    box-shadow: 0 20px 50px rgba(0,0,0,0.8);
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 280px;
    max-width: 400px;
    font-family: system-ui, -apple-system, sans-serif;
    color: #f3f4f6;
    animation: capsuleModalIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;

  modal.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h3 style="margin:0; font-size: 16px; color: #818cf8; font-weight: 700;">Info</h3>
      <button id="cc-close-modal" style="background:transparent; border:none; color:#9ca3af; cursor:pointer; font-size:18px;">✕</button>
    </div>
    <div style="font-size: 14px; line-height: 1.6; opacity: 0.9;">${message}</div>
    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
      <button id="cc-ok-modal" style="background:#6366f1; color:white; border:none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor:pointer; font-size: 13px;">Dismiss</button>
    </div>
    <style>
      @keyframes capsuleModalIn {
        from { opacity: 0; transform: translate(-50%, -40%) scale(0.95); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      #cc-ok-modal:hover { background: #4f46e5; }
    </style>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#cc-close-modal').onclick = close;
  modal.querySelector('#cc-ok-modal').onclick = close;

  // Cleanup on Escape
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', keyHandler);
    }
  };
  window.addEventListener('keydown', keyHandler);
}
