const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('Hostinger can require the compiled server without TypeScript or an ESM loader', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const http = require('node:http');
    let listeners = 0;
    http.Server.prototype.listen = function (...args) {
      listeners++;
      const callback = args.find(value => typeof value === 'function');
      if (callback) callback();
      return this;
    };
    require(${JSON.stringify(path.resolve(__dirname, '../server.cjs'))});
    if (listeners !== 1) throw new Error('Expected exactly one app server');
  `,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Thrifty server:/);
});
