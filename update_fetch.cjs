const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'App.tsx');
let c = fs.readFileSync(file, 'utf8');

// Insert API_BASE at the top
if (!c.includes('const API_BASE =')) {
  c = c.replace(
    "import { io, Socket } from 'socket.io-client';",
    "import { io, Socket } from 'socket.io-client';\nconst API_BASE = import.meta.env.VITE_API_URL || \"https://tarik-wp-bot.onrender.com\";"
  );
}

// Replace exact fetch paths
c = c.replace(/fetch\('(\/api\/[^']+)'/g, "fetch(`${API_BASE}$1`");

// Also replace socket.io connection
c = c.replace(/io\('\/'\)/g, "io(API_BASE || '/')");

fs.writeFileSync(file, c, 'utf8');
console.log('Updated App.tsx fetches to use API_BASE');
