var signetAssembler = (function () {
    'use strict';
    function hasSubtype(typeDef) {
        return typeDef.subtype && typeDef.subtype.length > 0;
    }

    function buildSubtype(typeDef) {
        return hasSubtype(typeDef) ? '<' + typeDef.subtype.join(';') + '>' : '';
    }

    function prependTypeName(name, typeStr) {
        return typeof name === 'string' ? name + ':' + typeStr : typeStr;
    }

    function addOptionalBrackets(typeStr, isOptional) {
        return isOptional ? '[' + typeStr + ']' : typeStr;
    }

    function getBaseType(typeDef) {
        var typeStr = typeDef.type + buildSubtype(typeDef);
        return addOptionalBrackets(typeStr, typeDef.optional);
    }

    function assembleType(typeDef) {
        var typeStr = getBaseType(typeDef);

        return prependTypeName(typeDef.name, typeStr);
    }

    function buildDependentToken (result, dependent) {
        var output = result !== '' ? result + ', ' : result;
        return output + [dependent.left, dependent.operator, dependent.right].join(' ');
    }

    function buildDependentStr (dependent) {
        return dependent.reduce(buildDependentToken, '') + ' :: ';
    }

    function assembleTypeList(typeList) {
        var typeListStr = typeList.map(assembleType).join(', ');
        var dependentStr = typeList.dependent === null ? '' : buildDependentStr(typeList.dependent);

        return dependentStr + typeListStr;
    }


    function assembleSignature(typeTree) {
        return typeTree.map(assembleTypeList).join(' => ');
    }

    return {
        assembleSignature: assembleSignature,
        assembleType: assembleType
    };
})();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetAssembler;
}

