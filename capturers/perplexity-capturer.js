(function () {
  globalThis.ContextCapsulePlatformCapturers.register("perplexity", {
    wait: waitForMessagesFromPerplexity,
    get: getMessagesFromPerplexity
  });
})();
