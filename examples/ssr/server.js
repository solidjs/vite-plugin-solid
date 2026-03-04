import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;

async function start() {
  let vite;
  let template;

  if (!isProduction) {
    const { createServer } = await import('vite');
    vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
  } else {
    template = readFileSync(path.resolve(__dirname, 'dist/client/index.html'), 'utf-8');
  }

  const server = createHttpServer(async (req, res) => {
    const url = req.url || '/';

    try {
      if (!isProduction) {
        const handled = await new Promise((resolve) => {
          vite.middlewares(req, res, () => resolve(false));
        });
        if (handled !== false) return;
      }

      // Serve static files in production
      if (isProduction && url !== '/' && !url.startsWith('/api')) {
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

      // SSR render
      let html;
      if (!isProduction) {
        html = readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        html = await vite.transformIndexHtml(url, html);
        const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
        const { stream, hydrationScript } = render();

        res.setHeader('Content-Type', 'text/html');
        html = html.replace('<!--head-->', hydrationScript);
        const [head, tail] = html.split('<!--app-->');
        res.write(head);
        stream.pipe({
          write(chunk) { return res.write(chunk); },
          end() { res.write(tail); res.end(); }
        });
      } else {
        const { render } = await import('./dist/server/entry-server.js');
        const { stream, hydrationScript } = render();

        res.setHeader('Content-Type', 'text/html');
        const fullTemplate = template.replace('<!--head-->', hydrationScript);
        const [head, tail] = fullTemplate.split('<!--app-->');
        res.write(head);
        stream.pipe({
          write(chunk) { return res.write(chunk); },
          end() { res.write(tail); res.end(); }
        });
      }
    } catch (e) {
      if (!isProduction) vite.ssrFixStacktrace(e);
      console.error(e);
      res.statusCode = 500;
      res.end(e.message);
    }
  });

  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

start();
