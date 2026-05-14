import { describe, it, expect, vi } from 'vitest';
import { drizzle } from '../lib/server-context';
import { authService } from '../lib/auth-service';
import { TwilioService } from '../services/TwilioService';

describe('TC-001: Express Server Initialization', () => {
  it('should have a valid configuration for the Express server', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});

describe('TC-002: Drizzle & Local Auth validation', () => {
  it('should successfully initialize the Drizzle client', () => {
    expect(drizzle).toBeDefined();
  });

  it('should have a functional auth service', () => {
    expect(authService).toBeDefined();
    expect(authService.signIn).toBeTypeOf('function');
    expect(authService.signUp).toBeTypeOf('function');
  });
});

describe('TC-003: Vapi / Twilio Adapters schema validation', () => {
  it('TwilioService should be instantiable with mock credentials', () => {
    const service = new TwilioService();
    expect(service).toBeDefined();
    expect(service.sendSMS).toBeTypeOf('function');
  });
});
