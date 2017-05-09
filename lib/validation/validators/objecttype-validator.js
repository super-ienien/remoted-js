const Validator = require ('../validator')
    ,   validators = require ('./index');

function ObjectTypeValidator () {}

Validator.inherits (ObjectTypeValidator);

ObjectTypeValidator.prototype.rule = function (val)
{
	return typeof val === 'object';
}

ObjectTypeValidator.prototype.errorCode = 4;
ObjectTypeValidator.prototype.errorMessage = "Value is not an object";

validators.objectType = module.exports = exports = new ObjectTypeValidator();