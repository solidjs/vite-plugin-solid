// Server functions fixture test: proves the "use server" compiler in
// vite-plugin-solid works against plain Vite with the default runtime
// (@solidjs/web/server-functions) — no SolidStart. Asserts, in both dev and
// production:
//   - SSR renders the app,
//   - module-level and function-level server functions round-trip from the
//     browser through the /_server endpoint (seroval JSON codec),
//   - getRequestEvent() works inside a dispatched server function,
//   - the respond() helper's envelope unwraps transparently on the client,
//   - server-only module code (the secret) never reaches any client asset.
//
// Requires the plugin built (pnpm build at the repo root) and Google Chrome.
// Usage: node test/run.mjs [dev|prod]   (default: both)

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rmSync, readdirSync, readFileSync } from 'node:fs';

const exampleDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9336;

const SECRET = 'SERVER-ONLY-SECRET';

const CALLS = [
  { name: 'module-level fn (message)', button: '#call-message', target: '#message', expected: 'hello client from the server' },
  { name: 'function-level fn (double)', button: '#call-double', target: '#doubled', expected: '42' },
  { name: 'getRequestEvent in fn (method)', button: '#call-method', target: '#method', expected: 'POST' },
  { name: 'server-only secret usable (secret)', button: '#call-secret', target: '#secret', expected: 'true' },
  { name: 'respond() helper round-trip (greeting)', button: '#call-respond', target: '#greeting', expected: 'hi client' },
];

// ---------------------------------------------------------------------------
// Small process / http helpers
// ---------------------------------------------------------------------------
const children = new Set();
function cleanup(code = 0) {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGTERM');
    } catch {
      try {
        c.kill('SIGTERM');
      } catch {}
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => cleanup(1));
process.on('SIGTERM', () => cleanup(1));

function startProcess(cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

async function waitForHttp(url, timeoutMs = 30000, init) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

// ---------------------------------------------------------------------------
// CDP driver
// ---------------------------------------------------------------------------
async function connectChrome() {
  let target;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      target = (await res.json()).find((t) => t.type === 'page');
      if (target) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!target) throw new Error('Chrome CDP not reachable');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(
        msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text,
      );
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      exceptions.push(
        'console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
      );
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++msgId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Page.enable');

  const evalJs = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.result?.exceptionDetails) {
      throw new Error('eval failed: ' + JSON.stringify(res.result.exceptionDetails.text));
    }
    return res.result?.result?.value;
  };

  const waitFor = async (expression, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await evalJs(expression)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  return { send, evalJs, waitFor, exceptions, close: () => ws.close() };
}

// ---------------------------------------------------------------------------
// Assertion collection
// ---------------------------------------------------------------------------
const results = [];
function record(mode, phase, name, ok, detail = '') {
  results.push({ mode, phase, name, ok, detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mode}/${phase}] ${status} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
}

async function runMode(mode) {
  console.log(`\n=== ${mode.toUpperCase()} ===`);
  const isProd = mode === 'prod';
  const port = isProd ? 3141 : 3140;
  const origin = `http://localhost:${port}`;

  if (isProd) {
    console.log('  building…');
    execSync('pnpm run build', { cwd: exampleDir, stdio: 'pipe' });
  }

  const server = startProcess('node', ['server.js'], {
    cwd: exampleDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: isProd ? 'production' : 'development' },
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));

  try {
    await waitForHttp(origin + '/', 30000, { headers: { accept: 'text/html' } });

    // ---- Phase 1: SSR + client-asset leak checks -------------------------
    const html = await (await fetch(origin + '/', { headers: { accept: 'text/html' } })).text();
    record(mode, 'ssr', 'app server-rendered', html.includes('Server Functions'));
    record(mode, 'ssr', `no "${SECRET}" in SSR html`, !html.includes(SECRET));

    if (isProd) {
      // Every client asset must be free of the module-level secret.
      const assetsDir = path.join(exampleDir, 'dist/client/assets');
      const leaks = readdirSync(assetsDir).filter((f) =>
        readFileSync(path.join(assetsDir, f), 'utf-8').includes(SECRET),
      );
      record(mode, 'dce', 'secret absent from client assets', leaks.length === 0, leaks.join(', '));
    } else {
      // Dev equivalent: the transformed client module must be reference-only.
      const transformed = await (await fetch(origin + '/src/api.ts')).text();
      record(mode, 'dce', 'secret absent from transformed module', !transformed.includes(SECRET));
      record(
        mode,
        'dce',
        'client module compiled to references',
        transformed.includes('createServerReference'),
      );
    }

    // ---- Phase 2: browser round-trips -------------------------------------
    const chrome = startProcess(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=/tmp/server-functions-chrome-${mode}`,
      '--no-first-run',
      '--disable-extensions',
      'about:blank',
    ]);
    const cdp = await connectChrome();

    try {
      cdp.exceptions.length = 0;
      await cdp.send('Page.navigate', { url: origin + '/' });
      await cdp.waitFor('document.readyState === "complete"');
      await new Promise((r) => setTimeout(r, 500));

      for (const call of CALLS) {
        await cdp.evalJs(`document.querySelector(${JSON.stringify(call.button)}).click()`);
        const ok = await cdp.waitFor(
          `document.querySelector(${JSON.stringify(call.target)})?.textContent === ${JSON.stringify(call.expected)}`,
        );
        const actual = ok
          ? call.expected
          : await cdp.evalJs(`document.querySelector(${JSON.stringify(call.target)})?.textContent`);
        record(mode, 'rpc', call.name, ok, `${call.target}: ${JSON.stringify(actual)} != ${JSON.stringify(call.expected)}`);
      }

      const errs = cdp.exceptions.filter((e) => !/favicon/i.test(e));
      record(mode, 'rpc', 'no page errors', errs.length === 0, errs.join(' | '));
    } finally {
      cdp.close();
      const exited = new Promise((r) => chrome.once('exit', r));
      try {
        process.kill(-chrome.pid, 'SIGTERM');
      } catch {}
      await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
      try {
        rmSync(`/tmp/server-functions-chrome-${mode}`, { recursive: true, force: true, maxRetries: 5 });
      } catch {}
    }
  } catch (e) {
    record(mode, 'run', 'mode completed', false, String(e) + (serverLog ? `\nserver: ${serverLog.slice(-2000)}` : ''));
  } finally {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
}

const arg = process.argv[2];
const modes = arg === 'dev' ? ['dev'] : arg === 'prod' ? ['prod'] : ['dev', 'prod'];
for (const mode of modes) await runMode(mode);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  [${f.mode}/${f.phase}] ${f.name} — ${f.detail}`);
}
cleanup(failed.length ? 1 : 0);
