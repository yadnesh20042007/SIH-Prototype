const LOCAL_DEVELOPMENT_APP_URL = 'http://localhost:3000';
export const PRODUCTION_APP_URL = 'https://metrify-nawi-system.vercel.app';

export function publicAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('NEXT_PUBLIC_APP_URL must use HTTP or HTTPS');
    }
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
      throw new Error('NEXT_PUBLIC_APP_URL must be an origin without credentials, path, query, or fragment');
    }
    return url.origin;
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return PRODUCTION_APP_URL;
  }
  return LOCAL_DEVELOPMENT_APP_URL;
}

export function publicVerificationPath(qrVerificationId: string): string {
  return `/verify/${encodeURIComponent(qrVerificationId)}`;
}

export function publicVerificationUrl(qrVerificationId: string): string {
  return `${publicAppUrl()}${publicVerificationPath(qrVerificationId)}`;
}
