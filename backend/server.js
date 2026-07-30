import 'dotenv/config';
import express from 'express';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';
import webpush from 'web-push';

const app = express();
app.use(express.json({ limit: process?.env?.API_PAYLOAD_MAX_SIZE || '7mb' }));

const PORT = process?.env?.API_BACKEND_PORT || 5000;
const API_BACKEND_HOST = process?.env?.API_BACKEND_HOST || '127.0.0.1';
const GOOGLE_CLOUD_LOCATION = process?.env?.GOOGLE_CLOUD_LOCATION;
const GOOGLE_CLOUD_PROJECT = process?.env?.GOOGLE_CLOUD_PROJECT;
const PROXY_HEADER = process?.env?.PROXY_HEADER;
const GAS_WEB_APP_URL = process?.env?.GAS_WEB_APP_URL || 'https://script.google.com/macros/s/AKfycbyk9MUZSdHSwDUDEMycfBs7I79aJbqSyidSRp6Zx0Xr445kUnc_JmhoDrTkevh90-S4/exec';

if (!GOOGLE_CLOUD_PROJECT || !GOOGLE_CLOUD_LOCATION) {
  console.error('Error: Environment variables GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION must be set.');
  process.exit(1);
}
if (!PROXY_HEADER) {
  console.error('Error: Environment variable PROXY_HEADER must be set.');
  process.exit(1);
}

app.set('trust proxy', 1);
app.use('/api-proxy', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'You have exceed the request limit, please try again later.' },
}));

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const pushSubscriptions = new Map();
const VAPID_PUBLIC_KEY = process?.env?.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process?.env?.VAPID_PRIVATE_KEY;
const ADMIN_PUSH_KEY = process?.env?.ADMIN_PUSH_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@weitron.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function normalizeClockPayload(body) {
  if (body?.action !== 'clock' || !body?.entry) return body;
  return {
    ...body,
    entry: {
      ...body.entry,
      address: String(body.entry.address || body.entry.streetAddress || '').trim() || 'Not found',
      streetAddress: String(body.entry.streetAddress || body.entry.address || '').trim() || 'Not found',
    },
  };
}

async function proxyToGAS(req, res) {
  try {
    const gasRes = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(normalizeClockPayload(req.body)),
    });
    const data = await gasRes.json();
    res.json(data);
  } catch (err) {
    console.error('[GAS Proxy] Error:', err.message);
    res.status(500).json({ error: 'GAS proxy error' });
  }
}

app.post('/api/verify', proxyToGAS);
app.post('/api/clock', proxyToGAS);
app.post('/api/shift-state', proxyToGAS);

app.get('/api/vapid-public-key', (_req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'VAPID not configured' });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/subscribe', (req, res) => {
  const payload = req.body;
  const sub = payload?.subscription ?? payload;
  if (!sub?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  const id = Buffer.from(sub.endpoint).toString('base64').slice(0, 64);
  pushSubscriptions.set(id, { ...sub, employeeId: payload?.employeeId || '' });
  console.log(`[Push] Subscription registered. Total: ${pushSubscriptions.size}`);
  res.json({ ok: true, count: pushSubscriptions.size });
});

app.post('/api/push', async (req, res) => {
  const { adminKey, title, body: msgBody, url, employeeId } = req.body;
  if (!ADMIN_PUSH_KEY || adminKey !== ADMIN_PUSH_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: 'VAPID keys not configured' });
  }

  let sent = 0;
  let failed = 0;
  for (const [id, sub] of pushSubscriptions.entries()) {
    if (employeeId && sub.employeeId && sub.employeeId !== employeeId) continue;
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body: msgBody, url: url ?? '/' }));
      sent += 1;
    } catch (err) {
      failed += 1;
      if (err.statusCode === 410 || err.statusCode === 404) pushSubscriptions.delete(id);
    }
  }

  console.log(`[Push] Sent: ${sent}, Failed: ${failed}`);
  res.json({ ok: true, sent, failed });
});

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePattern(pattern) {
  const paramRegex = /\{\{(.*?)\}\}/g;
  const params = [];
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = paramRegex.exec(pattern)) !== null) {
    params.push(match[1]);
    const literalPart = pattern.substring(lastIndex, match.index);
    parts.push(escapeRegex(literalPart));
    parts.push(`(?<${match[1]}>[^/]+)`);
    lastIndex = paramRegex.lastIndex;
  }
  parts.push(escapeRegex(pattern.substring(lastIndex)));
  const regexString = parts.join('');
  return { regex: new RegExp(`^${regexString}$`), params };
}

