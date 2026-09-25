const path = require('path');
const fs = require('fs');

const GATEWAY = __dirname;
const missionControlDir = path.resolve(process.env.HOME || '/root', '.openclaw/workspace/mission-control');

const apps = [
    {
        name: 'openclaw-backend',
        cwd: path.resolve(GATEWAY, 'backend'),
        script: 'npm',
        args: 'run dev',
        watch: false,
        env: {
            NODE_ENV: 'development',
        },
    },
    {
        name: 'openclaw-frontend',
        cwd: path.resolve(GATEWAY, 'frontend'),
        script: 'npm',
        args: 'run dev',
        watch: false,
        env: {
            NODE_ENV: 'development',
        },
    },
    {
        name: 'openclaw-batch-worker',
        cwd: path.resolve(GATEWAY, 'batch-worker'),
        script: 'npm',
        args: 'run dev',
        watch: false,
        env: {
            NODE_ENV: 'development',
        },
    },
];

// Include mission-control if it exists on the machine
if (fs.existsSync(missionControlDir)) {
    apps.unshift({
        name: 'mission-control',
        cwd: missionControlDir,
        script: 'npm',
        args: 'run dev',
        watch: false,
        env: {
            NODE_ENV: 'development',
        },
    });
}

module.exports = { apps };
