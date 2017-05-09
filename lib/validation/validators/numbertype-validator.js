const Validator = require ('../validator')
    ,   validators = require ('./index');

function NumberTypeValidator () {}

Validator.inherits (NumberTypeValidator);

NumberTypeValidator.prototype.rule = function (val)
{
	return !isNaN(val);
}

NumberTypeValidator.prototype.errorCode = 3;
NumberTypeValidator.prototype.errorMessage = "Value is not a number";

validators.numberType = module.exports = exports = new NumberTypeValidator();