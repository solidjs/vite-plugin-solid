import { spawn, exec, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const examples = ['vite-3', 'vite-4', 'vite-5', 'vite-6'];
const PORT = 4173;
const TEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Track active processes for cleanup
const activeProcesses = new Set<ChildProcess>();

// Cleanup function
function cleanup() {
  for (const proc of activeProcesses) {
    proc.kill('SIGTERM');
  }
  process.exit(0);
}

// Handle termination signals
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Run the node:test unit suites (test/**/*.test.ts) in a child process so their
// TAP output streams through and a failure aborts the whole run.
async function runUnitTests() {
  console.log('Running unit tests...');
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', ['--test', 'test/**/*.test.ts'], { stdio: 'inherit' });
    activeProcesses.add(proc);
    proc.on('error', reject);
    proc.on('exit', (code: number | null) => {
      activeProcesses.delete(proc);
      code === 0 ? resolve() : reject(new Error(`Unit tests failed (exit code ${code})`));
    });
  });
}

async function runExample(example) {
  console.log(`Testing ${example}...`);
  const examplePath = `examples/${example}`;

  try {
    // Install and build
    await execAsync('pnpm install', { cwd: examplePath });
    await execAsync('pnpm run build', { cwd: examplePath });

    // Start preview server with timeout
    const server = spawn('pnpm', ['run', 'preview'], { cwd: examplePath });
    activeProcesses.add(server);

    server.on('error', (err) => {
      console.error(`Server error for ${example}:`, err);
      throw err;
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run Cypress tests with timeout
    const testPromise = execAsync(`pnpm exec cypress run --config-file cypress.config.ts --env example=${example}`);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Test timeout for ${example}`)), TEST_TIMEOUT)
    );

    await Promise.race([testPromise, timeoutPromise]);
  } finally {
    // Clean up processes
    for (const proc of activeProcesses) {
      proc.kill('SIGTERM');
      activeProcesses.delete(proc);
    }
  }
}

async function runAll() {
  try {
    await runUnitTests();
  } catch (error) {
    console.error(error);
    cleanup();
    process.exit(1);
  }

  for (const example of examples) {
    try {
      await runExample(example);
    } catch (error) {
      console.error(`Error testing ${example}:`, error);
      cleanup();
      process.exit(1);
    }
  }
  process.exit(0);
}

runAll().catch(error => {
  console.error('Unexpected error:', error);
  cleanup();
  process.exit(1);
});