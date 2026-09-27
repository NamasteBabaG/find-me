import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Run the real CLI against an in-process synthetic transport. No network,
// real login, private asset, provider or database is involved.
function probe(options: { type?: string | null; status?: number; corrupt?: boolean; loginFails?: boolean; password?: boolean; args?: string[] } = {}) {
  const preload = `
    import { readFileSync } from 'node:fs';
    const options = ${JSON.stringify(options)};
    const calls = { login: 0, asset: 0 };
    process.on('exit', () => process.stderr.write('PROBE_CALLS:' + JSON.stringify(calls) + '\\n'));
    globalThis.fetch = async (input, init) => {
      const url = new URL(input);
      if (url.origin !== 'https://qa.findmeworlds.com' || init.redirect !== 'manual') throw Error('Unexpected request');
      if (url.pathname === '/qa-access/login') {
        calls.login++;
        if (init.method !== 'POST' || init.body.get('password') !== 'synthetic-test-only') throw Error('Unexpected login');
        return new Response(null, { status: options.loginFails ? 401 : 303,
          headers: options.loginFails ? {} : { 'set-cookie': '__Host-findme_qa=synthetic-session; Path=/; Secure; HttpOnly' } });
      }
      calls.asset++;
      if (options.loginFails || init.headers.cookie !== '__Host-findme_qa=synthetic-session' || !/^\\/demo\\/passport-v1\\/[a-f0-9]{64}\\.webp$/.test(url.pathname)) throw Error('Unexpected asset');
      const type = Object.hasOwn(options, 'type') ? options.type : 'image/webp';
      return new Response(options.corrupt ? 'corrupt' : readFileSync('public' + url.pathname), {
        status: options.status ?? 200, headers: type === null ? {} : { 'content-type': type },
      });
    };
  `;
  return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'scripts/check-passport-demo-assets.mjs', ...(options.args ?? [])], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, QA_ACCESS_PASSWORD: options.password === false ? '' : 'synthetic-test-only' },
  });
}

describe('public passport asset acceptance CLI', () => {
  it.each(['image/webp', 'IMAGE/WEBP; charset=binary'])('accepts exact WebP media type %s with matching bytes', type => {
    const run = probe({ type });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ checked: 9, passed: true });
    expect(run.stderr).toContain('PROBE_CALLS:{"login":1,"asset":9}');
    expect(run.stdout).not.toContain('synthetic-session');
    expect(run.stdout).not.toContain('synthetic-test-only');
  });
  it.each(['text/html', 'image/webp-not-really', null])('fails the process as well as the report for media type %s', type => {
    const run = probe({ type });
    expect(JSON.parse(run.stdout)).toMatchObject({ checked: 9, passed: false });
    expect(run.status).toBe(1);
  });
  it.each([{ status: 307 }, { status: 403 }, { corrupt: true }])('rejects redirects, failed responses or wrong bytes: %j', options => {
    const run = probe(options);
    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout).passed).toBe(false);
  });
  it.each([{ password: false }, { loginFails: true }, { args: ['https://elsewhere.test'] }])('refuses unauthorized or redirected scope: %j', options => {
    const run = probe(options);
    expect(run.status).not.toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain(`PROBE_CALLS:${JSON.stringify({ login: 'loginFails' in options ? 1 : 0, asset: 0 })}`);
  });
});
