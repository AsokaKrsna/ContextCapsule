(function () {
  function waitForMessagesFromChatGPTImpl(timeout = 15000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const messages = document.querySelectorAll("article, [data-testid^='conversation-turn-'], [data-message-author-role], section[data-section-id]");
        if (messages.length > 0) {
          clearInterval(interval);
          resolve(messages);
        }
        if (Date.now() - start > timeout) {
          clearInterval(interval);
          const turnTest = document.querySelectorAll('[data-testid^="conversation-turn-"]').length;
          const authorTest = document.querySelectorAll('[data-message-author-role]').length;
          const sectionTest = document.querySelectorAll('section[data-section-id]').length;
          const articleTest = document.querySelectorAll('article').length;
          const errorStr = `Timed out waiting for messages (Found ${articleTest} art, ${turnTest} turns, ${authorTest} authors, ${sectionTest} sections)`;
          reject(errorStr);
        }
      }, 500);
    });
  }

  async function getMessagesFromChatGPTImpl(options = { includeAttachments: true }) {
    const turnElements = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"], [data-message-author-role], article, section[data-section-id]'))
      .filter((el, index, self) => !self.some((other, otherIdx) => otherIdx !== index && other.contains(el)));
    const messages = [];

    const includeAttachments = options.includeAttachments !== false;

    for (const turn of turnElements) {
      try {
        const roleContainer = turn.querySelector("[data-message-author-role]") ||
          (turn.hasAttribute("data-message-author-role") ? turn : null);
        let role = roleContainer?.getAttribute("data-message-author-role");

        if (!role) {
          if (turn.querySelector('[aria-label*="You"], [alt*="User avatar"]')) {
            role = "user";
          } else if (turn.tagName.toLowerCase() === 'section' || turn.querySelector('.markdown, .prose')) {
            role = "assistant";
          } else {
            role = "unknown";
          }
        }

        const textContainer = turn.querySelector(".markdown, .prose, [data-message-author-role='user']") || turn;

        let text = "";
        if (textContainer) {
          text = Array.from(textContainer.querySelectorAll("p, pre, li")).map(el => el.textContent).join("\n").trim()
            || textContainer.textContent.trim();
        } else {
          text = Array.from(turn.querySelectorAll("p, pre, li")).map(el => el.textContent).join("\n").trim();
        }

        const attachments = [];

        if (includeAttachments) {
          const allImages = turn.querySelectorAll('img');
          let imgIndex = 0;
          for (const img of allImages) {
            const src = img.getAttribute('src') || '';
            const alt = (img.getAttribute('alt') || '').toLowerCase();
            const width = img.naturalWidth || img.width;
            if (src.includes('/backend-api/estuary/content') && alt.includes('uploaded image') && width > 150) {
              try {
                const result = await mmFetchBlobAsBase64(src);
                attachments.push({
                  type: 'image',
                  filename: `image_${imgIndex + 1}.png`,
                  mime: result.mime || 'image/png',
                  base64: result.data
                });
                imgIndex++;
              } catch (e) {
                console.error("Failed to extract ChatGPT image:", e);
              }
            }
          }

          const allFileBtns = Array.from(
            turn.querySelectorAll('button[aria-label], a[download]')
          ).filter(btn => {
            const label = (btn.getAttribute('aria-label') || btn.getAttribute('download') || '').trim();
            if (!label) return false;
            const ext = label.split('.').pop().toLowerCase();
            return !!EXTENSION_TO_MIME[ext];
          });

          for (const btn of allFileBtns) {
            const label = (btn.getAttribute('aria-label') || btn.getAttribute('download') || '').trim();
            attachments.push({ _pdfButton: btn, _pdfName: label });
          }
        }

        if (text || attachments.length > 0) {
          messages.push({ role, text, attachments });
        }
      } catch (err) {
        console.error("Error parsing ChatGPT message:", err);
      }
    }

    const pendingPdfs = [];
    for (const msg of messages) {
      if (!msg.attachments) continue;
      for (let i = msg.attachments.length - 1; i >= 0; i--) {
        const att = msg.attachments[i];
        if (att._pdfButton) {
          pendingPdfs.push({ msgAttachments: msg.attachments, index: i, button: att._pdfButton, name: att._pdfName });
        }
      }
    }

    let totalAttachments = 0;
    for (const msg of messages) {
      if (msg.attachments) totalAttachments += msg.attachments.length;
    }

    if (pendingPdfs.length > 0 && isContextValid()) {
      await new Promise((resolve) => {
        if (window.__capsulePdfInterceptorInjected) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('gpt-pdf-interceptor.js');
        script.onload = () => {
          window.__capsulePdfInterceptorInjected = true;
          script.remove();
          resolve();
        };
        script.onerror = () => {
          console.error("Failed to inject PDF interceptor script");
          script.remove();
          resolve();
        };
        (document.head || document.documentElement).appendChild(script);
      });

      await mmWait(300);

      for (const pending of pendingPdfs) {
        try {
          const pdfData = await new Promise((resolve) => {
            let captured = false;

            const handler = async (event) => {
              if (captured) return;
              const url = event.detail?.url;

              if (url) {
                captured = true;
                window.dispatchEvent(new CustomEvent('CAPSULE_STOP_PDF_CAPTURE'));
                window.removeEventListener('CAPSULE_PDF_URL', handler);

                try {
                  const result = await mmFetchBlobAsBase64(url);
                  if (result && result.data) {
                    mmWait(500).then(() => closeChatGPTFileViewer());
                    resolve(result);
                  } else {
                    captured = false;
                    window.addEventListener('CAPSULE_PDF_URL', handler);
                  }
                } catch (e) {
                  console.error(`   ❌ [Content] Failed to fetch intercepted URL:`, e);
                  captured = false;
                  window.addEventListener('CAPSULE_PDF_URL', handler);
                }
              }
            };
            window.addEventListener('CAPSULE_PDF_URL', handler);
            window.dispatchEvent(new CustomEvent('CAPSULE_START_PDF_CAPTURE'));
            pending.button.click();

            setTimeout(async () => {
              if (captured) return;

              window.dispatchEvent(new CustomEvent('CAPSULE_STOP_PDF_CAPTURE'));
              window.removeEventListener('CAPSULE_PDF_URL', handler);

              try {
                const allIframes = Array.from(document.querySelectorAll('iframe'));
                for (const ifr of allIframes) {
                  const src = ifr.src || "";
                  if (src.includes('backend-api/estuary/content')) {
                    const res = await mmFetchBlobAsBase64(src);
                    if (res && res.data) {
                      closeChatGPTFileViewer();
                      resolve(res);
                      return;
                    }
                  }
                }
              } catch (e) {
                console.warn("   ⚠️ [Content] Iframe/Estuary fallback failed:", e);
              }

              console.warn(`   ⚠️ [Content] Both Interception and Iframe fallback failed for: ${pending.name}`);
              closeChatGPTFileViewer();
              resolve(null);
            }, 8000);
          });

          if (pdfData && pdfData.data) {
            const resolvedMime = mimeFromFilename(pending.name, pdfData.mime);
            pending.msgAttachments[pending.index] = {
              type: isPdfMime(resolvedMime) ? 'pdf' : (isImageMime(resolvedMime) ? 'image' : 'file'),
              filename: pending.name,
              mime: resolvedMime,
              base64: pdfData.data
            };
          } else {
            pending.msgAttachments.splice(pending.index, 1);
          }

          await mmWait(2000);
        } catch (e) {
          console.error("Failed to extract ChatGPT PDF:", e);
          pending.msgAttachments.splice(pending.index, 1);
        }
      }
    } else if (pendingPdfs.length > 0) {
      for (const pending of pendingPdfs) {
        pending.msgAttachments.splice(pending.index, 1);
      }
    }

    for (const msg of messages) {
      if (msg.attachments) {
        msg.attachments = msg.attachments.filter(a => !a._pdfButton);
      }
    }

    return messages;
  }

  globalThis.ContextCapsuleExtractors = globalThis.ContextCapsuleExtractors || {};
  globalThis.ContextCapsuleExtractors.chatgpt = {
    waitForMessagesFromChatGPT: waitForMessagesFromChatGPTImpl,
    getMessagesFromChatGPT: getMessagesFromChatGPTImpl
  };
})();
