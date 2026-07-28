import webpush from 'web-push';
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
    const { adminKey, title, body, url } = JSON.parse(event.body ?? '{}');

    if (!adminKey || adminKey !== process.env.ADMIN_PUSH_KEY) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    if (!title?.trim()) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Title is required' }) };
    }

    webpush.setVapidDetails(
      'mailto:admin@weitron.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const store = getStore({
      name: 'push-subscriptions',
      siteID: SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    const { blobs } = await store.list();

    let sent = 0, failed = 0;
    await Promise.allSettled(
      blobs.map(async (blob) => {
        try {
          const raw = await store.get(blob.key);
          if (!raw) return;
          const sub = JSON.parse(raw);
          await webpush.sendNotification(sub, JSON.stringify({ title: title.trim(), body: body?.trim() ?? '', url: url ?? '/' }));
          sent++;
        } catch (err) {
          failed++;
          if (err.statusCode === 410 || err.statusCode === 404) {
            await store.delete(blob.key).catch(() => {});
          }
        }
      })
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({ ok: true, sent, failed }),
    };
  } catch (err) {
    console.error('[push]', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
