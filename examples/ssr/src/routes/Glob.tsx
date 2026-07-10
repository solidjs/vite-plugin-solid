import './Glob.css';

export default function Glob() {
  return (
    <div class="glob-page">
      <h2>Glob</h2>
      <p>This page is lazy-loaded via import.meta.glob (no callsite moduleUrl).</p>
    </div>
  );
}
