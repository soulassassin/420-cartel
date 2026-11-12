import { redirect } from 'next/navigation';

/**
 * The till lives at /admin/pos, behind the staff login. This old address forwards there.
 * Query parameters (e.g. `?member=CARTEL-0420`, `?next=`) are carried over.
 */
export default async function LegacyPosRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/admin/pos?${query}` : '/admin/pos');
}
