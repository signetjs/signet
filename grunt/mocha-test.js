var exec = require('child_process').exec;
var path = require('path');

module.exports = function () {
    var done = this.async();

    var cwd = process.cwd();
    var testCommand = [cwd, 'node_modules', 'mocha', 'bin', 'mocha'].join(path.sep);
    var testFiles = ['./test/*.test.js'];

    var command = ['node', testCommand].concat(testFiles).join(' ');
    var options = {
        cwd: process.cwd()
    };

    var processHandle = exec(command, options, function (err, stdout, stderr){
        process.stderr.write(stderr);

        done(err);
    });

    processHandle.stdout.on('data', function (data) {
        process.stdout.write(data);
    });
};