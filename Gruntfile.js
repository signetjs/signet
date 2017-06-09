'use strict';

const concatConfig = require('./grunt/concat.json');
const uglifyConfig = require('./grunt/uglify.json');
const mochaTest = require('./grunt/mocha-test');
const eslintConfig = require('./grunt/eslint');

module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        concat: concatConfig,
        eslint: eslintConfig,
        uglify: uglifyConfig
    });

    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-eslint');

    grunt.registerTask('mocha-test', mochaTest);

    grunt.registerTask('build', ['concat', 'uglify']);
    grunt.registerTask('test', ['eslint', 'build', 'mocha-test']);
}