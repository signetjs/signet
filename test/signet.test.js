var signetBuilder = require('../index');
var parser = require('signet-parser');
var assert = require('chai').assert;

describe('Signet Library', function () {

    var signet;

    function addBuilder() {
        return function (a, b) {
            return a + b;
        }
    }

    beforeEach(function () {
        signet = signetBuilder();
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
        signet.subtype('number')('int', function (value) { return Math.floor(value) === value; });

        assert.equal(signet.isSubtypeOf('number')('int'), true);
        assert.equal(signet.isTypeOf('int')(15), true);
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

        assert.equal(add.length, originalAdd.length);
        assert.equal(add.toString(), originalAdd.toString());
    });

    it('should enforce a function with a correct argument count', function () {
        var add = signet.enforce('number, number => number', addBuilder());
        var expectedMessage = 'Expected a value of type number but got 6 of type string';

        assert.equal(add.length, 2);
        assert.throws(add.bind(null, 5, '6'), expectedMessage);
    });

    it('should enforce a function return value', function () {
        var add = signet.enforce('number, number => number', function (a, b) {
            return true;
        });

        var expectedMessage = 'Expected a return value of type number but got true of type boolean'

        assert.throws(add.bind(null, 3, 4), expectedMessage);
    });

    it('should return result from enforced function', function () {
        var add = signet.enforce('number, number => number', addBuilder());

        assert.equal(add(3, 4), 7);
    });

    it('should enforce a curried function properly', function () {
        function add (a){
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

});