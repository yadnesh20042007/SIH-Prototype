import { beforeEach, describe, expect, it, vi } from 'vitest';


vi.mock('@/lib/auth/api-access', () => ({
  requireApiUser: vi.fn(async () => ({ authorized: true, user: { id: 'authenticated-user', name: 'Authenticated User', email: 'user@example.test', role: 'ADMIN' } })),
  technicianOwnsSession: vi.fn(async () => true),
  technicianOwnsObservation: vi.fn(async () => true),
  technicianOwnsResult: vi.fn(async () => true),
  forbiddenOwnership: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
}));
const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    getManufacturerById: vi.fn(),
    updateManufacturer: vi.fn(),
  },
}));

vi.mock('@/lib/services/manufacturer.service', () => serviceMock);

import { DatabaseNotFoundError } from '@/lib/db/errors';
import { GET, PATCH } from './route';

const manufacturer = {
  id: 'manufacturer-1',
  name: 'Acme Weighing',
  country: null,
  registrationCode: 'ACME-01',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/manufacturers/manufacturer-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Manufacturer item route unit tests (mocked service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gets a manufacturer by ID', async () => {
    serviceMock.getManufacturerById.mockResolvedValue(manufacturer);

    const response = await GET(
      new Request('http://localhost/api/manufacturers/manufacturer-1'),
      context('manufacturer-1')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'manufacturer-1', country: null });
    expect(serviceMock.getManufacturerById).toHaveBeenCalledWith('manufacturer-1');
  });

  it('maps manufacturer not found to 404', async () => {
    serviceMock.getManufacturerById.mockRejectedValue(
      new DatabaseNotFoundError('Manufacturer not found')
    );

    const response = await GET(
      new Request('http://localhost/api/manufacturers/missing'),
      context('missing')
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Manufacturer not found' });
  });

  it('patches a manufacturer with validated normalized data', async () => {
    const updated = { ...manufacturer, country: 'Germany' };
    serviceMock.updateManufacturer.mockResolvedValue(updated);

    const response = await PATCH(
      patchRequest({ country: '  Germany  ' }),
      context('manufacturer-1')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'manufacturer-1', country: 'Germany' });
    expect(serviceMock.updateManufacturer).toHaveBeenCalledWith('manufacturer-1', {
      country: 'Germany',
    });
  });

  it('returns 400 for an invalid patch payload without calling the service', async () => {
    const response = await PATCH(patchRequest({ name: '   ' }), context('manufacturer-1'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Validation failed',
      errors: [{ field: 'name', message: 'is required' }],
    });
    expect(serviceMock.updateManufacturer).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty route ID', async () => {
    const response = await GET(
      new Request('http://localhost/api/manufacturers/invalid'),
      context('   ')
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid manufacturer ID' });
    expect(serviceMock.getManufacturerById).not.toHaveBeenCalled();
  });
});
