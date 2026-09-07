import { createHash } from 'node:crypto';

const LOCAL_DEVELOPMENT_APP_URL = 'http://localhost:3000';

export function publicAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || LOCAL_DEVELOPMENT_APP_URL;
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('NEXT_PUBLIC_APP_URL must be an origin without credentials, path, query, or fragment');
  }
  return url.origin;
}

export function publicVerificationPath(qrVerificationId: string): string {
  return `/verify/${encodeURIComponent(qrVerificationId)}`;
}

export function publicVerificationUrl(qrVerificationId: string): string {
  return `${publicAppUrl()}${publicVerificationPath(qrVerificationId)}`;
}

export function verificationUrlArtifactKey(qrVerificationId: string): string {
  return createHash('sha256').update(publicVerificationUrl(qrVerificationId)).digest('hex').slice(0, 12);
}