var signetChecker = (function () {
    'use strict';

    return function (registrar) {

        function checkType(typeDef) {
            try {
                return typeof registrar.get(typeDef.type) === 'function';
            } catch (e) {
                return false;
            }
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

function signetParser() {
    'use strict';

    var typeLevelMacros = [];
    var signatureLevelMacros = [];

    function identity(value) {
        return value;
    }

    function throwOnBadMacroResult(result) {
        if (typeof result !== 'string') {
            throw new Error('Macro Error: All macros must return a string; got ' + result + ' of type ' + typeof result);
        }
    }

    function applyMacros(macroSet, typeStr) {
        var result = typeStr;
        var macroLength = macroSet.length;

        for (var i = 0; i < macroLength; i++) {
            result = macroSet[i](result);
            throwOnBadMacroResult(result);
        }

        return result;
    }

    function registerTypeLevelMacro(macro) {
        typeLevelMacros.push(macro);
    }

    function registerSignatureLevelMacro(macro) {
        signatureLevelMacros.push(macro);
    }

    function isDelimiter(symbol) {
        return symbol === ';' || symbol === ',';
    }

    function terminateSubtype(bracketStack, currentChar) {
        return (bracketStack.length === 1 && isDelimiter(currentChar))
            || (currentChar === '>' && bracketStack.length === 0);
    }

    function isStructuralChar(char) {
        return char.match(/[\<\;\s\,]/) !== null;
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

    function getSubtypeData(typeStr) {
        var subtypeToken = typeStr.trim().split('<').slice(1).join('<');
        return subtypeToken.substring(0, subtypeToken.length - 1);
    }

    function isSubtypeSeparator(value) {
        return value === ';' || value === ',';
    }

    function parseSubtype(typeStr) {
        var optionalPattern = /^\[(.*)\]$/
        var subtypeData = getSubtypeData(typeStr.trim().replace(optionalPattern, '$1'));
        return splitOnSymbol(isSubtypeSeparator, subtypeData)
            .map(function (value) { return value.trim(); });
    }

    function parseType(typeStr) {
        var transformedTypeStr = applyMacros(typeLevelMacros, typeStr);

        var typePattern = /^([^:<]+)\:(.+)$/;
        var typeName = transformedTypeStr.replace(typePattern, '$1');
        var rawType = transformedTypeStr.replace(typePattern, '$2');

        return {
            name: typeName === transformedTypeStr ? null : typeName.trim(),
            type: rawType.split('<')[0].replace(/\[|\]/g, '').trim(),
            subtype: parseSubtype(rawType),
            optional: rawType.trim().match(/^\[[^\]]+\]$/) !== null
        };
    }

    function parseDependentMetadataToken(metadataStr) {
        var tokens = metadataStr.trim().split(/\s+/g);

        return {
            operator: tokens[1],
            left: tokens[0],
            right: tokens[2]
        }
    }

    function parseDependentMetadata(metadataStr) {
        return metadataStr.split(/\,\s*/g).map(parseDependentMetadataToken);
    }

    function isComma(symbol) {
        return symbol === ',';
    }

    function isDoubleColon(symbol) {
        return symbol === '::';
    }

    function parseParams(token) {
        var tokenSet = splitOnSymbol(isDoubleColon, token);
        var dependentMetadata = tokenSet.length > 1 ? tokenSet.shift() : null;
        var typeValues = splitOnSymbol(isComma, tokenSet[0]).map(parseType);

        typeValues.dependent = dependentMetadata === null ? null : parseDependentMetadata(dependentMetadata);

        return typeValues;
    }

    function bracketStackFactory() {
        var stack = [];

        function update(symbol) {
            if (symbol === '<') {
                stack.push('<');
            }
            if (symbol === '>') {
                stack.pop();
            }
            if (symbol === '::') {
                stack.length = 0;
            }
        }

        return {
            update: update,
            get length() {
                return stack.length;
            }
        };
    }

    function isSequenceChar(symbol) {
        return symbol === '=' ||
            symbol === '%' ||
            symbol === ':';
    }

    function isSpecialSquence(symbol) {
        return symbol[0] === '%' ||
            symbol === '=>' ||
            symbol === '::';
    }

    function splitOnSymbol(isSplitSymbol, signature) {
        var tokens = [];
        var currentToken = '';
        var currentSymbol = '';
        var bracketStack = bracketStackFactory();

        for (var i = 0; i < signature.length; i++) {
            currentSymbol = signature[i];

            if (bracketStack.length === 0 && currentSymbol === '%') {
                i++;
                currentToken += signature[i];
                continue;
            }
            
            if (isSequenceChar(currentSymbol) && isSpecialSquence(currentSymbol + signature[i + 1])) {
                i++;
                currentSymbol = currentSymbol + signature[i];
            }

            bracketStack.update(currentSymbol);

            if (isSplitSymbol(currentSymbol) && bracketStack.length === 0) {
                tokens.push(currentToken);
                currentToken = '';
                continue;
            }

            currentToken += currentSymbol;
        }

        if (currentToken !== '') {
            tokens.push(currentToken);
        }

        return tokens;
    }

    function isArrow(symbol) {
        return symbol === '=>';
    }

    function parseSignature(signature) {
        var resolvedSignature = applyMacros(signatureLevelMacros, signature);
        return splitOnSymbol(isArrow, resolvedSignature).map(parseParams);
    }

    return {
        parseSignature: parseSignature,
        parseType: parseType,
        registerSignatureLevelMacro: registerSignatureLevelMacro,
        registerTypeLevelMacro: registerTypeLevelMacro
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetParser;
}


var signetRegistrar = (function () {
    'use strict';

    return function () {
        function isTypeOf(type, value) {
            return typeof value === type;
        }

        function isValidTypeName(value) {
            return isTypeOf('string', value) && value.match(/^[^\(\)\<\>\[\]\:\;\=\,\s]+$/) !== null;
        }

        function throwOnBadType(name, predicate) {
            if (!isValidTypeName(name)) {
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

        function get(name) {
            var predicate = registry[name];
            if (typeof predicate === 'undefined') {
                throw new Error('The given type "' + name + '" does not exist');
            }
            return predicate;
        }

        function set(name, predicate) {
            throwOnBadType(name, predicate);

            registry[name] = predicate;
        }

        return {
            get: get,
            set: set
        };
    };

})();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
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
        try {
            return typeof registrar.get(typeName) === 'function';
        } catch (e) {
            return false;
        }
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

    function defineDependentOperatorOn(typeName) {
        var typePred = registrar.get(typeName);

        return function (operator, operation) {
            var operatorDef = {
                operator: operator,
                operation: operation
            };

            setImmutableProperty(typePred, operator, operatorDef);
        }
    }

    function getDependentOperatorOn(typeName) {
        return function (operator) {
            var typePred = registrar.get(typeName);

            if (typeof typePred[operator] === 'object') {
                return typePred[operator];
            } else if (typeName == '*') {
                return null;
            } else {
                return getDependentOperatorOn(typePred.parentTypeName)(operator);
            }
        }
    }

    return {
        define: defineSubtypeOf('*'),
        defineDependentOperatorOn: defineDependentOperatorOn,
        defineSubtypeOf: defineSubtypeOf,
        getDependentOperatorOn: getDependentOperatorOn,
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

    return function (typelog, assembler, parser) {

        function isObjectInstance(value) {
            return typeof value === 'object' && value !== null;
        }

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

        function getValidationState(left, right, operatorDef) {
            var validationState = null;

            if (!operatorDef.operation(left.value, right.value, left.typeNode, right.typeNode)) {
                var typeInfo = [left.name, operatorDef.operator, right.name];
                var typeDef = typeInfo.join(' ');
                var valueInfo = [left.name, '=', left.value, 'and', right.name, '=', right.value];

                validationState = [typeDef, valueInfo.join(' ')];
            }

            return validationState;
        }

        function alwaysFalse() {
            return false;
        }

        function getDependentOperator(typeName, operator) {
            var dependentOperator = typelog.getDependentOperatorOn(typeName)(operator);

            if (dependentOperator === null) {
                dependentOperator = {
                    operator: operator,
                    operation: alwaysFalse
                };
            }

            return dependentOperator;
        }

        function buildTypeObj(typeName) {
            var typeDef = parser.parseType(typeName);
            var isCorrectType = typelog.isTypeOf(typeDef);

            function typeCheck(value) {
                return isCorrectType(value);
            }

            typeCheck.toString = function () {
                return '[function typePredicate]';
            }

            return {
                name: typeName,
                value: typeCheck,
                typeNode: typeDef
            };

        }

        function buildValueObj(value) {
            return {
                name: value,
                value: value,
                typeNode: {}
            }
        }

        function getRightArg(namedArgs, right) {
            var value = namedArgs[right];

            if (typeof value === 'undefined') {
                value = typelog.isType(right) ? buildTypeObj(right) : buildValueObj(right);
            }

            return value;
        }

        function checkDependentTypes(namedArgs) {
            return function (dependent, validationState) {
                var newValidationState = null;

                if (validationState === null) {
                    var left = namedArgs[dependent.left];
                    var right = getRightArg(namedArgs, dependent.right);

                    var operatorDef = getDependentOperator(left.typeNode.type, dependent.operator);

                    newValidationState = getValidationState(left, right, operatorDef);
                }

                return newValidationState === null ? validationState : newValidationState;
            };
        }

        function buildNamedArgs(typeList, argumentList) {
            var result = {};
            var typeLength = typeList.length;
            var typeNode;
            var typeName;

            for (var i = 0; i < typeLength; i++) {
                typeNode = typeList[i];
                typeName = typeNode.name;
                result[typeName] = {
                    name: typeName,
                    value: argumentList[i],
                    typeNode: typeList[i]
                };
            }

            return result;
        }

        function arrayOrDefault (value) {
            var typeOk = Object.prototype.toString.call(value) === '[object Array]';
            return typeOk ? value : [];
        }

        function validateArguments(typeList) {
            var dependentExpressions = arrayOrDefault(typeList.dependent);

            return function (argumentList) {
                var namedArgs = buildNamedArgs(typeList, argumentList);
                var validationState = typeList.length === 0 ? null : validateCurrentValue(typeList, argumentList);

                var checkDependentType = checkDependentTypes(namedArgs);

                dependentExpressions.forEach(function (dependent) {
                    validationState = checkDependentType(dependent, validationState);
                });

                return validationState;
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

function signetDuckTypes(typelog, isTypeOf) {

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

    function getErrorValue(value, typeName) {
        if(typeof duckTypeErrorReporters[typeName] === 'function') {
            return duckTypeErrorReporters[typeName](value);
        }

        return value;
    }

    function getTypeName(objectDef, key) {
        return typeof objectDef[key] === 'string' ? objectDef[key] : objectDef[key].name;
    }

    function buildDuckTypeErrorReporter(definitionPairs, objectDef) {
        return function (value) {
            return definitionPairs.reduce(function (result, typePair) {
                var key = typePair[0];
                var typePredicate = typePair[1];
                var typeName = getTypeName(objectDef, key);

                if (!typePredicate(value[key])) {
                    result.push([key, typeName, getErrorValue(value[key], typeName)]);
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

    return {
        buildDuckTypeErrorChecker: buildDuckTypeErrorReporter,
        defineDuckType: defineDuckType,
        duckTypeFactory: duckTypeFactory,
        reportDuckTypeErrors: reportDuckTypeErrors
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetDuckTypes;
}


function signetCoreTypes(
    parser,
    extend,
    isTypeOf,
    isSignetType,
    isSignetSubtypeOf,
    subtype,
    alias,
    defineDependentOperatorOn) {
    'use strict';

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

        return isSignetSubtypeOf(bTypeName)(aTypeName);
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

        return checkRange;
    }

    function optionsToRangeObject(options) {
        return {
            min: Number(options[0]),
            max: Number(options[1])
        };
    }

    function checkBoundedString(value, range) {
        return range.min <= value.length && value.length <= range.max;
    }

    function optionsToRegex(options) {
        return options.length === 1 ? options[0] : options.join(';');
    }

    function checkFormattedString(value, regex) {
        return value.match(regex) !== null;
    }

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
        return isSignetSubtypeOf(typeA)(typeB) ? -1 : result;
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

    function isVariant(value, options) {
        return options.length === 0 || options.filter(checkValueType).length > 0;

        function checkValueType(validator) {
            return validator(value);
        }
    }

    function checkTaggedUnion(value, options) {
        console.warn('Tagged Union is deprecated, use variant instead.');
        return isVariant(value, options);
    }

    var starTypeDef = parser.parseType('*');

    function isRegisteredType(value) {
        return typeof value === 'function' || isSignetType(parser.parseType(value).type);
    }


    parser.registerTypeLevelMacro(function emptyParamsToStar(value) {
        return /^\(\s*\)$/.test(value.trim()) ? '*' : value;
    });

    parser.registerSignatureLevelMacro(function signatureToFunction(value) {
        var signaturePattern = /(\()((.*\=\>)+(.*))(\))/
        var signatureMatch = signaturePattern.test(value);

        return signatureMatch ? value.replace(signaturePattern, 'function<$2>') : value;
    });

    extend('boolean', isType('boolean'));
    extend('function', isType('function'));
    extend('number', isType('number'));
    extend('object', isType('object'));
    extend('string', isType('string'));
    extend('symbol', isType('symbol'));
    extend('undefined', isType('undefined'));
    extend('null', isNull);
    extend('variant', isVariant, optionsToFunctions);
    extend('taggedUnion', checkTaggedUnion, optionsToFunctions);

    subtype('object')('array', checkArray);
    subtype('object')('regexp', isRegExp);
    subtype('number')('int', checkInt);
    subtype('number')('bounded', rangeBuilder(), optionsToRangeObject);
    subtype('int')('boundedInt', rangeBuilder(), optionsToRangeObject);
    subtype('string')('boundedString', checkBoundedString, optionsToRangeObject);
    subtype('string')('formattedString', checkFormattedString, optionsToRegex);
    subtype('array')('tuple', checkTuple, optionsToFunctions);
    subtype('array')('unorderedProduct', isUnorderedProduct);
    subtype('object')('arguments', checkArgumentsObject);

    alias('typeValue', 'variant<string, function>');
    subtype('typeValue')('type', isRegisteredType);

    alias('any', '*');
    alias('void', '*');

    alias('leftBounded', 'bounded<_, Infinity>');
    alias('rightBounded', 'bounded<-Infinity, _>');
    
    alias('leftBoundedInt', 'bounded<_, Infinity>');
    alias('rightBoundedInt', 'bounded<-Infinity, _>');

    defineDependentOperatorOn('number')('>', greater);
    defineDependentOperatorOn('number')('<', less);
    defineDependentOperatorOn('number')('=', equal);
    defineDependentOperatorOn('number')('>=', not(less));
    defineDependentOperatorOn('number')('<=', not(greater));
    defineDependentOperatorOn('number')('!=', not(equal));

    defineDependentOperatorOn('string')('=', equal);
    defineDependentOperatorOn('string')('!=', not(equal));

    defineDependentOperatorOn('object')('=', objectsAreEqual);
    defineDependentOperatorOn('object')('!=', not(objectsAreEqual));
    defineDependentOperatorOn('object')(':>', propertySuperSet);
    defineDependentOperatorOn('object')(':<', propertySubSet);
    defineDependentOperatorOn('object')(':=', propertyCongruence);
    defineDependentOperatorOn('object')(':!=', not(propertyCongruence));

    defineDependentOperatorOn('variant')('isTypeOf', isSameType);
    defineDependentOperatorOn('variant')('=:', isSameType);
    defineDependentOperatorOn('variant')('<:', isSubtypeOf);
    defineDependentOperatorOn('variant')('>:', isSupertypeOf);

    return {
        whichType: whichType,
        whichVariantType: whichVariantType
    };

}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetCoreTypes;
}

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
        defineDependentOperatorOn: enforce(
            'typeName:string => operator:string, operatorCheck:function => undefined',
            typelog.defineDependentOperatorOn),
        enforce: enforce(
            'signature:string, functionToEnforce:function, options:[object] => function',
            enforce),
        extend: enforce(
            'typeName:string, typeCheck:function, preprocessor:[function] => undefined',
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
            array<tuple<string, string; *>>',
            duckTypesModule.reportDuckTypeErrors),
        sign: enforce(
            'signature:string, functionToSign:function => function',
            sign),
        subtype: enforce(
            'rootTypeName:string => \
            subtypeName:string, subtypeCheck:function, preprocessor:[function] => \
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

        return signetBuilder(
            typelog, 
            validator, 
            checker, 
            parser, 
            assembler, 
            duckTypes,
            coreTypes);
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = buildSignet;
    }
    
    return buildSignet();
})();

