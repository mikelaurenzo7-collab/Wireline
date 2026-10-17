import { authFetch } from "./api";
import { readPhoneTestReceipt, type PhoneTestReceipt } from "./phone-test-contract";

export type PhoneTestRequest = Readonly<{
  request_key: string;
  phone: string;
  consent: true;
}>;

export class PhoneTestRequestError extends Error {
  constructor(
    message: string,
    readonly uncertain: boolean,
  ) {
    super(message);
    this.name = "PhoneTestRequestError";
  }
}

export function normalizePhoneTestNumber(raw: string): string | null {
  const digits = raw.replace(/[\s().+-]/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}

export async function requestPhoneTest(
  agentId: string,
  request: PhoneTestRequest,
  fetcher: typeof authFetch = authFetch,
): Promise<PhoneTestReceipt> {
  return phoneTestRequest(agentId, request.request_key, "POST", request, fetcher);
}

export async function checkPhoneTest(
  agentId: string,
  requestKey: string,
  fetcher: typeof authFetch = authFetch,
): Promise<PhoneTestReceipt> {
  return phoneTestRequest(agentId, requestKey, "GET", undefined, fetcher);
}

export async function endPhoneTest(
  agentId: string,
  requestKey: string,
  fetcher: typeof authFetch = authFetch,
): Promise<PhoneTestReceipt> {
  return phoneTestRequest(agentId, requestKey, "DELETE", undefined, fetcher);
}

async function phoneTestRequest(
  agentId: string,
  requestKey: string,
  method: "POST" | "GET" | "DELETE",
  request: PhoneTestRequest | undefined,
  fetcher: typeof authFetch,
): Promise<PhoneTestReceipt> {
  const path = `/api/agents/${encodeURIComponent(agentId)}/phone-test`;
  let response: Response;
  try {
    response = await fetcher(
      method === "POST" ? path : `${path}/${encodeURIComponent(requestKey)}`,
      {
        method,
        ...(request
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }
          : {}),
      },
    );
  } catch {
    throw new PhoneTestRequestError(
      "The call status could not be confirmed. Check before calling again.",
      true,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const uncertain = method !== "POST" || response.status >= 500 || response.status === 408;
    throw new PhoneTestRequestError(
      !uncertain && typeof record?.error === "string"
        ? record.error.slice(0, 500)
        : "The call status could not be confirmed. Check before calling again.",
      uncertain,
    );
  }
  const receipt = readPhoneTestReceipt(body, requestKey, agentId);
  if (!receipt)
    throw new PhoneTestRequestError(
      "The call status could not be confirmed. Check before calling again.",
      true,
    );
  return receipt;
}
