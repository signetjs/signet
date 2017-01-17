var signetAssembler = (function () {
    'use strict';
    function hasSubtype(typeDef) {
        return typeDef.subtype && typeDef.subtype.length > 0;
    }

    function buildSubtype(typeDef) {
        return hasSubtype(typeDef) ? '<' + typeDef.subtype.join(';') + '>' : '';
    }

    function assembleType(typeDef) {
        var typeStr = typeDef.type + buildSubtype(typeDef);

        return typeDef.optional ? '[' + typeStr + ']' : typeStr;
    }

    function assembleTypeList(typeList) {
        return typeList.map(assembleType).join(', ');
    }

    function assembleSignature(typeTree) {
        return typeTree.map(assembleTypeList).join(' => ');
    }

    return {
        assembleSignature: assembleSignature,
        assembleType: assembleType
    };
})();

if (typeof module !== 'udefined' && typeof module.exports !== 'undefined') {
    module.exports = signetAssembler;
}

var signetChecker = (function () {
    'use strict';

    return function (registrar) {

        function checkType(typeDef) {
            return typeof registrar.get(typeDef.type) === 'function';
        }

        function concat(resultList, list) {
            return resultList.concat(list);
        }

        function not(predicate) {
            return function (value) {
                return !predicate(value);
            }
        }

        function checkSignature(ast) {
            var failedTypes = ast.reduce(concat, [])
                .filter(not(checkType));

            return failedTypes.length > 0 ? failedTypes : null;
        }

        return {
            checkSignature: checkSignature,
            checkType: checkType
        };

    }

})();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetChecker;
}

var signetParser = (function () {
    'use strict';

    function terminateSubtype(bracketStack, currentChar) {
        return (bracketStack.length === 1 && currentChar === ';')
            || (currentChar === '>' && bracketStack.length === 0);
    }

    function isStructuralChar(char) {
        return char.match(/[\<\;\s]/) !== null;
    }

    function captureChar(bracketStack, currentChar) {
        return bracketStack.length > 1
            || (bracketStack.length === 0 && currentChar === '>')
            || (bracketStack.length > 0 && !isStructuralChar(currentChar));
    }

    function updateStack(bracketStack, currentChar) {
        if (currentChar === '<') {
            bracketStack.push(currentChar);
        } else if (currentChar === '>') {
            bracketStack.pop();
        }
    }

    function buildAppender(bracketStack) {
        return function (subtypeStr, currentChar) {
            var capture = captureChar(bracketStack, currentChar);
            return capture ? subtypeStr + currentChar : subtypeStr;
        };
    }

    function updateSubtypeInfo(bracketStack, subtypeInfo) {
        return function (subtypeStr, currentChar) {
            if (terminateSubtype(bracketStack, currentChar)) {
                subtypeInfo.push(subtypeStr);
            }
        }
    }

    function getUpdatedSubtypeStr(bracketStack, appendOnRule) {
        return function (subtypeStr, currentChar) {
            var terminate = terminateSubtype(bracketStack, currentChar);
            return terminate ? '' : appendOnRule(subtypeStr, currentChar);
        }
    }

    function parseSubtype(typeStr) {
        var subtypeStr = '';
        var subtypeInfo = [];
        var bracketStack = [];

        var getSubtypeStr = getUpdatedSubtypeStr(bracketStack, buildAppender(bracketStack));
        var updateSubtypes = updateSubtypeInfo(bracketStack, subtypeInfo);

        typeStr.split('').forEach(function (currentChar) {
            updateStack(bracketStack, currentChar);
            updateSubtypes(subtypeStr, currentChar);

            subtypeStr = getSubtypeStr(subtypeStr, currentChar);
        });

        return subtypeInfo;
    }

    function parseType(typeStr) {
        var typePattern = /^([^\:]+)\:(.+)$/;
        var typeName = typeStr.replace(typePattern, '$1');
        var rawType = typeStr.replace(typePattern, '$2');

        return {
            name: typeName === typeStr ? null : typeName.trim(),
            type: rawType.split('<')[0].replace(/\[|\]/g, '').trim(),
            subtype: parseSubtype(rawType),
            optional: rawType.match(/^\[[^\]]+\]$/) !== null
        };
    }

    function parseParams (token){
        return token.split(/\s*\,\s*/).map(parseType);
    }

    function parseSignature(signature) {
        var parameterTokens = signature.split(/\s*\=\>\s*/);

        return parameterTokens.map(parseParams);
    }

    return {
        parseSignature: parseSignature,
        parseType: parseType
    };
})();

if(typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetParser;
}


var signetRegistrar = (function () {
    'use strict';

    return function() {
        function isTypeOf (type, value) {
            return typeof value === type;
        }

        function isValidTypeName (value) {
            return isTypeOf('string', value) && value.match(/^[^\(\)\<\>\[\]\:\;\=\,\s]+$/) !== null;
        }

        function throwOnBadType (name, predicate) {
            if(!isValidTypeName(name)){
                throw new Error('Invalid type name: ' + name);
            }

            if (!isTypeOf('undefined', registry[name])) {
                throw new Error('Type already registered with name ' + name);
            }

            if (!isTypeOf('function', predicate)) {
                throw new Error('Type predicate parameter must be a function');
            }
        }

        // Core registry code

        var registry = {};

        function get (name) {
            return registry[name];
        }

        function set (name, predicate){
            throwOnBadType(name, predicate);

            registry[name] = predicate;
        }

        return {
            get: get,
            set: set
        };
    };

})();

