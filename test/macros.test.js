var signetBuilder = require('../index');

var assert = require('chai').assert;
var timerFactory = require('./timer');

describe('Signet Macros', function () {

    var signet;
    var timer;

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

    describe('type-level macros', function () {

        it('should support option type macro', function () {
            assert.equal(signet.isTypeOf('?string')(undefined), true);
            assert.equal(signet.isTypeOf('?string')('foo'), true);
            assert.equal(signet.isTypeOf('?string')({}), false);
        });

        it('should support defined type macro', function () {
            assert.equal(signet.isTypeOf('!*')(undefined), false);
            assert.equal(signet.isTypeOf('!*')(null), false);
            assert.equal(signet.isTypeOf('!*')({}), true);
        });

        it('should support an empty parentheses "any" type macro', function () {
            assert.equal(signet.isTypeOf('()')('foo'), true);
            assert.doesNotThrow(signet.enforce('() => undefined', function () { }));
        });

        it('should support a not macro', function () {
            assert.equal(signet.isTypeOf('^string')('foo'), false);
            assert.equal(signet.isTypeOf('^string')(null), true);
        });

    });

    describe('Signature-level Macros', function () {

        it('should parse function definition with nested function definition', function () {
            var doStuff = signet.sign('(* => boolean) => array', () => []);

            assert.equal(doStuff.signature, 'function<* => boolean> => array');
        });

    });

    describe('Macro handling', function () {

        it('should properly sign a function using macros', function () {
            var expectedValue = 'something:[not<variant<undefined, null>>], somethingElse:[variant<undefined;null;string>], aFunction:function<* => *> => null';
            var testFn = signet.enforce(
                'something:[!*], somethingElse:[?string], aFunction:(* => *) => null',
                () => null
            );

            assert.equal(testFn.signature, expectedValue);
        });

    });

});