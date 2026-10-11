// Parse-only JavaScript check for enabled Nuvio Provider files.
// vm.Script compiles source but never executes it: no network or device access.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'nuvio_manifest_projects.json'), 'utf8'));
let count = 0, failures = 0;
const paths = new Set();
for (const project of config.projects) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, project, 'manifest.json'), 'utf8'));
  let enabled = 0;
  for (const scraper of manifest.scrapers) {
    if (scraper.enabled !== true) continue;
    const relative = path.posix.join(project, scraper.filename);
    if (paths.has(relative)) continue;
    paths.add(relative);
    try {
      const file = path.resolve(root, relative);
      const providerRoot = path.resolve(root, project);
      if (!file.startsWith(providerRoot + path.sep)) throw new Error('File path leaves project directory');
      const source = fs.readFileSync(file, 'utf8');
      new vm.Script(source, { filename: relative, displayErrors: true });
      ++enabled;
      ++count;
    } catch (error) {
      ++failures;
      console.error('FAIL', relative, error.name + ': ' + error.message.split('\n')[0]);
    }
  }
  console.log('PARSED', project, enabled, 'enabled unique scripts');
}
if (failures) {
  console.error('FAIL', failures, 'provider source files did not parse');
  process.exitCode = 1;
} else {
  console.log('PASS all', count, 'enabled Provider JS files parse as scripts');
}
console.log('NOTE: Syntax-only; no getStreams execution, network access or Android playback.');
