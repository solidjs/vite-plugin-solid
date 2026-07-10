/* @refresh reload */
import { createSignal, lazy, Switch, Match, Loading } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import Home from './routes/Home';

const About = lazy(() => import('./routes/About'));

// Glob-based lazy: no static import specifier at the callsite, so the babel
// transform can't inject a moduleUrl. The SSR build's module-level
// $$moduleUrl export is the only identity the server has for this module.
const globRoutes = import.meta.glob('./routes/Glob.tsx');
const Glob = lazy(globRoutes['./routes/Glob.tsx'] as any);

export default function App() {
  const [page, setPage] = createSignal('home');

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Solid SSR Document Example</title>
        <HydrationScript />
      </head>
      <body>
        <nav>
          <ul>
            <li>
              <a href="#" onClick={() => setPage('home')}>Home</a>
            </li>
            <li>
              <a href="#about" onClick={() => setPage('about')}>About</a>
            </li>
            <li>
              <a href="#glob" onClick={() => setPage('glob')}>Glob</a>
            </li>
          </ul>
        </nav>
        <main>
          <Switch fallback={<Home />}>
            <Match when={page() === 'about'}>
              <Loading fallback={<p>Loading...</p>}>
                <About />
              </Loading>
            </Match>
            <Match when={page() === 'glob'}>
              <Loading fallback={<p>Loading...</p>}>
                <Glob />
              </Loading>
            </Match>
          </Switch>
        </main>
        <script type="module" src="/src/entry-client.tsx" async />
      </body>
    </html>
  );
}
