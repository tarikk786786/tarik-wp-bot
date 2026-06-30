const fs = require('fs');
const path = require('path');

const appTsxPath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(appTsxPath, 'utf8');

content = content.replace('import.meta.env.VITE_API_URL || "";', 'import.meta.env.VITE_API_URL || "https://tarik-wp-bot.onrender.com";');

fs.writeFileSync(appTsxPath, content, 'utf8');
console.log('App.tsx default API_BASE updated.');
