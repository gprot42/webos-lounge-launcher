#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const VERSION_MD = path.resolve(__dirname, '..', 'version.md');

function readVersion(filePath) {
  const file = filePath || VERSION_MD;
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error('Missing version in ' + file);
  }
  return match[1];
}

if (require.main === module) {
  console.log(readVersion());
}

module.exports = {readVersion, VERSION_MD};