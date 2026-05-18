(function () {
  globalThis.ContextCapsulePlatformInjectors.register("claude", async ({ summary, attachments, tagLabel, helpers }) => {
    try {
      if (attachments.length > 0) {
        const files = attachments.map(a => mmBase64ToFile(a.base64, a.filename, a.mime));
        helpers.dropFilesIntoClaude(files);
      }
      await mmWait(1500);

      const attachmentDelay = 3000;
      setTimeout(() => {
        const textBox = document.querySelector('div[contenteditable="true"]');
        if (!textBox) throw new Error("Claude text box not found");

        const fullContent = summary + "\n\n**ACTIVE CAPSULE CONTEXT:" + (tagLabel || "") + "**";
        textBox.focus();
        const success = document.execCommand('insertText', false, fullContent);

        if (!success || textBox.innerText.trim().length === 0) {
          textBox.innerHTML = `<p>${fullContent}</p>`;
          textBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, attachmentDelay);
    } catch (err) {
      console.error("❌ Error injecting Claude capsule:", err);
      alert("Failed: " + err.message);
    }
  });
})();
