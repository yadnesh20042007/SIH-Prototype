import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/Auth/LoginForm';
import { roleRedirect } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Sign In', description: 'Sign in to the NAWI R76 compliance testing platform.' };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(roleRedirect(user.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9FB] px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-lg border border-[#D9E2EC] bg-white shadow-[0_4px_16px_rgba(16,24,40,0.06)]">
        <div className="border-b border-[#E4EAF0] bg-[#FBFCFD] px-6 py-5">
          <p className="m-0 text-[0.64rem] font-bold uppercase tracking-[0.14em] text-[#0A66C2]">Authorized laboratory access</p>
          <h1 className="m-0 mt-1.5 text-[1.35rem] font-bold tracking-[-0.02em] text-[#1D2226]">Sign in to NAWI R76</h1>
          <p className="m-0 mt-1 text-[0.76rem] leading-relaxed text-[#667085]">Use your assigned laboratory account to continue.</p>
        </div>
        <div className="px-6 py-6"><LoginForm /></div>
      </section>
    </main>
  );
}
