// Turnkey SSR fixture test: proves `solid({ ssr: {} })` gives a plain Vite
// app working streaming SSR with zero wiring — no entry files, no index.html,
// no dev server script. Asserts, in both dev (`vite`) and production
// (`vite build` + the one-line handler in server.js):
//   - the SSR response actually streams: the shell arrives first with the
//     Loading fallback, the async content follows in a later chunk,
//   - the generated document shell carries the hydration script and the
//     client entry (dev: /@id/virtual URL; prod: hashed asset + css link),
//   - dev injects the Vite client + dev style patch into <head> and inlines
//     the entry graph's CSS (App.css rules SSR'd as <style data-vite-dev-id>
//     tags — the no-FOUC guarantee) with exactly one surviving style element
//     per dev id after hydration and after CSS HMR; prod does not leak dev
//     injections (CSS ships as a hashed <link>),
//   - hydration is clean and the app is interactive (counter),
//   - server functions compose: dev middleware first, prod through the same
//     handleRequest handler (`/_server` round-trips from the browser and
//     over plain HTTP),
//   - HMR still works through the turnkey dev middleware (on-disk edit
//     hot-applies without a reload, sibling client state preserved),
//   - the `ssr.document` escape hatch swaps the document shell (separate dev
//     server, no browser),
//   - the conventional-entries path: when src/entry-server.tsx and
//     src/entry-client.tsx exist (written temporarily by the test), they are
//     used instead of the generated ones, and in prod the authored
//     `/src/entry-client.tsx` script reference is rewritten to the hashed
//     asset.
//
// Requires the plugin built (pnpm build at the repo root) and Google Chrome.
// Usage: node test/run.mjs [dev|prod|document]   (default: all)

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const exampleDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9337;

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

/** Reads an SSR response chunk by chunk, recording arrival order. */
async function fetchStreamed(url) {
  const res = await fetch(url, { headers: { accept: 'text/html' } });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let html = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    chunks.push(chunk);
    html += chunk;
  }
  return { status: res.status, chunks, html };
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
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
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

// Dev function IDs are `hash-count-name`; pull the one for `name` out of the
// client-transformed module so the endpoint can be hit directly.
function extractFunctionId(transformedCode, name) {
  // The import identifier may be aliased (e.g. createServerReference_1), and
  // newer compilers pass the function name as a second argument after the id.
  const match = transformedCode.match(new RegExp(`createServerReference\\w*\\("([^"]*-${name})"`));
  return match ? match[1] : null;
}

// Shared SSR + streaming assertions against a running server.
async function runSsrChecks(mode, origin) {
  const { status, chunks, html } = await fetchStreamed(origin + '/');
  record(mode, 'ssr', 'responds 200 to HTML-accepting GET', status === 200);
  record(mode, 'ssr', 'app server-rendered', html.includes('Turnkey SSR'));
  record(
    mode,
    'ssr',
    'full document rendered (doctype + html)',
    html.startsWith('<!DOCTYPE html><html'),
  );
  record(mode, 'ssr', 'hydration script present', html.includes('_$HY'));

  const contentAt = chunks.findIndex((c) => c.includes('STREAMED-ASYNC-CONTENT'));
  const shellChunks = chunks.slice(0, contentAt === -1 ? undefined : contentAt).join('');
  record(
    mode,
    'stream',
    'response streams (multiple chunks)',
    chunks.length > 1,
    `${chunks.length} chunk(s)`,
  );
  record(
    mode,
    'stream',
    'shell flushed before async content (fallback first)',
    contentAt > 0 && shellChunks.includes('stream-fallback') && shellChunks.includes('</html>'),
    `content in chunk ${contentAt}`,
  );
  record(mode, 'stream', 'async content streamed in', html.includes('STREAMED-ASYNC-CONTENT'));
  return html;
}

