import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Render only with the committed fonts, independent of machine font installs. */
export function renderBrandRaster(source, width) {
  return new Resvg(source, {
    fitTo: { mode: "width", value: width },
    font: {
      fontFiles: [
        resolve(root, "brand-work/fonts/InterTight-ExtraBold.ttf"),
        resolve(root, "brand-work/fonts/Inter-Regular.ttf"),
        resolve(root, "brand-work/fonts/Inter-SemiBold.ttf"),
        resolve(root, "brand-work/fonts/Inter-Bold.ttf"),
        resolve(root, "brand-work/fonts/Inter-ExtraBold.ttf"),
        resolve(root, "brand-work/fonts/IBMPlexMono-Bold.ttf"),
      ],
      loadSystemFonts: false,
      defaultFontFamily: "Inter Tight",
    },
  })
    .render()
    .asPng();
}
