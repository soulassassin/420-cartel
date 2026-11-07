/**
 * South African ID number parser — an exact mirror of the SQL functions in
 * 20261107000001_cartel_core.sql (`sa_id_luhn_valid`, `sa_id_to_dob`,
 * `sa_id_citizenship`, `sa_id_gender`).
 *
 * The client runs this for instant feedback; the database re-validates the same
 * way through CHECK constraints and `submit_member_kyc`, so a tampered client
 * cannot create an underage or malformed member.
 *
 * Layout: YYMMDD SSSS C A Z
 *   0-5   date of birth (YYMMDD)
 *   6-9   gender/sequence block (0000-4999 female, 5000-9999 male)
 *   10    citizenship (0 = SA citizen, 1 = permanent resident)
 *   11    legacy race/A digit, unused since 1994
 *   12    Luhn check digit
 */

export const LEGAL_AGE = 18;

export type SaIdCitizenship = 'SA_CITIZEN' | 'PERMANENT_RESIDENT';
export type SaIdGender = 'MALE' | 'FEMALE';

export interface SaIdParseSuccess {
  valid: true;
  normalized: string;
  dateOfBirth: string; // ISO yyyy-mm-dd
  age: number;
  isOfLegalAge: boolean;
  citizenship: SaIdCitizenship | null;
  /**
   * Gender block as encoded in the ID number. This is document metadata, not a
   * self-identification — never render it as the member's gender identity.
   */
  genderMarker: SaIdGender | null;
}

export interface SaIdParseFailure {
  valid: false;
  normalized: string;
  reason:
    | 'EMPTY'
    | 'WRONG_LENGTH'
    | 'NON_NUMERIC'
    | 'BAD_CHECKSUM'
    | 'INVALID_DATE';
  message: string;
}

export type SaIdParseResult = SaIdParseSuccess | SaIdParseFailure;

export function normalizeSaId(input: string): string {
  return input.replace(/[^0-9]/g, '');
}

/** Luhn (mod 10) checksum over all 13 digits. */
export function saIdLuhnValid(input: string): boolean {
  const digits = normalizeSaId(input);
  if (digits.length !== 13) return false;

  let sum = 0;
  for (let pos = 1; pos <= 13; pos += 1) {
    const char = digits[digits.length - pos];
    if (char === undefined) return false;
    let digit = Number(char);
    if (pos % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Date of birth from the YYMMDD prefix. Two-digit years pivot on the current
 * year: a YY that would place the person in the future reads as 19YY.
 */
export function saIdToDateOfBirth(input: string): Date | null {
  const digits = normalizeSaId(input);
  if (digits.length !== 13) return null;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));

  if (!Number.isInteger(yy) || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const pivot = new Date().getUTCFullYear() % 100;
  const year = yy <= pivot ? 2000 + yy : 1900 + yy;

  const date = new Date(Date.UTC(year, mm - 1, dd));
  // Reject rolled-over dates such as 31 February.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== mm - 1 ||
    date.getUTCDate() !== dd
  ) {
    return null;
  }
  return date;
}

export function saIdCitizenship(input: string): SaIdCitizenship | null {
  const digits = normalizeSaId(input);
  if (digits.length !== 13) return null;
  const marker = digits[10];
  if (marker === '0') return 'SA_CITIZEN';
  if (marker === '1') return 'PERMANENT_RESIDENT';
  return null;
}

export function saIdGenderMarker(input: string): SaIdGender | null {
  const digits = normalizeSaId(input);
  if (digits.length !== 13) return null;
  return Number(digits.slice(6, 10)) < 5000 ? 'FEMALE' : 'MALE';
}

/** Whole years elapsed between `dob` and `asOf`. */
export function ageInYears(dob: Date, asOf: Date = new Date()): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function toIsoDate(date: Date): string {
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

export function isOfLegalAge(dob: Date, asOf: Date = new Date()): boolean {
  return ageInYears(dob, asOf) >= LEGAL_AGE;
}

/** Full parse with user-facing failure messages. */
export function parseSaId(input: string, asOf: Date = new Date()): SaIdParseResult {
  const normalized = normalizeSaId(input);

  if (input.trim() === '') {
    return {
      valid: false,
      normalized,
      reason: 'EMPTY',
      message: 'Enter your 13-digit South African ID number.',
    };
  }

  if (/[^0-9\s-]/.test(input)) {
    return {
      valid: false,
      normalized,
      reason: 'NON_NUMERIC',
      message: 'An SA ID number contains digits only.',
    };
  }

  if (normalized.length !== 13) {
    return {
      valid: false,
      normalized,
      reason: 'WRONG_LENGTH',
      message: `An SA ID number is 13 digits — you entered ${normalized.length}.`,
    };
  }

  if (!saIdLuhnValid(normalized)) {
    return {
      valid: false,
      normalized,
      reason: 'BAD_CHECKSUM',
      message: 'That ID number fails its checksum. Check for a typo.',
    };
  }

  const dob = saIdToDateOfBirth(normalized);
  if (!dob) {
    return {
      valid: false,
      normalized,
      reason: 'INVALID_DATE',
      message: 'The date of birth in that ID number is not a real date.',
    };
  }

  const age = ageInYears(dob, asOf);

  return {
    valid: true,
    normalized,
    dateOfBirth: toIsoDate(dob),
    age,
    isOfLegalAge: age >= LEGAL_AGE,
    citizenship: saIdCitizenship(normalized),
    genderMarker: saIdGenderMarker(normalized),
  };
}

/** Display mask: 900101 5009 08 7 */
export function formatSaId(input: string): string {
  const d = normalizeSaId(input).slice(0, 13);
  const parts = [d.slice(0, 6), d.slice(6, 10), d.slice(10, 12), d.slice(12, 13)].filter(
    (part) => part.length > 0,
  );
  return parts.join(' ');
}

/** Last 4 digits only — for CRM lists and POS lookups. */
export function maskSaId(input: string): string {
  const d = normalizeSaId(input);
  if (d.length !== 13) return '•••• •••• •••';
  return `•••••• •••• •• ${d.slice(12)}`;
}

/** Validate a passport-based date of birth against the 18+ requirement. */
export function validatePassportDob(
  isoDate: string,
  asOf: Date = new Date(),
): { ok: true; dateOfBirth: string; age: number } | { ok: false; message: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return { ok: false, message: 'Enter your date of birth as YYYY-MM-DD.' };
  }
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: 'That date of birth is not a real date.' };
  }
  if (parsed.getTime() > asOf.getTime()) {
    return { ok: false, message: 'Date of birth cannot be in the future.' };
  }
  const age = ageInYears(parsed, asOf);
  if (age >= 130) {
    return { ok: false, message: 'Check the year — that date of birth is out of range.' };
  }
  if (age < LEGAL_AGE) {
    return {
      ok: false,
      message: `420 Cartel membership is restricted to adults ${LEGAL_AGE} and over.`,
    };
  }
  return { ok: true, dateOfBirth: isoDate, age };
}