// HMR checks against a running dev server: fresh page load (hydrated SSR),
// then edit HmrTarget.tsx on disk and assert the update lands hot: new text
// rendered, no full reload (window marker survives), sibling client state
// (the counter owned by App) preserved. File restored afterwards.
async function runHmrChecks(mode, cdp, origin) {
  const hmrFile = path.join(exampleDir, 'src/HmrTarget.tsx');
  const originalSource = readFileSync(hmrFile, 'utf-8');
  try {
    await cdp.evalJs('window.__HMR_NO_RELOAD_MARKER = 1');
    writeFileSync(hmrFile, originalSource.replace('HMR-ORIGINAL', 'HMR-UPDATED'));
    const updated = await cdp.waitFor(
      'document.querySelector("#hmr-text")?.textContent === "HMR-UPDATED"',
      15000,
    );
    record(
      mode,
      'hmr',
      'hot update applied (edited text rendered)',
      updated,
      `hmr-text: ${JSON.stringify(
        await cdp.evalJs('document.querySelector("#hmr-text")?.textContent'),
      )}`,
    );
    record(
      mode,
      'hmr',
      'no full page reload (window marker survived)',
      (await cdp.evalJs('window.__HMR_NO_RELOAD_MARKER')) === 1,
    );
    record(
      mode,
      'hmr',
      'client state preserved (counter kept its value)',
      (await cdp.evalJs('document.querySelector("#count")?.textContent')) === '2',
    );
  } finally {
    writeFileSync(hmrFile, originalSource);
  }

  // CSS HMR: edit App.css on disk, assert the new rule hot-applies and the
  // update lands in a single style element — the SSR-inlined tag must not
  // linger next to Vite's updated one.
  const cssFile = path.join(exampleDir, 'src/App.css');
  const originalCss = readFileSync(cssFile, 'utf-8');
  const HMR_CSS_COLOR = 'rgb(200, 100, 50)';
  try {
    writeFileSync(cssFile, originalCss.replace('rgb(20, 40, 60)', HMR_CSS_COLOR));
    record(
      mode,
      'hmr',
      'CSS hot update applied (computed color changed)',
      await cdp.waitFor(
        `getComputedStyle(document.querySelector("#title")).color === ${JSON.stringify(HMR_CSS_COLOR)}`,
        15000,
      ),
    );
    record(
      mode,
      'hmr',
      'no duplicate App.css style tag after CSS HMR',
      (await cdp.evalJs(
        `document.querySelectorAll(${JSON.stringify(APP_CSS_STYLE_SELECTOR)}).length`,
      )) === 1,
    );
  } finally {
    writeFileSync(cssFile, originalCss);
  }
}

// Distinctive rule from src/App.css: proves real styles (not just the dev
// style patch) reached the page. Keep in sync with the stylesheet.
const APP_CSS_COLOR = 'rgb(20, 40, 60)';
// Selects style tags for App.css whatever the id shape (absolute fs path in
// dev; never present in prod, where CSS ships as a hashed <link>).
const APP_CSS_STYLE_SELECTOR = 'style[data-vite-dev-id$="App.css"]';

