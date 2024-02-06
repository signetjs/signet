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

    function getColonPosition(typeStr) {
        var colonPosition = -1;
        var lastChar = '';

        for (var i = 0; i < typeStr.length && lastChar !== '<' && colonPosition === -1; i++) {
            lastChar = typeStr[i];
            if (lastChar === ':') {
                colonPosition = i;
            }
        }

        return colonPosition;
    }

    function typeParser(typeStr) {
        var transformedTypeStr = applyMacros(typeLevelMacros, typeStr);

        return {
            type: transformedTypeStr.split('<')[0].replace(/\[|\]/g, '').trim(),
            subtype: parseSubtype(transformedTypeStr),
            optional: transformedTypeStr.trim().match(/^\[[^\]]+\]$/) !== null
        };
    }

    function isObjectInstance(value) {
        return typeof value === 'object' && value !== null;
    }

    function isArray(value) {
        return isObjectInstance(value)
            && Object.prototype.toString.call(value) === '[object Array]';
    }

    function copyArray(values) {
        var result = [];
        for (var i = 0; i < values.length; i++) {
            result.push(copyObjectOrReturn(values[i]));
        }

        result.dependent = isArray(values.dependent)
            ? copyArray(values.dependent)
            : values.dependent;

        return result;
    }

    function copyObjectOrReturn(value) {
        if (isArray(value)) {
            return copyArray(value);
        } else if (isObjectInstance(value)) {
            return copyProps(value);
        } else {
            return value;
        }
    }

    function copyProps(obj) {
        var keys = Object.keys(obj);
        var result = {};

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = obj[key];

            result[key] = copyObjectOrReturn(value);
        }

        return result;
    }

    function copyMemoizerFactory(parser) {
        var memoizedTypes = {};

        return function (typeStr) {
            var parsedType = memoizedTypes[typeStr];

            if (typeof parsedType === 'undefined') {
                parsedType = parser(typeStr);
                memoizedTypes[typeStr] = parsedType;
            }

            return isArray(parsedType) ? copyArray(parsedType) : copyProps(parsedType);
        }
    }

    var memoizedTypeParser = copyMemoizerFactory(typeParser);

    function parseType(typeStr) {
        var colonPosition = typeStr.indexOf(':') > -1 ? getColonPosition(typeStr) : -1;

        var typeName = colonPosition === -1 ? null : typeStr.substring(0, colonPosition).trim();
        var rawType = typeStr.substring(colonPosition + 1);

        var parsedType = memoizedTypeParser(rawType);

        parsedType.name = typeName;

        return parsedType;
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

    function signatureParser(signature) {
        var resolvedSignature = applyMacros(signatureLevelMacros, signature);
        return splitOnSymbol(isArrow, resolvedSignature).map(parseParams);
    }

    var parseSignature = copyMemoizerFactory(signatureParser);

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


var signetTypelog = function (registrar) {
    'use strict';

    registrar.set('*', function () { return true; });

    function validateOptionalType(typeDef) {
        return function (value) {
            return typeDef.optional && typeof value === 'undefined';
        };
    }

    function validateType(typeDef) {
        var validateOptional = validateOptionalType(typeDef);
        var typePredicate = typeDef.predicate;

        return function (value) {
            return typePredicate(value, typeDef.subtype) 
                || validateOptional(value);
        };
    }


    function setImmutableProperty(obj, name, value) {
        Object.defineProperty(obj, name, {
            value: value,
            writeable: false
        });
    }

    function buildSubtypeCheck(parentTypeName, parentSubtypeCheck) {
        return function (typeName) {
            return parentTypeName === typeName || parentSubtypeCheck(typeName);
        }
    }

    function buildTypePredicate(parentPredicate, childPredicate) {
        return function (value, options) {
            return parentPredicate(value, []) && childPredicate(value, options);
        }
    }

    function merge(destination, source) {
        return Object
            .keys(source)
            .reduce(function (result, key){
                result[key] = source[key];
                return result
            }, destination);
    }

    function alwaysFalse () { return false; }

    function getSubtypeCheck(predicate) {
        return typeof predicate.isSubtypeOf === 'function'
            ? predicate.isSubtypeOf
            : alwaysFalse;
    }

    function defineSubtypeOf(parentName) {
        var parentPredicate = registrar.get(parentName);
        var parentSubtypeCheck = getSubtypeCheck(parentPredicate);

        return function (childName, childPredicate) {
            var typePredicate = buildTypePredicate(parentPredicate, childPredicate);
            var isSubtypeOfParent = buildSubtypeCheck(parentName, parentSubtypeCheck);

            merge(typePredicate, childPredicate);
            setImmutableProperty(typePredicate, 'parentTypeName', parentName);
            setImmutableProperty(typePredicate, 'isSubtypeOf', isSubtypeOfParent);

            registrar.set(childName, typePredicate);
        };
    }

    function isType(typeName) {
        try {
            return typeof registrar.get(typeName) === 'function';
        } catch (e) {
            return false;
        }
    }

    function isSubtypeOfBuilder(parentName) {
        return memoize(function (childName) {
            var subtypeCheck = registrar.get(childName).isSubtypeOf;
            return subtypeCheck(parentName);
        });
    }

    var isSubtypeOf = memoize(isSubtypeOfBuilder);

    function memoize(action) {
        var memoStore = {};

        return function (value) {
            var key = JSON.stringify(value);

            if(typeof memoStore[key] === 'undefined') {
                memoStore[key] = action(value);
            }

            return memoStore[key];
        }
    }

    function isTypeOfFactory(typeDef) {
        var processedTypeDef = preprocessSubtypeData(typeDef);
        
        return function (value) {
            return validateType(processedTypeDef)(value);
        };
    }

    var isTypeOf = memoize(isTypeOfFactory);

    function identity(value) {
        return value;
    }

    function preprocessSubtypeData(typeDef) {
        var predicate = registrar.get(typeDef.type);
        var preprocess = typeof predicate.preprocess === 'function' ? predicate.preprocess : identity;
        var typeDefClone = merge({}, typeDef);

        typeDefClone.subtype = preprocess(typeDef.subtype);
        typeDefClone.predicate = predicate;

        return typeDefClone;
    }

    function getTypeChain(typeName) {
        var predicate = registrar.get(typeName);

        return predicate.parentTypeName !== undefined
            ? getTypeChain(predicate.parentTypeName) + ' -> ' + typeName
            : typeName;
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

        function getValidationState(left, right, operatorDef, dependent) {
            var validationState = null;

            if (!operatorDef.operation(left.value, right.value, left.typeNode, right.typeNode, dependent)) {
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

        function getRightArg(namedArgs, right) {
            var value = namedArgs[right];

            if (typeof value === 'undefined' && typelog.isType(right)) {
                value = buildTypeObj(right);
            }

            return value;
        }

        function checkDependentTypes(namedArgs) {
            return function (dependent, validationState) {
                dependent.leftTokens = dependent.left.split(':');
                dependent.rightTokens = dependent.right.split(':');

                var leftName = dependent.leftTokens[0];
                var left = namedArgs[leftName];
                var rightName = dependent.rightTokens[0];
                var right = getRightArg(namedArgs, rightName);

                var newValidationState = null;

                var namedValuesExist =
                    typeof left !== 'undefined'
                    && typeof right !== 'undefined';

                if (validationState === null && namedValuesExist) {
                    var operatorDef = getDependentOperator(left.typeNode.type, dependent.operator);

                    newValidationState = getValidationState(left, right, operatorDef, dependent);
                }

                return newValidationState === null ? validationState : newValidationState;
            };
        }

        function buildEnvironmentTable(typeList, argumentList, environment) {
            var result = typeof environment === 'undefined' ? {} : environment;
            var typeLength = typeList.length;
            var typeNode;
            var typeName;

            for (var i = 0; i < typeLength; i++) {
                typeNode = typeList[i];
                typeName = typeNode.name;

                if (typeName === null) {
                    continue;
                }

                if (typeof result[typeName] !== 'undefined') {
                    var errorMessage = 'Signet evaluation error: '
                        + 'Cannot overwrite value in existing variable: "'
                        + typeName + '"';
                    throw new Error(errorMessage);
                }

                result[typeName] = {
                    name: typeName,
                    value: argumentList[i],
                    typeNode: typeList[i]
                };
            }

            return result;
        }

        function arrayOrDefault(value) {
            var typeOk = Object.prototype.toString.call(value) === '[object Array]';
            return typeOk ? value : [];
        }

        function validateArguments(typeList, environment) {
            var dependentExpressions = arrayOrDefault(typeList.dependent);

            return function (argumentList) {
                var startingEnvironment = typeof environment === 'undefined'
                    ? typeList.environment
                    : environment;

                var environmentTable = buildEnvironmentTable(typeList, argumentList, startingEnvironment);
                var checkDependentType = checkDependentTypes(environmentTable);

                var validationState = typeList.length === 0 ? null : validateCurrentValue(typeList, argumentList);


                dependentExpressions.forEach(function (dependent) {
                    validationState = checkDependentType(dependent, validationState);
                });

                return validationState;
            };
        }

        return {
            validateArguments: validateArguments,
            validateType: validateType,
            buildEnvironment: buildEnvironmentTable
        };
    };

})();

if (typeof module !== 'undefined' && typeof module.exports !== undefined) {
    module.exports = signetValidator;
}

function signetDuckTypes(typelog, isTypeOf, parseType, assembleType) {

    var duckTypeErrorReporters = {};

    function defineDuckType(typeName, objectDef) {
        var duckType = buildDuckType(objectDef);
        var duckTypeErrorReporter = buildDuckTypeErrorReporter(objectDef);

        typelog.defineSubtypeOf('object')(typeName, duckType);
        duckTypeErrorReporters[typeName] = duckTypeErrorReporter;
    }

    function getValueType(propertyValue) {
        var propertyType = typeof propertyValue;
        return isTypeOf('array')(propertyValue)
            ? 'array'
            : propertyType;
    }

    function buildDuckTypeObject(propertyList, baseObject) {
        return propertyList.reduce(function (result, key) {
            if (key !== 'constructor') {
                var propertyValue = baseObject[key];
                var propertyType = getValueType(propertyValue);

                result[key] = propertyType;
            }

            return result
        }, {});
    }

    function isPrototypalObject(value) {
        return typeof value.prototype === 'object';
    }

    function throwIfNotPrototypalObject(value) {
        if (!isPrototypalObject(value)) {
            var message = "Function defineClassType expected a prototypal object or class, but got a value of type " + typeof value;
            throw new TypeError(message);
        }
    }

    function mergeTypeProps(destinationObject, propsObject) {
        Object.keys(propsObject).forEach(function (key) {
            if (isTypeOf('not<undefined>')(destinationObject[key])) {
                var message = 'Cannot reassign property ' + key + ' on duck type object';
                throw new Error(message);
            }

            destinationObject[key] = propsObject[key];
        });
    }

    function getDuckTypeObject(prototypalObject, otherProps) {
        throwIfNotPrototypalObject(prototypalObject);

        var prototype = prototypalObject.prototype;

        var propertyList = Object.getOwnPropertyNames(prototype);
        var duckTypeObject = buildDuckTypeObject(propertyList, prototype);
        
        if (isTypeOf('composite<not<null>, object>')(otherProps)) {
            mergeTypeProps(duckTypeObject, otherProps);
        }

        return duckTypeObject
    }

    function defineClassType(prototypalObject, otherProps) {
        var className = prototypalObject.name;
        var duckTypeObject = getDuckTypeObject(prototypalObject, otherProps)

        defineDuckType(className, duckTypeObject);
    }

    function classTypeFactory(prototypalObject, otherProps) {
        var duckTypeObject = getDuckTypeObject(prototypalObject, otherProps);

        return duckTypeFactory(duckTypeObject);
    }

    function getErrorValue(value, typeName) {
        if (typeof duckTypeErrorReporters[typeName] === 'function') {
            return duckTypeErrorReporters[typeName](value);
        }

        return value;
    }

    var isString = isTypeOf('string');

    function getTypeName(objectDef, key) {
        return typeof objectDef[key] === 'string' ? objectDef[key] : objectDef[key].name;
    }

    function buildTypeResolvedDefinition(keys, objectDef) {
        var result = {};

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var typeValue = objectDef[key];

            result[key] = isString(typeValue)
                ? assembleType(parseType(typeValue))
                : typeValue
        }

        return result;
    }

    function isObjectInstance(value) {
        return typeof value === 'object' && value !== null;
    }

    function passThrough(result) {
        return result;
    }

    function buildTestAndReport(key, typeName, typePredicate) {
        return function (result, value) {
            if (!typePredicate(value[key])) {
                result.push([key, typeName, getErrorValue(value[key], typeName)]);
            }

            return result;
        };
    }

    function combineReporters(reporter1, reporter2) {
        return function (result, value) {
            result = reporter1(result, value);
            return reporter2(result, value);
        };
    }

    function buildDuckTypeReporter(keys, objectDef, typeResolvedDefinition) {
        var testAndReport = passThrough;

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var typePredicate = isTypeOf(objectDef[key]);
            var typeName = getTypeName(typeResolvedDefinition, key);

            var currentReporter = buildTestAndReport(key, typeName, typePredicate);
            testAndReport = combineReporters(testAndReport, currentReporter);
        }

        return function (value) {
            return testAndReport([], value);
        };
    }

    function buildDuckTypeErrorReporter(objectDef) {
        var keys = Object.keys(objectDef);
        var typeResolvedDefinition = buildTypeResolvedDefinition(keys, objectDef);
        var duckTypeReporter = buildDuckTypeReporter(keys, objectDef, typeResolvedDefinition);

        return function (value) {
            if (!isObjectInstance(value)) {
                return [['badDuckTypeValue', 'object', value]]
            }

            return duckTypeReporter(value);
        };
    }

    var isDuckTypeCheckable = isTypeOf('composite<not<null>, variant<object, function>>')


    function alwaysTrue() { return true; }

    function buildPropCheck(propCheck, key, type) {
        var typeCheck = isTypeOf(type);

        if(typeof typeCheck !== 'function') {
            typeCheck = buildDuckType(type);
        }

        return function (obj) {
            return typeCheck(obj[key]) && propCheck(obj);
        }
    }

    function buildDuckType(definition) {
        var keys = Object.keys(definition);
        var typeCheck = alwaysTrue;

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            typeCheck = buildPropCheck(typeCheck, key, definition[key])
        }

        return function (obj) {
            return isDuckTypeCheckable(obj) && typeCheck(obj);
        }
    }

    function duckTypeFactory(objectDef) {
        return buildDuckType(objectDef);
    }

    function reportDuckTypeErrors(typeName) {
        var errorChecker = duckTypeErrorReporters[typeName];

        if (typeof errorChecker === 'undefined') {
            throw new Error('No duck type "' + typeName + '" exists.');
        }

        return function (value) {
            return errorChecker(value);
        }
    }

    function exactDuckTypeFactory(objectDef) {
        var propertyLength = Object.keys(objectDef).length;
        var duckType = duckTypeFactory(objectDef);

        return function (value) {
            return propertyLength === Object.keys(value).length && duckType(value);
        };
    }

    function defineExactDuckType(typeName, objectDef) {
        var duckType = exactDuckTypeFactory(objectDef);
        var duckTypeErrorReporter = buildDuckTypeErrorReporter(objectDef);

        typelog.defineSubtypeOf('object')(typeName, duckType);
        duckTypeErrorReporters[typeName] = duckTypeErrorReporter;

    }

    function isRegisteredDuckType(typeName) {
        return typeof duckTypeErrorReporters[typeName] === 'function';
    }

    return {
        buildDuckTypeErrorChecker: buildDuckTypeErrorReporter,
        classTypeFactory: classTypeFactory,
        defineClassType: defineClassType,
        defineDuckType: defineDuckType,
        defineExactDuckType: defineExactDuckType,
        duckTypeFactory: duckTypeFactory,
        exactDuckTypeFactory: exactDuckTypeFactory,
        isRegisteredDuckType: isRegisteredDuckType,
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

    function compareSubsetProps(a, b) {
        var keys = Object.keys(b);
        var keyLength = keys.length;
        var compareOk = true;

        for (var i = 0; i < keyLength && compareOk; i++) {
            var key = keys[i];
            compareOk = a[key] === b[key];
        }

        return compareOk;
    }

    function objectsAreEqual(a, b) {
        if (isNull(a) || isNull(b) || a === b) { return a === b; }

        var objAKeys = Object.keys(a);
        var keyLengthEqual = objAKeys.length === Object.keys(b).length;

        return !keyLengthEqual ? false : compareSubsetProps(a, b);
    }

    function propertySuperSet(a, b) {
        var keyLengthOk = !(Object.keys(a).length < Object.keys(b).length);
        return keyLengthOk && compareSubsetProps(a, b);
    }

    function propertySubSet(a, b) {
        return propertySuperSet(b, a);
    }

    function propertyCongruence(a, b) {
        var keyLengthOk = Object.keys(a).length === Object.keys(b).length;
        return keyLengthOk && compareSubsetProps(a, b);
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

    function find(predicate, values) {
        var arrayLength = values.length;
        var result = null;

        for (var i = 0; i < arrayLength; i++) {
            if (predicate(values[i])) {
                result = values[i];
                break;
            }
        }

        return result;
    }

    function whichType(typeStrings) {
        return function (value) {
            function isMatch(typeString) {
                return isTypeOf(typeString)(value);
            }

            var result = find(isMatch, typeStrings);
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

    // function typeImplication(a, b, aType, bType) {
        
    // }

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

    function isFinite(value) {
        return Math.abs(value) !== Infinity;
    }

    var isNaN = typeof Number.isNaN === 'undefined'
        ? function (value) { return value !== value; }
        : function (value) { return Number.isNaN(value); };

    function isNumber(value) {
        return typeof value === 'number' && !isNaN(value);
    }

    function isBigInt (value) {
        return typeof value === 'bigint' && !isNaN(value); // eslint-disable-line valid-typeof
    }

    function isNativeNumber (value) {
        return isNumber(value) || isBigInt(value);
    }

    var checkNumberSubtype = isSignetSubtypeOf('nativeNumber');

    function isNumberOrSubtype(typeName) {
        return checkNumberSubtype(typeName);
    }

    var checkStringSubtype = isSignetSubtypeOf('string');

    function isStringOrSubtype(typeName) {
        return typeName === 'string' || checkStringSubtype(typeName);
    }

    var checkArraySubtype = isSignetSubtypeOf('array');

    function isArrayOrSubtype(typeName) {
        return typeName === 'array' || checkArraySubtype(typeName);
    }

    function getTypeFromTypeString(typeString) {
        return parser.parseType(typeString).type;
    }

    function isSequence(value, options) {
        var subtypeName = getTypeFromTypeString(options[0]);

        if (!isNumberOrSubtype(subtypeName) && !isStringOrSubtype(subtypeName)) {
            throw new Error('A sequence may only be comprised of numbers, strings or their subtypes.');
        }

        return checkArray(value, options);
    }

    function getMonotoneCompare(values) {
        return greater(values[0], values[1]) ? greater : less
    }

    function checkMonotoneValues(values) {
        var result = true;
        var compare = getMonotoneCompare(values);

        for (var i = 1; i < values.length; i++) {
            result = result && compare(values[i - 1], values[i]);
        }

        return result;
    }

    function isMonotone(values, options) {
        return isSequence(values, options) && checkMonotoneValues(values);
    }

    function isIncreasing(values, options) {
        var firstValuesOk = values.length < 2 || less(values[0], values[1]);

        return isMonotone(values, options) && firstValuesOk;
    }

    function isDecreasing(values, options) {
        var firstValuesOk = values.length < 2 || greater(values[0], values[1]);

        return isMonotone(values, options) && firstValuesOk;
    }

    function checkArrayValues(arrayValues, options) {
        var result = true;
        var checkType = isTypeOf(options[0]);

        for (var i = 0; i < arrayValues.length; i++) {
            result = checkType(arrayValues[i]);

            if (!result) {
                break;
            }
        }

        return result;
    }

    function isArrayType(value) {
        return Object.prototype.toString.call(value) === '[object Array]';
    }


    function checkArray(value, options) {
        var checkValues = options.length > 0 && options[0] !== '*';

        return isArrayType(value)
            && (!checkValues || checkArrayValues(value, options));
    }

    function isInt(value) {
        return isBigInt(value) || checkInt(value);
    }

    function checkInt(value) {
        return Math.floor(value) === value && value !== Infinity;
    }

    function isBounded(value, options) {
        var typeName = getTypeFromTypeString(options[0]);
        var range = optionsToRangeObject(options);
        var isArrayOrString = isArrayOrSubtype(typeName) || isStringOrSubtype(typeName);
        var isNumberType = isNumberOrSubtype(typeName);

        var typeStringIsValid = isNumberType || isArrayOrString;

        if (!typeStringIsValid) {
            var errorMessage = 'Bounded type only accepts types of number, string, array or subtypes of these.'
            throw new Error(errorMessage);
        } else if (isTypeOf(options[0])(value)) {
            var valueToCheck = isArrayOrString ? value.length : value;
            return checkRange(valueToCheck, range);
        } else {
            return false;
        }
    }

    function checkRange(value, range) {
        return range.min <= value && value <= range.max;
    }

    function optionsToRangeObject(options) {
        var range = {
            min: Number(options[1]),
            max: Number(options[2])
        };
        return range;
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

    function optionsToFunction(options) {
        return options.join(', ');
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

    function castOutOn(predicate, values) {
        var result = false;

        for (var i = 0; i < values.length; i++) {
            result = predicate(values[i]);

            if (result) {
                values.splice(i, 1);
                break;
            }
        }

        return result;
    }

    function typeDoesNotExistIn(values) {
        var valuesCopy = values.slice(0);

        return function (typeName) {
            var isTypeOfTypeName = isTypeOf(typeName);

            return !castOutOn(isTypeOfTypeName, valuesCopy);
        };
    }

    function reduce(action, values, initial) {
        var arrayLength = values.length;
        var result = initial;

        for (var i = 0; i < arrayLength; i++) {
            result = action(result, values[i]);
        }

        return result;
    }

    function filterOn(predicate) {
        return function (result, value) {
            if (predicate(value)) {
                result.push(value);
            }

            return result;
        }
    }

    function filter(predicate, values) {
        return reduce(filterOn(predicate), values, []);
    }

    function checkValueTypes(values, typeNames) {
        var sortedTypeNames = sortTypeNames(typeNames);
        var filterResult = filter(typeDoesNotExistIn(values), sortedTypeNames);
        return filterResult.length === 0;
    }

    function isUnorderedProduct(value, typeNames) {
        var isCorrectLength = value.length === typeNames.length;
        return isCorrectLength && checkValueTypes(value, typeNames);
    }

    function checkTuple(value, options) {
        var lengthOkay = value.length === options.length;

        return lengthOkay && options.reduce(verifyTupleTypes, true);

        function verifyTupleTypes(result, validator, index) {
            return result && validator(value[index]);
        }
    }

    function isVariant(value, options) {
        return options.length === 0
            || filter(checkValueType, options).length > 0;

        function checkValueType(validator) {
            return validator(value);
        }
    }

    function checkTaggedUnion(value, options) {
        console.warn('Tagged Union is deprecated, use variant instead.');
        return isVariant(value, options);
    }

    function checkCompositeType(value, typePredicates) {
        return typePredicates.reduce(function (result, predicate) {
            return result && predicate(value);
        }, true);
    }

    function checkNot(value, typePredicates) {
        return !typePredicates[0](value);
    }

    function isRegisteredType(value) {
        return typeof value === 'function' || isSignetType(parser.parseType(value).type);
    }

    function equalLength(a, b) {
        return a.length === b.length;
    }

    function longer(a, b) {
        return a.length > b.length;
    }

    function shorter(a, b) {
        return a.length < b.length;
    }

    parser.registerTypeLevelMacro(function emptyParamsToStar(value) {
        return /^\(\s*\)$/.test(value.trim()) ? '*' : value;
    });

    function buildTypePattern(macroPattern) {
        var token = '{{typePattern}}';
        var typePattern = '^([^\\:]+\\:)?(\\[)?' + token + '(\\])?$';

        return new RegExp(typePattern.replace(token, macroPattern));
    }

    function matchAndReplace(value, pattern, replacement) {
        return pattern.test(value) ? value.replace(pattern, replacement) : value;
    }

    parser.registerTypeLevelMacro(function bangStarDefinedValues(value) {
        var pattern = buildTypePattern('(\\!\\*)');
        var replacementStr = '$1$2not<variant<undefined, null>>$4';

        return matchAndReplace(value.trim(), pattern, replacementStr);
    });

    parser.registerTypeLevelMacro(function questionMarkToOptionalType(value) {
        var pattern = buildTypePattern('\\?([^\\]]*)');
        var replacementStr = '$1$2variant<undefined, null, $3>$4';

        return matchAndReplace(value.trim(), pattern, replacementStr);
    });

    parser.registerTypeLevelMacro(function caretToNot(value) {
        var pattern = buildTypePattern('\\^([^\\]]*)');
        var replacementStr = '$1$2not<$3>$4';

        return matchAndReplace(value.trim(), pattern, replacementStr);
    });

    parser.registerSignatureLevelMacro(function signatureToFunction(value) {
        var signaturePattern = /(\()((.*\=\>)+(.*))(\))/
        var signatureMatch = signaturePattern.test(value);

        return signatureMatch ? value.replace(signaturePattern, 'function<$2>') : value;
    });

    function checkSignatureMatch(fn, signature) {
        return signature !== ''
            ? fn.signature === signature
            : typeof fn.signature === 'string';
    }

    var enforcePattern = /enforceDecorator/ig;

    function isEnforceFunction(fn) {
        var fnString = Function.prototype.toString.call(fn);
        return enforcePattern.test(fnString);
    }

    function isEnforcedFunction(value, options) {
        var signature = typeof options !== 'undefined'
            ? options.join(',').trim()
            : '';
        var valueIsFunction = typeof value === 'function';

        return valueIsFunction
            && isEnforceFunction(value)
            && checkSignatureMatch(value, signature);
    }

    function setDecimalPrecision(value, precision) {
        var magnitude = Math.pow(10, precision);

        return Math.floor(value * magnitude) / magnitude;
    }

    function checkDecimalPrecision(value, options) {
        var precision = parseFloat(options[0]);

        if (!checkInt(precision) || !checkRange(precision, { min: 0, max: Infinity })) {
            throw new Error('Precision value must be of type leftBoundedInt<0>, but got: ' + precision + 'of type ' + typeof precision);
        }

        return value === setDecimalPrecision(value, precision);
    }

    function isPromise(value) {
        return value instanceof Promise;
    }

    extend('boolean{0}', isType('boolean'));
    extend('function{0,1}', isType('function'), optionsToFunction);
    extend('enforcedFunction{0,1}', isEnforcedFunction);
    extend('nativeNumber', isNativeNumber);
    extend('object{0}', isType('object'));
    extend('string{0}', isType('string'));
    extend('symbol{0}', isType('symbol'));
    extend('undefined{0}', isType('undefined'));
    extend('not{1}', checkNot, optionsToFunctions);
    extend('null{0}', isNull);
    extend('variant{1,}', isVariant, optionsToFunctions);
    extend('taggedUnion{1,}', checkTaggedUnion, optionsToFunctions);
    extend('composite{1,}', checkCompositeType, optionsToFunctions);
    extend('bounded{3}', isBounded);
    extend('promise', isPromise);

    subtype('nativeNumber')('number{0}', isNumber);
    subtype('nativeNumber')('bigint{0}', isBigInt);
    subtype('nativeNumber')('int{0}', isInt);

    subtype('object')('array{0,}', checkArray);
    subtype('object')('regexp{0}', isRegExp);
    subtype('nativeNumber')('finiteNumber', isFinite);
    subtype('number')('decimalPrecision{1}', checkDecimalPrecision);
    subtype('finiteNumber')('finiteInt{0}', checkInt);
    subtype('string')('formattedString{1}', checkFormattedString, optionsToRegex);
    subtype('array')('tuple{1,}', checkTuple, optionsToFunctions);
    subtype('array')('unorderedProduct{1,}', isUnorderedProduct);
    subtype('object')('arguments{0}', checkArgumentsObject);

    subtype('array')('sequence{1}', isSequence);
    subtype('array')('monotoneSequence{1}', isMonotone);
    subtype('array')('increasingSequence{1}', isIncreasing);
    subtype('array')('decreasingSequence{1}', isDecreasing);

    alias('leftBounded', 'bounded<_, _, Infinity>');
    alias('rightBounded', 'bounded<_, -Infinity, _>');

    alias('boundedString{2}', 'bounded<string, _, _>');
    alias('leftBoundedString{1}', 'leftBounded<string, _>');
    alias('rightBoundedString{1}', 'rightBounded<string, _>');

    alias('boundedNumber{2}', 'bounded<number, _, _>');
    alias('leftBoundedNumber{1}', 'leftBounded<number, _>');
    alias('rightBoundedNumber{1}', 'rightBounded<number, _>');

    alias('boundedFiniteNumber{2}', 'bounded<finiteNumber, _, _>');
    alias('leftBoundedFiniteNumber{1}', 'leftBounded<finiteNumber, _>');
    alias('rightBoundedFiniteNumber{1}', 'rightBounded<finiteNumber, _>');

    alias('boundedInt{2}', 'bounded<int, _, _>');
    alias('leftBoundedInt{1}', 'leftBounded<int, _>');
    alias('rightBoundedInt{1}', 'rightBounded<int, _>');

    alias('boundedFiniteInt{2}', 'bounded<finiteInt, _, _>');
    alias('leftBoundedFiniteInt{1}', 'leftBounded<finiteInt, _>');
    alias('rightBoundedFiniteInt{1}', 'rightBounded<finiteInt, _>');

    alias('typeValue{0}', 'variant<string, function>');
    subtype('typeValue')('type{0}', isRegisteredType);

    alias('any{0}', '*');
    alias('void{0}', '*');

    defineDependentOperatorOn('nativeNumber')('>', greater);
    defineDependentOperatorOn('nativeNumber')('<', less);
    defineDependentOperatorOn('nativeNumber')('=', equal);
    defineDependentOperatorOn('nativeNumber')('>=', not(less));
    defineDependentOperatorOn('nativeNumber')('<=', not(greater));
    defineDependentOperatorOn('nativeNumber')('!=', not(equal));

    defineDependentOperatorOn('int')('>', greater);
    defineDependentOperatorOn('int')('<', less);
    defineDependentOperatorOn('int')('=', equal);
    defineDependentOperatorOn('int')('>=', not(less));
    defineDependentOperatorOn('int')('<=', not(greater));
    defineDependentOperatorOn('int')('!=', not(equal));

    defineDependentOperatorOn('string')('=', equal);
    defineDependentOperatorOn('string')('!=', not(equal));
    defineDependentOperatorOn('string')('#=', equalLength);
    defineDependentOperatorOn('string')('#<', shorter);
    defineDependentOperatorOn('string')('#>', longer);

    defineDependentOperatorOn('array')('#=', equalLength);
    defineDependentOperatorOn('array')('#<', shorter);
    defineDependentOperatorOn('array')('#>', longer);

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

function signetRecursiveTypes(extend, isTypeOf) {
    var isArray = isTypeOf('array');
    var isUndefined = isTypeOf('undefined');

    function checkIterator(nextValue, action) {
        var currentValue = nextValue();
        var isOk = true;

        while (isOk && currentValue !== null) {
            isOk = action(currentValue);
            currentValue = nextValue();
        }

        return isOk;
    }

    function recursiveTypeFactory(iteratorFactory, nodeType) {
        var isNode = isTypeOf(nodeType);

        return function checkType(value) {
            var iterator = iteratorFactory(value);
            return isNode(value) && checkIterator(iterator, checkType);
        };
    }

    function iterateOn (key) {
        return function iteratorFactory(value) {
            var iterableValues = isArray(value[key]) 
                ? value[key].slice(0) 
                : [value[key]];

            return function getNextValue() {
                var nextValue = iterableValues.shift();
                return isUndefined(nextValue) ? null : nextValue;
            }
        }
    }

    function iterateOnArray (values) {
        var iterableValues = values.slice(0);

        return function () {
            var nextValue = iterableValues.shift();
            return isUndefined(nextValue) ? null : nextValue;
        }
    }

    function defineRecursiveType (typeName, iteratorFactory, nodeType, preprocessor) {
        var recursiveType = recursiveTypeFactory(iteratorFactory, nodeType);
        extend(typeName, recursiveType, preprocessor);

    }

    return {
        defineRecursiveType: defineRecursiveType,
        iterateOn: iterateOn,
        iterateOnArray: iterateOnArray,
        recursiveTypeFactory: recursiveTypeFactory
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetRecursiveTypes;
}


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

    function enforceArguments(types) {
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
        enforceArguments: enforce(
            'array<string> => arguments => undefined',
            enforceArguments),
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
    
    var signetInstance = buildSignet();
    signetInstance.new = buildSignet;

    return signetInstance;
})();

