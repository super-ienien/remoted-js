"use strict";

const mongoose = require ('mongoose')
,   ObjectId = mongoose.Types.ObjectId
,   util = require ('util')
,   helpers = require ('../helpers/index')
,   cache = require ('./cache')
,   dbCleaning = require ('../config').dbCleaning
,   inheritor = require ('../helpers/inheritor')
,	NotFoundError = require ('../errors/not-found-error')
,   Promise = require ('bluebird');

mongoose.set('debug', false);

function adapter () {}

adapter.prototype.update = function (data, user)
{
	var result = {};
	var toSave = [];
	if (!this.__static.__super.prototype.validate.call (this, data, user, result))
	{
		return result;
	}
	this._update (data, user);
	for (var i in result)
	{
		toSave.push (i);
	}
	return this.saveAsync(toSave)
	.catch (function (err)
	{
		console.error (err);
	})
	.return (result);
};

adapter.prototype.saveAndUpdate = function (paths, socket)
{
	this.remoteUpdate(paths, socket);
	this.save(paths);
};

adapter.prototype.saveAsyncAndUpdate = function (paths, socket)
{
	this.remoteUpdate(paths, socket);
	return this.saveAsync(paths);
};

adapter.prototype.save = function (paths)
{
    if (!this.__asyncSave)
    {
        this.__asyncSavePaths = {};
        this.__asyncSave = true;
        if (!this.__asyncSavePending)
        {
            process.nextTick(()=>
            {
                this.__triggerSave();
            });
        }
    }

    switch (typeof paths)
    {
        case 'string':
            this.__asyncSavePaths[paths] = true;
            break;
        case 'object':
            if (!util.isArray (paths)) break;
            for (let i = paths.length-1; i>=0; i--)
            {
                this.__asyncSavePaths[paths[i]] = true;
            }
    }
};

adapter.prototype.saveAsync = function (paths)
{
    if (!this.__asyncSaveDefer) this.__asyncSaveDefer = helpers.defer();
    this.save(paths);
	return this.__asyncSaveDefer.promise;
};

adapter.prototype.__triggerSave = function ()
{
    if (this.destroyed) return this.__asyncSave = false;
    let paths = Object.keys(this.__asyncSavePaths);
    for (let i = paths.length-1; i>=0; i--)
    {
        this.model.markModified (paths[i]);
    }
    this.__asyncSave = false;
    this.__asyncSavePaths = null;
    this.__asyncSavePending = true;
    let p = this.model.saveAsync();
    if (this.__asyncSaveDefer)
    {
        p.reflect()
        .then((inspect) =>
        {
            let defer = this.__pendingAsyncSaveDefer;
            this.__pendingAsyncSaveDefer = null;
            if (inspect.isFulfilled())
            {
                defer.resolve(inspect.value());
            }
            else if (inspect.isRejected())
            {
                defer.reject(inspect.reason());
            }
            else
            {
                defer.reject('');
            }
        });
        this.__pendingAsyncSaveDefer = this.__asyncSaveDefer;
    }
    else
    {
        p.catch((e) =>
        {
            console.error (this.__static.name);
            console.error (e);
        });
    }

    p.finally(() =>
    {
        this.__asyncSavePending = false;
        if (this.__asyncSave) this.__triggerSave();
    });
    this.__asyncSaveDefer = null;
};

adapter.prototype.remove = function ()
{
	return this.model.remove().exec();
};


adapter.prototype.destroy = function (keepInDB)
{
    if (typeof keepInDB !== 'boolean')
    {
        keepInDB = !this.initialized;
    }

    console.log ('MONGOOSE DESTROY : '+this.__static.name+ ' - mongoose keepInDB : '+keepInDB);

    if (!keepInDB)
	{
		this.model.remove();
	}

    if (this.__pendingAsyncSaveDefer)
    {
        this.__pendingAsyncSaveDefer.promise.reject("Save aborted, because object was destroyed");
    }

    this.save = helpers.noop;
	this.saveAsync = helpers.noop;
	this.update = helpers.noop;
	return this.__super.prototype.destroy.call(this);
};

adapter.find = function (search)
{
	return this.model.find(this.compileSearch(search)).exec();
};

adapter.findOne = function (search)
{
	var type = this;
	search = this.compileSearch(search);
	return this.model.findOne(search).exec()
	.then(function (model)
	{
		if (!model)
		{
			throw new NotFoundError(null, search, type);
		}
		return model;
	});
};

adapter.findById = function (search)
{
	var type = this;
	return this.model.findById(search).exec()
	.then(function (model)
	{
		if (!model)
		{
			throw new NotFoundError(null, search, type);
		}
		return model;
	});
};

