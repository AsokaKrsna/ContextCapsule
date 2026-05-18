const actionView = document.getElementById("actionView");
const capsulesView = document.getElementById("capsulesView");
const versionChoiceView = document.getElementById("versionChoiceView");
const settingsView = document.getElementById("settingsView");

const capsuleTagInput = document.getElementById("capsuleTag");
const generateBtn = document.getElementById("generate");
const genSpinner = document.getElementById("genSpinner");
const genText = document.getElementById("genText");

const viewCapsulesBtn = document.getElementById("viewCapsules");
const backToActions = document.getElementById("backToActions");

const capsulesListContainer = document.getElementById("capsulesListContainer");
const refreshCapsulesBtn = document.getElementById("refreshCapsules");
const capsuleSearchInput = document.getElementById("capsuleSearch");

const scrollUpBtn = document.getElementById("scrollUpBtn");
const scrollDownBtn = document.getElementById("scrollDownBtn");

// Version Choice
const newVersionBtn = document.getElementById("newVersionBtn");
const newCapsuleBtn = document.getElementById("newCapsuleBtn");
const backFromVersion = document.getElementById("backFromVersion");
const verSpinner = document.getElementById("verSpinner");
const verText = document.getElementById("verText");
const newCapSpinner = document.getElementById("newCapSpinner");
const newCapText = document.getElementById("newCapText");
const newCapsuleTagInput = document.getElementById("newCapsuleTag");

// Settings
const openSettingsBtn = document.getElementById("openSettingsBtn");
const backFromSettings = document.getElementById("backFromSettings");
const providerSelect = document.getElementById("providerSelect");
const groqSettings = document.getElementById("groqSettings");
const ollamaSettings = document.getElementById("ollamaSettings");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const apiKeyInput = document.getElementById("apiKey");
const groqModelInput = document.getElementById("groqModel");
const ollamaUrlInput = document.getElementById("ollamaUrl");
const ollamaModelInput = document.getElementById("ollamaModel");

let allCapsules = [];
let currentMappedCapsuleId = null;
let activeAction = null; 

/* ---------- VIEW MANAGEMENT ---------- */

function switchView(targetView, options = {}) {
  const views = [actionView, capsulesView, versionChoiceView, settingsView];
  views.forEach(view => {
    if (view) view.classList.add("hidden");
  });

  if (targetView) targetView.classList.remove("hidden");

  if (!document.body.classList.contains("tutorial-mode")) {
    document.body.classList.remove("expanded");
    if (options.bodyClass) document.body.classList.add(options.bodyClass);
  }
}

function showActions() { switchView(actionView); }
function showCapsulesView() { switchView(capsulesView, { bodyClass: "expanded" }); fetchUserCapsules(); }
function showVersionChoice() { switchView(versionChoiceView); }
function showSettingsView() { switchView(settingsView); loadSettings(); }

function isSupportedChatUrl(url = "") {
  return /https:\/\/(chat\.openai\.com|chatgpt\.com|gemini\.google\.com|aistudio\.google\.com|claude\.ai|chat\.deepseek\.com|www\.perplexity\.ai)\//.test(url);
}

function injectCapsuleIntoActiveTab(capsuleId, button) {
  const originalText = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = "Injecting...";
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !isSupportedChatUrl(tab.url || "")) {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      showCustomModal("Open a supported AI chat tab first.");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "ACTIVATE_INJECTOR", capsuleId }, () => {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      window.close();
    });
  });
}

/* ---------- INIT ---------- */

document.addEventListener("DOMContentLoaded", () => {
  showActions();

  chrome.storage.local.get(["showLibraryOnce"], ({ showLibraryOnce }) => {
    if (showLibraryOnce) {
      chrome.storage.local.remove("showLibraryOnce");
      showCapsulesView();
    }
  });

  // Check if we should jump to version choice
  chrome.storage.local.get(["showVersionChoiceOnce"], ({ showVersionChoiceOnce }) => {
    if (showVersionChoiceOnce) {
      currentMappedCapsuleId = showVersionChoiceOnce;
      chrome.storage.local.remove("showVersionChoiceOnce");
      setGenerationLoading(true);
      fetchCapsuleDetailsRaw(currentMappedCapsuleId).then(detailsRes => {
        setGenerationLoading(false);
        const existingTag = detailsRes?.success ? (detailsRes.data?.tag || "") : "";
        newCapsuleTagInput.value = existingTag;
        showVersionChoice();
      }).catch(() => {
        setGenerationLoading(false);
        showVersionChoice();
      });
    }
  });

  chrome.storage.local.get(["capturedTag"], ({ capturedTag }) => {
    if (capturedTag) capsuleTagInput.value = capturedTag;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "GET_CHAT_TITLE" }, (res) => {
          if (res && res.title) capsuleTagInput.value = res.title;
          if (capturedTag) chrome.storage.local.remove(["capturedTag"]);
        });
      } else if (capturedTag) {
        chrome.storage.local.remove(["capturedTag"]);
      }
    });
  });
});

