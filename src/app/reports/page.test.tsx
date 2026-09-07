import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePageUser, listReports } = vi.hoisted(() => ({ requirePageUser: vi.fn(), listReports: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/page-access', () => ({ requirePageUser }));
vi.mock('@/lib/services/report.service', () => ({ listReports }));
vi.mock('@/components/AppHeader', () => ({ AppHeader: () => null }));

import ReportsPage from './page';

describe('Reports page server access and filters', () => {
  beforeEach(() => { vi.clearAllMocks(); requirePageUser.mockResolvedValue({ id: 'user-1', name: 'User', role: 'LAB_TECHNICIAN' }); listReports.mockResolvedValue([]); });
  it('requires any authenticated project role', async () => {
    await ReportsPage({ searchParams: Promise.resolve({}) });
    expect(requirePageUser).toHaveBeenCalledWith(['LAB_TECHNICIAN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER', 'ADMIN']);
  });
  it('passes normalized search and state filters to the repository service', async () => {
    await ReportsPage({ searchParams: Promise.resolve({ q: ' Acme ', state: 'revoked' }) });
    expect(listReports).toHaveBeenCalledWith({ query: 'Acme', state: 'REVOKED' });
  });
  it('defaults invalid or missing state to All', async () => {
    await ReportsPage({ searchParams: Promise.resolve({ state: 'deleted' }) });
    expect(listReports).toHaveBeenCalledWith({ query: undefined, state: 'ALL' });
  });
});
