import { createPrivateKey, sign } from 'node:crypto';

const API = 'https://api.github.com';
const REPO = 'Ri0n72Y/hackathon-platform';

export function appJwt(appId, pem, now = Math.floor(Date.now() / 1000)) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({ iat: now - 60, exp: now + 540, iss: appId });
  const input = `${header}.${payload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), createPrivateKey(pem)).toString('base64url')}`;
}

export async function githubRequest(path, token, { method = 'GET', body, request = fetch } = {}) {
  const result = await request(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(`GitHub API HTTP ${result.status}: ${data.message ?? 'unknown'}`);
  return data;
}

export async function installationToken(env, request = fetch) {
  const jwt = appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'));
  const data = await githubRequest(`/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`, jwt, {
    method: 'POST',
    body: { repositories: ['hackathon-platform'], permissions: { issues: 'write' } },
    request
  });
  return data.token;
}

// Read-only installation-token check. No public write endpoint.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const reply = (status, body) => res.status(status).json(body);
  if (req.method !== 'GET') return reply(405, { error: 'Method not allowed' });
  if (req.query?.action !== 'bot-check') return reply(400, { error: 'Use action=bot-check' });
  if (!process.env.POC_CHECK_SECRET || req.headers['x-poc-check-secret'] !== process.env.POC_CHECK_SECRET) {
    return reply(403, { error: 'Forbidden' });
  }
  const env = process.env;
  if (![env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY, env.GITHUB_INSTALLATION_ID].every(Boolean)) {
    return reply(503, { error: 'Missing GitHub App configuration' });
  }
  try {
    const token = await installationToken(env);
    const data = await githubRequest(`/repos/${REPO}`, token);
    return reply(200, { ok: true, repository: REPO, repository_id: data.id, full_name: data.full_name, token_exposed: false });
  } catch {
    return reply(502, { error: 'GitHub verification failed' });
  }
}
