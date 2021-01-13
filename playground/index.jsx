import { createApp } from 'solid-utils';
import { MetaProvider } from 'solid-meta';
import { Router, Route } from 'solid-app-router';

const App = () => <Route />;

const routes = [
  {
    path: '/',
    component: () => <h1>Hello world!!!</h1>,
  },
  {
    path: '/about',
    component: () => <h1>Hello about!!!</h1>,
  },
];

const dispose = createApp(App).use(MetaProvider).use(Router, { routes }).mount('#app');

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(dispose);
}
