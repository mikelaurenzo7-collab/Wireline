import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Mic, RefreshCw, Trash2, Volume2 } from "lucide-react";

import { authFetch } from "../../lib/api";
import {
  VOICE_ASSET_CONSENT_VERSION,
  type VoiceCloneCreateInput,
} from "../../lib/voice-clone-contract";
import {
  inspectPcm16MonoWav,
  VOICE_REFERENCE_MAX_BYTES,
  VOICE_REFERENCE_MIN_SECONDS,
  VOICE_REFERENCE_MAX_SECONDS,
  VOICE_REFERENCE_SAMPLE_RATES,
} from "../../lib/voice/voice-reference-audio";
import { Button } from "../atoms";
import { StatusNotice } from "../molecules";
import VoiceCloneDialog from "./VoiceCloneDialog";

type Capabilities = {
  available: true;
  engineReady: boolean;
  scope: "private_preview";
  consentVersion: string;
  qualityCheckVersion: string;
  previewReserveUsd: number | null;
};
type VoiceAsset = {
  id: string;
  name: string;
  status: "pending_review" | "approved" | "revoked" | "deleted";
  version: number;
  sourceSha256: string;
  durationSeconds: number;
  sampleRateHz: number;
  createdAt: string;
  reviewedAt: string | null;
  revokedAt: string | null;
};
type Pending = { id: string; action: "review" | "delete" | "preview" | "create" } | null;
const MAX_PREVIEW_BYTES = 2_880_044;
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
function readCapabilities(value: unknown): Capabilities | false {
  const body = object(value);
  if (body?.available === false) return false;
  if (
    body?.available !== true ||
    body.scope !== "private_preview" ||
    body.consentVersion !== VOICE_ASSET_CONSENT_VERSION ||
    typeof body.qualityCheckVersion !== "string" ||
    !body.qualityCheckVersion.trim() ||
    body.qualityCheckVersion.length > 120 ||
    typeof body.engineReady !== "boolean" ||
    body.maxReferenceBytes !== VOICE_REFERENCE_MAX_BYTES ||
    body.minReferenceSeconds !== VOICE_REFERENCE_MIN_SECONDS ||
    body.maxReferenceSeconds !== VOICE_REFERENCE_MAX_SECONDS ||
    !(
      body.previewReserveUsd === null ||
      (typeof body.previewReserveUsd === "number" &&
        Number.isFinite(body.previewReserveUsd) &&
        body.previewReserveUsd > 0)
    ) ||
    (body.engineReady && body.previewReserveUsd === null)
  )
    throw new Error("Custom voice settings could not be verified. Reload before continuing.");
  return body as Capabilities;
}
function readAsset(value: unknown): VoiceAsset {
  const row = object(value);
  if (
    !row ||
    typeof row.id !== "string" ||
    !ASSET_ID.test(row.id) ||
    typeof row.name !== "string" ||
    !row.name.trim() ||
    row.name.length > 80 ||
    !["pending_review", "approved", "revoked", "deleted"].includes(String(row.status)) ||
    !Number.isSafeInteger(row.version) ||
    Number(row.version) < 1 ||
    Number(row.version) >= 2_147_483_647 ||
    typeof row.sourceSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(row.sourceSha256) ||
    typeof row.durationSeconds !== "number" ||
    !Number.isFinite(row.durationSeconds) ||
    row.durationSeconds < VOICE_REFERENCE_MIN_SECONDS ||
    row.durationSeconds > VOICE_REFERENCE_MAX_SECONDS ||
    !VOICE_REFERENCE_SAMPLE_RATES.includes(
      row.sampleRateHz as (typeof VOICE_REFERENCE_SAMPLE_RATES)[number],
    ) ||
    !validDate(row.createdAt) ||
    !(row.reviewedAt === null || validDate(row.reviewedAt)) ||
    !(row.revokedAt === null || validDate(row.revokedAt)) ||
    (row.status === "approved" && (!validDate(row.reviewedAt) || row.revokedAt !== null))
  )
    throw new Error("A saved voice could not be verified. Reload before continuing.");
  return row as VoiceAsset;
}
function readList(value: unknown) {
  const body = object(value);
  if (!Array.isArray(body?.assets) || body.assets.length > 5)
    throw new Error("Saved voices could not be verified. Reload before continuing.");
  const rows = body.assets.map(readAsset);
  if (
    rows.some((row) => row.status === "deleted") ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    throw new Error("Saved voices could not be verified. Reload before continuing.");
  return rows;
}
async function json(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = object(body)?.error;
    const error = new Error(
      typeof message === "string" && message.length <= 2_000
        ? message
        : "The voice request failed. Try again.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body;
}
function needsReload(error: unknown) {
  return (
    (error as { status?: number } | null)?.status === 409 ||
    (error instanceof Error && error.message.includes("could not be verified"))
  );
}
function stopPlayer(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}
function reserveCopy(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}
async function previewBytes(response: Response, signal: AbortSignal) {
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "audio/wav")
    throw new Error(
      "The voice preview returned invalid audio. Its allowance reservation may remain.",
    );
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_PREVIEW_BYTES)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("The voice preview was too large. Its allowance reservation may remain.");
  }
  if (!response.body)
    throw new Error("The voice preview was empty. Its allowance reservation may remain.");
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted)
        throw new Error("Preview cancelled. Its allowance reservation may remain.");
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_PREVIEW_BYTES)
        throw new Error("The voice preview was too large. Its allowance reservation may remain.");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      inspectPcm16MonoWav(bytes, {
        maxBytes: MAX_PREVIEW_BYTES,
        minDurationSeconds: 0.01,
        maxDurationSeconds: 60,
        sampleRates: [24_000],
      });
    } catch {
      throw new Error(
        "The voice preview returned invalid audio. Its allowance reservation may remain.",
      );
    }
    return bytes;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/** Operator-only private preview tools. Never selects a Bot's calling voice. */
