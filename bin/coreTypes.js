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