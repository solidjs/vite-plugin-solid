/* @refresh reload */
import { createSignal, lazy, Switch, Match, Loading } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import Home from './routes/Home';
import './app.css';

// Standard lazy: the JSX transform injects the moduleUrl from the callsite.
const Lazy = lazy(() => import('./routes/Lazy'));

// Glob lazy: no static specifier at the callsite; identity comes from the
// SSR-injected $$moduleUrl export on the loaded module.
const globRoutes = import.meta.glob('./routes/LazyGlob.tsx');
const LazyGlob = lazy(globRoutes['./routes/LazyGlob.tsx'] as any);

// Lazy route that renders its own ?url + <link> instead of importing css.
const LazyLink = lazy(() => import('./routes/LazyLink'));

// Delayed import keeps the Loading fallback (and the <link> it mounts)
// alive long enough to observe. The wrapped promise defeats callsite
// moduleUrl detection, so this also exercises the $$moduleUrl fallback.
const LazyTmp = lazy(
  () => new Promise((r) => setTimeout(r, 200)).then(() => import('./routes/LazyTmp')) as Promise<any>,
);

// Both shared routes import from src/shared/, which manualChunks forces into
// a single facade-less chunk together with the routes themselves.
const SharedA = lazy(() => import('./routes/SharedA'));
const SharedB = lazy(() => import('./routes/SharedB'));

import lazyLinkTmpCss from './routes/lazyLinkTmp.css?url';

const PAGES = [
  'home',
  'lazy',
  'lazy-glob',
  'lazy-link',
  'lazy-link-tmp',
  'shared-a',
  'shared-b',
] as const;

function pageFromUrl(url: string): string {
  const seg = url.split('?')[0].replace(/^\/+|\/+$/g, '');
  return (PAGES as readonly string[]).includes(seg) ? seg : 'home';
}

export default function App(props: { url: string }) {
  const [page, setPage] = createSignal(pageFromUrl(props.url));

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>CSS Matrix</title>
        <HydrationScript />
      </head>
      <body>
        <nav>
          <ul>
            {PAGES.map((p) => (
              <li>
                <a href={'/' + (p === 'home' ? '' : p)} data-nav={p} onClick={(e) => {
                  e.preventDefault();
                  setPage(p);
                }}>
                  {p}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main>
          <Switch fallback={<Home />}>
            <Match when={page() === 'lazy'}>
              <Loading fallback={<p>Loading...</p>}>
                <Lazy />
              </Loading>
            </Match>
            <Match when={page() === 'lazy-glob'}>
              <Loading fallback={<p>Loading...</p>}>
                <LazyGlob />
              </Loading>
            </Match>
            <Match when={page() === 'lazy-link'}>
              <Loading fallback={<p>Loading...</p>}>
                <LazyLink />
              </Loading>
            </Match>
            <Match when={page() === 'lazy-link-tmp'}>
              <Loading
                fallback={
                  <>
                    <link rel="stylesheet" href={lazyLinkTmpCss} />
                    <p class="tmp-probe">Loading (red while mounted)...</p>
                  </>
                }
              >
                <LazyTmp />
              </Loading>
            </Match>
            <Match when={page() === 'shared-a'}>
              <Loading fallback={<p>Loading...</p>}>
                <SharedA />
              </Loading>
            </Match>
            <Match when={page() === 'shared-b'}>
              <Loading fallback={<p>Loading...</p>}>
                <SharedB />
              </Loading>
            </Match>
          </Switch>
        </main>
        <script type="module" src="/src/entry-client.tsx" async />
      </body>
    </html>
  );
}
