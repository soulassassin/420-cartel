'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isVerifiedMember, useSessionStore } from '@/lib/store/session';
import { IS_LOCAL_PREVIEW } from '@/lib/data/source';
import ShopPage from '@/app/shop/page';

export default function VaultPage() {
  const router = useRouter();
  const member = useSessionStore((state) => state.member);
  const verified = isVerifiedMember(member);

  useEffect(() => {
    if (!verified && !IS_LOCAL_PREVIEW) {
      router.replace('/onboarding?next=/vault');
    }
  }, [verified, router]);

  return <ShopPage />;
}
