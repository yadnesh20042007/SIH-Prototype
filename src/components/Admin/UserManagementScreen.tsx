'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Role } from '@prisma/client';

import { friendlyRoleName } from '@/lib/auth/roles';
import { USER_ROLES } from '@/lib/validation/user';

interface UserRow {
  id: string; name: string; email: string; role: Role; active: boolean;
  deletedAt: string | null; createdAt: string;
}

const inputClass = 'w-full rounded border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1D2226] outline-none focus:border-[#0A66C2]';
const buttonClass = 'rounded bg-[#0A66C2] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60';

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string; errors?: { message: string }[] } | null;
  return body?.errors?.[0]?.message ?? body?.error ?? 'The request could not be completed';
}

export function UserManagementScreen() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'LAB_TECHNICIAN' as Role, active: true });
  const [editForm, setEditForm] = useState({ name: '', role: 'LAB_TECHNICIAN' as Role, active: true });
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!response.ok) throw new Error(await errorMessage(response));
      setUsers(await response.json() as UserRow[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!response.ok) throw new Error(await errorMessage(response));
      setForm({ name: '', email: '', password: '', role: 'LAB_TECHNICIAN', active: true });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create user'); }
    finally { setBusy(false); }
  }

  async function request(url: string, init: RequestInit) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(await errorMessage(response));
      setEditing(null); setResetting(null); setNewPassword(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update user'); }
    finally { setBusy(false); }
  }

  function beginEdit(user: UserRow) {
    setEditing(user); setResetting(null); setEditForm({ name: user.name, role: user.role, active: user.active });
  }

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded border border-[#FDA29B] bg-[#FFF6F5] px-4 py-3 text-sm text-[#B42318]">{error}</div>}

      <section className="rounded-md border border-[#D9E2EC] bg-white p-5">
        <h2 className="m-0 text-base font-bold text-[#1D2226]">Add User</h2>
        <form onSubmit={create} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-semibold text-[#475467]">Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputClass} mt-1`} /></label>
          <label className="text-xs font-semibold text-[#475467]">Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inputClass} mt-1`} /></label>
          <label className="text-xs font-semibold text-[#475467]">Temporary password<input required minLength={12} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={`${inputClass} mt-1`} /></label>
          <label className="text-xs font-semibold text-[#475467]">Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={`${inputClass} mt-1`}>{USER_ROLES.map((role) => <option key={role} value={role}>{friendlyRoleName(role)}</option>)}</select></label>
          <div className="flex items-end gap-4"><label className="mb-2 flex items-center gap-2 text-sm text-[#475467]"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Active</label><button disabled={busy} className={`${buttonClass} ml-auto`} type="submit">Add User</button></div>
        </form>
      </section>

      <section className="overflow-hidden rounded-md border border-[#D9E2EC] bg-white">
        <div className="border-b border-[#D9E2EC] px-5 py-4"><h2 className="m-0 text-base font-bold text-[#1D2226]">Users</h2></div>
        {loading ? <p className="p-5 text-sm text-[#667085]">Loading users…</p> : (
          <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[#F7F9FB] text-xs uppercase tracking-wide text-[#667085]"><tr>{['Name', 'Email', 'Role', 'Status', 'Created', 'Actions'].map((h) => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{users.map((user) => <tr key={user.id} className="border-t border-[#E4EAF0] text-[#344054]">
              <td className="px-5 py-3 font-semibold text-[#1D2226]">{user.name}</td><td className="px-5 py-3">{user.email}</td><td className="px-5 py-3">{friendlyRoleName(user.role)}</td>
              <td className="px-5 py-3">{user.deletedAt ? 'Deleted' : user.active ? 'Active' : 'Inactive'}</td><td className="px-5 py-3 whitespace-nowrap">{new Date(user.createdAt).toLocaleDateString()}</td>
              <td className="px-5 py-3 whitespace-nowrap"><div className="flex gap-3">{!user.deletedAt && <><button onClick={() => beginEdit(user)} className="font-semibold text-[#0A66C2]">Edit</button><button onClick={() => void request(`/api/admin/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !user.active }) })} className="font-semibold text-[#0A66C2]">{user.active ? 'Deactivate' : 'Activate'}</button><button onClick={() => { setResetting(user); setEditing(null); }} className="font-semibold text-[#0A66C2]">Reset Password</button><button onClick={() => { if (window.confirm(`Soft-delete ${user.name}?`)) void request(`/api/admin/users/${user.id}`, { method: 'DELETE' }); }} className="font-semibold text-[#B42318]">Delete</button></>}</div></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>

      {editing && <section className="rounded-md border border-[#D9E2EC] bg-white p-5"><h2 className="text-base font-bold">Edit {editing.email}</h2><form className="mt-4 flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); void request(`/api/admin/users/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) }); }}><label className="text-xs font-semibold">Name<input required className={`${inputClass} mt-1`} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label><label className="text-xs font-semibold">Role<select className={`${inputClass} mt-1`} value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>{USER_ROLES.map((role) => <option key={role} value={role}>{friendlyRoleName(role)}</option>)}</select></label><label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} />Active</label><button disabled={busy} className={buttonClass}>Save</button><button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-sm font-semibold text-[#475467]">Cancel</button></form></section>}

      {resetting && <section className="rounded-md border border-[#D9E2EC] bg-white p-5"><h2 className="text-base font-bold">Reset password for {resetting.email}</h2><form className="mt-4 flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); void request(`/api/admin/users/${resetting.id}/password`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPassword }) }); }}><label className="text-xs font-semibold">New temporary password<input required minLength={12} type="password" autoComplete="new-password" className={`${inputClass} mt-1 min-w-72`} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label><button disabled={busy} className={buttonClass}>Reset Password</button><button type="button" onClick={() => { setResetting(null); setNewPassword(''); }} className="px-3 py-2 text-sm font-semibold text-[#475467]">Cancel</button></form></section>}
    </div>
  );
}
