# Signet #

## The fast, rich runtime documentation-through-type system for Javascript ##

At its core, Signet aims to be a first-line-of-defense documentation library
for your code. By attaching and enforcing rich type information to your
functions, you communicate with other developers what your intent is and
how they can use your code. Sometimes that other developer is future you!

Although Signet is a deep, rich, extensible type system, the most important
first takeaway is Signet is easy to use.  Unlike other documentation libraries
which require a lot of time and effort to get familiar with, Signet provides
a familiar, simple means to fully document your behavior up front, like this:

```
    const add = signet.enforce(
        'a:number, b:number => sum:number`,
        (a, b) => a + b
    );
```

Obviously, this is a trivial example, but it is easy to immediately understand
what our add function requires and what it will do. More importantly, if someone
were to try to use our function incorrectly, they would get a clear message:

```
    add('foo', 23); // TypeError: Expected value of type a:number, but got foo of type string
```

Moreover, if this developer wanted to understand what the add function expected, they
could simply request the signature:

```
    console.log(add.signature); // a:number, b:number => sum:number
```

All of a sudden, those API endpoints which were left undocumented can be easily
updated to provide parameter and result information without a lot of extra developer
time.  This kind of in-code documentation and type checking facilitates tribal 
knowledge even if a member of the tribe has long left.

Finally, Signet won't let your documentation get out of date.  Since Signet does real type checking and a review of your function properties against your signature, if you add parameters or change your function, Signet will let you know your documentation is out of date.

All of this only scratches the surface of what you can do with Signet.  You can define your own types, use constructed and algebraic types and even define macros to alter type strings just in time. Beyond that, Signet is 100% ECMAScript 5.1 (Harmony) compliant, so there is no need to transpile anything. As long as your code works, Signet works.

Remember, code is not just a program to be run, it is a document programmers read.  Wouldn't you like your document to tell you more?

## Install Signet ##

Signet is available through NPM:

`npm i signet --save`

You can also find it on the NPM site for more information:

[https://www.npmjs.com/package/signet](https://www.npmjs.com/package/signet)

## Library Usage ##

First it is recommended that you create a types file so the local signet object can be cached for your module:

```
    const signet = require('signet')();
    
    //my aliased type
    signet.alias('foo', 'string');

    //If you're in node, be sure to export your signet instance!
    module.exports = signet;
```

Now, include your types file into your other files and the signet types object will be properly enclosed in your module. Now you're ready to get some type and document work done:

```
const signet = require('./mySignetTypesFile');

