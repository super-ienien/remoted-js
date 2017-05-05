var inheritor = require ('../helpers/inheritor')
,   SecurizedUser = require ('./securizeduser');

exports = module.exports = Securized;

function Securized ()
{
	this._owner = SecurizedUser.__anonymousUser;
}

inheritor.inherits (Securized);

Securized.__inherits = Securized.inherits;
Securized.__implements = Securized.implements;

Securized.inherits = function (constructor)
{
	Securized.__inherits (constructor);
	constructor.chown (SecurizedUser.__rootUser);
};

Securized.implements = function (constructor)
{
	Securized.__implements (constructor);
	constructor.chown (SecurizedUser.__rootUser);
};

Securized.allowGrp = function (operation, group, allowed)
{
	if (typeof this.$operations === 'undefined')
	{
		this.$operations = {
			create: {
				users: {}
			,   groups: {}
			}
		,   destroy: {
				users: {}
			,   groups: {}
			}
		}
	}
	allowed = allowed !== false ? true:false;
	switch (operation)
	{
		case 'create':
		case 'destroy':
		break;
		default:
		return;
	}
	if (allowed)
	{
		this.$operations[operation].groups[group.id] = true;
	}
	else
	{
		delete this.$operations[operation].groups[group.id];
	}

}

Securized.allowUsr = function (operation, user, allowed)
{
	if (typeof this.$operations === 'undefined')
	{
		this.$operations = {
			create: {
				users: {}
			,   groups: {}
			}
		,   destroy: {
				users: {}
			,   groups: {}
			}
		}
	}
	allowed = allowed !== false ? true:false;
	switch (operation)
	{
		case 'create':
		case 'destroy':
		break;
		default:
		return;
	}
	if (allowed)
	{
		this.$operations[operation].users[user.id] = true;
	}
	else
	{
		delete this.$operations[operation].users[user.id];
	}
}



Securized.owner = Securized.prototype.owner = function owner ()
{
	return this._owner;
};

Securized.chown = Securized.prototype.chown = function chown (owner)
{
	this._owner = owner;
};

Securized.__defaultModes = {u:{r: true, w: true, x: true}, g: {r: false, w: false, x: false}, o:{r: false, w: false, x: false}};
Securized.__superMode = {r: true, w: true, x: true};
Securized.__noneMode = {r: false, w: false, x: false};


// args : property, operation, user
Securized.canCreate = function (user)
{
	if(user.superUser()) return true;
	return typeof this.$operations !== 'undefined' && (this.$operations['create'].groups[user.group().id] || this.$operations['create'].users[user.id]);
};

Securized.canDestroy = function (user)
{
	if(user.superUser()) return true;
	return typeof this.$operations !== 'undefined' && (this.$operations['destroy'].groups[user.group().id] || this.$operations['destroy'].users[user.id]);
};

Securized.isAllowed = Securized.prototype.isAllowed = function isAllowed ()
{
	return Securized.__isAllowed.apply(this, arguments);
};

Securized.__isAllowed = function __isAllowed ()
{
	var user, operation, property;
	
	if (arguments.length === 3)
	{
		property = arguments[0];
		operation = arguments[1];
		user = arguments[2];
	}
	else if (arguments.length === 2)
	{
		operation = arguments[0];
		user = arguments[1];
		property = "__defaultmode__";		
	}
	else
	{
		throw new Error ('invalid arguments length');
		return;
	}
	
	switch (operation)
	{
		case 'r':
		case 'w':
		case 'x':
		break;
		default:
			throw new Error ('operation "'+operation+'" unknow in function isAllowed of "Securized"');
			return false;
	}
	if (user.superUser()) return true;
	return Securized.__privateModeFor.call (this, property, user)[operation];
};

Securized.__privateModeFor = function __privateModeFor(property, user)
{
	if (this._modes.hasOwnProperty(property))
	{
		if (Securized.__isOwner.call (this, user))
		{
			return this._modes[property].u;
		}
		else if (Securized.__isGroup.call (this, user))
		{
			return this._modes[property].g;
		}
		else if (Securized.__isOther.call (this, user))
		{
			return this._modes[property].o;
		}
		if (user.superUser()) return Securized.__superMode;
	}
	return Securized.__noneMode;
}

