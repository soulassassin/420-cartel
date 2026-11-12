import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * 420 CARTEL :: brand logo
 *
 * The one way the logo is shown anywhere on the site: the full mark (skull
 * and wordmark), trimmed of the empty black space around the artwork, with
 * nothing beside it. No ring, no caption, no repeated brand name.
 *
 * It is the same size everywhere (96px tall, 128px from the md breakpoint),
 * matching the home page header; the width follows the artwork's proportions.
 */

const LOGO_WIDTH = 692;
const LOGO_HEIGHT = 877;

export function BrandLogo({
  className,
  priority = false,
}: {
  /** Spacing only. The size is fixed here so it never drifts between pages. */
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/fourtwentycartel_logo_trim.png"
      alt="Four Twenty Cartel"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority={priority}
      sizes="160px"
      className={cn('block h-24 w-auto shrink-0 md:h-32', className)}
    />
  );
}
