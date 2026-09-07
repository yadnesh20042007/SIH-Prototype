import { describe, expect, it } from 'vitest';

import { validateUserCreate, validateUserPasswordReset, validateUserUpdate } from './user';

const valid = { name: ' Lab Technician ', email: ' TECH@Example.Test ', password: 'temporary-pass-123', role: 'LAB_TECHNICIAN', active: true };

describe('user management validation', () => {
  it('normalizes a valid create payload', () => expect(validateUserCreate(valid)).toMatchObject({ success: true, data: { name: 'Lab Technician', email: 'tech@example.test', role: 'LAB_TECHNICIAN', active: true } }));
  it('defaults a created user to active', () => expect(validateUserCreate({ ...valid, active: undefined })).toMatchObject({ success: false }));
  it('uses active true when the field is omitted', () => { const body = { name: valid.name, email: valid.email, password: valid.password, role: valid.role }; expect(validateUserCreate(body).data?.active).toBe(true); });
  it.each([
    [{ ...valid, name: ' ' }, 'name'], [{ ...valid, email: 'bad-email' }, 'email'],
    [{ ...valid, role: 'OWNER' }, 'role'], [{ ...valid, password: 'too-short' }, 'password'],
    [{ ...valid, active: 'yes' }, 'active'],
  ])('rejects invalid create data', (body, field) => expect(validateUserCreate(body).errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })])));
  it('validates an editable partial update', () => expect(validateUserUpdate({ name: ' Updated ', active: false })).toEqual({ success: true, data: { name: 'Updated', active: false }, errors: [] }));
  it('rejects an empty update', () => expect(validateUserUpdate({}).success).toBe(false));
  it('does not accept passwordHash as an editable field', () => expect(validateUserUpdate({ passwordHash: 'plaintext' }).success).toBe(false));
  it('validates password resets with the same minimum length', () => expect(validateUserPasswordReset({ password: 'new-password-123' }).success).toBe(true));
  it('rejects weak reset passwords', () => expect(validateUserPasswordReset({ password: 'weak' }).success).toBe(false));
});