Securized.__modeFor = function (property, user)
{
	if (this._modes.hasOwnProperty(property))
	{
		if (Securized.__isOwner.call (this, user))
		{
			return _copyMode (this._modes[property].u);
		}
		else if (Securized.__isGroup.call (this, user))
		{
			return _copyMode (this._modes[property].g);
		}
		else if (Securized.__isOther.call (this, user))
		{
			return _copyMode (this._modes[property].o);
		}
		if (user.superUser()) return _copyMode(Securized.__superMode);
	}
	return _copyMode (Securized.__noneMode);
};

Securized.userIs = Securized.prototype.userIs = function userIs (user)
{
	if (user.superUser()) return 's';
	if (Securized.__isOwner.call (this, user)) return 'u';
	if (Securized.__isGroup.call (this, user)) return 'g';
	return 'o';
};

Securized.isOwner = Securized.prototype.isOwner = function isOwner (user)
{
	return Securized.__isOwner.call (this, user);
};

Securized.isGroup = Securized.prototype.isGroup = function isGroup (user)
{
	return Securized.__isGroup.call (this, user);
};

Securized.isOther = Securized.prototype.isOther = function isOther (user)
{
	return Securized.__isOwner.call (this, user);
};

Securized.__isOwner = function __isOwner (user)
{
	return this._owner.id === user.id;
};

Securized.__isGroup = function __isGroup (user)
{
	return this._owner.group().id === user.group().id;
};

Securized.__isOther = function __isOther (user)
{
	return !(Securized.__isOwner.call(this, user) || Securized.__isGroup.call(this, user));
};

Securized.chmodStatic = function chmodStatic ()
{
	if (typeof this._modes === 'undefined') this._modes = {};
	if (typeof arguments[0] == 'object')
	{
		var modeMap = arguments[0];
		for (var i in modeMap)
		{
			Securized.__chmod.call (this, i, modeMap[i]);
		}
	}
	else
	{
	
		if (typeof arguments[0] === 'number')
		{
			Securized.__chmod.call (this, '__defaultmode__', arguments[0]);
		}
		else
		{
			Securized.__chmod.apply (this, arguments);
		}
	}
};

Securized.chmod =  function chmod ()
{
	if (typeof this.prototype._modes === 'undefined') this.prototype._modes = {};
	if (typeof arguments[0] == 'object')
	{
		var modeMap = arguments[0];
		for (var i in modeMap)
		{
			Securized.__chmod.call (this.prototype, i, modeMap[i]);
		}
	}
	else
	{
		Securized.__chmod.apply (this.prototype, arguments);
	}
};

Securized.__chmod = function __chmod (property, mode, user)
{
	if (!this._modes.hasOwnProperty (property)) this._modes[property] = _copyModes (Securized.__defaultModes);
	if (user != undefined && !/^[ugo]{1,3}$/.test (user)) return;
	var users = {};
	if (user != undefined)
	{
		if (/u/.test (user)) users.u = mode;
		if (/g/.test (user)) users.g = mode;
		if (/o/.test (user)) users.o = mode;
	}
	else
	{
		if (typeof mode == 'number') 
		{
			if (mode > 99)
			{			
				mode = String (mode);
			}
			else if (mode < 100 && mode > 9)
			{
				mode = '0' + String (mode);
			}
			else if (mode < 10 && mode >= 0)
			{
				mode = String (mode);
				mode = mode + mode + mode;
			}
			else
			{
				mode = '000';
			}
		}
		if (mode.length != 3) return;
		users.u = Number(mode.charAt(0));
		users.g = Number(mode.charAt(1));
		users.o = Number(mode.charAt(2));
	}
	for (var i in users)
	{
		if (isNaN(users[i]) || users[i] < 0 || users[i] > 7) continue;
		this._modes[property][i].r = (users[i] & 4) === 4;
		this._modes[property][i].w = (users[i] & 2) === 2;
		this._modes[property][i].x = (users[i] & 1) === 1;
	}
};

function _copyModes (modes)
{
	return {
		u: _copyMode (modes.u),
		g: _copyMode (modes.g),
		o: _copyMode (modes.o)
	};
}

function _copyMode (mode)
{
	return {
		r: mode.r
	,   w: mode.w
	,   x: mode.x
	};
}
