// Server-side proxy to Google Apps Script — no browser CORS involved.
const GAS_URL =
  process.env.GAS_WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbyk9MUZSdHSwDUDEMycfBs7I79aJbqSyidSRp6Zx0Xr445kUnc_JmhoDrTkevh90-S4/exec';

async function reverseGeocodeIfMissing(entry) {
  const lat = Number(entry?.lat);
  const lng = Number(entry?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const current = String(entry?.address ?? entry?.streetAddress ?? '').trim();

  if (current || !hasCoords) return current;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WeitronDriverApp/1.0 (admin@weitron.com)',
      },
    });
    if (!res.ok) return '';
    const data = await res.json();
    const a = data?.address ?? {};
    const street = [a.house_number, a.road ?? a.pedestrian ?? a.path].filter(Boolean).join(' ');
    const locality = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.neighbourhood;
    const region = a.state ?? a.county;
    const parts = [street, locality, region].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    return typeof data?.display_name === 'string'
      ? data.display_name.split(',').slice(0, 3).join(',').trim()
      : '';
  } catch {
    return '';
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const payload = JSON.parse(event.body ?? '{}');
    const entry = payload?.entry ?? {};
    const resolvedAddress = await reverseGeocodeIfMissing(entry);

    // Keep both new and legacy field names so whichever GAS version is deployed
    // can map location/address values correctly.
    const normalizedPayload = {
      ...payload,
      entry: {
        ...entry,
        locationName: String(entry.locationName ?? ''),
        address: String(entry.address ?? entry.streetAddress ?? resolvedAddress ?? ''),
        streetAddress: String(entry.streetAddress ?? entry.address ?? resolvedAddress ?? ''),
        latitude: entry.lat ?? '',
        longitude: entry.lng ?? '',
      },
    };

    const gasRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(normalizedPayload),
    });
    const data = await gasRes.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('[clock]', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false }),
    };
  }
};
