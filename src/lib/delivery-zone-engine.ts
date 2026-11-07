/**
 * 420 CARTEL :: delivery zone & radius engine (Module 4)
 *
 * Isomorphic on purpose. The same ladder is used to quote a fee the instant an
 * address is picked in the browser, and to sanity-check what Postgres returns.
 *
 * AUTHORITY: `resolve_delivery_zone(branch, lat, lng)` in Postgres is the only
 * binding answer, because it reads `delivery_zones` (where suburb polygons may
 * override a ring) and because `process_cartel_order` charges from that same
 * function. Everything here is the client-side mirror of the seeded ladder —
 * it exists so the checkout can show a fee without a round trip, and so a
 * mismatch between the two is detectable rather than silent.
 *
 * The ladder below is the exact seed in
 * `supabase/migrations/20261107000005_cartel_storefront_part2.sql`. Change one
 * and you must change the other; `assertLadderMatches` is the guard.
 */

import { loadGoogleMaps, AUTOCOMPLETE_COUNTRY, type PlaceResult } from '@/lib/maps/loader';
import type { ResolvedDeliveryZone } from '@/types/database';

/** The Rosebank hub every ring is measured from. */
export const CARTEL_HUB = {
  name: 'Rosebank Dispensary',
  slug: 'rosebank-dispensary',
  latitude: -26.1467,
  longitude: 28.0436,
} as const;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DeliveryZoneTier {
  /** Matches `delivery_zones.name` in the seed. */
  name: string;
  /** Short label for the checkout chip. */
  shortLabel: string;
  /** Inclusive upper bound of the ring, in km. */
  maxRadiusKm: number;
  feeCents: number;
  minOrderCents: number;
  /** Order value at which delivery becomes free. Null = never free. */
  freeOverCents: number | null;
  etaMinutes: number;
  /** Lower priority wins when an address falls inside several rings. */
  priority: number;
  description: string;
}

export const DELIVERY_ZONE_LADDER: readonly DeliveryZoneTier[] = [
  {
    name: 'Zone 1 - Express Delivery',
    shortLabel: 'ZONE 1',
    maxRadiusKm: 10,
    feeCents: 6_000,
    minOrderCents: 35_000,
    freeOverCents: 100_000,
    etaMinutes: 45,
    priority: 100,
    description: 'Discreet express courier across Rosebank, Sandton and the near northern suburbs.',
  },
  {
    name: 'Zone 2 - Gauteng Metro Courier',
    shortLabel: 'ZONE 2',
    maxRadiusKm: 25,
    feeCents: 12_000,
    minOrderCents: 50_000,
    freeOverCents: 180_000,
    etaMinutes: 90,
    priority: 200,
    description: 'Greater Johannesburg metro, unmarked vehicle, same-day where ordered before 15:00.',
  },
  {
    name: 'Zone 3 - Extended Vault Courier',
    shortLabel: 'ZONE 3',
    maxRadiusKm: 50,
    feeCents: 19_500,
    minOrderCents: 75_000,
    freeOverCents: null,
    etaMinutes: 180,
    priority: 300,
    description: 'Extended Gauteng run out to Pretoria, the Vaal and the West Rand.',
  },
  {
    name: 'National Overnight Armoured Courier',
    shortLabel: 'NATIONAL',
    maxRadiusKm: 1_200,
    feeCents: 25_000,
    minOrderCents: 100_000,
    freeOverCents: null,
    etaMinutes: 1_440,
    priority: 400,
    description: 'Sealed, tracked overnight armoured service to the rest of South Africa.',
  },
] as const;

const EARTH_RADIUS_KM = 6_371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in km. Mirrors `public.haversine_km` exactly, including
 * its 2-decimal rounding, so the browser and Postgres never disagree by a
 * rounding step at a ring boundary.
 */
export function haversineKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(km * 100) / 100;
}

