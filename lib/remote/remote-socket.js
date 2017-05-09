"use strict";

const EventEmitter = require ('events').EventEmitter
,   cache = require("./cache")
,   util = require("util")
,   Promise = require("bluebird")
,   RemotedError = require('../errors/remoted-error')
,   debug = util.debuglog ('remote')
,   Modulator = require('../modulator');


module.exports = exports = RemoteSocket;

function RemoteSocket (socket)
{
	this.id = socket.id;
	
	this._emitter = new EventEmitter();
	
	socket.on ('remote-sync-request', _ioSyncRequestHandler.bind (this));	
	socket.on ('remote-update-request', _ioUpdateRequestHandler.bind ( this));
	socket.on ('remote-update', _ioUpdateHandler.bind (this));
	socket.on ('remote-execute', _ioExecuteHandler.bind (this));
	socket.on ('remote-create', _ioCreateHandler.bind (this));
	socket.on ('remote-destroy', _ioDestroyHandler.bind (this));
	
	socket.once ('disconnect', this.destroy.bind(this));
	
	this.socket = socket;
	this.user = socket.user;
	this.connected = true;
	this.instances = {};
	this._instancesDestroyHandlers = {};
	
	this._syncRequestHandlers = {};
	
	this.registerInstance(socket.user);

	this.query = socket.handshake.query;
}

RemoteSocket.prototype.init = function (data)
{
	data = typeof data === 'object' ? data:{};
	data.remoted.user = {type: this.user.__static.name, data: this.user.toJSON(this.user)};
	data.modules = Modulator.modules(this.user);
	data.serverTime = new Date();
	this.socket.emit ('remote-init', data);
};

function _ioSyncRequestHandler (type)
{
	if (!cache.isRegistered (type)) 
	{
		debug ('sync aborted is not registerd '+type);
		return;
	}
	
	debug ('sync request : '+type);
	var self = this;
	if (typeof this._syncRequestHandlers[type] == 'function')
	{
		debug ('sync respond : '+type);
		var val = this._syncRequestHandlers[type](type, this.user);
		if (val instanceof Promise)
		{
			self = this;
			val.then (function (result)
			{
				self.socket.emit ('remote-sync', type, self._ioSyncProcessResult(result));
			});
		}
		else
		{
			this.socket.emit ('remote-sync', type, this._ioSyncProcessResult(val));
		}
	}
}

RemoteSocket.prototype._ioSyncProcessResult = function (instances)
{
	var json = [];
	debug ('process sync handler');
	for (var i in instances)
	{
		this.registerInstance(instances[i]);
		json.push(instances[i].toJSON (this.user));
	}
	return json;
};

function _ioUpdateRequestHandler (type, id)
{
	debug ('update request : '+type);
	if (!cache.isRegistered (type)) return;
	if (!util.isArray (id)) id = [id];
	var result = [];
	var instance;
	for (var i = 0, l=id.length; i<l; i++)
	{
		instance = cache.exists (type, id[i]);
        if (instance)
        {
            this.registerInstance(instance);
            result.push(instance.toJSON(this.user));
        }
        else
        {
            console.log ('instance id : '+id[i] + ' type : '+type+ ' does not exist anymore');
        }
	}
	if (result.length > 0)	
	{
		debug ('update respond : '+type);
		this.emit('remote-update', type, result);
	}
}

function _ioUpdateHandler (uid, type, data)
{
	if (!cache.isRegistered (type)) return;
	debug ('update received : '+type);
	if (!util.isArray (data))
	{
		data = [data];
	}
	var p = [];
	for (var i = 0, l = data.length; i<l; i++)
	{
		var instance = cache.exists (type, data[i]);
		if (instance)
		{
			delete data[i]._id;
			p.push (instance.update(data[i], this.user));
		}
	}
	
	if (uid === false) return;
	var self = this;
	Promise.settle (p).map (function (result)
	{
		if (result.isFulfilled())
		{
			if (result.value().isValid)
			{
				return {fulfilled: true, value: result.value()};
			}
			else
			{
				return {reject: true, reason: result.value()};
			}
		}
		else
		{
			console.log (result.reason().stack);
			return {error: true, reason: "Internal server error"};
		}
	}).then(function (ret)
	{
		if (ret.length == 1) ret = ret[0];
		self.emit ('remote-update-callback-'+uid, ret);
	});
}

