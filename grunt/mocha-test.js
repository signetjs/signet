var fork = require('child_process').fork;
var path = require('path');

module.exports = function () {
    var done = this.async();
    var cwd = process.cwd();
    
    var options = {
        cwd: cwd
    };

    var testCommand = [cwd, 'node_modules', 'mocha', 'bin', 'mocha'].join(path.sep);
    var testFiles = ['./test/*.test.js'];


    fork(testCommand, testFiles, options)
        .on('exit', function (err, stdout, stderr) {
            done(err);
        });

};