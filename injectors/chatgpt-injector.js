(function () {
  globalThis.ContextCapsulePlatformInjectors.register("chatgpt", async ({ summary, attachments, visibleTrigger, helpers }) => {
    if (!isContextValid()) {
      console.warn("🚫 Extension context invalidated.");
      return;
    }
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("gpt-inserter.js");
    script.onload = () => {
      window.dispatchEvent(new CustomEvent("CAPSULE_DATA", {
        detail: {
          summary,
          tagPointer: visibleTrigger
        }
      }));
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    const attachmentDelay = attachments.length > 0 ? 3000 : 0;
    if (attachments.length > 0) {
      const files = attachments.map(a => mmBase64ToFile(a.base64, a.filename, a.mime));
      helpers.dropFilesIntoChatGPT(files);
    }

    setTimeout(() => {
      try {
        const textBox = document.querySelector('#prompt-textarea');
        if (!textBox) {
          console.warn("⚠️ ChatGPT prompt textarea not found");
          return;
        }

        const confirmationMsg = visibleTrigger;
        textBox.focus();
        document.execCommand('insertText', false, confirmationMsg);

        if (textBox.innerText.trim() !== confirmationMsg && textBox.value !== confirmationMsg) {
          if (textBox.tagName.toLowerCase() === 'textarea') {
            textBox.value = confirmationMsg;
          } else {
            textBox.innerHTML = `<p>${confirmationMsg}</p>`;
          }
          textBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (err) {
        console.error("❌ Error during ChatGPT injection:", err);
      }
    }, 1000 + attachmentDelay);
  });
})();
