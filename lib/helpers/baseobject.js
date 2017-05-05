var events = require("events")
	,   util = require('./util')
	,   inheritor = require('./inheritor');
  
exports = module.exports = BaseObject;

function BaseObject (parent)
{
	events.EventEmitter.call(this);
	this.setMaxListeners(200);
	this.initialized;
	this.destroyed = false;


    this.__autoDestroyHandler = __autoDestroyHandler.bind(this);
    this.__initHooks = null;

    this.__registeredListeners = {};
	this.parent = parent;
}

inheritor.inherits(BaseObject, events.EventEmitter);

BaseObject.prototype.addListener = BaseObject.prototype.on = function on (type, listener)
{
	if (type == 'initialized' && this.initialized != undefined) 
	{
		listener.call(this,this.initialized);
		return this;
	}
	else
	{
		return events.EventEmitter.prototype.on.call(this,type,listener);
	}
};

BaseObject.prototype.hookInit = function (fn)
{
	if (typeof this.initialized !== 'undefined') return;
	if (this.__initHooks === null)
	{
		this.__initHooks = [];
		this.initializeComplete = hookedInitializeComplete
	}
	this.__initHooks.push(fn);
};

function hookedInitializeComplete(success, error, destroyArgs, nextError)
{
	if (nextError instanceof Error)
	{
		success = false;
		error = nextError;
	}
	if (success && this.__initHooks && this.__initHooks.length > 0)
	{
		try
		{
			this.__initHooks.shift().call(this, hookedInitializeComplete.bind(this, success, error, destroyArgs));
		}
		catch(e)
		{
			this.initializeComplete = initializeComplete;
			this.initializeComplete(false, e, destroyArgs);
		}
	}
	this.__initHooks = null;
	this.initializeComplete = initializeComplete;
	this.initializeComplete(success, error, destroyArgs);
}

function initializeComplete (success, error, destroyArgs)
{
	if (this.initialized !== undefined) return;
	if (success)
	{
		this.initialized = true;
		this.emit('initialized', true);
		if (this.__deferred) this.__deferred.resolve (this);
	}
	else
	{
		if (error instanceof Error)
		{
			this._initializeError = error;		
		}
		else
		{
			this._initializeError = new Error (error);
		}
        this._initializeError.instance = this;
		this.initialized = false;
		this.emit('initialized', false);
		if (this.__deferred) this.__deferred.reject (this._initializeError);
		try
		{
			this.destroy.apply(this, destroyArgs);
		}
		catch (e) {
			console.error (e);
		}
	}
}

BaseObject.prototype.initializeComplete = initializeComplete;

BaseObject.prototype.initialize = function initialize ()
{
	if (!this.__deferred)
	{
		this.__deferred = util.defer();
		if (this.initialized)
		{
			this.__deferred.resolve (this);
		}
		else if (this.initialized === false)
		{
			this.__deferred.reject (this._initializeError);
		}
	}
	return this.__deferred.promise;
};

Object.defineProperty (BaseObject.prototype, 'parent', {
	get: function ()
	{
		return this.__parent;
	}
	,
	set: function (parent)
	{
		if (!(parent instanceof BaseObject)) return;
		if (typeof this.__parent !== 'undefined')
		{
			this.__parent.removeListener ('destroy', this.__autoDestroyHandler);
		}
		this.__parent = parent;
		parent.on ('destroy', this.__autoDestroyHandler);
	}
});

BaseObject.prototype.configureListeners = function (listeners, on)
{
	on = on ? 'on':'removeListener';
	for (var i in listeners)
	{
		this[on](i,listeners[i]);
	}
	return this;
};

BaseObject.prototype.addListeners = function (listeners)
{
	for (var i in listeners)
	{
		this.addListener(i,listeners[i]);
	}
	return this;
};


BaseObject.prototype.removeListeners = function (listeners)
{
	for (var i in listeners)
	{
		this.removeListener(i,listeners[i]);
	}
	return this;
};

BaseObject.prototype.addListenersTo = function (target, listeners)
{
	for (var i in listeners)
	{
		this.addListener(i,listeners[i]);
	}
	return this;
};
/*
BaseObject.prototype.removeListenersTo = function (target, listeners)
{
    var targetIndex = this.__registeredListeners.targets.indexOf(target);
    if (targetIndex == -1) return;
    for (var i in listeners)
    {
        target.removeListener(i,listeners[i]);
        if (this.__registeredListeners.hasOwnProperty(i))
        {
            this.__registeredListeners[i].targets.
        }
    }
    return this;
};
*/
BaseObject.prototype.destroy = function ()
{
    console.log ('BASE DESTROY : '+this.__static.name);
	this.destroy = function ()
	{
		console.log('already destroyed');
		return false;
	};
	if (typeof this.__parent !== 'undefined')
	{
		this.__parent.removeListener ('destroy', this.__autoDestroyHandler);
	}
	this.emit.apply(this, ['destroy', this].concat(Array.prototype.slice.call(arguments)));
	this.destroyed = true;
	this.removeAllListeners();
	delete this.__parent;
	return true;
};

var __autoDestroyHandler = function ()
{
    this.destroy.apply(this, Array.prototype.slice.call(arguments, 1));
};