adapter.compileSearch = function (search)
{
	search = Object.assign({}, search);
	for (var i in search)
	{
		let searchVal = search[i];
		if (i.length>3 && i.endsWith('_id'))
		{
			if (!search[i]) continue;
			let name = i.slice(0, -3);
			let prop = this.prototype.__reverseMap[name];
			let type = null;
			if (!prop)
			{
				console.log (name);
				console.log (search);
				console.log (Object.keys(this.prototype.__reverseMap));
			}
			switch (typeof prop.type)
			{
				case 'string':
					type = prop.type;
				break;
				case 'function':
					type = prop.type.name;
				break;
				case 'object':
					if (Array.isArray(prop.type))
					{
						type = {$in: prop.type.slice(0)};
					}
				break;
			}
			if (prop && prop.propType === 'remoted')
			{
				if (typeof searchVal === "object")
				{
					if (!searchVal.type) search[i] = {type: type, id: checkIdType(searchVal, type)};
					else search[i] = {type: searchVal.type, id: checkIdType(searchVal.id, searchVal.type)};
				}
				else
				{
					search[i] = {type: type, id: checkIdType(searchVal, type)};
				}
			}
		}
		else if (this.prototype.__reverseMap.hasOwnProperty(i) && this.prototype.__reverseMap[i].propType === 'remoted')
		{
			let prop = this.prototype.__reverseMap[i];
			let type = null;
			switch (typeof prop.type)
			{
				case 'string':
					type = prop.type;
					break;
				case 'function':
					type = prop.type.name;
					break;
				case 'object':
					if (Array.isArray(prop.type))
					{
						type = {$in: prop.type.slice(0)};
					}
					break;
			}
			if (!search[i])
			{
				search[i+'_id'] = null;
			}
			else if (typeof searchVal === "object")
			{
				if (searchVal.isRemoted)
				{
					search[i+'_id'] = {type: searchVal.__static.name, id: searchVal._id};
				}
				else if (!searchVal.type)
				{
					search[i+'_id'] = {type: type, id: checkIdType(searchVal, type)};
				}
				else search[i+'_id'] = {type: searchVal.type, id: checkIdType(searchVal.id, searchVal.type)};
			}
			else if (typeof prop.type === 'function')
			{
				search[i+'_id'] = {type: type, id: checkIdType(searchVal, type)};
			}
			delete search[i];
		}
	}
	return search;
};

function checkIdType(id, type)
{
	if (Array.isArray(type))
	{
		let hasObjectId = false;
		let hasOther = false;
		for (var i = 0, l = type.length; i<l; i++)
		{
			try
			{
				type = cache.getType(type);
				type = type.prototype.__map._id.type;
				if (type === ObjectId)
				{
					hasObjectId = true;
				}
				else
				{
					hasOther = true;
				}
			}
			catch(e)
			{
				hasOther = true;
			}
			if (hasOther && hasObjectId) break;
		}
		if (hasOther && hasObjectId) return {$in: [id, ObjectId(id)]};
		else if (hasObjectId) return ObjectId(id);
		else return id;
	}
	else
	{
		try
		{
			type = cache.getType(type);
			type = type.prototype.__map._id.type;
			if (type === ObjectId)
			{
				return ObjectId(id);
			}
			return id;
		}
		catch (e)
		{
			return id;
		}
	}
}

adapter.getAll = Promise.method(function (cachedOnly)
{
	if (cachedOnly)
	{
		return helpers.toArray(cache.all(this));
	}
	else
	{
		return this.get({});
	}
});

adapter.get = function (search)
{
	return this.find(search)
	.bind(this)
	.map(function (model)
	{
		return cache.get (this, model).initialize().reflect();
	})
	.filter(function (inspection)
	{
		if (inspection.isFulfilled())
		{
			return true;
		}
		else
		{
			if (inspection.reason() instanceof Error)
			{
				console.error ('Some instance of '+this.name+' is not initialized in get : ');
				console.error (inspection.reason().message);
			}
			else
			{
				console.error ('Some instance of '+this.name+' is not initialized in get : ' + inspection.reason());
			}
			return false;
		}
	})
	.map(function (inspection)
	{
		return inspection.value();
	});
};

adapter.getOne = function (search)
{
	var instance = cache.getOneBy (this, search);
	if (instance) return instance.initialize();

	return this.findOne(search)
	.bind(this)
	.then (function (model)
	{
        return cache.get(this, model).initialize();
	})
	.catch (NotFoundError, function (error)
	{
		throw new NotFoundError (this.name+' with criterias : '+JSON.stringify (search)+' not found in database', search, this);
	}).bind();
};