const range = signet.enforce(
    'start < end :: start:int, end:int, increment:leftBoundedInt<1> => array<int>',
    (start, end, increment) => {
        let result = [];

        for(let i = start; i <= end; i += increment) {
            result.push(i);
        }

        return result;
    }
);
```

## Basic Operators and Syntactic Characters ##

- Type names -- All primary type names should adhere to the list of supported types below
- Subtype names -- Subtype names must not contain any reserved characters as listed next
- `<>` -- Angle brackets are for handling type constructors and verify value only when type logic supports it
- `[]` -- Brackets are meant to enclose optional values and should always come in a matched pair
- `=>` -- Function output "fat-arrow" notation used for expressing output from input
- `,` -- Commas are required for separating types on functions
- `:` -- Colons allow for object:instanceof annotation - This is not required or checked
- `;` -- Semicolons allow for multiple values within the angle bracket notation
- `()` -- Optional parentheses to group types, which will be treated as spaces by interpreter

Example function signatures:

- Empty argument list: `"() => function"`
- Simple argument list: `"number, string => boolean"`
- Subtyped object: `"object:InstantiableName => string"`
- Typed array: `"array<number> => string"`
- Optional argument: `"array, [number] => number"`
- Curried function: `"number => number => number"`

## Primary Types ##

Signet supports all of the core Javascript types as well as a few others, which allow
the core typesystem to be approachable, clear and easy to relate to for anyone 
familiar with Javascript and its built-in dynamic types.

List of primary types:

- `*`
- `array`
- `boolean`
- `function`
- `null`
- `number`
- `object`
- `string`
- `symbol`
- `undefined`

## Extended types ##

Signet has extended types provided as a separate module.  In the node environment, the extended types
are included in the required module, but can be removed by pointing to the signet.js module directly.
In the browser environment, signet.min.js and signet.types.min.js in that order to include the extended types.

Extended types, and their inheritance chain, are as follows:

- `arguments` - `* -> variant<array; object>`
- `bounded<min:number;max:number>` - `* -> number -> bounded`
- `boundedInt<min:number;max:number>` - `* -> number -> int -> bounded -> boundedInt`
- `boundedString<minLength:int;maxLength:int>` - `* -> string -> boundedString`
- `composite` - `* -> composite` (Type constructor only, evaluates left to right)
- `formattedString<regex>` - `* -> string -> formattedString`
- `int` - `* -> number -> int`
- `leftBounded<min:number>` - `* -> number -> leftBounded`
- `leftBoundedInt<min:int>` - `* -> number -> int -> leftBoundedInt`
- `not` - `* -> not` (Type constructor only)
- `regexp` - `* -> object -> regexp`
- `rightBounded<max:number>` - `* -> number -> rightBounded`
- `rightBoundedInt<max:int>` - `* -> number -> int -> rightBoundedInt`
- `tuple<type;type;type...>` - `* -> object -> array -> tuple`
- `unorderedProduct<type;type;type...>` - `* -> object -> array -> unorderedProduct`
- `variant<type;type;type...>` - `* -> variant`

## Macro Types ##

Signet supports type-level and signature-level macros. There are a small set of built-in macros which are as follows:

- `()` - type-level macro for `*`
    - Example: `()` becomes `*`
- `!*` - type-level macro for `not<variant<undefined, null>>`
    - Example: `definedType:!*` becomes `definedType:not<undefined, null>`
- `^typeName` - type-level macro for `not<typeName>`
    - Example: `notNull:^null` becomes `notNull:not<null>`
- `?typeName` - type-level macro for `variant<undefined, null, typeName>`
    - Example: `maybeTuple:?tuple<*, *, *>` becomes `maybeTuple:variant<undefined, null, tuple<*, *, *>>`
- `(types => types => ...)` - signature-level macro for `function<types => types => ...>`
    - Example: `(string => int => null)` becomes `function<string => int => null>`

## Dependent types ##

Types can be named and dependencies can be declared between two arguments in the same call. Signet currently does not have the means to verify dependent types across function calls.  

Example for a range function might look like the following:

`start < end :: start:int, end:int, increment:[leftBoundedInt<1>] => array<int>`

Built in type operations are as follows:

- number: 
    - `=` (value equality)
    - `!=` (value inequality)
    - `<` (A less than B)
    - `>` (A greater than B)
    - `<=` (A less than or equal to B)
    - `>=` (A greater than or equal to B)
- string:
    - `=` (value equality)
    - `!=` (value inequality)
    - `#=` (length equality)
    - `#<` (A.length less than B.length)
    - `#>` (A.length greater than B.length)
- array
    - `#=` (length equality)
    - `#<` (A.length less than B.length)
    - `#>` (A.length greater than B.length)
- object:
    - `=` (property equality)
    - `!=`(property inequality)
    - `:>` (property superset)
    - `:<` (property subset)
    - `:=` (property congruence -- same property names, potentially different values)
    - `:!=` (property incongruence -- different property names)
- variant:
    - `=:` (same type)
    - `<:` (subtype)
    - `>:` (supertype)

### Signet behaviors ###

Signet can be used two different ways to sign your functions, as a function wrapper or as a decoration of your function. 
Below are examples of the two use cases:

Function wrapper style:

```
    const add = signet.sign('number, number => number',
    function add (a, b) {
        return a + b;
    });
    
    console.log(add.signature); // number, number => number
```

Function decoration style:

```
    signet.sign('number, number => number`, add);
    function add (a, b) {
        return a + b;
    }
