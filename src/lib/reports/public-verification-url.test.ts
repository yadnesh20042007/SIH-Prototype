import { afterEach, describe, expect, it } from 'vitest';

import {
  publicAppUrl,
  publicVerificationPath,
  publicVerificationUrl,
} from './public-verification-url';

const env = process.env as Record<string, string | undefined>;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalVercel = process.env.VERCEL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;

  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;

  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

describe('Public verification URL', () => {
  it('uses NEXT_PUBLIC_APP_URL and the QR identifier when configured', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://metrify-nawi-system.vercel.app/';
    expect(publicAppUrl()).toBe('https://metrify-nawi-system.vercel.app');
    expect(publicVerificationPath('public-qr-token')).toBe('/verify/public-qr-token');
    expect(publicVerificationUrl('public-qr-token')).toBe(
      'https://metrify-nawi-system.vercel.app/verify/public-qr-token'
    );
    expect(publicVerificationUrl('public-qr-token')).not.toContain('internal-report-id');
  });

  it('falls back to the local development origin in non-production environments when NEXT_PUBLIC_APP_URL is absent', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'test';
    delete process.env.VERCEL;
    expect(publicAppUrl()).toBe('http://localhost:3000');
    expect(publicVerificationUrl('public-qr-token')).toBe(
      'http://localhost:3000/verify/public-qr-token'
    );
  });

  it('falls back to the production origin in production environment when NEXT_PUBLIC_APP_URL is absent', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'production';
    expect(publicAppUrl()).toBe('https://metrify-nawi-system.vercel.app');
    expect(publicVerificationUrl('public-qr-token')).toBe(
      'https://metrify-nawi-system.vercel.app/verify/public-qr-token'
    );
  });

  it('rejects a configured URL that is not a clean HTTP origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test/application?source=bad';
    expect(() => publicVerificationUrl('public-qr-token')).toThrow(/must be an origin/);
  });
});
