/**
 * Inject lightweight in-document navigation so Painter previews are click-through.
 */
export const DESIGN_PROTOTYPE_INTERACTIVITY_MARKER = "Wireline prototype interactivity";

const INTERACTIVITY_SCRIPT = `<script>/* ${DESIGN_PROTOTYPE_INTERACTIVITY_MARKER} */
(function () {
  function showPage(id) {
    document.querySelectorAll("[data-page]").forEach(function (el) {
      el.style.display = el.getAttribute("data-page") === id ? "" : "none";
    });
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", function (e) {
    var nav = e.target.closest("[data-nav-page]");
    if (nav) {
      e.preventDefault();
      showPage(nav.getAttribute("data-nav-page"));
      return;
    }
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = (a.getAttribute("href") || "").slice(1);
    if (!id) return;
    var page = document.querySelector('[data-page="' + id + '"]');
    if (page) {
      e.preventDefault();
      showPage(id);
      return;
    }
    var target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
})();</script>`;

/** Enable hash + data-page navigation inside sandboxed preview iframes. */
export function ensurePrototypeInteractivity(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed.includes(DESIGN_PROTOTYPE_INTERACTIVITY_MARKER)) return trimmed;
  if (/<\/body>/i.test(trimmed)) {
    return trimmed.replace(/<\/body>/i, `${INTERACTIVITY_SCRIPT}\n</body>`);
  }
  return `${trimmed}\n${INTERACTIVITY_SCRIPT}`;
}
