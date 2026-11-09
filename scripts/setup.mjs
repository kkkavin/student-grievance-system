#!/usr/bin/env node
/**
 * Root Task Runner: Full-Stack Setup Orchestrator
 * Cross-platform automated environment bootstrap:
 * 1. Checks/creates Python virtual environment (backend/.venv or .venv)
 * 2. Installs backend dependencies from backend/requirements.txt
 * 3. Installs frontend dependencies in frontend/
 * 4. Checks/starts PostgreSQL on port 5432, provisions DB or configures SQLite fallback
 * 5. Runs database schema migrations & init (app.db.init_db)
 * 6. Seeds rich idempotent dataset (app.db.seed)
 */
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const backendDir = join(rootDir, 'backend');
const frontendDir = join(rootDir, 'frontend');
const isWin = process.platform === 'win32';

function checkPortOpen(port = 5432, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

function run(command, args, cwd = rootDir) {
  return new Promise((resolve, reject) => {
    const isShellCmd = command === 'npm' || command === 'npm.cmd' || command === 'powershell' || command === 'pwsh';
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: isWin && isShellCmd,
      env: {
        ...process.env,
        PYTHONPATH: `${rootDir}${isWin ? ';' : ':'}${backendDir}`,
        PYTHONDONTWRITEBYTECODE: '1',
      }
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command ${command} ${args.join(' ')} failed with exit code ${code}`));
      } else {
        resolve(code);
      }
    });
  });
}

function findSystemPython() {
  const commands = isWin ? ['python.exe', 'py -3', 'python3'] : ['python3', 'python'];
  for (const cmd of commands) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch {
      // try next
    }
  }
  return isWin ? 'python.exe' : 'python3';
}

function resolveVenvPython() {
  const candidates = [
    // 1. backend/.venv
    isWin ? join(backendDir, '.venv', 'Scripts', 'python.exe') : join(backendDir, '.venv', 'bin', 'python'),
    // 2. root .venv
    isWin ? join(rootDir, '.venv', 'Scripts', 'python.exe') : join(rootDir, '.venv', 'bin', 'python'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function main() {
  console.log(`================================================================`);
  console.log(` Campus Grievance Redressal System — Automated Monorepo Setup  `);
  console.log(`================================================================\n`);

  // 1. Python Virtual Environment
  console.log(`[STEP 1/5] Checking Python Virtual Environment...`);
  let venvPython = resolveVenvPython();
  if (!venvPython) {
    const targetVenv = join(backendDir, '.venv');
    console.log(`Virtual environment not found. Creating virtualenv at ${targetVenv}...`);
    const sysPy = findSystemPython();
    await run(sysPy, ['-m', 'venv', targetVenv]);
    venvPython = resolveVenvPython();
    if (!venvPython) {
      throw new Error(`Failed to initialize Python virtual environment at ${targetVenv}`);
    }
    console.log(`[OK] Virtual environment created successfully.`);
  } else {
    console.log(`[OK] Found active virtual environment Python: ${venvPython}`);
  }

  // 2. Install Backend Dependencies
  console.log(`\n[STEP 2/5] Installing Backend Requirements (backend/requirements.txt)...`);
  const reqPath = join(backendDir, 'requirements.txt');
  await run(venvPython, ['-m', 'pip', 'install', '-r', reqPath]);
  console.log(`[OK] Backend requirements verified.`);

  // 3. Install Frontend Dependencies
  console.log(`\n[STEP 3/5] Installing Frontend Dependencies (frontend/)...`);
  const npmCmd = isWin ? 'npm.cmd' : 'npm';
  await run(npmCmd, ['--prefix', 'frontend', 'install'], rootDir);
  console.log(`[OK] Frontend node_modules verified.`);

  // 4. PostgreSQL Verification & Setup
  console.log(`\n[STEP 4/5] Checking PostgreSQL Database on Port 5432...`);
  const isPgOpen = await checkPortOpen(5432, '127.0.0.1', 1000);
  if (isPgOpen) {
    console.log(`[OK] PostgreSQL port 5432 is open and listening.`);
  } else {
    console.log(`[INFO] Port 5432 is not currently listening.`);
    if (isWin) {
      const psScript = join(rootDir, 'scripts', 'setup_postgres.ps1');
      if (existsSync(psScript)) {
        console.log(`[SETUP] Invoking PowerShell PostgreSQL service helper...`);
        try {
          await run('powershell', ['-ExecutionPolicy', 'Bypass', '-File', psScript]);
        } catch (psErr) {
          console.warn(`[SETUP] PowerShell helper notice: ${psErr.message}`);
        }
      }
    }
  }

  // Run app.db.setup_postgres (handles PostgreSQL provisioning or SQLite fallback)
  console.log(`[SETUP] Running database connection synchronizer...`);
  try {
    await run(venvPython, ['-m', 'app.db.setup_postgres'], backendDir);
  } catch (setupErr) {
    console.warn(`[SETUP] setup_postgres notice: ${setupErr.message}`);
  }

  // 5. Database Schema Initialization & Seeding
  console.log(`\n[STEP 5/5] Initializing Database Schema & Rich Seeding...`);
  console.log(`>>> Running schema creation & Alembic sync (app.db.init_db)...`);
  await run(venvPython, ['-m', 'app.db.init_db'], backendDir);

  console.log(`>>> Running idempotent seeder (app.db.seed)...`);
  await run(venvPython, ['-m', 'app.db.seed'], backendDir);

  console.log(`\n================================================================`);
  console.log(` [SUCCESS] Environment Setup & Database Initialization Complete! `);
  console.log(`================================================================`);
  console.log(`\nAvailable unified task runner commands:`);
  console.log(`  npm run dev          - Start both backend (:8000) and frontend (:3000)`);
  console.log(`  npm run backend      - Start FastAPI backend with hot reload`);
  console.log(`  npm run frontend     - Start Next.js App Router frontend`);
  console.log(`  npm run db:seed      - Seed database with all 10 departments & test users`);
  console.log(`  npm run db:reset     - Drop, re-create, and re-seed database`);
  console.log(`  npm test             - Execute backend pytest + frontend test suites`);
  console.log(`\nQuick Demo Login credentials documented in: CREDENTIALS.md\n`);
}

main().catch((err) => {
  console.error('\n[FATAL SETUP ERROR]', err);
  process.exit(1);
});
