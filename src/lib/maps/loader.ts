'use client';

/**
 * Google Maps JavaScript API loader.
 *
 * Loads the Places library once per page, shared by every autocomplete input.
 * Uses the modern `importLibrary` bootstrap so no global callback is needed.
 */

type MapsLibraries = 'places' | 'geocoding' | 'geometry' | 'routes';

interface GoogleMapsImportable {
  maps: {
    importLibrary: (library: MapsLibraries) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    google?: GoogleMapsImportable;
  }
}

let loadPromise: Promise<void> | null = null;

const SCRIPT_ID = 'cartel-google-maps';

export function isMapsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Promise.reject(
      new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set — address lookup is unavailable.'),
    );
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load.')), {
        once: true,
      });
      if (window.google?.maps) resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      '&libraries=places&loading=async&region=ZA&language=en';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => {
        loadPromise = null;
        reject(new Error('Google Maps failed to load.'));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return loadPromise;
}

export interface PlaceResult {
  formattedAddress: string;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
  placeId: string;
}

/** South Africa only — the collective does not deliver across borders. */
export const AUTOCOMPLETE_COUNTRY = 'za';
