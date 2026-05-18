/**********************************************************
 * Utilities (Shared by content.js)
 **********************************************************/
console.log("🛠️ content-utils.js loaded");

/**********************************************************
 * SUPPORTED MIME TYPES
 * All attachment MIME types the extension handles. Used by
 * platform extractors to decide which files to include.
 **********************************************************/
const SUPPORTED_MIME_TYPES = new Set([
    // Images
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "image/avif", "image/gif",
    // Documents
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Code / Scripts
    "text/javascript", "application/javascript",
    "text/typescript",
    "text/x-python", "application/x-python",
    "text/x-java-source",
    "text/x-csrc", "text/x-c++src",
    "text/x-csharp",
    "text/x-go",
    "text/x-rustsrc",
    "text/x-php",
    "application/x-sh", "text/x-shellscript",
    "application/x-bat",
    // Web / Markup
    "text/html", "text/css",
    "application/json",
    "text/markdown",
    "application/xml", "text/xml",
    "application/x-yaml", "text/yaml",
    // Data / Misc text
    "application/sql",
    "text/csv",
    "text/x-log",
    "text/plain",
]);

/** Returns true when a MIME type is in the supported set. */
function isSupportedMime(mime) {
    if (!mime) return false;
    // Strip parameters (e.g. "text/plain; charset=utf-8" → "text/plain")
    const base = mime.split(';')[0].trim().toLowerCase();
    return SUPPORTED_MIME_TYPES.has(base);
}

/** Returns true when the MIME type is an image. */
function isImageMime(mime) {
    if (!mime) return false;
    return mime.split(';')[0].trim().toLowerCase().startsWith('image/');
}

/** Returns true when the MIME type is a PDF. */
function isPdfMime(mime) {
    if (!mime) return false;
    return mime.split(';')[0].trim().toLowerCase() === 'application/pdf';
}

/**
 * Infer a supported MIME type from a file extension when the server
 * doesn't provide one (or provides only 'text/plain' as a fallback).
 */
const EXTENSION_TO_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
    pdf: 'application/pdf',
    js: 'text/javascript', ts: 'text/typescript',
    py: 'text/x-python', java: 'text/x-java-source',
    c: 'text/x-csrc', cpp: 'text/x-c++src', cs: 'text/x-csharp',
    go: 'text/x-go', rs: 'text/x-rustsrc', php: 'text/x-php',
    html: 'text/html', css: 'text/css',
    json: 'application/json', md: 'text/markdown', markdown: 'text/markdown',
    xml: 'application/xml', yaml: 'application/x-yaml', yml: 'application/x-yaml',
    sh: 'application/x-sh', bat: 'application/x-bat',
    sql: 'application/sql', csv: 'text/csv', log: 'text/x-log',
    txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Given a filename, return the best MIME type match.
 * Falls back to serverMime if no extension match is found.
 */
function mimeFromFilename(filename, serverMime) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    return EXTENSION_TO_MIME[ext] || serverMime || 'application/octet-stream';
}

/**********************************************************
 * MULTIMODAL HELPERS
 **********************************************************/

function mmBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function mmFetchBlobAsBase64(url) {
    if (!isContextValid()) return { data: null };

    // 1. Try local fetch first (works for blob: URLs and same-origin)
    try {
        const response = await fetch(url);
        if (response.ok) {
            const blob = await response.blob();
            const mime = blob.type || 'application/octet-stream';
            const data = await mmBlobToBase64(blob);
            return { data, mime, size: blob.size };
        }
    } catch (e) {
    }

    // 2. Fall back to background script for CORS-restricted URLs
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: "downloadAttachment",
            payload: { url }
        }, (res) => {
            if (res?.success && res.base64) {
                // Determine mime from base64 if possible
                const mimeMatch = res.base64.match(/^data:([^;]+);base64,/);
                let mime = mimeMatch ? mimeMatch[1] : (res.mime || 'application/octet-stream');

                // If we got a generic mime, try to improve it if possible (though we don't have filename here)
                if (mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
                    mime = res.mime || mime;
                }

                resolve({ data: res.base64, mime: mime, size: 0 });
            } else {
                resolve({ data: null });
            }
        });
    });
}

function mmBase64ToFile(base64String, filename, mimeType) {
    const cleanBase64 = base64String.includes(',')
        ? base64String.split(',')[1]
        : base64String;
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new File([new Uint8Array(byteNumbers)], filename, { type: mimeType });
}

function mmCreateDragEvent(type, dataTransfer) {
    return new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        dataTransfer: dataTransfer
    });
}

const mmWait = (ms) => new Promise(r => setTimeout(r, ms));

function closeChatGPTFileViewer() {
    const btn = document.querySelector('button[aria-label="Close"]');
    if (btn && btn.offsetParent !== null) {
        btn.click();
        return true;
    }
    return false;
}

async function canvasesToPdfBase64(container = document) {
    // Determine the correct jsPDF class based on UMD loading
    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) {
        console.error("❌ jsPDF not found. Make sure jspdf.min.js is loaded.");
        return null;
    }

    const canvases = container.querySelectorAll('.react-pdf__Page__canvas, canvas');
    if (!canvases.length) return null;

    const pdf = new jsPDFClass({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
    });

    canvases.forEach((canvas, index) => {
        const imgData = canvas.toDataURL('image/png', 1.0);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = (canvas.height * pageWidth) / canvas.width;

        if (index !== 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
    });

    const dataUri = pdf.output('datauristring');
    return dataUri.split(',')[1]; // Return pure base64
}


/**********************************************************
 * END MULTIMODAL HELPERS
 **********************************************************/

