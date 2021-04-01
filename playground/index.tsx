import { createSignal, lazy } from 'solid-js';
import { MetaProvider } from 'solid-meta';
import { createApp } from 'solid-utils';
import { Router, Route, RouteDefinition, Link } from 'solid-app-router';

import test from '@@/test.txt?raw'
import Home from '@/index';

// This needs to be tested once vite upgrade to esbuild 0.10.0

// const json = await fetch('https://jsonplaceholder.typicode.com/todos/1')
// .then(response => response.json())

// console.log({ json })

// This should log Hello World
console.log(test)

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
      <Link href="/about">About</Link>
      <hr />
      <Route />
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </>
  );
};

createApp(App).use(MetaProvider).use(Router, { routes }).mount('#app');
