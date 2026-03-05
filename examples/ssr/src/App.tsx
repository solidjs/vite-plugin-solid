/* @refresh reload */
import { createSignal, lazy, Show, Loading } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import Home from './routes/Home';

const About = lazy(() => import('./routes/About'));

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
          </ul>
        </nav>
        <main>
          <Show when={page() === 'about'} fallback={<Home />}>
            <Loading fallback={<p>Loading...</p>}>
              <About />
            </Loading>
          </Show>
        </main>
        <script type="module" src="/src/entry-client.tsx" />
      </body>
    </html>
  );
}