/* ---------- SETTINGS ---------- */

openSettingsBtn.addEventListener("click", showSettingsView);
backFromSettings.addEventListener("click", showActions);

providerSelect.addEventListener("change", () => {
  if (providerSelect.value === "groq") {
    groqSettings.classList.remove("hidden");
    ollamaSettings.classList.add("hidden");
  } else {
    groqSettings.classList.add("hidden");
    ollamaSettings.classList.remove("hidden");
  }
});

function loadSettings() {
  chrome.storage.local.get(["provider", "apiKey", "modelName", "ollamaUrl"], (data) => {
    providerSelect.value = data.provider || "groq";
    
    if (data.provider === "ollama") {
      groqSettings.classList.add("hidden");
      ollamaSettings.classList.remove("hidden");
      ollamaUrlInput.value = data.ollamaUrl || "http://localhost:11434";
      ollamaModelInput.value = data.modelName || "llama3";
    } else {
      groqSettings.classList.remove("hidden");
      ollamaSettings.classList.add("hidden");
      apiKeyInput.value = data.apiKey || "";
      groqModelInput.value = data.modelName || "llama3-70b-8192";
    }
  });
}

saveSettingsBtn.addEventListener("click", () => {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const groqModel = groqModelInput.value.trim();
  const ollamaUrl = ollamaUrlInput.value.trim();
  const ollamaModel = ollamaModelInput.value.trim();
  
  const modelName = provider === "groq" ? groqModel : ollamaModel;

  saveSettingsBtn.textContent = "Saving...";
  saveSettingsBtn.disabled = true;

  chrome.storage.local.set({
    provider, apiKey, modelName, ollamaUrl
  }, () => {
    setTimeout(() => {
      saveSettingsBtn.textContent = "Save Settings";
      saveSettingsBtn.disabled = false;
      showActions();
    }, 500);
  });
});

/* ---------- DRAG ICON SETUP ---------- */

const finalDragImage = new Image();
const dragCanvas = document.createElement('canvas');
dragCanvas.width = 24;
dragCanvas.height = 24;
const ctx = dragCanvas.getContext('2d');
const dragIconSource = new Image();
dragIconSource.src = "capsule.png";
dragIconSource.onload = () => {
  ctx.drawImage(dragIconSource, 0, 0, 24, 24);
  finalDragImage.src = dragCanvas.toDataURL();
  finalDragImage.style.position = "absolute";
  finalDragImage.style.top = "-9999px";
  finalDragImage.style.left = "-9999px";
  document.body.appendChild(finalDragImage);
};

/* ---------- HELPERS ---------- */

