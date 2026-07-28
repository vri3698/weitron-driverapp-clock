import { LocationData } from '../types';
import { GOOGLE_MAPS_API_KEY } from '../constants';

// ── Reverse geocoding ─────────────────────────────────────────────────────────

async function geocodeGoogleMaps(lat: number, lng: number): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return '';
  const data = (await res.json()) as { results?: { formatted_address: string }[] };
  return data.results?.[0]?.formatted_address ?? '';
}

async function geocodeNominatim(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'WeitronDriverApp/1.0 (admin@weitron.com)',
    },
  });
  if (!res.ok) return '';
  const data = (await res.json()) as {
    address?: Record<string, string>;
    display_name?: string;
  };
  const a = data.address ?? {};
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.path].filter(Boolean).join(' ');
  const locality = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.neighbourhood;
  const region = a.state ?? a.county;
  const parts = [street, locality, region].filter(Boolean);
  // Fall back to the first three comma-separated chunks of display_name
  if (parts.length === 0 && data.display_name) {
    return data.display_name.split(',').slice(0, 3).join(',').trim();
  }
  return parts.join(', ');
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    return GOOGLE_MAPS_API_KEY ? await geocodeGoogleMaps(lat, lng) : await geocodeNominatim(lat, lng);
  } catch (err) {
    console.warn('[Geocode] Failed:', err);
    return '';
  }
}

// ── Always-on location watcher ────────────────────────────────────────────────

interface CachedLocation {
  data: LocationData;
  updatedAt: number;
}

let watchId: number | null = null;
let locationCache: CachedLocation | null = null;
let lastGeocodedPoint: { lat: number; lng: number } | null = null;
let geocodeInFlight = false;

const listeners = new Set<(loc: LocationData) => void>();

function notifyListeners(): void {
  if (!locationCache) return;
  const snapshot = { ...locationCache.data };
  listeners.forEach((fn) => fn(snapshot));
}

/** Haversine distance in metres between two lat/lng points. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function handleWatchPosition(pos: GeolocationPosition): Promise<void> {
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  const prevAddress = locationCache?.data.address;

  // Immediately cache new coords (keep existing address while geocoding runs)
  locationCache = { data: { lat, lng, accuracy, address: prevAddress }, updatedAt: Date.now() };
  notifyListeners();

  // Re-geocode only when we've moved > 50 m or have no address yet
  const distFromLastGeocode = lastGeocodedPoint
    ? haversineMeters(lastGeocodedPoint.lat, lastGeocodedPoint.lng, lat, lng)
    : Infinity;
  const needsGeocode = !geocodeInFlight && (!prevAddress || distFromLastGeocode > 50);

  if (needsGeocode) {
    geocodeInFlight = true;
    const address = await reverseGeocode(lat, lng);
    geocodeInFlight = false;

    // Only apply if the device hasn't moved far since the geocode started
    if (locationCache && haversineMeters(locationCache.data.lat, locationCache.data.lng, lat, lng) < 20) {
      locationCache = {
        data: { ...locationCache.data, address: address || locationCache.data.address },
        updatedAt: Date.now(),
      };
      lastGeocodedPoint = { lat, lng };
      notifyListeners();
    }
  }
}

/**
 * Start continuous GPS tracking. Safe to call multiple times — only one watcher
 * is active at a time. Call this after the user logs in.
 */
export function startLocationWatch(): void {
  if (!navigator.geolocation || watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => void handleWatchPosition(pos),
    (err) => console.warn('[GPS] Watch error:', err.message),
    { enableHighAccuracy: true, timeout: 30_000, maximumAge: 10_000 }
  );
}

/** Stop GPS tracking and clear the location cache. Call on logout. */
export function stopLocationWatch(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  locationCache = null;
  lastGeocodedPoint = null;
}

/**
 * Subscribe to location updates. The callback fires immediately if a cached
 * location is available, then again on every GPS update.
 * Returns an unsubscribe function.
 */
export function subscribeLocation(fn: (loc: LocationData) => void): () => void {
  listeners.add(fn);
  if (locationCache) fn({ ...locationCache.data });
  return () => listeners.delete(fn);
}

// ── One-shot location fetch ───────────────────────────────────────────────────

const FRESH_MS = 60_000;      // cache is "fresh" for 60 s
const MAX_ACCURACY_M = 150;   // accept positions within 150 m accuracy

/**
 * Returns the current location with a street address.
 * Uses the always-on cache if it is fresh enough; otherwise requests a new fix.
 */
export async function getCurrentLocation(): Promise<LocationData> {
  // Fresh cache with a known address → return instantly
  if (
    locationCache &&
    Date.now() - locationCache.updatedAt < FRESH_MS &&
    locationCache.data.accuracy <= MAX_ACCURACY_M &&
    locationCache.data.address
  ) {
    return { ...locationCache.data };
  }

  // Fresh cache but address is still being resolved → geocode now
  if (
    locationCache &&
    Date.now() - locationCache.updatedAt < FRESH_MS &&
    locationCache.data.accuracy <= MAX_ACCURACY_M
  ) {
    const { lat, lng } = locationCache.data;
    const address = await reverseGeocode(lat, lng);
    if (address && locationCache) {
      locationCache = { ...locationCache, data: { ...locationCache.data, address } };
      lastGeocodedPoint = { lat, lng };
    }
    return locationCache ? { ...locationCache.data } : { lat, lng, accuracy: 0, address: address || undefined };
  }

  // Cache is stale / absent → request a fresh GPS fix
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }

    const tryGet = (highAccuracy: boolean) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;
          const address = await reverseGeocode(lat, lng);
          const data: LocationData = { lat, lng, accuracy, address: address || undefined };
          locationCache = { data, updatedAt: Date.now() };
          if (address) lastGeocodedPoint = { lat, lng };
          notifyListeners();
          resolve(data);
        },
        (err) => {
          // Retry with low accuracy on UNAVAILABLE or TIMEOUT; never on PERMISSION_DENIED
          if (err.code !== err.PERMISSION_DENIED && highAccuracy) {
            tryGet(false);
            return;
          }
          reject(new Error(getErrorMessage(err)));
        },
        { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 15_000 : 10_000, maximumAge: 30_000 }
      );
    };

    tryGet(true);
  });
}

function getErrorMessage(err: GeolocationPositionError): string {
  const messages: Record<number, string> = {
    [err.PERMISSION_DENIED]:
      'Location permission was denied. Please allow location access in your browser settings and try again.',
    [err.POSITION_UNAVAILABLE]:
      'Location is unavailable right now. Please make sure location services are enabled.',
    [err.TIMEOUT]: 'Location request timed out. Please try again.',
  };
  return messages[err.code] ?? 'Unable to get location.';
}

export function getLocationHelpText(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'On iPhone: Settings → Privacy & Security → Location Services → allow Safari. Then tap Try again.';
  }
  if (/Android/i.test(ua)) {
    return 'On Android: Settings → Location → allow this browser. Then tap Try again.';
  }
  return 'Open the app over HTTPS, then enable location services in your browser/device settings.';
}

