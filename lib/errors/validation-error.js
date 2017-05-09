function ValidationError (type, message, code, val)
{
	this.name = "ValidationError";
	this.type = type;
	this.code = code;
	this.message = "Validation failed : "+message;
	this.val = val;
}

ValidationError.prototype = Object.create (Error.prototype);
ValidationError.constructor = ValidationError;

exports = module.exports = ValidationError;