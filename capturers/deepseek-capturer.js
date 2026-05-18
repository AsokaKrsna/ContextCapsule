(function () {
  globalThis.ContextCapsulePlatformCapturers.register("deepseek", {
    wait: waitForMessagesFromDeepSeek,
    get: getMessagesFromDeepSeek
  });
})();
