var signet = (function () {
    'use strict';

    function buildSignet() {
        var assembler = signetAssembler;
        var parser = signetParser();
        var registrar = signetRegistrar();
        var checker = signetChecker(registrar);
        var typelog = signetTypelog(registrar, parser);
        var validator = signetValidator(typelog, assembler);
        var duckTypes = signetDuckTypes;
        var coreTypes = signetCoreTypes;
        var recursiveTypes = signetRecursiveTypes;

        return signetBuilder(
            typelog, 
            validator, 
            checker, 
            parser, 
            assembler, 
            duckTypes,
            coreTypes,
            recursiveTypes);
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = buildSignet;
    }
    
    return buildSignet();
})();

