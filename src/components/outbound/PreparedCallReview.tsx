import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import { preparedCallSchema, type PreparedCall } from "../../lib/prepared-call-contract";
import { Button } from "../atoms";
import { StatusNotice } from "../molecules";
import OutboundDialDialog from "../OutboundDialDialog";

/** A review link identifies a request, never an account or an authorization to call. */
export default function PreparedCallReview({
  requestKey,
  onClose,
}: {
  requestKey: string;
  onClose: () => void;
}) {
  const [prepared, setPrepared] = useState<PreparedCall | null>(null);
  const [notice, setNotice] = useState("Loading call proposal…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await authFetch(
          `/api/outbound/prepared/${encodeURIComponent(requestKey)}`,
          {
            signal: controller.signal,
          },
        );
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body.error || "Could not load this call proposal.");
        const draft = preparedCallSchema.safeParse(body.prepared);
        if (!draft.success || draft.data.request_key !== requestKey.toLowerCase())
          throw new Error("Could not verify this call proposal.");
        if (
          body.status?.request_key !== draft.data.request_key ||
          ![
            "awaiting_review",
            "expired",
            "failed",
            "completed",
            "accepted",
            "uncertain",
            "preparing",
          ].includes(body.status?.status)
        )
          throw new Error("Could not verify this call's status. Check History before retrying.");
        if (body.status?.status === "awaiting_review") {
          setPrepared(draft.data);
        } else {
          setNotice(
            body.status?.status === "expired"
              ? "This proposal expired. Prepare a new call from your connected app."
              : `This call has already been submitted. Check History for its progress.`,
          );
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setFailed(true);
        setNotice(error instanceof Error ? error.message : "Could not load this call proposal.");
      }
    })();
    return () => controller.abort();
  }, [requestKey]);
  if (prepared)
    return (
      <OutboundDialDialog
        open
        onClose={onClose}
        initialAgentId={prepared.agent_id}
        initialNumber={prepared.phone}
        initialContext={prepared.instruction}
        preparedCall={prepared}
      />
    );
  return (
    <StatusNotice tone={failed ? "warning" : "info"} title="Prepared call" className="m-3 sm:m-6">
      <p role={failed ? "alert" : "status"}>{notice}</p>
      <Button variant="secondary" size="sm" onClick={onClose} className="mt-3">
        Close
      </Button>
    </StatusNotice>
  );
}
