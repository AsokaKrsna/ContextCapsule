(() => {
    // ==========================================
    // 🛡️ CLAUDE.AI PRIVACY CAPSULE (FINAL: HOMOGENEOUS)
    // ==========================================

    const TRIGGER_TEXT = "Adding capsule context to this conversation! Say Hi.";
    const ALT_TRIGGER = "ACTIVE CAPSULE CONTEXT";


    const styleId = "privacy-capsule-style-final";
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes capsuleFadeIn {
                from { opacity: 0; transform: translateY(4px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .privacy-mask-active {
                position: relative !important;
            }
            
            .privacy-mask-active > * {
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }

            /* --- SHARED CARD BASE (The Homogeneous Look) --- */
            .privacy-mask-active::after {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
                font-weight: 500;
                font-size: 14px;
                
                /* Uniform Shape for BOTH */
                border-radius: 12px; /* Smooth rounded corners */
                border: 1px solid #3f3f46;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
                
                z-index: 50;
                animation: capsuleFadeIn 0.4s ease-out forwards;
            }

            /* --- USER MASK SPECIFICS --- */
            .privacy-mask-active[data-privacy-label*="Context"] {
                display: block !important;
                height: 40px !important;
                min-height: 40px !important;
                overflow: hidden !important;
                width: 100% !important;
            }

            .privacy-mask-active[data-privacy-label*="Context"]::after {
                content: none !important;
            }

            .capsule-label-overlay {
                visibility: visible !important;
                opacity: 1 !important;
                display: flex !important;
                position: absolute !important;
                top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 51 !important;
                pointer-events: auto !important;
                /* User Theme: Dark Grey + Orange Accent */
                background: linear-gradient(145deg, #27272a 0%, #18181b 100%) !important;
                border-left: 4px solid #d97706 !important;
                border-radius: 12px !important;
                color: #e4e4e7 !important;
                font-weight: 600 !important;
                font-size: 14px !important;
                font-family: ui-sans-serif, system-ui, -apple-system, sans-serif !important;
                animation: capsuleFadeIn 0.4s ease-out forwards;
            }

        `;
        document.head.appendChild(style);
    }

    function findUserBubble(startNode) {
        let current = startNode;
        for (let i = 0; i < 8; i++) {
            if (!current) break;
            if (current.classList && current.classList.contains('bg-bg-300')) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }

    function getTextNodesContaining(root, needle) {
        const matches = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeValue && node.nodeValue.includes(needle)) {
                matches.push(node);
            }
        }
        return matches;
    }

    function maskElement(el, label) {
        if (!el) return;

        if (!el.hasAttribute('data-capsule-masked')) {
            el.setAttribute('data-capsule-masked', 'true');
            el.setAttribute('data-privacy-label', label);
            el.classList.add('privacy-mask-active');

            // Insert a real DOM overlay for the label (more robust than ::after)
            const overlay = document.createElement('div');
            overlay.className = 'capsule-label-overlay';
            overlay.textContent = label;
            el.appendChild(overlay);
        }
    }

    function scanAndMask() {
        const markers = [TRIGGER_TEXT, ALT_TRIGGER];

        for (const marker of markers) {
            const triggerNodes = getTextNodesContaining(document.body, marker);

            for (const triggerNode of triggerNodes) {
                const userBubble = findUserBubble(triggerNode.parentElement);
                if (userBubble) {
                    // Extract tag pointer from marker if present
                    const bubbleText = userBubble.textContent || "";
                    const tagMatch = bubbleText.match(/ACTIVE CAPSULE CONTEXT:([^\n*]+)/);
                    const rawTag = tagMatch && tagMatch[1] ? tagMatch[1].trim() : null;
                    const label = rawTag
                        ? `Adding Context of Capsule: ${rawTag} 👀`
                        : "Adding capsule context to this conversation 👀";
                    maskElement(userBubble, label);
                }
            }
        }
    }

    const observer = new MutationObserver((mutations) => {
        scanAndMask();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    scanAndMask();

    /* =====================================================
     * FILE INJECTION (page-world handler)
     * ===================================================== */
    window.addEventListener('CAPSULE_CLAUDE_INJECT_FILES', function (e) {
        const attachments = e.detail && e.detail.attachments;
        if (!attachments || !attachments.length) return;

        // Reconstruct File objects from base64 attachment data
        function base64ToFile(base64, filename, mime) {
            const clean = base64.includes(',') ? base64.split(',')[1] : base64;
            const bytes = atob(clean);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            return new File([arr], filename, { type: mime });
        }

        const files = attachments.map(a => base64ToFile(a.base64, a.filename, a.mime));

        const fileInput =
            document.getElementById('chat-input-file-upload-bottom') ||
            document.querySelector('[data-testid="file-upload"]') ||
            document.querySelector('input[type="file"]');

        if (!fileInput) return;

        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));

        // Override files in the PAGE's JS context — this IS visible to Claude's listeners
        Object.defineProperty(fileInput, 'files', {
            value: dt.files,
            configurable: true,
            writable: false
        });

        // Clear React value tracker if present (suppresses deduplication)
        if (fileInput._valueTracker) fileInput._valueTracker.setValue('');

        // Dispatch change + input — fired from page world, seen by page's addEventListener
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    window.addEventListener('CAPSULE_CLAUDE_SEND', function () {
        const sendButton = document.querySelector('button[aria-label*="Send Message"]');
        if (sendButton && !sendButton.disabled) {
            sendButton.click();
        } else {
            const textBox = document.querySelector('div[contenteditable="true"]');
            if (textBox) {
                const enterEvent = new KeyboardEvent('keydown', {
                    bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13
                });
                textBox.dispatchEvent(enterEvent);
            }
        }
    });


})();