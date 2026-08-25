import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import summarize from '../api/summarize.js';

const originalEnv = {
  APP_ORIGIN: process.env.APP_ORIGIN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY
};

before(() => {
  process.env.APP_ORIGIN = 'https://dyoth.net';
  delete process.env.OPENAI_API_KEY;
});

after(() => {
  if (originalEnv.APP_ORIGIN === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalEnv.APP_ORIGIN;
  if (originalEnv.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
});

async function callApi({ body, headers = {}, method = 'POST' }) {
  const responseHeaders = new Map();
  let responseBody = Buffer.alloc(0);
  const request = {
    body,
    headers: { host: 'dyoth.net', ...headers },
    method,
    url: '/api/summarize',
    socket: { remoteAddress: '127.0.0.1' }
  };
  const response = {
    statusCode: 200,
    setHeader(name, value) {
      responseHeaders.set(name.toLowerCase(), String(value));
    },
    end(value = '') {
      responseBody = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    }
  };

  await summarize(request, response);
  return {
    status: response.statusCode,
    headers: responseHeaders,
    json: () => JSON.parse(responseBody.toString('utf8'))
  };
}

const validHeaders = {
  'content-type': 'application/json',
  origin: 'https://dyoth.net',
  'x-forwarded-proto': 'https'
};

test('Vercel adapter يرفض body نصيًا متجاوزًا للحد', async () => {
  const response = await callApi({ body: 'x'.repeat(50_001), headers: validHeaders });
  assert.equal(response.status, 413);
});

test('Vercel adapter يرفض Origin المفقود', async () => {
  const response = await callApi({ body: { text: 'نص' }, headers: { 'content-type': 'application/json' } });
  assert.equal(response.status, 403);
});

test('Vercel adapter يتعامل مع JSON غير صالح', async () => {
  const response = await callApi({ body: Buffer.from('{'), headers: validHeaders });
  assert.equal(response.status, 400);
});

test('Vercel adapter يرفض Content-Type غير الصحيح', async () => {
  const response = await callApi({ body: { text: 'نص' }, headers: { ...validHeaders, 'content-type': 'text/plain' } });
  assert.equal(response.status, 415);
});

test('Vercel adapter يقبل Buffer ثم يرفض بأمان عند غياب المفتاح', async () => {
  const response = await callApi({
    body: Buffer.from(JSON.stringify({ text: 'نص صالح' })),
    headers: validHeaders
  });
  assert.equal(response.status, 503);
  assert.deepEqual(response.json(), { error: 'خدمة التلخيص غير مهيأة على الخادم.' });
});

test('Vercel adapter يقبل 12000 حرف Unicode ضمن حد البايتات', async () => {
  const response = await callApi({ body: { text: '字'.repeat(12_000) }, headers: validHeaders });
  assert.equal(response.status, 503);
});
