(function () {
  "use strict";

  var CONSENT_STORAGE_KEY = "wireline_marketing_measurement_consent";
  var CONSENT_EVENT = "wireline:marketing-measurement-consent";
  var META_PIXEL_ID = "1683492795830248";

  function isProductionHost() {
    return (
      window.location.hostname === "trywireline.com" ||
      window.location.hostname === "www.trywireline.com"
    );
  }

  function globalPrivacyControlEnabled() {
    return navigator.globalPrivacyControl === true;
  }

  function readConsent() {
    try {
      return window.localStorage.getItem(CONSENT_STORAGE_KEY);
    } catch (_error) {
      return null;
    }
  }

  function installSafeStubs() {
    if (typeof window.fbq !== "function") window.fbq = function () {};
    if (!window.dataLayer || typeof window.dataLayer.push !== "function") {
      window.dataLayer = { push: function () {} };
    }
  }

  function revokeMetaPixelConsent() {
    if (!window.__wirelineMetaPixelLoaded || typeof window.fbq !== "function") return;
    window.fbq("consent", "revoke");
  }

  function loadMetaPixel() {
    if (!isProductionHost()) return;
    if (globalPrivacyControlEnabled()) {
      revokeMetaPixelConsent();
      return;
    }
    if (readConsent() !== "granted") {
      revokeMetaPixelConsent();
      return;
    }
    if (window.__wirelineMetaPixelLoaded) {
      window.fbq("consent", "grant");
      return;
    }

    window.__wirelineMetaPixelLoaded = true;

    var fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    var firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode.insertBefore(script, firstScript);

    window.fbq("init", META_PIXEL_ID);
    window.fbq("consent", "grant");
    window.fbq("track", "PageView");
  }

  installSafeStubs();
  window.addEventListener(CONSENT_EVENT, function (event) {
    if (!event) return;
    if (event.detail === "granted") loadMetaPixel();
    if (event.detail === "denied") revokeMetaPixelConsent();
  });
  loadMetaPixel();
})();
