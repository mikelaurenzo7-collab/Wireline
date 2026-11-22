import { createHash } from "node:crypto";

import { isDncScrubProjectConnectionConfigured } from "./federal-dnc-config";
import {
  isDncCampaignId,
  isRealDncDate,
  parseAreaCodes,
  type DncSellerVerification,
} from "./dnc-seller-registration-rules";

type ProjectCheck =
  | {
      state: "verified";
      projectCode: string;
      campaignId: number;
      areaCodes: string[] | "all";
      expiresOn: string;
    }
  | { state: "pending"; projectCode: string }
  | { state: "failed" | "unavailable" };

/**
 * Repeated attempts for this subscription reuse the same project. Separate
 * projects let the current term keep working while a renewal is verified and
 * prevent a timed-out request for an old SAN from rewriting the new link.
 */
export function dncScrubProjectCode(userId: string, orgId: string, san: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([userId, orgId, san]))
    .digest("hex");
  return `BB${digest.slice(0, 16).toUpperCase()}`;
}

function matchingProjectCode(
  payload: Record<string, unknown>,
  expectedCode: string,
): string | null {
  const code = payload.ProjectCode;
  if (typeof code !== "string" || !/^[A-Z0-9_-]{2,30}$/.test(code)) return null;
  if (code === expectedCode) return code;
  return typeof payload.AcctId === "string" && code === `${payload.AcctId}_${expectedCode}`
    ? code
    : null;
}

function parseProjectCheck(
  value: unknown,
  request: DncSellerVerification,
  expectedCode: string,
  now: Date,
): ProjectCheck {
  if (!value || typeof value !== "object") return { state: "unavailable" };
  const project = value as Record<string, unknown>;
  const projectCode = request.project_code
    ? project.ProjectCode === request.project_code
      ? request.project_code
      : null
    : matchingProjectCode(project, expectedCode);
  const masterFlags = [project.UseMasterDncSub, project.UseMasterDncDb, project.UseMasterEbrDb];
  // The GET example omits the flags. The first PUT must confirm they are off.
  if (
    !projectCode ||
    project.Status !== "active" ||
    masterFlags.some((flag) => flag !== false && !(request.project_code && flag === undefined))
  )
    return { state: "unavailable" };

  const rawValidation = project.FtcValidation;
  if (!rawValidation || typeof rawValidation !== "object") return { state: "unavailable" };
  const validation = rawValidation as Record<string, unknown>;
  if (validation.OrgId !== request.ftc_org_id || validation.San !== request.san)
    return { state: "unavailable" };
  if (validation.Status === "pending") return { state: "pending", projectCode };
  if (validation.Status === "failed") return { state: "failed" };
  if (validation.Status !== "validated" || !isDncCampaignId(project.DefaultCampaignId))
    return { state: "unavailable" };

  const expiresOn = validation.Expiration;
  if (typeof expiresOn !== "string" || !isRealDncDate(expiresOn)) return { state: "unavailable" };
  if (expiresOn < now.toISOString().slice(0, 10)) return { state: "failed" };
  const areaCodes =
    validation.HasEntireUs === true
      ? "all"
      : validation.HasEntireUs === false && Array.isArray(validation.AreaCodes)
        ? parseAreaCodes(validation.AreaCodes)
        : null;
  if (!areaCodes) return { state: "unavailable" };
  return {
    state: "verified",
    projectCode,
    campaignId: project.DefaultCampaignId,
    areaCodes,
    expiresOn,
  };
}

/** Submit once, then poll the exact returned project while the FTC check runs. */
export async function checkDncScrubProject(
  userId: string,
  request: DncSellerVerification,
  now: Date,
): Promise<ProjectCheck> {
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim();
  if (!apiKey || !isDncScrubProjectConnectionConfigured()) return { state: "unavailable" };
  const code = dncScrubProjectCode(userId, request.ftc_org_id, request.san);
  if (request.project_code && !/^[A-Z0-9_-]{2,30}$/.test(request.project_code))
    return { state: "unavailable" };
  const projectUrl = `https://dataapi.dncscrub.com/v1.5/projects/${request.project_code ?? code}`;
  try {
    const response = await fetch(projectUrl, {
      method: request.project_code ? "GET" : "PUT",
      headers: { loginId: apiKey, Accept: "application/json", "Content-Type": "application/json" },
      ...(request.project_code
        ? {}
        : {
            body: JSON.stringify({
              ProjectName: request.seller_name.slice(0, 50),
              FtcOrgId: request.ftc_org_id,
              FtcSan: request.san,
              UseMasterDncSub: false,
              UseMasterDncDb: false,
              UseMasterEbrDb: false,
              UseMasterDncPolicy: false,
            }),
          }),
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { state: "unavailable" };
    return parseProjectCheck(await response.json(), request, code, now);
  } catch {
    // Vendor errors can contain the FTC credentials or our loginId.
    return { state: "unavailable" };
  }
}
