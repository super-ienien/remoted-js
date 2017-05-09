const Validator = require ('../validator')
    ,   validators = require ('./index');

function DateTypeValidator () {}

Validator.inherits (DateTypeValidator);

DateTypeValidator.prototype.rule = function (val)
{
	if (val instanceof Date)
	{
		return true;
	}
	else if (typeof val === 'string')
	{
		var d = new Date(val);
		return !isNaN(d.getTime());
	}
	return false;
}

DateTypeValidator.prototype.errorCode = 6;
DateTypeValidator.prototype.errorMessage = "Value is not an Date";

validators.dateType = module.exports = exports = new DateTypeValidator();