import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, createPublicKey } from 'node:crypto';
import { appJwt, installationToken } from '../api/github-app-poc.mjs';

test('RS256 App JWT verifies and claims are bounded', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = appJwt('123', pem, 1700000000);
  const [header, body, signature] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')), { iat: 1699999940, exp: 1700000540, iss: '123' });
  assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${body}`), createPublicKey(privateKey), Buffer.from(signature, 'base64url')));
});

test('installation token request restricts repo and issues permission', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const calls = [];
  const request = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ token: 'mock-token' }) };
  };
  const token = await installationToken({
    GITHUB_APP_ID: '123',
    GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    GITHUB_INSTALLATION_ID: '456'
  }, request);
  assert.equal(token, 'mock-token');
  assert.match(calls[0].url, /\/app\/installations\/456\/access_tokens$/);
  assert.deepEqual(JSON.parse(calls[0].opts.body), { repositories: ['hackathon-platform'], permissions: { issues: 'write' } });
});
