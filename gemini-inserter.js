(() => {
    // Configuration
    const CAPSULE_ACTIVE = true; // Set to true when inserting a capsule
    const REAL_TRIGGER = "**ACTIVE CAPSULE CONTEXT"; // Trigger prefix
    const FAKE_INPUT = "Adding Capsule Context To Conversation 👀";


    let isProcessing = false; // Processing lock
    let generationCompleted = false; // Flag to gate masking until generation is complete

    // Helper to detect completion (Stop button gone, Send button visible)
    function waitForGeminiCompletion() {
        return new Promise(resolve => {
            const checkCompletion = () => {
                const stopBtn = document.querySelector('button[aria-label*="Stop"]');
                const sendBtn = document.querySelector('button[aria-label*="Send"]');

                if (!stopBtn && sendBtn && !sendBtn.disabled) {
                    return true;
                }
                return false;
            };

            // Check immediately first (in case already complete)
            if (checkCompletion()) {
                resolve();
                return;
            }

            const observer = new MutationObserver(() => {
                if (checkCompletion()) {
                    observer.disconnect();
                    resolve();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });
        });
    }

    // Listen for completion
    waitForGeminiCompletion().then(() => {
        generationCompleted = true;
        // Trigger a process pass immediately
        processAllMessages();
    });

    function maskAssistantVisually(el) {
        if (el.dataset.masked === "true") return;

        el.dataset.masked = "true";
        // Completely hide the assistant response container
        el.style.display = "none";
        el.setAttribute('style', (el.getAttribute('style') || '') + '; display: none !important;');
    }

    let pendingMask = false;

    function processAllMessages() {
        if (isProcessing || !CAPSULE_ACTIVE) return;
        isProcessing = true;

        // Find all message containers
        const messages = document.querySelectorAll('div[role="communication"], .message-content, .model-response-text, div[data-message-author-role], [class*="message"], [class*="Message"], user-query, model-response');

        messages.forEach(el => {
            const text = el.textContent || el.innerText || "";

            const isAI = el.getAttribute('data-message-author-role') === 'assistant' ||
                el.closest('[data-message-author-role="assistant"]') ||
                el.classList.contains('assistant-message') ||
                el.classList.contains('model-response-text') ||
                el.tagName.toLowerCase() === 'model-response' ||
                el.closest('model-response');

            const isHuman = !isAI && (
                el.getAttribute('data-message-author-role') === 'user' ||
                el.closest('[data-message-author-role="user"]') ||
                el.classList.contains('user-message') ||
                el.tagName.toLowerCase() === 'user-query' ||
                el.closest('user-query')
            );

            // 1. Detect and Mask Trigger
            if (isHuman && text.includes(REAL_TRIGGER)) {
                if (el.dataset.processed !== "true") {
                    // Save original text for the scraper (immune to CSS)
                    el.setAttribute('data-capsule-text', text);
                    // Extract the label from the marker if present
                    const tagMatch = text.match(/\*\*ACTIVE CAPSULE CONTEXT:(.*?)\*\*/);
                    const tagLabel = tagMatch && tagMatch[1] ? tagMatch[1] : null;
                    const label = tagLabel
                        ? `Adding Context of Capsule: ${tagLabel} 👀`
                        : "Adding capsule context to this conversation 👀";
                    el.setAttribute('data-capsule-label', label);
                    el.dataset.processed = "true";
                    el.dataset.capsuleInput = "true";
                    pendingMask = true;
                } else if (el.dataset.capsuleInput === "true") {
                    pendingMask = true;
                }
            }
            // 2. Mask Assistant Response immediately after a trigger
            else if (isAI && pendingMask) {
                maskAssistantVisually(el);

                if (generationCompleted) {
                    pendingMask = false;
                    el.dataset.processed = "true";
                }
            }
            else {
                // Not a capsule turn - mark as processed
                if (el.dataset.processed !== "true" && (isAI || isHuman)) {
                    el.dataset.processed = "true";
                }
            }
        });

        isProcessing = false;
    }

    // Add CSS for masked content styling
    const style = document.createElement('style');
    style.textContent = `
        [data-capsule-input="true"] {
            position: relative !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            min-height: 120px !important;
            width: 100% !important;
            background: transparent !important;
        }

        /* NUCLEAR HIDE: Remove all original UI children visually */
        [data-capsule-input="true"] > * {
            display: none !important;
        }

        /* Show the fake input via pseudo-element on the container */
        [data-capsule-input="true"]::after {
            content: attr(data-capsule-label);
            position: static !important;
            color: #fff !important;
            font-size: 20px !important;
            font-family: var(--google-sans-font, "Google Sans", sans-serif) !important;
            font-weight: 500;
            text-align: center;
        }

        @media (prefers-color-scheme: light) {
            [data-capsule-input="true"]::after { color: #333 !important; }
        }

        /* Ensure parent containers don't restrict centering */
        user-query:has([data-capsule-input="true"]),
        div:has(> [data-capsule-input="true"]) {
            display: flex !important;
            justify-content: center !important;
            width: 100% !important;
            background: transparent !important;
        }
    `;
    document.head.appendChild(style);

    // Initial processing - reduced delay for faster response
    setTimeout(processAllMessages, 10);

    // High-frequency polling - increased frequency to 20ms for near-instant redaction
    const pollInterval = setInterval(() => {
        if (CAPSULE_ACTIVE) {
            processAllMessages();
        } else {
            clearInterval(pollInterval);
        }
    }, 20);

    // Debounced mutation observer for better performance
    let debounceTimer;
    const observer = new MutationObserver(() => {
        if (CAPSULE_ACTIVE) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(processAllMessages, 50);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    // Listen for capsule activation
    window.activateCapsule = function () {
        processAllMessages();
    };

    window.deactivateCapsule = function () {
    };
})();
