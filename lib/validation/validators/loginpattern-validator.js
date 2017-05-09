const Validator = require ('../validator')
    ,   validators = require ('./index');

function LoginPatternValidator (){}

Validator.inherits (LoginPatternValidator);

LoginPatternValidator.prototype.rule = function (val)
{
	if (typeof this.User === 'undefined') this.User = require ('../../models/user');
	return this.User.loginPattern.test (this.User.nameToLogin(val));
}

LoginPatternValidator.prototype.errorCode = 101;
LoginPatternValidator.prototype.errorMessage = "login must contain only alphanumerical or digits";

validators.loginpattern = module.exports = exports = new LoginPatternValidator();