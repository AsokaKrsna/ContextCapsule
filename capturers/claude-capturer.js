(function () {
  globalThis.ContextCapsulePlatformCapturers.register("claude", {
    wait: waitForMessagesFromClaude,
    get: getMessagesFromClaude
  });
})();
