function signetBuilder(
    typelog,
    validator,
    checker,
    parser,
    assembler,
    duckTypes,
    coreTypes) {

    'use strict';

    var duckTypesModule = duckTypes(typelog, isTypeOf);
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
        var typeDef = parser.parseType(typeStr);
        var typeAlias = hasPlaceholder(typeStr) ? buildPartialTypeAlias(typeStr) : buildTypeAlias(typeDef);

        typelog.define(key, typeAlias);
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

    function throwEvaluationError(valueInfo, prefixMixin, functionName) {
        var valueType = typeof valueInfo[1];

        var errorMessage = functionName + ' expected a ' + prefixMixin + 'value of type ' +
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

    function throwInputError(validationResult, inputErrorBuilder, args, signatureTree, functionName) {
        if (typeof inputErrorBuilder === 'function') {
            throw new Error(inputErrorBuilder(validationResult, args, signatureTree, functionName));
        } else {
            throwEvaluationError(validationResult, '', functionName);
        }
    }

    function throwOutputError(validationResult, outputErrorBuilder, args, signatureTree, functionName) {
        if (typeof outputErrorBuilder === 'function') {
            throw new Error(outputErrorBuilder(validationResult, args, signatureTree, functionName));
        } else {
            throwEvaluationError(validationResult, 'return ', functionName);
        }
    }

    function getFunctionName(fn) {
        return fn.name === '' ? 'Anonymous' : fn.name;
    }

    function buildEnforcer(signatureTree, fn, options) {
        var functionName = getFunctionName(fn);
        return function () {
            var args = Array.prototype.slice.call(arguments, 0);
            var validationResult = validator.validateArguments(signatureTree[0])(args);

            if (validationResult !== null) {
                throwInputError(validationResult, options.inputErrorBuilder, args, signatureTree, functionName);
            }

            var signatureIsCurried = signatureTree.length > 2;
            var returnType = !signatureIsCurried ? last(signatureTree)[0] : functionTypeDef;
            var returnTypeStr = assembler.assembleType(returnType);

            var result = fn.apply(this, args);

            if (!validator.validateType(returnType)(result)) {
                throwOutputError([returnTypeStr, result], options.outputErrorBuilder, args, signatureTree, functionName);
            }

            return !signatureIsCurried ? result : enforceOnTree(signatureTree.slice(1), result, options);
        };
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
        return function enforceDecorator(args) {
            var args = Array.prototype.slice.call(arguments, 0);
            return enforcer.apply(this, args);
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

    function attachPreprocessor(typeCheck, preprocessor) {
        if (typeof preprocessor === 'function') {
            typeCheck.preprocess = preprocessor;
        }
    }

    function extend(typeName, typeCheck, preprocessor) {
        attachPreprocessor(typeCheck, preprocessor);
        typelog.define(typeName, typeCheck);
    }

    function subtype(parentTypeName) {
        var defineSubtype = typelog.defineSubtypeOf(parentTypeName);

        return function (typeName, typeCheck, preprocessor) {
            attachPreprocessor(typeCheck, preprocessor);
            defineSubtype(typeName, typeCheck);
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

    return {
        alias: enforce(
            'aliasName != typeString :: aliasName:string, typeString:string => undefined',
            alias),
        duckTypeFactory: enforce(
            'duckTypeDef:object => function',
            duckTypesModule.duckTypeFactory),
        defineDuckType: enforce(
            'typeName:string, duckTypeDef:object => undefined',
            duckTypesModule.defineDuckType),
        defineExactDuckType: enforce(
            'typeName:string, duckTypeDef:object => undefined',
            duckTypesModule.defineExactDuckType),
        defineDependentOperatorOn: enforce(
            'typeName:string => \
            operator:string, operatorCheck:function<*, *, [object], [object] => boolean> => \
            undefined',
            typelog.defineDependentOperatorOn),
        enforce: enforce(
            'signature:string, functionToEnforce:function, options:[object] => function',
            enforce),
        exactDuckTypeFactory: enforce(
            'duckTypeDef:object => function',
            duckTypesModule.exactDuckTypeFactory),
        extend: enforce(
            'typeName:string, typeCheck:function, preprocessor:[function<string => string>] => undefined',
            extend),
        isSubtypeOf: enforce(
            'rootTypeName:string => typeNameUnderTest:string => boolean',
            typelog.isSubtypeOf),
        isType: enforce(
            'typeName:string => boolean',
            typelog.isType),
        isTypeOf: enforce(
            'typeToCheck:type => value:* => boolean',
            isTypeOf),
        registerTypeLevelMacro: enforce(
            'macro:function => undefined',
            parser.registerTypeLevelMacro),
        reportDuckTypeErrors: enforce(
            'duckTypeName:string => \
            valueToCheck:object => \
            array<tuple<string, string, *>>',
            duckTypesModule.reportDuckTypeErrors),
        sign: enforce(
            'signature:string, functionToSign:function => function',
            sign),
        subtype: enforce(
            'rootTypeName:string => \
            subtypeName:string, subtypeCheck:function, preprocessor:[function<string => string>] => \
            undefined',
            subtype),
        typeChain: enforce(
            'typeName:string => string',
            typelog.getTypeChain),
        verify: enforce(
            'signedFunctionToVerify:function, functionArguments:arguments => undefined',
            verify),
        whichType: enforce(
            'typeNames:array<string> => value:* => variant<string, null>',
            typeApi.whichType),
        whichVariantType: enforce(
            'variantString:string => value:* => variant<string, null>',
            typeApi.whichVariantType)
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetBuilder;
}