// Offline module-load test for enabled Nuvio providers.
// The test environment intentionally has no network, filesystem or device APIs.
// Native/bundler-only dependencies are reported separately, never as a pass.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const projects = JSON.parse(fs.readFileSync(path.join(__dirname, 'nuvio_manifest_projects.json'), 'utf8')).projects;
const dependencyPackages = new Set(['crypto-js', 'cheerio-without-node-native']);
let passed = 0;
let gated = 0;
const failures = [];
const needsRuntime = [];

for (const project of projects) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, project, 'manifest.json'), 'utf8'));
  let projectPassed = 0;
  for (const scraper of manifest.scrapers.filter(entry => entry.enabled === true)) {
    const relative = path.posix.join(project, scraper.filename);
    const fullPath = path.resolve(root, relative);
    const sharedExports = {};
    const sandbox = {
      module: { exports: sharedExports }, exports: sharedExports,
      console: { log() {}, warn() {}, error() {}, info() {} },
      Promise, TextEncoder, TextDecoder,
      // No dynamic require: only explicitly recognized app-bundled dependencies
      // are treated as unverified rather than erroneously called broken.
      require(packageName) {
        if (!dependencyPackages.has(packageName)) {
          throw new Error('UNEXPECTED_REQUIRE:' + String(packageName));
        }
        const error = new Error('Unmodeled Nuvio dependency: ' + packageName);
        error.name = 'UnmodeledDependency';
        throw error;
      }
    };
    sandbox.global = sandbox;
    try {
      const code = fs.readFileSync(fullPath, 'utf8');
      const context = vm.createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false }
      });
      vm.runInContext(code, context, { filename: relative, timeout: 500 });
      const exports = context.module.exports;
      if (!exports || typeof exports.getStreams !== 'function') {
        throw new Error('module.exports.getStreams is missing');
      }
      passed++;
      projectPassed++;
    } catch (err) {
      if (err.name === 'UnmodeledDependency') {
        gated++;
        needsRuntime.push(relative + ': ' + err.message);
      } else {
        failures.push(relative + ': ' + err.name + ': ' + String(err.message).split('\n')[0]);
      }
    }
  }
  console.log('LOADED', project, projectPassed, 'dependency-free modules');
}
for (const message of needsRuntime) console.log('RUNTIME_DEPENDENT', message);
for (const message of failures) console.error('FAIL', message);
console.log('RESULT', passed, 'loaded,', gated, 'dependency-gated,', failures.length, 'unexpected failures');
if (failures.length) process.exitCode = 1;
else console.log('PASS no unexpected module-initialization failures in dependency-free cases');
console.log('NOTE: Dependency-gated cases are NOT verified; no HTTP or Android playback tests.');
