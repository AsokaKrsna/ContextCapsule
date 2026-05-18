(() => {
    // ==========================================
    // Perplexity.ai privacy capsule (mask trigger + user/assistant bubbles)
    // ==========================================

    const TRIGGER_TEXT = "**ACTIVE CAPSULE CONTEXT**";

    const styleId = "privacy-capsule-style-perplexity";
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

            .privacy-mask-active::after {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
                font-weight: 500;
                font-size: 14px;
                border-radius: 12px;
                border: 1px solid #3f3f46;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
                z-index: 50;
                animation: capsuleFadeIn 0.4s ease-out forwards;
            }

            .privacy-mask-active[data-privacy-label*="Context"] {
                display: block !important;
                height: 56px !important;
                min-height: 56px !important;
                overflow: hidden !important;
                width: 100% !important;
            }

            .privacy-mask-active[data-privacy-label*="Context"]::after {
                content: "Capsule Context Initiated";
                background: linear-gradient(145deg, #27272a 0%, #18181b 100%);
                border-left: 4px solid #d97706;
                color: #e4e4e7;
                font-weight: 600;
            }

            .privacy-mask-active[data-privacy-label*="Response"] {
                display: block !important;
                height: 56px !important;
                overflow: hidden !important;
                margin-top: 8px !important;
                margin-bottom: 12px !important;
            }

            .privacy-mask-active[data-privacy-label*="Response"]::after {
                content: "Capsule Injection Successful";
                background: #1f1f22;
                border-left: 4px solid #8b5cf6;
                color: #a1a1aa;
            }
        `;
        document.head.appendChild(style);
    }

    function findUserBubble(startNode) {
        if (!startNode) return null;
        // Perplexity: user message is wrapped by div with group/title (or contains h1 with group/query)
        const byTitle = startNode.closest ? startNode.closest('[class*="group/title"]') : null;
        if (byTitle) return byTitle;
        const byQuery = startNode.closest ? startNode.closest('[class*="group/query"]') : null;
        if (byQuery) return byQuery.parentElement || byQuery;
        let current = startNode;
        for (let i = 0; i < 10; i++) {
            if (!current) break;
            const c = current.className && typeof current.className === 'string' ? current.className : '';
            if (c.includes('user') || c.includes('User') || current.getAttribute?.('data-role') === 'user') return current;
            current = current.parentElement;
        }
        return startNode.closest('[class*="message"], [class*="bubble"], article') || startNode.parentElement;
    }

    function getTextNodesContaining(root, needle) {
        const matches = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeValue && node.nodeValue.includes(needle)) matches.push(node);
        }
        return matches;
    }

    function isInSidebar(el) {
        if (!el) return false;
        let node = el;
        while (node && node !== document.body) {
            if (!node.tagName) { node = node.parentElement; continue; }
            const tag = node.tagName.toLowerCase();
            if (tag === 'nav' || tag === 'aside') return true;
            const cls = (node.className && typeof node.className === 'string') ? node.className : '';
            if (cls.includes('sidebar') || cls.includes('history') || cls.includes('sidenav')) return true;
            const role = node.getAttribute ? node.getAttribute('role') : null;
            if (role === 'navigation' || role === 'complementary') return true;
            node = node.parentElement;
        }
        return false;
    }

    function maskElement(el, label) {
        if (!el) return;
        if (isInSidebar(el)) return;
        if (!el.classList.contains('privacy-mask-active')) el.classList.add('privacy-mask-active');
        el.setAttribute('data-privacy-label', label);
    }

    function elementIsAfter(a, b) {
        const position = b.compareDocumentPosition(a);
        return Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    function findNextAssistantMessageContainer(triggerNode) {
        // Perplexity: AI response is in a div with class "prose" (e.g. prose dark:prose-invert)
        const proseDivs = document.querySelectorAll('div[class*="prose"]');
        const nextProse = Array.from(proseDivs).find((el) => elementIsAfter(el, triggerNode));
        if (nextProse) {
            if (nextProse.getAttribute?.('contenteditable') === 'true' || nextProse.id === 'ask-input') return null;
            return nextProse;
        }
        const candidates = document.querySelectorAll('[class*="message"], [class*="Message"], [class*="assistant"], [class*="bubble"], article');
        const nextEl = Array.from(candidates).find((el) => elementIsAfter(el, triggerNode));
        if (!nextEl) return null;
        const tag = nextEl.tagName ? nextEl.tagName.toLowerCase() : '';
        if (tag === 'textarea' || nextEl.getAttribute?.('contenteditable') === 'true') return null;
        return nextEl;
    }

    function scanAndMask() {
        const triggerNodes = getTextNodesContaining(document.body, TRIGGER_TEXT);
        if (!triggerNodes.length) return;

        // Ignore trigger text that appears in sidebar/nav previews of other threads —
        // those nodes would cause the current chat's AI response to be wrongly masked.
        const mainTriggerNodes = triggerNodes.filter(n => !isInSidebar(n.parentElement));
        if (!mainTriggerNodes.length) return;

        for (const triggerNode of mainTriggerNodes) {
            const userBubble = findUserBubble(triggerNode.parentElement);
            maskElement(userBubble, "Context");
        }
        for (const triggerNode of mainTriggerNodes) {
            const aiContainer = findNextAssistantMessageContainer(triggerNode);
            maskElement(aiContainer, "Response");
        }
    }

    const observer = new MutationObserver(() => { scanAndMask(); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scanAndMask();

    /* ========== FILE INJECTION (page-world) ========== */
    window.addEventListener('CAPSULE_PERPLEXITY_INJECT_FILES', function (e) {
        const attachments = e.detail && e.detail.attachments;
        if (!attachments || !attachments.length) return;

        function base64ToFile(base64, filename, mime) {
            const clean = base64.includes(',') ? base64.split(',')[1] : base64;
            const bytes = atob(clean);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            return new File([arr], filename, { type: mime });
        }

        const files = attachments.map(a => base64ToFile(a.base64, a.filename, a.mime));

        const fileInput = document.querySelector('[class*="file-upload"] input[type="file"]') ||
            document.querySelector('input[type="file"][accept*="image"], input[type="file"][accept*="pdf"]') ||
            document.querySelector('input[type="file"]');

        if (!fileInput) {
            console.warn('[Perplexity] File input not found for attachment injection.');
            return;
        }

        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        Object.defineProperty(fileInput, 'files', { value: dt.files, configurable: true, writable: false });
        if (fileInput._valueTracker) fileInput._valueTracker.setValue('');
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[Perplexity] Injected', files.length, 'file(s) via page-world handler.');
    });
})();
