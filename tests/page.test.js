const assert = require('node:assert/strict');
const test = require('node:test');

let pageDefinition;
global.Page = (definition) => { pageDefinition = definition; };
require('../miniprogram/pages/index/index.js');

const CLIENT_ID = '123e4567-e89b-42d3-a456-426614174000';

function createPage(clientId = CLIENT_ID, mode = 'short') {
  return {
    data: { clientId, mode, loading: false, error: '', result: null },
    setData(values) { Object.assign(this.data, values); }
  };
}

test('page sends a fresh WeChat login code and shows the returned license link', async () => {
  const page = createPage();
  global.wx = {
    login({ success }) { success({ code: 'one-time-code' }); },
    request(options) {
      assert.equal(options.method, 'POST');
      assert.match(options.url, /^https:\/\/lifa-mosaic-license-issuer\.weixin\.sneezry\.cn\//);
      assert.deepEqual(options.data, { clientId: CLIENT_ID, mode: 'short', code: 'one-time-code' });
      options.success({
        statusCode: 200,
        data: { downloadUrl: 'https://example.com/license.dat', durationDays: 1 }
      });
    }
  };

  await pageDefinition.onSubmit.call(page);
  assert.equal(page.data.result.downloadUrl, 'https://example.com/license.dat');
  assert.equal(page.data.validity, '1 天');
  assert.equal(page.data.loading, false);
});

test('page displays an HTTP rejection instead of a success result', async () => {
  const page = createPage(CLIENT_ID, 'permanent');
  global.wx = {
    login({ success }) { success({ code: 'one-time-code' }); },
    request({ success }) {
      success({ statusCode: 401, data: { error: '微信登录信息无效，请重试。' } });
    }
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await pageDefinition.onSubmit.call(page);
  } finally {
    console.error = originalError;
  }
  assert.equal(page.data.result, null);
  assert.equal(page.data.error, '微信登录信息无效，请重试。');
  assert.equal(page.data.loading, false);
});

test('invalid client IDs cannot start login or send a request', async () => {
  const page = createPage('../other');
  global.wx = {
    login() { throw new Error('login should not run'); },
    request() { throw new Error('request should not run'); }
  };
  await pageDefinition.onSubmit.call(page);
  assert.match(page.data.error, /客户端 ID/);
});
