import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    getDevelopmentTestSessionContext: vi.fn(),
  },
}));

vi.mock('@/lib/services/test-session.service', () => serviceMock);

import { DatabaseNotFoundError } from '@/lib/db/errors';
import { GET } from './route';

const context = {
  rulesetVersion: {
    id: 'ruleset-real-id',
    standard: 'OIML R76-1',
    version: '2006',
  },
  technician: {
    id: 'technician-real-id',
    name: 'Development Lab Technician',
    role: 'LAB_TECHNICIAN',
  },
  reviewer: {
    id: 'reviewer-real-id',
    name: 'Development Reviewing Officer',
    role: 'REVIEWING_OFFICER',
  },
  approver: {
    id: 'approver-real-id',
    name: 'Development Approving Officer',
    role: 'APPROVING_OFFICER',
  },
};

describe('Development TestSession context route unit tests (mocked service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the resolved active development context', async () => {
    serviceMock.getDevelopmentTestSessionContext.mockResolvedValue(context);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(context);
  });

  it('returns 404 when required bootstrap data is unavailable', async () => {
    serviceMock.getDevelopmentTestSessionContext.mockRejectedValue(
      new DatabaseNotFoundError('Active development lab technician not found')
    );

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Active development lab technician not found',
    });
  });

  it('returns a safe 500 for unexpected failures', async () => {
    serviceMock.getDevelopmentTestSessionContext.mockRejectedValue(
      new Error('Private database details')
    );

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
