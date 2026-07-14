import { hydrate } from '@solidjs/web';
import App from './App';
import './entryClient.css';

hydrate(() => <App url={location.pathname} />, document);
