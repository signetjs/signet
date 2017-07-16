function signetRecursiveTypes(typelog, isTypeOf) {
    var isType = isTypeOf('type');

    function checkIterator(nextValue, action) {
        var currentValue = nextValue();
        var isOk = true;

        while (isOk && currentValue !== null) {
            isOk = action(currentValue);
            currentValue = nextValue();
        }

        return isOk;
    }

    function recursiveTypeFactory(iteratorFactory, vertexType, nodeType) {
        var isVertex = isTypeOf(vertexType);
        var isNode = isType(nodeType) ? isTypeOf(nodeType) : isVertex;

        function checkType(value) {
            var iterator = iteratorFactory(value);
            return isVertex(value)
                ? checkIterator(iterator, checkType)
                : isNode(value);
        }

        return checkType
    }

    return {
        recursiveTypeFactory: recursiveTypeFactory
    };
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = signetRecursiveTypes;
}
