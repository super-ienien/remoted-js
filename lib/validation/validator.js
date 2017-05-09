const inheritor = require('../helpers/inheritor')
,   ValidationError = require('../errors/validation-error')
,   validators = require('./validators/index');

function Validator () {}

module.exports = exports = Validator;

Validator.prototype.errorCode = 0;
Validator.prototype.errorMessage = '';
Validator.prototype.type = "any";

Validator.prototype.rule = function () {return true;};


Validator.prototype.validate = function (val)
{
	if (!this.rule (val))
	{
		throw new ValidationError (this.type, typeof this.errorMessage === 'function' ? this.errorMessage(val):this.errorMessage, this.errorCode, val);
	}
	else
	{
		return true;
	}
};

Validator.inherits = function (constructor)
{
	inheritor.inherits (constructor, Validator);
	constructor.prototype.type = constructor.name.toLowerCase().slice(0,-9);
};

validators.any = new Validator();