import type { Role } from '@prisma/client';

import { assertObject, type FieldError, ValidationResult } from '@/lib/validation/common';

export const USER_ROLES = [
  'LAB_TECHNICIAN',
  'REVIEWING_OFFICER',
  'APPROVING_OFFICER',
  'ADMIN',
] as const satisfies readonly Role[];

export interface UserCreatePayload {
  name: string;
  email: string;
  password: string;
  role: Role;
  active: boolean;
}

export interface UserUpdatePayload {
  name?: string;
  role?: Role;
  active?: boolean;
}

export interface UserPasswordResetPayload { password: string }

interface Validation<T> { success: boolean; data?: T; errors: FieldError[] }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function has(source: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(source, field);
}

function requiredString(source: Record<string, unknown>, field: string, result: ValidationResult): string | undefined {
  const value = source[field];
  if (!has(source, field) || value === undefined || value === null) {
    result.add(field, 'is required');
    return undefined;
  }
  if (typeof value !== 'string') {
    result.add(field, 'must be a string');
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    result.add(field, 'must not be empty');
    return undefined;
  }
  return trimmed;
}

function roleValue(source: Record<string, unknown>, result: ValidationResult): Role | undefined {
  if (typeof source.role !== 'string' || !USER_ROLES.includes(source.role as Role)) {
    result.add('role', `must be one of: ${USER_ROLES.join(', ')}`);
    return undefined;
  }
  return source.role as Role;
}

function passwordValue(source: Record<string, unknown>, result: ValidationResult): string | undefined {
  const password = requiredString(source, 'password', result);
  if (password !== undefined && password.length < 12) {
    result.add('password', 'must be at least 12 characters');
    return undefined;
  }
  return password;
}

function finish<T>(result: ValidationResult, data: T): Validation<T> {
  return result.isValid ? { success: true, data, errors: [] } : { success: false, errors: result.errors };
}

export function validateUserCreate(value: unknown): Validation<UserCreatePayload> {
  const result = new ValidationResult();
  const source = assertObject(value, result);
  if (!source) return { success: false, errors: result.errors };
  const name = requiredString(source, 'name', result);
  const email = requiredString(source, 'email', result)?.toLowerCase();
  if (email && (email.length > 320 || !EMAIL.test(email))) result.add('email', 'must be a valid email address');
  const role = roleValue(source, result);
  const password = passwordValue(source, result);
  let active = true;
  if (has(source, 'active')) {
    if (typeof source.active !== 'boolean') result.add('active', 'must be a boolean');
    else active = source.active;
  }
  return finish(result, { name, email, role, password, active } as UserCreatePayload);
}

export function validateUserUpdate(value: unknown): Validation<UserUpdatePayload> {
  const result = new ValidationResult();
  const source = assertObject(value, result);
  if (!source) return { success: false, errors: result.errors };
  const data: UserUpdatePayload = {};
  if (has(source, 'name')) {
    const name = requiredString(source, 'name', result);
    if (name !== undefined) data.name = name;
  }
  if (has(source, 'role')) {
    const role = roleValue(source, result);
    if (role !== undefined) data.role = role;
  }
  if (has(source, 'active')) {
    if (typeof source.active !== 'boolean') result.add('active', 'must be a boolean');
    else data.active = source.active;
  }
  if (Object.keys(data).length === 0 && result.isValid) result.add('body', 'must contain at least one editable field');
  return finish(result, data);
}

export function validateUserPasswordReset(value: unknown): Validation<UserPasswordResetPayload> {
  const result = new ValidationResult();
  const source = assertObject(value, result);
  if (!source) return { success: false, errors: result.errors };
  const password = passwordValue(source, result);
  return finish(result, { password } as UserPasswordResetPayload);
}
