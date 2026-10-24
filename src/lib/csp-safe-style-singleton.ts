/**
 * CSP-safe drop-in for `react-style-singleton` (aliased in vite.config.ts).
 *
 * Radix Dialog/Sheet lock page scroll through react-remove-scroll, which asks
 * react-style-singleton to append a `<style>` element containing a per-open
 * `padding-right` value. Production CSP keeps `style-src-elem` to 'self' plus
 * fixed hashes, so that element was blocked: the console logged a violation
 * and the background kept scrolling under open menus and dialogs.
 *
 * Constructable stylesheets adopted by the document are CSSOM, not `<style>`
 * elements, so `style-src-elem` does not govern them. The CSP stays strict and
 * scroll lock works. Browsers without `adoptedStyleSheets` keep the original
 * behaviour, which is what they had before.
 */
import { useEffect, type FC } from "react";

type Sheet = { add: (style: string) => void; remove: () => void };

function supportsAdoptedSheets(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof CSSStyleSheet !== "undefined" &&
    "adoptedStyleSheets" in Document.prototype &&
    "replaceSync" in CSSStyleSheet.prototype
  );
}

function adoptedSheet(): Sheet {
  let counter = 0;
  let sheet: CSSStyleSheet | null = null;
  return {
    add(style) {
      if (counter === 0) {
        try {
          sheet = new CSSStyleSheet();
          sheet.replaceSync(style);
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        } catch {
          sheet = null;
        }
      }
      counter++;
    },
    remove() {
      counter--;
      if (!counter && sheet) {
        const current = sheet;
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
          (item) => item !== current,
        );
        sheet = null;
      }
    },
  };
}

function styleTagSheet(): Sheet {
  let counter = 0;
  let tag: HTMLStyleElement | null = null;
  return {
    add(style) {
      if (counter === 0 && typeof document !== "undefined") {
        tag = document.createElement("style");
        tag.appendChild(document.createTextNode(style));
        (document.head || document.getElementsByTagName("head")[0]).appendChild(tag);
      }
      counter++;
    },
    remove() {
      counter--;
      if (!counter && tag) {
        tag.parentNode?.removeChild(tag);
        tag = null;
      }
    },
  };
}

export const stylesheetSingleton = (): Sheet =>
  supportsAdoptedSheets() ? adoptedSheet() : styleTagSheet();

export const styleHookSingleton = () => {
  const sheet = stylesheetSingleton();
  return (styles: string, isDynamic?: boolean) => {
    useEffect(() => {
      sheet.add(styles);
      return () => sheet.remove();
      // Matches the upstream contract: only dynamic styles re-apply on change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [styles && isDynamic]);
  };
};

export const styleSingleton = () => {
  const useStyle = styleHookSingleton();
  const Sheet: FC<{ styles: string; dynamic?: boolean }> = ({ styles, dynamic }) => {
    useStyle(styles, dynamic);
    return null;
  };
  return Sheet;
};
