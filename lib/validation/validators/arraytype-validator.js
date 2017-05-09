const Validator = require ('../validator')
,   validators = require ('./index');

function ArrayTypeValidator () {}

Validator.inherits (ArrayTypeValidator);

ArrayTypeValidator.prototype.rule = function (val)
{
	return val instanceof Array;
};

ArrayTypeValidator.prototype.errorCode = 6;
ArrayTypeValidator.prototype.errorMessage = "Value is not an array";

validators.arrayType = module.exports = exports = new ArrayTypeValidator();