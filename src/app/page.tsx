import type { Metadata } from 'next';

import { AppHeader } from '@/components/AppHeader';
import { RegistryScreen } from '@/components/Registry/RegistryScreen';
import { requirePageUser } from '@/lib/auth/page-access';

export const metadata: Metadata = {
  title: 'Instrument Registry',
  description: 'Register and select non-automatic weighing instruments for OIML R76 evaluation.',
};

export default async function RegistryPage() {
  const user = await requirePageUser(['LAB_TECHNICIAN', 'ADMIN']);
  return (
    <main id="main-content" className="min-h-screen bg-[#F7F9FB]">
      <AppHeader section="Instrument Registry" user={user} />
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 border-l-[3px] border-[#0A66C2] pl-4">
          <p className="m-0 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[#0A66C2]">Registry</p>
          <h1 className="m-0 mt-1 text-[1.35rem] font-bold tracking-[-0.02em] text-[#1D2226] sm:text-[1.55rem]">Manufacturer &amp; Instrument Registry</h1>
          <p className="m-0 mt-1 max-w-3xl text-[0.8rem] leading-relaxed text-[#667085]">Register declared instrument configurations and open a saved record for laboratory evaluation.</p>
        </div>
        <RegistryScreen />
      </div>
    </main>
  );
}
