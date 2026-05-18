(function () {
  const capturerByPlatform = new Map();

  globalThis.ContextCapsulePlatformCapturers = {
    register(platform, capturer) {
      capturerByPlatform.set(platform, capturer);
    },
    get(platform) {
      return capturerByPlatform.get(platform) || null;
    },
    async collect(platform, options) {
      const capturer = capturerByPlatform.get(platform);
      if (!capturer) {
        throw new Error(`Unsupported platform: ${platform}`);
      }
      await capturer.wait(options);
      return capturer.get(options);
    }
  };
})();
