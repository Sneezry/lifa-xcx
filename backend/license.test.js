const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { issueLicense } = require('./license');

const CLIENT_ID = '123e4567-e89b-42d3-a456-426614174000';
const ISSUED_AT = 1700000000000;
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

test('one-day license keeps the existing signature and little-endian expiry format', async () => {
  let uploaded;
  const result = await issueLicense(
    { clientId: ` ${CLIENT_ID} `, mode: 'short' },
    privateKey,
    async (clientId, license, issuedAt) => {
      uploaded = { clientId, license, issuedAt };
      return 'https://example.com/licenses/license.dat';
    },
    ISSUED_AT
  );

  assert.deepEqual(result, {
    downloadUrl: 'https://example.com/licenses/license.dat',
    durationDays: 1
  });
  assert.equal(uploaded.clientId, CLIENT_ID);
  assert.equal(uploaded.issuedAt, ISSUED_AT);
  assert.equal(uploaded.license.length, 256 + 16);
  assert.equal(uploaded.license.readBigUInt64LE(256), BigInt(ISSUED_AT));
  assert.equal(uploaded.license.readBigUInt64LE(264), BigInt(ISSUED_AT + 86400000));
  assert.ok(crypto.verify(
    'RSA-SHA1',
    Buffer.from(`${CLIENT_ID}#${ISSUED_AT}#${ISSUED_AT + 86400000}`),
    publicKey,
    uploaded.license.subarray(0, 256)
  ));
});

test('permanent license contains only the signature of the client ID', async () => {
  let license;
  const result = await issueLicense(
    { clientId: CLIENT_ID, mode: 'permanent' },
    privateKey,
    async (_clientId, bytes) => {
      license = bytes;
      return 'https://example.com/permanent';
    },
    ISSUED_AT
  );

  assert.equal(result.durationDays, 0);
  assert.equal(license.length, 256);
  assert.ok(crypto.verify('RSA-SHA1', Buffer.from(CLIENT_ID), publicKey, license));
});

test('invalid IDs and modes do not upload a license', async () => {
  let uploads = 0;
  const upload = async () => { uploads += 1; };
  await assert.rejects(issueLicense({ clientId: '../other', mode: 'short' }, privateKey, upload));
  await assert.rejects(issueLicense({ clientId: CLIENT_ID, mode: 'weekly' }, privateKey, upload));
  await assert.rejects(issueLicense(null, privateKey, upload));
  assert.equal(uploads, 0);
});

test('upload failures reject instead of returning a success result', async () => {
  await assert.rejects(
    issueLicense(
      { clientId: CLIENT_ID, mode: 'short' },
      privateKey,
      async () => { throw new Error('storage unavailable'); },
      ISSUED_AT
    ),
    /storage unavailable/
  );
});
