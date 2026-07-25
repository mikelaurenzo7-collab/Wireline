(function () {
  "use strict";

  var CONSENT_STORAGE_KEY = "wireline_marketing_measurement_consent";
  var CONSENT_EVENT = "wireline:marketing-measurement-consent";
  var META_PIXEL_ID = "1683492795830248";
  var PLAUSIBLE_DOMAIN = "trywireline.com";
  var PLAUSIBLE_SRC = "https://plausible.io/js/script.tagged-events.js";

  function noop() {}

  function isProductionHost() {
    return (
      window.location.hostname === "trywireline.com" ||
      window.location.hostname === "www.trywireline.com"
    );
  }

  function isLocalHost() {
    var host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "";
  }

  /**
   * Privacy-friendly product analytics, injected async so it can never delay
   * the app.
   *
   * It used to be a static `<script defer>` in index.html, which blocks
   * DOMContentLoaded and every deferred script queued after it — the app's own
   * module bundle included. A single unreachable third-party host therefore
   * held the entire UI blank until the connection timed out (measured: FCP
   * 12,936ms against a blocked host, versus 280ms without the tag). Injecting
   * it here keeps analytics identical — the inline stub in index.html queues
   * calls and the real script flushes `plausible.q` when it lands — while
   * making the request non-blocking. Skipped on localhost so local dev and
   * capture runs never wait on (or pollute) production analytics.
   */
  function loadPrivacyAnalytics() {
    if (isLocalHost()) return;
    if (window.__wirelinePlausibleLoaded) return;
    window.__wirelinePlausibleLoaded = true;

    var script = document.createElement("script");
    script.defer = true;
    script.setAttribute("data-domain", PLAUSIBLE_DOMAIN);
    script.src = PLAUSIBLE_SRC;
    document.head.appendChild(script);
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
    if (typeof window.fbq !== "function") window.fbq = noop;
    if (!window.dataLayer || typeof window.dataLayer.push !== "function") {
      window.dataLayer = { push: noop };
    }
  }

  function disableMarketingMeasurement() {
    var client = window.__wirelineMetaPixelClient;
    if (typeof client === "function") client("consent", "revoke");
    window.__wirelineMarketingMeasurementEnabled = false;
    window.fbq = noop;
    window._fbq = noop;
    if (window.dataLayer && typeof window.dataLayer.push === "function") {
      window.dataLayer.push = noop;
    }
  }

  function restoreExistingClient() {
    var client = window.__wirelineMetaPixelClient;
    if (typeof client !== "function") return false;
    window.fbq = client;
    window._fbq = client;
    window.__wirelineMarketingMeasurementEnabled = true;
    client("consent", "grant");
    client("track", "PageView");
    return true;
  }

  function loadMetaPixel() {
    if (!isProductionHost()) return;
    if (globalPrivacyControlEnabled()) {
      disableMarketingMeasurement();
      return;
    }
    if (readConsent() !== "granted") {
      disableMarketingMeasurement();
      return;
    }
    if (restoreExistingClient()) return;
    if (window.__wirelineMetaPixelLoaded) return;

    window.__wirelineMetaPixelLoaded = true;
    window.__wirelineMarketingMeasurementEnabled = true;

    var fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.__wirelineMetaPixelClient = fbq;
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
  loadPrivacyAnalytics();
  window.addEventListener(CONSENT_EVENT, function (event) {
    if (event && event.detail === "granted") {
      loadMetaPixel();
      return;
    }
    disableMarketingMeasurement();
  });
  loadMetaPixel();
})();
