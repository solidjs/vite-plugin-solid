// test/App.test.tsx
import { render } from '@solidjs/testing-library';
import user from '@testing-library/user-event';
import App from '../src/App.jsx';
import { expect, test } from 'vitest';

test('App', async () => {
  const { getByRole } = render(() => <App />);
  const count = getByRole('h1');

  expect(count.innerHTML).toContain('Count: 0');

  const button = count.querySelector('button');
  await user.click(button);

  expect(count.innerHTML).toContain('Count: 1');
});
