import type { Metadata } from 'next';
import { MemberDossierView } from '@/components/crm/MemberDossierView';
import { requireStaff } from '@/lib/supabase/guard';

export const metadata: Metadata = {
  title: '360° Member Dossier',
  robots: { index: false, follow: false },
};

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  await requireStaff();
  const { memberId } = await params;

  return <MemberDossierView memberId={memberId} />;
}
