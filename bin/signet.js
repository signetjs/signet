function signetBuilder(
    typelog,
    validator,
    checker,
    parser,
    assembler) {

    'use strict';

    var duckTypeErrorReporters = {};

    function defineDuckType(typeName, objectDef) {
        var definitionPairs = buildDefinitionPairs(objectDef);

        typelog.defineSubtypeOf('object')(typeName, buildDuckType(definitionPairs, objectDef));
        duckTypeErrorReporters[typeName] = buildDuckTypeErrorReporter(definitionPairs, objectDef);
    }

    function buildDefinitionPairs(objectDef) {
        return Object.keys(objectDef).map(function (key) {
            return [key, isTypeOf(objectDef[key])];
        });
    }

    function buildDuckTypeErrorReporter(definitionPairs, objectDef) {
        return function (value) {
            return definitionPairs.reduce(function (result, typePair) {
                var key = typePair[0];
                var typePredicate = typePair[1];

                if (!typePredicate(value[key])) {
                    result.push([key, getTypeName(objectDef, key), value[key]]);
                }

                return result;
            }, []);
        };
    }

    function buildDuckType(definitionPairs, objectDef) {
        return function (value) {
            return definitionPairs.reduce(function (result, typePair) {
                var key = typePair[0];
                var typePredicate = typePair[1];

                return result && typePredicate(value[key]);
            }, true);
        };
    }

    function duckTypeFactory(objectDef) {
        var definitionPairs = buildDefinitionPairs(objectDef);
        return buildDuckType(definitionPairs, objectDef);
    }

    function reportDuckTypeErrors(typeName) {
        var errorChecker = duckTypeErrorReporters[typeName];

        if(typeof errorChecker === 'undefined') {
            throw new Error('No duck type "' + typeName + '" exists.');
        }

        return function (value) {
            return errorChecker(value);
        }
    }

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

    function throwInputError(validationResult, inputErrorBuilder, args, signatureTree) {
        if (typeof inputErrorBuilder === 'function') {
            throw new Error(inputErrorBuilder(validationResult, args, signatureTree));
        } else {
            throwEvaluationError(validationResult, '');
        }
    }

    function throwOutputError(validationResult, outputErrorBuilder, args, signatureTree) {
        if (typeof outputErrorBuilder === 'function') {
            throw new Error(outputErrorBuilder(validationResult, args, signatureTree));
        } else {
            throwEvaluationError(validationResult, 'return ');
        }
    }

    function buildEnforcer(signatureTree, fn, options) {
        return function () {
            var args = Array.prototype.slice.call(arguments, 0);
            var validationResult = validator.validateArguments(signatureTree[0])(args);

            if (validationResult !== null) {
                throwInputError(validationResult, options.inputErrorBuilder, args, signatureTree);
            }

            var signatureIsCurried = signatureTree.length > 2;
            var returnType = !signatureIsCurried ? last(signatureTree)[0] : functionTypeDef;
            var returnTypeStr = assembler.assembleType(returnType);

            var result = fn.apply(null, args);

            if (!validator.validateType(returnType)(result)) {
                throwOutputError([returnTypeStr, result], options.outputErrorBuilder, args, signatureTree);
            }

            return !signatureIsCurried ? result : enforceOnTree(signatureTree.slice(1), result, options);
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

    function buildEnforceDecorator(enforcer) {
        return function (args) {
            return enforcer.apply(null, Array.prototype.slice.call(arguments, 0));
        }
    }

    function enforceOnTree(signatureTree, fn, options) {
        var enforcer = buildEnforcer(signatureTree, fn, options);
        var argNames = buildArgNames(fn.length);
        var enforceDecorator = buildEnforceDecorator(enforcer);

        enforceDecorator.toString = Function.prototype.toString.bind(fn);

        return signFn(signatureTree, enforceDecorator);
    }

    function addTypeCheck(typeDef) {
        typeDef.typeCheck = typelog.isTypeOf(typeDef);
        return typeDef;
    }

    function prepareSubtree(subtree) {
        var updatedSubtree = subtree.map(addTypeCheck);
        updatedSubtree.dependent = subtree.dependent;
        return updatedSubtree;
    }

    function prepareSignature(signatureTree) {
        return signatureTree.map(prepareSubtree);
    }

    function enforce(signature, fn, options) {
        var signatureTree = prepareSignature(parser.parseSignature(signature));
        var cleanOptions = typeof options === 'object' && options !== null ? options : {};
        return enforceOnTree(signatureTree, fn, cleanOptions);
    }

    function getTypeName(objectDef, key) {
        return typeof objectDef[key] === 'string' ? objectDef[key] : objectDef[key].name;
    }

    /* Defining canned types */

    function not(pred) {
        return function (a, b) {
            return !pred(a, b);
        }
    }

    function objectsAreEqual(a, b) {
        if (isNull(a) || isNull(b) || a === b) { return a === b; }

        function propsInequal(key) {
            return a[key] !== b[key];
        }

        var objAKeys = Object.keys(a);
        var keyLengthEqual = objAKeys.length === Object.keys(b).length;

        return !keyLengthEqual ? false : objAKeys.filter(propsInequal).length === 0;

    }

    function verifyPropertyMatches(a, b) {
        return Object.keys(b).filter(function (key) {
            return typeof a[key] === typeof b[key];
        }).length === 0;
    }

    function propertySuperSet(a, b) {
        var keyLengthOk = !(Object.keys(a).length < Object.keys(b).length);
        return keyLengthOk && verifyPropertyMatches(a, b);
    }

    function propertySubSet(a, b) {
        return propertySuperSet(b, a);
    }

    function propertyCongruence(a, b) {
        var keyLengthOk = Object.keys(a).length === Object.keys(b).length;
        return keyLengthOk && verifyPropertyMatches(a, b);
    }

    function isSameType(a, b, aType, bType) {
        var aTypeName = getVariantType(a, aType);
        var bTypeName = getVariantType(b, bType);

        return aTypeName === bTypeName;
    }

    function getVariantType(value, typeDef) {
        return whichType(typeDef.subtype)(value);
    }

    function whichVariantType(variantString) {
        var variantStrings = parser.parseType(variantString).subtype;

        return whichType(variantStrings);
    }

    function whichType(typeStrings) {
        return function (value) {
            var result = typeStrings.filter(function (typeString) { return isTypeOf(typeString)(value); })[0];
            return typeof result !== 'string' ? null : result;
        };
    }

    function isSubtypeOf(a, b, aType, bType) {
        var aTypeName = getVariantType(a, aType);
        var bTypeName = getVariantType(b, bType);

        return typelog.isSubtypeOf(bTypeName)(aTypeName);
    }

    function isSupertypeOf(a, b, aType, bType) {
        return isSubtypeOf(b, a, bType, aType);
    }

    function greater(a, b) {
        return a > b;
    }

    function less(a, b) {
        return a < b;
    }

    function equal(a, b) {
        return a === b;
    }

    function isType(typeStr) {
        return function (value) {
            return typeof value === typeStr;
        }
    }

    function isNull(value) {
        return value === null;
    }

    function checkArrayValues(arrayValues, options) {
        if (options.length === 0 || options[0] === '*') {
            return true;
        } else {
            var checkType = isTypeOf(options[0]);
            return arrayValues.filter(checkType).length === arrayValues.length;
        }
    }

    function checkArray(value, options) {
        var arrayIsOk = Object.prototype.toString.call(value) === '[object Array]';
        return arrayIsOk && checkArrayValues(value, options);
    }

    function checkInt(value) {
        return Math.floor(value) === value && value !== Infinity;
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

    function leftBoundedBuilder() {
        function checkLeftBound(value, bound) {
            return value >= bound;
        }

        checkLeftBound.preprocess = optionsToBound;

        return checkLeftBound;
    }

    function rightBoundedBuilder() {
        function checkRightBound(value, bound) {
            return value <= bound;
        }

        checkRightBound.preprocess = optionsToBound;

        return checkRightBound;
    }

    function optionsToBound(options) {
        return Number(options[0]);
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

    function checkArgumentsObject(value) {
        return !isNull(value);
    }

    function isRegExp(value) {
        return Object.prototype.toString.call(value) === '[object RegExp]';
    }

    function compareTypes(typeA, typeB) {
        var result = typeA === typeB ? 1 : 0;
        return typelog.isSubtypeOf(typeA)(typeB) ? -1 : result;
    }

    function insertTypeName(typeNameArray, typeName) {
        var index = 0;
        var offset = 0;

        for (index; index < typeNameArray.length; index++) {
            offset = compareTypes(typeNameArray[index], typeName);
            if (offset !== 0) {
                break;
            }
        }

        typeNameArray.splice(index + offset, 0, typeName);

        return typeNameArray;
    }

    function sortTypeNames(typeNames) {
        return typeNames.reduce(insertTypeName, []);
    }

    function typeDoesNotExistIn(values) {
        var valuesCopy = values.slice(0);

        return function (typeName) {
            var typeCheckOk = false;
            var isTypeOfTypeName = isTypeOf(typeName);

            for (var i = 0; i < valuesCopy.length; i++) {
                if (isTypeOfTypeName(valuesCopy[i])) {
                    typeCheckOk = true;
                    valuesCopy.splice(i, 1);
                    break;
                }
            }

            return !typeCheckOk;
        };
    }

    function checkValueTypes(values, typeNames) {
        return typeNames.filter(typeDoesNotExistIn(values)).length === 0;
    }

    function isUnorderedProduct(value, typeNames) {
        var isCorrectLength = value.length === typeNames.length;
        return isCorrectLength && checkValueTypes(value, sortTypeNames(typeNames));
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

    var starTypeDef = parser.parseType('*');

    parser.registerTypeLevelMacro(function emptyParamsToStar(value) {
        return /^\(\s*\)$/.test(value) ? '*' : value;
    });

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

    var isTypeBaseType = isTypeOf('variant<string; function>');

    function verifyTypeType(value) {
        var typeValueOk = isTypeBaseType(value);

        if (typeValueOk && typeof value === 'string') {
            var parsedType = parser.parseType(value);
            typeValueOk = typelog.isType(parsedType.type);
        }

        return typeValueOk;
    }

    typelog.define('type', verifyTypeType);

    typelog.defineSubtypeOf('object')('array', checkArray);
    typelog.defineSubtypeOf('object')('regexp', isRegExp);
    typelog.defineSubtypeOf('number')('int', checkInt);
    typelog.defineSubtypeOf('number')('bounded', rangeBuilder());
    typelog.defineSubtypeOf('number')('leftBounded', leftBoundedBuilder());
    typelog.defineSubtypeOf('number')('rightBounded', rightBoundedBuilder());
    typelog.defineSubtypeOf('int')('boundedInt', rangeBuilder());
    typelog.defineSubtypeOf('int')('leftBoundedInt', leftBoundedBuilder());
    typelog.defineSubtypeOf('int')('rightBoundedInt', rightBoundedBuilder());
    typelog.defineSubtypeOf('string')('boundedString', checkBoundedString);
    typelog.defineSubtypeOf('string')('formattedString', checkFormattedString);
    typelog.defineSubtypeOf('array')('tuple', checkTuple);
    typelog.defineSubtypeOf('array')('unorderedProduct', isUnorderedProduct);
    typelog.defineSubtypeOf('object')('arguments', checkArgumentsObject);

    alias('any', '*');
    alias('void', '*');

    typelog.defineDependentOperatorOn('number')('>', greater);
    typelog.defineDependentOperatorOn('number')('<', less);
    typelog.defineDependentOperatorOn('number')('=', equal);
    typelog.defineDependentOperatorOn('number')('>=', not(less));
    typelog.defineDependentOperatorOn('number')('<=', not(greater));
    typelog.defineDependentOperatorOn('number')('!=', not(equal));

    typelog.defineDependentOperatorOn('string')('=', equal);
    typelog.defineDependentOperatorOn('string')('!=', not(equal));

    typelog.defineDependentOperatorOn('object')('=', objectsAreEqual);
    typelog.defineDependentOperatorOn('object')('!=', not(objectsAreEqual));
    typelog.defineDependentOperatorOn('object')(':>', propertySuperSet);
    typelog.defineDependentOperatorOn('object')(':<', propertySubSet);
    typelog.defineDependentOperatorOn('object')(':=', propertyCongruence);
    typelog.defineDependentOperatorOn('object')(':!=', not(propertyCongruence));

    typelog.defineDependentOperatorOn('variant')('isTypeOf', isSameType);
    typelog.defineDependentOperatorOn('variant')('=:', isSameType);
    typelog.defineDependentOperatorOn('variant')('<:', isSubtypeOf);
    typelog.defineDependentOperatorOn('variant')('>:', isSupertypeOf);

    return {
        alias: enforce('aliasName != typeString :: aliasName:string, typeString:string => undefined', alias),
        duckTypeFactory: enforce('duckTypeDef:object => function', duckTypeFactory),
        defineDuckType: enforce('typeName:string, duckTypeDef:object => undefined', defineDuckType),
        defineDependentOperatorOn: enforce('typeName:string => operator:string, operatorCheck:function => undefined', typelog.defineDependentOperatorOn),
        enforce: enforce('signature:string, functionToEnforce:function, options:[object] => function', enforce),
        extend: enforce('typeName:string, typeCheck:function => undefined', typelog.define),
        isSubtypeOf: enforce('rootTypeName:string => typeNameUnderTest:string => boolean', typelog.isSubtypeOf),
        isType: enforce('typeName:string => boolean', typelog.isType),
        isTypeOf: enforce('typeToCheck:type => value:* => boolean', isTypeOf),
        registerTypeLevelMacro: enforce('macro:function => undefined', parser.registerTypeLevelMacro),
        reportDuckTypeErrors: enforce('duckTypeName:string => valueToCheck:object => array<tuple<string; string; *>>', reportDuckTypeErrors),
        sign: enforce('signature:string, functionToSign:function => function', sign),
        subtype: enforce('rootTypeName:string => subtypeName:string, subtypeCheck:function => undefined', typelog.defineSubtypeOf),
        typeChain: enforce('typeName:string => string', typelog.getTypeChain),
        verify: enforce('signedFunctionToVerify:function, functionArguments:arguments => undefined', verify),
        whichType: enforce('typeNames:array<string> => value:* => variant<string; null>', whichType),
        whichVariantType: enforce('variantString:string => value:* => variant<string; null>', whichVariantType)
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetBuilder;
}