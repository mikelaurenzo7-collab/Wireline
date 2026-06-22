const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
let changedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Remove backdrop-blur-* classes
  content = content.replace(/\bbackdrop-blur(?:-[a-z0-9\[\]]+)?\b/g, '');
  
  // Clean up multiple spaces that might have been left over
  content = content.replace(/ +/g, ' ');
  content = content.replace(/ "/g, '"');
  content = content.replace(/" /g, '"');

  // Replace legacy #F9F9FF with Ametrine #F8F9FF
  content = content.replace(/#F9F9FF/gi, '#F8F9FF');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
    console.log('Fixed', file);
  }
});
console.log('Total files fixed:', changedCount);
