"use strict";
/**
 * Module dependencies.
 */
var util = require ('util')
    ,  helpers = require ('../helpers/index')
    ,  BaseObject = require('../helpers/baseobject')
    ,  Client = require('../models/client')
    ,  cache = require('./cache')
    ,  Remote = require('./remote')
    ,  Remoted = require('./remoted')
    ,  SecurizedUser = require('../security/securizeduser')
    ,  Promise = require('bluebird')

/**
 * Export constructor.
 */
module.exports = exports = RemoteRoom;

/**
 * RemoteRoom Constructor.
 */
function RemoteRoom (conf, client)
{
    //Call base constructor
    BaseObject.call(this);

    //public
    this.name = conf.namespace;
    this.client = client;
    this.global = !!this.client;
    this.id = this.global ? this.name : this.name+'/'+this.client._id;
    this.sockets = {};
    this.connectedCount = 0;
    this._syncHandlers = {};
    this._syncCache = {};
    this._cacheWatcherHandlers = {};

    switch (typeof conf.routes)
    {
        case 'function':
            this.initSocket = conf.routes;
        break;
        case 'object':
            this.routes = conf.routes ? conf.routes:{};
        break;
        default:
            this.routes = {};
    }

    Promise.resolve(conf.init)
    .then((data) =>
    {
        if (data && typeof data === 'object') this.data = data;
        else this.data = {};
        this.initializeComplete(true);
    })
    .catch((e) =>
    {
        console.error (e);
        this.initializeComplete(false);
    });
}

/**
 * Extends BaseObject.
 */
BaseObject.inherits(RemoteRoom);

RemoteRoom.prototype.autoRegister = function (arg1, arg2, arg3, arg4)
{
    switch (typeof arg1)
    {
        case 'function':
        case 'string':
            return this._autoRegister(arg1, arg2, arg3, arg4);
        case 'object':
            var p = [];
            for (var i = 0, l = arg1.length; i<l; i++)
            {
                if (util.isArray(arg1[i]))
                {
                    p.push(this._autoRegister.apply(this, arg1[i]));
                }
                else
                {
                    p.push(this._autoRegister.call(this, arg1[i]));
                }
            }
            return Promise.all(p);
    }
};

RemoteRoom.prototype._autoRegister = function (type, addHandler, removeHandler, cachedOnly)
{
    if (typeof type === 'function') type = type.name;
    if (!cache.isRegistered(type)) throw new Error (type+ ' is not registered in cache, cannot be used for autoregistering');
    var event;
    if (this.global) event = 'new'+type;
    else event = 'new'+type+this.client.id;
    if (this._cacheWatcherHandlers.hasOwnProperty(event)) return;
    this._syncCache[type] = {};
    this._cacheWatcherHandlers[event] = this.autoRegisterHandler.bind(this, addHandler, removeHandler);
    cache.watcher.on(event, this._cacheWatcherHandlers[event]);

    this.syncHandler(type, this._autoSyncHandler.bind(this, type), this);

    var p;
    if (this.global)
    {
        p = cache.getType(type).getAll(cachedOnly);
    }
    else
    {
        p = cache.getType(type).get({client_id: this.client._id});
    }
    return p.bind(this).map(function(instance)
    {
        if (this._syncCache[instance.__static.name].hasOwnProperty(instance._id)) return;
        this._syncCache[instance.__static.name][instance._id] = instance;
        instance.once('destroy', this._removeFromSyncCache.bind(this));
    })
    .error(function (error)
    {
        console.error(error.stack);
    });
};

RemoteRoom.prototype.autoRegisterHandler = function (addHandler, removeHandler, instance)
{
    this.registerInstance(instance);
    this._syncCache[instance.__static.name][instance._id] = instance;
    instance.once('destroy', this._removeFromSyncCache.bind(this));
    if (typeof addHandler === 'function') addHandler.call(this,instance);
    if (typeof removeHandler === 'function') instance.once('destroy', removeHandler.bind(this));
    Remote.create(instance);
};

RemoteRoom.prototype._removeFromSyncCache = function (instance)
{
    delete this._syncCache[instance.__static.name][instance._id];
};

RemoteRoom.prototype.registerInstance = function (instances)
{
    if (!util.isArray(instances))
    {
        instances = [instances];
    }
    var i, j, instance;
    for (i = instances.length-1; i>=0; i--)
    {
        instance = instances[i];
        if (!(instance instanceof Remoted)) continue;
        for (j in this.sockets)
        {
            this.sockets[j].registerInstance(instance);
        }
    }
};

