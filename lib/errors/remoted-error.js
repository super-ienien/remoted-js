function RemotedError (message)
{
	this.name = "RemotedError";
	this.message = message;
}

RemotedError.prototype = Object.create (Error.prototype);
RemotedError.constructor = RemotedError;

exports = module.exports = RemotedError;