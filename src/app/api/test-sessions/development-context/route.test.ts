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
      new DatabaseNotFoundError('Active OIML R76-1:2006 prototype ruleset not found')
    );

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Active OIML R76-1:2006 prototype ruleset not found',
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