/** The ring an address falls in, or null when it is beyond national reach. */
export function tierForDistance(distanceKm: number): DeliveryZoneTier | null {
  return (
    [...DELIVERY_ZONE_LADDER]
      .sort((a, b) => a.priority - b.priority)
      .find((tier) => distanceKm <= tier.maxRadiusKm) ?? null
  );
}

export interface LocalDeliveryQuote {
  serviceable: boolean;
  reason: string | null;
  tier: DeliveryZoneTier | null;
  distanceKm: number;
  /** Fee after the free-over threshold is applied. */
  feeCents: number;
  /** The undiscounted ring fee, for a "normally R120" strike-through. */
  standardFeeCents: number;
  freeDelivery: boolean;
  /** Cents still needed to earn free delivery, or null when not applicable. */
  centsToFreeDelivery: number | null;
  meetsMinimum: boolean;
  shortfallCents: number;
  etaMinutes: number;
}

export const UNSERVICEABLE_QUOTE: LocalDeliveryQuote = {
  serviceable: false,
  reason: 'That address is outside our courier reach. Private lounge collection is available.',
  tier: null,
  distanceKm: 0,
  feeCents: 0,
  standardFeeCents: 0,
  freeDelivery: false,
  centsToFreeDelivery: null,
  meetsMinimum: false,
  shortfallCents: 0,
  etaMinutes: 0,
};

/**
 * Quote a drop point against the ladder.
 *
 * `origin` defaults to the Rosebank hub; pass the chosen branch's coordinates
 * when a member is being served from the Sandton lounge instead.
 */
export function quoteFromLadder(
  destination: LatLng,
  subtotalCents: number,
  origin: LatLng = { lat: CARTEL_HUB.latitude, lng: CARTEL_HUB.longitude },
): LocalDeliveryQuote {
  const distanceKm = haversineKm(origin, destination);
  const tier = tierForDistance(distanceKm);

  if (!tier) {
    return { ...UNSERVICEABLE_QUOTE, distanceKm };
  }

  const freeDelivery =
    tier.freeOverCents !== null && subtotalCents >= tier.freeOverCents;
  const meetsMinimum = subtotalCents >= tier.minOrderCents;

  return {
    serviceable: true,
    reason: null,
    tier,
    distanceKm,
    feeCents: freeDelivery ? 0 : tier.feeCents,
    standardFeeCents: tier.feeCents,
    freeDelivery,
    centsToFreeDelivery:
      tier.freeOverCents === null || freeDelivery
        ? null
        : Math.max(0, tier.freeOverCents - subtotalCents),
    meetsMinimum,
    shortfallCents: meetsMinimum ? 0 : tier.minOrderCents - subtotalCents,
    etaMinutes: tier.etaMinutes,
  };
}

/**
 * Fee for a zone Postgres resolved. This is the figure checkout displays, since
 * `process_cartel_order` charges from the same row.
 */
export function feeForResolvedZone(
  zone: ResolvedDeliveryZone,
  subtotalCents: number,
): { feeCents: number; freeDelivery: boolean } {
  const freeDelivery =
    zone.free_over_cents !== null && subtotalCents >= zone.free_over_cents;
  return { feeCents: freeDelivery ? 0 : zone.fee_cents, freeDelivery };
}

/**
 * Does the authoritative zone agree with the local ladder?
 *
 * Checkout calls this after Postgres answers. A mismatch means the seeded
 * `delivery_zones` rows have drifted from this file (or a suburb polygon took
 * precedence, which is legitimate) — either way the server figure is charged
 * and the discrepancy is worth logging rather than hiding.
 */
export function assertLadderMatches(
  zone: ResolvedDeliveryZone,
): { agrees: boolean; note: string | null } {
  const tier = DELIVERY_ZONE_LADDER.find((candidate) => candidate.name === zone.zone_name);

  if (!tier) {
    return {
      agrees: false,
      note: `Postgres matched "${zone.zone_name}", which is not in the client ladder — a polygon zone or a hand-added ring.`,
    };
  }
  if (tier.feeCents !== zone.fee_cents) {
    return {
      agrees: false,
      note: `Fee drift on ${zone.zone_name}: database says ${zone.fee_cents}c, client ladder says ${tier.feeCents}c. The database figure is charged.`,
    };
  }
  return { agrees: true, note: null };
}

