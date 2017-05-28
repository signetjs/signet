// var signetBuilder = require('../dist/signet.min');
var signetBuilder = require('../index');
var signetParser = require('signet-parser');

var assert = require('chai').assert;
var timerFactory = require('./timer');
var sinon = require('sinon');

describe('Signet Library', function () {

    var parser;
    var signet;
    var timer;

    function addBuilder() {
        return function (a, b) {
            return a + b;
        }
    }

    beforeEach(function () {
        parser = signetParser();
        signet = signetBuilder();
        timer = timerFactory();
        timer.start();
    });

    afterEach(function () {
        timer.stop();
        timer.report();
    });

    it('should automatically register the * type', function () {
        assert.equal(signet.isTypeOf('*')('foo'), true);
    });

    it('should verify against an ad-hoc type', function () {
        function is5(value) {
            return value === 5;
        }

        assert.equal(signet.isTypeOf(is5)(5), true);
        assert.equal(signet.isTypeOf(is5)(6), false);
    });

    it('should pre-register Javascript base types and values', function () {
        assert.equal(signet.isTypeOf('boolean')(false), true);
        assert.equal(signet.isTypeOf('function')(addBuilder()), true);
        assert.equal(signet.isTypeOf('number')(17), true);
        assert.equal(signet.isTypeOf('object')({}), true);
        assert.equal(signet.isTypeOf('string')('foo'), true);
        assert.equal(signet.isTypeOf('symbol')(Symbol()), true);
        assert.equal(signet.isTypeOf('undefined')(undefined), true);

        assert.equal(signet.isTypeOf('null')(null), true);
        assert.equal(signet.isTypeOf('array')([]), true);
        assert.equal(signet.isTypeOf('array<*>')([1, 2, 'foo']), true);
        assert.equal(signet.isTypeOf('array<int>')([1, 2, 'foo']), false);

        assert.equal(signet.isTypeOf('int')(5), true);
        assert.equal(signet.isTypeOf('int')(5.3), false);

        assert.equal(signet.isTypeOf('bounded<1; 5>')(3), true);
        assert.equal(signet.isTypeOf('bounded<1; 5>')(5.1), false);
        assert.equal(signet.isTypeOf('bounded<1; 5>')(0), false);

        assert.equal(signet.isTypeOf('leftBounded<0>')(0), true);
        assert.equal(signet.isTypeOf('leftBounded<0>')(1), true);
        assert.equal(signet.isTypeOf('leftBounded<0>')(-1), false);

        assert.equal(signet.isTypeOf('rightBounded<0>')(0), true);
        assert.equal(signet.isTypeOf('rightBounded<0>')(-1), true);
        assert.equal(signet.isTypeOf('rightBounded<0>')(1), false);

        assert.equal(signet.isTypeOf('boundedInt<1; 5>')(3), true);
        assert.equal(signet.isTypeOf('boundedInt<1; 5>')(3.1), false);
        assert.equal(signet.isTypeOf('boundedInt<1; 5>')(6), false);
        assert.equal(signet.isTypeOf('boundedInt<1; 5>')(0), false);

        assert.equal(signet.isTypeOf('leftBoundedInt<0>')(0), true);
        assert.equal(signet.isTypeOf('leftBoundedInt<0>')(1), true);
        assert.equal(signet.isTypeOf('leftBoundedInt<0>')(-1), false);

        assert.equal(signet.isTypeOf('rightBoundedInt<0>')(0), true);
        assert.equal(signet.isTypeOf('rightBoundedInt<0>')(-1), true);
        assert.equal(signet.isTypeOf('rightBoundedInt<0>')(1), false);

        assert.equal(signet.isTypeOf('boundedString<2; 15>')('hello'), true);
        assert.equal(signet.isTypeOf('boundedString<2; 15>')(''), false);
        assert.equal(signet.isTypeOf('boundedString<2; 15>')('this is a long string which should fail'), false);

        assert.equal(signet.isTypeOf('formattedString<^\\d+(\\;)?\\d*$>')('123;45'), true);
        assert.equal(signet.isTypeOf('formattedString<^\\d+(\\;)?\\d*$>')('Not numbers'), false);

        assert.equal(signet.isTypeOf('tuple<int; formattedString<^\\d+(\\;)?\\D*$>; boolean>')([123, '1234;foo', false]), true);
        assert.equal(signet.isTypeOf('tuple<int; formattedString<^\\d+(\\;)?\\D*$>; boolean>')([123, '1234;33', false]), false);
        assert.equal(signet.isTypeOf('tuple<int; formattedString<^\\d+(\\;)?\\D*$>; boolean>')([123, '1234;foo', false, 'hooray!']), false);

        assert.equal(signet.isTypeOf('variant<int; string>')(10), true);
        assert.equal(signet.isTypeOf('variant<int; string>')('I am a string'), true);
        assert.equal(signet.isTypeOf('variant<int; string>')(null), false);

        assert.equal(signet.isTypeOf('taggedUnion<int; string>')(null), false);

        assert.doesNotThrow(signet.isTypeOf.bind(null, 'formattedString<:>'))

        var isUnorderedProduct = signet.isTypeOf('unorderedProduct<number; int; object; array; string>');

        assert.equal(isUnorderedProduct([1, 2, 3, 4]), false); //too short
        assert.equal(isUnorderedProduct([1, 2, 3, 4, 5, 6]), false); //too long
        assert.equal(isUnorderedProduct([2.5, 'foo', {}, 1.7, []]), false); //bad type
        assert.equal(isUnorderedProduct([1, 2.5, 'foo', [], {}]), true);
        assert.equal(isUnorderedProduct([2.5, 'foo', {}, 1, []]), true);

        assert.equal(signet.isTypeOf('type')(function () { }), true);
        assert.equal(signet.isTypeOf('type')('variant'), true);
        assert.equal(signet.isTypeOf('type')('badType'), false);

        assert.equal(signet.isTypeOf('()')('foo'), true);
        assert.doesNotThrow(signet.enforce('() => undefined', function () { }));
    });

    it('should pre-register signet type aliases', function () {
        assert.equal(signet.isTypeOf('void')(undefined), true);
        assert.equal(signet.isTypeOf('any')('anything'), true);
    });

    it('should register a new type', function () {
        signet.extend('foo', function (value) { return value === 'foo'; });

        assert.equal(signet.isType('foo'), true);
        assert.equal(signet.isTypeOf('foo')('foo'), true);
    });

    it('should register a subtype', function () {
        signet.subtype('number')('intFoo', function (value) { return Math.floor(value) === value; });

        assert.equal(signet.isSubtypeOf('number')('intFoo'), true);
        assert.equal(signet.isTypeOf('intFoo')(15), true);
    });

    it('should sign a function', function () {
        var signedAdd = signet.sign('number, number => number', addBuilder());
        var expectedTree = parser.parseSignature('number, number => number');

        assert.equal(JSON.stringify(signedAdd.signatureTree), JSON.stringify(expectedTree));
        assert.equal(signedAdd.signature, 'number, number => number');
    });

    it('should throw an error if signature contains a bad type', function () {
        var fnUnderTest = signet.sign.bind(null, 'number, foo => bar', addBuilder());
        var expectedMessage = "Signature contains invalid types: foo, bar";

        assert.throws(fnUnderTest, expectedMessage);
    });

    it('should throw an error if signature does not satisfy all declared arguments', function () {
        var fnUnderTest = signet.sign.bind(null, 'number => number', addBuilder());
        var expectedMessage = 'Signature declaration too short for function with 2 arguments';

        assert.throws(fnUnderTest, expectedMessage);
    });

    it('should throw error if signature has no output type', function () {
        var fnUnderTest = signet.sign.bind(null, 'number, number', addBuilder());
        var expectedMessage = 'Signature must have both input and output types';

        assert.throws(fnUnderTest, expectedMessage);
    });

    it('should throw error if signature has multiple output types', function () {
        var fnUnderTest = signet.sign.bind(null, 'number, number => number, number', addBuilder());
        var expectedMessage = 'Signature can only have a single output type';

        assert.throws(fnUnderTest, expectedMessage);
    });

    it('should wrap an enforced function with an appropriate enforcer', function () {
        var originalAdd = addBuilder();
        var add = signet.enforce('number, number => number', originalAdd);

        assert.equal(add.toString(), originalAdd.toString());
    });

    it('should enforce a function with a correct argument count', function () {
        var add = signet.enforce('number, number => number', addBuilder());
        var expectedMessage = 'Anonymous expected a value of type number but got 6 of type string';

        assert.throws(add.bind(null, 5, '6'), expectedMessage);
    });

    it('should enforce a function return value', function () {
        var add = signet.enforce('number, number => number', function (a, b) {
            return true;
        });

        var expectedMessage = 'Anonymous expected a return value of type number but got true of type boolean';

        assert.throws(add.bind(null, 3, 4), expectedMessage);
    });

    it('should throw a custom error on bad input', function () {
        var add = signet.enforce('number, number => number', function (a, b) {
            return true;
        }, {
                inputErrorBuilder: function (validationResult, args, signatureTree) {
                    return 'This is a custom input error!' + validationResult.toString() + args.toString() + signatureTree.toString();
                }
            });

        var expectedMessage = 'This is a custom input error!number,no3,no[object Object],[object Object],[object Object]';

        assert.throws(add.bind(null, 3, 'no'), expectedMessage);
    });

    it('should throw a custom error on bad output', function () {
        var add = signet.enforce('number, number => number', function (a, b) {
            return true;
        }, {
                outputErrorBuilder: function (validationResult, args, signatureTree) {
                    return 'This is a custom output error!' + validationResult.toString() + args.toString() + signatureTree.toString();
                }
            });

        var expectedMessage = 'This is a custom output error!number,true3,4[object Object],[object Object],[object Object]';

        assert.throws(add.bind(null, 3, 4), expectedMessage);
    });

    it('should return result from enforced function', function () {
        var add = signet.enforce('number, number => number', addBuilder());

        assert.equal(add(3, 4), 7);
    });

    it('should not throw on unfulfilled optional int argument in a higher-order function containing a variant type', function () {
        function slice(start, end) { }

        var enforcedSlice = signet.enforce('int, [int] => *', slice);

        assert.doesNotThrow(function () {
            enforcedSlice(5);
        });
    });

    it('should enforce a curried function properly', function () {
        function add(a) {
            return function (b) {
                return 'bar';
            }
        }

        var curriedAdd = signet.enforce('number => number => number', add);

        assert.throws(curriedAdd.bind(null, 'foo'));
        assert.throws(curriedAdd(5).bind(null, 'foo'));
        assert.throws(curriedAdd(5).bind(null, 6));
    });

    it('should allow aliasing of types by other names', function () {
        signet.alias('foo', 'string');

        assert.equal(signet.isTypeOf('foo')('bar'), true);
        assert.equal(signet.isTypeOf('foo')(5), false);
    });

    it('should allow function argument verification inside a function body', function () {
        function test(a, b) {
            signet.verify(test, arguments);
        }

        signet.sign('string, number => undefined', test);

        assert.throws(test.bind(5, 'five'));
    });

    it('should return correct type chains', function () {
        assert.equal(signet.typeChain('array'), '* -> object -> array');
        assert.equal(signet.typeChain('number'), '* -> number');
    });

    it('should duck type check an object', function () {
        var isMyObj = signet.duckTypeFactory({
            foo: 'string',
            bar: 'int',
            baz: 'array'
        });

        signet.subtype('object')('myObj', isMyObj);

        assert.equal(signet.isTypeOf('myObj')({ foo: 55 }), false);
        assert.equal(signet.isTypeOf('myObj')({ foo: 'blah', bar: 55, baz: [] }), true);
    });

    it('should allow duck types to be defined directly', function () {
        signet.defineDuckType('myObj', {
            foo: 'string',
            bar: 'int',
            baz: 'array'
        });

        assert.equal(signet.isTypeOf('myObj')({ foo: 55 }), false);
        assert.equal(signet.isTypeOf('myObj')({ foo: 'blah', bar: 55, baz: [] }), true);
    });

    it('should allow reporting of duck type errors', function () {
        signet.defineDuckType('aTestThingy', {
            quux: 'string'
        });

        signet.defineDuckType('myObj', {
            foo: 'string',
            bar: 'int',
            baz: 'array',
            deeperType: 'aTestThingy'
        });

        var result = signet.reportDuckTypeErrors('myObj')({ foo: 55, bar: 'bad value', baz: null, deeperType: {} });
        var expected = '[["foo","string",55],["bar","int","bad value"],["baz","array",null],["deeperType","aTestThingy",[["quux","string",null]]]]';

        assert.equal(JSON.stringify(result), expected);
        assert.equal(signet.isTypeOf('myObj')({ foo: 'blah', bar: 55, baz: [], deeperType: { quux: 'something' } }), true);
    });

    it('should properly check dependent types', function () {
        function orderedProperly(a, b) {
            return a > b;
        }

        var enforcedFn = signet.enforce('A > B :: A:number, B:number => boolean', orderedProperly);

        function testWith(a, b) {
            return function () {
                return enforcedFn(a, b);
            };
        }

        assert.throws(testWith(5, 6), 'orderedProperly expected a value of type A > B but got A = 5 and B = 6 of type string');
        assert.equal(testWith(7, 3)(), true);
    });

    it('should properly check type dependencies', function () {
        function testFnFactory() {
            return function (a, b) {
                return a;
            };
        }

        assert.throws(signet.enforce(
            'A <: B :: A:variant<string;number>, B:variant<string;int> => number',
            testFnFactory()).bind(null, 2.2, 3),
            'Anonymous expected a value of type A <: B but got A = 2.2 and B = 3 of type string');
        assert.throws(signet.enforce(
            'A < B, B > C :: A:int, B:int, C:int => number',
            testFnFactory()).bind(null, 5, 6, 7),
            'Anonymous expected a value of type B > C but got B = 6 and C = 7 of type string');

        assert.doesNotThrow(signet.enforce(
            'A <: B :: A:variant<string;int>, B:variant<string;number> => number',
            testFnFactory()).bind(null, 5, 6));
        assert.doesNotThrow(signet.enforce(
            'A < B, B < C :: A:int, B:int, C:int => number',
            testFnFactory()).bind(null, 5, 6, 7));
    });

    it('should get variant type of value', function () {
        var getValueType = signet.whichVariantType('variant<string; int>');

        assert.equal(getValueType('foo'), 'string');
        assert.equal(getValueType(17), 'int');
        assert.equal(getValueType(17.5), null);
    });

    it('should properly enforce constructors', function () {
        var testMethodSpy = sinon.spy();

        var MyObj = signet.enforce(
            'a:int, b:string => undefined',
            function (a, b) {
                this.testMethod(a, b);
            }
        );

        MyObj.prototype.testMethod = testMethodSpy;

        var objInstance = new MyObj(5, 'foo');
        var result = JSON.stringify(testMethodSpy.args[0]);
        var expectedResult = JSON.stringify([5, 'foo']);

        assert.equal(testMethodSpy.callCount, 1);
        assert.equal(result, expectedResult);

        assert.throws(
            function () { return new MyObj('foo', 5); },
            'Anonymous expected a value of type a:int but got foo of type string'
        );
    });

    it('should properly enforce object methods', function () {
        var testMethodSpy = sinon.spy();

        function MyObj(a) { 
            this.a = a;
        }

        MyObj.prototype = {
            testMethod: signet.enforce(
                'b:int => result:int',
                function (b) {
                    return this.a + b;
                }
            )
        }

        var objInstance = new MyObj(6);

        assert.equal(objInstance.testMethod(7), 13);
        assert.throws(
            objInstance.testMethod.bind(objInstance, '7'),
            'Anonymous expected a value of type b:int but got 7 of type string'
        );

    });

    it('should partially apply a type value', function () {
        signet.alias('testTuple', 'tuple<_; _>');
        signet.alias('testPartialTuple', 'testTuple<int; _>');

        assert.equal(signet.isTypeOf('testTuple<array; object>')([[], {}]), true);
        assert.equal(signet.isTypeOf('testPartialTuple<string>')([5, 'foo']), true);
        assert.equal(signet.isTypeOf('testPartialTuple<string>')([5, 6]), false);
    });

});

if(typeof global.runQuokkaMochaBdd === 'function') {
    runQuokkaMochaBdd();
}