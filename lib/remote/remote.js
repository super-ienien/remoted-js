var util = require("util")
  ,  cache = require("./cache")
  ,  events = require("events");
  
var debug = util.debuglog ('remote');

function Remote ()
{
	events.EventEmitter.call(this);
	this._pendingCreateOperations = {};
    this._flushCreateOperations = this._flushCreateOperations.bind(this);
}

util.inherits(Remote, events.EventEmitter);

/**
* @param {string} type
* @param {string} id
* @param {string} method
**/

Remote.prototype.create = function (instance, socket)
{
    var id = instance.__static.name + '-' + instance._id;
    if (this._pendingCreateOperations.hasOwnProperty(id))
    {
        if (socket) this._pendingCreateOperations[id].socket = socket;
        return;
    }
    this._pendingCreateOperations[id] = {socket: socket, instance: instance};
    setTimeout(this._flushCreateOperations);
};

Remote.prototype._flushCreateOperations = function ()
{
    for (var i in this._pendingCreateOperations)
    {
        this._create(this._pendingCreateOperations[i].instance, this._pendingCreateOperations[i].socket);
    }
    this._pendingCreateOperations = {};
};

Remote.prototype._create = function (instance, socket)
{
	var type = instance.__static.name;
	var jsons = {};
	var json;
	var userType;
	var iSocket;
	
	if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');

	debug('remote create : '+ type+ ' with id : '+instance._id);
	
	for (var i in instance._remoteSockets)
	{
		iSocket = instance._remoteSockets[i];
		if (socket && iSocket == socket) continue;
		userType = instance.userIs (iSocket.user);
		json = jsons[userType] || (jsons[userType] = instance.toJSON (iSocket.user));
		iSocket.emit ('remote-create', type, json);
	}
};

Remote.prototype.update = function (instance, fields, socket)
{
	var type = instance.__static.name;
	var jsons = {};
	var json;
	var userType;
	var iSocket;
	
	if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');
	
	debug ('remote update : '+ type+ ' with id : '+cache.idOf (instance));
	
	for (var i in instance._remoteSockets)
	{
		iSocket = instance._remoteSockets[i];
		if (socket && iSocket === socket) continue;
	
		userType = instance.userIs (iSocket.user);
		json = jsons[userType] || (jsons[userType] = instance.toJSON (fields, iSocket.user));
		iSocket.emit ('remote-update', type, json);
	}
}

Remote.prototype.destroy = function (instance)
{
	var type = instance.__static.name;
	
	if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');
	
	debug ('remote destroy '+ type + ' : '+ instance._id);
	
	for (var i in instance._remoteSockets)
	{
        instance._remoteSockets[i].emit('remote-destroy', instance.__static.name, cache.idOf(instance));
        instance._remoteSockets[i].unregisterInstance(instance);
	}
};

Remote.prototype.execute = function (instance, method, socket)
{
	var type = instance.__static.name;
	
	if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');
	
	debug ('remote execute '+method+'() on '+ type);
	for (var i in instance._remoteSockets)
	{
		if (socket && socket === instance._remoteSockets[i]) continue;
		instance._remoteSockets[i].emit.apply(instance._remoteSockets[i], ['remote-execute', type, cache.idOf (instance), method].concat(Array.prototype.slice.call(arguments, 3)));
	}
};

Remote.prototype.executeRemotedAccessor = function (instance, method, socket, argument)
{
	var type = instance.__static.name;
	var jsons = {};
	var json;
	var userType;
	var iSocket;
	
	if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');
	
	debug ('remote execute remoted accessor '+method+'() on '+ type);
	for (var i in instance._remoteSockets)
	{
		iSocket = instance._remoteSockets[i];
		if (socket && socket === iSocket) continue;
		if (argument === null)
		{
			json = null
		}
		else
		{
			userType = argument.userIs (iSocket.user);
			json = jsons[userType] || (jsons[userType] = argument.toJSON (iSocket.user));
		}
		try 
		{
			iSocket.emit.apply(iSocket, ['remote-execute', type, cache.idOf (instance), method, json]);
		}
		catch (error)
		{
			console.error (error.stack);
		}
	}
};

Remote.prototype.executeCollectionMethod = function (instance, method, action, socket)
{
    var type = instance.__static.name;
    var jsons = {};
    var json;
    var userType;
    var iSocket;

    if (!cache.isRegistered(type)) throw new Error(type + ' is not a registered Type');

    debug('remote execute ' + method + '() on ' + type);

    switch (action)
    {
		case 'insert':
        case 'add':
            if (arguments.length < 5) return;
            var addedInstance = arguments[4];
            for (let i in instance._remoteSockets)
            {
                iSocket = instance._remoteSockets[i];
                if (socket && iSocket == socket) continue;
                userType = addedInstance.userIs(iSocket.user);
                json = jsons[userType] || (jsons[userType] = addedInstance.toJSON(iSocket.user));
                iSocket.emit.apply(iSocket, ['remote-execute', type, cache.idOf(instance), method, action, json].concat(Array.prototype.slice.call(arguments, 5)));
            }
        break;
		case 'remove':
			let data = {_id: arguments[4]._id, __type__: arguments[4].__static.name};
			for (let i in instance._remoteSockets)
			{
				if (socket && socket === instance._remoteSockets[i]) continue;
				instance._remoteSockets[i].emit.apply(instance._remoteSockets[i], ['remote-execute', type, cache.idOf(instance), method], data);
			}
		break;
        default:
            for (let i in instance._remoteSockets)
            {
                if (socket && socket === instance._remoteSockets[i]) continue;
                instance._remoteSockets[i].emit.apply(instance._remoteSockets[i], ['remote-execute', type, cache.idOf(instance), method].concat(Array.prototype.slice.call(arguments, 4)));
            }
        break;
    }
};

exports = module.exports = new Remote ();