function extractParams(patternInfo, url) {
  const match = url.match(patternInfo.regex);
  if (!match) return null;
  const params = {};
  patternInfo.params.forEach((paramName, index) => {
    params[paramName] = match[index + 1];
  });
  return params;
}

async function getAccessToken(res) {
  try {
    const authClient = await auth.getClient();
    const token = await authClient.getAccessToken();
    return token.token;
  } catch (error) {
    console.error('[Node Proxy] Authentication error:', error);
    if (!res) return null;
    if (error.code === 'ERR_GCLOUD_NOT_LOGGED_IN' || (error.message && error.message.includes('Could not load the default credentials'))) {
      res.status(401).json({
        error: 'Authentication Required',
        message: 'Google Cloud Application Default Credentials not found or invalid. Please run "gcloud auth application-default login" and try again.',
      });
    } else {
      res.status(500).json({ error: `Authentication failed: ${error.message}` });
    }
    return null;
  }
}

function getRequestHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Goog-User-Project': GOOGLE_CLOUD_PROJECT,
    'Content-Type': 'application/json',
  };
}

const API_CLIENT_MAP = [
  {
    name: 'VertexGenAi:generateContent',
    patternForProxy: 'https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:generateContent',
    getApiEndpoint: (context, params) => `https://aiplatform.clients6.google.com/${params.version}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params.model}:generateContent`,
    isStreaming: false,
    transformFn: null,
  },
  {
    name: 'VertexGenAi:predict',
    patternForProxy: 'https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:predict',
    getApiEndpoint: (context, params) => `https://aiplatform.clients6.google.com/${params.version}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params.model}:predict`,
    isStreaming: false,
    transformFn: null,
  },
  {
    name: 'VertexGenAi:streamGenerateContent',
    patternForProxy: 'https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:streamGenerateContent',
    getApiEndpoint: (context, params) => `https://aiplatform.clients6.google.com/${params.version}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params.model}:streamGenerateContent`,
    isStreaming: true,
    transformFn: (response) => {
      let normalizedResponse = response.trim();
      while (normalizedResponse.startsWith(',') || normalizedResponse.startsWith('[')) normalizedResponse = normalizedResponse.substring(1).trim();
      while (normalizedResponse.endsWith(',') || normalizedResponse.endsWith(']')) normalizedResponse = normalizedResponse.substring(0, normalizedResponse.length - 1).trim();
      if (!normalizedResponse.length) return { result: null, inProgress: false };
      if (!normalizedResponse.endsWith('}')) return { result: normalizedResponse, inProgress: true };
      const parsedResponse = JSON.parse(normalizedResponse);
      return { result: `data: ${JSON.stringify(parsedResponse)}\n\n`, inProgress: false };
    },
  },
].map((client) => ({ ...client, patternInfo: parsePattern(client.patternForProxy) }));

const ALLOWED_UPSTREAM_HOSTS = new Set(['aiplatform.clients6.google.com']);

