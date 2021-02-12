import { createSignal, lazy } from 'solid-js';
import { Link } from 'solid-app-router';
import { MetaProvider } from 'solid-meta';
import { Router, Route, RouteDefinition } from 'solid-app-router';
import { createApp } from 'solid-utils';

import Home from './pages';

const routes: RouteDefinition[] = [
  {
    path: '/',
    component: Home,
  },
  {
    path: '/about',
    component: lazy(() => import('./pages/about')),
  },
];

const App = () => {
  const [count, setCount] = createSignal(0);

  return (
    <>
      <Link href="/">Home</Link>
      <Link href="/about">About!!!</Link>
      <Route />
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </>
  );
};

const dispose = createApp(App).use(MetaProvider).use(Router, { routes }).mount('#app');

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(dispose);
}
