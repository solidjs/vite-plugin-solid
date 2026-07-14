import lazyLinkCss from './lazyLink.css?url';

export default function LazyLink() {
  return (
    <div class="lazy-link-page">
      <link rel="stylesheet" href={lazyLinkCss} />
      <h2>LazyLink</h2>
      <p class="lazy-link-probe">lazyLink.css ?url + link inside a lazy route</p>
    </div>
  );
}
