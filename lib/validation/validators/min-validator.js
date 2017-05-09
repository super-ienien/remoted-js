const Validator = require ('../validator')
    ,   validators = require ('./index');

function MinValidator (min)
{
	this.min = min;
}

Validator.inherits (MinValidator);

MinValidator.prototype.rule = function (val)
{
	return val > this.min;
}

MinValidator.prototype.errorCode = 12;
MinValidator.prototype.errorMessage = function (val) 
{
	return val +" is inferior to : '"+this.min+"'";
}

validators.min = module.exports = exports = MinValidator;