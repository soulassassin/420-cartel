import type { Metadata } from 'next';
import { CrmDirectoryView } from '@/components/crm/CrmDirectoryView';
import { requireStaff } from '@/lib/supabase/guard';

export const metadata: Metadata = {
  title: 'Member CRM & Compliance',
  robots: { index: false, follow: false },
};

export default async function CrmPage() {
  // Belt-and-suspenders alongside AdminLayout: strict Supabase staff gate in
  // production, credential-free preview when Supabase is unconfigured.
  await requireStaff();

  return <CrmDirectoryView />;
}