// Helper to check if extension context is still valid
function isContextValid() {
    try {
        return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (e) {
        return false;
    }
}

// Simple platform detector
function detectPlatform() {
    const hostname = window.location.hostname;
    const url = window.location.href;
    const platform = hostname.includes('www.perplexity.ai') ? 'perplexity' :
        hostname.includes('gemini.google.com') || hostname.includes('aistudio.google.com') ? 'gemini' :
            hostname.includes('claude.ai') ? (url.includes('/project/') ? 'claude-project' : 'claude') :
                hostname.includes('chat.deepseek.com') ? 'deepseek' : 'chatgpt';
    return platform;
}

function getConversationId() {
    const url = window.location.href;
    const platform = detectPlatform();

    try {
        if (platform === 'gemini') {
            // Patterns: 
            // https://gemini.google.com/app/<id>
            // https://gemini.google.com/u/0/app/<id>
            const match = url.match(/\/app\/([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        } else if (platform === 'perplexity') {
            const match = url.match(/\/search\/([^\/?#]+)/);
            if (!match) return null;
            const parts = match[1].split('-');
            return parts[parts.length - 1] || null;
        } else if (platform.startsWith('claude')) {
            // Pattern: https://claude.ai/chat/<uuid>
            // Also works for projects: https://claude.ai/project/<uuid>/chat/<uuid>
            const match = url.match(/\/chat\/([a-z0-9-]+)/);
            return match ? match[1] : null;
        } else if (platform === 'deepseek') {
            // Pattern: https://chat.deepseek.com/a/chat/s/<uuid>
            const match = url.match(/\/a\/chat\/s\/([a-z0-9-]+)/);
            return match ? match[1] : null;
        } else if (platform === 'chatgpt') {
            // Patterns: 
            // https://chatgpt.com/c/<uuid>
            // https://chatgpt.com/g/<id>/c/<uuid>
            const match = url.match(/\/c\/([a-z0-9-]+)/);
            return match ? match[1] : null;
        }
    } catch (err) {
        console.error("Error extracting conversation ID:", err);
    }
    return null;
}

function getChatTitle() {
    const platform = detectPlatform();
    let title = "";

    try {
        if (platform === 'chatgpt') {
            // Priority 1: Current active sidebar item
            const activeItem = document.querySelector('a[data-active] .truncate') ||
                document.querySelector('li[data-testid*="history-item-"] .truncate');
            if (activeItem) title = activeItem.textContent.trim();
        } else if (platform.startsWith('claude')) {
            // Priority 1: Chat title button in the header (Regular chats)
            const titleBtn = document.querySelector('button[data-testid="chat-title-button"]');
            if (titleBtn) {
                const innerText = titleBtn.querySelector('.truncate')?.textContent || titleBtn.textContent;
                title = innerText.trim();
            }

            // Priority 2: Project title h1 (Projects)
            if (!title && platform === 'claude-project') {
                const projectH1 = document.querySelector('h1.font-heading');
                if (projectH1) title = projectH1.textContent.trim();
            }
        } else if (platform === 'gemini') {
            // Priority 1: Conversation title class
            const titleEl = document.querySelector('.conversation-title');
            if (titleEl) title = titleEl.textContent.trim();
        } else if (platform === 'deepseek') {
            // Priority 1: Specific class/tabindex structure provided
            const titleEl = document.querySelector('div[class*="afa34042"]') ||
                document.querySelector('div[tabindex="0"][style*="outline: none"]');
            if (titleEl) title = titleEl.textContent.trim();
        } else if (platform === 'perplexity') {
            // Perplexity: use document title or h1 tag
            const cleanTitle = document.title.replace(/\\s*-\\s*Perplexity/i, '').trim();
            if (cleanTitle && cleanTitle.length > 0) {
                title = cleanTitle;
            } else {
                const h1 = document.querySelector('h1');
                if (h1) title = h1.textContent.trim();
            }
        }
    } catch (err) {
        console.warn("Error extracting chat title via selectors:", err);
    }

    // Fallback if specific selectors failed
    if (!title || title === 'ChatGPT' || title === 'New chat') {
        title = document.title;
        if (platform === 'chatgpt') {
            title = title.replace(/ - ChatGPT$/, '');
        } else if (platform.startsWith('claude')) {
            title = title.replace(/ - Claude$/, '');
        } else if (platform === 'gemini') {
            title = title.replace(/^Gemini$/, 'Gemini Chat').replace(/^Gemini - /, '');
        } else if (platform === 'deepseek') {
            title = title.replace(/^DeepSeek - /, '');
        } else if (platform === 'perplexity') {
            title = title.replace(/\s*-\s*Perplexity.*$/i, '').trim();
        }
    }

    return title.trim() || "New Capsule";
}

function getPostDropMessages(msgs) {
    if (!msgs || !msgs.length) {
        return [];
    }

    const DROP_MARKERS = [
        "Adding Capsule Context To Conversation 👀",
        "**ACTIVE CAPSULE CONTEXT**",
        "Adding capsule context to this conversation! Say Hi."
    ];

    // Find the last index of any drop marker
    let lastDropIndex = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
        const text = msgs[i].text || msgs[i].content || "";
        const role = msgs[i].role || "unknown";

        // CLEAN the text for more robust matching (normalize whitespace)
        const cleanText = text.replace(/\s+/g, ' ');

        if (DROP_MARKERS.some(marker => cleanText.includes(marker))) {
            lastDropIndex = i;
            break;
        }
    }

    if (lastDropIndex === -1) {
        return msgs;
    }

    const sliced = msgs.slice(lastDropIndex + 1);
    return sliced;
}

/* ===== CHATGPT UTILS ===== */
function waitForMessagesFromChatGPT(timeout = 15000) {
    return globalThis.ContextCapsuleExtractors.chatgpt.waitForMessagesFromChatGPT(timeout);
}

async function getMessagesFromChatGPT(options = { includeAttachments: true }) {
    return globalThis.ContextCapsuleExtractors.chatgpt.getMessagesFromChatGPT(options);
}

/* ===== GEMINI UTILS ===== */
function waitForMessagesFromGemini(timeout = 15000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            const turns = document.querySelectorAll('#chat-history .conversation-container');
            if (turns.length > 0) {
                clearInterval(interval);
                resolve(turns);
            }
            if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject("Timed out waiting for messages");
            }
        }, 500);
    });
}

async function getMessagesFromGemini(options = { includeAttachments: true }) {
    const history = [];
    // Select ONLY role containers to avoid merged text from parent containers
    const turns = document.querySelectorAll('user-query, model-response');

    const includeAttachments = options.includeAttachments !== false;

    // Count total attachments for progress tracking
    let totalAttachments = 0;
    for (const el of turns) {
        const imgs = Array.from(el.querySelectorAll('img')).filter(img => {
            const isSmall = img.naturalWidth < 100;
            const isProfile = img.src.includes('profile_photo') || img.src.includes('googleusercontent.com/a/');
            const isIcon = img.src.includes('icon') || img.src.includes('symbol');
            return !isSmall && !isProfile && !isIcon;
        });
        const pdfBtns = el.querySelectorAll('button.new-file-preview-file');
        totalAttachments += imgs.length + pdfBtns.length;
    }
    let attachmentIndex = 0;

    for (const el of turns) {
        const isAI = el.tagName.toLowerCase() === 'model-response' || el.closest('model-response');
        const role = isAI ? 'model' : 'user';

        const contentEl = el.querySelector('.query-text, message-content, .markdown') || el;

        // PRIORITIZE our saved attribute, fallback to textContent
        const text = (el.getAttribute('data-capsule-text') ||
            contentEl.getAttribute('data-capsule-text') ||
            contentEl.textContent).trim();

        // ===== MULTIMODAL: Extract images from this turn =====
        const attachments = [];

        if (includeAttachments) {
            const imgs = Array.from(el.querySelectorAll('img')).filter(img => {
                const isSmall = img.naturalWidth < 100;
                const isProfile = img.src.includes('profile_photo') || img.src.includes('googleusercontent.com/a/');
                const isIcon = img.src.includes('icon') || img.src.includes('symbol');
                return !isSmall && !isProfile && !isIcon;
            });

            for (const [i, img] of imgs.entries()) {
                attachmentIndex++;

                try {
                    let base64 = null;
                    if (img.src.startsWith('blob:')) {
                        const r = await fetch(img.src);
                        const blob = await r.blob();
                        base64 = await mmBlobToBase64(blob);
                    } else if (isContextValid()) {
                        const res = await chrome.runtime.sendMessage({
                            type: "downloadAttachment",
                            payload: { url: img.src }
                        });
                        if (res?.success && res.base64) {
                            base64 = res.base64;
                        }
                    }
                    if (base64) {
                        attachments.push({
                            type: 'image',
                            filename: `image_${i + 1}.png`,
                            mime: 'image/png',
                            base64: base64
                        });
                    }
                } catch (e) {
                    console.error("Failed to extract Gemini image:", e);
                }
            }

            // ===== MULTIMODAL: Extract PDFs from this turn =====
            const pdfBtns = el.querySelectorAll('button.new-file-preview-file');
            for (const btn of pdfBtns) {
                let nameText = btn.getAttribute("aria-label") || "";
                if (!nameText || nameText.includes("preview file") || nameText.includes("Download")) {
                    const nameEl = btn.querySelector('.new-file-name') || btn.querySelector('.name');
                    nameText = nameEl ? nameEl.textContent.trim() : "document.pdf";
                }

                // Clean up the name mapping (Note: if it's truncated we just use it as fallback)
                nameText = nameText.replace("Loading ", "").replace(/\.$/, "").trim();

                let finalName = nameText;


                const downloadRequestId = (crypto.randomUUID && crypto.randomUUID()) ||
                    `download_${Date.now()}_${Math.random().toString(36).slice(2)}`;

                try {
                    // Snapshot iframes before clicking so we can detect newly-added ones OR updated ones
                    const iframesBefore = new Map(Array.from(document.querySelectorAll('iframe')).map(f => [f, f.src]));

                    const downloadPromise = chrome.runtime.sendMessage({
                        action: "expectDownload",
                        payload: {
                            expectedMime: "application/pdf",
                            filename: finalName,
                            requestId: downloadRequestId
                        }
                    });

                    // Click the preview button
                    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));

                    // ── Poll for drive-viewer download button ──
                    let downloadTarget = null;
                    const findVisibleDownloadTarget = () => {
                        const selectors = [
                            '.drive-viewer-download-icon',
                            '[data-tooltip*="Download"]',
                            '[aria-label*="Download"]'
                        ];
                        for (const sel of selectors) {
                            const elements = document.querySelectorAll(sel);
                            for (const targetEl of elements) {
                                if (targetEl.getBoundingClientRect().width > 0) {
                                    return targetEl.closest('[role="button"]') || targetEl.closest('button') || targetEl;
                                }
                            }
                        }
                        return null;
                    };

                    let attempt = 0;
                    for (; attempt < 150; attempt++) {
                        const target = findVisibleDownloadTarget();

                        if (target) {
                            downloadTarget = target;
                            break;
                        } else if (attempt % 20 === 0) {
                            const anyExist = document.querySelector('.drive-viewer-download-icon') || document.querySelector('[aria-label*="Download"]');
                            if (anyExist) console.log(`[Capsule Debug] Note: target exists in DOM but width is 0.`);
                        }

                        await mmWait(100);
                    }

                    if (downloadTarget) {
                        // Drive-viewer modal path: click download button, close, await intercept
                        downloadTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                        downloadTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                        downloadTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

                        // Wait for the download navigation/event to initiate before checking results
                        await mmWait(3000);

                        const res = await downloadPromise;

                        let finalBase64 = null;
                        let finalMime = "application/pdf";

                        if (res?.success) {
                            finalBase64 = res.base64;
                            finalMime = res.mime || "application/pdf";
                            if (res.filename) {
                                finalName = res.filename;
                            }

                            if (res.type === "blob_url" && res.url) {
                                try {
                                    const blobRes = await fetch(res.url);
                                    if (!blobRes.ok) throw new Error("HTTP " + blobRes.status);
                                    const blob = await blobRes.blob();
                                    finalBase64 = await mmBlobToBase64(blob);
                                    finalMime = blob.type || finalMime;
                                } catch (err) {
                                    finalBase64 = null; // force fallthrough to canvas fallback
                                }
                            }
                        }

                        // Canvas Fail-safe fallback!
                        if (!finalBase64) {
                            finalBase64 = await canvasesToPdfBase64(document);
                            finalMime = "application/pdf";
                        }

                        if (finalBase64) {
                            const resolvedMime = mimeFromFilename(finalName, finalMime);
                            attachments.push({
                                type: isPdfMime(resolvedMime) ? 'pdf' : (isImageMime(resolvedMime) ? 'image' : 'file'),
                                filename: finalName,
                                mime: resolvedMime,
                                base64: finalBase64
                            });
                        } else {
                        }

                        const closeBtn = document.querySelector('.drive-viewer-close-button') || document.querySelector('[aria-label="Close"]');
                        if (closeBtn) {
                            closeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                            closeBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                            closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        } else {
                            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        }
                    } else {
                        // Nothing found — cancel and close
                        chrome.runtime.sendMessage({
                            action: "cancelExpectDownload",
                            payload: { requestId: downloadRequestId }
                        });
                        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    }

                    // Cleanup wait
                    await mmWait(100);
                } catch (e) {
                    // Ensure closed on error
                    chrome.runtime.sendMessage({
                        action: "cancelExpectDownload",
                        payload: { requestId: downloadRequestId }
                    }).catch(() => {});
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }
            }
        }

        if (text || attachments.length > 0) {
            // Basic deduplication in case of overlapping selectors
            if (history.length > 0 &&
                history[history.length - 1].role === role &&
                history[history.length - 1].text === text &&
                attachments.length === 0) continue;

            history.push({ role, text, attachments });
        }
    }

    return history;
}

