const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, 'backend');
if (!fs.existsSync(backendDir)) {
  fs.mkdirSync(backendDir);
}

const filesToMove = [
  'server',
  'assets',
  'server.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'bot_config.json',
  '.env.example',
  '.env.production',
  'index.html',
  'vite.config.ts',
  'src'
];

for (const file of filesToMove) {
  const oldPath = path.join(__dirname, file);
  const newPath = path.join(backendDir, file);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
    console.log(`Moved ${file} to backend/`);
  }
}

console.log('Restructuring complete.');
