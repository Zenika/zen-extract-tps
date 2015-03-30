#!/usr/bin/env node-harmony

// jshint esnext: true

'use strict';

const co = require('co');
const Promise = require('bluebird');
const thenify = require('thenify');
const fs = require('mz/fs');
const exec = require('mz/child_process').exec;
const path = require('path');
const meow = require('meow');
const os = require('os');
const mkdirp = thenify(require('mkdirp'));
const rimraf = thenify(require('rimraf'));
const cpr = thenify(require('cpr'));
const archiver = require('archiver');

const cli = meow({
  help: [
    'Usage',
    '  zen-extract-tps <trainingName> [destinationFile] [options]',
    '  -b, --additional-branch branchName1[,branchName2[,branchName3...]]'
  ].join('\n')
});
const trainingName = cli.input[0];
const additionalBranches = (cli.flags.b || cli.flags.additionalBranch || '')
  .split(',')
  .filter((name) => { return name !== ''; });

var destinationFile = trainingName + '-tps.zip';

if(cli.input.length === 0) {
  console.error('You must give a training name as first parameter');
  cli.showHelp();
}
if(cli.input.length > 1) {
  destinationFile = path.resolve(cli.input[1]);
}

const tmpDirectory = path.resolve(os.tmpdir(), cli.pkg.name);
const workDirectory = path.resolve(tmpDirectory, 'formation-' + trainingName);
const resultDirectory = path.resolve(tmpDirectory, 'result');
const gitUrl = 'git@github.com:Zenika/formation-' + trainingName + '.git';

co(function *() {

  try {

    yield rimraf(tmpDirectory);
    yield mkdirp(workDirectory);

    console.log('Clonning', 'formation-' + trainingName, '...');

    yield exec('git clone ' + gitUrl, { cwd: tmpDirectory });

    console.log('Clonning done!');

    var branchesOut = yield exec('git branch -r', { cwd: workDirectory });
    var branches = branchesOut[0].split('\n')
      .filter(function(branchName) {
        return /^\s*origin\/tp\d+$/.test(branchName);
      })
      .map(function(branchName) {
        return /^\s*origin\/(tp\d+)$/.exec(branchName)[1];
      })
      .concat(additionalBranches);

    for (var branch of branches) {
      console.log('Checking out and copy', branch);

      yield exec('git checkout ' + branch, { cwd: workDirectory });

      var tpResultDirectory = path.resolve(resultDirectory, branch);
      yield mkdirp(tpResultDirectory);
      yield cpr(workDirectory, tpResultDirectory, {
        filter: /\.git/
      });
    }

    console.log('Zipping...');

    yield zip(resultDirectory, destinationFile);

    yield rimraf(tmpDirectory);

    console.log('Finished!');

  } catch(error) {
    console.log('Error', error);
    yield rimraf(tmpDirectory);
  }

});


const zip = thenify(function zip(sourceFolder, destinationFile, callback) {
  var file_system = require('fs');

  var output = file_system.createWriteStream(destinationFile);
  var archive = archiver('zip');

  output.on('close', function () {
    callback(null);
  });

  archive.on('error', function(err){
    callback(err);
  });

  archive.pipe(output);
  archive.bulk([
    { expand: true, cwd: sourceFolder, src: ['**'], dest: '.'}
  ]);
  archive.finalize();
});
