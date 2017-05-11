const util = require("util");

function Inheritor (){}

Inheritor.prototype.inherits = function (constructor)
{
	console.log (constructor.name + ' inherits ' + this.name);
	inherits (constructor, this);
};

Inheritor.prototype.implements = function (constructor)
{
	console.log (constructor.name + ' implements ' + this.name);
	implements (constructor, this);
};

Inheritor.prototype.is = function (constructor)
{
	var self = this;
	while (self.hasOwnProperty ('__super'))
	{
		if (self.__super === constructor) return true;
		self = self.__super;
	}
	return false;
}

Inheritor.prototype.has = function (constructor)
{
	if (typeof constructor != 'function') return false;
	while (constructor.hasOwnProperty ('__super'))
	{
		if (this === constructor.__super) return true;
		constructor = constructor.__super;
	}
	return false;
}

var inherits = function (constructor, superConstructor)
{
	var inheritor = new Inheritor ();
	if (superConstructor)
	{
		if (constructor.prototype !== superConstructor.prototype) util.inherits(constructor, superConstructor);
		constructor.__super = constructor.prototype.__super = superConstructor;
		for (let i in superConstructor)
		{
			if (i.startsWith('__')) continue;
			if (i === 'listenerCount') continue;
			constructor[i] = superConstructor[i];
		}
	}
	constructor.inherits = inheritor.inherits;
	constructor.implements = inheritor.implements;
	constructor.is = inheritor.is;
	constructor.has = inheritor.has;
	constructor.prototype.__static = constructor;
	constructor.prototype.__super = superConstructor;
}

var implements = function (constructor, superConstructor)
{
	var i;
	if (typeof superConstructor == 'function')
	{
		for (i in superConstructor)
		{
			if (i.startsWith('__')) continue;
			if (i == 'inherits') continue;
			if (i == 'implements') continue;
			if (i == 'listenerCount') continue;
			constructor[i] = superConstructor[i];
		}
		for (i in superConstructor.prototype)
		{
			if (i == '__static') continue;
			constructor.prototype[i] = superConstructor.prototype[i];
		}
	}
	else if (typeof superConstructor == 'object')
	{
		for (i in superConstructor)
		{
			constructor.prototype[i] = superConstructor[i];
		}
	}
}

exports.inherits = inherits;
exports.implements = implements;