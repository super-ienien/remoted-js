const Validator = require ('../validator')
    ,   validators = require ('./index');

function EnumValidator (e)
{
	this.enum = e;
}

Validator.inherits (EnumValidator);

EnumValidator.prototype.rule = function (val)
{
	return this.enum.indexOf(val) !== -1;
}

EnumValidator.prototype.errorCode = 11;
EnumValidator.prototype.errorMessage = function (val)
{
	"The value : '"+val+"' is not allowed";
}

validators.enum = module.exports = exports = EnumValidator;