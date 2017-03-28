function signetBuilder(typelog, validator, checker, parser, assembler) {
    'use strict';

    function alias(key, typeStr) {
        var typeDef = parser.parseType(typeStr);
        var checkType = typelog.isTypeOf(typeDef);

        typelog.defineSubtypeOf(typeDef.type)(key, function (value) {
            return checkType(value);
        });
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

    function verify(fn, args) {
        var result = validator.validateArguments(fn.signatureTree[0])(args);

        if (result !== null) {
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

    function buildEnforceDecorator (enforcer){
        return function (args) {
            return enforcer.apply(null, Array.prototype.slice.call(arguments, 0));
        }
    }

    function enforceOnTree(signatureTree, fn) {
        var enforcer = buildEnforcer(signatureTree, fn);
        var argNames = buildArgNames(fn.length);
        var enforceDecorator = buildEnforceDecorator(enforcer);

        enforceDecorator.toString = fn.toString.bind(fn);
        return signFn(signatureTree, enforceDecorator);
    }

    function addTypeCheck(typeDef) {
        typeDef.typeCheck = typelog.isTypeOf(typeDef);
        return typeDef;
    }

    function prepareSubtree(subtree) {
        return subtree.map(addTypeCheck);
    }

    function prepareSignature(signatureTree){
        return signatureTree.map(prepareSubtree);
    }

    function enforce(signature, fn) {
        var signatureTree = prepareSignature(parser.parseSignature(signature));
        return enforceOnTree(signatureTree, fn);
    }

    function defineDuckType(typeName, objectDef) {
        typelog.defineSubtypeOf('object')(typeName, duckTypeFactory(objectDef));
    }

    function duckTypeFactory(objectDef) {
        var definitionPairs = Object.keys(objectDef).map(function (key) {
            return [key, isTypeOf(objectDef[key])];
        });

        return function (value) {
            return definitionPairs.reduce(function (result, typePair) {
                var key = typePair[0];
                var typePredicate = typePair[1];

                return result && typePredicate(value[key]);
            }, true);
        };
    }

    /* Defining canned types */

    function isType(typeStr) {
        return function (value) {
            return typeof value === typeStr;
        }
    }

    function isNull(value) {
        return value === null;
    }

    function checkArray(value) {
        return Object.prototype.toString.call(value) === '[object Array]';
    }

    function checkInt(value) {
        return Math.floor(value) === value;
    }


    function rangeBuilder() {
        function checkRange(value, range) {
            return range.min <= value && value <= range.max;
        }

        checkRange.preprocess = optionsToRangeObject;

        return checkRange;
    }

    function optionsToRangeObject(options) {
        return {
            min: Number(options[0]),
            max: Number(options[1])
        };
    }

    var inRange = rangeBuilder();

    function checkBoundedString(value, range) {
        return inRange(value.length, range);
    }

    checkBoundedString.preprocess = optionsToRangeObject;

    function optionsToRegex(options) {
        return RegExp(options.join(';'));
    }

    function checkFormattedString(value, regex) {
        return value.match(regex) !== null;
    }

    checkFormattedString.preprocess = optionsToRegex;

    function optionsToFunctions(options) {
        return options.map(isTypeOf);
    }

    function checkTuple(value, options) {
        var lengthOkay = value.length === options.length;

        return lengthOkay && options.reduce(verifyTupleTypes, true);

        function verifyTupleTypes(result, validator, index) {
            return result && validator(value[index]);
        }
    }

    checkTuple.preprocess = optionsToFunctions;

    function isVariant(value, options) {
        return options.length === 0 || options.filter(checkValueType).length > 0;

        function checkValueType(validator) {
            return validator(value);
        }
    }

    isVariant.preprocess = optionsToFunctions;


    function checkTaggedUnion(value, options) {
        console.warn('Tagged Union is deprecated, use variant instead.');
        return isVariant(value, options);
    }

    checkTaggedUnion.preprocess = optionsToFunctions;

    typelog.define('boolean', isType('boolean'));
    typelog.define('function', isType('function'));
    typelog.define('number', isType('number'));
    typelog.define('object', isType('object'));
    typelog.define('string', isType('string'));
    typelog.define('symbol', isType('symbol'));
    typelog.define('undefined', isType('undefined'));
    typelog.define('null', isNull);
    typelog.define('variant', isVariant);
    typelog.define('taggedUnion', checkTaggedUnion);

    typelog.defineSubtypeOf('object')('array', checkArray);
    typelog.defineSubtypeOf('number')('int', checkInt);
    typelog.defineSubtypeOf('number')('bounded', rangeBuilder());
    typelog.defineSubtypeOf('int')('boundedInt', rangeBuilder());
    typelog.defineSubtypeOf('string')('boundedString', checkBoundedString);
    typelog.defineSubtypeOf('string')('formattedString', checkFormattedString);
    typelog.defineSubtypeOf('array')('tuple', checkTuple);

    alias('any', '*');
    alias('void', '*');
    alias('type', 'variant<string; function>');
    alias('arguments', 'variant<array; object>');

    return {
        alias: enforce('string, string => undefined', alias),
        duckTypeFactory: enforce('object => function', duckTypeFactory),
        defineDuckType: enforce('string, object => undefined', defineDuckType),
        enforce: enforce('string, function => function', enforce),
        extend: enforce('string, function => undefined', typelog.define),
        isSubtypeOf: enforce('string => string => boolean', typelog.isSubtypeOf),
        isType: enforce('string => boolean', typelog.isType),
        isTypeOf: enforce('type => * => boolean', isTypeOf),
        sign: enforce('string, function => function', sign),
        subtype: enforce('string => string, function => undefined', typelog.defineSubtypeOf),
        typeChain: enforce('string => string', typelog.getTypeChain),
        verify: enforce('function, arguments => undefined', verify)
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetBuilder;
}