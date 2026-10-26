/** Unknown URLs reuse the homepage shell. Drop indexable head signals before send. */
export function deindexFallbackDocument(html: string): string {
  return html
    .replace(
      /<meta name="robots" content="[^"]*"\s*\/>/,
      '<meta name="robots" content="noindex, nofollow" />',
    )
    .replace(
      /<meta name="googlebot" content="[^"]*"\s*\/>/,
      '<meta name="googlebot" content="noindex, nofollow" />',
    )
    .replace(/\n?[ \t]*<link rel="canonical" href="[^"]*"\s*\/>/, "")
    .replace(/\n?[ \t]*<meta property="og:url" content="[^"]*"\s*\/>/, "");
}
