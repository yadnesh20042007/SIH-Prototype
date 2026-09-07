import type { Role } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { roleRedirect } from '@/lib/auth/roles';
import {
  AUTH_COOKIE_NAME,
  getAuthenticatedUserFromToken,
  type AuthenticatedUser,
} from '@/lib/auth/session';

const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/reports/verify/'];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function allowedPageRoles(pathname: string): readonly Role[] | null {
  if (pathname === '/' || pathname.startsWith('/evaluate/')) return ['LAB_TECHNICIAN', 'ADMIN'];
  if (pathname.startsWith('/review')) return ['REVIEWING_OFFICER', 'ADMIN'];
  if (pathname.startsWith('/approval')) return ['APPROVING_OFFICER', 'ADMIN'];
  if (pathname.startsWith('/admin')) return ['ADMIN'];
  if (pathname.startsWith('/reports')) return ['LAB_TECHNICIAN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER', 'ADMIN'];
  return null;
}

async function requestUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return token ? getAuthenticatedUserFromToken(token) : null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/') && isPublicApi(pathname)) return NextResponse.next();

  const user = await requestUser(request);

  if (pathname === '/login') {
    return user
      ? NextResponse.redirect(new URL(roleRedirect(user.role), request.url))
      : NextResponse.next();
  }

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const allowedRoles = allowedPageRoles(pathname);
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return NextResponse.redirect(new URL(roleRedirect(user.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/review/:path*', '/approval/:path*', '/admin/:path*', '/reports/:path*', '/evaluate/:path*', '/api/:path*'],
};
