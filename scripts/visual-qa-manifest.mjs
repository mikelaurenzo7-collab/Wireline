import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  AUTHENTICATED_ROUTE_TEMPLATES,
  FULL_SCREENSHOT_COUNT,
  PUBLIC_ROUTES,
  VISUAL_QA_SCHEMA_VERSION,
  VISUAL_QA_VIEWPORTS,
  captureKey,
  expectedModalPolicy,
} from "./visual-qa-matrix.mjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function readPngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function sameStringArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function sameViewportArray(actual) {
  return (
    Array.isArray(actual) &&
    actual.length === VISUAL_QA_VIEWPORTS.length &&
    actual.every((viewport, index) => {
      const expected = VISUAL_QA_VIEWPORTS[index];
      return (
        viewport?.name === expected.name &&
        viewport?.width === expected.width &&
        viewport?.height === expected.height
      );
    })
  );
}

function errorForCapture(record, message) {
  return `${record?.mode || "unknown"} ${record?.viewport || "unknown"} ${record?.routeTemplate || record?.route || "unknown"}: ${message}`;
}

/**
 * Validate a completed visual-QA manifest. `checkFiles: false` is useful for
 * hermetic contract tests; the production gate always verifies the PNG files.
 */
export function validateVisualQaManifest(
  manifest,
  { manifestDir = process.cwd(), checkFiles = true } = {},
) {
  const errors = [];

  if (!manifest || typeof manifest !== "object") return ["Manifest must be a JSON object."];
  if (manifest.schemaVersion !== VISUAL_QA_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${VISUAL_QA_SCHEMA_VERSION}; received ${String(manifest.schemaVersion)}.`,
    );
  }
  if (manifest.focus !== "full") errors.push("focus must be 'full'.");
  if (manifest.captureMode !== "settled-viewport") {
    errors.push("captureMode must be 'settled-viewport'.");
  }
  if (manifest.fullPageEvidence !== false) {
    errors.push("fullPageEvidence must be false; stitched full-page images are not source truth.");
  }
  if (manifest.captureComplete !== true) errors.push("captureComplete must be true.");
  if (manifest.authenticatedCapture !== true) {
    errors.push("authenticatedCapture must be true; public-only evidence cannot pass launch QA.");
  }
  if (typeof manifest.demoAgentId !== "string" || manifest.demoAgentId.trim() === "") {
    errors.push("demoAgentId is required for the authenticated Studio deep link.");
  }
  if (!sameStringArray(manifest.publicRoutes, PUBLIC_ROUTES)) {
    errors.push(`publicRoutes must match the canonical ${PUBLIC_ROUTES.length}-route matrix.`);
  }
  if (!sameStringArray(manifest.authenticatedRouteTemplates, AUTHENTICATED_ROUTE_TEMPLATES)) {
    errors.push(
      `authenticatedRouteTemplates must match the canonical ${AUTHENTICATED_ROUTE_TEMPLATES.length}-route matrix.`,
    );
  }
  const expectedAuthenticatedRoutes = AUTHENTICATED_ROUTE_TEMPLATES.map((route) =>
    route.replace("<demo-agent-id>", encodeURIComponent(manifest.demoAgentId || "")),
  );
  if (!sameStringArray(manifest.authenticatedRoutes, expectedAuthenticatedRoutes)) {
    errors.push("authenticatedRoutes must materialize the canonical demo-agent route matrix.");
  }
  if (!sameViewportArray(manifest.viewports)) {
    errors.push(
      `viewports must match the canonical ${VISUAL_QA_VIEWPORTS.length}-viewport matrix.`,
    );
  }
  if (manifest.screenshotCountExpected !== FULL_SCREENSHOT_COUNT) {
    errors.push(`screenshotCountExpected must be ${FULL_SCREENSHOT_COUNT}.`);
  }

  const captures = Array.isArray(manifest.captures) ? manifest.captures : [];
  if (captures.length !== FULL_SCREENSHOT_COUNT) {
    errors.push(
      `captures must contain ${FULL_SCREENSHOT_COUNT} records; received ${captures.length}.`,
    );
  }
  if (manifest.screenshotCountActual !== captures.filter((capture) => capture?.success).length) {
    errors.push("screenshotCountActual does not match successful capture records.");
  }
  if (manifest.screenshotCountActual !== FULL_SCREENSHOT_COUNT) {
    errors.push(
      `screenshotCountActual must be ${FULL_SCREENSHOT_COUNT}; received ${String(manifest.screenshotCountActual)}.`,
    );
  }

  const expectedKeys = new Set();
  for (const viewport of VISUAL_QA_VIEWPORTS) {
    for (const route of PUBLIC_ROUTES) expectedKeys.add(captureKey("public", viewport.name, route));
    for (const route of AUTHENTICATED_ROUTE_TEMPLATES) {
      expectedKeys.add(captureKey("authenticated", viewport.name, route));
    }
  }

  const seenKeys = new Set();
  const viewportByName = new Map(VISUAL_QA_VIEWPORTS.map((viewport) => [viewport.name, viewport]));
  for (const record of captures) {
    const key = captureKey(record?.mode, record?.viewport, record?.routeTemplate);
    if (seenKeys.has(key)) errors.push(errorForCapture(record, "duplicate capture record."));
    seenKeys.add(key);
    if (!expectedKeys.has(key))
      errors.push(errorForCapture(record, "capture is outside the matrix."));
    if (record?.success !== true) errors.push(errorForCapture(record, "capture did not succeed."));

    const viewport = viewportByName.get(record?.viewport);
    if (!viewport) continue;
    if (record?.png?.width !== viewport.width || record?.png?.height !== viewport.height) {
      errors.push(
        errorForCapture(
          record,
          `PNG dimensions must be ${viewport.width}x${viewport.height}; received ${String(record?.png?.width)}x${String(record?.png?.height)}.`,
        ),
      );
    }

    const diagnostics = record?.diagnostics;
    if (!diagnostics || typeof diagnostics !== "object") {
      errors.push(errorForCapture(record, "diagnostics are missing."));
      continue;
    }
    if (!diagnostics.title || /^loading\b/i.test(diagnostics.title.trim())) {
      errors.push(errorForCapture(record, "document title is missing or unresolved."));
    }
    if (diagnostics.h1Count !== 1) {
      errors.push(
        errorForCapture(
          record,
          `expected exactly one h1; received ${String(diagnostics.h1Count)}.`,
        ),
      );
    }
    if (Array.isArray(diagnostics.duplicateIds) && diagnostics.duplicateIds.length > 0) {
      errors.push(
        errorForCapture(record, `duplicate ids: ${diagnostics.duplicateIds.join(", ")}.`),
      );
    }
    if (Array.isArray(diagnostics.brokenImages) && diagnostics.brokenImages.length > 0) {
      errors.push(
        errorForCapture(record, `broken images: ${diagnostics.brokenImages.join(", ")}.`),
      );
    }
    if (diagnostics.pageOverflow === true) {
      errors.push(errorForCapture(record, "page-level horizontal overflow detected."));
    }
    if (Array.isArray(diagnostics.overflowElements) && diagnostics.overflowElements.length > 0) {
      errors.push(
        errorForCapture(
          record,
          `visible elements escape the viewport: ${diagnostics.overflowElements.join(", ")}.`,
        ),
      );
    }
    if (diagnostics.blank === true || Number(diagnostics.bodyTextLength) < 12) {
      errors.push(errorForCapture(record, "capture is blank or has insufficient visible content."));
    }
    if (Number(diagnostics.busyCount) > 0) {
      errors.push(errorForCapture(record, "capture retained an unresolved busy/loading surface."));
    }

    const modalPolicy = expectedModalPolicy(record?.mode, record?.routeTemplate);
    if (modalPolicy === "required" && diagnostics.modalCount < 1) {
      errors.push(errorForCapture(record, "required modal is not visible."));
    }
    if (modalPolicy === "forbidden" && diagnostics.modalCount > 0) {
      errors.push(errorForCapture(record, "unexpected modal obscures the route."));
    }

    if (checkFiles) {
      if (typeof record?.file !== "string" || record.file.trim() === "") {
        errors.push(errorForCapture(record, "PNG file path is missing."));
      } else {
        const file = path.resolve(manifestDir, record.file);
        if (!existsSync(file)) {
          errors.push(errorForCapture(record, `PNG file is missing: ${record.file}.`));
        } else {
          const fileDimensions = readPngDimensions(readFileSync(file));
          if (
            !fileDimensions ||
            fileDimensions.width !== viewport.width ||
            fileDimensions.height !== viewport.height
          ) {
            errors.push(
              errorForCapture(record, `PNG header dimensions are invalid: ${record.file}.`),
            );
          }
        }
      }
    }
  }

  for (const key of expectedKeys) {
    if (!seenKeys.has(key)) errors.push(`Missing capture record: ${key}.`);
  }

  const unexplainedIssues = (Array.isArray(manifest.issues) ? manifest.issues : []).filter(
    (issue) => issue?.explained !== true,
  );
  for (const issue of unexplainedIssues) {
    errors.push(
      `[${issue?.kind || "issue"}] ${issue?.mode || "unknown"} ${issue?.viewport || "unknown"} ${issue?.route || "unknown"}: ${issue?.detail || "No detail"}`,
    );
  }

  return errors;
}