function _ioExecuteHandler (uid, type, id, method)
{
	var self = this;
	var mode = 'x';
	var methodPrefix = '';
	var ret = {};
	var methodFound = false;
	var instance;
	var collection;

	if (cache.isRegistered (type))
	{
		if (typeof id === 'undefined' || id == null)
		{
			debug ('execute received : static '+method+' on '+type+ ' - with uid : '+uid);
		}
		else
		{
			instance = cache.exists (type, id);
			debug ('execute received '+method+' on '+type+' - '+id+ ' - with uid : '+uid);
		}
		if (instance)
		{
			if (typeof instance['r_'+method] === 'function')
			{
				methodPrefix = 'r_';
				mode = 'w';
				methodFound = true;
			}
			else if (typeof instance[method] === 'function')
			{
				methodFound = true;
			}
			else if (instance.__reverseMap[method] && instance.__reverseMap[method].array && instance.__reverseMap[method].propType == 'remoted' && typeof instance[method]['r_'+arguments[4]] === 'function')
			{
				methodFound = true;
				collection = true;
			}
			if (methodFound)
			{
				if (instance.isAllowed (method, mode, this.user))
				{
					if (mode == 'w' && arguments.length == 4)
					{
						ret.error = 'execution of accessor "'+method+'()" with no value';
						console.error ('Warning : execution of accessor "'+method+'()" with no value for user "'+this.user.name()+'"');
					}
					else
					{
						try
						{
							if (collection)
							{
								ret = instance[method]['r_'+arguments[4]].apply(instance[method], Array.prototype.slice.call (arguments, 5).concat(this));
							}
							else
							{
								ret = instance[methodPrefix+method].apply(instance, Array.prototype.slice.call (arguments, 4).concat(this));
							}
						}
						catch (error)
						{
							ret = error;
						}
					}
				}
				else
				{
					if (mode == 'x')
					{
						console.error ('Warning : execution of method "'+method+'()" is not allowed for user "'+this.user.name()+'"');
					}
					else
					{
						console.error ('Warning : write access on property "'+method+'" is not allowed for user "'+this.user.name()+'"');
					}
					ret.error = 'execution of "'+method+'()" on "'+type+'" not allowed';
				}
			}
			else
			{
				console.error ('function "'+method+'()" on "'+type+'" not found');
				ret.error = 'function "'+method+'()" on "'+type+'" not found';
			}
		}
		else if (instance !== false)
		{
			var typeObject = cache.getType (type);
			if (typeObject !== false && typeof typeObject[method] == 'function')
			{
			
				if (!typeObject.isAllowed (method, 'x', this.user))
				{
					console.error ('Warning : execution of static method "'+method+'()" is not allowed for "'+this.user.name()+'"');
					ret.error = 'execution of "'+method+'()" on "'+type+'" not allowed';
				}
				else
				{
					try
					{
						ret = typeObject[method].apply(typeObject, Array.prototype.slice.call (arguments, 4).concat([this]));
					}
					catch (error)
					{
						if (error instanceof Error)
						{
							ret = {error: error};
						}
						else
						{
							ret = {reject: error};
						}
					}
				}
			}
			else
			{
				console.error ('execute received on type "'+type+'" but method "'+method+'()" not found');
				ret.error = 'function "'+method+'()" on "'+type+'" not found';
			}
		}
		else
		{
			console.error ('execute received on type "'+type+'" but instance with id "'+id+'" not found');
			ret.error = 'instance with id"'+id+'" on "'+type+'" not found';
		}
	}
	else
	{
		console.error ('execute received on unknow type "'+type+'"');
		ret.error = 'type "'+type+'" not found';
	}
	if (uid === false)
    {
        if (ret instanceof Error)
        {
            console.error (ret);
        }
        return;
    }
	switch (typeof ret)
	{
		case 'object':
			if (ret instanceof Error)
			{
				if (ret instanceof RemotedError)
				{
					ret = {error: true, reason: ret.message};
				}
				else
				{
					console.error (ret);
					ret = {error: true, reason: "internal server error"};
				}
			}
			else if (ret instanceof Promise)
			{
				return ret.then(function(val)
				{
					ret = {fulfilled: true, value: val};
				})
				.catch (RemotedError, function ()
				{
					ret = {error: error.message};
				})
				.catch(function (error)
				{
					if (error instanceof Error)
					{
						console.error (error.stack);
						ret = {error: "internal server error"};
					}
					else
					{
						error = error == undefined ? null:error;
						console.error (error);
						ret = {reject: error};
					}
				})
				.finally (function()
				{
					self.emit ('remote-execute-callback-'+uid, ret);
				});
			}
			else if (ret === null)
			{
				ret = {fulfilled: true, value: null};
			}
			else if (ret.hasOwnProperty('error'))
			{
				ret = {error: true, reason: ret.error}
			}
			else if (ret.hasOwnProperty('reject'))
			{
				ret = {reject: true, reason: ret.reject}
			}
			else
			{
				ret = {fulfilled: true, value: ret};
			}
			this.emit ('remote-execute-callback-'+uid, ret);
		break;
		default:
			this.emit ('remote-execute-callback-'+uid, {fulfilled: true, value: ret});
	}
}

