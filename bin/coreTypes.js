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


    function checkRange(value, range) {
        return range.min <= value && value <= range.max;
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

    function matchAndReplace(value, pattern, replacement){
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

    extend('boolean{0}', isType('boolean'));
    extend('function{0,1}', isType('function'), optionsToFunction);
    extend('number{0}', isType('number'));
    extend('object{0}', isType('object'));
    extend('string{0}', isType('string'));
    extend('symbol{0}', isType('symbol'));
    extend('undefined{0}', isType('undefined'));
    extend('not{1}', checkNot, optionsToFunctions);
    extend('null{0}', isNull);
    extend('variant{1,}', isVariant, optionsToFunctions);
    extend('taggedUnion{1,}', checkTaggedUnion, optionsToFunctions);
    extend('composite{1,}', checkCompositeType, optionsToFunctions);

    subtype('object')('array{0,}', checkArray);
    subtype('object')('regexp{0}', isRegExp);
    subtype('number')('int{0}', checkInt);
    subtype('number')('bounded{2}', checkRange, optionsToRangeObject);
    subtype('string')('boundedString{2}', checkBoundedString, optionsToRangeObject);
    subtype('string')('formattedString{1}', checkFormattedString, optionsToRegex);
    subtype('array')('tuple{1,}', checkTuple, optionsToFunctions);
    subtype('array')('unorderedProduct{1,}', isUnorderedProduct);
    subtype('object')('arguments{0}', checkArgumentsObject);

    alias('typeValue{0}', 'variant<string, function>');
    subtype('typeValue')('type{0}', isRegisteredType);

    alias('any{0}', '*');
    alias('void{0}', '*');

    alias('leftBounded{1}', 'bounded<_, Infinity>');
    alias('rightBounded{1}', 'bounded<-Infinity, _>');

    alias('boundedInt{2}', 'composite<int, bounded<_, _>>')

    alias('leftBoundedInt{1}', 'boundedInt<_, Infinity>');
    alias('rightBoundedInt{1}', 'boundedInt<-Infinity, _>');

    defineDependentOperatorOn('number')('>', greater);
    defineDependentOperatorOn('number')('<', less);
    defineDependentOperatorOn('number')('=', equal);
    defineDependentOperatorOn('number')('>=', not(less));
    defineDependentOperatorOn('number')('<=', not(greater));
    defineDependentOperatorOn('number')('!=', not(equal));

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