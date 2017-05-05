"use strict";
/**
 * Module dependencies.
 */
var util = require ('util')
    ,  Util = require ('../helpers/util')
    ,  BaseObject = require('./../helpers/baseobject')
    ,  Domain = require('./../models/domain')
    ,  cache = require('./cache')
    ,  Remote = require('./remote')
    ,  Remoted = require('./remoted')
    ,  SecurizedUser = require('../security/securizeduser');

/**
 * Export constructor.
 */
module.exports = exports = RemoteRoom;

/**
 * RemoteRoom Constructor.
 */
function RemoteRoom (domain)
{
    //Call base constructor
    BaseObject.call(this);

    if (domain)
    {
        console.log ('CREATE '+this.__static.name+' FOR DOMAIN : '+domain.name);
    }
    else
    {
        console.log ('CREATE GLOBAL ROOM '+this.__static.name);
    }

    //public
    this.domain = domain;
    this.global = this.domain ? false:true;
    this.id = this.global ? this.__static.name : this.__static.name+'-'+domain._id;
    this.sockets = {};
    this.connectedCount = 0;
    this._syncHandlers = {};
    this._syncCache = {};
    this._cacheWatcherHandlers = {};
}

/**
 * Extends BaseObject.
 */
BaseObject.inherits(RemoteRoom);

RemoteRoom.__cache = {};

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
    else event = 'new'+type+this.domain.id;
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
        p = cache.getType(type).get({domain: this.domain._id});
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

Object.defineProperty(RemoteRoom.prototype, 'initSocket', {
    get: function ()
    {
        return this._initSocket;
    }
    ,
    set: function (fn)
    {
        this._initSocket = Promise.method(fn);
    }
});

RemoteRoom.prototype.initSocket = function () {return {};};

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
    return RemoteRoom.__super.prototype.destroy.call(this);
};

/**
 * STATIC
 **/
RemoteRoom._removeFromCache = function (room)
{
    console.log ('delete '+this.name+' from cache : '+room.id);
    delete RemoteRoom.__cache[this.name][room.domain.id];
};

RemoteRoom._removeSingletonFromCache = function (room)
{
    console.log ('delete singleton'+this.name+' from cache : '+room.id);
    delete RemoteRoom.__cache[this.name];
};

RemoteRoom.autorun = Util.noop;

RemoteRoom.getOne = function (p)
{
    if (p instanceof Domain) p = {domain: p};
    if (typeof p == 'object' && p.hasOwnProperty('domain') && p.domain instanceof Domain)
    {
        if (RemoteRoom.__cache.hasOwnProperty(this.name) && RemoteRoom.__cache[this.name].hasOwnProperty(p.domain.id)) return RemoteRoom.__cache[this.name][p.domain.id].initialize();
        if (!RemoteRoom.__cache.hasOwnProperty(this.name)) RemoteRoom.__cache[this.name] = {};
        var room = new this(p.domain);
        RemoteRoom.__cache[this.name][room.domain.id] = room;
        return room.initialize().bind(this).then(function(room)
        {
            room.once ('destroy', this._removeFromCache.bind(this, room));
            return room;
        });
    }
    else
    {
        throw new Error('RemoteRoom\'s `get()` method expects one of : \n'
            + '- Domain\n'
            + '- {domain: Domain');
    }
};

RemoteRoom.__getOneSingleton = function ()
{
    if (RemoteRoom.__cache.hasOwnProperty(this.name)) return RemoteRoom.__cache[this.name].initialize();
    var room = new this();
    RemoteRoom.__cache[this.name] = room;
    return room.initialize().bind(this).then(function(room)
    {
        room.once ('destroy', this._removeSingletonFromCache.bind(this, room));
        return room;
    });
};

RemoteRoom.singleton = function ()
{
    this.getOne = RemoteRoom.__getOneSingleton;
};