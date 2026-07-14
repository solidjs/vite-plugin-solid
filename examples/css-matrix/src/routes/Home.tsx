import './route.css';
import styles from './route.module.css';
import 'virtual:route.css';
import urlCss from './url.css?url';
import notRenderedCss from './notRendered.css?url';

// notRenderedCss is imported (so the file is in the graph) but never rendered
// as a <link> — its rules must not apply.
const notRendered = notRenderedCss;

export default function Home() {
  return (
    <div class="home-page">
      <link rel="stylesheet" href={urlCss} />
      <h2>Home</h2>
      <p class="entry-probe">entryClient.css import</p>
      <p class="app-probe">app.css import</p>
      <p class="route-probe">route.css import</p>
      <p class={styles.probe} data-probe="module">
        route.module.css import
      </p>
      <p class="virtual-probe">virtual:route.css import</p>
      <p class="url-probe">url.css ?url + link</p>
      <p class="not-rendered-probe" title={notRendered}>
        notRendered.css ?url without render
      </p>
    </div>
  );
}
