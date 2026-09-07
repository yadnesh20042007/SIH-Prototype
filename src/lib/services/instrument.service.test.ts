import { beforeEach, describe, expect, it, vi } from 'vitest';

const { instrumentMock } = vi.hoisted(() => ({
  instrumentMock: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { instrument: instrumentMock },
}));

import {
  DatabaseConflictError,
  DatabaseError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  createInstrument,
  getInstrumentById,
  listInstruments,
  updateInstrument,
} from './instrument.service';

function decimal(value: string) {
  return { toString: () => value };
}

const manufacturer = {
  id: 'manufacturer-1',
  name: 'Acme Weighing',
  country: null,
  registrationCode: 'ACME-01',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const persistedInstrument = {
  id: 'instrument-1',
  manufacturerId: manufacturer.id,
  manufacturer,
  model: 'Precision 1000',
  serialNumber: null,
  accuracyClass: 'III',
  instrumentType: 'SINGLE_RANGE',
  max: decimal('1000.000001'),
  min: decimal('0.000001'),
  e: decimal('0.00000001'),
  d: decimal('0.000000001'),
  numberOfSupportPoints: 4,
  additiveTareEffect: false,
  hasAutoZeroOrTracking: true,
  hasInitialZeroSettingDevice: false,
  initialZeroSettingRange: decimal('0.200000'),
  hasFineDisplayDevice: false,
  registeredById: null,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-02T00:00:00.000Z'),
};

const createInput = {
  manufacturerId: manufacturer.id,
  model: 'Precision 1000',
  accuracyClass: 'III' as const,
  instrumentType: 'SINGLE_RANGE' as const,
  max: '1000.000001',
  min: '0.000001',
  e: '0.00000001',
  d: '0.000000001',
};

describe('Instrument service unit tests (mocked Prisma)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an instrument and includes its manufacturer', async () => {
    instrumentMock.create.mockResolvedValue(persistedInstrument);

    const result = await createInstrument(createInput);

    expect(result).toMatchObject({
      id: 'instrument-1',
      model: 'Precision 1000',
      manufacturer: {
        id: 'manufacturer-1',
        name: 'Acme Weighing',
        country: null,
        registrationCode: 'ACME-01',
      },
    });
    expect(instrumentMock.create).toHaveBeenCalledWith({
      data: createInput,
      include: { manufacturer: true },
    });
  });

  it('lists instruments with manufacturer registry data', async () => {
    instrumentMock.findMany.mockResolvedValue([persistedInstrument]);

    const result = await listInstruments();

    expect(result).toHaveLength(1);
    expect(result[0]?.manufacturer.name).toBe('Acme Weighing');
    expect(instrumentMock.findMany).toHaveBeenCalledWith({ include: { manufacturer: true } });
  });

  it('gets an instrument by ID', async () => {
    instrumentMock.findUnique.mockResolvedValue(persistedInstrument);

    await expect(getInstrumentById('instrument-1')).resolves.toMatchObject({
      id: 'instrument-1',
      manufacturerId: 'manufacturer-1',
    });
    expect(instrumentMock.findUnique).toHaveBeenCalledWith({
      where: { id: 'instrument-1' },
      include: { manufacturer: true },
    });
  });

  it('maps a missing instrument to a safe not-found error', async () => {
    instrumentMock.findUnique.mockResolvedValue(null);

    await expect(getInstrumentById('missing')).rejects.toBeInstanceOf(DatabaseNotFoundError);
    await expect(getInstrumentById('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Instrument not found',
    });
  });

  it('updates an instrument and preserves nullable fields', async () => {
    const input = { serialNumber: null, hasFineDisplayDevice: true };
    instrumentMock.update.mockResolvedValue({
      ...persistedInstrument,
      serialNumber: null,
      hasFineDisplayDevice: true,
    });

    const result = await updateInstrument('instrument-1', input);

    expect(result.serialNumber).toBeNull();
    expect(result.hasFineDisplayDevice).toBe(true);
    expect(instrumentMock.update).toHaveBeenCalledWith({
      where: { id: 'instrument-1' },
      data: input,
      include: { manufacturer: true },
    });
  });

  it('maps a manufacturer foreign-key failure safely', async () => {
    instrumentMock.create.mockRejectedValue({
      code: 'P2003',
      message: 'Raw manufacturer foreign-key details',
    });

    await expect(createInstrument(createInput)).rejects.toBeInstanceOf(DatabaseForeignKeyError);
    await expect(createInstrument(createInput)).rejects.toMatchObject({
      code: 'FOREIGN_KEY',
      message: 'Instrument references a related record that does not exist',
    });
  });

  it('returns every Decimal as an exact string without numeric coercion', async () => {
    const precise = {
      ...persistedInstrument,
      max: decimal('9007199254740993.123456'),
      min: decimal('0.000000000000000001'),
      e: decimal('0.000000010000000001'),
      d: decimal('0.000000001000000001'),
      initialZeroSettingRange: decimal('0.123456789012345678'),
    };
    instrumentMock.findUnique.mockResolvedValue(precise);

    const result = await getInstrumentById('instrument-1');

    expect(result).toMatchObject({
      max: '9007199254740993.123456',
      min: '0.000000000000000001',
      e: '0.000000010000000001',
      d: '0.000000001000000001',
      initialZeroSettingRange: '0.123456789012345678',
    });
  });

  it('maps unique-constraint failures without exposing Prisma details', async () => {
    instrumentMock.update.mockRejectedValue({ code: 'P2002', message: 'Raw Prisma error' });

    await expect(updateInstrument('instrument-1', { model: 'Updated' })).rejects.toBeInstanceOf(
      DatabaseConflictError
    );
  });

  it('maps unexpected database failures to a generic safe error', async () => {
    instrumentMock.findMany.mockRejectedValue(new Error('Connection details'));

    await expect(listInstruments()).rejects.toEqual(
      expect.objectContaining({
        name: 'DatabaseError',
        code: 'DATABASE_ERROR',
        message: 'Unable to complete the instrument database operation',
      })
    );
    await expect(listInstruments()).rejects.toBeInstanceOf(DatabaseError);
  });
});
