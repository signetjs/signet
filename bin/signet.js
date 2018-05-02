function signetBuilder(
    typelog,
    validator,
    checker,
    parser,
    assembler,
    duckTypes,
    coreTypes,
    recursiveTypes) {

    'use strict';

    var placeholderPattern = /([<\;\,]\s*)(_)(\s*[>\;\,])/;

    function hasPlaceholder(typeStr) {
        return placeholderPattern.test(typeStr);
    }

    function replacePlaceholders(typeStr, typeValues) {
        return typeValues.reduce(function (result, typeValue) {
            return result.replace(placeholderPattern, '$1' + typeValue + '$3');
        }, typeStr);
    }

    function buildTypeAlias(typeDef) {
        var checkValue = typelog.isTypeOf(typeDef);

        return function typeCheck(value) {
            return checkValue(value);
        };
    }

    function buildPartialTypeAlias(typeStr) {
        return function typeCheck(value, typeValues) {
            var finalTypeStr = replacePlaceholders(typeStr, typeValues);
            var typeDef = parser.parseType(finalTypeStr);

            return buildTypeAlias(typeDef)(value);
        };
    }

    function alias(key, typeStr) {
        var typeAlias = hasPlaceholder(typeStr)
            ? buildPartialTypeAlias(typeStr)
            : buildTypeAlias(parser.parseType(typeStr));

        extend(key, typeAlias);
    }

    function isTypeOf(typeValue) {
        return typeof typeValue === 'string'
            ? typelog.isTypeOf(parser.parseType(typeValue))
            : typeValue;
    }

    function verifyValueType(typeValue) {
        var isValidType = isTypeOf(typeValue);

        return function (value) {
            if (!isValidType(value)) {
                throw new TypeError('Expected value of type ' + typeValue + ', but got ' + String(value) + ' of type ' + typeof value);
            }

            return value;
        };
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

    function buildEvaluationError(validationResult, prefixMixin, functionName) {
        var expectedType = validationResult[0];
        var value = validationResult[1];
        var valueType = typeof value;

        var errorMessage = functionName + ' expected a ' + prefixMixin + 'value of type ' +
            expectedType + ' but got ' +
            validationResult[1] + ' of type ' + valueType;

        return errorMessage;
    }

    function evaluationErrorFactory(prefix) {
        return function throwEvaluationError(
            validationResult,
            errorBuilder,
            args,
            signatureTree,
            functionName
        ) {

            var errorMessage = '';

            if (typeof errorBuilder === 'function') {
                errorMessage = errorBuilder(validationResult, args, signatureTree, functionName);
            } else {
                errorMessage = buildEvaluationError(validationResult, prefix, functionName);
            }

            throw new TypeError(errorMessage);
        }
    }

    var throwInputError = evaluationErrorFactory('');
    var throwOutputError = evaluationErrorFactory('return ');

    function buildInputErrorMessage(validationResult, args, signatureTree, functionName) {
        return buildEvaluationError(validationResult, '', functionName);
    }

    function buildOutputErrorMessage(validationResult, args, signatureTree, functionName) {
        return buildEvaluationError(validationResult, 'return ', functionName);
    }

    function verify(fn, args, environment) {
        var result = validator.validateArguments(fn.signatureTree[0], environment)(args);

        if (result !== null) {
            throwInputError(result, null, args, fn.signatureTree, getFunctionName(fn));
        }
    }

    function enforceArgs(types) {
        return function (rawArgs) {
            var args = Array.prototype.slice.call(rawArgs, 0);
            var parsedTypes = types.map(parser.parseType);
            var result = validator.validateArguments(parsedTypes, undefined)(args);

            if (result !== null) {
                throwInputError(result, null, args, [parsedTypes], 'Called Function');
            }

        }
    }

    function getFunctionName(fn) {
        return fn.name === '' ? 'Anonymous' : fn.name;
    }

    function processFunction(fn, type, options) {
        var signature = type.subtype.join(', ').trim();
        var returnFn = signature !== ''
            ? enforce(signature, fn, options)
            : fn;

        return returnFn;
    }

    function processArg(arg, type, options) {
        var cleanType = typeof type === 'object' ? type : {};

        if (cleanType.type === 'function') {
            return processFunction(arg, cleanType, options);
        } else {
            return arg;
        }
    }

    function processArgs(args, typeList, options) {
        var argResults = [];
        var argIndex = 0;
        var typeIndex = 0;

        for (argIndex; argIndex < args.length; argIndex++) {
            var currentArg = args[argIndex];
            var currentType = undefined

            for (typeIndex; typeIndex < typeList.length; typeIndex++) {
                currentType = typeList[typeIndex];

                if (currentType.typeCheck(currentArg)) {
                    break;
                }
            }

            argResults.push(processArg(currentArg, currentType, options));
        }

        return argResults;
    }

    function quickSliceFrom(index, values) {
        var result = [];

        for (var i = index; i < values.length; i++) {
            result.push(values[i]);
        }

        return result;
    }

    function buildEnforcer(signatureTree, fn, options) {
        var functionName = getFunctionName(fn);

        return function () {
            var args = quickSliceFrom(0, arguments);

            var environmentTable = typeof signatureTree.environment === 'object'
                ? Object.create(signatureTree.environment)
                : {};

            var validationResult = validator.validateArguments(signatureTree[0], environmentTable)(args);
            var nextTree = quickSliceFrom(1, signatureTree);

            if (validationResult !== null) {
                throwInputError(
                    validationResult,
                    options.inputErrorBuilder,
                    args,
                    signatureTree,
                    functionName);
            }

            var signatureIsCurried = signatureTree.length > 2;

            var processedArgs = processArgs(args, signatureTree[0], options);
            var result = fn.apply(this, processedArgs);

            var isFinalResult = nextTree.length === 1;

            var resultCheckTree = nextTree[0];
            resultCheckTree.dependent = signatureTree[0].dependent;

            var resultValidation = isFinalResult
                ? validator.validateArguments(resultCheckTree, environmentTable)([result])
                : null;

            if (resultValidation !== null) {
                throwOutputError(
                    resultValidation,
                    options.outputErrorBuilder,
                    processedArgs,
                    signatureTree,
                    functionName);
            }

            nextTree.environment = environmentTable;
            nextTree[0].dependent = signatureTree[0].dependent;

            return signatureIsCurried
                ? enforceOnTree(nextTree, result, options)
                : result;
        };
    }

    function buildEnforceDecorator(enforcer) {
        return function enforceDecorator() {
            var args = quickSliceFrom(0, arguments);
            return enforcer.apply(this, args);
        }
    }

    function attachProps(fn, enforcedFn) {
        var keys = Object.keys(fn);

        keys.reduce(function (enforcedFn, key) {
            enforcedFn[key] = fn[key];
            return enforcedFn;
        }, enforcedFn);

        return enforcedFn;
    }

    function enforceOnTree(signatureTree, fn, options) {
        var enforcer = buildEnforcer(signatureTree, fn, options);
        var enforceDecorator = buildEnforceDecorator(enforcer);

        enforceDecorator.toString = Function.prototype.toString.bind(fn);

        var signedEnforceDecorator = signFn(signatureTree, enforceDecorator);

        return attachProps(fn, signedEnforceDecorator);
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

    function attachPreprocessor(typeCheck, preprocessor) {
        if (typeof preprocessor === 'function') {
            typeCheck.preprocess = preprocessor;
        }
    }

    var typeArityPattern = /^([^\{]+)\{([^\}]+)\}$/;

    function getArity(typeName, typeStr) {
        var arityStr = typeStr.replace(typeArityPattern, '$2');
        var arityData = arityStr.split(/\,\s*/g);
        var min = 0;
        var max = Infinity;

        if (arityStr !== typeStr) {
            min = parseInt(arityData[0]);
            max = arityData.length === 1 ? min : parseInt(arityData[1]);

            if (min > max) {
                throw new Error('Error in ' + typeName + ' arity declaration: min cannot be greater than max');
            }

            min = isNaN(min) || min < 0 ? 0 : min;
            max = isNaN(max) || max < 0 ? Infinity : max;
        }

        return [min, max];
    }

    function getTypeName(typeStr) {
        return typeStr.replace(typeArityPattern, '$1').trim();
    }

    function checkTypeArity(typeName, arity, options) {
        var optionsIsArray = Object.prototype.toString.call(options) === '[object Array]';
        var errorMessage = null;

        if (optionsIsArray && options.length < arity[0]) {
            errorMessage = 'Type ' + typeName + ' requires, at least, ' + arity[0] + ' arguments';
        } else if (optionsIsArray && options.length > arity[1]) {
            errorMessage = 'Type ' + typeName + ' accepts, at most, ' + arity[1] + ' arguments';
        }

        if (errorMessage !== null) {
            throw new Error(errorMessage);
        }
    }

    function decorateWithArityCheck(typeName, typeArity, typeCheck) {
        return function decoratedTypeCheck(value, options) {
            checkTypeArity(typeName, typeArity, options);

            return typeCheck(value, options);
        }
    }

    function extend(typeStr, typeCheck, preprocessor) {
        var typeName = getTypeName(typeStr);
        var typeArity = getArity(typeName, typeStr);
        var decoratedTypeCheck = decorateWithArityCheck(typeName, typeArity, typeCheck);

        attachPreprocessor(decoratedTypeCheck, preprocessor);
        typelog.define(typeName, decoratedTypeCheck);
    }

    function subtype(parentTypeName) {
        var defineSubtype = typelog.defineSubtypeOf(parentTypeName);

        return function (typeStr, typeCheck, preprocessor) {
            var typeName = getTypeName(typeStr);
            var typeArity = getArity(typeName, typeStr);
            var decoratedTypeCheck = decorateWithArityCheck(typeName, typeArity, typeCheck);

            attachPreprocessor(decoratedTypeCheck, preprocessor);
            defineSubtype(typeName, decoratedTypeCheck);
        };
    }

    var typeApi = coreTypes(
        parser,
        extend,
        isTypeOf,
        typelog.isType,
        typelog.isSubtypeOf,
        subtype,
        alias,
        typelog.defineDependentOperatorOn);

    var duckTypesModule = duckTypes(
        typelog,
        isTypeOf,
        parser.parseType,
        assembler.assembleType);

    var recursiveTypeModule = recursiveTypes(extend, isTypeOf);

    return {
        alias: enforce(
            'aliasName != typeString ' +
            ':: aliasName:string, ' +
            'typeString:string ' +
            '=> undefined',
            alias),
        buildInputErrorMessage: enforce(
            'validationResult:tuple<' +
            'expectedType:type, ' +
            'actualValue:*' +
            '>, ' +
            'args:array<*>, ' +
            'signatureTree:array<array<object>>, ' +
            'functionName:string ' +
            '=> string',
            buildInputErrorMessage
        ),
        buildOutputErrorMessage: enforce(
            'validationResult:tuple<' +
            'expectedType:type, ' +
            'actualValue:*' +
            '>, ' +
            'args:array<*>, ' +
            'signatureTree:array<array<object>>, ' +
            'functionName:string ' +
            '=> string',
            buildOutputErrorMessage
        ),
        classTypeFactory: enforce(
            'class:function, ' +
            'otherProps:[composite<not<null>, object>] ' +
            '=> function',
            duckTypesModule.classTypeFactory),
        defineClassType: enforce(
            'class:function, ' +
            'otherProps:[composite<not<null>, object>] ' +
            '=> undefined',
            duckTypesModule.defineClassType),
        defineDuckType: enforce(
            'typeName:string, ' +
            'duckTypeDef:object ' +
            '=> undefined',
            duckTypesModule.defineDuckType),
        defineExactDuckType: enforce(
            'typeName:string, ' +
            'duckTypeDef:object ' +
            '=> undefined',
            duckTypesModule.defineExactDuckType),
        defineDependentOperatorOn: enforce(
            'typeName:string => ' +
            'operator:string, operatorCheck:function<' +
            'valueA:*, ' +
            'valueB:*, ' +
            'typeDefinitionA:[object], ' +
            'typeDefinitionB:[object] ' +
            '=> boolean' +
            '> ' +
            '=> undefined',
            typelog.defineDependentOperatorOn),
        defineRecursiveType: enforce(
            'typeName:string, ' +
            'iteratorFactory:function, ' +
            'nodeType:type, ' +
            'typePreprocessor:[function] ' +
            '=> undefined',
            recursiveTypeModule.defineRecursiveType),
        duckTypeFactory: enforce(
            'duckTypeDef:object => function',
            duckTypesModule.duckTypeFactory),
        enforce: enforce(
            'signature:string, ' +
            'functionToEnforce:function, ' +
            'options:[object] ' +
            '=> function',
            enforce),
        enforceArgs: enforce(
            'array<string> => arguments => undefined',
            enforceArgs),
        exactDuckTypeFactory: enforce(
            'duckTypeDef:object => function',
            duckTypesModule.exactDuckTypeFactory),
        extend: enforce(
            'typeName:string, ' +
            'typeCheck:function, ' +
            'preprocessor:[function<string => string>] ' +
            '=> undefined',
            extend),
        isRegisteredDuckType: enforce(
            'typeName:string ' +
            '=> boolean',
            duckTypesModule.isRegisteredDuckType),
        isSubtypeOf: enforce(
            'rootTypeName:string ' +
            '=> typeNameUnderTest:string ' +
            '=> boolean',
            typelog.isSubtypeOf),
        isType: enforce(
            'typeName:string => boolean',
            typelog.isType),
        isTypeOf: enforce(
            'typeToCheck:type ' +
            '=> value:* ' +
            '=> boolean',
            isTypeOf),
        iterateOn: enforce(
            'propertyKey:string ' +
            '=> value:* ' +
            '=> undefined ' +
            '=> *',
            recursiveTypeModule.iterateOn
        ),
        iterateOnArray: enforce(
            'iterationArray:array ' +
            '=> undefined ' +
            '=> *',
            recursiveTypeModule.iterateOnArray
        ),
        recursiveTypeFactory: enforce(
            'iteratorFactory:function, ' +
            'nodeType:type ' +
            '=> valueToCheck:* ' +
            '=> boolean',
            recursiveTypeModule.recursiveTypeFactory),
        registerTypeLevelMacro: enforce(
            'macro:function => undefined',
            parser.registerTypeLevelMacro),
        reportDuckTypeErrors: enforce(
            'duckTypeName:string ' +
            '=> valueToCheck:* ' +
            '=> array<tuple<string, string, *>>',
            duckTypesModule.reportDuckTypeErrors),
        sign: enforce(
            'signature:string, functionToSign:function => function',
            sign),
        subtype: enforce(
            'rootTypeName:string ' +
            '=> subtypeName:string, ' +
            'subtypeCheck:function, ' +
            'preprocessor:[function<string => string>] ' +
            '=> undefined',
            subtype),
        typeChain: enforce(
            'typeName:string => string',
            typelog.getTypeChain),
        verify: enforce(
            'signedFunctionToVerify:function, ' +
            'functionArguments:arguments ' +
            '=> undefined',
            verify),
        verifyValueType: enforce(
            'typeToCheck:type ' +
            '=> value:* ' +
            '=> result:*',
            verifyValueType),
        whichType: enforce(
            'typeNames:array<string> => ' +
            'value:* ' +
            '=> variant<string, null>',
            typeApi.whichType),
        whichVariantType: enforce(
            'variantString:string => ' +
            'value:* ' +
            '=> variant<string, null>',
            typeApi.whichVariantType)
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetBuilder;
}