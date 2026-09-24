#!/usr/bin/env node

/**
 * TierMax — Automated Setup & Quickstart Wizard
 * Installs dependencies, sets up local SQLite database, and creates .env defaults.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');

console.log(`
=====================================================
  🚀 TIERMAX GATEWAY — QUICKSTART SETUP WIZARD
=====================================================
`);

// 1. Verify Node.js version
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 20) {
    console.warn(`⚠️ Warning: Node.js v${process.version} detected. Node.js 22+ is recommended for optimal native SQLite performance.\n`);
} else {
    console.log(`✓ Node.js ${process.version} detected.`);
}

// 2. Prepare backend .env if not exists
const backendEnvPath = path.join(backendDir, '.env');
if (!fs.existsSync(backendEnvPath)) {
    console.log(`Creating default local .env file in backend/ ...`);
    const jwtSecret = crypto.randomBytes(24).toString('hex');
    const defaultEnv = `# TierMax Configuration — Local Zero-Config Mode
PORT=3000
DB_TYPE=sqlite
ADMIN_JWT_SECRET=${jwtSecret}
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASSWORD=admin

# (Optional) Supabase Cloud Configuration — Uncomment to use cloud database instead of SQLite
# DB_TYPE=supabase
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=eyJ...
`;
    fs.writeFileSync(backendEnvPath, defaultEnv, 'utf-8');
    console.log(`✓ Created backend/.env with Local SQLite default.`);
} else {
    console.log(`✓ Existing backend/.env found.`);
}

// 3. Install backend dependencies if needed
const backendModules = path.join(backendDir, 'node_modules');
if (!fs.existsSync(backendModules)) {
    console.log(`\n📦 Installing backend dependencies...`);
    execSync('npm install', { cwd: backendDir, stdio: 'inherit' });
    console.log(`✓ Backend dependencies installed.`);
} else {
    console.log(`✓ Backend dependencies already installed.`);
}

// 4. Install frontend dependencies if needed
const frontendModules = path.join(frontendDir, 'node_modules');
if (!fs.existsSync(frontendModules)) {
    console.log(`\n📦 Installing frontend dependencies...`);
    execSync('npm install', { cwd: frontendDir, stdio: 'inherit' });
    console.log(`✓ Frontend dependencies installed.`);
} else {
    console.log(`✓ Frontend dependencies already installed.`);
}

// 5. Initialize Local SQLite database
console.log(`\n🗄️ Initializing database...`);
try {
    execSync('npx tsx -e "import { supabase, dbType } from \'./src/db\'; console.log(\'Active DB Engine:\', dbType);"', {
        cwd: backendDir,
        stdio: 'inherit',
    });
} catch (e) {
    console.warn('Could not run test db initialization, will initialize upon first server boot.');
}

console.log(`
=====================================================
  ✨ TIERMAX GATEWAY IS READY TO LAUNCH!
=====================================================

  Dashboard Console : http://localhost:5173
  OpenAI Gateway API: http://localhost:3000/v1
  Default Login     : admin / admin
  Database Mode     : Local SQLite (Zero-Config)

  To start both Frontend and Backend concurrently:
    npm run dev

  To run with Docker:
    docker compose up -d

=====================================================
`);
