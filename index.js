'use strict';

var assembler = require('signet-assembler');
var checkerBuilder = require('signet-checker');
var signetParser = require('signet-parser');
var registrarBuilder = require('signet-registrar');
var typelogBuilder = require('signet-typelog');
var validatorBuilder = require('signet-validator');
var signetBuilder = require('./bin/signet');
var duckTypes = require('./bin/duckTypes');
var coreTypes = require('./bin/coreTypes');
var recursiveTypes = require('./bin/recursiveTypes');

module.exports = function () {

    var parser = signetParser();
    var registrar = registrarBuilder();
    var checker = checkerBuilder(registrar);
    var typelog = typelogBuilder(registrar, parser);
    var validator = validatorBuilder(typelog, assembler);

    return signetBuilder(
        typelog,
        validator,
        checker,
        parser,
        assembler,
        duckTypes,
        coreTypes,
        recursiveTypes);

};