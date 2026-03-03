import { createSignal, lazy, Show, Loading } from 'solid-js';
import Home from './routes/Home';

const About = lazy(() => import('./routes/About'));

export default function App() {
  const [page, setPage] = createSignal('home');

  return (
    <>
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
    </>
  );
}
