'use strict';

var concatConfig = require('./grunt/concat.json');
var uglifyConfig = require('./grunt/uglify.json');
var mochaTest = require('./grunt/mocha-test');

module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        concat: concatConfig,
        uglify: uglifyConfig
    });

    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.registerTask('mocha-test', mochaTest);

    grunt.registerTask('build', ['concat', 'uglify']);
    grunt.registerTask('test', ['build', 'mocha-test']);
}