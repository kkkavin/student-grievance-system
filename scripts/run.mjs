#!/usr/bin/env node
/**
 * Root Task Runner: Cross-Platform Process Dispatcher
 * Unifies commands across Windows (PowerShell/CMD) and POSIX (macOS/Linux).
 */
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const backendDir = join(rootDir, 'backend');
const frontendDir = join(rootDir, 'frontend');
const isWin = process.platform === 'win32';

/**
 * Resolves the active Python executable across Windows and POSIX virtual environments.
 */
export function resolvePython() {
  const venvCandidates = [
    // 1. backend/.venv (dedicated backend venv)
    isWin
      ? join(backendDir, '.venv', 'Scripts', 'python.exe')
      : join(backendDir, '.venv', 'bin', 'python'),
    // 2. root .venv (monorepo root venv)
    isWin
      ? join(rootDir, '.venv', 'Scripts', 'python.exe')
      : join(rootDir, '.venv', 'bin', 'python'),
  ];

  for (const candidate of venvCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return isWin ? 'python.exe' : 'python3';
}

/**
 * Spawns a process with inherited stdio, appropriate cwd, and PYTHONPATH injection.
 */
function runCommand(command, args, cwd = rootDir) {
  return new Promise((resolve, reject) => {
    const isNpm = command === 'npm' || command === 'npm.cmd' || command.endsWith('npm');
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: isWin && isNpm,
      env: {
        ...process.env,
        PYTHONPATH: `${rootDir}${isWin ? ';' : ':'}${backendDir}`,
        PYTHONDONTWRITEBYTECODE: '1',
      }
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        process.exit(code ?? 1);
      }
      resolve(code);
    });
  });
}

const action = process.argv[2];
const pythonExe = resolvePython();

async function main() {
  switch (action) {
    case 'backend': {
      console.log(`\n[BACKEND] Starting FastAPI on http://127.0.0.1:8000 (Python: ${pythonExe})...`);
      await runCommand(pythonExe, ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'], backendDir);
      break;
    }
    case 'frontend': {
      console.log(`\n[FRONTEND] Starting Next.js 15 on http://localhost:3000...`);
      const npmCmd = isWin ? 'npm.cmd' : 'npm';
      await runCommand(npmCmd, ['--prefix', 'frontend', 'run', 'dev'], rootDir);
      break;
    }
    case 'db:seed': {
      console.log(`\n[DATABASE] Running idempotent database seeder...`);
      await runCommand(pythonExe, ['-m', 'app.db.seed'], backendDir);
      break;
    }
    case 'db:reset': {
      console.log(`\n[DATABASE] Running database reset and fresh reseed...`);
      await runCommand(pythonExe, ['-m', 'app.db.seed', '--reset'], backendDir);
      break;
    }
    case 'test:backend': {
      console.log(`\n[TEST:BACKEND] Running pytest suite in backend/tests/...`);
      await runCommand(pythonExe, ['-m', 'pytest', 'tests', '-v'], backendDir);
      break;
    }
    case 'test:frontend': {
      console.log(`\n[TEST:FRONTEND] Running frontend test suite in frontend/tests/...`);
      const npmCmd = isWin ? 'npm.cmd' : 'npm';
      await runCommand(npmCmd, ['--prefix', 'frontend', 'test'], rootDir);
      break;
    }
    case 'test': {
      console.log(`\n=================================================================`);
      console.log(` Multi-Tier Test Suite Runner: Backend (Pytest) + Frontend (Node)`);
      console.log(`=================================================================\n`);
      console.log(`>>> Tier 1: Executing Backend Pytest Suite...`);
      await runCommand(pythonExe, ['-m', 'pytest', 'tests', '-q'], backendDir);
      console.log(`\n>>> Tier 2: Executing Frontend Component & RBAC Test Suite...`);
      const npmCmd = isWin ? 'npm.cmd' : 'npm';
      await runCommand(npmCmd, ['--prefix', 'frontend', 'test'], rootDir);
      console.log(`\n[SUCCESS] 100% of Backend and Frontend test suites passed cleanly!\n`);
      break;
    }
    case 'lint': {
      console.log(`\n[LINT] Checking frontend TypeScript compilation...`);
      const npmCmd = isWin ? 'npm.cmd' : 'npm';
      await runCommand(npmCmd, ['--prefix', 'frontend', 'run', 'lint'], rootDir);
      break;
    }
    default: {
      console.error(`Unknown action: "${action}". Valid actions: backend, frontend, db:seed, db:reset, test, test:backend, test:frontend, lint`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('[RUN ERROR]', err);
  process.exit(1);
});