if(typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetRegistrar;
}


var signetTypelog = function (registrar, parser) {
    'use strict';

    registrar.set('*', function () { return true; });

    function validateOptionalType(typeDef) {
        return function (value) {
            return typeDef.optional && typeof value === 'undefined';
        };
    }

    function validateType(typeDef) {
        var validateOptional = validateOptionalType(typeDef);

        return function (value) {
            return registrar.get(typeDef.type)(value, typeDef.subtype) || validateOptional(value);
        };
    }


    function setImmutableProperty(obj, name, value) {
        Object.defineProperty(obj, name, {
            value: value,
            writeable: false
        });
    }

    function defineSubtypeOf(parentName) {
        return function (childName, predicate) {
            setImmutableProperty(predicate, 'parentTypeName', parentName);
            registrar.set(childName, predicate);
        };
    }

    function isType(typeName) {
        return typeof registrar.get(typeName) === 'function';
    }

    function isSubtypeOf(parentName) {
        return function (childName) {
            var parentTypeName = registrar.get(childName).parentTypeName;

            var hasNoParent = typeof parentTypeName === 'undefined';
            var isParentMatch = parentTypeName === parentName;

            return hasNoParent || isParentMatch ? isParentMatch : isSubtypeOf(parentName)(parentTypeName);
        };
    }

    function isTypeOf(typeDef) {
        var processedTypeDef = preprocessSubtypeData(typeDef);

        return function (value) {
            var predicate = registrar.get(typeDef.type);
            var parentType = predicate.parentTypeName;
            var isDone = typeof parentType !== 'undefined';

            return isDone ? verifyType(processedTypeDef, parentType, value) : true;
        };
    }

    function identity(value) {
        return value;
    }

    function preprocessSubtypeData(typeDef) {
        var predicate = registrar.get(typeDef.type);
        var preprocess = typeof predicate.preprocess === 'function' ? predicate.preprocess : identity;

        return {
            name: typeDef.name,
            type: typeDef.type,
            subtype: preprocess(typeDef.subtype),
            originalSubtype: typeDef.subtype,
            optional: typeDef.optional
        };
    }

    function verifyType(typeDef, parentType, value) {
        var parentTypeDef = parser.parseType(parentType);
        parentTypeDef.subtype.concat(typeDef.originalSubtype);

        return isTypeOf(parentTypeDef)(value) && validateType(typeDef)(value);

    }

    function getTypeChain(typeName) {
        var predicate = registrar.get(typeName);

        return predicate.parentTypeName !== undefined ?
            getTypeChain(predicate.parentTypeName) + ' -> ' + typeName :
            typeName;
    }


    return {
        define: defineSubtypeOf('*'),
        defineSubtypeOf: defineSubtypeOf,
        getTypeChain: getTypeChain,
        isType: isType,
        isTypeOf: isTypeOf,
        isSubtypeOf: isSubtypeOf
    };
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetTypelog;
}

var signetValidator = (function () {
    'use strict';

    function first(list) {
        return list[0];
    }

    function rest(list) {
        return list.slice(1);
    }

    return function (typelog, assembler) {

        function validateOptional(typeDef, argument, typeList) {
            return typeDef.optional && (typeList.length > 1 || typeof argument === 'undefined');
        }

        function validateType(typeDef) {
            var hasTypeCheck = typeof typeDef.typeCheck === 'function';
            return hasTypeCheck ? typeDef.typeCheck : typelog.isTypeOf(typeDef);
        }

        function validateCurrentValue(typeList, argumentList) {
            var typeDef = first(typeList);
            var argument = first(argumentList);

            var isValidated = validateType(typeDef)(argument);
            var nextArgs = !isValidated ? argumentList : rest(argumentList);

            var validateNext = validateArguments(rest(typeList));
            var accepted = isValidated || validateOptional(typeDef, argument, typeList);

            return accepted ? validateNext(nextArgs) : [assembler.assembleType(typeDef), argument];
        }

        function validateArguments(typeList) {
            return function (argumentList) {
                return typeList.length === 0 ? null : validateCurrentValue(typeList, argumentList);
            };
        }

        return {
            validateArguments: validateArguments,
            validateType: validateType
        };
    };

})();

if (typeof module !== 'undefined' && typeof module.exports !== undefined) {
    module.exports = signetValidator;
}

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

var signet = (function () {
    'use strict';

    function buildSignet() {
        var assembler = signetAssembler;
        var parser = signetParser;
        var registrar = signetRegistrar();
        var checker = signetChecker(registrar);
        var typelog = signetTypelog(registrar, parser);
        var validator = signetValidator(typelog, assembler);

        return signetBuilder(typelog, validator, checker, parser, assembler);
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = buildSignet;
    }
    
    return buildSignet();
})();

