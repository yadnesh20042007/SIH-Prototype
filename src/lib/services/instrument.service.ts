import type { Prisma } from '@prisma/client';

import { DatabaseNotFoundError, throwMappedDatabaseError, DatabaseConflictError } from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';
import type {
  InstrumentCreatePayload,
  InstrumentUpdatePayload,
} from '@/lib/validation/instrument';

const manufacturerInclude = { manufacturer: true } as const;

type InstrumentWithManufacturer = Prisma.InstrumentGetPayload<{
  include: typeof manufacturerInclude;
}>;

export interface InstrumentManufacturerRecord {
  id: string;
  name: string;
  country: string | null;
  registrationCode: string | null;
}

export interface InstrumentRecord {
  id: string;
  manufacturerId: string;
  manufacturer: InstrumentManufacturerRecord;
  model: string;
  serialNumber: string | null;
  accuracyClass: string;
  instrumentType: string;
  indicationType: string | null;
  max: string;
  min: string;
  e: string;
  d: string;
  numberOfSupportPoints: number;
  additiveTareEffect: boolean;
  hasAutoZeroOrTracking: boolean;
  hasInitialZeroSettingDevice: boolean;
  initialZeroSettingRange: string;
  hasFineDisplayDevice: boolean;
  zeroSettingMechanisms: string[];
  registeredById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toInstrumentRecord(instrument: InstrumentWithManufacturer): InstrumentRecord {
  return {
    id: instrument.id,
    manufacturerId: instrument.manufacturerId,
    manufacturer: {
      id: instrument.manufacturer.id,
      name: instrument.manufacturer.name,
      country: instrument.manufacturer.country,
      registrationCode: instrument.manufacturer.registrationCode,
    },
    model: instrument.model,
    serialNumber: instrument.serialNumber,
    accuracyClass: instrument.accuracyClass,
    instrumentType: instrument.instrumentType,
    indicationType: instrument.indicationType ?? null,
    max: instrument.max.toString(),
    min: instrument.min.toString(),
    e: instrument.e.toString(),
    d: instrument.d.toString(),
    numberOfSupportPoints: instrument.numberOfSupportPoints,
    additiveTareEffect: instrument.additiveTareEffect,
    hasAutoZeroOrTracking: instrument.hasAutoZeroOrTracking,
    hasInitialZeroSettingDevice: instrument.hasInitialZeroSettingDevice,
    initialZeroSettingRange: instrument.initialZeroSettingRange.toString(),
    hasFineDisplayDevice: instrument.hasFineDisplayDevice,
    zeroSettingMechanisms: instrument.zeroSettingMechanisms,
    registeredById: instrument.registeredById,
    createdAt: instrument.createdAt,
    updatedAt: instrument.updatedAt,
  };
}

export async function createInstrument(
  input: InstrumentCreatePayload,
  registeredById?: string,
): Promise<InstrumentRecord> {
  try {
    const instrument = await prisma.instrument.create({
      data: { ...input, ...(registeredById ? { registeredById } : {}) },
      include: manufacturerInclude,
    });
    return toInstrumentRecord(instrument);
  } catch (error) {
    throwMappedDatabaseError(error, 'Instrument');
  }
}

export async function listInstruments(): Promise<InstrumentRecord[]> {
  try {
    const instruments = await prisma.instrument.findMany({ include: manufacturerInclude });
    return instruments.map(toInstrumentRecord);
  } catch (error) {
    throwMappedDatabaseError(error, 'Instrument');
  }
}

export async function getInstrumentById(id: string): Promise<InstrumentRecord> {
  try {
    const instrument = await prisma.instrument.findUnique({
      where: { id },
      include: manufacturerInclude,
    });
    if (!instrument) throw new DatabaseNotFoundError('Instrument not found');
    return toInstrumentRecord(instrument);
  } catch (error) {
    throwMappedDatabaseError(error, 'Instrument');
  }
}

export async function updateInstrument(
  id: string,
  input: InstrumentUpdatePayload
): Promise<InstrumentRecord> {
  try {
    const instrument = await prisma.instrument.update({
      where: { id },
      data: input,
      include: manufacturerInclude,
    });
    return toInstrumentRecord(instrument);
  } catch (error) {
    throwMappedDatabaseError(error, 'Instrument');
  }
}

export async function deleteInstrument(id: string, actorId: string): Promise<void> {
  try {
    const instrument = await prisma.instrument.findUnique({
      where: { id },
      include: { sessions: true },
    });
    if (!instrument) throw new DatabaseNotFoundError('Instrument not found');

    if (instrument.sessions.some(s => s.status === 'APPROVED' || s.status === 'PENDING_APPROVAL')) {
      throw new DatabaseConflictError('Cannot delete instrument containing approved or pending sessions');
    }

    await prisma.$transaction(async (tx) => {
      const sessionIds = instrument.sessions.map(s => s.id);

      if (sessionIds.length > 0) {
        await tx.approval.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.report.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.auditLog.updateMany({ where: { sessionId: { in: sessionIds } }, data: { sessionId: null } });
        
        await tx.testSession.deleteMany({ where: { instrumentId: id } });
      }

      await tx.auditLog.create({
        data: {
          entityType: 'Instrument',
          entityId: id,
          action: 'DELETE',
          userId: actorId,
        },
      });

      await tx.instrument.delete({ where: { id } });
    });
  } catch (error) {
    throwMappedDatabaseError(error, 'Instrument');
  }
}
