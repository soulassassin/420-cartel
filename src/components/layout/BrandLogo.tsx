import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * 420 CARTEL :: brand logo
 *
 * The one and only logo used on the site (/fourtwentycartel_logo_trim.png).
 * The size is fixed here, stepping up once at the md breakpoint, so it is
 * identical on every page and scales down cleanly on phones.
 */

const LOGO_WIDTH = 692;
const LOGO_HEIGHT = 877;

export function BrandLogo({
  className,
  priority = false,
}: {
  /** Spacing / visibility only. Never pass size classes. */
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/fourtwentycartel_logo_trim.png"
      alt="Four Twenty Cartel"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      sizes="(min-width: 768px) 101px, 64px"
      className={cn('block h-20 w-auto shrink-0 md:h-32', className)}
    />
  );
}
