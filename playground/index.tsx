import { createSignal, type ParentComponent, lazy } from 'solid-js';
import { render } from '@solidjs/web';
import { MetaProvider } from '@solidjs/meta';
import { Router, type RouteDefinition } from '@solidjs/router';

import test from '@@/test.txt?raw';
import Home from '@/index';

const json = await fetch('https://jsonplaceholder.typicode.com/todos/1').then((response) =>
  response.json(),
);

console.log({ json });

// This should log Hello World
console.log(test);

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

const App: ParentComponent = (props) => {
  const [count, setCount] = createSignal(0);

  return (
    <>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <hr />
      {props.children}
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </>
  );
};

render(
  () => (
    <MetaProvider>
      <Router root={App}>{routes}</Router>
    </MetaProvider>
  ),
  document.getElementById('app') as HTMLElement,
);
