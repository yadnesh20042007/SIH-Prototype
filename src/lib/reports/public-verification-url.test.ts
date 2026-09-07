import { afterEach, describe, expect, it } from 'vitest';

import {
  publicAppUrl,
  publicVerificationPath,
  publicVerificationUrl,
  verificationUrlArtifactKey,
} from './public-verification-url';

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe('Public verification URL', () => {
  it('uses NEXT_PUBLIC_APP_URL and the QR identifier', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://sih-prototype-xi-eight.vercel.app/';
    expect(publicAppUrl()).toBe('https://sih-prototype-xi-eight.vercel.app');
    expect(publicVerificationPath('public-qr-token')).toBe('/verify/public-qr-token');
    expect(publicVerificationUrl('public-qr-token')).toBe(
      'https://sih-prototype-xi-eight.vercel.app/verify/public-qr-token'
    );
    expect(publicVerificationUrl('public-qr-token')).not.toContain('internal-report-id');
  });

  it('falls back to the local development origin only when the variable is absent', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(publicVerificationUrl('public-qr-token')).toBe(
      'http://localhost:3000/verify/public-qr-token'
    );
  });

  it('rejects a configured URL that is not a clean HTTP origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test/application?source=bad';
    expect(() => publicVerificationUrl('public-qr-token')).toThrow(/must be an origin/);
  });

  it('changes the artifact key when the public application origin changes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://first.example.test';
    const first = verificationUrlArtifactKey('public-qr-token');
    process.env.NEXT_PUBLIC_APP_URL = 'https://second.example.test';
    expect(verificationUrlArtifactKey('public-qr-token')).not.toBe(first);
  });
});