/* ===== CLAUDE UTILS (NUCLEAR OPTION) ===== */
function waitForMessagesFromClaude(options = { scope: document }) {
    const scope = options.scope || document;
    return new Promise((resolve, reject) => {
        const timeout = 10000;
        const start = Date.now();
        const interval = setInterval(() => {
            const msgs = scope.querySelectorAll('.whitespace-pre-wrap, [data-test-id="chat-query"], [data-test-id="chat-message"]');
            if (msgs.length > 0) {
                clearInterval(interval);
                resolve(msgs);
            }
            if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject("Timed out waiting for messages");
            }
        }, 500);
    });
}

async function getMessagesFromClaude(options = { includeAttachments: true, scope: document }) {
    const history = [];
    const scope = options.scope || document;

    const includeAttachments = options.includeAttachments !== false;

    // STRATEGY: Grab EVERY text bubble on the entire page
    // Claude uses .whitespace-pre-wrap for message text, but we also look for test-ids
    const elements = scope.querySelectorAll('.whitespace-pre-wrap, [data-test-id="chat-query"], [data-test-id="chat-message"]');

    if (elements.length === 0) {
        console.warn("⚠️ Nuclear selector failed. Is the chat empty?");
        return history;
    }

    // Sort elements by their position in the DOM to ensure correct order
    const sortedElements = Array.from(elements).sort((a, b) => {
        return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    // Count total attachments for progress tracking
    let totalAttachments = 0;
    for (const el of sortedElements) {
        const messageContainer = el.closest('.font-claude-message, .font-user-message') || el.parentElement;
        if (messageContainer) {
            const scopes = [messageContainer, messageContainer.parentElement, messageContainer.previousElementSibling, messageContainer.nextElementSibling].filter(Boolean);
            for (const scope of scopes) {
                const imgs = Array.from(scope.querySelectorAll('img')).filter(img => {
                    const src = img.src || "";
                    const alt = (img.alt || "").toLowerCase();
                    const isAvatar = alt.includes("avatar") || src.includes("avatar") || src.includes("profile") || img.closest('button[aria-label*="Copy"], [data-testid*="avatar"]');
                    const width = img.naturalWidth || parseInt(img.getAttribute("width") || "0", 10) || 0;
                    const height = img.naturalHeight || parseInt(img.getAttribute("height") || "0", 10) || 0;
                    const isTiny = (width && width < 40) || (height && height < 40);
                    return !isAvatar && !isTiny;
                });
                const pdfButtons = Array.from(scope.querySelectorAll('button')).filter(btn => {
                    const bText = btn.textContent.toLowerCase();
                    return (bText.includes('.pdf') || (bText.includes('pdf') && btn.clientWidth > 50) || btn.querySelector('div[class*="pdf"]'));
                });
                const pdfLinks = Array.from(scope.querySelectorAll('a[href*="document_pdf"], a[href*="/files/"]'));
                totalAttachments += imgs.length + pdfButtons.length + pdfLinks.length;
            }
        }
    }
    let attachmentIndex = 0;

    for (const [index, el] of sortedElements.entries()) {
        // PRIORITIZE our saved attribute
        const text = (el.getAttribute('data-capsule-text') || el.textContent).trim();
        if (!text || text === "Copy" || text === "Edit") continue;

        // Check for duplicates (common if multiple selectors match the same thing)
        if (history.length > 0 && history[history.length - 1].text === text) continue;

        let role = 'model';

        // Find the message container (parent of the text bubble usually)
        // Heuristic: Go up until we hit a semantic container or too far
        let messageContainer = el.closest('.font-claude-message, .font-user-message');

        if (!messageContainer) {
            // AGGRESSIVE FALLBACK: Look for potential row containers higher up
            let current = el;
            for (let i = 0; i < 7; i++) {
                if (current.parentElement) {
                    current = current.parentElement;
                    const isRow = current.classList.contains('grid') || current.classList.contains('flex') ||
                        current.getAttribute('data-test-id') || current.className.includes('message');
                    if (isRow) {
                        messageContainer = current;
                        if (current.clientWidth > 400) break;
                    }
                }
            }
            if (!messageContainer) messageContainer = el.parentElement;
        }

        // Improved Role Detection
        if (messageContainer) {
            if (
                messageContainer.classList.contains('font-user-message') ||
                messageContainer.querySelector('.font-user-message') ||
                el.getAttribute('data-test-id') === 'chat-query' ||
                messageContainer.innerText.includes('User') // Weak heuristic but sometimes works
            ) {
                role = 'user';
            } else {
                // Check if it's explicitly user by looking for non-claude attributes
                // Often user messages have a different background color context
                const computedStyle = window.getComputedStyle(messageContainer);
                if (computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && computedStyle.backgroundColor !== 'transparent') {
                    // User messages often have a background, Claude's often don't (they just sit there)
                    // But this is varying. 
                    // Let's rely on 'font-user-message' class existence in ancestry
                    if (el.closest('.font-user-message')) role = 'user';
                }
            }
        }

        // ===== MULTIMODAL: Extract attachments (Hybrid Approach) =====
        const attachments = [];

        if (includeAttachments && messageContainer) {
            // ROBUST: Search parent, siblings, and the message container itself
            const scopes = [messageContainer, messageContainer.parentElement, messageContainer.previousElementSibling, messageContainer.nextElementSibling].filter(Boolean);

            for (const scope of scopes) {
                // --- Part 1: Direct Image Extraction (Raw images in message) ---
                const rawImages = Array.from(scope.querySelectorAll('img')).filter(img => {
                    if (attachments.some(a => a._el === img)) return false;

                    const src = img.src || "";
                    const alt = (img.alt || "").toLowerCase();
                    const isAvatar = alt.includes("avatar") || src.includes("avatar") || src.includes("profile") || img.closest('button[aria-label*="Copy"], [data-testid*="avatar"]');
                    const width = img.naturalWidth || parseInt(img.getAttribute("width") || "0", 10) || 0;
                    const height = img.naturalHeight || parseInt(img.getAttribute("height") || "0", 10) || 0;
                    const isTiny = (width && width < 40) || (height && height < 40);

                    // Skip if thumbnail for a PDF/Doc (usually has .pdf in alt or specific container)
                    const isDocThumbnail = alt.endsWith('.pdf') || alt.includes('.pdf') || img.closest('button')?.querySelector('h3') || img.closest('a[href*="document_pdf"]');

                    return !isAvatar && !isTiny && !isDocThumbnail;
                });

                for (const img of rawImages) {
                    attachmentIndex++;
                    try {
                        const result = await mmFetchBlobAsBase64(img.src);
                        if (result.data) {
                            attachments.push({
                                type: 'image',
                                filename: `image_${history.length}_${attachments.length}.png`,
                                mime: result.mime || 'image/png',
                                base64: result.data,
                                _el: img
                            });
                        }
                    } catch (e) {
                        console.error("Claude direct image fail:", e);
                    }
                }

                // --- Part 2: Click-and-Extract (Documents like PDF, CSV, etc.) ---
                const docElements = Array.from(scope.querySelectorAll('button, a[href*="document_pdf"]')).filter(el => {
                    if (attachments.some(a => a._el === el)) return false;

                    const bText = el.textContent.toLowerCase();
                    const isDocThumbnail = el.querySelector('img') && (el.querySelector('img').alt.includes('.pdf') || el.querySelector('img').alt.includes('thumbnail'));
                    const hasExtension = !!(bText.split('.').pop().split(/\s/)[0] && EXTENSION_TO_MIME[bText.split('.').pop().split(/\s/)[0]]);

                    return isDocThumbnail || hasExtension || el.querySelector('h3') || (bText.includes('pdf') && el.clientWidth > 50);
                });

                for (const el of docElements) {
                    await mmWait(1500); // Pulse delay
                    attachmentIndex++;

                    try {
                        const h3 = el.querySelector('h3');
                        const img = el.querySelector('img');
                        let initialName = h3 ? h3.textContent.trim() : (img?.alt || el.textContent || `file_${attachmentIndex}`).trim();
                        initialName = initialName.replace(/\s+thumbnail$/, '').trim();

                        // CLICK to open preview modal
                        el.click();
                        await mmWait(2000);

                        const modal = document.querySelector('div[role="dialog"]') || document.body;
                        const dl = modal.querySelector('a[download], a[href*="/api/"][href*="/download"], a[href*="document_pdf"]');

                        let fileBase64 = null, resolvedMime = null, finalFilename = initialName;

                        // Extract from modal
                        if (dl && dl.href) {
                            const result = await mmFetchBlobAsBase64(dl.href);
                            if (result.data) {
                                fileBase64 = result.data;
                                resolvedMime = mimeFromFilename(initialName, result.mime);
                            }
                        }

                        // Text content fallback for non-PDFs/images in modal
                        if (!fileBase64) {
                            const contentDiv = modal.querySelector('.font-mono.whitespace-pre-wrap') ||
                                modal.querySelector('.font-mono') ||
                                modal.querySelector('pre');
                            const text = contentDiv?.innerText.trim();
                            if (text && text.length > 50) {
                                fileBase64 = btoa(unescape(encodeURIComponent(text)));
                                resolvedMime = mimeFromFilename(finalFilename, 'text/plain');
                            }
                        }

                        // CLOSE MODAL
                        const closeBtn = modal.querySelector('button[aria-label="Close"], button[aria-label*="close"]');
                        if (closeBtn) closeBtn.click();
                        else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        await mmWait(500);

                        if (fileBase64) {
                            attachments.push({
                                type: isPdfMime(resolvedMime) ? 'pdf' : (isImageMime(resolvedMime) ? 'image' : 'file'),
                                filename: finalFilename,
                                mime: resolvedMime || 'application/octet-stream',
                                base64: fileBase64,
                                _el: el
                            });
                        }
                    } catch (e) {
                        console.error("Claude doc extraction fail:", e);
                        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    }
                }
            }
        }

        // Cleanup internal markers
        attachments.forEach(a => delete a._el);

        history.push({ role, text, attachments });
    }

    return history;
}

/* ===== PERPLEXITY UTILS ===== */
function waitForMessagesFromPerplexity(timeout = 15000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            // Perplexity: user query is in h1 with group/query, wrapper has group/title; match either
            const msgs = document.querySelectorAll('[class*="group/query"], [class*="group/title"], .whitespace-pre-line');
            if (msgs.length > 0) {
                clearInterval(interval);
                resolve(msgs);
            }
            if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject("Timed out waiting for messages");
            }
        }, 500);
    });
}