```

Example of curried function type annotation:

```
    const curriedAdd = signet.sign(
        'number => number => number',
        (a) => (b) => a + b
    );
```

Signet signatures are immutable, which means once they are declared, they cannot be tampered with. This adds a guarantee
to the stability of your in-code documentation. Let's take a look:

```
    const add = signet.sign(
        'number, number => number',
        (a, b) => a + b
    );
    
    add.signature = 'I am trying to change the signature property';
    console.log(add.signature); // number, number => number
```

Arguments can be verified against the function signature by calling verify inside your function:

```
    function verifiedAdd (a, b) {
        signet.verify(add, arguments);

        return a + b;
    }
    
    signet.sign('number, number => number', verifiedAdd);
```

Functions can be signed and verified all in one call with the enforce function:

```
    const enforcedAdd = signet.enforce(
        'a:number, b:number => sum:number',
        (a, b) => a + b
    );
```

Curried functions are also fully enforced all the way down:

```
    const curriedAdd = signet.enforce(
        'a:number => b:number => sum:number',
        (a) => (b) => a + b
    );
    
    curriedAdd(1)('foo'); // Throws -- Expected type number, but got string
```

### Types and subtypes ###

New types can be added by using the extend function with a key and a predicate function describing the behavior of the data type

```
    signet.extend('foo', (value) => value !== 'bar');
    signet.isTypeOf('foo')('baz'); // false
```

Subtypes can be added by using the subtype function. This is particularly useful for defining and using business types or defining restricted types.

```
    signet.subtype('number')('int', (value) => Math.floor(value) === value && value !== infinity);
    
    const enforcedIntAdd = signet.enforce(
        'a:int, b:int => sum:int',
        (a, b) => a + b
    );
    
    enforcedIntAdd(1.2, 5); // Throws error
    enforcedIntAdd(99, 3000); // 3099
```

Using secondary type information for type constructor definition. Any secondary type strings for type constructors will be automatically split on ';' or ',' to allow for multiple type arguments.

```
    signet.subtype('array')('triple` function (value) {
        return isTypeOf(typeObj.valueType[0])(value[0]) &&
            isTypeOf(typeObj.valueType[1])(value[1]) &&
            isTypeOf(typeObj.valueType[2])(value[2]);
    });

    const multiplyTripleBy5 = signet.enforce(
        'triple<int; int; int> => triple<int; int; int>', 
        (values) => values.map(x => x * 5)
    );
    
    multiplyTripleBy5([1, 2]); // Throws error
    multiplyTripleBy5([1, 2, 3]); // [5, 10, 15]
```

Types can be aliased using the `alias` function. This allows the programmer to define and declare a custom type based on existing types or a particular implementation on constructed types.

```
    signet.alias('R3Point', 'triple<number; number; number>');
    signet.alias('R3Matrix', 'triple<R3Point; R3Point; R3Point>')
    
    signet.isTypeOf('R3Point')([1, 2, 3]); // true
    signet.isTypeOf('R3Point')([1, 'foo', 3]); // false
    
    // Matrix in R3:
    signet.isTypeOf('R3Matrix')([[1, 2, 3], [4, 5, 6], [7, 8, 9]]); // true
```

### Direct type checking ###

Types can be checked from outside of a function call with isTypeOf.  The isTypeOf function is curried, so a specific
type check can be reused without recomputing the type object definition:

```
    const isInt = signet.isTypeOf('int');
    isInt(7); // true
    isInt(83.7); // false
    
    const isRanged3to4 = signet.isTypeOf('ranged<3;4>');
    isRanged3to4(3.72); // true
    isRanged3to4(4000); // false
```

### Object duck typing ###

Duck typing functions can be created using the duckTypeFactory function.  This means, if an object 
type depends on extant properties with correct types, it can be predefined with an object type definition.

```
    const myObjDef = { foo: 'string', bar: 'array' };
    const checkMyObj = signet.duckTypeFactory(myObjDef);

    signet.subtype('object')('myObj', checkMyObj);

    signet.isTypeOf('myObj')({ foo: 'testing', bar: [] }); // true
    signet.isTypeOf('myObj')({ foo: 'testing' }); // false
    signet.isTypeOf('myObj')({ foo: 42, bar: [] }); // false