async function runBrowserChecks(mode, origin, { hmr, devCss } = {}) {
  const chrome = startProcess(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=/tmp/ssr-turnkey-chrome-${mode}`,
    '--no-first-run',
    '--disable-extensions',
    'about:blank',
  ]);
  const cdp = await connectChrome();
  try {
    cdp.exceptions.length = 0;
    await cdp.send('Page.navigate', { url: origin + '/' });
    await cdp.waitFor('document.readyState === "complete"');
    await new Promise((r) => setTimeout(r, 750));

    const hydrationErrs = cdp.exceptions.filter((e) => /hydrat|mismatch/i.test(e));
    record(
      mode,
      'browser',
      'clean hydration (no hydration console errors)',
      hydrationErrs.length === 0,
      hydrationErrs.join(' | '),
    );

    await cdp.evalJs('document.querySelector("#increment").click()');
    await cdp.evalJs('document.querySelector("#increment").click()');
    record(
      mode,
      'browser',
      'hydrated app is interactive (counter)',
      await cdp.waitFor('document.querySelector("#count")?.textContent === "2"'),
    );

    await cdp.evalJs('document.querySelector("#call-message").click()');
    record(
      mode,
      'browser',
      'server function round-trip from the browser',
      await cdp.waitFor(
        'document.querySelector("#message")?.textContent === "hello client from the server"',
      ),
    );

    record(
      mode,
      'browser',
      'streamed content settled in the DOM',
      (await cdp.evalJs('document.querySelector("#streamed")?.textContent')) ===
        'STREAMED-ASYNC-CONTENT',
    );

    // App.css actually applies after hydration, dev and prod alike.
    record(
      mode,
      'browser',
      'App.css styles applied (computed color)',
      (await cdp.evalJs('getComputedStyle(document.querySelector("#title")).color')) ===
        APP_CSS_COLOR,
    );

    if (devCss) {
      // Exactly one active style element for the dev id after hydration:
      // Vite's client either adopts the SSR'd tag on startup (seeding its
      // registry from the DOM) or, when it injects its own twin, the dev
      // style patch drops the SSR'd copy (data-asset). Either way a
      // duplicate means double style application — the bug being guarded.
      record(
        mode,
        'browser',
        'exactly one App.css style tag after hydration (dedup)',
        (await cdp.evalJs(
          `document.querySelectorAll(${JSON.stringify(APP_CSS_STYLE_SELECTOR)}).length`,
        )) === 1,
      );
    }

    const errs = cdp.exceptions.filter((e) => !/favicon/i.test(e));
    record(mode, 'browser', 'no page errors', errs.length === 0, errs.join(' | '));

    if (hmr) {
      await runHmrChecks(mode, cdp, origin);
    }
  } finally {
    cdp.close();
    const exited = new Promise((r) => chrome.once('exit', r));
    try {
      process.kill(-chrome.pid, 'SIGTERM');
    } catch {}
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    try {
      rmSync(`/tmp/ssr-turnkey-chrome-${mode}`, { recursive: true, force: true, maxRetries: 5 });
    } catch {}
  }
}

async function runDevMode() {
  const mode = 'dev';
  console.log(`\n=== ${mode.toUpperCase()} ===`);
  const port = 3160;
  const origin = `http://localhost:${port}`;

  // The turnkey promise: the dev server is the plain `vite` CLI.
  const server = startProcess('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
    cwd: exampleDir,
    env: { ...process.env },
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));

  try {
    await waitForHttp(origin + '/src/api.ts', 30000);

    const html = await runSsrChecks(mode, origin);
    record(mode, 'dev', 'Vite client injected into <head>', html.includes('/@vite/client'));
    // The patch script's own source references the selector; match it inside
    // an inline <script> so the check can't be satisfied by a style tag.
    record(
      mode,
      'dev',
      'dev style patch injected',
      /<script>[^<]*style\[data-vite-dev-id\]/.test(html),
    );
    // The no-FOUC guarantee: the SSR response itself carries App.css inlined
    // as a dedup-ready style tag — not just the patch script, actual rules.
    const styleTag = /<style[^>]*data-vite-dev-id="[^"]*App\.css"[^>]*>([\s\S]*?)<\/style>/.exec(
      html,
    );
    record(
      mode,
      'dev',
      'entry CSS inlined in SSR head (App.css rules present)',
      !!styleTag && styleTag[1].includes('#title') && styleTag[1].includes(APP_CSS_COLOR),
      styleTag ? `style content: ${JSON.stringify(styleTag[1].slice(0, 120))}` : 'no App.css style tag',
    );
    record(
      mode,
      'dev',
      'inlined SSR style marked data-asset (dedup patch contract)',
      !!styleTag && styleTag[0].includes('data-asset='),
    );
    record(
      mode,
      'dev',
      'generated client entry script injected',
      html.includes('/@id/virtual:solid-ssr-entry-client.tsx'),
    );

    // Server-function dev middleware handles the endpoint before SSR (cold:
    // nothing has rendered in the SSR environment for this module yet).
    const clientModule = await (await fetch(origin + '/src/api.ts')).text();
    record(
      mode,
      'sf',
      'client module compiled to references',
      clientModule.includes('createServerReference'),
    );
    const functionId = extractFunctionId(clientModule, 'getServerMessage');
    // POST-only by default as of @solidjs/web 2.0.0-beta.21; args still come
    // from the query string when no instance header is present.
    const cold = functionId
      ? await fetch(
          `${origin}/_server?id=${encodeURIComponent(functionId)}&args=${encodeURIComponent('["turnkey"]')}`,
          { method: 'POST' },
        )
      : null;
    const coldText = cold ? await cold.text() : '';
    record(
      mode,
      'sf',
      'endpoint served by dev middleware alongside SSR',
      coldText === 'hello turnkey from the server',
      functionId ? `got ${JSON.stringify(coldText)}` : 'could not extract function id',
    );

    await runBrowserChecks(mode, origin, { hmr: true, devCss: true });
  } catch (e) {
    record(
      mode,
      'run',
      'mode completed',
      false,
      String(e) + (serverLog ? `\nserver: ${serverLog.slice(-2000)}` : ''),
    );
  } finally {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
}