async function getMessagesFromPerplexity() {
    const history = [];
    const globalAttachments = [];
    let attachmentIndex = 0;
    const processedNames = new Set(); // Prevent duplicate attachment clicks

    const isAttachmentPill = (pill) => {
        const text = (pill.textContent || "").toLowerCase().trim();
        if (text.match(/\d+\s+attachments/) || text.match(/^\+\d+$/) || text.match(/\+\s*\d+$/) || text.match(/\d+\s+sources/)) return false;

        const aria = (pill.getAttribute('aria-label') || "").toLowerCase();
        const html = pill.innerHTML || "";
        const isDoc = text.includes('.pdf') || aria.includes('pdf') || html.includes('pplx-icon-pdf') || html.includes('fa-file-pdf');
        const isImg = text.includes('.png') || text.includes('.jpg') || pill.querySelector('img.object-cover') || html.includes('pplx-icon-image') || html.includes('pplx-icon-photo');
        const hasExtension = text.match(/\.(pdf|png|jpg|jpeg|webp|gif|pptx)$/i);

        return isDoc || isImg || hasExtension;
    };

    async function processPill(pill) {
        if (!pill) return;

        try {
            const filenameEl = pill.querySelector('.truncate, .line-clamp-1, [class*="line-clamp"]') || pill;
            let givenName = filenameEl.textContent.trim();

            if (!givenName || !givenName.includes('.')) {
                const allText = pill.innerText || pill.textContent || "";

                // Clean any trailing '+1' from the inner text before matching
                const cleanText = allText.replace(/\+\s*\d+$/, '').trim();

                const match = cleanText.match(/([a-zA-Z0-9_.-]+\.(pdf|png|jpg|jpeg|gif))/i);
                if (match) givenName = match[1];
            }
            if (!givenName) {
                attachmentIndex++;
                givenName = `attachment_${attachmentIndex}`;
            }

            if (processedNames.has(givenName)) {
                return;
            }
            processedNames.add(givenName);


            const isPDF = givenName.toLowerCase().endsWith('.pdf') || pill.innerHTML.includes('pplx-icon-pdf') || pill.innerHTML.includes('fa-file-pdf');

            pill.click();

            // Dynamic wait for modal to open and content to render
            let modal = null;
            for (let attempt = 0; attempt < 10; attempt++) {
                modal = document.querySelector('div[role="dialog"]');
                if (modal) break;
                await mmWait(500);
            }
            if (!modal) modal = document.body;

            if (isPDF) {
                for (let attempt = 0; attempt < 25; attempt++) { // Up to 12.5 seconds for heavy PDFs
                    const viewer = modal.querySelector('#pdfViewer') || modal.querySelector('.react-pdf__Page__canvas');
                    const s3Link = modal.querySelector('a[href*="s3.amazonaws"]');
                    if (viewer || s3Link) {
                        await mmWait(1500); // Small buffer after detecting
                        break;
                    }
                    await mmWait(500);
                }
            } else {
                await mmWait(1500);
            }

            // re-query modal in case it changed
            modal = document.querySelector('div[role="dialog"]') || document.body;
            let capturedBase64 = null;
            let capturedMime = null;

            const dlLinks = Array.from(modal.querySelectorAll('a')).filter(a => {
                const href = a.href || "";
                return href.includes('s3.amazonaws') || href.includes('download') || a.textContent.toLowerCase().includes('download');
            });

            // If it's a PDF, Perplexity renders it as images inside #pdfViewer
            // E.g. <img src="blob:https://www.perplexity.ai/..." alt="Page 1">
            if (isPDF) {
                const pdfViewer = modal.querySelector('#pdfViewer');
                if (pdfViewer) {
                    // Try to scroll down to force lazy-loading of all pages
                    const pages = pdfViewer.querySelectorAll('.pdf-page, [data-page]');
                    for (const page of pages) {
                        page.scrollIntoView({ behavior: 'instant', block: 'center' });
                        await mmWait(400); // Give it a moment to load the image
                    }

                    // Scroll back to top just in case
                    pdfViewer.scrollTo(0, 0);
                    await mmWait(1000); // Wait for final rendering

                    // Grab all the blobs
                    const pageImgs = Array.from(pdfViewer.querySelectorAll('img[src^="blob:"]'));
                    if (pageImgs.length > 0) {
                        try {
                            const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
                            if (jsPDFClass) {
                                const pdf = new jsPDFClass({ orientation: 'portrait', unit: 'pt', format: 'a4' });
                                let addedPage = false;

                                for (let idx = 0; idx < pageImgs.length; idx++) {
                                    const img = pageImgs[idx];
                                    const res = await mmFetchBlobAsBase64(img.src);
                                    if (res && res.data) {
                                        const imgData = res.data.startsWith('data:')
                                            ? res.data
                                            : `data:${res.mime || 'image/png'};base64,${res.data}`;

                                        // Wait for image dimensions
                                        const tempImg = new Image();
                                        tempImg.src = imgData;
                                        await new Promise(r => tempImg.onload = r);

                                        const pageWidth = pdf.internal.pageSize.getWidth();
                                        const pageHeight = (tempImg.height * pageWidth) / tempImg.width;

                                        if (addedPage) pdf.addPage();
                                        // Use generic image format for addImage
                                        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
                                        addedPage = true;
                                    }
                                }

                                if (addedPage) {
                                    const dataUri = pdf.output('datauristring');
                                    capturedBase64 = dataUri.split(',')[1];
                                    capturedMime = 'application/pdf';
                                }
                            }
                        } catch (e) {
                            console.warn("Failed to stitch pdf blob images:", e);
                        }
                    } else {
                        // Sometimes it's canvases
                        const canvases = pdfViewer.querySelectorAll('canvas');
                        if (canvases.length > 0) {
                            capturedBase64 = await canvasesToPdfBase64();
                            if (capturedBase64) capturedMime = 'application/pdf';
                        }
                    }
                }
            }

            // Always prioritize the direct S3 download link if available (it often is for both PDFs and images)
            // In the provided DOM, images have <a target="_blank" href="https://ppl-ai-file-upload.s3.amazonaws...
            let primaryDownloadLink = null;



            if (dlLinks.length > 0) primaryDownloadLink = dlLinks[0].href;

            // For PDFs, there's often a specific download button with aria-label="Download PDF" which might not be an <a> tag
            const dlBtn = Array.from(modal.querySelectorAll('button')).find(b => {
                const aria = (b.getAttribute('aria-label') || "").toLowerCase();
                return aria.includes('download pdf');
            });

            // If it's a button, it might just trigger a browser download instead of an S3 link.
            // But usually the S3 link is somewhere on the page for both.

            if (primaryDownloadLink) {
                try {
                    const res = await mmFetchBlobAsBase64(primaryDownloadLink);
                    if (res && res.data) {
                        capturedBase64 = res.data;
                        capturedMime = res.mime || (isPDF ? 'application/pdf' : 'image/png');
                    }
                } catch (e) { console.warn("Failed to fetch from modal link:", e); }
            }

            if (!capturedBase64) {
                if (isPDF) {
                    const hasCanvas = modal.querySelector('.react-pdf__Page__canvas, canvas');
                    if (hasCanvas) {
                        await mmWait(1500);
                        capturedBase64 = await canvasesToPdfBase64(modal);
                        capturedMime = 'application/pdf';
                    }
                } else {
                    const mainImg = modal.querySelector('img:not([alt*="avatar"])');
                    if (mainImg && mainImg.src) {
                        const res = await mmFetchBlobAsBase64(mainImg.src);
                        if (res && res.data) {
                            capturedBase64 = res.data;
                            capturedMime = res.mime || 'image/png';
                        }
                    }
                }
            }

            if (capturedBase64) {
                globalAttachments.push({
                    type: isPDF ? 'pdf' : 'image',
                    filename: givenName || (isPDF ? 'document.pdf' : 'image.png'),
                    mime: capturedMime || (isPDF ? 'application/pdf' : 'image/png'),
                    base64: capturedBase64
                });
                console.log(`[Capsule] Successfully extracted pill base64`);
            } else {
                console.warn(`[Capsule] Failed to extract pill base64 from modal`);
            }

            const closeBtn = modal.querySelector('button[aria-label="Close"], button[title="Close"]');
            if (closeBtn) {
                closeBtn.click();
            } else {
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
            await mmWait(500); // Wait for modal out animation

        } catch (e) {
            console.error("Perplexity pill extraction fail:", e);
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
    }

    // Helper: extract attachments from the sources/attachments sidebar
    async function extractFromSidebar(targetAttachmentsArray) {
        let sidebar = null;
        for (let attempt = 0; attempt < 12; attempt++) {
            sidebar = document.querySelector('[class*="search-side-content"]');
            if (sidebar) break;
            await mmWait(500);
        }
        if (!sidebar) {
            console.warn('[Capsule] Sources/attachments sidebar failed to open.');
            return;
        }

        const links = Array.from(sidebar.querySelectorAll('a[href*="s3.amazonaws"], a[href*="ppl-ai-file-upload"]'));
        const seenHrefs = new Set();

        for (const link of links) {
            const href = link.href;
            if (!href || seenHrefs.has(href)) continue;
            seenHrefs.add(href);

            // Extract filename: prefer .font-medium, then .line-clamp-2, then URL decode
            let filename = '';
            const nameEl = link.querySelector('.font-medium, .line-clamp-2, [class*="font-medium"]');
            if (nameEl) filename = nameEl.textContent.trim();
            if (!filename) {
                // Fall back to URL-decoded filename from the S3 key
                try {
                    const urlPath = new URL(href).pathname;
                    filename = decodeURIComponent(urlPath.split('/').pop()) || 'attachment';
                } catch (_) { filename = 'attachment'; }
            }

            // Infer MIME and type from extension
            const resolvedMime = mimeFromFilename(filename, null);
            const fileType = isPdfMime(resolvedMime) ? 'pdf' : (isImageMime(resolvedMime) ? 'image' : 'file');

            if (processedNames.has(filename)) {
                continue;
            }
            processedNames.add(filename);

            try {
                const res = await mmFetchBlobAsBase64(href);
                if (res && res.data) {
                    targetAttachmentsArray.push({
                        type: fileType,
                        filename,
                        mime: res.mime || resolvedMime || 'application/octet-stream',
                        base64: res.data
                    });
                }
            } catch (e) {
                console.warn(`[Capsule] Failed to fetch sidebar attachment ${filename}:`, e);
            }
        }

        // Close the sidebar
        const closeBtn = sidebar.querySelector('button[aria-label="Close"]');
        if (closeBtn) closeBtn.click();
        else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await mmWait(600);
    }

    // 1. Process Standalone Pills (individual file attachments, not the aggregate "N attachments" button)
    const allStandalonePills = Array.from(document.querySelectorAll('button, [role="button"], a, .cursor-pointer'))
        .filter(pill => !pill.closest('[role="menu"]') && !pill.closest('[role="tablist"]') && pill.getAttribute('role') !== 'tab')
        .filter(pill => !pill.closest('nav, aside, [class*="sidebar"], [class*="history"]'))
        .filter(isAttachmentPill);

    // Deduplicate: filter out any pill that contains another matched pill 
    // to ensure we only click the innermost clickable element once.
    const standalonePills = allStandalonePills.filter(p => !allStandalonePills.some(child => child !== p && p.contains(child)));

    for (const pill of standalonePills) {
        if (pill.clientWidth > 0 && pill.clientWidth < 40) continue;
        await processPill(pill);
    }

    // 2. Handle the aggregate "N attachments" / "N sources" button globally
    // This button is shown at the top of a query and opens a sidebar listing ALL uploaded files.
    const aggregateBtns = Array.from(document.querySelectorAll('button, [role="button"]')).filter(b => {
        const t = (b.textContent || '').trim().toLowerCase();
        return t.match(/^\d+\s+(attachments?|sources?)$/);
    });

    if (aggregateBtns.length > 0 && globalAttachments.length === 0) {
        for (const btn of aggregateBtns) {
            btn.click();
            await extractFromSidebar(globalAttachments);
        }
    }

    // 3. Parse messages
    const selector = '[class*="group/query"], div[class*="prose"]';
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) {
        console.warn("⚠️ [Perplexity] No message elements found. Selectors may need tuning.");
    }

    const sortedElements = Array.from(elements).sort((a, b) => {
        return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    let hasAssignedGlobalAttachments = false;

    for (const el of sortedElements) {
        let text = (el.getAttribute('data-capsule-text') || el.textContent).trim();
        const role = (el.matches('[class*="group/query"]') || el.closest('[class*="group/title"]')) ? 'user' : 'model';
        const attachments = [];

        // 3a. Check for per-message "N sources" button (web search sources, may also contain attachments)
        // Search broadly in the page for any uncaught sources buttons at the same hierarchy level as this element.
        const msgParent = el.parentElement || el;
        const perMsgSourceBtn = Array.from(msgParent.querySelectorAll('button, [role="button"]')).find(b => {
            const t = (b.textContent || '').trim().toLowerCase();
            // Only match "N sources" here (aggregate "N attachments" handled globally above)
            return t.match(/^\d+\s+sources$/);
        });

        if (perMsgSourceBtn) {
            perMsgSourceBtn.click();
            await extractFromSidebar(attachments);
        }

        // Assign global attachments (like standalone pills) to the first user message we encounter
        if (!hasAssignedGlobalAttachments && role === 'user' && globalAttachments.length > 0) {
            attachments.push(...globalAttachments);
            hasAssignedGlobalAttachments = true;
        }

        // 4. Fallback: Inline Images specifically inside this message block
        const imgs = Array.from(el.querySelectorAll('img')).filter(img => {
            const src = img.src || "";
            const alt = (img.alt || "").toLowerCase();
            const isAvatar = alt.includes("avatar") || src.includes("avatar") || src.includes("profile");
            const w = img.naturalWidth || parseInt(img.getAttribute("width") || "0", 10) || 0;
            const h = img.naturalHeight || parseInt(img.getAttribute("height") || "0", 10) || 0;
            return !isAvatar && w > 50 && h > 50 && src.startsWith("http");
        });

        for (const [i, img] of imgs.entries()) {
            attachmentIndex++;
            try {
                const result = await mmFetchBlobAsBase64(img.src);
                if (result && result.data) {
                    attachments.push({
                        type: 'image',
                        filename: `inline_image_${history.length}_${i}.png`,
                        mime: result.mime || 'image/png',
                        base64: result.data
                    });
                }
            } catch (e) {
                console.warn("Perplexity inline image fail:", e);
            }
        }

        // If this message has no text AND no attachments, skip it entirely
        if ((!text || text.length < 2) && attachments.length === 0) continue;

        // Optionally prevent exact duplicates if there are no attachments
        if (attachments.length === 0 && history.length > 0 && history[history.length - 1].text === text) continue;

        history.push({ role, text, attachments });
    }

    // Fallback if we never found a user message to assign global attachments to
    if (!hasAssignedGlobalAttachments && globalAttachments.length > 0) {
        if (history.length > 0) {
            history[history.length - 1].attachments.push(...globalAttachments);
        } else {
            history.push({ role: 'user', text: '', attachments: globalAttachments });
        }
    }
    return history;
}


/* ===== DEEPSEEK UTILS ===== */
function waitForMessagesFromDeepSeek(timeout = 15000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            const msgs = document.querySelectorAll('div.ds-message._63c77b1');
            if (msgs.length > 0) {
                clearInterval(interval);
                resolve(msgs);
            }
            if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject("Timed out waiting for messages");
            }
        }, 500);
    });
}

