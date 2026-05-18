(function () {
  globalThis.ContextCapsulePlatformInjectors.register("gemini", async ({ summary, attachments, tagLabel, helpers }) => {
    try {
      const hasAttachments = attachments.length > 0;
      const attachmentDelay = 1000;

      setTimeout(() => {
        try {
          const textBox = document.querySelector('rich-textarea div[contenteditable="true"]');
          if (!textBox) throw new Error("Text box not found");

          textBox.textContent = summary + "\n\n**ACTIVE CAPSULE CONTEXT:" + (tagLabel || "") + "**";
          textBox.dispatchEvent(new Event('input', { bubbles: true }));

          if (hasAttachments) {
            const files = attachments.map(a => mmBase64ToFile(a.base64, a.filename, a.mime));
            if (files.length > 0) helpers.dropFilesIntoGemini(files);
          }
        } catch (innerErr) {
          console.error("❌ Error injecting Gemini text:", innerErr);
        }
      }, attachmentDelay);
    } catch (err) {
      console.error("❌ Error injecting capsule:", err);
      showCustomModal("Failed to inject capsule: " + err.message);
    }
  });
})();