async function runProdMode() {
  const mode = 'prod';
  console.log(`\n=== ${mode.toUpperCase()} ===`);
  const port = 3161;
  const origin = `http://localhost:${port}`;

  console.log('  building…');
  // The turnkey promise: one plain `vite build` produces both bundles.
  execSync('pnpm run build', { cwd: exampleDir, stdio: 'pipe' });
  record(
    mode,
    'build',
    'client bundle + manifest emitted',
    existsSync(path.join(exampleDir, 'dist/client/.vite/manifest.json')),
  );
  record(
    mode,
    'build',
    'server handler bundle emitted',
    existsSync(path.join(exampleDir, 'dist/server/server.js')),
  );
  const serverBundle = readFileSync(path.join(exampleDir, 'dist/server/server.js'), 'utf-8');
  record(
    mode,
    'build',
    'server-function registrations bundled eagerly',
    serverBundle.includes('registerServerReference'),
  );

  const server = startProcess('node', ['server.js'], {
    cwd: exampleDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));

  try {
    await waitForHttp(origin + '/', 30000, { headers: { accept: 'text/html' } });

    const html = await runSsrChecks(mode, origin);
    record(
      mode,
      'prod',
      'hashed client entry script injected',
      /<script type="module" src="\/assets\/[^"]+\.js" async><\/script>/.test(html),
    );
    record(
      mode,
      'prod',
      'entry css linked',
      /<link rel="stylesheet" href="\/assets\/[^"]+\.css">/.test(html),
    );
    record(mode, 'prod', 'no dev injections leaked', !html.includes('/@vite/client'));

    await runBrowserChecks(mode, origin);
  } catch (e) {
    record(
      mode,
      'run',
      'mode completed',
      false,
      String(e) + (serverLog ? `\nserver: ${serverLog.slice(-2000)}` : ''),
    );
  } finally {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
}

// Document escape hatch: a separate dev server with `ssr.document` pointing
// at src/CustomDocument.tsx (via SSR_DOCUMENT in vite.config.ts); the custom
// shell's <title> must show up in the SSR output. No browser needed.
async function runDocumentMode() {
  const mode = 'document';
  console.log(`\n=== ${mode.toUpperCase()} ===`);
  const port = 3162;
  const origin = `http://localhost:${port}`;

  const server = startProcess('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
    cwd: exampleDir,
    env: { ...process.env, SSR_DOCUMENT: './src/CustomDocument.tsx' },
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));

  try {
    await waitForHttp(origin + '/src/api.ts', 30000);
    const { html } = await fetchStreamed(origin + '/');
    record(
      mode,
      'document',
      'custom document shell rendered',
      html.includes('<title>Custom Document</title>'),
    );
    record(mode, 'document', 'app rendered inside custom shell', html.includes('Turnkey SSR'));
  } catch (e) {
    record(
      mode,
      'run',
      'mode completed',
      false,
      String(e) + (serverLog ? `\nserver: ${serverLog.slice(-2000)}` : ''),
    );
  } finally {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
}