function extractConvoId(url) {
  if (url.includes('gemini.google.com') || url.includes('aistudio.google.com')) {
    const match = url.match(/\/app\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  } else if (url.includes('claude.ai')) {
    const match = url.match(/\/chat\/([a-z0-9-]+)/);
    return match ? match[1] : null;
  } else if (url.includes('chat.deepseek.com')) {
    const match = url.match(/\/a\/chat\/s\/([a-z0-9-]+)/);
    return match ? match[1] : null;
  } else if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
    const match = url.match(/\/c\/([a-z0-9-]+)/);
    return match ? match[1] : null;
  } else if (url.includes('perplexity.ai')) {
    const match = url.match(/\/search\/([^\/?#]+)/);
    if (!match) return null;
    const parts = match[1].split('-');
    return parts[parts.length - 1] || null;
  }
  return null;
}

function setGenerationLoading(isLoading, text = "Checking...") {
  if (isLoading) {
    generateBtn.disabled = true;
    genSpinner.classList.remove("hidden");
    genText.textContent = text;
  } else {
    generateBtn.disabled = false;
    genSpinner.classList.add("hidden");
    genText.textContent = "Generate Capsule";
  }
}

function setVersionLoading(isLoading) {
  if (isLoading) {
    newVersionBtn.disabled = true;
    newCapsuleBtn.disabled = true;
    verSpinner.classList.remove("hidden");
    verText.textContent = "Creating...";
  } else {
    newVersionBtn.disabled = false;
    newCapsuleBtn.disabled = false;
    verSpinner.classList.add("hidden");
    verText.textContent = "New Version";
  }
}

function setNewCapsuleLoading(isLoading, text = "New Capsule") {
  if (isLoading) {
    newVersionBtn.disabled = true;
    newCapsuleBtn.disabled = true;
    newCapSpinner.classList.remove("hidden");
    newCapText.textContent = text === "Generating..." ? "Generating..." : "Creating...";
  } else {
    newVersionBtn.disabled = false;
    newCapsuleBtn.disabled = false;
    newCapSpinner.classList.add("hidden");
    newCapText.textContent = "New Capsule";
  }
}

function fetchCapsuleDetailsRaw(capsuleId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getCapsule", payload: { capsuleId } }, (res) => {
      resolve(res);
    });
  });
}

function triggerStandardGeneration(tabId, tag) {
  chrome.tabs.sendMessage(tabId, { type: "GENERATE_SUMMARY", payload: { tag } });
}

/* ---------- GENERATION LOGIC ---------- */

generateBtn.addEventListener("click", () => {
  const tag = capsuleTagInput.value.trim();

  // Make sure provider is set
  chrome.storage.local.get(["provider", "apiKey"], ({ provider, apiKey }) => {
    if ((!provider || provider === "groq") && !apiKey) {
      showCustomModal("Please configure your API key in Settings first.");
      showSettingsView();
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      const convoId = extractConvoId(tabs[0].url);
      if (!convoId) {
        activeAction = "generate";
        triggerStandardGeneration(tabs[0].id, tag);
        return;
      }
  
      setGenerationLoading(true);
      chrome.runtime.sendMessage({
        type: "CHECK_CONVO_MAPPING",
        payload: { conversationId: convoId }
      }, (res) => {
        setGenerationLoading(false);
        if (res?.success && res.data?.capsule_id) {
          currentMappedCapsuleId = res.data.capsule_id;
          fetchCapsuleDetailsRaw(currentMappedCapsuleId).then(detailsRes => {
            newCapsuleTagInput.value = tag || (detailsRes?.success ? (detailsRes.data?.tag || "") : "");
            showVersionChoice();
          });
        } else {
          activeAction = "generate";
          triggerStandardGeneration(tabs[0].id, tag);
        }
      });
    });
  });
});

newVersionBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    activeAction = "version";
    setVersionLoading(true);
    chrome.tabs.sendMessage(tabs[0].id, {
      type: "GENERATE_VERSION",
      payload: { capsuleId: currentMappedCapsuleId }
    });
  });
});

newCapsuleBtn.addEventListener("click", () => {
  const tag = newCapsuleTagInput.value.trim();
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    activeAction = "new_capsule";
    setNewCapsuleLoading(true);
    triggerStandardGeneration(tabs[0].id, tag);
  });
});

backFromVersion.addEventListener("click", showActions);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "GENERATION_STARTED") {
    if (activeAction === "generate") setGenerationLoading(true, "Generating...");
    else if (activeAction === "version") setVersionLoading(true);
    else if (activeAction === "new_capsule") setNewCapsuleLoading(true, "Generating...");
  }
  if (msg.type === "GENERATION_COMPLETE") {
    setGenerationLoading(false);
    setVersionLoading(false);
    setNewCapsuleLoading(false);
    if (msg.success) {
      window.close();
    } else {
      showCustomModal("Generation failed: " + (msg.error || "Unknown error"));
    }
  }
});

/* ---------- CAPSULES VIEW ---------- */

viewCapsulesBtn.addEventListener("click", showCapsulesView);
backToActions.addEventListener("click", showActions);
if (refreshCapsulesBtn) refreshCapsulesBtn.addEventListener("click", fetchUserCapsules);

