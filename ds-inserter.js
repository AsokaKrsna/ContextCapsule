(() => {
    // Configuration
    const CAPSULE_ACTIVE = true;
    const REAL_TRIGGER = "**ACTIVE CAPSULE CONTEXT";
    const FAKE_INPUT = "Adding Capsule Context To Conversation 👀";

    let isProcessing = false;
    let generationCompleted = false;

    // Helper to detect completion
    function waitForDeepSeekCompletion() {
        return new Promise(resolve => {
            const checkCompletion = () => {
                const actionRow = document.querySelector('.db183363.ds-icon-button') ||
                    document.querySelector('.ds-icon-button') ||
                    document.querySelector('[class*="action-row"]');
                const stopIcon = document.querySelector('.ds-icon--stop');
                const sendIcon = document.querySelector('.ds-icon--send') || document.querySelector('div[role="button"] svg:not(.ds-icon--stop)');
                if (actionRow || (!stopIcon && sendIcon)) return true;
                return false;
            };
            if (checkCompletion()) { resolve(); return; }
            const observer = new MutationObserver(() => {
                if (checkCompletion()) { observer.disconnect(); resolve(); }
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        });
    }

    waitForDeepSeekCompletion().then(() => {
        generationCompleted = true;
        processAllMessages();
    });

    // Inject Shared Capsule Styles
    const style = document.createElement('style');
    style.textContent = `
        .ds-capsule-styled {
            font-size: 20px !important;
            text-align: center !important;
            font-family: inherit !important;
            font-weight: 500;
            padding: 40px 10px !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            position: relative !important;
            min-height: 120px !important;
        }

        /* NUCLEAR HIDE: Remove all original UI children visually */
        .ds-capsule-styled > * {
            display: none !important;
        }

        .ds-capsule-styled::after {
            content: attr(data-capsule-label);
            position: static !important;
            color: #333 !important;
            font-size: 20px !important;
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
            text-align: center;
        }

        @media (prefers-color-scheme: dark) {
            .ds-capsule-styled::after { color: #fff !important; }
        }
        
        html.dark .ds-capsule-styled::after, 
        body.dark .ds-capsule-styled::after {
            color: #fff !important;
        }

        div.ds-message._63c77b1:has(.ds-capsule-styled),
        div.ds-message._63c77b1:has(.ds-message-bubble:empty) {
            background: transparent !important;
            border: none !important;
            justify-content: center !important;
        }
        
        div.ds-message._63c77b1:has(.ds-capsule-styled) .ds-message-bubble {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            display: flex !important;
            justify-content: center !important;
        }


        /* Universal hide for all other elements ONLY in the capsule message turn */
        div:has(> .ds-capsule-styled) > *:not(.ds-capsule-styled),
        div:has(> .ds-message-bubble > .ds-capsule-styled) [class*="ds-flex"],
        div:has(> .ds-message-bubble > .ds-capsule-styled) [class*="action"],
        div:has(> .ds-message-bubble > .ds-capsule-styled) button,
        div:has(> .ds-message-bubble > .ds-capsule-styled) svg,
        /* Scoped classes from user's JSPaths to ONLY affect capsule turns */
        div:has(> .ds-capsule-styled) [class*="_0a3d93b"], 
        div:has(> .ds-capsule-styled) [class*="_965abe9"], 
        div:has(> .ds-capsule-styled) [class*="_54866f7"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
        }

        /* Ensure the capsule text itself is ALWAYS shown centrally */
        .ds-capsule-styled {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 100% !important;
            text-align: center !important;
        }

        /* Scoped hiding for masked assistant responses */
        [data-masked="true"], [data-masked="true"] * {
            display: none !important;
        }

        .ds-capsule-mask {
            position: absolute;
            inset: 0;
            background: var(--ds-main-bg, #fff);
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        @media (prefers-color-scheme: dark) {
            .ds-capsule-mask { background: #1e1e1e; }
        }
    `;
    document.head.appendChild(style);

    function maskAssistantVisually(el) {
        if (el.dataset.masked === "true") return;

        el.dataset.masked = "true";
        // Completely hide the assistant bubble as requested
        el.style.display = "none !important";
        // Fallback for cases where !important in JS style object doesn't work well:
        el.setAttribute('style', (el.getAttribute('style') || '') + '; display: none !important;');
    }

    let pendingMask = false;

    function processAllMessages() {
        if (isProcessing || !CAPSULE_ACTIVE) return;
        isProcessing = true;

        // Broaden selection: target generic ds-message containers or the specific one from user's JSPath
        const messages = document.querySelectorAll('div[class*="ds-message"], div._4f9bf79');

        messages.forEach(el => {
            const text = el.textContent || el.innerText || "";
            // Robust assistant detection: looks for markdown or typical assistant structure
            const isAssistant = !!(el.querySelector('.ds-markdown') || el.querySelector('[class*="ds-markdown"]'));
            const isUser = !isAssistant;

            // 1. Detect and Mask Trigger
            if (isUser && text.includes(REAL_TRIGGER)) {
                if (el.dataset.processed !== "true") {
                    const bubble = el.querySelector('.ds-message-bubble') || el;
                    // Save original text for the scraper (immune to CSS)
                    bubble.setAttribute('data-capsule-text', text);
                    // Extract the label from the marker if present
                    const tagMatch = text.match(/\*\*ACTIVE CAPSULE CONTEXT:(.*?)\*\*/);
                    const tagLabel = tagMatch && tagMatch[1] ? tagMatch[1] : null;
                    const label = tagLabel
                        ? `Adding Context of Capsule: ${tagLabel} 👀`
                        : "Adding capsule context to this conversation 👀";
                    bubble.setAttribute('data-capsule-label', label);
                    bubble.classList.add("ds-capsule-styled");
                    bubble.dataset.capsuleInput = "true";
                    el.dataset.processed = "true";
                    pendingMask = true;
                }
            }
            // 2. Hide Assistant Response immediately
            else if (isAssistant && pendingMask) {
                maskAssistantVisually(el);

                if (generationCompleted) {
                    pendingMask = false;
                    el.dataset.processed = "true";
                }
            }
            else {
                if (el.dataset.processed !== "true" && isUser) {
                    el.dataset.processed = "true";
                }
            }
        });

        isProcessing = false;
    }

    const pollInterval = setInterval(() => {
        if (CAPSULE_ACTIVE) processAllMessages();
        else clearInterval(pollInterval);
    }, 50);

    const observer = new MutationObserver(() => {
        if (CAPSULE_ACTIVE) processAllMessages();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    window.activateCapsule = () => {
        processAllMessages();
    };
})();
