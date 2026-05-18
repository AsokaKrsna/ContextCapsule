(function () {
  globalThis.ContextCapsulePlatformCapturers.register("gemini", {
    wait: waitForMessagesFromGemini,
    get: getMessagesFromGemini
  });
})();
