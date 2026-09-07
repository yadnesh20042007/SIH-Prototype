import { describe, expect, it } from 'vitest';

import { friendlyRoleName, roleRedirect } from './roles';

describe('role redirects', () => {
  it.each([
    ['LAB_TECHNICIAN', '/'], ['REVIEWING_OFFICER', '/review'],
    ['APPROVING_OFFICER', '/approval'], ['ADMIN', '/'],
  ] as const)('maps %s to a fixed portal', (role, destination) => {
    expect(roleRedirect(role)).toBe(destination);
  });

  it.each([
    ['LAB_TECHNICIAN', 'Lab Technician'], ['REVIEWING_OFFICER', 'Reviewing Officer'],
    ['APPROVING_OFFICER', 'Approving Officer'], ['ADMIN', 'Administrator'],
  ] as const)('formats %s for display', (role, label) => {
    expect(friendlyRoleName(role)).toBe(label);
  });
});