RemoteRoom.prototype.syncHandler = function (type, handler, thisArg)
{
    this._syncHandlers[type] = [handler, thisArg];
};

RemoteRoom.prototype._autoSyncHandler = function (type)
{
    return this._syncCache[type];
};

RemoteRoom.prototype.getRegistered = function (type, id)
{
    if (this._syncCache.hasOwnProperty(type) && this._syncCache[type].hasOwnProperty(id)) return this._syncCache[type][id];

    return null;
};

//METHODS
RemoteRoom.prototype.bindSocket = function (socket)
{
    return this.initSocket(socket)
    .bind(this)
    .then(function(initData)
    {
        console.log ('------------BIND SOCKET TO '+this.__static.name);
        this.sockets[socket.id] = socket;
        this.connectedCount++;
        socket.once('disconnect', this.unbindSocket.bind(this, socket));
        if (this.superRoom)
        {
            SecurizedUser.su (socket.user);
        }
        socket.user.bindSocket(socket);
        if (this._syncHandlers)
        {
            for (let  i in this._syncHandlers)
            {
                socket.registerSyncRequestHandler (i, this._syncHandlers[i][0], this._syncHandlers[i][1]);
            }
        }
        let remoted = {};
        for (let i in initData)
        {
            if (util.isArray(initData[i]))
            {
                remoted[i] = [];
                for (let j = 0, l = j.length; j<l; j++)
                {
                    if (initData[i][j] instanceof Remoted)
                    {
                        this.registerInstance(initData[i][j]);
                        remoted[i][j] = {type: initData[i][j].__static.name, data: initData[i][j].toJSON(socket.user)};
                    }
                }
                if (remoted[i].length>0)
                {
                    delete initData[i];
                }
                else
                {
                    delete remoted[i];
                }
            }
            else
            {
                if (initData[i] instanceof Remoted)
                {
                    this.registerInstance(initData[i]);
                    remoted[i] = {type: initData[i].__static.name, data: initData[i].toJSON(socket.user)};
                    delete initData[i];
                }
            }
        }
        initData.remoted = remoted;
        socket.init (initData);
        this.emit ('user-connect', socket.user);
    });
};

RemoteRoom.prototype.initSocket = function (data, socket)
{
    for (let i in this.routes)
    {
        let r = this.routes[i].route.match(socket.request.url);
        if (r !== false) return this.routes[i].handler(r, data, socket);
    }
    return {error: 404};
};

RemoteRoom.prototype.unbindSocket = function (socket)
{
    console.log ('------------UNBIND SOCKET OF '+this.__static.name);
    this.connectedCount--;
    if (this.superRoom)
    {
        SecurizedUser.nu (socket.user);
    }
    this.emit ('user-disconnect', socket.user);
    delete this.sockets[socket.id];
};

RemoteRoom.prototype.users = function (json)
{
    json = json == undefined ? false:true;
    var users = [];
    for (var i in this.sockets)
    {
        if (!json) users.push(this.sockets[i].user);
        else users.push(this.sockets[i].user.toJSON());
    }
    return users;
};

RemoteRoom.prototype.destroy = function ()
{
    for (var i in this.sockets)
    {
        delete this.sockets[i];
    }
    for (var i in this._cacheWatcherHandlers)
    {
        cache.watcher.removeListener(i, this._cacheWatcherHandlers[i]);
    }

    if (this.global) delete rooms[this.name];
    else delete rooms[this.name][this.client.id];
};

const rooms = {};

/**
 * STATIC
 **/
RemoteRoom.autorun = helpers.noop;

RemoteRoom.getOne = function (conf, client)
{
    let pool = rooms[conf.namespace];
    if (pool)
    {
        if (conf.global) return pool.initialize();
        let room = pool[client.id];
        if (room) return room.initialize();
    }
    else if (conf.global)
    {
        let room = rooms[conf.namespace] = new RemoteRoom(conf);
        room.once ('destroy', this._removeFromCache);
        return room.initialize();
    }
    else
    {
        rooms[conf.namespace] = {};
    }
    rooms[conf.namespace][client.id] = new RemoteRoom(conf);
    return rooms[conf.namespace][client.id].initialize();
};