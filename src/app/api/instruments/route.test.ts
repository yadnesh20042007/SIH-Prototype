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
    createInstrument: vi.fn(),
    listInstruments: vi.fn(),
  },
}));

vi.mock('@/lib/services/instrument.service', () => serviceMock);

import { DatabaseForeignKeyError } from '@/lib/db/errors';
import { GET, POST } from './route';

const validCreate = {
  manufacturerId: 'manufacturer-1',
  model: 'Precision 1000',
  accuracyClass: 'III',
  instrumentType: 'SINGLE_RANGE',
  max: '9007199254740993.123456',
  min: '0.000001',
  e: '0.00000001',
  d: '0.000000001',
  initialZeroSettingRange: '0.200000',
};

const instrument = {
  id: 'instrument-1',
  ...validCreate,
  serialNumber: null,
  numberOfSupportPoints: 4,
  additiveTareEffect: false,
  hasAutoZeroOrTracking: false,
  hasInitialZeroSettingDevice: false,
  hasFineDisplayDevice: false,
  registeredById: null,
  manufacturer: {
    id: 'manufacturer-1',
    name: 'Acme Weighing',
    country: null,
    registrationCode: 'ACME-01',
  },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/instruments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Instrument collection route unit tests (mocked service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an instrument and returns 201', async () => {
    serviceMock.createInstrument.mockResolvedValue(instrument);

    const response = await POST(postRequest(validCreate));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: 'instrument-1', model: 'Precision 1000' });
    expect(serviceMock.createInstrument).toHaveBeenCalledWith(validCreate, 'authenticated-user');
  });

  it('preserves exact decimal strings in the create response', async () => {
    serviceMock.createInstrument.mockResolvedValue(instrument);

    const response = await POST(postRequest(validCreate));
    const body = await response.json();

    expect(body).toMatchObject({
      max: '9007199254740993.123456',
      min: '0.000001',
      e: '0.00000001',
      d: '0.000000001',
      initialZeroSettingRange: '0.200000',
    });
  });

  it('returns 400 for an invalid create payload', async () => {
    const response = await POST(postRequest({ ...validCreate, model: '   ' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Validation failed',
      errors: [{ field: 'model', message: 'is required' }],
    });
    expect(serviceMock.createInstrument).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid enum', async () => {
    const response = await POST(postRequest({ ...validCreate, accuracyClass: 'V' }));

    expect(response.status).toBe(400);
    expect((await response.json()).errors[0]).toMatchObject({ field: 'accuracyClass' });
  });

  it('returns 400 when min is greater than or equal to max', async () => {
    const response = await POST(postRequest({ ...validCreate, min: '100', max: '100' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      errors: [{ field: 'min', message: 'must be less than max' }],
    });
  });

  it('lists instruments with HTTP 200', async () => {
    serviceMock.listInstruments.mockResolvedValue([instrument]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'instrument-1',
      manufacturer: { id: 'manufacturer-1', name: 'Acme Weighing' },
    });
  });

  it('maps a missing manufacturer foreign key to a safe client error', async () => {
    serviceMock.createInstrument.mockRejectedValue(
      new DatabaseForeignKeyError('Instrument references a related record that does not exist')
    );

    const response = await POST(postRequest(validCreate));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Instrument references a related record that does not exist',
    });
  });

  it('maps an unexpected service error to a safe 500 response', async () => {
    serviceMock.listInstruments.mockRejectedValue(new Error('Private database details'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });

  it('returns 400 for malformed JSON', async () => {
    const request = new Request('http://localhost/api/instruments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
  });
});
