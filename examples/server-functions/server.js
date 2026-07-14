import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;

function getClientEntry() {
  if (!isProduction) return '/src/entry-client.tsx';
  const manifest = JSON.parse(
    readFileSync(path.resolve(__dirname, 'dist/client/.vite/manifest.json'), 'utf-8'),
  );
  const entry = manifest['src/entry-client.tsx'];
  return '/' + entry.file;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function start() {
  let vite;
  let devHeadInjection = '';

  const loadEntryServer = () =>
    isProduction
      ? import('./dist/server/entry-server.js')
      : vite.ssrLoadModule('/src/entry-server.tsx');

  const server = createHttpServer(async (req, res) => {
    const url = req.url || '/';

    try {
      // Server function endpoint: adapt the node request to a web Request and
      // hand it to the runtime's handler inside the SSR module graph (so it
      // shares the registry with the rendered app).
      if (url.startsWith('/_server')) {
        const { handleServerFunction } = await loadEntryServer();
        const body = await readBody(req);
        const request = new Request(`http://localhost:${port}${url}`, {
          method: req.method,
          headers: req.headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        });
        const response = await handleServerFunction(request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
        return;
      }

      if (!isProduction) {
        const handled = await new Promise((resolve) => {
          vite.middlewares(req, res, () => resolve(false));
        });
        if (handled !== false) return;
        if (!req.headers.accept?.includes('text/html')) {
          if (!res.headersSent) {
            res.statusCode = 404;
            res.end();
          }
          return;
        }
      }

      if (isProduction && url !== '/') {
        const filePath = path.resolve(__dirname, 'dist/client' + url);
        try {
          const content = readFileSync(filePath);
          const ext = path.extname(url);
          const types = {
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.html': 'text/html',
            '.json': 'application/json',
          };
          res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
          res.end(content);
          return;
        } catch {
          // Fall through to SSR
        }
      }

      const { render } = await loadEntryServer();
      const stream = render();
      const clientEntry = getClientEntry();

      res.setHeader('Content-Type', 'text/html');
      res.write('<!DOCTYPE html>');

      stream.pipe({
        write(chunk) {
          let html = chunk;
          if (!isProduction && html.includes('</head>')) {
            html = html.replace('</head>', devHeadInjection + '</head>');
          }
          if (isProduction && html.includes('/src/entry-client.tsx')) {
            html = html.replace('/src/entry-client.tsx', clientEntry);
          }
          return res.write(html);
        },
        end() {
          res.end();
        },
      });
    } catch (e) {
      if (!isProduction) vite.ssrFixStacktrace(e);
      console.error(e);
      res.statusCode = 500;
      res.end(e.message);
    }
  });

  if (!isProduction) {
    const { createServer } = await import('vite');
    vite = await createServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: 'custom',
    });
    const { devStylePatch } = await import('vite-plugin-solid');
    devHeadInjection =
      `<script>${devStylePatch}</script>` +
      '<script type="module" src="/@vite/client"></script>';
  }

  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

start();
