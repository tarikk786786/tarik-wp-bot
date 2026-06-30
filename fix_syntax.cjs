const fs = require('fs');
const path = require('path');

const appTsxPath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(appTsxPath, 'utf8');

// The broken code looks like: fetch(`${API_BASE}/api/something', 
// or fetch(`${API_BASE}/api/something",
// We need to replace the trailing single/double quote with a backtick.

content = content.replace(/fetch\(`\$\{API_BASE\}\/api\/([^'"]+)['"]/g, 'fetch(`${API_BASE}/api/$1`');

fs.writeFileSync(appTsxPath, content, 'utf8');
console.log('App.tsx fixed.');
