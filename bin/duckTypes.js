function signetDuckTypes(typelog, isTypeOf, parseType, assembleType) {

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
        if (typeof duckTypeErrorReporters[typeName] === 'function') {
            return duckTypeErrorReporters[typeName](value);
        }

        return value;
    }

    var isString = isTypeOf('string');

    function getTypeName(objectDef, key) {
        return typeof objectDef[key] === 'string' ? objectDef[key] : objectDef[key].name;
    }

    function buildDuckTypeErrorReporter(definitionPairs, objectDef) {
        var keys = Object.keys(objectDef);
        var typeResolvedDefinition = keys.reduce(function (result, key) {
            var typeValue = objectDef[key];
            
            result[key] = isString(typeValue) ? 
                assembleType(parseType(typeValue)) : typeValue;

            return result;
        }, {});

        return function (value) {
            if(typeof value !== 'object' || value === null) {
                return [['badDuckTypeValue', 'object', value]]
            }

            return definitionPairs.reduce(function (result, typePair) {
                var key = typePair[0];
                var typePredicate = typePair[1];
                var typeName = getTypeName(typeResolvedDefinition, key);

                if (!typePredicate(value[key])) {
                    result.push([key, typeName, getErrorValue(value[key], typeName)]);
                }

                return result;
            }, []);
        };
    }

    var isDuckTypeCheckable = isTypeOf('composite<not<null>, variant<object, function>>')


    function buildDuckType(definitionPairs) {
        return function (value) {
            if(!isDuckTypeCheckable(value)) {
                return false;
            }

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
        var definitionPairs = buildDefinitionPairs(objectDef);

        typelog.defineSubtypeOf('object')(typeName, exactDuckTypeFactory(objectDef));
        duckTypeErrorReporters[typeName] = buildDuckTypeErrorReporter(definitionPairs, objectDef);

    }

    function isRegisteredDuckType (typeName) {
        return typeof duckTypeErrorReporters[typeName] === 'function';
    }

    return {
        buildDuckTypeErrorChecker: buildDuckTypeErrorReporter,
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
