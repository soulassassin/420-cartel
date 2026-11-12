import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * 420 CARTEL :: brand logo
 *
 * Supports both /fourtwentycartel_logo_trim.png (clean vector-like presentation)
 * and the canonical /fourtwentycartel_logo.jpg brand mark.
 */

const LOGO_WIDTH = 692;
const LOGO_HEIGHT = 877;

export function BrandLogo({
  className,
  priority = false,
  src = '/fourtwentycartel_logo_trim.png',
}: {
  /** Spacing only. The size is fixed here so it never drifts between pages. */
  className?: string;
  priority?: boolean;
  src?: string;
}) {
  return (
    <Image
      src={src}
      alt="Four Twenty Cartel"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority={priority}
      sizes="160px"
      className={cn('block h-24 w-auto shrink-0 md:h-32', className)}
    />
  );
}