```

### Building Recursive Types ###

Though recursive types such as trees and linked lists can be created with the signet type definition method, but this requires a fair amount of recursive thinking. Instead, Signet provides a means for simply creating recursive types without the recursive thinking.  

Here is an example of creating a linked list type function:

```
    const isListNode = signet.duckTypeFactory({
        value: 'int',
        next: 'composite<not<array>, object>'
    });

    const iterableFactory = signet.iterateOn('next');
    const isIntList = signet.recursiveTypeFactory(iterableFactory, isListNode);
```

To create a more complex type like a binary tree, we would do the following:

```
    const isBinaryTreeNode = signet.recursiveTypeFactory('binaryTreeNode', {
        value: 'int',
        left: 'composite<^array, object>',
        right: 'composite<^array, object>',
    });

    const isNodeOrNull = (node) => node === null || isBinaryTreeNode(node);

    function isOrderedNode (node) {
        return isBinaryTreeNode(node)
            || isNodeOrNull(node.left)
            || isNodeOrNull(node.right)
            || (node.value > node.left 
                && node.value <= node.right);
    }

    signet.subtype('object')('orderedBinaryTreeNode', isOrderedNode);

    function iteratorFactory (value) {
        var iterable = [];

        iterable = value.left !== null ? iterable.concat([value.left]) : iterable;
        iterable = value.right !== null ? iterable.concat([value.right]) : iterable;

        return signet.iterateOnArray(iterable);
    }

    signet.defineRecursiveType('orderedBinaryTree', iteratorFactory, 'binaryTreeNode');
```

### Type Chain Information ###

Signet supports accessing a type's inheritance chain.  This means, if you want to know what a type does, you can review the chain
and get a rich understanding of the ancestors which make up the particular type.

```
    signet.typeChain('array'); // * -> object -> array
    signet.typeChain('tuple'); // * -> object -> array -> tuple
```

### Type-Level Macros ###

Signet supports the creation of type-level macros to handle special cases where a 
type definition might need some pre-processing before being processed. This is especially
useful if you want to create a type name which contains special characters.  The example
from Signet itself is the `()` type.

```
    const starTypeDef = parser.parseType('*');

    parser.registerTypeLevelMacro('()', function () { return starTypeDef; });

    signet.enforce('() => undefined', function () {})();
    signet.isType('()'); // false
```

### Type Constructor Arity Declaration ###

You can declare the number of arguments a type constructor requires (the arity of your type constructor) with curly-brace annotation at definition time.  Following are examples of declaring type constructor arity with enforce, subtype and alias:

```
    // variant requires at least 1 argument, though more are acceptable
    extend('variant{1,}', isVariant, optionsToFunctions); 

    // array accepts up to 1 argument
    subtype('object')('array{0,1}', checkArray);

    // leftBounded requires exactly 1 argument
    alias('leftBounded{1}', 'bounded<_, Infinity>')
