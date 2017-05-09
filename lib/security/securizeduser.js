const inheritor = require ('../helpers/inheritor')
,    SecurizedGroup = require ('./securizedgroup');

exports = module.exports = SecurizedUser;

function SecurizedUser ()
{
	this._superUser = false;
	this._group  = SecurizedGroup.anonymousGroup();
}

inheritor.inherits (SecurizedUser);

SecurizedUser.prototype.superUser = function superUser ()
{
	return this._superUser;
};

SecurizedUser.prototype.anonymous = function ()
{
	return this._group == SecurizedGroup.anonymousGroup();
};

SecurizedUser.prototype.group = function group ()
{
	return this._group;
};

SecurizedUser.prototype.chgrp = function chgrp (group)
{
	this._group = group;
};

SecurizedUser.su = function su (user)
{
	user._superUser = true;
};

SecurizedUser.nu = function nu (user)
{
	user._superUser = false;
};

SecurizedUser.sudo = function sudo (todo, user)
{
	user._superUser = true;
	todo();
	user._superUser = false;
};

SecurizedUser.__anonymousUser = new SecurizedUser ();
SecurizedUser.__rootUser = new SecurizedUser ();
SecurizedUser.__rootUser.chgrp (SecurizedGroup.rootGroup());