var signet = (function () {
    'use strict';

    function buildSignet() {
        var assembler = signetAssembler;
        var parser = signetParser();
        var registrar = signetRegistrar();
        var checker = signetChecker(registrar);
        var typelog = signetTypelog(registrar, parser);
        var validator = signetValidator(typelog, assembler);

        return signetBuilder(
            typelog, 
            validator, 
            checker, 
            parser, 
            assembler);
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = buildSignet;
    }
    
    return buildSignet();
})();

