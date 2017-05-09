const inheritor = require ('../helpers/inheritor');

function SecurizedGroup (name, id)
{
	this.id = id;
	this.name = name;
}

inheritor.inherits (SecurizedGroup);

exports.anonymousGroup = SecurizedGroup.anonymousGroup = function ()
{
	return SecurizedGroup.__anonymousGroup;
};

exports.rootGroup = SecurizedGroup.rootGroup = function ()
{
	return SecurizedGroup.__rootGroup;
};

exports.get = SecurizedGroup.get = function (name)
{
	var grp = SecurizedGroup.exists (name);
	if (grp) return grp;
	
	return SecurizedGroup.__create (name);
}

exports.exists = SecurizedGroup.exists = function (arg)
{
	if (typeof arg == 'number')
	{
		return SecurizedGroup.__groupsByUid.hasOwnProperty (arg) ? SecurizedGroup.__groupsByUid[arg] : false;
	}
	else
	{
		return SecurizedGroup.__groupsByName.hasOwnProperty (arg) ? SecurizedGroup.__groupsByName[arg] : false;
	}
}

SecurizedGroup.__create = function (name)
{
	var grp = new SecurizedGroup (name, SecurizedGroup.__nextUid());
	SecurizedGroup.__groupsByUid[grp.id] = grp;
	SecurizedGroup.__groupsByName[grp.name] = grp;
	return grp;
}

SecurizedGroup.__nextUid = function ()
{
	return this.__uidCount++;
};

SecurizedGroup.__groupsByUid = {};
SecurizedGroup.__groupsByName = {};
SecurizedGroup.__uidCount = -1;

SecurizedGroup.__anonymousGroup = SecurizedGroup.__create('anonymous');
SecurizedGroup.__rootGroup = SecurizedGroup.__create('root');