async function getMessagesFromDeepSeek(options = { includeAttachments: true }) {
    const history = [];
    const messages = document.querySelectorAll('div.ds-message, div[class*="ds-message"]');

    const includeAttachments = options.includeAttachments !== false;

    // Count total attachments for progress tracking
    let totalAttachments = 0;
    for (const el of messages) {
        const imgs = Array.from(el.querySelectorAll('img')).filter(img => {
            const isAvatar = img.src.includes('avatar') || img.src.includes('profile');
            const isKnownImage = img.classList.contains('image') || img.src.includes('file-') || img.src.includes('myhuaweicloud');
            const hasSize = img.naturalWidth > 30 || (parseInt(img.getAttribute('width')) > 30);
            return !isAvatar && (isKnownImage || hasSize);
        });
        const attachmentButtons = el.querySelectorAll('div._76cd190');
        totalAttachments += imgs.length + attachmentButtons.length;
    }
    let attachmentIndex = 0;

    for (const el of messages) {
        const text = (el.getAttribute('data-capsule-text') ||
            el.querySelector('[data-capsule-text]')?.getAttribute('data-capsule-text') ||
            el.textContent).trim();

        const isAssistant = !!(el.querySelector('.ds-markdown') || el.querySelector('[class*="ds-markdown"]'));
        const role = isAssistant ? 'assistant' : 'user';

        const attachments = [];

        if (includeAttachments) {
            // 1. IMAGES
            // Improved selector: DeepSeek images often have .image class or specific src patterns
            const imgs = Array.from(el.querySelectorAll('img')).filter(img => {
                const isAvatar = img.src.includes('avatar') || img.src.includes('profile');
                const isKnownImage = img.classList.contains('image') || img.src.includes('file-') || img.src.includes('myhuaweicloud');
                const hasSize = img.naturalWidth > 30 || (parseInt(img.getAttribute('width')) > 30);
                return !isAvatar && (isKnownImage || hasSize);
            });

            for (const [i, img] of imgs.entries()) {
                attachmentIndex++;

                try {
                    const result = await mmFetchBlobAsBase64(img.src);
                    if (result.data) {
                        const filename = `image_${history.length}_${i}.png`;
                        const resolvedMime = mimeFromFilename(filename, result.mime);
                        attachments.push({
                            type: 'image',
                            filename: filename,
                            mime: resolvedMime || 'image/png',
                            base64: result.data
                        });
                    }
                } catch (e) {
                    console.error("DeepSeek image fail:", e);
                }
            }

            // 2. UNIFIED ATTACHMENTS (PDF & Images via buttons)
            const attachmentButtons = el.querySelectorAll('div._76cd190');
            for (const [i, btn] of Array.from(attachmentButtons).entries()) {
                attachmentIndex++;

                try {
                    const filenameEl = btn.querySelector('div.f3a54b52');
                    const filename = filenameEl ? filenameEl.textContent.trim() : `file_${i}`;
                    const resolvedMime = mimeFromFilename(filename, null);
                    const isFilePDF = isPdfMime(resolvedMime);
                    const isFileImage = isImageMime(resolvedMime);

                    btn.click();

                    if (isFilePDF) {
                        // PDF DYNAMIC WAIT: Poll for growth & stability
                        let sidebar = null;
                        let pages = [];
                        let canvases = [];
                        let lastPageCount = 0;
                        let lastCanvasCount = 0;
                        let stabilityCounter = 0;

                        for (let attempt = 0; attempt < 60; attempt++) {
                            sidebar = document.querySelector('div._519be07._3f79b51._27fc06b') || document.querySelector('div[class*="sidebar"]');
                            if (sidebar) {
                                pages = sidebar.querySelectorAll('.react-pdf__Page');
                                canvases = sidebar.querySelectorAll('.react-pdf__Page__canvas');
                                const cp = pages.length;
                                const cc = canvases.length;

                                if (cp > lastPageCount || cc > lastCanvasCount) {
                                    lastPageCount = cp;
                                    lastCanvasCount = cc;
                                    stabilityCounter = 0;
                                } else if (cp > 0 && cc >= cp) {
                                    stabilityCounter++;
                                }
                                if (stabilityCounter >= 3) break;
                            }
                            await mmWait(1000);
                        }

                        if (sidebar && pages.length > 0) {
                            const pdfBase64 = await canvasesToPdfBase64();
                            if (pdfBase64) {
                                attachments.push({ type: 'pdf', filename, mime: 'application/pdf', base64: pdfBase64 });
                            } else {
                                // Text fallback
                                let pdfText = "";
                                for (const p of pages) {
                                    const c = p.querySelector('.react-pdf__Page__textContent') || p;
                                    pdfText += c.innerText.trim() + "\n\n";
                                }
                                const trimmed = pdfText.trim();
                                if (trimmed) {
                                    attachments.push({ type: 'text', filename: filename + ".txt", mime: 'text/plain', base64: btoa(unescape(encodeURIComponent(trimmed))) });
                                }
                            }
                            // Close sidebar
                            const closeBtn = sidebar.querySelector('div._5d271a3') || sidebar.querySelector('div[role="button"]:has(svg path[d*="M14.1167"])');
                            if (closeBtn) closeBtn.click();
                            else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        }
                    } else if (isFileImage) {
                        // IMAGE DYNAMIC WAIT: Poll for img.image (max 4s)
                        let foundImg = null;
                        for (let attempt = 0; attempt < 8; attempt++) {
                            foundImg = document.querySelector('img.image');
                            if (foundImg) break;
                            await mmWait(500);
                        }

                        if (foundImg) {
                            const result = await mmFetchBlobAsBase64(foundImg.src);
                            if (result.data) {
                                const finalMime = mimeFromFilename(filename, result.mime || resolvedMime);
                                attachments.push({ type: 'image', filename, mime: finalMime, base64: result.data });
                            } else {
                                console.error(`[DEEPSEEK-DEBUG] Image capture failed for ${filename}`);
                            }
                            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        } else {
                            console.warn(`[DEEPSEEK-DEBUG] Image preview never appeared for ${filename}`);
                        }
                    } else {
                        // OTHER FILE TYPES (xlsx, js, csv, docx…)
                        // DeepSeek opens a text-based preview sidebar for non-PDF/non-image files.
                        // Wait for the sidebar/preview panel to appear, then grab text content.
                        let previewPanel = null;
                        for (let attempt = 0; attempt < 10; attempt++) {
                            previewPanel = document.querySelector('div._519be07._3f79b51._27fc06b') || document.querySelector('div[class*="sidebar"]');
                            if (previewPanel && previewPanel.innerText.trim().length > 0) break;
                            await mmWait(500);
                        }

                        if (previewPanel) {
                            const previewText = previewPanel.innerText.trim();
                            if (previewText) {
                                attachments.push({
                                    type: 'file',
                                    filename,
                                    mime: resolvedMime || 'text/plain',
                                    base64: btoa(unescape(encodeURIComponent(previewText)))
                                });
                            }
                            const closeBtn = previewPanel.querySelector('div._5d271a3') || previewPanel.querySelector('div[role="button"]:has(svg path[d*="M14.1167"])');
                            if (closeBtn) closeBtn.click();
                            else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        } else {
                            console.warn(`[DEEPSEEK-DEBUG] No preview panel for ${filename}`);
                            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        }
                    }
                    await mmWait(500);
                } catch (e) {
                    console.error("DeepSeek attachment fail:", e);
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }
            }
        }

        if (text || attachments.length > 0) {
            history.push({ role, text, attachments });
        }
    }

    return history;
}