adapter.getOneOrCreate = function (search, data)
{
	var instance = cache.getOneBy (this, search);
	if (instance) return instance.initialize();

	return this.findOne (search)
	.bind(this)
	.then (function (model)
	{
        return cache.get(this, model).initialize();
	})
	.catch (NotFoundError, function (error)
	{
        return cache.get(this, helpers.mixin (data, search)).initialize();
	});
};

adapter.create = function (data)
{
	return cache.get(this, data).initialize();
};

adapter.getById = function (id)
{
	var instance = cache.exists (this, id);
	if (instance) return instance.initialize();

	return this.findById (id)
	.bind(this)
	.then (function (model)
	{
		return cache.get(this, model).initialize();
	})
	.catch (NotFoundError, function (error)
	{
		throw new NotFoundError (this.name+' with id : '+id+' not found in database', error.search, this);
	})
    .bind();
};

adapter._getById = function (id, circularRemotedMap)
{
	var instance = cache.exists (this, id);
	if (instance)
	{
		return Promise.resolve(instance);
	}

	return this.findById(id)
	.bind(this)
	.then (function (model)
	{
		model.__circularRemotedMap__ = circularRemotedMap;
		return cache.get(this, model);
	})
	.catch (NotFoundError, function (error)
	{
		throw new NotFoundError (this.name+' with id : '+id+' not found in database', error.search, this);
	})
	.bind();
};

adapter.prototype._init = function (obj)
{
    if (obj instanceof this.__static.model)
    {
        var self = this;
        var resInit = obj;
		this.model = obj;
        if (typeof this.preInit === 'function')
        {
            resInit = this.preInit(obj);
            if (resInit instanceof Promise)
            {
                return resInit.then (function (r)
                {
                    r = r || obj;
                    return self._runMongooseInit(r);
                })
                .catch (function (error)
                {
                    self.initializeComplete (false, error);
                });
            }
            else if (typeof resInit !== 'object')
            {
                resInit = obj;
            }
        }
		this._runMongooseInit(resInit)
    }
    else
    {
        this.model = new this.__static.model();
		this.hookInit(function (next)
		{
			this.saveAsync()
			.then(next)
			.catch(next);
		});
        this.__static.__super.prototype._init.call (this, obj, true);
    }
};