function fetchUserCapsules() {
  capsulesListContainer.innerHTML = '<div class="loading-capsules">Loading capsules...</div>';
  chrome.runtime.sendMessage({ type: "GET_CAPSULES" }, (res) => {
    if (res?.success) {
      allCapsules = res.results || [];
      if (allCapsules.length === 0) {
        capsulesListContainer.innerHTML = '<div class="no-capsules-msg">No capsules found</div>';
      } else {
        filterAndRenderCapsules();
      }
    } else {
      capsulesListContainer.innerHTML = '<div class="no-capsules-msg">Failed to load capsules</div>';
    }
  });
}

if (capsuleSearchInput) {
  capsuleSearchInput.addEventListener("input", filterAndRenderCapsules);
}

function filterAndRenderCapsules() {
  const query = capsuleSearchInput.value.trim().toLowerCase();
  let filtered = allCapsules;
  if (query) {
    filtered = allCapsules.filter(c => {
      const tag = (c.tag || "").toLowerCase();
      const summary = getCapsulePreviewText(c).toLowerCase();
      return tag.includes(query) || summary.includes(query);
    });
  }
  
  capsulesListContainer.innerHTML = "";
  if (filtered.length === 0) {
    capsulesListContainer.innerHTML = '<div class="no-capsules-msg">No matches found</div>';
    return;
  }
  
  filtered.forEach(capsule => {
    capsulesListContainer.appendChild(createCapsuleItem(capsule));
  });
  
  updateScrollIndicators(capsulesListContainer, scrollUpBtn, scrollDownBtn);
}

if (capsulesListContainer) {
  capsulesListContainer.addEventListener("scroll", () => updateScrollIndicators(capsulesListContainer, scrollUpBtn, scrollDownBtn));
}

function getCapsulePreviewText(capsule) {
  const semantic = capsule?.semantic_state || {};
  const semanticPreview = [
    semantic.current_state,
    semantic.next_step,
    semantic.objective
  ].filter(Boolean).join(" | ");

  if (semanticPreview) return semanticPreview;
  if (typeof capsule?.summary === "string") return capsule.summary;
  if (typeof capsule?.text === "string") return capsule.text;
  if (typeof capsule?.content === "string") return capsule.content;
  return "";
}

function updateScrollIndicators(container, upBtn, downBtn) {
  if (!container || !upBtn || !downBtn) return;
  const { scrollTop, scrollHeight, clientHeight } = container;
  upBtn.classList.toggle("hidden", scrollTop <= 5);
  downBtn.classList.toggle("hidden", scrollTop + clientHeight >= scrollHeight - 5);
}

