'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

interface LoginResponse { error?: string; redirectTo?: string; }

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json() as LoginResponse;
      if (!response.ok || !payload.redirectTo) {
        setError(payload.error ?? 'Unable to sign in');
        return;
      }
      router.replace(payload.redirectTo);
      router.refresh();
    } catch {
      setError('Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold text-[#344054]">Email</span>
        <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 w-full rounded-[5px] border border-[#C9D5E1] bg-white px-3 text-[0.82rem] text-[#1D2226] focus:border-[#0A66C2] focus:outline-none focus:ring-[3px] focus:ring-[#0A66C2]/10" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold text-[#344054]">Password</span>
        <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 w-full rounded-[5px] border border-[#C9D5E1] bg-white px-3 text-[0.82rem] text-[#1D2226] focus:border-[#0A66C2] focus:outline-none focus:ring-[3px] focus:ring-[#0A66C2]/10" />
      </label>
      {error && <p role="alert" className="m-0 rounded-[5px] border border-[#F3C7C7] bg-[#FEF3F2] px-3 py-2 text-[0.72rem] text-[#B42318]">{error}</p>}
      <button type="submit" disabled={submitting} className="h-10 w-full rounded-[5px] bg-[#0A66C2] px-4 text-[0.78rem] font-semibold text-white hover:bg-[#07579F] disabled:cursor-wait disabled:opacity-60">
        {submitting ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
