import type { Metadata } from 'next';

import { UserManagementScreen } from '@/components/Admin/UserManagementScreen';
import { AppHeader } from '@/components/AppHeader';
import { requirePageUser } from '@/lib/auth/page-access';

export const metadata: Metadata = { title: 'User Management' };

export default async function AdminUsersPage() {
  const user = await requirePageUser(['ADMIN']);
  return <main className="min-h-screen bg-[#F7F9FB]"><AppHeader section="Administration" user={user} /><div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8"><div className="mb-6 border-l-[3px] border-[#0A66C2] pl-4"><p className="m-0 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[#0A66C2]">Administration</p><h1 className="m-0 mt-1 text-[1.45rem] font-bold text-[#1D2226]">User Management</h1><p className="m-0 mt-1 text-[0.78rem] text-[#667085]">Create and maintain authorized laboratory personnel accounts.</p></div><UserManagementScreen /></div></main>;
}
