import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSessionResultFreshness: vi.fn() }));
vi.mock('@/lib/services/result-freshness.service', () => mocks);
import { DatabaseNotFoundError } from '@/lib/db/errors';
import { GET } from './route';

describe('Result freshness API (mocked service)', () => {
  beforeEach(() => vi.resetAllMocks());
  it('returns server freshness without cache or browser evidence', async () => {
    mocks.getSessionResultFreshness.mockResolvedValue([{ testType: 'REPEATABILITY', state: 'STALE' }]);
    const response = await GET(new Request('http://localhost/api/test-results/freshness?testSessionId=%20s%20'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual([{ testType: 'REPEATABILITY', state: 'STALE' }]);
    expect(mocks.getSessionResultFreshness).toHaveBeenCalledWith('s');
  });
  it('rejects missing IDs', async () => {
    expect((await GET(new Request('http://localhost/api/test-results/freshness'))).status).toBe(400);
  });
  it('maps missing sessions to 404', async () => {
    mocks.getSessionResultFreshness.mockRejectedValue(new DatabaseNotFoundError('TestSession not found'));
    expect((await GET(new Request('http://localhost/api/test-results/freshness?testSessionId=s'))).status).toBe(404);
  });
  it('returns safe database errors', async () => {
    mocks.getSessionResultFreshness.mockRejectedValue(new Error('Private database information'));
    const response = await GET(new Request('http://localhost/api/test-results/freshness?testSessionId=s'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
