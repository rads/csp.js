require('shelljs/global');

var version = process.argv[2];

var banner = [
  '/*',
  ' * CSP.js v' + version,
  ' * Copyright (c) 2013, Radford Smith',
  ' * This code is released under the MIT license.',
  ' */'
].join('\n');

if (!(/^\d+\.\d+\.\d+$/.test(version))) {
  echo('Requires a valid version number as the first argument');
  exit(1);
}

var npmPackage = require('../package.json');
var bowerPackage = require('../bower.json');

npmPackage.version = version;
bowerPackage.version = version;

JSON.stringify(npmPackage, null, 2).to('./package.json');
JSON.stringify(bowerPackage, null, 2).to('./bower.json');

function execSafe(cmd) {
  var result = exec(cmd);

  if (result.code !== 0) {
    echo('Error: ' + cmd + ' failed');
    exit(1);
  }
}

execSafe('make clean');
execSafe('make csp.js');
execSafe('make csp.min.js');

(banner + '\n' + cat('./csp.js')).to('./csp.js');
(banner + '\n' + cat('./csp.min.js')).to('./csp.min.js');