function _ioCreateHandler (uid, type, data)
{
	var ret = null;
	if (cache.isRegistered (type))
	{
		if (cache.getType(type).canCreate(this.user))
		{
			debug ('create received : "'+type+'" '+uid);
			data.__creator__ = this.user;
			var instance = cache.exists (type, data);
			
			if (!instance)
			{
				try
				{
					ret = cache.get (type, data).initialize();
				}
				catch (error)
				{
					console.error (error.stack);
					ret = {error: true, reason: "internal server error"};
				}
			}
			else
			{
				ret = {error: true, reason: 'already exists'};
			}
		}
		else
		{
			console.error ('Warning : create access type "'+type+'" is not allowed for user "'+this.user.name()+'"');		
			ret= {error: true, reason: 'Create on "'+type+'" is not allowed'};
		}
	}
	else
	{
		console.error ('create received on unknow type "'+type+'"');
		ret = {error: true, reason: 'type "'+type+'" not found'};
	}
	
	if (uid === false) return;
	var self = this;
	if (ret instanceof Promise)
	{
		ret.then(function ()
		{
			self.emit ('remote-create-callback-'+uid, {fulfilled: true});
		})
		.catch (function (err)
		{
			console.error (err.stack);
			self.emit ('remote-create-callback-'+uid, {error: true, reason: "internal server error"});
		});
	}
	else
	{
		this.emit ('remote-create-callback-'+uid, ret);
	}
}

function _ioDestroyHandler (uid, type, data)
{
	var ret;
	if (cache.isRegistered (type))
	{
			debug ('destroy received : '+type);
			var instance = cache.exists (type, data);
			if (instance)
			{
				if (instance.isAllowed('__destroy__', 'x', this.user))
				{
					ret = instance.destroy(this);
				}
				else
				{
					console.error ('Warning : write access type "'+type+'" is not allowed for user "'+this.user.name()+'"');		
					ret= {error: true, reason: 'Write on "'+type+'" is not allowed'};
				}
			}
			else
			{
				ret = {error: 'instance not found'};
				debug ('instance not found');
			}
	
	}
	else
	{
		console.error ('destroye received on unknow type "'+type+'"');
		ret = {error: 'type "'+type+'" not found'};
	}
	
	if (uid === false) return;
	var self = this;
	if (ret instanceof Promise)
	{
		ret.then(function ()
		{
			self.emit ('remote-destroy-callback-'+uid, {fulfilled: true});
		})
		.catch (function (error)
		{
			if (error instanceof Error)
			{
				console.error (error.stack);
				self.emit ('remote-destroy-callback-'+uid, {error: true, reason: "internal server error"});
			}
			else
			{
				self.emit ('remote-destroy-callback-'+uid, {error: true, reason: "internal server error"});
			}
		});
	}
	else
	{
		if (ret === true)
		{
			this.emit ('remote-destroy-callback-'+uid, {fulfilled: true});
		}
		else
		{
			if (ret instanceof Error)
			{
				console.error (ret.stack);
				this.emit ('remote-destroy-callback-'+uid, {error: true, reason: "internal server error"});
			}
			else
			{
				this.emit ('remote-destroy-callback-'+uid, {reject: true});
			}
		}
	}
}

RemoteSocket.prototype.hasInstance = function(instance)
{
	if (typeof instance._id == 'undefined')
    {
        throw new Error ('instance of '+instance.__static.name+'must have an _id');
    }
	return this.instances.hasOwnProperty(this.instanceId(instance));
};

RemoteSocket.prototype.registerInstance = function(instance)
{
    if (!instance) return;
	if (this.hasInstance(instance)) return false;
	var instanceId = this.instanceId(instance);
	instance._remoteSockets[this.id] = this;
	this.instances[instanceId] = instance;
	this._instancesDestroyHandlers[instanceId] = this.unregisterInstance.bind(this, instance);
	instance.on ('destroy', this._instancesDestroyHandlers[instanceId]);
	var collection;
    for (var i in instance.__remotedProps)
	{
        if (instance.__remotedProps[i].array)
        {
            collection = instance[instance.__remotedProps[i].name];
            for (var j in collection.list)
            {
                this.registerInstance(collection.list[j]);
            }
        }
        else
        {
            this.registerInstance(instance.__remotedProps[i].accessor ? instance[i]():instance[i]);
        }
	}
	return true;
};