export default function VoiceClonePanel({
  ownerId,
  agentId,
  agentName,
}: {
  ownerId: string;
  agentId: string;
  agentName: string;
}) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [assets, setAssets] = useState<VoiceAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const [notice, setNotice] = useState("");
  const [audio, setAudio] = useState<{ id: string; url: string } | null>(null);
  const generation = useRef(0);
  const activeScope = useRef<string | null>(null);
  const actionVersion = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const pendingRef = useRef<Pending>(null);
  const loadingRef = useRef(false);
  const audioUrl = useRef<string | null>(null);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  const attachPlayer = useRef((element: HTMLAudioElement | null) => {
    if (audioPlayer.current !== element) stopPlayer(audioPlayer.current);
    audioPlayer.current = element;
  });
  const previewController = useRef<AbortController | null>(null);
  const clearAudio = useCallback(() => {
    stopPlayer(audioPlayer.current);
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    setAudio(null);
  }, []);

  const load = useCallback(
    async (epoch: number) => {
      if (
        !ownerId ||
        !agentId ||
        activeScope.current !== `${ownerId}:${agentId}` ||
        epoch !== generation.current ||
        pendingRef.current ||
        loadingRef.current
      )
        return;
      loadingRef.current = true;
      setLoading(true);
      setError("");
      setNotice("");
      const controller = new AbortController();
      controllers.current.add(controller);
      try {
        const caps = readCapabilities(
          await json(
            await authFetch("/api/voice/assets/capabilities", {
              signal: controller.signal,
              suppressTrialGateEvent: true,
            }),
          ),
        );
        if (epoch !== generation.current || controller.signal.aborted) return;
        if (caps === false) {
          clearAudio();
          setCapabilities(null);
          setAssets([]);
          return;
        }
        setCapabilities(caps);
        const rows = readList(
          await json(
            await authFetch("/api/voice/assets", {
              signal: controller.signal,
              suppressTrialGateEvent: true,
            }),
          ),
        );
        if (epoch !== generation.current || controller.signal.aborted) return;
        clearAudio();
        setCapabilities(caps);
        setAssets(rows);
        setReloadRequired(false);
        setReviewId(null);
        setReviewChecked(false);
        setDeleteId(null);
      } catch (reason) {
        if (epoch === generation.current && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Saved voices could not be loaded.");
          setReloadRequired(true);
        }
      } finally {
        controllers.current.delete(controller);
        if (epoch === generation.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [ownerId, agentId, clearAudio],
  );

  useLayoutEffect(() => {
    activeScope.current = `${ownerId}:${agentId}`;
    const activeControllers = controllers.current;
    const epoch = ++generation.current;
    actionVersion.current += 1;
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    pendingRef.current = null;
    loadingRef.current = false;
    setCapabilities(null);
    setAssets([]);
    setDialogOpen(false);
    setPending(null);
    setReviewId(null);
    setDeleteId(null);
    setReviewChecked(false);
    setError("");
    setNotice("");
    setReloadRequired(false);
    clearAudio();
    void load(epoch);
    return () => {
      activeScope.current = null;
      generation.current += 1;
      actionVersion.current += 1;
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
    };
  }, [ownerId, agentId, load, clearAudio]);

  const begin = (value: NonNullable<Pending>) => {
    if (
      activeScope.current !== `${ownerId}:${agentId}` ||
      pendingRef.current ||
      loadingRef.current ||
      reloadRequired ||
      !capabilities
    )
      return null;
    const controller = new AbortController();
    controllers.current.add(controller);
    const operation = ++actionVersion.current;
    pendingRef.current = value;
    setPending(value);
    setError("");
    setNotice("");
    return { controller, operation, epoch: generation.current };
  };
  const current = (operation: { epoch: number; operation: number; controller: AbortController }) =>
    operation.epoch === generation.current &&
    operation.operation === actionVersion.current &&
    !operation.controller.signal.aborted;
  const finishOperation = (operation: {
    epoch: number;
    operation: number;
    controller: AbortController;
  }) => {
    controllers.current.delete(operation.controller);
    if (current(operation)) {
      pendingRef.current = null;
      setPending(null);
    }
  };
  const showFailure = (reason: unknown) => {
    setError(reason instanceof Error ? reason.message : "The voice request failed. Try again.");
    if (needsReload(reason)) setReloadRequired(true);
  };

  const create = async (input: VoiceCloneCreateInput) => {
    const operation = begin({ id: "new", action: "create" });
    if (!operation) throw new Error("Reload saved voices before adding a recording.");
    try {
      const result = object(
        await json(
          await authFetch("/api/voice/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: operation.controller.signal,
            suppressTrialGateEvent: true,
          }),
        ),
      );
      const asset = readAsset(result?.asset);
      if (
        asset.status !== "pending_review" ||
        asset.version !== 1 ||
        assets.some((row) => row.id === asset.id)
      )
        throw new Error("The saved voice could not be verified. Reload before continuing.");
      if (!current(operation))
        throw new Error("This voice view changed. Reload its saved recordings.");
      setAssets((rows) => [asset, ...rows].slice(0, 5));
      setReviewId(asset.id);
      setReviewChecked(false);
    } catch (reason) {
      if (current(operation)) showFailure(reason);
      throw reason;
    } finally {
      finishOperation(operation);
    }
  };

  const mutate = async (asset: VoiceAsset, action: "review" | "delete") => {
    if (action === "review" && (!reviewChecked || asset.status !== "pending_review")) return;
    const operation = begin({ id: asset.id, action });
    if (!operation) return;
    if (action === "delete") clearAudio();
    try {
      const result = object(
        await json(
          await authFetch(
            `/api/voice/assets/${encodeURIComponent(asset.id)}${action === "review" ? "/review" : ""}`,
            {
              method: action === "review" ? "POST" : "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                action === "review"
                  ? {
                      expectedVersion: asset.version,
                      sourceSha256: asset.sourceSha256,
                      qualityCheckVersion: capabilities!.qualityCheckVersion,
                    }
                  : { expectedVersion: asset.version },
              ),
              signal: operation.controller.signal,
              suppressTrialGateEvent: true,
            },
          ),
        ),
      );
      const saved = readAsset(result?.asset);
      if (
        saved.id !== asset.id ||
        saved.sourceSha256 !== asset.sourceSha256 ||
        saved.version !== asset.version + 1 ||
        saved.status !== (action === "review" ? "approved" : "deleted")
      )
        throw new Error("The voice update could not be verified. Reload before continuing.");
      if (!current(operation)) return;
      setAssets((rows) =>
        action === "delete"
          ? rows.filter((row) => row.id !== asset.id)
          : rows.map((row) => (row.id === asset.id ? saved : row)),
      );
      setReviewId(null);
      setReviewChecked(false);
      setDeleteId(null);
    } catch (reason) {
      if (current(operation)) showFailure(reason);
    } finally {
      finishOperation(operation);
    }
  };

  const preview = async (asset: VoiceAsset) => {
    if (
      !capabilities?.engineReady ||
      capabilities.previewReserveUsd === null ||
      asset.status !== "approved"
    )
      return;
    const operation = begin({ id: asset.id, action: "preview" });
    if (!operation) return;
    clearAudio();
    previewController.current = operation.controller;
    const timer = setTimeout(() => operation.controller.abort(), 90_000);
    try {
      const response = await authFetch(
        `/api/voice/assets/${encodeURIComponent(asset.id)}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: asset.version,
            expectedReserveUsd: capabilities.previewReserveUsd,
          }),
          signal: operation.controller.signal,
          timeoutMs: 90_000,
          suppressTrialGateEvent: true,
        },
      );
      if (!response.ok) await json(response);
      const bytes = await previewBytes(response, operation.controller.signal);
      if (!current(operation)) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer], { type: "audio/wav" }),
      );
      audioUrl.current = url;
      setAudio({ id: asset.id, url });
    } catch (reason) {
      if (operation.epoch === generation.current && operation.operation === actionVersion.current) {
        if (operation.controller.signal.aborted)
          setNotice("Preview stopped. Its allowance reservation may remain.");
        else showFailure(reason);
      }
    } finally {
      clearTimeout(timer);
      if (previewController.current === operation.controller) previewController.current = null;
      // An aborted request is still the current operation after a timeout.
      if (operation.epoch === generation.current && operation.operation === actionVersion.current) {
        pendingRef.current = null;
        setPending(null);
      }
      controllers.current.delete(operation.controller);
    }
  };

  const cancelPreview = () => {
    if (pendingRef.current?.action !== "preview") return;
    actionVersion.current += 1;
    previewController.current?.abort();
    previewController.current = null;
    pendingRef.current = null;
    setPending(null);
    clearAudio();
    setNotice("Preview cancelled. Its allowance reservation may remain.");
  };
  if (!capabilities) return null;
  const busy = loading || pending !== null;

  return (
    <section
      aria-label="Private custom voice previews"
      className="min-w-0 space-y-3 border-t border-border pt-4"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">
            Your voice{" "}
            <span className="ml-1 font-normal text-muted-foreground">· Private preview</span>
          </h4>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Private previews only. Call voice stays unchanged.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void load(generation.current)}
            aria-label="Reload saved voices"
            className="min-h-11"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || reloadRequired || assets.length >= 5}
            onClick={() => setDialogOpen(true)}
            className="min-h-11 whitespace-normal"
          >
            <Mic aria-hidden="true" className="size-4 shrink-0" />
            Add voice
          </Button>
        </div>
      </div>
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading saved voices…
        </p>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Voice needs attention">
          <span className="break-words [overflow-wrap:anywhere]">{error}</span>
          {reloadRequired ? <p className="mt-1">Reload saved voices before continuing.</p> : null}
        </StatusNotice>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {!capabilities.engineReady ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Voice preview engine is unavailable. You can still save or delete a recording.
        </p>
      ) : null}
      {!assets.length ? (
        <p className="text-sm text-muted-foreground">No voice recordings saved.</p>
      ) : (
        <ul className="min-w-0 space-y-2">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="min-w-0 space-y-3 rounded-xl border border-border bg-secondary/30 p-3"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                    {asset.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {asset.durationSeconds.toFixed(1)}s ·{" "}
                    {asset.status === "pending_review"
                      ? "Review needed"
                      : asset.status === "approved"
                        ? "Ready to preview"
                        : "Revoked"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {asset.status === "pending_review" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || reloadRequired}
                      aria-label={`Review ${asset.name}`}
                      aria-expanded={reviewId === asset.id}
                      aria-controls={`voice-review-${asset.id}`}
                      onClick={() => {
                        setReviewId(reviewId === asset.id ? null : asset.id);
                        setReviewChecked(false);
                        setDeleteId(null);
                      }}
                      className="min-h-11"
                    >
                      Review
                    </Button>
                  ) : null}
                  {asset.status === "approved" &&
                  !(pending?.id === asset.id && pending.action === "preview") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        busy ||
                        reloadRequired ||
                        !capabilities.engineReady ||
                        capabilities.previewReserveUsd === null
                      }
                      aria-label={`Preview ${asset.name}`}
                      onClick={() => void preview(asset)}
                      className="min-h-11"
                    >
                      <Volume2 aria-hidden="true" className="size-4 shrink-0" />
                      Preview
                    </Button>
                  ) : null}
                  {pending?.id === asset.id && pending.action === "preview" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Cancel preview for ${asset.name}`}
                      onClick={cancelPreview}
                      className="min-h-11"
                    >
                      <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
                      Cancel preview
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy || reloadRequired}
                    aria-label={`Delete ${asset.name}`}
                    onClick={() => {
                      setDeleteId(deleteId === asset.id ? null : asset.id);
                      setReviewId(null);
                      setReviewChecked(false);
                    }}
                    className="min-h-11"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>
              {asset.status === "approved" && capabilities.previewReserveUsd !== null ? (
                <p className="text-xs text-muted-foreground">
                  Preview reserves {reserveCopy(capabilities.previewReserveUsd)} of AI allowance.
                </p>
              ) : null}
              {reviewId === asset.id && asset.status === "pending_review" ? (
                <div
                  id={`voice-review-${asset.id}`}
                  className="min-w-0 space-y-2 border-t border-border pt-3"
                >
                  <p className="text-sm leading-6 text-muted-foreground">
                    Check the source recording: your own voice, clear audio, and no other speakers.
                  </p>
                  <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
                    <input
                      type="checkbox"
                      checked={reviewChecked}
                      disabled={busy || reloadRequired}
                      onChange={(event) => setReviewChecked(event.target.checked)}
                      className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span>I have reviewed my recording.</span>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || reloadRequired || !reviewChecked}
                    onClick={() => void mutate(asset, "review")}
                    className="min-h-11 whitespace-normal"
                  >
                    {pending?.id === asset.id && pending.action === "review"
                      ? "Approving…"
                      : "Approve private preview"}
                  </Button>
                </div>
              ) : null}
              {deleteId === asset.id ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="break-words text-sm text-foreground [overflow-wrap:anywhere]">
                    Delete {asset.name} and its recording?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setDeleteId(null)}
                      className="min-h-11"
                    >
                      Keep voice
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy || reloadRequired}
                      onClick={() => void mutate(asset, "delete")}
                      aria-label={`Confirm delete ${asset.name}`}
                      className="min-h-11 whitespace-normal"
                    >
                      {pending?.id === asset.id && pending.action === "delete"
                        ? "Deleting…"
                        : "Delete voice"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {audio?.id === asset.id ? (
                <audio
                  ref={attachPlayer.current}
                  src={audio.url}
                  controls
                  preload="metadata"
                  aria-label={`Generated preview of ${asset.name}`}
                  className="block h-10 w-full min-w-0 max-w-full"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {assets.length >= 5 ? (
        <p className="text-xs text-muted-foreground">
          Five voices saved. Delete one before adding another.
        </p>
      ) : null}
      <VoiceCloneDialog
        key={`${ownerId}:${agentId}`}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={create}
        agentName={agentName}
      />
    </section>
  );
}
