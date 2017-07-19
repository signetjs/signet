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