app.post('/api-proxy', async (req, res) => {
  if (req.headers['x-app-proxy'] !== PROXY_HEADER) {
    return res.status(403).send('Forbidden: Request must originate from the Vertex App shim.');
  }

  const { originalUrl, method, headers, body } = req.body;
  if (!originalUrl) {
    return res.status(400).send('Bad Request: originalUrl is required.');
  }

  const apiClient = API_CLIENT_MAP.find((p) => {
    req.extractedParams = extractParams(p.patternInfo, originalUrl);
    return req.extractedParams !== null;
  });

  if (!apiClient) {
    return res.status(404).json({ error: `No proxy handler found for URL: ${originalUrl}` });
  }

  try {
    const accessToken = await getAccessToken(res);
    if (!accessToken) return;

    const context = { projectId: GOOGLE_CLOUD_PROJECT, region: GOOGLE_CLOUD_LOCATION };
    const apiUrl = apiClient.getApiEndpoint(context, req.extractedParams);
    const parsedApiUrl = new URL(apiUrl);
    if (!ALLOWED_UPSTREAM_HOSTS.has(parsedApiUrl.hostname.toLowerCase())) {
      return res.status(400).json({ error: 'Upstream host not allowed.' });
    }

    const apiResponse = await fetch(apiUrl, {
      method: method || 'POST',
      headers: { ...getRequestHeaders(accessToken), ...headers },
      body: body || undefined,
    });

    if (apiClient.isStreaming) {
      res.writeHead(apiResponse.status, {
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
        Connection: 'keep-alive',
      });
      res.flushHeaders();

      if (!apiResponse.body) {
        return res.end(JSON.stringify({ error: 'Streaming response body is null' }));
      }

      const decoder = new TextDecoder();
      let deltaChunk = '';
      apiResponse.body.on('data', (encodedChunk) => {
        if (res.writableEnded) return;
        if (!apiClient.transformFn) {
          res.write(encodedChunk);
          return;
        }
        const decodedChunk = decoder.decode(encodedChunk, { stream: true });
        deltaChunk += decodedChunk;
        const { result, inProgress } = apiClient.transformFn(deltaChunk);
        if (result && !inProgress) {
          deltaChunk = '';
          res.write(new TextEncoder().encode(result));
        }
      });
      apiResponse.body.on('end', () => res.end());
      apiResponse.body.on('error', (streamError) => {
        if (!res.writableEnded) res.end(JSON.stringify({ proxyError: 'Stream error from Vertex AI', details: streamError.message }));
      });
    } else {
      const data = await apiResponse.json();
      res.status(apiResponse.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

const server = app.listen(PORT, API_BACKEND_HOST, () => {
  console.log(`Vertex AI Backend listening at http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== '/ws-proxy') {
    socket.destroy();
    return;
  }

  let targetUrl = url.searchParams.get('target');
  if (!targetUrl) {
    socket.destroy();
    return;
  }

  if (targetUrl === 'wss://aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent') {
    const location = GOOGLE_CLOUD_LOCATION === 'global' ? 'us-central1' : GOOGLE_CLOUD_LOCATION;
    targetUrl = `wss://${location}-aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
  } else {
    socket.destroy();
    return;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    socket.destroy();
    return;
  }

  const upstreamWs = new WebSocket(targetUrl, { headers: getRequestHeaders(accessToken) });
  const initialErrorHandler = () => {
    if (socket.writable) {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
    }
  };

  upstreamWs.once('error', initialErrorHandler);
  upstreamWs.once('open', () => {
    upstreamWs.removeListener('error', initialErrorHandler);
    wss.handleUpgrade(request, socket, head, (ws) => {
      upstreamWs.on('message', (data, isBinary) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data, { binary: isBinary });
      });
      ws.on('message', (data) => {
        try {
          const dataJson = JSON.parse(data.toString());
          if (dataJson.setup) {
            dataJson.setup.model = `projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/${dataJson.setup.model}`;
          }
          if (upstreamWs.readyState === WebSocket.OPEN) upstreamWs.send(JSON.stringify(dataJson), { binary: false });
        } catch {
          ws.close(1011, 'Failed to parse message');
        }
      });
      upstreamWs.on('close', (code, reason) => ws.readyState === WebSocket.OPEN && ws.close(code, reason));
      upstreamWs.on('error', (error) => ws.close(1011, error.message));
      ws.on('error', (error) => upstreamWs.close(1011, error.message));
      ws.on('close', (_code, reason) => upstreamWs.readyState === WebSocket.OPEN && upstreamWs.close(1000, reason));
      wss.emit('connection', ws, request);
    });
  });
});
