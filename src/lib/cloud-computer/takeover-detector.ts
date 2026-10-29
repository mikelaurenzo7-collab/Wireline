/**
 * src/lib/cloud-computer/takeover-detector.ts
 *
 * Proactive DOM & LLM Barrier Detection for Cloud Computer.
 * Detects Cloudflare Turnstile, Google reCAPTCHA, hCaptcha, FunCaptcha, AWS WAF,
 * OTP inputs, and login challenges before actions stall.
 */

import type { Page } from "playwright-core";

export type AuthBarrierType = "captcha" | "two_factor" | "credential_required" | "owner_decision";

export interface AuthBarrierDetection {
  detected: boolean;
  barrierType: AuthBarrierType;
  provider?:
    | "cloudflare_turnstile"
    | "google_recaptcha"
    | "hcaptcha"
    | "arkose_funcaptcha"
    | "aws_waf"
    | "sms_otp"
    | "totp_authenticator"
    | "login_form";
  details: string;
  detectedAt: number;
}

/**
 * Known CSS selectors and heuristics for common authentication and anti-bot barriers.
 */
export const BARRIER_PATTERNS = {
  cloudflare: [
    'iframe[src*="challenges.cloudflare.com"]',
    "#cf-turnstile",
    ".cf-turnstile",
    "#cf-challenge-running",
    'div[class*="cf-turnstile"]',
  ],
  recaptcha: [
    'iframe[src*="google.com/recaptcha"]',
    'iframe[src*="recaptcha/api2"]',
    'iframe[src*="recaptcha/enterprise"]',
    ".g-recaptcha",
    "#g-recaptcha",
  ],
  hcaptcha: [
    'iframe[src*="hcaptcha.com"]',
    ".h-captcha",
    "#hcaptcha",
  ],
  arkose: [
    'iframe[src*="arkoselabs.com"]',
    'iframe[src*="funcaptcha"]',
    "#fc-iframe-wrap",
  ],
  awsWaf: [
    "#aws-waf-captcha",
    'iframe[src*="awswaf"]',
  ],
  twoFactorInputs: [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[name*="2fa" i]',
    'input[name*="mfa" i]',
    'input[name*="token" i]',
    'input[name*="verificationCode" i]',
    'input[id*="verificationCode" i]',
    'input[placeholder*="verification code" i]',
    'input[placeholder*="enter code" i]',
  ],
  loginIndicators: [
    'input[type="password"]',
    'input[name="password" i]',
    '#password',
    'form[action*="login" i]',
  ],
};

/**
 * Proactively inspects the current Playwright page DOM for authentication barriers.
 */
export async function detectDOMAuthBarrier(page: Page): Promise<AuthBarrierDetection | null> {
  try {
    const title = await page.title().catch(() => "");
    if (/Just a moment\.\.\.|Checking your browser\.\.\.|Attention Required! \| Cloudflare/i.test(title)) {
      return {
        detected: true,
        barrierType: "captcha",
        provider: "cloudflare_turnstile",
        details: "Cloudflare Turnstile browser challenge detected in page title",
        detectedAt: Date.now(),
      };
    }

    const detected = await page.evaluate((patterns) => {
      // 1. Cloudflare Turnstile
      for (const sel of patterns.cloudflare) {
        if (document.querySelector(sel)) {
          return { type: "captcha", provider: "cloudflare_turnstile", details: "Cloudflare Turnstile verification challenge" };
        }
      }

      // 2. Google reCAPTCHA
      for (const sel of patterns.recaptcha) {
        if (document.querySelector(sel)) {
          return { type: "captcha", provider: "google_recaptcha", details: "Google reCAPTCHA challenge" };
        }
      }

      // 3. hCaptcha
      for (const sel of patterns.hcaptcha) {
        if (document.querySelector(sel)) {
          return { type: "captcha", provider: "hcaptcha", details: "hCaptcha challenge" };
        }
      }

      // 4. Arkose FunCaptcha
      for (const sel of patterns.arkose) {
        if (document.querySelector(sel)) {
          return { type: "captcha", provider: "arkose_funcaptcha", details: "Arkose Labs FunCaptcha puzzle" };
        }
      }

      // 5. AWS WAF
      for (const sel of patterns.awsWaf) {
        if (document.querySelector(sel)) {
          return { type: "captcha", provider: "aws_waf", details: "AWS WAF Captcha" };
        }
      }

      // 6. Two-Factor / OTP Input Fields
      for (const sel of patterns.twoFactorInputs) {
        const el = document.querySelector(sel);
        if (el && (el as HTMLElement).offsetParent !== null) {
          return { type: "two_factor", provider: "sms_otp", details: "One-time verification code input required" };
        }
      }

      // 7. Full-page text check for 2FA prompts
      const bodyText = document.body ? document.body.innerText.slice(0, 4000) : "";
      if (
        /enter the (\d-digit )?(verification|security) code|two-factor authentication|we texted a code to|check your authenticator app|verification code sent to/i.test(
          bodyText,
        )
      ) {
        return { type: "two_factor", provider: "sms_otp", details: "Two-factor verification prompt on page" };
      }

      // 8. Login Form
      const passwordField = document.querySelector('input[type="password"]');
      if (passwordField && (passwordField as HTMLElement).offsetParent !== null) {
        return { type: "credential_required", provider: "login_form", details: "Portal login credentials required" };
      }

      return null;
    }, BARRIER_PATTERNS);

    if (detected) {
      return {
        detected: true,
        barrierType: detected.type as AuthBarrierType,
        provider: detected.provider as any,
        details: detected.details,
        detectedAt: Date.now(),
      };
    }
  } catch {
    // Fail safe on transient execution issues (e.g. navigation in progress)
  }
  return null;
}

/**
 * Classifies an LLM ask_owner question to determine if it is an auth barrier.
 */
export function classifyBarrierFromQuestion(question: string): AuthBarrierDetection {
  const q = question.toLowerCase();

  if (
    q.includes("captcha") ||
    q.includes("turnstile") ||
    q.includes("recaptcha") ||
    q.includes("hcaptcha") ||
    q.includes("puzzle") ||
    q.includes("robot")
  ) {
    return {
      detected: true,
      barrierType: "captcha",
      provider: q.includes("turnstile")
        ? "cloudflare_turnstile"
        : q.includes("recaptcha")
          ? "google_recaptcha"
          : q.includes("hcaptcha")
            ? "hcaptcha"
            : undefined,
      details: question,
      detectedAt: Date.now(),
    };
  }

  if (
    q.includes("2fa") ||
    q.includes("mfa") ||
    q.includes("two-factor") ||
    q.includes("two factor") ||
    q.includes("verification code") ||
    q.includes("authentication code") ||
    q.includes("security code") ||
    q.includes("one-time code") ||
    q.includes("passcode") ||
    q.includes("otp") ||
    q.includes("text message code") ||
    q.includes("authenticator")
  ) {
    return {
      detected: true,
      barrierType: "two_factor",
      provider: q.includes("authenticator") ? "totp_authenticator" : "sms_otp",
      details: question,
      detectedAt: Date.now(),
    };
  }

  if (
    q.includes("password") ||
    q.includes("sign in") ||
    q.includes("log in") ||
    q.includes("credentials") ||
    q.includes("username")
  ) {
    return {
      detected: true,
      barrierType: "credential_required",
      provider: "login_form",
      details: question,
      detectedAt: Date.now(),
    };
  }

  return {
    detected: true,
    barrierType: "owner_decision",
    details: question,
    detectedAt: Date.now(),
  };
}
