import 'server-only';

import bcrypt from 'bcryptjs';
import type { Prisma, Role, User } from '@prisma/client';

import { DatabaseConflictError, DatabaseNotFoundError, throwMappedDatabaseError } from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';
import type { UserCreatePayload, UserUpdatePayload } from '@/lib/validation/user';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function safeUser(user: User): UserRecord {
  const { id, name, email, role, active, deletedAt, createdAt, updatedAt } = user;
  return { id, name, email, role, active, deletedAt, createdAt, updatedAt };
}

export async function listUsers(): Promise<UserRecord[]> {
  try {
    return (await prisma.user.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] })).map(safeUser);
  } catch (error) { throwMappedDatabaseError(error, 'User'); }
}

export async function createUser(input: UserCreatePayload): Promise<UserRecord> {
  try {
    const { password, ...data } = input;
    const passwordHash = await bcrypt.hash(password, 12);
    return safeUser(await prisma.user.create({ data: { ...data, passwordHash } }));
  } catch (error) { throwMappedDatabaseError(error, 'User'); }
}

async function assertAdminCanBeRemoved(tx: Prisma.TransactionClient, target: User, actorId: string): Promise<void> {
  if (target.role !== 'ADMIN' || !target.active || target.deletedAt !== null) return;
  const otherAdmins = await tx.user.count({
    where: { id: { not: target.id }, role: 'ADMIN', active: true, deletedAt: null },
  });
  if (otherAdmins === 0) {
    const suffix = target.id === actorId ? 'your own account' : 'the last active administrator';
    throw new DatabaseConflictError(`Cannot disable or demote ${suffix}`);
  }
}

export async function updateUser(id: string, input: UserUpdatePayload, actorId: string): Promise<UserRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new DatabaseNotFoundError('User not found');
      if ((input.role && input.role !== 'ADMIN') || input.active === false) {
        await assertAdminCanBeRemoved(tx, target, actorId);
      }
      return safeUser(await tx.user.update({ where: { id }, data: input }));
    });
  } catch (error) { throwMappedDatabaseError(error, 'User'); }
}

export async function resetUserPassword(id: string, password: string): Promise<UserRecord> {
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    return safeUser(await prisma.user.update({ where: { id }, data: { passwordHash } }));
  } catch (error) { throwMappedDatabaseError(error, 'User'); }
}

export async function softDeleteUser(id: string, actorId: string): Promise<UserRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new DatabaseNotFoundError('User not found');
      await assertAdminCanBeRemoved(tx, target, actorId);
      return safeUser(await tx.user.update({
        where: { id }, data: { active: false, deletedAt: target.deletedAt ?? new Date() },
      }));
    });
  } catch (error) { throwMappedDatabaseError(error, 'User'); }
}