RemoteSocket.prototype.unregisterInstance = function(instance)
{
	if (!this.hasInstance(instance)) return false;
	var instanceId = this.instanceId(instance);
	delete instance._remoteSockets[this.id];
	instance.removeListener ('destroy', this._instancesDestroyHandlers[instanceId]);
	delete this.instances[instanceId];
	delete this._instancesDestroyHandlers[instanceId];
	return true;
}

RemoteSocket.prototype.unregisterAllInstances = function()
{
	for (var i in this.instances)
	{
        delete this.instances[i]._remoteSockets[this.id];
        this.instances[i].removeListener ('destroy', this._instancesDestroyHandlers[i]);
	}
    this.instances = {};
    this._instancesDestroyHandlers = {};
}

RemoteSocket.prototype.instanceId = function (instance)
{
	return instance.__static.name + instance._id;
}

RemoteSocket.prototype.isAlive = function ()
{
    var self = this;
    return new Promise (function (resolve, reject)
    {
        if (!self.connected) return reject(self);
        console.log ('emitting is alive message');
        self.socket.emit ('is-alive');
        var tid = setTimeout (function ()
        {
            console.log ('keep alive timeout');
            if (!self.connected) return reject(self);
            console.log('isAlive for viewer timeout');
            self.socket.removeListener('keep-alive', keepAliveHandler);
            self.once('disconnect', reject.bind(self));
            self.disconnect();
        }, 1000);

        function keepAliveHandler ()
        {
            console.log ('keep alive message received');
            clearTimeout (tid);
            return resolve(self);
        }
        self.socket.once ('keep-alive', keepAliveHandler);
    });
};

RemoteSocket.prototype.kill = function ()
{
    var self = this;
    return new Promise (function (resolve, reject)
    {
        if (!self.connected) return resolve();
        self.emit ('remote-kill');
        var to = setTimeout(function ()
        {
            reject (new Error ("Disconnect timeout for kill user "+self.user.name()+" of "+self.user.client.name+" : "+self.id));
        }, 3000);

        self.once ('disconnect', function ()
        {
            clearTimeout (to);
            resolve();
        });
        self.disconnect();
    });
};

RemoteSocket.prototype.destroy = function ()
{
	this.connected = false;
	this.unregisterAllInstances();
	this._emitter.emit('disconnect', this);
	this.socket.removeAllListeners();
	this._emitter.removeAllListeners();
    delete this.socket.user;
};

RemoteSocket.prototype.registerSyncRequestHandler = function (type, handler, context)
{
	if (context) this._syncRequestHandlers[type] = handler.bind (context);
	else this._syncRequestHandlers[type] = handler;
};

RemoteSocket.prototype.emit = function (e)
{
	if (e.startsWith('remote-'))
	{
        if (!this.connected)
        {
            console.error ('DEBUG INFO - emit on destroyed socket : ');
            console.log (this);
            return;
        };
		return this.socket.emit.apply (this.socket, arguments);
	}
	else
	{
		return this._emitter.emit.apply (this._emitter, arguments);
	}
}

RemoteSocket.prototype.on = function (e)
{
	if (e.startsWith('remote-'))
	{
        if (!this.connected)
        {
            console.error ('DEBUG INFO - addListener on destroyed socket : ');
            console.log (this);
            return
        };
		this.socket.on.apply (this.socket, arguments);
	}
	else
	{
		this._emitter.on.apply (this._emitter, arguments);
	}
	return this;
}

RemoteSocket.prototype.once = function (e)
{
	if (e.startsWith('remote-'))
	{
        if (!this.connected)
        {
            console.error('DEBUG INFO - once on destroyed socket : ');
            console.log(this);
            return
        }
		this.socket.once.apply (this.socket, arguments);
	}
	else
	{
		this._emitter.once.apply (this._emitter, arguments);
	}
	return this;
}

RemoteSocket.prototype.removeListener = function (e)
{
	if (e.startsWith('remote-'))
	{
        if (!this.connected)
        {
            console.error('DEBUG INFO - removeListener on destroyed socket : ');
            console.log(this);
            return
        }
		this.socket.removeListener.apply (this.socket, arguments);
	}
	else
	{
		this._emitter.removeListener.apply (this._emitter, arguments);
	}
	return this;
}

RemoteSocket.prototype.removeAllListeners = function (e)
{
	if (e.startsWith('remote-'))
	{
		this.socket.removeAllListeners(e);
	}
	else
	{
		this._emitter.removeAllListeners(e);
	}
	return this;
}

RemoteSocket.prototype.disconnect = function()
{
    if (this.connected) this.socket.disconnect();
}