import { render } from '@solidjs/web';
import App from './App';

const app = document.getElementById('app');

if (app) {
  render(() => <App />, app);
}