import './lazy.css';
import 'virtual:lazy.css';

export default function Lazy() {
  return (
    <div class="lazy-page">
      <h2>Lazy</h2>
      <p class="lazy-probe">lazy.css import</p>
      <p class="lazy-virtual-probe">virtual:lazy.css import</p>
    </div>
  );
}
