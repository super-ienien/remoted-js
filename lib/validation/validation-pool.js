require ('./validators/index');
const validatorsList = require ('./validators/index')
      ,  Validator = require ('./validator');

function ValidationPool ()
{
	this.validators = {};
	this.length = 0;
}

module.exports = exports = ValidationPool;

ValidationPool.prototype.add = function (validator, args)
{
	if (typeof validator === 'string')
	{
		if (!validatorsList.hasOwnProperty (validator)) throw new Error ('unknow validator : '+validator);
		if (typeof validatorsList[validator] === 'function')
		{
			validator = new validatorsList[validator](args);
		}
		else
		{
			validator = validatorsList[validator];
		}
	}
	if (!this.validators.hasOwnProperty(validator.type)) this.length++;
	this.validators[validator.type] = validator;
}

ValidationPool.prototype.validate = function (val, resultRef)
{
	var result = typeof resultRef === 'object' ?  resultRef:{};
	var v;
	
	result.invalid = {};
	result.valid =  {};
	
	for (var i in this.validators)
	{
		try
		{
			this.validators[i].validate(val);
			result.valid[i] = true;
		}
		catch (error)
		{
			console.log (error);
			result.invalid[i] = true;
			result.isInvalid = true;	
		}
	}
	if (!result.hasOwnProperty ('isInvalid'))
	{
		result.isValid = true;
		result.isInvalid = false;
	}
	return resultRef ? result.isValid : result;
}


ValidationPool.prototype.validateArray = function (arr, resultRef)
{
	var result = typeof resultRef === 'object' ?  resultRef:{};
	var v;
	
	result.invalid = {};
	result.valid =  {};
	
	if (!Array.isArray(arr))
	{
		result.invalid['arrayType'] = true
		result.isInvalid = true;
	}
	
	for (var i in this.validators)
	{
		for (var j = 0, l = arr.length; j<l; j++)
		{
			try
			{
				this.validators[i].validate(arr[j]);
			}
			catch (error)
			{
				console.log (error);
				result.invalid[i] = true;
				result.isInvalid = true;
				break;
			}
		}
		if (!result.invalid[i]) result.valid[i] = true;
	}

	if (!result.hasOwnProperty ('isInvalid'))
	{
		result.isValid = true;
		result.isInvalid = false;
	}
	return resultRef ? result.isValid : result;
};