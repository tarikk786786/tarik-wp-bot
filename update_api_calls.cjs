const fs = require('fs');
const path = require('path');

const appTsxPath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(appTsxPath, 'utf8');

// Add API_BASE at the top if it doesn't exist
if (!content.includes('const API_BASE =')) {
  // Find the last import statement
  const importMatches = [...content.matchAll(/^import .* from .*;$/gm)];
  if (importMatches.length > 0) {
    const lastImport = importMatches[importMatches.length - 1];
    const insertPos = lastImport.index + lastImport[0].length;
    content = content.slice(0, insertPos) + '\n\nconst API_BASE = import.meta.env.VITE_API_URL || "";\n' + content.slice(insertPos);
  } else {
    content = 'const API_BASE = import.meta.env.VITE_API_URL || "";\n\n' + content;
  }
}

// Replace fetch('/api/...) with fetch(`${API_BASE}/api/...)
// We will use a regex to find all fetch('/api/ or fetch("/api/
content = content.replace(/fetch\(['"]\/api\//g, 'fetch(`${API_BASE}/api/');

// If there are any remaining fetch(`/api/ where it was a template literal without variables:
content = content.replace(/fetch\(`\/api\//g, 'fetch(`${API_BASE}/api/');

fs.writeFileSync(appTsxPath, content, 'utf8');
console.log('App.tsx updated to use API_BASE.');
