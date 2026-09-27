/** Read-only QA acceptance probe. Uses the normal login endpoint, never mints a
 * gate cookie or disables protection. No customer assets, DB or paid calls. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const origin = 'https://qa.findmeworlds.com';
if (process.argv.length !== 2) throw Error('No URL overrides; dedicated QA only');
const password = process.env.QA_ACCESS_PASSWORD;
if (!password) throw Error('QA_ACCESS_PASSWORD required in local environment');
const login = await fetch(`${origin}/qa-access/login`, {
  method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
  headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password, next: '/' }),
});
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
if (login.status !== 303 || !cookie.includes('__Host-findme_qa=')) throw Error('Normal QA login failed; no image probe performed');
const assets = JSON.parse(readFileSync('content/demo/passport-v1-assets.json', 'utf8'));
const result = [];
for (const url of [...Object.values(assets.photos), ...Object.values(assets.discoveries)]) {
  if (!/^\/demo\/passport-v1\/[a-f0-9]{64}\.webp$/.test(url)) throw Error('Not an approved public demo asset');
  const started = performance.now();
  const response = await fetch(`${origin}${url}`, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const expected = url.split('/').at(-1).replace('.webp', '');
  const matches = createHash('sha256').update(bytes).digest('hex') === expected;
  result.push({ url, status: response.status, type: response.headers.get('content-type'), bytes: bytes.length,
    ms: Math.round(performance.now() - started), hashMatches: matches, cache: response.headers.get('cache-control') });
}
console.log(JSON.stringify({ origin, checked: result.length, passed: result.every(r => r.status === 200 && r.hashMatches && r.type?.startsWith('image/webp')), result }, null, 2));
if (result.some(r => r.status !== 200 || !r.hashMatches)) process.exitCode = 1;
