(() => {
    if (window.__capsulePdfInterceptorActive) return;
    window.__capsulePdfInterceptorActive = true;

    let captureActive = false;

    // Listen for start/stop capture events from the content script
    window.addEventListener('CAPSULE_START_PDF_CAPTURE', () => {
        captureActive = true;
    });

    window.addEventListener('CAPSULE_STOP_PDF_CAPTURE', () => {
        captureActive = false;
    });

    const reportUrl = (url, source) => {
        if (!captureActive || !url) return;

        // FILTER: Ignore known analytics/tracking/telemetry hosts
        const isTracking = url.includes('ab.chatgpt.com') ||
            url.includes('statsig') ||
            url.includes('telemetry') ||
            url.includes('datadog') ||
            url.includes('sentry') ||
            url.includes('browser-intake');

        if (isTracking) {
            return;
        }

        window.dispatchEvent(new CustomEvent('CAPSULE_PDF_URL', { detail: { url, source } }));
    };

    // 1. window.open
    const originalOpen = window.open;
    window.open = function (url) {
        let result = originalOpen.apply(this, arguments);
        if (captureActive) {
            reportUrl(url, 'WindowOpen');
        }
        return result; // Don't block
    };

    // 2. HTMLAnchorElement.prototype.click
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (captureActive) {
            reportUrl(this.href, 'AnchorClick');
            // We usually don't want to block this as users might be clicking manually, 
            // but for automated capture we'll block to prevent multiple tabs.
            return;
        }
        return originalAnchorClick.apply(this, arguments);
    };

    // 3. fetch
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        if (captureActive) {
            let url = '';
            if (typeof input === 'string') url = input;
            else if (input instanceof Request) url = input.url;
            else if (input && typeof input.toString === 'function') url = input.toString();

            if (url) {
                reportUrl(url, 'Fetch');
            }
        }
        return originalFetch.apply(this, arguments);
    };

    // 4. XMLHttpRequest
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (captureActive && url) {
            reportUrl(url, 'XHR');
        }
        return originalXhrOpen.apply(this, arguments);
    };

    // 5. URL.createObjectURL
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
        const url = originalCreateObjectURL.apply(this, arguments);
        if (captureActive) {
            reportUrl(url, 'BlobURL');
        }
        return url;
    };

    window.dispatchEvent(new CustomEvent('CAPSULE_PDF_INTERCEPTOR_READY'));
})();
