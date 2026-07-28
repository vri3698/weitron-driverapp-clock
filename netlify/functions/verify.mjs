// Server-side proxy to Google Apps Script — no browser CORS involved.
const GAS_URL =
  process.env.GAS_WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbyk9MUZSdHSwDUDEMycfBs7I79aJbqSyidSRp6Zx0Xr445kUnc_JmhoDrTkevh90-S4/exec';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const gasRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: event.body ?? '{}',
    });
    const data = await gasRes.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('[verify]', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Verification service error.' }),
    };
  }
};
