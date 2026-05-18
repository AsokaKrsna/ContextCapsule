(function () {
  const injectorByPlatform = new Map();

  globalThis.ContextCapsulePlatformInjectors = {
    register(platform, injector) {
      injectorByPlatform.set(platform, injector);
    },
    async inject(platform, payload) {
      const injector = injectorByPlatform.get(platform);
      if (!injector) {
        throw new Error(`Unsupported injection target: ${platform}`);
      }
      return injector(payload);
    }
  };
})();