adapter.prototype._runMongooseInit = function (obj)
{
	let circularRemotedMap = new Set (obj.__circularRemotedMap__);
	circularRemotedMap.add(this);
	obj = obj || {};
	var hasRemoted = false;
	var remotedPromisesHash = [];
    var remotedPromisesArray;
	var needSave = false;

    for (let i in this.__map)
    {
		let prop = this.__map[i];
		if (prop.propType === 'remoted')
        {
            if (prop.array)
            {
                if (util.isArray(obj[prop.name + '_ids']))
				{
					let ids = obj[prop.name + '_ids'];
					if (ids.length)
					{
						remotedPromisesArray = [];

                        for (let j = 0, l = ids.length; j < l; j++)
                        {
                            hasRemoted = true;
							let type = cache.getType(ids[j].type);
							if (!type || !ids[j].id) continue;
							remotedPromisesArray.push(
							    type._getById(ids[j].id, circularRemotedMap)
                                .then(function (instance)
                                {

                                    if (circularRemotedMap.has(instance)) return instance;
                                    return instance.initialize();
                                })
                                .reflect()
                            );
                        }
                        remotedPromisesHash.push(
                            Promise.bind( this[prop.name], remotedPromisesArray)
                            .filter(function (instanceInspection)
                            {
                                    if (instanceInspection.isFulfilled())
                                    {
                                        return true;
                                    }
                                    else
                                    {
                                        let error = instanceInspection.reason();
                                        console.error('Some '+error.typeName+' was Not found in ' + this.parent.__static.name);
                                        console.error (error.search);
                                        if (error instanceof NotFoundError)
                                        {
										console.log ('remove entry from collection');
                                            this.parent.model[this.persistentPath].remove({id: error.search, type: error.typeName});
                                            this.parent.save(this.path);
                                        }
                                        return false;
								    }
							})
							.each(function (instanceInspection)
							{
								this._add(instanceInspection.value())
							})
							.catch(function (error)
                            {
                                console.error('some instance was not initialized in ' + this.parent.__static.name);
                                console.error(error);
                            })
                        );
                    }
                }
            }
            else
            {
				let instance;
                let type;
				let id = obj[prop.name + '_id'];
				if (id && id.id)
                {
					type = cache.getType(id.type);
					instance = type._getById(id.id, circularRemotedMap)
					.then(function (instance)
					{
						if (circularRemotedMap.has(instance)) return instance;
						return instance.initialize();
					});
                }
				else if (obj[prop.name] && typeof obj[prop.name] === 'object' && this.hasValidPropertyTypeFor(prop.name, obj[prop.name]))
				{
					instance = obj[prop.name];
				}
                else if (prop.default)
                {
                    instance = this._resolveDefaultRemoted(prop, obj);
					if (instance) needSave = true;
				}
                if (instance)
                {
                    hasRemoted = true;
                    remotedPromisesHash.push(instance
                    .bind({
                        prop: prop
                    ,   self: this
					,	obj: obj
					,	id: id
                    })
                    .catch(NotFoundError, function (error)
                    {
                        if (this.prop.default)
                        {
                            var p = this.self._resolveDefaultRemoted(this.prop, obj);
                            if (p)
							{
								needSave = true;
								return p;
							}
                        }
                        else
						{
							console.error('Instance of '+error.typeName+' was Not found in ' + this.self.__static.name);
							console.error (error.search);
						}
                    })
					.catch (function (e)
					{
						console.error (e);
					})
                    .then(function (instance)
                    {
                    	if (!this) throw new Error ('Cannnot complete remoted initialization');
                        if (instance) this.self[this.prop.accessor ? '_'+this.prop.name:this.prop.name] = instance;
                        else if (this.prop.required) throw new Error ('property : "'+this.prop.name+'" is required in '+this.self.__static.name);
                        else this.self[this.prop.accessor ? '_'+this.prop.name:this.prop.name] = null;
                    }));
                }
                else if (prop.required)
                {
					this.initializeComplete(false, new Error('remoted property : "' + i + '" is required'), dbCleaning ? [false]:undefined);
                    return;
                }
            }
        }
        else if (prop.required && (typeof obj[prop.name] === 'undefined' || obj[prop.name] === null))
        {
            this.initializeComplete (false, new Error ('property : "'+i+'" is required'), dbCleaning ? [false]:undefined);
            return;
        }
    }
    if (hasRemoted)
    {
        Promise.all (remotedPromisesHash)
		.bind(this)
		.then(function ()
        {
            return this.model.validateAsync();
        })
        .then (function ()
        {
			if (needSave) this.save();
            return this._resolveInit(obj);
        })
        .catch (function (error)
        {
            this.initializeComplete (false, error, dbCleaning ? [false]:undefined);
        });
    }
    else
    {
        return this.model.validateAsync()
		.bind(this).then (function ()
        {
            return this._resolveInit(obj);
        })
        .catch (function(err)
        {
            console.error (err.stack);
        });
    }
};

adapter.prototype._resolveInit = function (obj)
{
	if (typeof this.init == 'function')
	{
		try
		{
			var resInit = this.init(obj);
		}
		catch (e)
		{
			return this.initializeComplete (false, e);
		}
		if (resInit instanceof Promise)
		{
			resInit
			.bind(this)
			.catch (function (error)
			{
				this.initializeComplete (false, error);
			})
			.then (function ()
			{
				return this.model.validateAsync()
				.catch (function (err)
				{
					console.error (err.stack);
				});
			})
			.then (function()
			{
				this.initializeComplete (true);
				if (typeof this.postInit === 'function') this.postInit();
			});
		}
		else if (resInit == undefined || resInit === true)
		{
			return this.model.validateAsync()
			.bind(this)
			.then(function ()
			{
				this.initializeComplete (true);
				if (typeof this.postInit === 'function') this.postInit();
			})
			.catch (function (err)
			{
				console.error (err.stack);
			});
		}
		else
		{
			return this.initializeComplete (false, resInit);
		}
	}
	else
	{
		return this.model.validateAsync()
		.bind(this)
		.then(function ()
		{
			this.initializeComplete (true);
			if (typeof this.postInit === 'function') this.postInit();
		})
		.catch (function (err)
		{
			console.error (err.stack);
		});
	}
};

exports = module.exports = function (constructor)
{
	if (constructor.prototype.hasOwnProperty('destroy') &&  typeof constructor.prototype.destroy === 'function')
	{
		var destroy = constructor.prototype.destroy;
	}
	inheritor.implements (constructor, adapter);
	if (destroy)
	{
		constructor.prototype.destroy = function ()
		{
			try
			{
				var r = destroy.apply(this, arguments);
			}
			catch (error)
			{
				return adapter.prototype.destroy.apply(this, arguments);
			}
			if (r instanceof  Promise)
			{
				var args = arguments;
				return r
				.bind(this)
				.then(function()
				{
					adapter.prototype.destroy.apply(this, args);
				});
			}
			else
			{
				return adapter.prototype.destroy.apply(this, arguments);
			}
			return r;
		}
	}
};