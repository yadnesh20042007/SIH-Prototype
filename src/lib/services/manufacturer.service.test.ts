import { beforeEach, describe, expect, it, vi } from 'vitest';

const { manufacturerMock } = vi.hoisted(() => ({
  manufacturerMock: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { manufacturer: manufacturerMock },
}));

import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import {
  createManufacturer,
  getManufacturerById,
  listManufacturers,
  updateManufacturer,
} from './manufacturer.service';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');
const manufacturer = {
  id: 'manufacturer-1',
  name: 'Acme Weighing',
  country: null,
  registrationCode: 'ACME-01',
  createdAt,
  updatedAt,
};

describe('Manufacturer service unit tests (mocked Prisma)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a manufacturer from an already validated input', async () => {
    const input = {
      name: 'Acme Weighing',
      country: null,
      registrationCode: 'ACME-01',
    };
    manufacturerMock.create.mockResolvedValue(manufacturer);

    await expect(createManufacturer(input)).resolves.toEqual(manufacturer);
    expect(manufacturerMock.create).toHaveBeenCalledWith({ data: input });
  });

  it('lists manufacturers as application records', async () => {
    manufacturerMock.findMany.mockResolvedValue([
      manufacturer,
      { ...manufacturer, id: 'manufacturer-2', registrationCode: null },
    ]);

    const result = await listManufacturers();

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ id: 'manufacturer-2', registrationCode: null });
    expect(manufacturerMock.findMany).toHaveBeenCalledOnce();
  });

  it('gets a manufacturer by ID', async () => {
    manufacturerMock.findUnique.mockResolvedValue(manufacturer);

    await expect(getManufacturerById('manufacturer-1')).resolves.toEqual(manufacturer);
    expect(manufacturerMock.findUnique).toHaveBeenCalledWith({ where: { id: 'manufacturer-1' } });
  });

  it('maps a missing manufacturer to a not-found application error', async () => {
    manufacturerMock.findUnique.mockResolvedValue(null);

    await expect(getManufacturerById('missing')).rejects.toEqual(
      expect.objectContaining({
        name: 'DatabaseNotFoundError',
        code: 'NOT_FOUND',
        message: 'Manufacturer not found',
      })
    );
  });

  it('updates a manufacturer with an already validated partial input', async () => {
    const input = { country: 'India', registrationCode: null };
    const updated = { ...manufacturer, country: 'India', registrationCode: null };
    manufacturerMock.update.mockResolvedValue(updated);

    await expect(updateManufacturer('manufacturer-1', input)).resolves.toEqual(updated);
    expect(manufacturerMock.update).toHaveBeenCalledWith({
      where: { id: 'manufacturer-1' },
      data: input,
    });
  });

  it('maps a unique-constraint failure without exposing the Prisma error', async () => {
    manufacturerMock.create.mockRejectedValue({
      code: 'P2002',
      message: 'Raw database details that callers must not receive',
      meta: { target: ['registrationCode'] },
    });

    const operation = createManufacturer({ name: 'Duplicate', registrationCode: 'ACME-01' });

    await expect(operation).rejects.toBeInstanceOf(DatabaseConflictError);
    await expect(operation).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Manufacturer already exists with the supplied unique value',
    });
  });

  it('maps Prisma update not-found failures', async () => {
    manufacturerMock.update.mockRejectedValue({ code: 'P2025', message: 'Raw Prisma error' });

    await expect(updateManufacturer('missing', { name: 'Updated' })).rejects.toBeInstanceOf(
      DatabaseNotFoundError
    );
  });
});
