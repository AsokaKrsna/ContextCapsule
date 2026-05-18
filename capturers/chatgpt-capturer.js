(function () {
  globalThis.ContextCapsulePlatformCapturers.register("chatgpt", {
    wait: waitForMessagesFromChatGPT,
    get: getMessagesFromChatGPT
  });
})();
