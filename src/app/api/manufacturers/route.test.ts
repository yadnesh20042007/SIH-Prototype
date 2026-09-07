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
    createManufacturer: vi.fn(),
    listManufacturers: vi.fn(),
  },
}));

vi.mock('@/lib/services/manufacturer.service', () => serviceMock);

import { DatabaseConflictError } from '@/lib/db/errors';
import { GET, POST } from './route';

const manufacturer = {
  id: 'manufacturer-1',
  name: 'Acme Weighing',
  country: 'India',
  registrationCode: 'ACME-01',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/manufacturers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Manufacturer collection route unit tests (mocked service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a manufacturer and returns 201', async () => {
    serviceMock.createManufacturer.mockResolvedValue(manufacturer);

    const response = await POST(
      postRequest({
        name: '  Acme Weighing  ',
        country: '  India  ',
        registrationCode: 'ACME-01',
      })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: 'manufacturer-1', name: 'Acme Weighing' });
    expect(serviceMock.createManufacturer).toHaveBeenCalledWith({
      name: 'Acme Weighing',
      country: 'India',
      registrationCode: 'ACME-01',
    });
  });

  it('returns 400 for an invalid create payload without calling the service', async () => {
    const response = await POST(postRequest({ country: 'India' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Validation failed',
      errors: [{ field: 'name', message: 'is required' }],
    });
    expect(serviceMock.createManufacturer).not.toHaveBeenCalled();
  });

  it('lists manufacturers', async () => {
    serviceMock.listManufacturers.mockResolvedValue([manufacturer]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        ...manufacturer,
        createdAt: manufacturer.createdAt.toISOString(),
        updatedAt: manufacturer.updatedAt.toISOString(),
      },
    ]);
  });

  it('maps a conflict to 409', async () => {
    serviceMock.createManufacturer.mockRejectedValue(
      new DatabaseConflictError('Manufacturer already exists with the supplied unique value')
    );

    const response = await POST(postRequest({ name: 'Duplicate' }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Manufacturer already exists with the supplied unique value',
    });
  });

  it('maps an unexpected service error to a safe 500 response', async () => {
    serviceMock.listManufacturers.mockRejectedValue(
      new Error('Database host and credentials must remain private')
    );

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
