const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { createHandler, verifyWechatCode } = require('./index');

const CLIENT_ID = '123e4567-e89b-42d3-a456-426614174000';
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const settings = {
  WECHAT_APP_ID: 'wx-test-app',
  WECHAT_APP_SECRET: 'test-secret',
  LICENSE_PRIVATE_KEY_BASE64: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64'),
  AZURE_STORAGE_ACCOUNT: 'test-account',
  AZURE_STORAGE_KEY: 'test-key'
};
const context = { error() {} };

test('one-time WeChat login code must resolve to an openid', async () => {
  const openid = await verifyWechatCode('temporary-code', settings.WECHAT_APP_ID,
    settings.WECHAT_APP_SECRET, async (url) => {
      assert.equal(url.searchParams.get('appid'), settings.WECHAT_APP_ID);
      assert.equal(url.searchParams.get('js_code'), 'temporary-code');
      return { ok: true, json: async () => ({ openid: 'test-openid', session_key: 'test-session' }) };
    });
  assert.equal(openid, 'test-openid');

  await assert.rejects(verifyWechatCode('invalid', settings.WECHAT_APP_ID,
    settings.WECHAT_APP_SECRET, async () => ({
      ok: true, json: async () => ({ errcode: 40029, errmsg: 'invalid code' })
    })), /微信登录信息无效/);
});

test('HTTP handler requires valid JSON and request parameters', async () => {
  const handler = createHandler({ settings });
  assert.equal((await handler({ json: async () => { throw new SyntaxError(); } }, context)).status, 400);
  const response = await handler({ json: async () => ({ clientId: '../other', mode: 'short' }) }, context);
  assert.deepEqual(response.jsonBody, { error: '客户端 ID 格式不正确' });
  assert.equal(response.status, 400);
});

test('HTTP handler verifies login before signing and returns the license URL', async () => {
  let verifiedCode;
  let uploaded;
  const handler = createHandler({
    settings,
    verifyCode: async (code) => { verifiedCode = code; return 'test-openid'; },
    upload: async (clientId, license) => {
      uploaded = { clientId, license };
      return 'https://example.com/license.dat';
    }
  });
  const response = await handler({
    json: async () => ({ clientId: CLIENT_ID, mode: 'permanent', code: 'temporary-code' })
  }, context);

  assert.equal(verifiedCode, 'temporary-code');
  assert.equal(uploaded.clientId, CLIENT_ID);
  assert.equal(uploaded.license.length, 256);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    downloadUrl: 'https://example.com/license.dat',
    durationDays: 0
  });
});

test('missing configuration and rejected login cannot return a license', async () => {
  const request = { json: async () => ({ clientId: CLIENT_ID, mode: 'short', code: 'test' }) };
  const unconfigured = createHandler({ settings: {} });
  assert.equal((await unconfigured(request, context)).status, 503);

  let uploads = 0;
  const rejected = createHandler({
    settings,
    verifyCode: (code) => verifyWechatCode(code, settings.WECHAT_APP_ID,
      settings.WECHAT_APP_SECRET, async () => ({
        ok: true, json: async () => ({ errcode: 40029 })
      })),
    upload: async () => { uploads += 1; }
  });
  const response = await rejected(request, context);
  assert.equal(response.status, 401);
  assert.equal(uploads, 0);
});
