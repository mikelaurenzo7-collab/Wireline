import fs from 'fs/promises';
import path from 'path';

async function walkDir(dir, fileList = []) {
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist') {
          await walkDir(filePath, fileList);
        }
      } else {
        fileList.push(filePath);
      }
    }
  } catch (err) {
    // Ignore missing dirs
  }
  return fileList;
}

async function runAudit() {
  console.log('🔍 Running Kimi Genesis Engine Audit...\n');

  // 1. Read package.json
  let pkgInfo = { name: 'Unknown', stack: [] };
  try {
    const pkgStr = await fs.readFile('package.json', 'utf8');
    const pkg = JSON.parse(pkgStr);
    pkgInfo.name = pkg.name || 'Wireline';
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps['react']) pkgInfo.stack.push('React');
    if (allDeps['vite']) pkgInfo.stack.push('Vite');
    if (allDeps['express']) pkgInfo.stack.push('Express');
    if (allDeps['@supabase/supabase-js']) pkgInfo.stack.push('Supabase');
    if (allDeps['tailwindcss']) pkgInfo.stack.push('TailwindCSS');
  } catch (e) {}

  // 2. Count routes and pages
  const srcFiles = await walkDir('src');
  const pages = srcFiles.filter(f => f.includes('pages') || f.includes('components'));
  const apiFiles = await walkDir('api');
  const routeFiles = srcFiles.filter(f => f.includes('routes'));
  
  // 3. Scan for maturity issues
  let maturityHits = 0;
  const keywords = ['TODO', 'MOCK', 'FIXME', 'COMING SOON', 'TODO_KIMI', 'PLACEHOLDER'];
  const gaps = [];

  for (const file of [...srcFiles, ...apiFiles]) {
    if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      const content = await fs.readFile(file, 'utf8');
      for (const kw of keywords) {
        if (content.includes(kw)) {
          maturityHits++;
          if (gaps.length < 10) {
            gaps.push(`Found '${kw}' in ${file}`);
          }
        }
      }
    }
  }

  // Calculate Maturity (0-10)
  // Let's say 0 hits = 10. 10+ hits = 4.
  let maturityScore = 10 - Math.min(Math.floor(maturityHits / 2), 6);
  if (maturityScore < 0) maturityScore = 0;

  // Generate Reports
  const stateReport = `# State Report: ${pkgInfo.name}

## Tech Stack
- Technologies: ${pkgInfo.stack.join(', ')}

## Codebase Size
- Frontend Files (components/pages): ${pages.length}
- API/Route Files: ${apiFiles.length + routeFiles.length}

## Gaps Identified
${gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}
`;

  const maturityReport = `# Maturity Report

**Target Maturity:** 7
**Current Maturity:** ${maturityScore}/10

**Issues Found:** ${maturityHits}

*Note: Fix MOCKs and TODOs to increase score.*
`;

  await fs.writeFile('STATE-REPORT.md', stateReport);
  await fs.writeFile('MATURITY_REPORT.md', maturityReport);

  console.log('✅ Discovery Complete. Generated STATE-REPORT.md');
  console.log('✅ Maturity Audit Complete. Generated MATURITY_REPORT.md');
  console.log(`📊 Current Maturity Score: ${maturityScore}/10 (Target: 7)`);
}

runAudit().catch(console.error);
