/**
 * Public typography quality contract for shipped weights, platform rendering,
 * and a readable compact-text floor.
 */
export function checkPublicTypography({ failures, read, mustInclude, mustExclude }) {
  const surfaceIndex = read("src/styles/wireline-marketing-surfaces.css");
  const readableType = read("src/styles/marketing-readable-type.css");
  const documentFlow = read("src/styles/marketing-document-flow.css");
  const fonts = read("public/fonts.css");
  const index = read("index.html");

  mustInclude(
    "src/styles/wireline-marketing-surfaces.css",
    surfaceIndex,
    /@import "\.\/marketing-readable-type\.css";/,
    "public typography quality layer must be loaded",
  );

  const readableImport = surfaceIndex.indexOf('@import "./marketing-readable-type.css";');
  const longformImport = surfaceIndex.indexOf('@import "./landing-longform.css";');
  if (readableImport < 0 || readableImport < longformImport) {
    failures.push(
      "src/styles/wireline-marketing-surfaces.css: readable type must load after landing composition styles",
    );
  }

  for (const [pattern, description] of [
    [/--wl-public-label-size:\s*0\.75rem;/, "public labels must retain a 12px floor"],
    [
      /--wl-public-caption-size:\s*0\.8125rem;/,
      "public captions must retain a 13px floor",
    ],
    [
      /--wl-public-control-size:\s*0\.875rem;/,
      "public controls must retain a 14px floor",
    ],
    [/\.landing-stage__lane strong/, "work-lane labels must use the readable floor"],
    [/\.landing-console__channels li/, "channel labels must use the readable floor"],
    [/\.landing-demo__microcopy/, "demo disclosure must use the readable floor"],
    [/\.landing-home__price-badge/, "pricing badges must use the readable floor"],
  ]) {
    mustInclude(
      "src/styles/marketing-readable-type.css",
      readableType,
      pattern,
      description,
    );
  }

  mustExclude(
    "src/styles/marketing-readable-type.css",
    readableType,
    /font-weight:\s*(?:560|650|680|720)\s*;/,
    "public type layer must request only shipped static weights",
  );

  for (const [pattern, description] of [
    [/font-synthesis:\s*none;/, "font synthesis must remain disabled"],
    [/-webkit-font-smoothing:\s*auto;/, "font smoothing must follow the platform"],
    [/text-rendering:\s*auto;/, "text rendering must follow the platform"],
  ]) {
    mustInclude(
      "src/styles/marketing-document-flow.css",
      documentFlow,
      pattern,
      description,
    );
  }

  for (const weight of [500, 600, 700]) {
    mustInclude(
      "public/fonts.css",
      fonts,
      new RegExp(`font-weight:\\s*${weight};`),
      `self-hosted fonts must include weight ${weight}`,
    );
  }

  for (const family of ["Inter Tight display", "Inter body", "IBM Plex Mono labels"]) {
    if (!index.includes(family)) {
      failures.push(`index.html: missing preload rationale for ${family}`);
    }
  }
}
