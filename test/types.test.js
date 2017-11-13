var signetBuilder = require('../index');

var assert = require('chai').assert;
var timerFactory = require('./timer');

describe('Signet Types', function () {

    var signet;
    var timer;

    function addBuilder() {
        return function (a, b) {
            return a + b;
        }
    }

    beforeEach(function () {
        signet = signetBuilder();

        timer = timerFactory();
        timer.setMaxAcceptableTime(3);
        timer.start();
    });

    afterEach(function () {
        timer.stop();
        timer.report();
    });

    describe('Preregistered Types', function () {

        it('should automatically register the * type', function () {
            assert.equal(signet.isTypeOf('*')('foo'), true);
        });

        it('should have all core JS types preregistered', function () {
            assert.equal(signet.isTypeOf('boolean')(false), true);
            assert.equal(signet.isTypeOf('function')(addBuilder()), true);
            assert.equal(signet.isTypeOf('number')(17), true);
            assert.equal(signet.isTypeOf('object')({}), true);
            assert.equal(signet.isTypeOf('string')('foo'), true);
            assert.equal(signet.isTypeOf('symbol')(Symbol()), true);
            assert.equal(signet.isTypeOf('undefined')(undefined), true);
        });

        it('should have common subtypes preregistered', function () {
            assert.equal(signet.isTypeOf('null')(null), true);
            assert.equal(signet.isTypeOf('array')([]), true);
            assert.equal(signet.isTypeOf('array<*>')([1, 2, 'foo']), true);
            assert.equal(signet.isTypeOf('array<int>')([1, 2, 'foo']), false);

            assert.equal(signet.isTypeOf('int')(5), true);
            assert.equal(signet.isTypeOf('int')(5.3), false);
        });

        it('should preregister algebraic types', function () {
            assert.equal(signet.isTypeOf('tuple<int; formattedString<^\\d+(\\%;)?\\D*$>; boolean>')([123, '1234;foo', false]), true);
            assert.equal(signet.isTypeOf('tuple<int; formattedString<^\\d+(\\%;)?\\D*$>; boolean>')([123, '1234;33', false]), false);
            assert.equal(signet.isTypeOf('tuple<int; formattedString<^\\d+(\\%;)?\\D*$>; boolean>')([123, '1234;foo', false, 'hooray!']), false);

            assert.equal(signet.isTypeOf('variant<int; string>')(10), true);
            assert.equal(signet.isTypeOf('variant<int; string>')('I am a string'), true);
            assert.equal(signet.isTypeOf('variant<int; string>')(null), false);

            assert.equal(signet.isTypeOf('taggedUnion<int; string>')(null), false);
        });

        it('should support an unordered product type', function () {
            var isUnorderedProduct = signet.isTypeOf('unorderedProduct<number; int; object; array; string>');

            assert.equal(isUnorderedProduct([1, 2, 3, 4]), false); //too short
            assert.equal(isUnorderedProduct([1, 2, 3, 4, 5, 6]), false); //too long
            assert.equal(isUnorderedProduct([2.5, 'foo', {}, 1.7, []]), false); //bad type
            assert.equal(isUnorderedProduct([1, 2.5, 'foo', [], {}]), true);
            assert.equal(isUnorderedProduct([2.5, 'foo', {}, 1, []]), true);
        });

        it('should have a not operator to describe exclusive types', function () {
            assert.equal(signet.isTypeOf('not<null>')('foo'), true);
            assert.equal(signet.isTypeOf('not<null>')(null), false);
        });

        it('should support a composition operator', function () {
            assert.equal(signet.isTypeOf('composite<not<null>, object>')({}), true);
            assert.equal(signet.isTypeOf('composite<not<null>, object>')(undefined), false);
        });

        it('should verify type types against existing known types', function () {
            assert.equal(signet.isTypeOf('type')(function () { }), true);
            assert.equal(signet.isTypeOf('type')('variant'), true);
            assert.equal(signet.isTypeOf('type')('badType'), false);
        });

        it('should preregister sequence types', function () {
            assert.equal(signet.isTypeOf('sequence<int>')([1, 2, 3, 4]), true);
            assert.equal(signet.isTypeOf('sequence<int>')([1, 2, 3.5, 4]), false);
            assert.throws(signet.isTypeOf('sequence<boolean>').bind(null, []), 'A sequence may only be comprised of numbers, strings or their subtypes.');

            assert.equal(signet.isTypeOf('monotoneSequence<number>')([1, 2.5, 3, 4.7]), true);
            assert.equal(signet.isTypeOf('monotoneSequence<string>')(['d', 'c', 'b', 'a']), true);
            assert.equal(signet.isTypeOf('monotoneSequence<int>')([1]), true);
            assert.equal(signet.isTypeOf('monotoneSequence<int>')([1, 2, -1, 5]), false);

            assert.equal(signet.isTypeOf('increasingSequence<number>')([1, 2.5, 3, 4.7]), true, 'Not an increasing sequence of int');
            assert.equal(signet.isTypeOf('increasingSequence<string>')(['d', 'c', 'b', 'a']), false, 'Is an increasing sequence of string');
            assert.equal(signet.isTypeOf('increasingSequence<int>')([1]), true, 'Not an increasing sequence of one value');
            assert.equal(signet.isTypeOf('increasingSequence<int>')([1, 2, -1, 5]), false, 'Is an increasing sequence of int with a negative');

            assert.equal(signet.isTypeOf('decreasingSequence<number>')([1, 2.5, 3, 4.7]), false, 'Not an increasing sequence of int');
            assert.equal(signet.isTypeOf('decreasingSequence<string>')(['d', 'c', 'b', 'a']), true, 'Is an increasing sequence of string');
            assert.equal(signet.isTypeOf('decreasingSequence<int>')([1]), true, 'Not an increasing sequence of one value');
            assert.equal(signet.isTypeOf('decreasingSequence<int>')([1, 2, -1, 5]), false, 'Is an increasing sequence of int with a negative');
        });

        it('should have registered bounded types', function () {
            assert.equal(signet.isTypeOf('bounded<int, 1, 5>')(3), true);
            assert.equal(signet.isTypeOf('bounded<number, 1, 5>')(5.1), false);
            assert.equal(signet.isTypeOf('bounded<int, 1, 5>')(0), false);

            assert.equal(signet.isTypeOf('leftBounded<number, 0>')(0), true);
            assert.equal(signet.isTypeOf('leftBounded<number, 0>')(1), true);
            assert.equal(signet.isTypeOf('leftBounded<number, 0>')(-1), false);

            assert.equal(signet.isTypeOf('rightBounded<number, 0>')(0), true);
            assert.equal(signet.isTypeOf('rightBounded<number, 0>')(-1), true);
            assert.equal(signet.isTypeOf('rightBounded<number, 0>')(1), false);

            assert.equal(signet.isTypeOf('rightBounded<int, 5>')(1.3), false);

            assert.equal(signet.isTypeOf('boundedInt<1; 5>')(3), true);
            assert.equal(signet.isTypeOf('boundedInt<1; 5>')(3.1), false);
            assert.equal(signet.isTypeOf('boundedInt<1; 5>')(6), false);
            assert.equal(signet.isTypeOf('boundedInt<1; 5>')(0), false);

            assert.equal(signet.isTypeOf('leftBoundedInt<0>')(0), true);
            assert.equal(signet.isTypeOf('leftBoundedInt<0>')(1), true);
            assert.equal(signet.isTypeOf('leftBoundedInt<0>')(-1), false);
            assert.equal(signet.isTypeOf('leftBoundedInt<0>')(), false);

            assert.equal(signet.isTypeOf('rightBoundedInt<0>')(0), true);
            assert.equal(signet.isTypeOf('rightBoundedInt<0>')(-1), true);
            assert.equal(signet.isTypeOf('rightBoundedInt<0>')(1), false);

            assert.equal(signet.isTypeOf('boundedString<2; 15>')('hello'), true);
            assert.equal(signet.isTypeOf('boundedString<2; 15>')(''), false);
            assert.equal(signet.isTypeOf('boundedString<2; 15>')('this is a long string which should fail'), false);
        });

        it('should support formatted strings', function () {
            assert.equal(signet.isTypeOf('formattedString<^\\d+(\\%;)?\\d*$>')('123;45'), true);
            assert.equal(signet.isTypeOf('formattedString<^\\d+(\\%;)?\\d*$>')('Not numbers'), false);
            assert.doesNotThrow(signet.isTypeOf.bind(null, 'formattedString<:>'))
        });

        it('should verify enforced functions', function () {
            const goodEnforcedFunction = signet.enforce('* => *', () => null);
            const badEnforcedFunction = signet.enforce('* => null', () => null);

            assert.equal(signet.isTypeOf('enforcedFunction<* => *>')(goodEnforcedFunction), true);
            assert.equal(signet.isTypeOf('enforcedFunction<* => *>')(badEnforcedFunction), false);
            assert.equal(signet.isTypeOf('enforcedFunction<* => *>')(() => null), false);
        });

        it('should pre-register signet type aliases', function () {
            assert.equal(signet.isTypeOf('void')(undefined), true);
            assert.equal(signet.isTypeOf('any')('anything'), true);
        });
    
    });
});