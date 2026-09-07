import type { Role } from '@prisma/client';

const ROLE_REDIRECTS: Record<Role, string> = {
  LAB_TECHNICIAN: '/',
  REVIEWING_OFFICER: '/review',
  APPROVING_OFFICER: '/approval',
  ADMIN: '/',
};

const FRIENDLY_ROLE_NAMES: Record<Role, string> = {
  LAB_TECHNICIAN: 'Lab Technician',
  REVIEWING_OFFICER: 'Reviewing Officer',
  APPROVING_OFFICER: 'Approving Officer',
  ADMIN: 'Administrator',
};

export function roleRedirect(role: Role): string {
  return ROLE_REDIRECTS[role];
}

export function friendlyRoleName(role: Role): string {
  return FRIENDLY_ROLE_NAMES[role];
}
