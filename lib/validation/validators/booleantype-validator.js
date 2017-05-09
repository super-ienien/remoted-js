const Validator = require ('../validator')
,   validators = require ('./index');

function BooleanTypeValidator () {}

Validator.inherits (BooleanTypeValidator);

BooleanTypeValidator.prototype.rule = function (val)
{
	return typeof val === 'boolean';
}

BooleanTypeValidator.prototype.errorCode = 5;
BooleanTypeValidator.prototype.errorMessage = "Value is not a boolean";

validators.booleanType = module.exports = exports = new BooleanTypeValidator();