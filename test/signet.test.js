var signetBuilder = require('../index');
// var signetBuilder = require('../dist/signet');
var signetParser = require('signet-parser');

var assert = require('chai').assert;
var timerFactory = require('./timer');
var sinon = require('sinon');

describe('Signet API', function () {

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
        timer.setMaxAcceptableTime(3);
        timer.start();
    });

    afterEach(function () {
        timer.stop();
        timer.report();
    });

    describe('isTypeOf', function () {

        it('should verify against an ad-hoc type', function () {
            function is5(value) {
                return value === 5;
            }

            assert.equal(signet.isTypeOf(is5)(5), true);
            assert.equal(signet.isTypeOf(is5)(6), false);
        });

    });

    describe('sign', function () {

        it('should sign a function', function () {
            var expectedSignature = 'A < B :: A:number, B:number => number';
            var signedAdd = signet.sign(expectedSignature, addBuilder());
            var expectedTree = parser.parseSignature(expectedSignature);

            assert.equal(JSON.stringify(signedAdd.signatureTree), JSON.stringify(expectedTree));
            assert.equal(signedAdd.signature, expectedSignature);
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

    });

    describe('enforce', function () {

        describe('Core Behaviors', function () {

            it('tuple should produce reliable signatures', function () {
                const expectedSignature = 'tuple<*;*> => *';
                const testFn = signet.enforce(expectedSignature, () => null);

                assert.equal(testFn.signature, expectedSignature);
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
                    (a, b);
                    return true;
                });

                var expectedMessage = 'Anonymous expected a return value of type number but got true of type boolean';

                assert.throws(add.bind(null, 3, 4), expectedMessage);
            });

            it('should return result from enforced function', function () {
                var add = signet.enforce('number, number => number', addBuilder());

                assert.equal(add(3, 4), 7);
            });

            it('should not throw on unfulfilled optional int argument in a higher-order function containing a variant type', function () {
                function slice(start, end) { (end) }

                var enforcedSlice = signet.enforce('int, [int] => *', slice);

                assert.doesNotThrow(function () {
                    enforcedSlice(5);
                });
            });

            it('should enforce a curried function properly', function () {
                function add(a) {
                    return function (b) {
                        (a, b);
                        return 'bar';
                    }
                }

                var curriedAdd = signet.enforce('number => number => number', add);

                assert.throws(curriedAdd.bind(null, 'foo'));
                assert.throws(curriedAdd(5).bind(null, 'foo'));
                assert.throws(curriedAdd(5).bind(null, 6));
            });

        });

        describe('Custom Errors', function () {

            it('should throw a custom error on bad input', function () {
                var add = signet.enforce('number, number => number', function (a, b) {
                    (a, b);
                    return true;
                }, {
                        inputErrorBuilder: function (validationResult, args, signatureTree) {
                            return 'This is a custom input error!' + validationResult.toString() + args.toString() + signatureTree.toString();
                        }
                    });

                var expectedMessage = 'This is a custom input error!number,no3,no[object Object],[object Object],[object Object]';

                assert.throws(add.bind(null, 3, 'no'), expectedMessage);
            });

            it('should throw a default error on bad input with core builder', function () {
                var add = signet.enforce('number, number => number', function (a, b) {
                    (a, b);
                    return true;
                }, {
                        inputErrorBuilder: function (validationResult, args, signatureTree, functionName) {
                            return signet.buildInputErrorMessage(validationResult, args, signatureTree, functionName);
                        }
                    });

                var expectedMessage = 'Anonymous expected a value of type number but got no of type string';

                assert.throws(add.bind(null, 3, 'no'), expectedMessage);
            });

            it('should throw a default error on bad output with core builder', function () {
                var add = signet.enforce('number, number => number', function (a, b) {
                    (a, b);
                    return true;
                }, {
                        outputErrorBuilder: function (validationResult, args, signatureTree, functionName) {
                            return signet.buildOutputErrorMessage(validationResult, args, signatureTree, functionName);
                        }
                    });

                var expectedMessage = 'Anonymous expected a return value of type number but got true of type boolean';

                assert.throws(add.bind(null, 3, 4), expectedMessage);
            });

            it('should throw a custom error on bad output', function () {
                var add = signet.enforce('number, number => number', function (a, b) {
                    (a, b);
                    return true;
                }, {
                        outputErrorBuilder: function (validationResult, args, signatureTree) {
                            return 'This is a custom output error!' + validationResult.toString() + args.toString() + signatureTree.toString();
                        }
                    });

                var expectedMessage = 'This is a custom output error!number,true3,4[object Object],[object Object],[object Object]';

                assert.throws(add.bind(null, 3, 4), expectedMessage);
            });

        });

        describe('Dependent Type Operator Support', function () {

            it('should properly check symbolic dependent types', function () {
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

            it('should properly check symbolic type dependencies', function () {
                function testFnFactory() {
                    return function (a, b) {
                        a + b;
                        return a;
                    };
                }

                assert.throws(signet.enforce(
                    'A <: B :: A:variant<string;nativeNumber>, B:variant<string;int> => number',
                    testFnFactory()).bind(null, 2.2, 3),
                    'Anonymous expected a value of type A <: B but got A = 2.2 and B = 3 of type string');
                assert.throws(signet.enforce(
                    'A < B, B > C :: A:int, B:int, C:int => number',
                    testFnFactory()).bind(null, 5, 6, 7),
                    'Anonymous expected a value of type B > C but got B = 6 and C = 7 of type string');

                assert.doesNotThrow(signet.enforce(
                    'A <: B :: A:variant<string;int>, B:variant<string;nativeNumber> => number',
                    testFnFactory()).bind(null, 5, 6));
                assert.doesNotThrow(signet.enforce(
                    'A < B, B < C :: A:int, B:int, C:int => number',
                    testFnFactory()).bind(null, 5, 6, 7));
            });

        });

        describe('Object and Constructor Support', function () {

            it('should properly enforce constructors', function () {
                var testMethodSpy = sinon.spy();

                var MyObj = signet.enforce(
                    'a:int, b:string => undefined',
                    function (a, b) {
                        this.testMethod(a, b);
                    }
                );

                MyObj.prototype.testMethod = testMethodSpy;
                new MyObj(5, 'foo');

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

        });

        describe('Function Properties', function () {

            it('should preserve properties on enforced function', function () {
                function adder(a, b) {
                    return a + b;
                }

                adder.myProp = () => 'yay!';

                const add = signet.enforce(
                    'number, number => number',
                    adder
                );

                assert.equal(add.myProp(), 'yay!');
            });

        });

        describe('Higher-order Function Support', function () {

            it('should support a cross-execution environment table', function () {
                const addIncreasing = signet.enforce(
                    'a < b, b < sum :: a:int => b:int => sum:int',
                    a => b => a - b
                );


                assert.throws(addIncreasing(5).bind(null, 4), 'Anonymous expected a value of type a < b but got a = 5 and b = 4 of type string');
                assert.throws(addIncreasing(5).bind(null, 6), 'Anonymous expected a return value of type b < sum but got b = 6 and sum = -1 of type string');
            });

            it('should enforce passed functions when a signature is provided', function () {
                const testFn = signet.enforce(
                    'function<* => boolean> => * => boolean',
                    function (fn) { return () => fn(); });

                function badFn() { return 'foo'; }

                assert.throws(testFn(badFn), 'badFn expected a return value of type boolean but got foo of type string');
            });

            it('should should pass options along to sub-enforcement', function () {
                const options = {
                    outputErrorBuilder: function (validationResult, args, signatureTree) {
                        return 'This is a custom output error!' + validationResult.toString() + args.toString() + signatureTree.toString();
                    }
                };

                const testFn = signet.enforce(
                    'function<* => boolean> => * => string',
                    function (fn) { return () => fn(); },
                    options);


                function badFn() { return 'foo'; }

                assert.throws(testFn(badFn), 'This is a custom output error!boolean,foo[object Object],[object Object]');
            });

            it('should not throw when function type is declared with constructor argument', function () {
                function doStuff() { return []; }
                signet.enforce('function<*, * => string, boolean => boolean> => array', doStuff);

                assert.doesNotThrow(doStuff.bind(null, function () { }));
            });

        });

    });

    describe('extend', function () {

        it('should register a new type', function () {
            signet.extend('foo', function (value) { return value === 'foo'; });

            assert.equal(signet.isType('foo'), true);
            assert.equal(signet.isTypeOf('foo')('foo'), true);
        });

        it('should handle type arity up front', function () {
            signet.extend('myTestType0', function () { });
            signet.extend('myTestType1{1}', function () { });
            signet.extend('myTestType1OrMore{1,}', function () { });
            signet.extend('myTestType2To5{2, 5}', function () { });

            assert.doesNotThrow(signet.isTypeOf.bind(null, 'myTestType0<1, 2, 3>'));
            assert.throws(
                signet.isTypeOf('myTestType1<1, 2, 3>').bind(null, 'foo'),
                'Type myTestType1 accepts, at most, 1 arguments');
            assert.throws(
                signet.isTypeOf('myTestType1').bind(null, 'foo'),
                'Type myTestType1 requires, at least, 1 arguments');

            assert.doesNotThrow(signet.isTypeOf('myTestType1OrMore<1, 2, 3>').bind(null, 'foo'));
            assert.throws(
                signet.isTypeOf('myTestType1OrMore').bind(null, 'foo'),
                'Type myTestType1OrMore requires, at least, 1 arguments');

            assert.doesNotThrow(signet.isTypeOf('myTestType2To5<1, 2, 3>').bind(null, 'foo'));
            assert.throws(
                signet.isTypeOf('myTestType2To5').bind(null, 'foo'),
                'Type myTestType2To5 requires, at least, 2 arguments');
            assert.throws(
                signet.isTypeOf('myTestType2To5<1, 2, 3, 4, 5, 6>').bind(null, 'foo'),
                'Type myTestType2To5 accepts, at most, 5 arguments');

            assert.throws(
                signet.extend.bind(null, 'myTestTypeBroken{5, 1}', function () { }),
                'Error in myTestTypeBroken arity declaration: min cannot be greater than max');
        });

    });

    describe('subtype', function () {

        it('should register a subtype', function () {
            signet.subtype('number')('intFoo', function (value) { return Math.floor(value) === value; });

            assert.equal(signet.isSubtypeOf('number')('intFoo'), true);
            assert.equal(signet.isTypeOf('intFoo')(15), true);
        });

    });

    describe('alias', function () {

        it('should allow aliasing of types by other names', function () {
            signet.alias('foo', 'string');

            assert.equal(signet.isTypeOf('foo')('bar'), true);
            assert.equal(signet.isTypeOf('foo')(5), false);
        });

        it('should partially apply a type value', function () {
            signet.alias('testTuple', 'tuple<_; _>');
            signet.alias('testPartialTuple', 'testTuple<int; _>');

            assert.equal(signet.isTypeOf('testTuple<array; object>')([[], {}]), true);
            assert.equal(signet.isTypeOf('testPartialTuple<string>')([5, 'foo']), true);
            assert.equal(signet.isTypeOf('testPartialTuple<string>')([5, 6]), false);
        });

    });

    describe('verify', function () {

        it('should allow function argument verification inside a function body', function () {
            function test(a, b) {
                (a, b);
                signet.verify(test, arguments);
            }

            signet.sign('string, number => undefined', test);

            assert.throws(test.bind(5, 'five'));
        });

    });

    describe('enforceArguments', function () {

        it('throws an error if arguments do not match requirement', function () {
            function test(a) {
                signet.enforceArguments(['a:string'])(arguments);
            }

            assert.throws(test.bind(null, 5));
        });

        it('verifies arguments and skips unfulfilled optional arguments', function () {
            
            function test(a, b, c) {
                signet.enforceArguments(['a: string', 'b: [number]', 'c: string'])(arguments);
            }

            assert.doesNotThrow(test.bind(null, 'foo', 'bar'));
        });

    });

    describe('typeChain', function () {

        it('should return correct type chains', function () {
            const arrayTypeChain = signet.typeChain('array');
            const numberTypeChain = signet.typeChain('number');

            assert.equal(arrayTypeChain, '* -> object -> array');
            assert.equal(numberTypeChain, '* -> nativeNumber -> number');
        });

    });

    describe('duckTypeFactory', function () {

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

        it('should return false if value is not duck-type verifiable', function () {
            var isMyObj = signet.duckTypeFactory({
                foo: 'string',
                bar: 'int',
                baz: 'array'
            });

            assert.equal(isMyObj(null), false);
        });

    });

    describe('exactDuckTypeFactory', function () {

        it('should check and exact duck type on an object', function () {
            var isMyObj = signet.exactDuckTypeFactory({
                foo: 'string',
                bar: 'int',
                baz: 'array'
            });

            signet.subtype('object')('myExactObj', isMyObj);

            assert.equal(signet.isTypeOf('myExactObj')({ foo: 'blah', bar: 55, baz: [], quux: '' }), false);
            assert.equal(signet.isTypeOf('myExactObj')({ foo: 'blah', bar: 55, baz: [] }), true);
        });

        it('should check and exact duck type on an object', function () {
            var isMyObj = signet.exactDuckTypeFactory({
                foo: 'string',
                bar: 'int',
                baz: 'array'
            });

            signet.subtype('object')('myExactObj', isMyObj);

            assert.equal(signet.isTypeOf('myExactObj')({ foo: 'blah', bar: 55, baz: [], quux: '' }), false);
            assert.equal(signet.isTypeOf('myExactObj')({ foo: 'blah', bar: 55, baz: [] }), true);
        });

    });

    describe('defineDuckType', function () {

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
                quux: '!*'
            });

            signet.defineDuckType('myObj', {
                foo: 'string',
                bar: 'int',
                baz: 'array',
                deeperType: 'aTestThingy'
            });

            var result = signet.reportDuckTypeErrors('myObj')({ foo: 55, bar: 'bad value', baz: null, deeperType: {} });
            var expected = '[["foo","string",55],["bar","int","bad value"],["baz","array",null],["deeperType","aTestThingy",[["quux","not<variant<undefined, null>>",null]]]]';

            assert.equal(JSON.stringify(result), expected);
            assert.equal(signet.isTypeOf('myObj')({ foo: 'blah', bar: 55, baz: [], deeperType: { quux: 'something' } }), true);
        });

    });

    describe('defineClassType', function () {
        
        it('verifies a type based on provided class', function () {
            class MyClass {
                constructor() {}

                test() {}

                test1() {}
            }

            signet.defineClassType(MyClass);

            const myInstance = new MyClass();

            assert.isTrue(signet.isTypeOf('MyClass')(myInstance));
            assert.isFalse(signet.isTypeOf('MyClass')({}));
        });

        
        it('allows for extra properties to be defined', function () {
            class MyClass {
                constructor() {
                    this.foo = 'bar';
                    this.someInt = 1234;
                }
            }

            signet.defineClassType(MyClass, { foo: 'string', someInt: 'int' });

            const myInstance = new MyClass();

            assert.isTrue(signet.isTypeOf('MyClass')(myInstance));
            assert.isFalse(signet.isTypeOf('MyClass')({}));
        });
        
        it('throws an error when on attempt to override existing property', function () {
            class MyClass {
                constructor() {
                    this.someInt = 1234;
                }

                foo() {}
            }

            const classTypeDefiner = () => signet.defineClassType(MyClass, { foo: 'string', someInt: 'int' });

            assert.throws(classTypeDefiner);
        });
    });

    describe('classTypeFactory', function () {
        
        it('verifies a type based on provided class', function () {
            class MyClass {
                constructor() {}

                test() {}

                test1() {}
            }

            const isMyClass = signet.classTypeFactory(MyClass);

            const myInstance = new MyClass();

            assert.isTrue(isMyClass(myInstance));
            assert.isFalse(isMyClass({}));
        });

        
        it('allows for extra properties to be defined', function () {
            class MyClass {
                constructor() {
                    this.foo = 'bar';
                    this.someInt = 1234;
                }
            }

            const isMyClass = signet.classTypeFactory(MyClass, { foo: 'string', someInt: 'int' });

            const myInstance = new MyClass();

            assert.isTrue(isMyClass(myInstance));
            assert.isFalse(isMyClass({}));
        });
        
        it('throws an error when on attempt to override existing property', function () {
            class MyClass {
                constructor() {
                    this.someInt = 1234;
                }

                foo() {}
            }

            const classTypeBuilder = () => signet.classTypeFactory(MyClass, { foo: 'string', someInt: 'int' });

            assert.throws(classTypeBuilder);
        });
    });

    describe('reportDuckTypeErrors', function () {
        it('should return duck type error on bad object value', function () {
            signet.defineDuckType('duckTest', {});
            let checkDuckTest = signet.reportDuckTypeErrors('duckTest');

            const nullCheck = checkDuckTest(null);
            const intCheck = checkDuckTest(55);
            const stringCheck = checkDuckTest('foo');

            assert.equal(JSON.stringify(nullCheck), '[["badDuckTypeValue","object",null]]');
            assert.equal(JSON.stringify(intCheck), '[["badDuckTypeValue","object",55]]');
            assert.equal(JSON.stringify(stringCheck), '[["badDuckTypeValue","object","foo"]]');
        });

    });

    describe('isRegisteredDuckType', function () {

        it('should allow querying of registered duck types', function () {
            signet.defineDuckType('duckFoo', {});

            assert.equal(signet.isRegisteredDuckType('duckFoo'), true);
            assert.equal(signet.isRegisteredDuckType('duckBar'), false);
        });

    });

    describe('whichVariantType', function () {

        it('should get variant type of value', function () {
            var getValueType = signet.whichVariantType('variant<string; int>');

            assert.equal(getValueType('foo'), 'string');
            assert.equal(getValueType(17), 'int');
            assert.equal(getValueType(17.5), null);
        });

    });

    describe('verifyValueType', function () {

        it('should return value when it matches type correctly', function () {
            var stringValue = 'foo';
            var stringResult = signet.verifyValueType('string')(stringValue);

            var boundedIntValue = 5;
            var boundedIntResult = signet.verifyValueType('leftBoundedInt<4>')(boundedIntValue);

            assert.equal(stringResult, stringValue);
            assert.equal(boundedIntResult, boundedIntValue);
        });

        it('should throw an error if the value is of incorrect type', function () {
            var verifyStringValue = signet.verifyValueType('string');
            var verifyBoundedIntValue = signet.verifyValueType('leftBoundedInt<4>');

            assert.throws(() => verifyStringValue({}));
            assert.throws(() => verifyBoundedIntValue(-3));
        });

    });

    describe('iterateOn and recursiveTypeFactory', function () {

        function setImmutableValue(obj, key, value) {
            Object.defineProperty(obj, key, {
                writeable: false,
                value: value
            });
        }

        function cons(value, list) {
            const newNode = {};

            setImmutableValue(newNode, 'value', value);
            setImmutableValue(newNode, 'next', list);

            return newNode;
        }

        it('should allow easy creation of a recursive type', function () {

            const isListNode = signet.duckTypeFactory({
                value: 'int',
                next: 'composite<not<array>, object>'
            });

            const iterableFactory = signet.iterateOn('next');
            const isIntList = signet.recursiveTypeFactory(iterableFactory, isListNode);

            const testList = cons(1, cons(2, cons(3, cons(4, cons(5, null)))));

            assert.equal(isIntList(testList), true);
            assert.equal(isIntList({ value: 1 }), false);
            assert.equal(isIntList('blerg'), false);
        });

        it('should properly recurse through a binary tree with left and right values', function () {
            const isBinaryTreeNode = signet.duckTypeFactory({
                value: 'int',
                left: 'composite<^array, object>',
                right: 'composite<^array, object>',
            });

            function isOrderedNode(node) {
                return isBinaryTreeNode(node)
                    && ((node.left === null || node.right === null)
                        || (node.value > node.left.value
                            && node.value <= node.right.value));
            }

            signet.subtype('object')('orderedBinaryTreeNode', isOrderedNode);

            function iteratorFactory(value) {
                var iterable = [];

                iterable = value.left !== null ? iterable.concat([value.left]) : iterable;
                iterable = value.right !== null ? iterable.concat([value.right]) : iterable;

                return signet.iterateOnArray(iterable);
            }

            signet.defineRecursiveType('orderedBinaryTree', iteratorFactory, 'orderedBinaryTreeNode');

            const isOrderedIntTree = signet.isTypeOf('orderedBinaryTree');

            const goodBinaryTree = {
                value: 0,
                left: {
                    value: -1,
                    left: null,
                    right: null
                },
                right: {
                    value: 1,
                    left: {
                        value: 1,
                        left: null,
                        right: null
                    },
                    right: null
                }
            };

            const badTree = {
                value: 0,
                left: {
                    value: -1,
                    left: null,
                    right: null
                },
                right: {
                    value: -3,
                    left: {
                        value: 1,
                        left: null,
                        right: null
                    },
                    right: null
                }
            };

            const malformedTree = {
                value: 0,
                left: null
            };

            assert.equal(isOrderedIntTree(goodBinaryTree), true);
            assert.equal(isOrderedIntTree(badTree), false);
            assert.equal(isOrderedIntTree(malformedTree), false);

        });

    });

});