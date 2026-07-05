/** Session key for non-fatal warnings after Fast Start agent creation. */
export const CREATE_WARNING_SESSION_KEY = "wireline:create-warning";

/** Post-create wizard payload — Train → Wire → Test after Fast Start. */
export const POST_CREATE_WIZARD_KEY = "wireline:post-create-wizard";

export type PostCreateWizardPayload = {
  agentId: string;
  agentName: string;
  /** User checked "Provision number" during create — line may already exist. */
  phoneProvisionRequested: boolean;
};

export function stashPostCreateWizard(payload: PostCreateWizardPayload): void {
  try {
    sessionStorage.setItem(POST_CREATE_WIZARD_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function consumePostCreateWizard(): PostCreateWizardPayload | null {
  try {
    const raw = sessionStorage.getItem(POST_CREATE_WIZARD_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(POST_CREATE_WIZARD_KEY);
    const parsed = JSON.parse(raw) as PostCreateWizardPayload;
    if (!parsed?.agentId || !parsed?.agentName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function stashCreateWarning(message: string): void {
  try {
    sessionStorage.setItem(CREATE_WARNING_SESSION_KEY, message);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read once and clear — used by Studio on landing after create redirect. */
export function consumeCreateWarning(): string | null {
  try {
    const message = sessionStorage.getItem(CREATE_WARNING_SESSION_KEY);
    if (message) sessionStorage.removeItem(CREATE_WARNING_SESSION_KEY);
    return message;
  } catch {
    return null;
  }
}
