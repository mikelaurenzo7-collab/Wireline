import { describe, it, expect, vi } from "vitest";
import {
  handleCreateAccount,
  handleSendPaymentLink,
  handleSendSignupLink,
  type CreateAccountDeps,
  type SendPaymentLinkDeps,
  type SendSignupLinkDeps,
} from "./vapi-tool-handlers";

// A silent logger so test output stays clean. The `.error` calls are
// expected on the catch paths — we don't assert on them.
const silentLog = { error: vi.fn() };

// ---------------------------------------------------------------------------
// create_account
// ---------------------------------------------------------------------------

function createAccountDeps(overrides: Partial<CreateAccountDeps> = {}): CreateAccountDeps {
  return {
    signUp: vi.fn().mockResolvedValue({ user: { id: "u1" } }),
    createPasswordResetToken: vi
      .fn()
      .mockResolvedValue({ token: "reset-tok", expiresAt: new Date(Date.now() + 3_600_000) }),
    sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true }),
    randomPassword: vi.fn().mockReturnValue("deterministic-temp-pw"),
    appUrl: "https://trywireline.com",
    log: { error: vi.fn() },
    ...overrides,
  };
}

describe("handleCreateAccount — email guardrails", () => {
  it("rejects an unparseable email and does NOT call signUp", async () => {
    const deps = createAccountDeps();
    const { result } = await handleCreateAccount(
      { to_email: "not-an-email", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/couldn't parse that email/i);
    expect(result).toMatch(/spell it/i);
    expect(deps.signUp).not.toHaveBeenCalled();
    expect(deps.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("rejects a missing email and does NOT call signUp", async () => {
    const deps = createAccountDeps();
    const { result } = await handleCreateAccount({ email_confirmed: true }, deps);
    expect(result).toMatch(/couldn't parse that email/i);
    expect(deps.signUp).not.toHaveBeenCalled();
  });

  it("bounces with a read-back script when email_confirmed is missing", async () => {
    const deps = createAccountDeps();
    const { result } = await handleCreateAccount({ to_email: "caller@example.com" }, deps);
    expect(result).toMatch(/read "caller@example\.com" back/i);
    expect(result).toMatch(/email_confirmed set to true/i);
    expect(deps.signUp).not.toHaveBeenCalled();
  });

  it("bounces when email_confirmed is false (strict true required)", async () => {
    const deps = createAccountDeps();
    const { result } = await handleCreateAccount(
      { to_email: "caller@example.com", email_confirmed: false },
      deps,
    );
    expect(result).toMatch(/read .* back/i);
    expect(deps.signUp).not.toHaveBeenCalled();
  });

  it("does NOT accept a truthy-but-not-true email_confirmed value", async () => {
    const deps = createAccountDeps();
    // `email_confirmed` is typed boolean but a mis-behaving model could
    // send a string; the guardrail uses strict `!== true`.
    const { result } = await handleCreateAccount(
      { to_email: "caller@example.com", email_confirmed: "yes" as unknown as boolean },
      deps,
    );
    expect(result).toMatch(/read .* back/i);
    expect(deps.signUp).not.toHaveBeenCalled();
  });
});

describe("handleCreateAccount — happy path", () => {
  it("creates the account and emails a set-password link", async () => {
    const deps = createAccountDeps();
    const { result } = await handleCreateAccount(
      { to_email: "caller@example.com", caller_name: "Pat Caller", email_confirmed: true },
      deps,
    );
    expect(deps.signUp).toHaveBeenCalledTimes(1);
    expect(deps.signUp).toHaveBeenCalledWith(
      "caller@example.com",
      "deterministic-temp-pw",
      "Pat Caller",
    );
    expect(deps.createPasswordResetToken).toHaveBeenCalledWith("caller@example.com");
    expect(deps.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const emailArg = (deps.sendPasswordResetEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(emailArg.to).toBe("caller@example.com");
    expect(emailArg.resetUrl).toBe("https://trywireline.com/reset-password?token=reset-tok");
    expect(result).toMatch(/Account created for caller@example\.com/i);
    expect(result).toMatch(/14-day free trial/i);
  });

  it("url-encodes the reset token in the link", async () => {
    const deps = createAccountDeps({
      createPasswordResetToken: vi
        .fn()
        .mockResolvedValue({ token: "tok/with+chars=", expiresAt: new Date() }),
    });
    await handleCreateAccount({ to_email: "x@y.com", email_confirmed: true }, deps);
    const emailArg = (deps.sendPasswordResetEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(emailArg.resetUrl).toContain(encodeURIComponent("tok/with+chars="));
  });
});

describe("handleCreateAccount — account-already-exists path", () => {
  it("returns the friendly already-exists message and does NOT throw", async () => {
    const deps = createAccountDeps({
      signUp: vi.fn().mockRejectedValue(new Error("User already exists")),
    });
    const { result } = await handleCreateAccount(
      { to_email: "existing@example.com", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/already has a Wireline account/i);
    // It must NOT fall through to the generic snag fallback.
    expect(result).not.toMatch(/hit a snag/i);
    // No reset email when the account already exists.
    expect(deps.createPasswordResetToken).not.toHaveBeenCalled();
    expect(deps.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("treats a non-exists signUp error as a real failure (snag fallback)", async () => {
    const deps = createAccountDeps({
      signUp: vi.fn().mockRejectedValue(new Error("database connection lost")),
    });
    const { result } = await handleCreateAccount(
      { to_email: "caller@example.com", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/hit a snag creating the account/i);
    expect(deps.log.error).toHaveBeenCalled();
  });
});

describe("handleCreateAccount — reset-email send failure", () => {
  it("still reports the account was created and tells caller to use Forgot Password", async () => {
    const deps = createAccountDeps({
      sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: false }),
    });
    const { result } = await handleCreateAccount(
      { to_email: "caller@example.com", email_confirmed: true },
      deps,
    );
    expect(deps.signUp).toHaveBeenCalledTimes(1);
    expect(result).toMatch(/Account created for caller@example\.com/i);
    expect(result).toMatch(/welcome email didn't send/i);
    expect(result).toMatch(/Forgot password/i);
  });

  it("reports the Forgot Password fallback when no reset token is issued", async () => {
    const deps = createAccountDeps({
      createPasswordResetToken: vi.fn().mockResolvedValue(null),
    });
    const { result } = await handleCreateAccount(
      { to_email: "caller@example.com", email_confirmed: true },
      deps,
    );
    expect(deps.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(result).toMatch(/welcome email didn't send/i);
    expect(result).toMatch(/Forgot password/i);
  });
});

// ---------------------------------------------------------------------------
// send_payment_link
// ---------------------------------------------------------------------------

function paymentLinkDeps(overrides: Partial<SendPaymentLinkDeps> = {}): SendPaymentLinkDeps {
  return {
    sendEmail: vi.fn().mockResolvedValue({ ok: true }),
    appUrl: "https://trywireline.com",
    log: { error: vi.fn() },
    ...overrides,
  };
}

describe("handleSendPaymentLink — email guardrails", () => {
  it("rejects an unparseable email and does NOT call sendEmail", async () => {
    const deps = paymentLinkDeps();
    const { result } = await handleSendPaymentLink(
      { to_email: "garbage", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/couldn't parse that email/i);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("bounces with a read-back script when email_confirmed is missing", async () => {
    const deps = paymentLinkDeps();
    const { result } = await handleSendPaymentLink({ to_email: "caller@example.com" }, deps);
    expect(result).toMatch(/read "caller@example\.com" back/i);
    expect(result).toMatch(/email_confirmed set to true/i);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("bounces when email_confirmed is false", async () => {
    const deps = paymentLinkDeps();
    const { result } = await handleSendPaymentLink(
      { to_email: "caller@example.com", email_confirmed: false },
      deps,
    );
    expect(result).toMatch(/read .* back/i);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});

describe("handleSendPaymentLink — happy path", () => {
  it("sends the email exactly once to the confirmed address", async () => {
    const deps = paymentLinkDeps();
    const { result } = await handleSendPaymentLink(
      { to_email: "buyer@example.com", plan: "pro", email_confirmed: true },
      deps,
    );
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    const arg = (deps.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.to).toBe("buyer@example.com");
    expect(arg.subject).toMatch(/payment link/i);
    // Plan deep-links into the billing URL.
    expect(arg.text).toContain("https://trywireline.com/billing?plan=pro");
    expect(arg.html).toContain("https://trywireline.com/billing?plan=pro");
    expect(result).toMatch(/Payment link sent to buyer@example\.com/i);
  });

  it("omits the plan query param when no plan is given", async () => {
    const deps = paymentLinkDeps();
    await handleSendPaymentLink({ to_email: "buyer@example.com", email_confirmed: true }, deps);
    const arg = (deps.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.text).toContain("https://trywireline.com/billing\n");
    expect(arg.text).not.toContain("?plan=");
  });
});

describe("handleSendPaymentLink — failure paths", () => {
  it("reads the link by mouth when the transport returns ok:false", async () => {
    const deps = paymentLinkDeps({
      sendEmail: vi.fn().mockResolvedValue({ ok: false }),
    });
    const { result } = await handleSendPaymentLink(
      { to_email: "buyer@example.com", plan: "pro", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/didn't go through/i);
    expect(result).toContain("https://trywireline.com/billing?plan=pro");
    // Critically, it must NOT claim success.
    expect(result).not.toMatch(/Payment link sent/i);
  });

  it("returns the snag fallback when sendEmail throws", async () => {
    const deps = paymentLinkDeps({
      sendEmail: vi.fn().mockRejectedValue(new Error("network down")),
    });
    const { result } = await handleSendPaymentLink(
      { to_email: "buyer@example.com", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/Hit an error sending the payment link/i);
    expect(deps.log.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// send_signup_link
// ---------------------------------------------------------------------------

function signupLinkDeps(overrides: Partial<SendSignupLinkDeps> = {}): SendSignupLinkDeps {
  return {
    sendSignupLinkEmail: vi.fn().mockResolvedValue({ ok: true }),
    agentName: "Sarah",
    appUrl: "https://trywireline.com",
    log: { error: vi.fn() },
    ...overrides,
  };
}

describe("handleSendSignupLink — email guardrails", () => {
  it("rejects an unparseable email and does NOT call the sender", async () => {
    const deps = signupLinkDeps();
    const { result } = await handleSendSignupLink(
      { to_email: "nope", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/couldn't parse that email/i);
    expect(result).toMatch(/spell it out/i);
    expect(deps.sendSignupLinkEmail).not.toHaveBeenCalled();
  });

  it("bounces with a read-back-and-reconfirm script when email_confirmed is missing", async () => {
    const deps = signupLinkDeps();
    const { result } = await handleSendSignupLink({ to_email: "caller@example.com" }, deps);
    expect(result).toMatch(/confirm the address out loud/i);
    expect(result).toMatch(/read "caller@example\.com" back/i);
    expect(result).toMatch(/email_confirmed set to true/i);
    expect(deps.sendSignupLinkEmail).not.toHaveBeenCalled();
  });

  it("bounces when email_confirmed is false", async () => {
    const deps = signupLinkDeps();
    const { result } = await handleSendSignupLink(
      { to_email: "caller@example.com", email_confirmed: false },
      deps,
    );
    expect(result).toMatch(/confirm the address out loud/i);
    expect(deps.sendSignupLinkEmail).not.toHaveBeenCalled();
  });
});

describe("handleSendSignupLink — happy path", () => {
  it("sends the signup link exactly once with the right address and agent name", async () => {
    const deps = signupLinkDeps();
    const { result } = await handleSendSignupLink(
      { to_email: "caller@example.com", caller_name: "Pat", email_confirmed: true },
      deps,
    );
    expect(deps.sendSignupLinkEmail).toHaveBeenCalledTimes(1);
    expect(deps.sendSignupLinkEmail).toHaveBeenCalledWith({
      to: "caller@example.com",
      callerName: "Pat",
      agentName: "Sarah",
    });
    expect(result).toMatch(/Sign-up link sent to caller@example\.com/i);
  });
});

describe("handleSendSignupLink — failure paths", () => {
  it("reads the URL by mouth when the transport returns ok:false (never claims success)", async () => {
    const deps = signupLinkDeps({
      sendSignupLinkEmail: vi.fn().mockResolvedValue({ ok: false }),
    });
    const { result } = await handleSendSignupLink(
      { to_email: "caller@example.com", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/couldn't send the email/i);
    expect(result).toContain("https://trywireline.com/signup");
    expect(result).not.toMatch(/Sign-up link sent/i);
  });

  it("returns the call-back fallback when the sender throws", async () => {
    const deps = signupLinkDeps({
      sendSignupLinkEmail: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const { result } = await handleSendSignupLink(
      { to_email: "caller@example.com", email_confirmed: true },
      deps,
    );
    expect(result).toMatch(/Hit an error sending/i);
    expect(result).toMatch(/trywireline\.com\/signup/i);
    expect(deps.log.error).toHaveBeenCalled();
  });
});
