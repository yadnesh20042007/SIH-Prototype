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
    getInstrumentById: vi.fn(),
    updateInstrument: vi.fn(),
  },
}));

vi.mock('@/lib/services/instrument.service', () => serviceMock);

import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import { GET, PATCH } from './route';

const instrument = {
  id: 'instrument-1',
  manufacturerId: 'manufacturer-1',
  model: 'Precision 1000',
  serialNumber: null,
  accuracyClass: 'III',
  instrumentType: 'SINGLE_RANGE',
  max: '1000.000000',
  min: '0.000001',
  e: '0.00000001',
  d: '0.000000001',
  numberOfSupportPoints: 4,
  additiveTareEffect: false,
  hasAutoZeroOrTracking: false,
  hasInitialZeroSettingDevice: false,
  initialZeroSettingRange: '0.200000',
  hasFineDisplayDevice: false,
  registeredById: null,
  manufacturer: {
    id: 'manufacturer-1',
    name: 'Acme Weighing',
    country: null,
    registrationCode: null,
  },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/instruments/instrument-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Instrument item route unit tests (mocked service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gets an instrument by ID', async () => {
    serviceMock.getInstrumentById.mockResolvedValue(instrument);

    const response = await GET(
      new Request('http://localhost/api/instruments/instrument-1'),
      context('instrument-1')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'instrument-1',
      max: '1000.000000',
    });
    expect(serviceMock.getInstrumentById).toHaveBeenCalledWith('instrument-1');
  });

  it('maps instrument not found to 404', async () => {
    serviceMock.getInstrumentById.mockRejectedValue(
      new DatabaseNotFoundError('Instrument not found')
    );

    const response = await GET(
      new Request('http://localhost/api/instruments/missing'),
      context('missing')
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Instrument not found' });
  });

  it('patches an instrument with validated data', async () => {
    const updated = { ...instrument, model: 'Precision 2000', e: '0.00000002' };
    serviceMock.updateInstrument.mockResolvedValue(updated);

    const response = await PATCH(
      patchRequest({ model: '  Precision 2000  ', e: '0.00000002' }),
      context('instrument-1')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ model: 'Precision 2000', e: '0.00000002' });
    expect(serviceMock.updateInstrument).toHaveBeenCalledWith('instrument-1', {
      model: 'Precision 2000',
      e: '0.00000002',
    });
  });

  it('returns 400 for an invalid patch without calling the service', async () => {
    const response = await PATCH(patchRequest({ d: '0' }), context('instrument-1'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Validation failed',
      errors: [{ field: 'd', message: 'must be greater than 0' }],
    });
    expect(serviceMock.updateInstrument).not.toHaveBeenCalled();
  });

  it('maps a conflict to 409', async () => {
    serviceMock.updateInstrument.mockRejectedValue(
      new DatabaseConflictError('Instrument already exists with the supplied unique value')
    );

    const response = await PATCH(patchRequest({ model: 'Updated' }), context('instrument-1'));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Instrument already exists with the supplied unique value',
    });
  });

  it('returns 400 for an invalid route ID', async () => {
    const response = await GET(
      new Request('http://localhost/api/instruments/invalid'),
      context('   ')
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid instrument ID' });
    expect(serviceMock.getInstrumentById).not.toHaveBeenCalled();
  });
});
