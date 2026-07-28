import { getStore } from '@netlify/blobs';

const SITE_ID = 'bad4b65e-4dc5-4413-b990-bcd4ba621e80';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const subscription = JSON.parse(event.body);
    if (!subscription?.endpoint) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid subscription' }) };

    const store = getStore({
      name: 'push-subscriptions',
      siteID: SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    // Use a stable key derived from the endpoint URL
    const id = btoa(subscription.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
    await store.set(id, JSON.stringify(subscription));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('[subscribe]', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
