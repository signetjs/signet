function signetBuilder(typelog, validator, checker, parser, assembler) {
    'use strict';

    function isType(typeStr) {
        return function (value) {
            return typeof value === typeStr;
        }
    }

    function alias(key, typeStr) {
        var typeDef = parser.parseType(typeStr);

        typelog.defineSubtypeOf(typeDef.type)(key, typelog.isTypeOf(typeDef));
    }

    function isTypeOf(typeValue) {
        return typeof typeValue === 'string' ?
            typelog.isTypeOf(parser.parseType(typeValue)) :
            typeValue;
    }

    function addImmutableProperty(obj, key, value) {
        Object.defineProperty(obj, key, {
            value: value,
            writeable: false
        });

        return obj;
    }

    function attachSignatureAssembler(fn, signatureTree) {
        addImmutableProperty(fn, 'signatureTree', signatureTree);

        Object.defineProperty(fn, 'signature', {
            writeable: false,
            get: function () {
                return assembler.assembleSignature(fn.signatureTree);
            }
        });

        return fn;
    }

    function throwOnSignatureError(signatureTree, fn) {
        var signatureCheckResult = checker.checkSignature(signatureTree);
        var lastIndex = signatureTree.length - 1;

        if (signatureTree.length < 2) {
            throw new SyntaxError('Signature must have both input and output types');
        }

        if (signatureTree[0].length < fn.length) {
            throw new Error('Signature declaration too short for function with ' + fn.length + ' arguments.');
        }

        if (signatureTree[lastIndex].length > 1) {
            throw new SyntaxError('Signature can only have a single output type');
        }

        if (signatureCheckResult !== null) {
            var invalidTypes = signatureCheckResult.map(assembler.assembleType);
            throw new TypeError("Signature contains invalid types: " + invalidTypes.join(', '));
        }
    }

    function signFn(signatureTree, fn) {
        attachSignatureAssembler(fn, signatureTree);
        return addImmutableProperty(fn, 'signatureTree', signatureTree);
    }

    function sign(signature, fn) {
        var signatureTree = parser.parseSignature(signature);

        throwOnSignatureError(signatureTree, fn);

        return signFn(signatureTree, fn);
    }

    function last(list) {
        return list[list.length - 1];
    }

    function throwEvaluationError(valueInfo, prefixMixin) {
        var valueType = typeof valueInfo[1];

        var errorMessage = 'Expected a ' + prefixMixin + 'value of type ' +
            valueInfo[0] + ' but got ' +
            valueInfo[1] + ' of type ' + valueType;

        throw new TypeError(errorMessage);
    }

    var functionTypeDef = parser.parseType('function');

    function verify (fn, args){
        var result = validator.validateArguments(fn.signatureTree[0])(args);

        if(result !== null){
            throwEvaluationError(result, '');
        }
    }

    function buildEnforcer(signatureTree, fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments, 0);

            var validationResult = validator.validateArguments(signatureTree[0])(args);

            if (validationResult !== null) {
                throwEvaluationError(validationResult, '');
            }

            var signatureIsCurried = signatureTree.length > 2;
            var returnType = !signatureIsCurried ? last(signatureTree)[0] : functionTypeDef;
            var returnTypeStr = assembler.assembleType(returnType);

            var result = fn.apply(null, args);

            if (!validator.validateType(returnType)(result)) {
                throwEvaluationError([returnTypeStr, result], 'return ');
            }

            return !signatureIsCurried ? result : enforceOnTree(signatureTree.slice(1), result);
        }
    }

    function buildArgNames(argCount) {
        var startChar = 'a'.charCodeAt(0);
        var argNames = [];

        for (var i = 0; i < argCount; i++) {
            argNames.push(String.fromCharCode(startChar + i));
        }

        return argNames.join(', ');
    }

    var enforcementTemplate = [
        'return function ({args}){',
        'return enforcer.apply(null, Array.prototype.slice.call(arguments))',
        '}'
    ].join('');

    function enforceOnTree(signatureTree, fn) {
        var enforcer = buildEnforcer(signatureTree, fn);
        var argNames = buildArgNames(fn.length);
        var enforceDecorator = Function('enforcer', enforcementTemplate.replace('{args}', argNames))(enforcer);

        enforceDecorator.toString = fn.toString.bind(fn);

        return enforceDecorator;
    }

    function enforce(signature, fn) {
        var signatureTree = parser.parseSignature(signature);
        return enforceOnTree(signatureTree, fn);
    }

    typelog.define('boolean', isType('boolean'));
    typelog.define('function', isType('function'));
    typelog.define('number', isType('number'));
    typelog.define('object', isType('object'));
    typelog.define('string', isType('string'));
    typelog.define('symbol', isType('symbol'));
    typelog.define('undefined', isType('undefined'));
    typelog.define('null', function (value) { return value === null; });

    alias('any', '*');
    alias('void', '*');

    typelog.defineSubtypeOf('object')('array', function (value) {
        return Object.prototype.toString.call(value) === '[object Array]';
    });

    typelog.defineSubtypeOf('number')('int', function (value) {
        return Math.floor(value) === value;
    });

    function rangeBuilder() {
        return function (value, options) {
            var min = Number(options[0]);
            var max = Number(options[1]);

            return min <= value && value <= max;
        }
    }

    typelog.defineSubtypeOf('number')('bounded', rangeBuilder());
    typelog.defineSubtypeOf('int')('boundedInt', rangeBuilder());

    var inRange = rangeBuilder();

    typelog.defineSubtypeOf('string')('boundedString', function (value, options) {
        return inRange(value.length, options);
    });

    typelog.defineSubtypeOf('string')('formattedString', function (value, options) {
        var pattern = RegExp(options.join(';'));
        return value.match(pattern) !== null;
    });

    typelog.defineSubtypeOf('array')('tuple', function (value, options) {
        var lengthOkay = value.length === options.length;
        var tupleOkay = false;

        if (lengthOkay) {
            var tupleOkay = options.reduce(function (result, typeStr, index) {
                return result && isTypeOf(typeStr)(value[index]);
            }, true);
        }

        return tupleOkay;
    });

    function validateHigherKindedType(options, validator) {
        return options.length === 0 || options.filter(validator).length > 0
    }

    function isVariant(value, options) {
        return validateHigherKindedType(options, function (option) {
            return isTypeOf(option)(value);
        });
    }

    typelog.define('variant', isVariant);

    typelog.define('taggedUnion', function (value, options) {
        console.warn('Tagged Union is deprecated, use variant instead.');
        return isVariant(value, options);
    })

    alias('type', 'variant<string; function>');
    alias('arguments', 'variant<array; object>');

    function duckTypeFactory() {
        throw new Error('Not implemented');
    }

    function typeChain() {
        throw new Error('Not implemented');
    }

    return {
        alias: enforce('string, string => undefined', alias),
        duckTypeFactory: duckTypeFactory,
        enforce: enforce('string, function => function', enforce),
        extend: enforce('string, function => undefined', typelog.define),
        isSubtypeOf: enforce('string => string => boolean', typelog.isSubtypeOf),
        isType: enforce('string => boolean', typelog.isType),
        isTypeOf: enforce('type => * => boolean', isTypeOf),
        sign: enforce('string, function => function', sign),
        subtype: enforce('string => string, function => undefined', typelog.defineSubtypeOf),
        typeChain: typeChain,
        verify: enforce('function, arguments => undefined', verify)
    };
}

module.exports = signetBuilder;