// Offline module-load test of every enabled Nuvio provider.
// No network, filesystem or device APIs are exposed to provider code.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const projects = JSON.parse(fs.readFileSync(path.join(__dirname, 'nuvio_manifest_projects.json'), 'utf8')).projects;
let passed = 0;
const failures = [];

for (const project of projects) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, project, 'manifest.json'), 'utf8'));
  let projectPassed = 0;
  for (const scraper of manifest.scrapers.filter(item => item.enabled === true)) {
    const relative = path.posix.join(project, scraper.filename);
    const fullPath = path.resolve(root, relative);
    const sharedExports = {};
    const sandbox = {
      module: { exports: sharedExports }, exports: sharedExports,
      console: { log() {}, warn() {}, error() {}, info() {} },
      Promise, TextEncoder, TextDecoder,
    };
    try {
      const code = fs.readFileSync(fullPath, 'utf8');
      const context = vm.createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false },
      });
      vm.runInContext(code, context, { filename: relative, timeout: 500 });
      const exports = context.module.exports;
      if (!exports || typeof exports.getStreams !== 'function') {
        throw new Error('module.exports.getStreams is missing');
      }
      passed++;
      projectPassed++;
    } catch (err) {
      failures.push(relative + ': ' + err.name + ': ' + String(err.message).split('\n')[0]);
    }
  }
  console.log('LOADED', project, projectPassed, 'enabled provider modules');
}
for (const error of failures) console.error('FAIL', error);
if (failures.length) {
  console.error('FAIL', failures.length, 'of', passed + failures.length, 'enabled module loads');
  process.exitCode = 1;
} else {
  console.log('PASS', passed, 'enabled provider modules loaded and exported getStreams');
}
console.log('NOTE: No getStreams calls, HTTP requests, Nuvio runtime or media playback.');