// Conventional entries: authored src/entry-server.tsx / src/entry-client.tsx
// (written temporarily) take precedence over the generated ones. Dev serves
// them as-is; the prod handler rewrites the authored `/src/entry-client.tsx`
// script reference to the hashed asset (the classic harness convention).
const ENTRY_FIXTURES = {
  'src/TestShell.tsx': `import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import App from './App';

export default function TestShell() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Authored Entries</title>
        <HydrationScript />
      </head>
      <body>
        <App />
        <script type="module" src="/src/entry-client.tsx" async />
      </body>
    </html>
  );
}
`,
  'src/entry-server.tsx': `import { renderToStream } from '@solidjs/web';
import manifest from 'virtual:solid-manifest';
import TestShell from './TestShell';

export function render() {
  return renderToStream(() => <TestShell />, { manifest });
}
`,
  'src/entry-client.tsx': `import { hydrate } from '@solidjs/web';
import TestShell from './TestShell';

hydrate(() => <TestShell />, document);
`,
};

async function runEntriesMode() {
  const mode = 'entries';
  console.log(`\n=== ${mode.toUpperCase()} ===`);
  const port = 3163;
  const origin = `http://localhost:${port}`;

  for (const [file, source] of Object.entries(ENTRY_FIXTURES)) {
    writeFileSync(path.join(exampleDir, file), source);
  }
  let server;
  try {
    server = startProcess('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
      cwd: exampleDir,
      env: { ...process.env },
    });
    await waitForHttp(origin + '/src/api.ts', 30000);
    const { html } = await fetchStreamed(origin + '/');
    record(
      mode,
      'dev',
      'authored entries used (custom title)',
      html.includes('<title>Authored Entries</title>'),
    );
    record(
      mode,
      'dev',
      'authored client entry served as-is',
      html.includes('src="/src/entry-client.tsx"') &&
        !html.includes('virtual:solid-ssr-entry-client'),
    );
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
    server = undefined;

    console.log('  building…');
    execSync('pnpm run build', { cwd: exampleDir, stdio: 'pipe' });
    server = startProcess('node', ['server.js'], {
      cwd: exampleDir,
      env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    });
    await waitForHttp(origin + '/', 30000, { headers: { accept: 'text/html' } });
    const prod = await fetchStreamed(origin + '/');
    record(
      mode,
      'prod',
      'authored entries rendered in prod',
      prod.html.includes('<title>Authored Entries</title>'),
    );
    record(
      mode,
      'prod',
      'client entry reference rewritten to hashed asset',
      !prod.html.includes('/src/entry-client.tsx') &&
        /<script type="module" src="\/assets\/[^"]+\.js" async>/.test(prod.html),
    );
    await runBrowserChecks(mode, origin);
  } catch (e) {
    record(mode, 'run', 'mode completed', false, String(e));
  } finally {
    if (server) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {}
    }
    for (const file of Object.keys(ENTRY_FIXTURES)) {
      rmSync(path.join(exampleDir, file), { force: true });
    }
    // Leave dist in the generated-entries state for anyone poking at it.
    try {
      execSync('pnpm run build', { cwd: exampleDir, stdio: 'pipe' });
    } catch {}
  }
}

const arg = process.argv[2];
const modes = ['dev', 'prod', 'document', 'entries'].includes(arg)
  ? [arg]
  : ['dev', 'prod', 'document', 'entries'];
for (const mode of modes) {
  if (mode === 'dev') await runDevMode();
  else if (mode === 'prod') await runProdMode();
  else if (mode === 'document') await runDocumentMode();
  else await runEntriesMode();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  [${f.mode}/${f.phase}] ${f.name} — ${f.detail}`);
}
cleanup(failed.length ? 1 : 0);
