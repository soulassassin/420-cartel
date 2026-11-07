import { LEGAL_AGE } from '@/lib/sa-id';

/**
 * Turns a `CARTEL_*` exception from Postgres into something a member can act
 * on. Anything unrecognised is reported generically rather than leaking SQL.
 */
export function translateDbError(message: string): string {
  const match = /CARTEL_([A-Z_]+):\s*(.*)/.exec(message);
  if (match) {
    const detail = match[2]?.trim();
    if (detail) return detail.charAt(0).toUpperCase() + detail.slice(1);
  }
  if (message.includes('members_legal_age')) {
    return `420 Cartel membership is restricted to adults ${LEGAL_AGE} and over.`;
  }
  if (message.includes('members_sa_id_shape') || message.includes('members_sa_id_dob_match')) {
    return 'That ID number did not validate. Check for a typo.';
  }
  if (message.includes('members_sa_id_unique')) {
    return 'That ID number is already registered to a member.';
  }
  if (message.includes('duplicate key')) {
    return 'That record already exists.';
  }
  return 'Something went wrong. Try again, or contact the collective.';
}

