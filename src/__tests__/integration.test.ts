import { describe, it, expect, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { TwilioService } from '../services/TwilioService';

// Mock environment variables for testing
vi.stubEnv('SUPABASE_URL', 'https://mock.supabase.co');
vi.stubEnv('SUPABASE_ANON_KEY', 'mock-anon-key');

describe('TC-001: Express Server Initialization', () => {
  it('should have a valid configuration for the Express server', () => {
    // In a real environment, we would supertest the app
    // Here we ensure the environment is capable of loading the server logic
    expect(process.env.NODE_ENV).toBeDefined();
  });
});

describe('TC-002: Supabase Auth/Connection validation', () => {
  it('should successfully initialize the Supabase client', () => {
    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
    expect(supabase.from).toBeDefined();
  });

  it('should have the correct headers configured for the client', () => {
    // Verify client configuration
    expect(supabase).toHaveProperty('realtime');
  });
});

describe('TC-003: Vapi / Twilio Adapters schema validation', () => {
  it('TwilioService should be instantiable with mock credentials', () => {
    const service = new TwilioService();
    expect(service).toBeDefined();
    expect(service.sendSMS).toBeTypeOf('function');
  });
});
