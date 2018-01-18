type type = string | function;
type expectedType = type;
type actualValue = any;
type arguments = array | object;

class SignetApi {
    declare alias(aliasName: string, typeString: string): undefined;
    declare buildInputErrorMessage(validationResult: [expectedType, actualValue], args: array<any>, signatureTree: array<array<object>>): string;
    declare buildOutputErrorMessage(validationResult: [expectedType, actualValue], args: array<any>, signatureTree: array<array<object>>): string;
    declare duckTypeFactory(duckTypeDef: object): function;
    declare defineDuckType(typeName: string, duckTypeDef: object): undefined;
    declare defineExactDuckType(typeName: string, duckTypeDef: object): undefined;
    declare defineDependentOperatorOn(typeName: string, operator: string, operatorCheck: (valueA: any, valueB: any, typeDefinitionA: ?object, typeDefinitionB: ?object) => boolean): undefined;
    declare defineRecursiveType(typeName: string, iteratorFactory: function, nodeType: type, typePreprocessor: ?function): undefined;
    declare enforce(signature: string, functionToEnforce: function, options: ?object): function;
    declare exactDuckTypeFactory(duckTypeDef: object): function;
    declare isRegisteredDuckType(typeName: string): boolean;
    declare isSubtypeOf(rootTypeName: string): (typeNameUnderTest: string) => boolean;
    declare isType(typeName: string): boolean;
    declare isTypeOf(typeToCheck: type): (value: any) => boolean;
    declare iterateOn(iterationArray: array): () => any;
    declare recursiveTypeFactory(iteratorFactory: function, nodeType: type): (valueToCheck: any) => boolean;
    declare registerTypeLevelMacro(macro: function): undefined;
    declare reportDuckTypeErrors(duckTypeName: string): (valueToCheck: any) => array<[string, string, *]>;
    declare sign(signature: string, functionToSign: function): function;
    declare subtype(rootTypeName: string): (subtypeName: string, subtypeCheck: function, preprocessor: ?(string) => string) => undefined;
    declare typeChain(typeName: string): string;
    declare verify(signedFunctionToVerify:function, functionArguments:arguments): undefined;
    declare verifyValueType(typeToCheck:type): (value: any) => any;
    declare whichType(typeNames:array<string>): (value: any) => string | null;
    declare whichVariantType(variantString:string): (value: any) => string | null;
}

export = signet;

declare function signet(): SignetApi;


