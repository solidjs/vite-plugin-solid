import { Accessor, createRenderEffect, createSignal } from 'solid-js';

function model(
  element: HTMLInputElement,
  value: Accessor<[Accessor<string>, (value: string) => void]>,
) {
  const [field, setField] = value();
  createRenderEffect(() => (element.value = field()));
  element.addEventListener('input', (e: Event & { currentTarget: HTMLInputElement }) =>
    setField(e.currentTarget.value),
  );
}

export default function Home() {
  const [name, setName] = createSignal('');
  return (
    <>
      <input type="text" use:model={[name, setName]} />
      <h1>Hello {name()}</h1>
    </>
  );
}

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      model: [() => any, (v: any) => any];
    }
  }
}
