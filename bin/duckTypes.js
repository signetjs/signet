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
