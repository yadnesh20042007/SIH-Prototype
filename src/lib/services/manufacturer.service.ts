import type { Manufacturer } from '@prisma/client';

import { DatabaseNotFoundError, throwMappedDatabaseError } from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';
import type {
  ManufacturerCreatePayload,
  ManufacturerUpdatePayload,
} from '@/lib/validation/manufacturer';

export interface ManufacturerRecord {
  id: string;
  name: string;
  country: string | null;
  registrationCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toManufacturerRecord(manufacturer: Manufacturer): ManufacturerRecord {
  return {
    id: manufacturer.id,
    name: manufacturer.name,
    country: manufacturer.country,
    registrationCode: manufacturer.registrationCode,
    createdAt: manufacturer.createdAt,
    updatedAt: manufacturer.updatedAt,
  };
}

export async function createManufacturer(
  input: ManufacturerCreatePayload
): Promise<ManufacturerRecord> {
  try {
    const manufacturer = await prisma.manufacturer.create({ data: input });
    return toManufacturerRecord(manufacturer);
  } catch (error) {
    throwMappedDatabaseError(error, 'Manufacturer');
  }
}

export async function listManufacturers(): Promise<ManufacturerRecord[]> {
  try {
    const manufacturers = await prisma.manufacturer.findMany();
    return manufacturers.map(toManufacturerRecord);
  } catch (error) {
    throwMappedDatabaseError(error, 'Manufacturer');
  }
}

export async function getManufacturerById(id: string): Promise<ManufacturerRecord> {
  try {
    const manufacturer = await prisma.manufacturer.findUnique({ where: { id } });
    if (!manufacturer) throw new DatabaseNotFoundError('Manufacturer not found');
    return toManufacturerRecord(manufacturer);
  } catch (error) {
    throwMappedDatabaseError(error, 'Manufacturer');
  }
}

export async function updateManufacturer(
  id: string,
  input: ManufacturerUpdatePayload
): Promise<ManufacturerRecord> {
  try {
    const manufacturer = await prisma.manufacturer.update({
      where: { id },
      data: input,
    });
    return toManufacturerRecord(manufacturer);
  } catch (error) {
    throwMappedDatabaseError(error, 'Manufacturer');
  }
}