function createCapsuleItem(capsule) {
  const item = document.createElement("div");
  item.className = "capsule-item";
  item.dataset.capsuleId = capsule.id;

  const tagHeader = document.createElement("div");
  tagHeader.className = "capsule-tag-header";
  
  const tag = document.createElement("div");
  tag.className = "capsule-item-tag";
  tag.textContent = capsule.tag || "Untitled";

  const editBtn = document.createElement("button");
  editBtn.className = "edit-capsule-btn";
  editBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  `;
  editBtn.title = "Edit Tag";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startEditingTag(capsule, tag, editBtn);
  });
  
  tagHeader.appendChild(tag);
  tagHeader.appendChild(editBtn);
  
  const getLogo = (source) => {
    source = (source || "").toLowerCase();
    if (source.includes("chatgpt") || source.includes("openai")) return "ChatgptLogo.png";
    if (source.includes("claude")) return "ClaudeLogo.png";
    if (source.includes("gemini") || source.includes("aistudio")) return "GeminiLogo.png";
    if (source.includes("deepseek")) return "DeepseekLogo.png";
    if (source.includes("perplexity")) return "PerplexityLogo.png";
    return "ExtensionLogo.png";
  };

  const sourceText = document.createElement("div");
  sourceText.style.display = "flex";
  sourceText.style.alignItems = "center";
  sourceText.style.gap = "6px";
  sourceText.style.fontSize = "11px";
  sourceText.style.color = "#94a3b8";
  sourceText.style.marginBottom = "8px";
  
  const logoImg = document.createElement("img");
  logoImg.src = getLogo(capsule.extracted_from);
  logoImg.style.width = "14px";
  logoImg.style.height = "14px";
  logoImg.style.borderRadius = "2px";
  
  const sourceLabel = document.createElement("span");
  sourceLabel.textContent = `Source: ${capsule.extracted_from || "Unknown"}`;
  
  sourceText.appendChild(logoImg);
  sourceText.appendChild(sourceLabel);

  const summary = document.createElement("div");
  summary.style.fontSize = "12px";
  summary.style.color = "#cbd5e1";
  summary.style.overflow = "hidden";
  summary.style.display = "-webkit-box";
  summary.style.webkitLineClamp = "2";
  summary.style.webkitBoxOrient = "vertical";
  const previewText = getCapsulePreviewText(capsule);
  summary.textContent = previewText || "No summary available.";

  const createdDate = capsule.timestamp ? new Date(capsule.timestamp).toLocaleString() : "Unknown date";
  item.title = `Created: ${createdDate}\n\n${previewText || ""}`;

  item.draggable = true;
  item.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", `CAPSULE_ID:${capsule.id}`);
    e.dataTransfer.effectAllowed = "copy";
    if (finalDragImage && finalDragImage.src) {
      e.dataTransfer.setDragImage(finalDragImage, 12, 12);
    }
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-capsule-btn";
  deleteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  `;
  deleteBtn.title = "Delete Capsule";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${capsule.tag || 'Untitled'}"?`)) {
      item.style.opacity = "0.5";
      item.style.pointerEvents = "none";
      chrome.runtime.sendMessage({ type: "DELETE_CAPSULE", payload: { capsuleId: capsule.id } }, (res) => {
        if (res?.success) {
          item.remove();
          allCapsules = allCapsules.filter(c => c.id !== capsule.id);
        } else {
          item.style.opacity = "1";
          item.style.pointerEvents = "all";
        }
      });
    }
  });

  const injectBtn = document.createElement("button");
  injectBtn.className = "inject-capsule-btn";
  injectBtn.textContent = "Inject Here";
  injectBtn.title = "Inject into active chat";
  injectBtn.style.margin = "0";
  injectBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    injectCapsuleIntoActiveTab(capsule.id, injectBtn);
  });

  const copyBtn = document.createElement("button");
  copyBtn.title = "Copy Context";
  copyBtn.style.cssText = "background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; transition: color 0.2s; border-radius: 6px;";
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
  copyBtn.addEventListener("mouseover", () => copyBtn.style.color = "#818cf8");
  copyBtn.addEventListener("mouseout", () => copyBtn.style.color = "#94a3b8");
  
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const textToCopy = capsule.rendered_handoff || capsule.summary || "";
    navigator.clipboard.writeText(textToCopy).then(() => {
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        `;
      }, 2000);
    });
  });

  const actionRow = document.createElement("div");
  actionRow.style.display = "flex";
  actionRow.style.alignItems = "center";
  actionRow.style.gap = "8px";
  actionRow.style.marginTop = "10px";
  
  actionRow.appendChild(injectBtn);
  actionRow.appendChild(copyBtn);

  item.appendChild(tagHeader);
  item.appendChild(sourceText);
  item.appendChild(summary);
  item.appendChild(actionRow);
  item.appendChild(deleteBtn);

  return item;
}

function startEditingTag(capsule, tagElement, editBtn) {
  const currentTag = capsule.tag || "Untitled";
  const parent = tagElement.parentNode;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-tag-input";
  input.value = currentTag;

  const originalDisplay = tagElement.style.display;
  const originalEditDisplay = editBtn.style.display;
  tagElement.style.display = "none";
  editBtn.style.display = "none";

  parent.insertBefore(input, tagElement);
  input.focus();
  input.select();

  let isSaving = false;

  const cleanup = () => {
    if (input.parentNode) input.remove();
    tagElement.style.display = originalDisplay;
    editBtn.style.display = originalEditDisplay;
  };

  const save = async () => {
    if (isSaving) return;
    const newTag = input.value.trim();
    if (!newTag || newTag === currentTag) return cleanup();

    isSaving = true;
    input.disabled = true;

    chrome.runtime.sendMessage({
      type: "UPDATE_CAPSULE_TAG",
      payload: { capsuleId: capsule.id, tag: newTag }
    }, (res) => {
      if (res?.success) {
        capsule.tag = newTag;
        tagElement.textContent = newTag;
        cleanup();
      } else {
        showCustomModal("Failed to update tag");
        cleanup();
      }
    });
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cleanup();
  };
  input.onblur = save;
}

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
    min-width: 260px;
    max-width: 350px;
    font-family: system-ui, -apple-system, sans-serif;
    color: #f3f4f6;
    animation: capsuleModalIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
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
}
