import 'server-only';

import type { BranchRow, ResolvedDeliveryZone } from '@/types/database';
import { createCartelServerClient } from '@/lib/supabase/server';

/**
 * Delivery zone & radius engine.
 *
 * Zone matching is authoritative in Postgres (`resolve_delivery_zone`), which
 * prefers an explicit suburb polygon over a radius ring. Driving distance from
 * the Distance Matrix API is layered on top for ETA and for a driving-distance
 * surcharge, and never silently replaces the zone fee.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DeliveryQuote {
  serviceable: boolean;
  reason: string | null;
  zone: ResolvedDeliveryZone | null;
  /** Straight-line km from the branch, from Postgres. */
  straightLineKm: number | null;
  /** Road distance in km, when the Distance Matrix API is reachable. */
  drivingKm: number | null;
  drivingMinutes: number | null;
  feeCents: number;
  minOrderCents: number;
  freeOverCents: number | null;
  etaMinutes: number;
}

export const UNSERVICEABLE: DeliveryQuote = {
  serviceable: false,
  reason: 'That address is outside our delivery zones. In-store collection is available.',
  zone: null,
  straightLineKm: null,
  drivingKm: null,
  drivingMinutes: null,
  feeCents: 0,
  minOrderCents: 0,
  freeOverCents: null,
  etaMinutes: 0,
};

interface DistanceMatrixElement {
  status: string;
  distance?: { value: number };
  duration_in_traffic?: { value: number };
  duration?: { value: number };
}

interface DistanceMatrixResponse {
  status: string;
  error_message?: string;
  rows?: { elements?: DistanceMatrixElement[] }[];
}

/**
 * Road distance and duration from the branch to the drop point.
 * Returns null when the server key is absent or the API declines — callers
 * fall back to the straight-line distance rather than failing the checkout.
 */
export async function fetchDrivingDistance(
  origin: LatLng,
  destination: LatLng,
): Promise<{ km: number; minutes: number } | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destinations', `${destination.lat},${destination.lng}`);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('departure_time', 'now');
  url.searchParams.set('region', 'za');
  url.searchParams.set('key', key);

  try {
    const response = await fetch(url, {
      // Road distance between two fixed points is stable; cache for an hour.
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;

    const body = (await response.json()) as DistanceMatrixResponse;
    if (body.status !== 'OK') return null;

    const element = body.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK' || !element.distance) return null;

    const seconds = element.duration_in_traffic?.value ?? element.duration?.value ?? 0;
    return {
      km: Math.round((element.distance.value / 1000) * 100) / 100,
      minutes: Math.round(seconds / 60),
    };
  } catch {
    return null;
  }
}

/** Full quote for a drop point. Postgres decides serviceability and fee. */
export async function quoteDelivery(
  branch: Pick<BranchRow, 'id' | 'latitude' | 'longitude' | 'delivery_enabled'>,
  destination: LatLng,
  subtotalCents: number,
): Promise<DeliveryQuote> {
  if (!branch.delivery_enabled) {
    return {
      ...UNSERVICEABLE,
      reason: 'This branch is not running deliveries right now.',
    };
  }

  const supabase = await createCartelServerClient();
  const { data, error } = await supabase.rpc('resolve_delivery_zone', {
    p_branch_id: branch.id,
    p_lat: destination.lat,
    p_lng: destination.lng,
  });

  if (error) {
    return { ...UNSERVICEABLE, reason: 'Could not check delivery zones. Try again.' };
  }

  const zone = Array.isArray(data) ? data[0] : null;
  if (!zone) return UNSERVICEABLE;

  const driving = await fetchDrivingDistance(
    { lat: branch.latitude, lng: branch.longitude },
    destination,
  );

  const qualifiesForFreeDelivery =
    zone.free_over_cents !== null && subtotalCents >= zone.free_over_cents;

  return {
    serviceable: true,
    reason: null,
    zone,
    straightLineKm: zone.distance_km,
    drivingKm: driving?.km ?? null,
    drivingMinutes: driving?.minutes ?? null,
    feeCents: qualifiesForFreeDelivery ? 0 : zone.fee_cents,
    minOrderCents: zone.min_order_cents,
    freeOverCents: zone.free_over_cents,
    etaMinutes: driving?.minutes ? driving.minutes + 20 : zone.eta_minutes,
  };
}

/** Does the cart clear the zone minimum? */
export function meetsMinimum(quote: DeliveryQuote, subtotalCents: number): boolean {
  return subtotalCents >= quote.minOrderCents;
}

/** Collection slots for today and tomorrow, in the branch timezone. */
export function pickupSlots(
  branch: Pick<BranchRow, 'opens_at' | 'closes_at' | 'pickup_slot_minutes' | 'timezone'>,
  now: Date = new Date(),
  days = 2,
): { start: Date; end: Date; label: string }[] {
  const slots: { start: Date; end: Date; label: string }[] = [];
  const stepMs = branch.pickup_slot_minutes * 60 * 1000;
  const leadMs = 30 * 60 * 1000; // never offer a slot inside the next 30 minutes

  const [openHour = 9, openMinute = 0] = branch.opens_at.split(':').map(Number);
  const [closeHour = 20, closeMinute = 0] = branch.closes_at.split(':').map(Number);

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);

    const open = new Date(day);
    open.setHours(openHour, openMinute, 0, 0);
    const close = new Date(day);
    close.setHours(closeHour, closeMinute, 0, 0);

    for (let cursor = open.getTime(); cursor + stepMs <= close.getTime(); cursor += stepMs) {
      if (cursor < now.getTime() + leadMs) continue;
      const start = new Date(cursor);
      const end = new Date(cursor + stepMs);
      slots.push({
        start,
        end,
        label: new Intl.DateTimeFormat('en-ZA', {
          weekday: dayOffset === 0 ? undefined : 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: branch.timezone,
        }).format(start),
      });
    }
  }

  return slots;
}
