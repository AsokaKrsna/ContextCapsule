(function () {
  globalThis.ContextCapsulePlatformInjectors.register("deepseek", async ({ summary, attachments, tagLabel, helpers }) => {
    try {
      if (attachments.length > 0) {
        const files = attachments.map(a => mmBase64ToFile(a.base64, a.filename, a.mime));
        helpers.dropFilesIntoDeepSeek(files);
      }

      const attachmentDelay = attachments.length > 0 ? 3000 : 0;
      setTimeout(() => {
        const textBox = document.querySelector('textarea#chat-input') ||
          document.querySelector('textarea[placeholder*="DeepSeek"]') ||
          document.querySelector('textarea');
        if (!textBox) {
          console.error("DeepSeek text box not found");
          return;
        }

        textBox.value = summary + "\n\n**ACTIVE CAPSULE CONTEXT:" + (tagLabel || "") + "**";
        textBox.dispatchEvent(new Event('input', { bubbles: true }));

        textBox.dispatchEvent(new Event('input', { bubbles: true }));
      }, attachmentDelay);
    } catch (err) {
      console.error("❌ Error injecting DeepSeek capsule:", err);
      showCustomModal("Failed: " + err.message);
    }
  });
})();
