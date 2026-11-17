const crypto = require('node:crypto');
const { app } = require('@azure/functions');
const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { issueLicense, validateIssueRequest, RequestValidationError } = require('./license');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function verifyWechatCode(code, appId, appSecret, request = fetch) {
  if (typeof code !== 'string' || !code || code.length > 512) {
    throw new HttpError(401, '微信登录信息无效，请重试。');
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  let response;
  try {
    response = await request(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new HttpError(502, '微信登录服务暂不可用，请稍后重试。');
  }
  if (!response.ok) {
    throw new HttpError(502, '微信登录服务暂不可用，请稍后重试。');
  }

  let session;
  try {
    session = await response.json();
  } catch {
    throw new HttpError(502, '微信登录服务返回数据无效。');
  }
  if (!session || (session.errcode !== undefined && session.errcode !== 0) ||
      typeof session.openid !== 'string' || !session.openid) {
    throw new HttpError(401, '微信登录信息无效，请重试。');
  }
  return session.openid;
}

async function uploadToStorage(clientId, license, issuedAt, settings) {
  const account = settings.AZURE_STORAGE_ACCOUNT;
  const credential = new StorageSharedKeyCredential(account, settings.AZURE_STORAGE_KEY);
  const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
  const blobName = `${clientId}-${issuedAt}-${crypto.randomBytes(6).toString('hex')}/.lfm-license.dat`;
  const blobClient = service.getContainerClient('licenses').getBlockBlobClient(blobName);
  await blobClient.uploadData(license, {
    blobHTTPHeaders: { blobContentType: 'application/octet-stream' }
  });
  return blobClient.url;
}

function httpResponse(status, jsonBody) {
  return { status, jsonBody, headers: { 'Cache-Control': 'no-store' } };
}

function createHandler({ settings = process.env, verifyCode = verifyWechatCode, upload = uploadToStorage } = {}) {
  return async function (request, context) {
    let body;
    try {
      body = await request.json();
    } catch {
      return httpResponse(400, { error: '请求必须是 JSON。' });
    }

    try {
      const issueRequest = validateIssueRequest(body);
      const required = ['WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'LICENSE_PRIVATE_KEY_BASE64',
        'AZURE_STORAGE_ACCOUNT', 'AZURE_STORAGE_KEY'];
      const missing = required.filter((name) => !settings[name]);
      if (missing.length) {
        context.error(`签发配置缺失：${missing.join('、')}`);
        return httpResponse(503, { error: '签发服务配置不完整。' });
      }

      await verifyCode(body.code, settings.WECHAT_APP_ID, settings.WECHAT_APP_SECRET);
      const privateKey = Buffer.from(settings.LICENSE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
      const result = await issueLicense(issueRequest, privateKey,
        (clientId, bytes, issuedAt) => upload(clientId, bytes, issuedAt, settings));
      return httpResponse(200, result);
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return httpResponse(400, { error: error.message });
      }
      if (error instanceof HttpError) {
        return httpResponse(error.status, { error: error.message });
      }
      context.error('签发许可失败', error);
      return httpResponse(500, { error: '签发失败，请稍后重试。' });
    }
  };
}

app.http('issue-license', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'issue-license',
  handler: createHandler()
});

module.exports = { createHandler, verifyWechatCode };
