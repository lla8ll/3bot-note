import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleSummarizeRequest, resetRateLimitsForTests } from '../src/summarize-handler.mjs';

const testEnv = {
  OPENAI_API_KEY: 'api-token-for-tests',
  OPENAI_MODEL: 'gpt-5-mini',
  APP_ORIGIN: 'http://localhost:3000'
};

function request(text = 'هذه ملاحظة طويلة بما يكفي للاختبار.', origin = testEnv.APP_ORIGIN) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request('http://localhost:3000/api/summarize', {
    method: 'POST',
    headers,
    body: JSON.stringify({ text })
  });
}

afterEach(() => resetRateLimitsForTests());

test('يرفض الطلب عندما لا يكون المفتاح مهيأ على الخادم', async () => {
  const response = await handleSummarizeRequest(request(), {
    env: { APP_ORIGIN: testEnv.APP_ORIGIN },
    clientId: 'missing-key-test',
    fetchImpl: async () => assert.fail('يجب ألا يتم استدعاء OpenAI دون مفتاح')
  });

  assert.equal(response.status, 503);
});

test('يرفض مصدرًا مختلفًا', async () => {
  const response = await handleSummarizeRequest(request('نص', 'https://example.test'), {
    env: testEnv,
    clientId: 'origin-test',
    fetchImpl: async () => assert.fail('يجب ألا يتم استدعاء OpenAI لمصدر مرفوض')
  });

  assert.equal(response.status, 403);
});

test('يرفض الطلب عندما يغيب Origin', async () => {
  const response = await handleSummarizeRequest(request('نص', ''), {
    env: testEnv,
    clientId: 'missing-origin-test',
    fetchImpl: async () => assert.fail('يجب ألا يتم استدعاء OpenAI دون Origin')
  });

  assert.equal(response.status, 403);
});

test('يرسل الطلب إلى Responses API ويعيد النص فقط', async () => {
  let outbound;
  const response = await handleSummarizeRequest(request(), {
    env: testEnv,
    clientId: 'success-test',
    fetchImpl: async (url, options) => {
      outbound = { url, options };
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'ملخص آمن.' }] }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).summary, 'ملخص آمن.');
  assert.equal(outbound.url, 'https://api.openai.com/v1/responses');
  assert.equal(outbound.options.method, 'POST');
  assert.equal(outbound.options.headers.Authorization, `Bearer ${testEnv.OPENAI_API_KEY}`);
  const payload = JSON.parse(outbound.options.body);
  assert.equal(payload.model, 'gpt-5-mini');
  assert.equal(payload.store, false);
  assert.equal(payload.max_output_tokens, 400);
});

test('يرفض الملاحظات التي تتجاوز الحد', async () => {
  const response = await handleSummarizeRequest(request('ن'.repeat(12_001)), {
    env: testEnv,
    clientId: 'size-test',
    fetchImpl: async () => assert.fail('يجب ألا يتم استدعاء OpenAI لمدخل كبير')
  });

  assert.equal(response.status, 413);
});

test('يصنف نفاد حصة OpenAI كخدمة غير متاحة دون كشف تفاصيل الحساب', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await handleSummarizeRequest(request(), {
      env: testEnv,
      clientId: 'quota-test',
      fetchImpl: async () => new Response(JSON.stringify({
        error: { code: 'insufficient_quota', type: 'insufficient_quota' }
      }), { status: 429, headers: { 'Content-Type': 'application/json' } })
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'خدمة التلخيص غير متاحة مؤقتًا.' });
  } finally {
    console.error = originalError;
  }
});

test('يرفض استجابة تلخيص غير مكتملة', async () => {
  const response = await handleSummarizeRequest(request(), {
    env: testEnv,
    clientId: 'incomplete-test',
    fetchImpl: async () => new Response(JSON.stringify({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output_text: 'ملخص جزئي'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'لم يكتمل التلخيص. اختصر الملاحظة وحاول مجددًا.' });
});

test('يطبق حد الطلبات المبدئي لكل عميل', async () => {
  const env = { ...testEnv, AI_RATE_LIMIT: '1' };
  const fetchImpl = async () => new Response(JSON.stringify({
    output: [{ content: [{ type: 'output_text', text: 'ملخص.' }] }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const first = await handleSummarizeRequest(request(), { env, clientId: 'rate-test', fetchImpl });
  const second = await handleSummarizeRequest(request(), { env, clientId: 'rate-test', fetchImpl });

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
});
