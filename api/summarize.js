import { handleSummarizeRequest } from '../src/summarize-handler.mjs';

const MAX_BODY_BYTES = 50_000;

function ensureBodySize(value) {
  if (Buffer.byteLength(value, 'utf8') > MAX_BODY_BYTES) {
    throw new RangeError('request_too_large');
  }
  return value;
}

async function readRequestBody(request) {
  if (typeof request.body === 'string') return ensureBodySize(request.body);
  if (Buffer.isBuffer(request.body) || request.body instanceof Uint8Array) {
    if (request.body.byteLength > MAX_BODY_BYTES) throw new RangeError('request_too_large');
    return Buffer.from(request.body).toString('utf8');
  }
  if (request.body && typeof request.body === 'object') return ensureBodySize(JSON.stringify(request.body));

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RangeError('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function requestUrl(request) {
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || 'https';
  const host = request.headers.host || 'localhost';
  return `${protocol}://${host}${request.url || '/api/summarize'}`;
}

function requestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '));
    else if (value != null) headers.set(name, String(value));
  }
  return headers;
}

function clientId(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || 'anonymous';
}

export default async function summarize(request, response) {
  try {
    const method = request.method || 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(request);
    const webRequest = new Request(requestUrl(request), {
      method,
      headers: requestHeaders(request),
      body
    });
    const webResponse = await handleSummarizeRequest(webRequest, { clientId: clientId(request) });

    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 500;
    response.statusCode = status;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: status === 413 ? 'الطلب أكبر من الحد المسموح.' : 'خطأ داخلي.' }));
  }
}
