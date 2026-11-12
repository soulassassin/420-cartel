import Link from 'next/link';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { Eyebrow } from '@/components/ui/surfaces';

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <BrandLogo className="mb-6" />
      <Eyebrow className="mb-2">404 // Vault Area Restricted</Eyebrow>
      <h1 className="display-lg text-white mb-4">
        Page Not Found
      </h1>
      <p className="max-w-md text-ash text-lg mb-8">
        The coordinates you entered do not correspond to any public dispensary,
        private lounge, or ledger entry in the 420 Cartel network.
      </p>
      <Link
        href="/"
        className="ghost-link text-gold font-mono type-ui uppercase tracking-wider"
      >
        Return to Home &rarr;
      </Link>
    </main>
  );
}
