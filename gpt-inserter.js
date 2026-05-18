(() => {
  if (window.__capsuleInjectorActive) {
    return;
  }

  window.__capsuleInjectorActive = true;

  let CAPSULE = `**ACTIVE CAPSULE CONTEXT**`;

  // Listen for the summary data from content script
  window.addEventListener("CAPSULE_DATA", (event) => {
    if (event.detail?.summary) {
      CAPSULE = event.detail.summary;
    }
  });

  const originalFetch = window.fetch;

  window.fetch = async function (input, init) {
    try {
      const url = typeof input === "string" ? input : input.url || "";

      // Inject if URL contains "/conversation"
      if (url.includes("/conversation")) {
        let bodyObj = {};
        if (init?.body) {
          try {
            bodyObj = JSON.parse(init.body);
          } catch (err) {
            console.warn(err);
          }
        }

        if (!Array.isArray(bodyObj.messages)) {
          bodyObj.messages = [];
        }

        const capsuleMessage = {
          id: crypto.randomUUID(),
          author: { role: "user" },
          content: { content_type: "text", parts: [CAPSULE] }
        };

        bodyObj.messages.unshift(capsuleMessage);
        init = init || {};
        init.body = JSON.stringify(bodyObj);
      }
    } catch (e) {
      console.warn(e);
    }

    return originalFetch.call(this, input, init);
  };
})();