/* ===== ANIMATIONS ===== */
function createAnimationStyles() {
    if (document.getElementById('capsule-animation-styles')) return;

    const style = document.createElement('style');
    style.id = 'capsule-animation-styles';
    style.textContent = `
    @keyframes capsule-shake {
      0% { transform: translate(-50%, -50%) rotate(0deg); }
      25% { transform: translate(-50%, -50%) rotate(-10deg); }
      75% { transform: translate(-50%, -50%) rotate(10deg); }
      100% { transform: translate(-50%, -50%) rotate(0deg); }
    }
    @keyframes capsule-pop {
      0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
    }
    @keyframes capsule-fly-up {
      0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      100% { transform: translate(calc(50vw - 50px), -100vh) scale(0.5); opacity: 0; }
    }
    .capsule-overlay {
        position: fixed;
        top: 50%;
        left: 50%;
        width: 80px;
        height: 80px;
        z-index: 99999;
        pointer-events: none;
        transform: translate(-50%, -50%);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .capsule-overlay img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    .capsule-shake {
        animation: capsule-shake 0.5s infinite ease-in-out;
    }
    .capsule-pop {
        animation: capsule-pop 0.5s forwards ease-out;
    }
    .capsule-fly-up {
        animation: capsule-fly-up 1.5s forwards ease-in-out;
    }
    .capsule-arrow {
        position: absolute;
        top: -50px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 40px;
        animation: capsule-bounce 1s infinite;
    }
    @keyframes capsule-bounce {
        0%, 100% { transform: translateX(-50%) translateY(0); }
        50% { transform: translateX(-50%) translateY(-10px); }
    }
    @keyframes capsule-breathing {
      0%, 100% { transform: scale(1); filter: drop-shadow(0 0 5px rgba(0, 0, 255, 0.4)); }
      50% { transform: scale(1.15); filter: drop-shadow(0 0 20px rgba(128, 200, 255, 0.9)); }
    }
    .capsule-breathing {
      animation: capsule-breathing 1.2s infinite ease-in-out !important;
      z-index: 100000 !important;
    }
  `;
    document.head.appendChild(style);
}

// Call immediately to inject styles
createAnimationStyles();

function showDroppingAnimation() {
    let overlay = document.getElementById('capsule-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'capsule-overlay';
        overlay.className = 'capsule-overlay';
        const img = document.createElement('img');
        if (isContextValid()) {
            img.src = chrome.runtime.getURL('capsule.png');
        } else {
            console.warn("🚫 Extension context invalidated. Please refresh the page.");
        }
        overlay.appendChild(img);
        document.body.appendChild(overlay);
    }
    overlay.className = 'capsule-overlay capsule-shake';
}

function showOpeningAnimation() {
    const overlay = document.getElementById('capsule-overlay');
    if (overlay) {
        overlay.className = 'capsule-overlay capsule-pop';
        setTimeout(() => {
            overlay.remove();
        }, 500);
    }
}

function hideDroppingAnimation() {
    const overlay = document.getElementById('capsule-overlay');
    if (overlay) {
        overlay.remove();
    }
}

/**
 * Shows a selector modal for attachments.
 * Returns a Promise that resolves with the selected attachments.
 */
