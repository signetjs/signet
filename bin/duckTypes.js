function signetDuckTypes(typelog, isTypeOf) {

    var duckTypeErrorCheckers = {};

    function defineDuckType(typeName, objectDef) {
        typelog.defineSubtypeOf('object')(typeName, duckTypeFactory(objectDef));
    }

    function buildDuckTypeErrorChecker(definitionPairs, objectDef) {
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

    return {
        defineDuckType: defineDuckType,
        buildDuckTypeErrorChecker: buildDuckTypeErrorChecker,
        duckTypeFactory: duckTypeFactory
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetDuckTypes;
}
