(function () {
  globalThis.ContextCapsulePlatformInjectors.register("perplexity", async ({ summary, attachments, injectionSuffix, helpers }) => {
    try {
      const stopButton = document.querySelector('button[aria-label*="Cancel"], button[aria-label*="Stop"], button:has(svg use[href*="cancel"]), button:has(svg use[href*="stop"])');
      if (stopButton) {
        stopButton.click();
        console.log("🛑 [Perplexity] Stopped generation before injecting.");
      }

      let attachmentDelay = 0;
      if (attachments.length > 0) {
        const files = attachments.map(a => mmBase64ToFile(a.base64, a.filename, a.mime));
        helpers.dropFilesIntoPerplexity(files);
        attachmentDelay = 3000;
      }

      setTimeout(() => {
        const textBox = document.querySelector('div#ask-input[contenteditable="true"]') || document.querySelector('div[role="textbox"][aria-placeholder*="follow-up"]');
        if (!textBox) {
          console.error("Perplexity Lexical text box not found");
          return;
        }

        const fullContent = summary + injectionSuffix;
        textBox.focus();
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', fullContent);
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dataTransfer
        });
        textBox.dispatchEvent(pasteEvent);

        textBox.dispatchEvent(new Event('input', { bubbles: true }));
      }, attachmentDelay);
    } catch (err) {
      console.error("❌ Error injecting Perplexity capsule:", err);
      alert("Failed: " + err.message);
    }
  });
})();
