'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');
      router.replace('/login');
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="rounded border border-[#BFCEDC] bg-white px-2.5 py-1.5 text-[0.68rem] font-semibold text-[#344054] hover:border-[#0A66C2] hover:bg-[#F6FAFE] hover:text-[#0A66C2] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Logout'}
    </button>
  );
}
