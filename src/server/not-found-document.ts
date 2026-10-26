/** Unknown URLs reuse the homepage shell. Drop indexable head signals before send. */
function replaceMetaName(html: string, name: string, content: string): string {
  return html.replace(
    new RegExp(`<meta\\b[^>]*\\bname=(["'])${name}\\1[^>]*>`, "i"),
    `<meta name="${name}" content="${content}" />`,
  );
}

export function deindexFallbackDocument(html: string): string {
  return replaceMetaName(
    replaceMetaName(html, "robots", "noindex, nofollow"),
    "googlebot",
    "noindex, nofollow",
  )
    .replace(/<link\b[^>]*\brel=(["'])canonical\1[^>]*>/i, "")
    .replace(/<meta\b[^>]*\bproperty=(["'])og:url\1[^>]*>/i, "");
}
