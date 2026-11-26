import { Router, type Response } from "express";

import { AppError } from "../lib/api-error";
import {
  addPersonIdentifier,
  addPersonNote,
  createPerson,
  deletePerson,
  deletePersonNote,
  findPersonByIdentifier,
  getPerson,
  listPeople,
  mergePeople,
  removePersonIdentifier,
  unmergePerson,
  updatePerson,
} from "../lib/people/people-service";
import { getPersonTimeline, listPeopleSuggestions } from "../lib/people/people-timeline";
import { authenticateUser } from "../middleware/auth";
import { peopleReadRateLimit, peopleWriteRateLimit } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

/**
 * People: the owner's customer record. Every route is the authenticated
 * owner's own tenant; the service applies RLS scope and user filters.
 * Bot and connected-app access arrive separately, behind their own policy.
 */
const router = Router();

function body(req: AuthenticatedRequest): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

function param(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return typeof value === "string" ? value : "";
}

router.get(
  "/api/people",
  authenticateUser,
  peopleReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(
      await listPeople(req.user.id, {
        query: req.query.q,
        status: req.query.status,
        cursor: req.query.cursor,
        limit: req.query.limit,
      }),
    );
  },
);

router.get(
  "/api/people/suggestions",
  authenticateUser,
  peopleReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({ suggestions: await listPeopleSuggestions(req.user.id) });
  },
);

router.get(
  "/api/people/lookup",
  authenticateUser,
  peopleReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const kind = req.query.kind;
    if (kind !== "phone" && kind !== "email") {
      throw AppError.badRequest("Look up a phone or an email.");
    }
    res.json({ person: await findPersonByIdentifier(req.user.id, kind, req.query.value) });
  },
);

router.post(
  "/api/people",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const input = body(req);
    res.status(201).json({
      person: await createPerson(req.user.id, {
        displayName: input.displayName,
        company: input.company,
        identifiers: input.identifiers,
      }),
    });
  },
);

router.get(
  "/api/people/:personId",
  authenticateUser,
  peopleReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({ person: await getPerson(req.user.id, param(req, "personId")) });
  },
);

router.patch(
  "/api/people/:personId",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const input = body(req);
    res.json({
      person: await updatePerson(req.user.id, param(req, "personId"), {
        displayName: input.displayName,
        company: input.company,
        status: input.status,
        summary: input.summary,
        customFields: input.customFields,
      }),
    });
  },
);

router.delete(
  "/api/people/:personId",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    await deletePerson(req.user.id, param(req, "personId"));
    res.json({ deleted: true });
  },
);

router.get(
  "/api/people/:personId/timeline",
  authenticateUser,
  peopleReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(
      await getPersonTimeline(req.user.id, param(req, "personId"), {
        before: req.query.before,
        limit: req.query.limit,
      }),
    );
  },
);

router.post(
  "/api/people/:personId/identifiers",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const input = body(req);
    res.status(201).json({
      person: await addPersonIdentifier(req.user.id, param(req, "personId"), {
        kind: input.kind,
        value: input.value,
      }),
    });
  },
);

router.delete(
  "/api/people/:personId/identifiers/:identifierId",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({
      person: await removePersonIdentifier(
        req.user.id,
        param(req, "personId"),
        param(req, "identifierId"),
      ),
    });
  },
);

router.post(
  "/api/people/:personId/notes",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res
      .status(201)
      .json({ note: await addPersonNote(req.user.id, param(req, "personId"), body(req).body) });
  },
);

router.delete(
  "/api/people/:personId/notes/:noteId",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    await deletePersonNote(req.user.id, param(req, "personId"), param(req, "noteId"));
    res.json({ deleted: true });
  },
);

router.post(
  "/api/people/:personId/merge",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const targetId = body(req).targetId;
    if (typeof targetId !== "string") throw AppError.badRequest("Choose who to merge into.");
    res.json({ person: await mergePeople(req.user.id, param(req, "personId"), targetId) });
  },
);

router.post(
  "/api/people/:personId/unmerge",
  authenticateUser,
  peopleWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({ person: await unmergePerson(req.user.id, param(req, "personId")) });
  },
);

export default router;
