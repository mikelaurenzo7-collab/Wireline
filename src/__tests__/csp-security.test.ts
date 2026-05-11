/**
 * CSP Security Tests
 * 
 * Verifies that Content Security Policy headers do not contain unsafe directives
 * that could enable XSS attacks. Tests both the static vercel.json configuration
 * and the runtime Express CSP generation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCSP } from "../lib/csp";

describe("CSP Security", () => {
  it("vercel.json CSP header must not contain unsafe-inline or unsafe-eval in script-src", () => {
    const vercelConfigPath = resolve(process.cwd(), "vercel.json");
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf-8"));
    
    // Find the CSP header in the headers array
    let cspHeader: string | undefined;
    for (const headerGroup of vercelConfig.headers || []) {
      for (const header of headerGroup.headers || []) {
        if (header.key === "Content-Security-Policy") {
          cspHeader = header.value;
          break;
        }
      }
      if (cspHeader) break;
    }
    
    expect(cspHeader, "CSP header must be defined in vercel.json").toBeDefined();
    
    // Extract script-src directive (the critical one for XSS)
    const scriptSrcMatch = cspHeader!.match(/script-src\s+([^;]+)/);
    expect(scriptSrcMatch, "script-src directive must be present").toBeTruthy();
    
    const scriptSrc = scriptSrcMatch![1];
    expect(scriptSrc, "script-src must not contain 'unsafe-inline'").not.toMatch(/'unsafe-inline'/);
    expect(scriptSrc, "script-src must not contain 'unsafe-eval'").not.toMatch(/'unsafe-eval'/);
  });

  it("Express buildCSP (prod mode) must not contain unsafe-inline or unsafe-eval in script-src", () => {
    const isDev = false;
    const csp = buildCSP(isDev);
    
    // Extract script-src directive
    const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/);
    expect(scriptSrcMatch, "script-src directive must be present").toBeTruthy();
    
    const scriptSrc = scriptSrcMatch![1];
    expect(scriptSrc).not.toMatch(/'unsafe-inline'/);
    expect(scriptSrc).not.toMatch(/'unsafe-eval'/);
  });

  it("Express buildCSP (prod mode with nonce) must use nonce-based script-src", () => {
    const isDev = false;
    const nonce = "test-nonce-12345";
    const csp = buildCSP(isDev, nonce);
    
    // Extract script-src directive
    const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/);
    expect(scriptSrcMatch).toBeTruthy();
    
    const scriptSrc = scriptSrcMatch![1];
    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc).not.toMatch(/'unsafe-inline'/);
    expect(scriptSrc).not.toMatch(/'unsafe-eval'/);
  });

  it("vercel.json must include Cross-Origin-Opener-Policy header", () => {
    const vercelConfigPath = resolve(process.cwd(), "vercel.json");
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf-8"));
    
    let coopHeader: string | undefined;
    for (const headerGroup of vercelConfig.headers || []) {
      for (const header of headerGroup.headers || []) {
        if (header.key === "Cross-Origin-Opener-Policy") {
          coopHeader = header.value;
          break;
        }
      }
      if (coopHeader) break;
    }
    
    expect(coopHeader, "Cross-Origin-Opener-Policy must be defined").toBeDefined();
    expect(coopHeader).toBe("same-origin");
  });

  it("vercel.json must include Cross-Origin-Resource-Policy header", () => {
    const vercelConfigPath = resolve(process.cwd(), "vercel.json");
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf-8"));
    
    let corpHeader: string | undefined;
    for (const headerGroup of vercelConfig.headers || []) {
      for (const header of headerGroup.headers || []) {
        if (header.key === "Cross-Origin-Resource-Policy") {
          corpHeader = header.value;
          break;
        }
      }
      if (corpHeader) break;
    }
    
    expect(corpHeader, "Cross-Origin-Resource-Policy must be defined").toBeDefined();
    expect(corpHeader).toBe("same-origin");
  });

  it("vercel.json must include Origin-Agent-Cluster header", () => {
    const vercelConfigPath = resolve(process.cwd(), "vercel.json");
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf-8"));
    
    let oacHeader: string | undefined;
    for (const headerGroup of vercelConfig.headers || []) {
      for (const header of headerGroup.headers || []) {
        if (header.key === "Origin-Agent-Cluster") {
          oacHeader = header.value;
          break;
        }
      }
      if (oacHeader) break;
    }
    
    expect(oacHeader, "Origin-Agent-Cluster must be defined").toBeDefined();
    expect(oacHeader).toBe("?1");
  });
});