```

## Signet API ###

- alias: `aliasName != typeString :: aliasName:string, typeString:string => undefined`
- buildInputErrorMessage: `validationResult:array, args:array, signatureTree:array, functionName:string => string`
- buildOutputErrorMessage: `validationResult:array, args:array, signatureTree:array, functionName:string => string`
- duckTypeFactory: `duckTypeDef:object => function`
- defineDuckType: `typeName:string, duckTypeDef:object => undefined`
- defineExactDuckType: `typeName:string, duckTypeDef:object => undefined`
- defineDependentOperatorOn: `typeName:string => operator:string, operatorCheck:function => undefined`
- defineRecursiveType: `typeName:string, iteratorFactory:function, nodeType:type, typePreprocessor:[function] => undefined`
- enforce: `signature:string, functionToEnforce:function, options:[object] => function`
    - currently supported options:
        - inputErrorBuilder: `[validationResult:array], [args:array], [signatureTree:array] => 'string'`
        - outputErrorBuilder: `[validationResult:array], [args:array], [signatureTree:array] => 'string'`
- extend: `typeName:string, typeCheck:function, preprocessor:[function] => undefined`
- exactDuckTypeFactory: `duckTypeDef:object => function`
- isRegisteredDuckType: `typeName:string => boolean`
- isSubtypeOf: `rootTypeName:string => typeNameUnderTest:string => boolean`
- isType: `typeName:string => boolean`
- isTypeOf: `typeToCheck:type => value:* => boolean`
- iterateOn: `propertyKey:string => value:* => undefined => *`
- iterateOnArray: `iterationArray:array => undefined => *`
- recursiveTypeFactory: `iteratorFactory:function, nodeType:type => valueToCheck:* => boolean`
- registerTypeLevelMacro: `macro:function => undefined`
- reportDuckTypeErrors: `duckTypeName:string => valueToCheck:object => array<tuple<string; string; *>>`
- sign: `signature:string, functionToSign:function => function`
- subtype: `rootTypeName:string => subtypeName:string, subtypeCheck:function, preprocessor:[function] => undefined`
- typeChain: `typeName:string => string`
- verify: `signedFunctionToVerify:function, functionArguments:arguments => undefined`
- whichType: `typeNames:array<string> => value:* => variant<string; null>`
- whichVariantType: `variantString:string => value:* => variant<string; null>`

## Change Log ##

### 3.15.0 ###

- Added isRegisteredDuckType

### 3.14.0 ###

- Updated duck type error reporter to resolve type-level macros to their proper types

### 3.13.0 ###

- Added `^typeName` macro for `not<typeName>`

### 3.12.0 ###

- Added `!*` macro for `not<variant<undefined, null>>`

### 3.11.0 ###

- Added support for declaring type constructor arity

### 3.10.0 ###

- Added `not` type negation and `composite` type composition

### 3.9.0 ###

- Added #=, #< and #> operators for string and array

### 3.8.0 ###

- Added exact duck types to limit types to only those specified

### 3.7.0 ###

- Added nested function type declarations

### 3.6.0 ###

- Added partial application to type constructors in type aliasing

### 3.5.0 ###

- Exposed preprocessor option for extend and subtype functions

### 3.4.0 ###

- Updated error messages to include function name as available

### 3.3.0 ###

- Added object context preservation to ensure constructors and methods can safely be
decorated and standard bind, call and apply actions work as expected

### 3.2.0 ###

- Added support for multiple dependent type expressions

### 3.1.0 ###

- Extended reportDuckTypeErrors to perform a recursive search through an object when possible

### 3.0.0 ###

- Added escape character `%` to parser to allow for special characters in type arguments

### 2.0.0 ###

- Moved to macros which operate directly on uncompiled strings

### 1.10.0 ###

- Introduced type-level macros

### 1.9.0 ###

- Enhanced 'type' type check to verify type is registered

### 1.6.0 ###

- Added new types:
    - `leftBounded<min:number>` -- value must be greater than or equal to min
    - `rightBounded<max:number>` -- value must be less than or equal to max
    - `leftBoundedInt<min:number>` -- value must be greater than or equal to min
    - `rightBoundedInt<max:number>` -- value must be less than or equal to max

### 1.5.0 ###

- Added unorderedProduct -- like tuple but values can be in any order

## Breaking Changes

### 2.0.0 ###

- Moved to macros which operate directly on uncompiled strings

### 1.0.0 ###

- No-argument type '`()`' no longer supported
- TaggedUnion deprecated in preference for 'variant' 

### 0.18.0 ###

- Function signatures now verify parameter length against total length and length of required paramters.

### 0.16.x ###

- Signet and SignetTypes are now factories in node space to ensure types are encapsulated only in local module.  

### 0.9.x ###

- valueType is now an array instead of a string; any type constructor definitions relying on a string will need updating

### 0.4.x ###

- Any top-level types will now cause an error if they are not part of the core Javascript types or in the following list:
    - ()
    - any
    - array
    - boolean
    - function
    - number
    - object
    - string
    - symbol