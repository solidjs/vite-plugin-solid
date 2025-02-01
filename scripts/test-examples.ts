import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const examples = ['vite-3', 'vite-4', 'vite-5', 'vite-6'];
const PORT = 4173;

async function runExample(example) {
  console.log(`Testing ${example}...`);
  const examplePath = `examples/${example}`;

  // Install and build
  await execAsync('pnpm install', { cwd: examplePath });
  await execAsync('pnpm run build', { cwd: examplePath });

  // Start preview server
  const server = spawn('pnpm', ['run', 'preview'], { cwd: examplePath });

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Run Cypress tests
    await execAsync(`pnpm exec cypress run --config-file cypress.config.ts --env example=${example}`);
  } finally {
    // Ensure server is killed
    server.kill();
  }
}

async function runAll() {
  for (const example of examples) {
    try {
      await runExample(example);
    } catch (error) {
      console.error(`Error testing ${example}:`, error);
      process.exit(1);
    }
  }
}

runAll();
