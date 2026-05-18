(function () {
  function getAdapterKey(platform) {
    return (platform || "").startsWith("claude") ? "claude" : platform;
  }

  function getMessageCaptureAdapter(platform) {
    return globalThis.ContextCapsulePlatformCapturers.get(getAdapterKey(platform));
  }

  async function collectMessages(platform, options) {
    return globalThis.ContextCapsulePlatformCapturers.collect(getAdapterKey(platform), options);
  }

  function injectBridgeScript(platform) {
    if (!isContextValid()) return;

    const adapterKey = getAdapterKey(platform);
    const scriptByPlatform = {
      gemini: "gemini-inserter.js",
      claude: "claude-inserter.js",
      deepseek: "ds-inserter.js",
      perplexity: "perplexity-inserter.js"
    };
    const scriptName = scriptByPlatform[adapterKey];
    if (!scriptName) return;

    const bridgeScript = document.createElement("script");
    bridgeScript.src = chrome.runtime.getURL(scriptName);
    bridgeScript.onload = () => bridgeScript.remove();
    (document.head || document.documentElement).appendChild(bridgeScript);
  }

  globalThis.ContextCapsulePlatformAdapters = {
    getAdapterKey,
    getMessageCaptureAdapter,
    collectMessages,
    injectBridgeScript
  };
})();
