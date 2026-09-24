#!/usr/bin/env node

/**
 * TierMax — Concurrent Dev Server Runner
 * Boots backend on port 3000 and frontend on port 5173 with unified logs and graceful exit.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('\n🚀 Starting TierMax Dual-Engine Gateway...\n');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const backend = spawn(npmCmd, ['run', 'dev'], {
    cwd: path.join(rootDir, 'backend'),
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
});

const frontend = spawn(npmCmd, ['run', 'dev'], {
    cwd: path.join(rootDir, 'frontend'),
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
});

function pipeOutput(child, name, color) {
    child.stdout.on('data', data => {
        const lines = data.toString().trimEnd().split('\n');
        for (const line of lines) {
            console.log(`${color}[${name}]\x1b[0m ${line}`);
        }
    });

    child.stderr.on('data', data => {
        const lines = data.toString().trimEnd().split('\n');
        for (const line of lines) {
            console.error(`${color}[${name}:err]\x1b[0m ${line}`);
        }
    });
}

pipeOutput(backend, 'Backend', '\x1b[35m');  // Magenta
pipeOutput(frontend, 'Frontend', '\x1b[36m'); // Cyan

function shutdown() {
    console.log('\n🛑 Shutting down TierMax...');
    backend.kill('SIGINT');
    frontend.kill('SIGINT');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
