const crypto = require('crypto');

const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

class RequestValidationError extends Error {}

function validateIssueRequest(request) {
  const clientId = typeof request?.clientId === 'string' ? request.clientId.trim() : '';
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new RequestValidationError('客户端 ID 格式不正确');
  }
  if (request.mode !== 'short' && request.mode !== 'permanent') {
    throw new RequestValidationError('不支持的许可类型');
  }
  return { clientId, mode: request.mode };
}

async function issueLicense(request, privateKey, upload, issuedAt = Date.now()) {
  const { clientId, mode } = validateIssueRequest(request);
  if (!privateKey) {
    throw new Error('未配置许可签名密钥');
  }

  const durationDays = mode === 'short' ? 1 : 0;
  const expiresAt = durationDays ? issuedAt + DAY_IN_MS : null;
  const payload = expiresAt === null ? clientId : `${clientId}#${issuedAt}#${expiresAt}`;
  const signature = crypto.createSign('RSA-SHA1').update(payload).end().sign(privateKey);

  let license = signature;
  if (expiresAt !== null) {
    const validity = Buffer.alloc(16);
    validity.writeBigUInt64LE(BigInt(issuedAt), 0);
    validity.writeBigUInt64LE(BigInt(expiresAt), 8);
    license = Buffer.concat([signature, validity]);
  }

  const downloadUrl = await upload(clientId, license, issuedAt);
  return { downloadUrl, durationDays };
}

module.exports = { issueLicense, validateIssueRequest, RequestValidationError };