/** Human ring summary: "Zone 1 — 7.4 km · R60 · ~45 min". */
export function describeQuote(quote: LocalDeliveryQuote): string {
  if (!quote.serviceable || !quote.tier) return 'Outside courier reach';
  const fee = quote.freeDelivery ? 'FREE' : `R${(quote.feeCents / 100).toFixed(0)}`;
  return `${quote.tier.shortLabel} — ${quote.distanceKm.toFixed(1)} km · ${fee} · ~${quote.etaMinutes} min`;
}

// ---------------------------------------------------------------------------
// Google Places autocomplete
// ---------------------------------------------------------------------------

/** Minimal shape of the Places Autocomplete objects we touch. */
interface PlacesAutocompleteLike {
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => {
    formatted_address?: string;
    place_id?: string;
    geometry?: { location?: { lat: () => number; lng: () => number } };
    address_components?: {
      long_name: string;
      short_name: string;
      types: string[];
    }[];
  };
}

interface PlacesLibraryLike {
  Autocomplete: new (
    input: HTMLInputElement,
    options: Record<string, unknown>,
  ) => PlacesAutocompleteLike;
}

function componentOf(
  components: { long_name: string; short_name: string; types: string[] }[] | undefined,
  ...types: string[]
): string | null {
  if (!components) return null;
  for (const type of types) {
    const match = components.find((component) => component.types.includes(type));
    if (match) return match.long_name;
  }
  return null;
}

/**
 * Bind Google Places Autocomplete to a checkout address input.
 *
 * Restricted to South African addresses and biased toward the hub, so the first
 * suggestion for "cradock" is the Rosebank one. Returns a teardown function.
 *
 * Resolves to null when no Maps key is configured — the caller then falls back
 * to the manual suburb presets rather than showing a broken field.
 */
export async function attachPlacesAutocomplete(
  input: HTMLInputElement,
  onPlace: (place: PlaceResult) => void,
  origin: LatLng = { lat: CARTEL_HUB.latitude, lng: CARTEL_HUB.longitude },
): Promise<(() => void) | null> {
  try {
    await loadGoogleMaps();
  } catch {
    return null;
  }

  const importLibrary = window.google?.maps.importLibrary;
  if (!importLibrary) return null;

  const places = (await importLibrary('places')) as unknown as PlacesLibraryLike;
  if (!places?.Autocomplete) return null;

  const autocomplete = new places.Autocomplete(input, {
    componentRestrictions: { country: AUTOCOMPLETE_COUNTRY },
    fields: ['formatted_address', 'geometry', 'address_components', 'place_id'],
    types: ['address'],
    // 60 km bias around the hub: covers every ring short of the national run.
    locationBias: { center: { lat: origin.lat, lng: origin.lng }, radius: 60_000 },
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    const location = place.geometry?.location;
    if (!location) return;

    onPlace({
      formattedAddress: place.formatted_address ?? input.value,
      suburb: componentOf(place.address_components, 'sublocality', 'sublocality_level_1', 'locality'),
      city: componentOf(place.address_components, 'locality', 'administrative_area_level_2'),
      province: componentOf(place.address_components, 'administrative_area_level_1'),
      postalCode: componentOf(place.address_components, 'postal_code'),
      lat: location.lat(),
      lng: location.lng(),
      placeId: place.place_id ?? '',
    });
  });

  // Autocomplete attaches its own Enter handling; swallow the form submit so a
  // member picking a suggestion with the keyboard does not place the order.
  const swallowEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter') event.preventDefault();
  };
  input.addEventListener('keydown', swallowEnter);

  return () => {
    input.removeEventListener('keydown', swallowEnter);
  };
}

export type { PlaceResult };