function showAttachmentSelector(attachments) {
    return new Promise((resolve) => {
        // If no attachments, just resolve empty
        if (!attachments || attachments.length === 0) {
            resolve([]);
            return;
        }

        // Create Modal Element
        const modal = document.createElement('div');
        modal.id = 'capsule-attachment-selector';
        modal.className = 'capsule-modal-overlay';

        // Glassmorphism styling & animations
        modal.innerHTML = `
      <div class="capsule-modal-card">
        <div class="capsule-modal-header">
          <h3>Select Attachments</h3>
          <p>Choose which files to drop into the chat</p>
        </div>
        <div class="capsule-modal-body">
          <div class="capsule-select-all-row">
            <label class="capsule-checkbox-container">
              <input type="checkbox" id="capsule-select-all" checked>
              <span class="capsule-checkmark"></span>
              <span class="capsule-select-all-text">Select All</span>
            </label>
          </div>
          <div class="capsule-attachments-list">
            ${attachments.map((att, index) => `
              <div class="capsule-attachment-item">
                <label class="capsule-checkbox-container">
                  <input type="checkbox" class="capsule-att-checkbox" data-index="${index}" checked>
                  <span class="capsule-checkmark"></span>
                  <div class="capsule-att-info">
                    <span class="capsule-att-name" title="${att.filename}">${att.filename}</span>
                    <span class="capsule-att-meta">${att.type.toUpperCase()} • ${att.mime}</span>
                  </div>
                </label>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="capsule-modal-footer">
          <button id="capsule-cancel-drop" class="capsule-btn-secondary">Cancel</button>
          <button id="capsule-confirm-drop" class="capsule-btn-primary">Drop Selected</button>
        </div>
      </div>
      <style>
        .capsule-modal-overlay {
          all: initial; /* Reset inherited styles */
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          background: rgba(0, 0, 0, 0.7) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 2147483647 !important;
          opacity: 0 !important;
          transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
          box-sizing: border-box !important;
        }
        .capsule-modal-overlay.show {
          opacity: 1 !important;
        }
        .capsule-modal-card {
          margin: 0 !important;
          padding: 0 !important;
          background: #0f172a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 18px !important;
          width: 340px !important;
          max-width: 90vw !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8) !important;
          transform: translateY(30px) scale(0.95) !important;
          transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          overflow: hidden !important;
          color: #f8fafc !important;
          box-sizing: border-box !important;
          display: block !important;
        }
        .capsule-modal-card * {
          box-sizing: border-box !important;
        }
        .capsule-modal-overlay.show .capsule-modal-card {
          transform: translateY(0) scale(1) !important;
        }
        .capsule-modal-header {
          padding: 20px 24px 16px !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%) !important;
          width: 100% !important;
          display: block !important;
        }
        .capsule-modal-header h3 {
          margin: 0 !important;
          font-size: 18px !important;
          font-weight: 800 !important;
          letter-spacing: -0.025em !important;
          background: linear-gradient(135deg, #fff 0%, #94a3b8 100%) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          line-height: 1.2 !important;
        }
        .capsule-modal-header p {
          margin: 4px 0 0 !important;
          font-size: 12px !important;
          color: #94a3b8 !important;
          font-weight: 500 !important;
          line-height: normal !important;
        }
        .capsule-modal-body {
          padding: 16px 20px !important;
          max-height: 380px !important;
          overflow-y: auto !important;
          scrollbar-width: thin !important;
          scrollbar-color: #334155 transparent !important;
          width: 100% !important;
          display: block !important;
        }
        .capsule-modal-body::-webkit-scrollbar {
          width: 5px !important;
        }
        .capsule-modal-body::-webkit-scrollbar-thumb {
          background-color: #334155 !important;
          border-radius: 10px !important;
        }
        .capsule-select-all-row {
          padding-bottom: 12px !important;
          margin-bottom: 12px !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
          width: 100% !important;
          display: block !important;
        }
        .capsule-select-all-text {
          font-weight: 700 !important;
          color: #818cf8 !important;
          font-size: 14px !important;
          margin-left: 8px !important;
        }
        .capsule-attachments-list {
          display: flex !important;
          flex-direction: column !important;
          gap: 8px !important;
          width: 100% !important;
        }
        .capsule-attachment-item {
          background: rgba(255, 255, 255, 0.03) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
          border-radius: 12px !important;
          padding: 10px !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          width: 100% !important;
          display: block !important;
        }
        .capsule-attachment-item:hover {
          background: rgba(255, 255, 255, 0.06) !important;
          border-color: rgba(99, 102, 241, 0.4) !important;
          transform: translateX(4px) !important;
        }
        .capsule-checkbox-container {
          display: flex !important;
          align-items: center !important;
          position: relative !important;
          padding-left: 32px !important;
          cursor: pointer !important;
          font-size: 13px !important;
          user-select: none !important;
          width: 100% !important;
          margin: 0 !important;
        }
        .capsule-checkbox-container input {
          position: absolute !important;
          opacity: 0 !important;
          cursor: pointer !important;
          height: 0 !important;
          width: 0 !important;
        }
        .capsule-checkmark {
          position: absolute !important;
          top: 50% !important;
          left: 0 !important;
          transform: translateY(-50%) !important;
          height: 18px !important;
          width: 18px !important;
          background-color: rgba(0, 0, 0, 0.3) !important;
          border-radius: 5px !important;
          border: 1.5px solid rgba(255, 255, 255, 0.2) !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .capsule-checkbox-container:hover input ~ .capsule-checkmark {
          border-color: rgba(99, 102, 241, 0.6) !important;
          background-color: rgba(99, 102, 241, 0.1) !important;
        }
        .capsule-checkbox-container input:checked ~ .capsule-checkmark {
          background-color: #6366f1 !important;
          border-color: #6366f1 !important;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.3) !important;
        }
        .capsule-checkmark:after {
          content: "" !important;
          position: absolute !important;
          display: none !important;
        }
        .capsule-checkbox-container input:checked ~ .capsule-checkmark:after {
          display: block !important;
        }
        .capsule-checkbox-container .capsule-checkmark:after {
          left: 6px !important;
          top: 2px !important;
          width: 4px !important;
          height: 8px !important;
          border: solid white !important;
          border-width: 0 2px 2px 0 !important;
          transform: rotate(45deg) !important;
        }
        .capsule-att-info {
          display: flex !important;
          flex-direction: column !important;
          gap: 2px !important;
          margin-left: 10px !important;
          flex: 1 !important;
          min-width: 0 !important; /* Essential for flex truncation */
          overflow: hidden !important;
          text-align: left !important;
        }
        .capsule-att-name {
          font-weight: 600 !important;
          color: #f1f5f9 !important;
          font-size: 13.5px !important;
          display: block !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          width: 100% !important;
        }
        .capsule-att-meta {
          font-size: 10.5px !important;
          color: #64748b !important;
          font-weight: 500 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          width: 100% !important;
          opacity: 0.8 !important;
        }
        .capsule-modal-footer {
          padding: 16px 20px !important;
          background: rgba(0, 0, 0, 0.2) !important;
          border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
          display: flex !important;
          justify-content: flex-end !important;
          gap: 10px !important;
          width: 100% !important;
        }
        .capsule-btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
          color: white !important;
          border: none !important;
          padding: 10px 18px !important;
          border-radius: 12px !important;
          font-weight: 700 !important;
          font-size: 13px !important;
          cursor: pointer !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: 0 4px 10px rgba(99, 102, 241, 0.2) !important;
          width: auto !important;
        }
        .capsule-btn-primary:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 6px 15px rgba(99, 102, 241, 0.3) !important;
          filter: brightness(1.1) !important;
        }
        .capsule-btn-secondary {
          background: rgba(255, 255, 255, 0.03) !important;
          color: #94a3b8 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          padding: 10px 18px !important;
          border-radius: 12px !important;
          font-weight: 700 !important;
          font-size: 13px !important;
          cursor: pointer !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          width: auto !important;
        }
        .capsule-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #f1f5f9 !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }
      </style>
    `;

        document.body.appendChild(modal);

        // Force reflow
        modal.offsetHeight;
        modal.classList.add('show');

        const selectAll = modal.querySelector('#capsule-select-all');
        const checkboxes = modal.querySelectorAll('.capsule-att-checkbox');

        selectAll.onchange = () => {
            checkboxes.forEach(cb => cb.checked = selectAll.checked);
        };

        checkboxes.forEach(cb => {
            cb.onchange = () => {
                const allChecked = Array.from(checkboxes).every(c => c.checked);
                selectAll.checked = allChecked;
            };
        });

        const cleanup = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 400);
        };

        modal.querySelector('#capsule-cancel-drop').onclick = () => {
            cleanup();
            resolve(null);
        };

        modal.querySelector('#capsule-confirm-drop').onclick = () => {
            const selectedIndices = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => parseInt(cb.dataset.index));

            const selectedAttachments = selectedIndices.map(i => attachments[i]);
            cleanup();
            resolve(selectedAttachments);
        };

        modal.onclick = (e) => {
            if (e.target === modal) {
                cleanup();
                resolve(null);
            }
        };
    });
}

function showGenerationSuccessAnimation() {
    let overlay = document.getElementById('capsule-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'capsule-overlay';
        overlay.className = 'capsule-overlay';
        document.body.appendChild(overlay);
    }

    // Add arrow and image
    if (isContextValid()) {
        const imgUrl = chrome.runtime.getURL('capsule.png');
        overlay.innerHTML = `<img src="${imgUrl}" alt="capsule"><div class="capsule-arrow">⬆️</div>`;
    } else {
        overlay.innerHTML = `<div style="font-size: 30px">💊</div><div class="capsule-arrow">⬆️</div>`;
    }

    overlay.className = 'capsule-overlay capsule-fly-up';
    setTimeout(() => {
        overlay.remove();
    }, 1500);
}

/* ===== GENERATOR (SHARED) ===== */
function generateCapsuleFromMessages(msgs, tag = "auto-generated") {
    return new Promise(async (resolve, reject) => {
        if (!msgs || !msgs.length) {
            alert("No messages found to summarize.");
            reject("No messages");
            return;
        }

        // Check for test mode
        const { testMode } = await chrome.storage.local.get("testMode");

        // Map messages to include role and text/content
        const messages = msgs.map(m => ({
            role: m.role,
            content: m.text || m.content
        }));

        // Collect attachments from all messages
        const attachments = msgs.flatMap((m, idx) =>
            (m.attachments || []).map(a => ({
                type: a.type,
                filename: a.filename,
                mime: a.mime,
                base64: a.base64,
                message_index: idx
            }))
        );

        // Log any attachments that came through with empty/missing data
        attachments.forEach(a => {
            if (!a.base64) {
                console.warn(`[Capsule] Empty attachment detected: "${a.filename}" (type: ${a.type}, mime: ${a.mime})`);
            }
        });

        // TEST MODE: Preview data without backend call
        if (testMode) {
            console.log("%c🧪 TEST MODE - PREVIEW ONLY (No Backend Call)", "background: #4f46e5; color: white; font-size: 14px; font-weight: bold; padding: 8px;");

            console.log("%c📨 Conversation Messages:", "background: #10b981; color: white; font-weight: bold; padding: 4px;");
            messages.forEach((msg, i) => {
                console.log(`%c[${i + 1}] ${msg.role}:`, "font-weight: bold; color: #6366f1;", msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''));
            });

            if (attachments.length > 0) {
                console.log("%c📎 Attachments Detected:", "background: #f59e0b; color: white; font-weight: bold; padding: 4px;");
                attachments.forEach((att, i) => {
                    console.log(`%c[${i + 1}] ${att.filename}`, "font-weight: bold; color: #f59e0b;");
                    console.log(`   Type: ${att.type}`);
                    console.log(`   Mime: ${att.mime}`);
                    if (att.base64) {
                        console.log(`   Full Base64 Data (click to expand):`);
                        console.log(att.base64);
                        console.log(`   Preview: ${att.base64.substring(0, 200)}...`);
                    }
                });
            }

            console.log("%c🌍 Context Details:", "background: #6366f1; color: white; font-weight: bold; padding: 4px;");
            console.log({
                tag,
                platform: detectPlatform(),
                conversationId: getConversationId()
            });

            alert(`✅ TEST MODE: Preview logged to console\n\nMessages: ${messages.length}\nAttachments: ${attachments.length}\n\nCheck console for FULL base64 data.`);
            chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: true });
            resolve({ testMode: true, messages, attachments });
            return;
        }

        const sourcePlatform = detectPlatform();
        const conversationId = getConversationId();

        if (!isContextValid()) {
            alert("Extension context invalidated. Please refresh the page to continue using ContextCapsule.");
            reject("Context invalidated");
            return;
        }

        chrome.runtime.sendMessage(
            {
                type: "generateCapsule",
                payload: {
                    messages: messages,
                    attachments: attachments,
                    tag: tag,
                    extracted_from: sourcePlatform,
                    conversationId: conversationId
                }
            },
            (res) => {
                if (!res?.success) {
                    chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: false, error: res?.error });
                    reject(res?.error || "Unknown error");
                    return;
                }
                const capsuleId = res.data.capsule_id || res.data.id;
                if (capsuleId) {
                    chrome.storage.local.set({ lastCapsuleId: capsuleId });

                    // NEW: Store local mapping immediately so versioning UI triggers next time
                    if (conversationId) {
                        chrome.storage.local.get("localConvoMappings", ({ localConvoMappings = {} }) => {
                            localConvoMappings[conversationId] = capsuleId;
                            chrome.storage.local.set({ localConvoMappings });
                        });
                    }

                    showGenerationSuccessAnimation();
                    chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: true });
                    resolve(capsuleId);
                } else {
                    alert("Capsule created but no ID was returned.");
                    chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: false });
                    reject("No ID returned");
                }
            }
        );
    });
}

function generateVersionFromMessages(msgs, capsuleId) {
    return new Promise(async (resolve, reject) => {
        if (!msgs || !msgs.length) {
            alert("No messages found for versioning.");
            chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: false });
            reject("No messages");
            return;
        }

        // Check for test mode
        const { testMode } = await chrome.storage.local.get("testMode");

        const messages = msgs.map(m => ({
            role: m.role,
            content: m.text || m.content
        }));

        // Collect attachments from all messages
        const attachments = msgs.flatMap((m, idx) =>
            (m.attachments || []).map(a => ({
                type: a.type,
                filename: a.filename,
                mime: a.mime,
                base64: a.base64,
                message_index: idx
            }))
        );

        // Log any attachments that came through with empty/missing data
        attachments.forEach(a => {
            if (!a.base64) {
                console.warn(`[Capsule] Empty attachment (Version) detected: "${a.filename}" (type: ${a.type}, mime: ${a.mime})`);
            }
        });

        // TEST MODE: Preview data without backend call
        if (testMode) {
            console.log("%c🧪 TEST MODE (VERSION) - PREVIEW ONLY", "background: #4f46e5; color: white; font-size: 14px; font-weight: bold; padding: 8px;");

            console.log("%c📨 Version Messages:", "background: #10b981; color: white; font-weight: bold; padding: 4px;");
            messages.forEach((msg, i) => {
                console.log(`%c[${i + 1}] ${msg.role}:`, "font-weight: bold; color: #6366f1;", msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''));
            });

            if (attachments.length > 0) {
                console.log("%c📎 Attachments Detected:", "background: #f59e0b; color: white; font-weight: bold; padding: 4px;");
                attachments.forEach((att, i) => {
                    console.log(`%c[${i + 1}] ${att.filename}`, "font-weight: bold; color: #f59e0b;");
                });
            }

            console.log("%c🌍 Context Details:", "background: #6366f1; color: white; font-weight: bold; padding: 4px;");
            console.log({
                capsuleId,
                platform: detectPlatform()
            });

            alert(`✅ TEST MODE: Version preview logged to console\n\nMessages: ${messages.length}\nAttachments: ${attachments.length}`);
            chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: true });
            resolve({ testMode: true, messages, attachments });
            return;
        }

        const sourcePlatform = detectPlatform();

        if (!isContextValid()) {
            alert("Extension context invalidated. Please refresh the page.");
            reject("Context invalidated");
            return;
        }
        const conversationId = getConversationId();
        chrome.runtime.sendMessage({
            type: "createCapsuleVersion",
            payload: {
                capsuleId: capsuleId,
                messages: messages,
                attachments: attachments,
                extracted_from: sourcePlatform,
                conversationId: conversationId
            }
        }, (res) => {
            if (res?.success) {
                // NEW: Ensure local mapping is updated for versioning
                if (conversationId && capsuleId) {
                    chrome.storage.local.get("localConvoMappings", ({ localConvoMappings = {} }) => {
                        localConvoMappings[conversationId] = capsuleId;
                        chrome.storage.local.set({ localConvoMappings });
                    });
                }

                showGenerationSuccessAnimation();
                chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: true });
                resolve(res.data);
            } else {
                console.error("❌ Version creation failed:", res?.error);
                alert("Error: " + (res?.error || "Unknown error"));
                chrome.runtime.sendMessage({ type: "GENERATION_COMPLETE", success: false });
                reject(res?.error || "Unknown error");
            }
        });
    });
}

/**********************************************************
 * NEW CHAT MAPPING WATCHER (Shared)
 **********************************************************/
let pendingCapsuleId = null;
let watcherInterval = null;

function startConversationIdWatcher() {
    if (watcherInterval) return;

    watcherInterval = setInterval(() => {
        const convoId = getConversationId();
        if (convoId && pendingCapsuleId) {
            finalizeMapping(pendingCapsuleId, convoId);
            stopConversationIdWatcher();
        }
    }, 2000); // Check every 2s

    // Also stop after 2 minutes to avoid indefinite polling
    setTimeout(() => {
        if (watcherInterval) {
            stopConversationIdWatcher();
        }
    }, 120000);
}

function stopConversationIdWatcher() {
    if (watcherInterval) {
        clearInterval(watcherInterval);
        watcherInterval = null;
    }
}

function finalizeMapping(capsuleId, conversationId) {
    // Also store locally so version-choice fires for dropped capsules
    chrome.storage.local.get("localConvoMappings", ({ localConvoMappings = {} }) => {
        localConvoMappings[conversationId] = capsuleId;
        chrome.storage.local.set({ localConvoMappings });
    });

    chrome.runtime.sendMessage({
        type: "getCapsule",
        payload: { capsuleId, conversationId }
    }, (res) => {
        if (res?.success) {
            pendingCapsuleId = null;
        } else {
            console.error("⚠️ [Mapping] Finalization failed:", res?.error);
        }
    });
}
