"use strict";

const helpers = require("../helpers/index")
  ,  util = require("util")
  ,  events = require ('events');

var _defaultIdProperty = '_id';
var _cache = {};
var _index = {};
var _types = {};

var watcher = new events.EventEmitter();
watcher.setMaxListeners(200);

var _remove = function (type, object)
{
	var typeInfos;
	var instance;
	
	if (typeof type == 'function') type = type.name;
	if (!_types.hasOwnProperty (type)) return;
	typeInfos = _types[type];
	if (!_cache[type].hasOwnProperty(object[typeInfos.idProperty])) return;
	instance = _cache[type][object[typeInfos.idProperty]];

	for (let i in typeInfos.index)
	{
        let val = typeof instance[i] === 'function' ? instance[i]():instance[i];
        if (_index[type][i].hasOwnProperty(val) && _index[type][i][val].has(instance) && _index[type][i][val].delete (instance) && !_index[type][i][val].size) delete _index[type][i][val];
	}
	delete _cache[type][object[typeInfos.idProperty]];
};

var add = function (instance)
{
	var type = instance.__static.name;
	if (exists (type, instance)) return;
};

function _add (type, instance)
{
	var typeInfos = _types[type];
	var id = instance[typeInfos.idProperty];
	if (typeof id === 'undefined')
	{
		throw new Error ('Impossible to cache instance : no id found');
	}
	else
	{
        if (_cache[type][id]) console.log ('CACHE : instance already exists');
		_cache[type][id] = instance;
		instance.on ('destroy', function () { _remove(type, this); watcher.emit ('remove', type, this); watcher.emit ('remove'+type, this);});
		instance.initialize()
        .then(function()
        {
            for (var i in typeInfos.index)
            {
                let val = typeof instance[i] === 'function' ? instance[i]():instance[i];
                if (!_index[type][i].hasOwnProperty(val))
                {
                    _index[type][i][val] = new Set();
                }
                _index[type][i][val].add(instance);
            }
            watcher.emit ('new', type, instance);
            watcher.emit ('new'+type, instance);
            if (instance.client && typeof instance.client === 'object')
            {
                watcher.emit ('new'+type+instance.client._id, instance);
            }
        });
	}
}

var exists = function (type, arg1)
{
	if (arguments.length === 1 && typeof type === 'object')
	{
		arg1 = type;
		type = arg1.__type__;
	}
	else
	{
		if (typeof type == 'function') type = type.name;
	}
	if (!_types.hasOwnProperty (type)) return false;
	var id;
	if (typeof arg1 == 'object')
	{
		id = (typeof arg1[_types[type].idProperty] !== "undefined") ? arg1[_types[type].idProperty]:arg1;
	}
	else
	{
		id = arg1;
	}
	if (id != undefined && _cache[type].hasOwnProperty(id))
	{
		return _cache[type][id];
	}
	return false;
};

var get = function (type, arg1, arg2)
{
	if (typeof type == 'function') type = type.name;
	if (typeof type == 'undefined' || !_types.hasOwnProperty(type))
	{
		throw new Error ("Type incompatible avec le système de cache. le type ("+type+") n'est pas enregistré.");
	}

	var typeInfos = _types[type];
	var data;
	var id;
	var instance;

	if (typeof arg1 == 'object')
	{
		data = arg1;
        id = arg1[typeInfos.idProperty];
	}
	else
	{
		id = arg1;
		data = arg2;
	}

	if (typeof id != 'undefined' && _cache[type][id] != undefined)
	{
		console.log ('get '+type+' from cache');
		return _cache[type][id];
	}

	if (typeof data !== 'undefined' && data instanceof typeInfos.constructor)
	{
		instance = data;
	}
	else
	{
		instance = new typeInfos.constructor(data);
		console.log ('create '+type+' from cache');
    }

    if (instance[typeInfos.idProperty])
    {
        _add (type, instance);
    }
    else
    {
        console.log('CACHE : Instance Does not have any ID');
        instance.initialize()
        .then(function(instance)
        {
            _add (type, instance);
        });
    }
	return instance;
};

function getOneBy (type, search)
{
    return getBy(type, search)[0];
}

function getOneByOrCreate (type, search, data)
{
    var instance = getOneBy(type, search, data);
    if (instance) return instance;

    if (typeof type == 'function') type = type.name;
    var instance = get(type, helpers.mixin (data, search));
    for (var i in search)
    {
        if (!_index[type].hasOwnProperty(i)) continue;
        let val = search[i];
        if (!_index[type][i].hasOwnProperty(val))
        {
            _index[type][i][val] = new Set();
        }
        _index[type][i][val].add(instance);
    }
    return instance;
}

function getBy (type, search)
{
	if (typeof type == 'function') type = type.name;

    if (search.hasOwnProperty ('_id')) return exists (type, search._id);

    if (!_index.hasOwnProperty(type)) return false;

    var results = new Set();
    var first = true;
    for (let i in search)
    {
        if (!_index[type].hasOwnProperty(i)) continue;
        let val = search[i];
        let index = _index[type][i];
        let instances = false;
        if (val instanceof RegExp)
        {
            for (let j in index)
            {
                if (val.test(j))
                {
                    instances = index[j];
                    break;
                }
            }
        }
        else
        {
            if (!index.hasOwnProperty(val)) continue;
            instances = index[val];
        }
        if (instances)
        {
            if (first)
            {
                results = instances;
                first = false;
            }
            else
            {
                results = new Set ([...instances].filter(x => results.has(x)))
            }
        }
    }
    return [...results];
}

function hasIndex (type, index)
{
    return _index[type].hasOwnProperty(index);
}

var all = function (type, limit)
{
	if (typeof type == 'function') type = type.name;
	if (!_cache.hasOwnProperty(type)) return {};
    return helpers.copy(_cache[type], limit);
};

var updateIndex = function (instance, index, newValue)
{
	var type = instance.__static.name;
	if (!_types.hasOwnProperty (type)) return newValue;

    var oldValue = typeof instance[index] === 'function' ? instance[index]():instance[index];
    if (_index[type][index].hasOwnProperty(oldValue) && _index[type][index][oldValue].delete(instance) && !_index[type][index][oldValue].size) delete _index[type][index][oldValue];
    if (!_index[type][index].hasOwnProperty(newValue)) _index[type][index][newValue] = new Set();
    _index[type][index][newValue].add(instance);
	return newValue;
};

var register = function (constructor, params)
{
	params = (typeof params == 'object') ? params : {};
	var index = params.hasOwnProperty('index') ? (util.isArray(params.index) ? params.index:[params.index]):[];
	var idProperty = params.hasOwnProperty('idName') ? params.idName:_defaultIdProperty;
	var type  = constructor.name;
	
	_types[type] = 
	{
		'constructor': constructor
	,   'index': {}
	,   'idProperty': idProperty
	};

	_cache[type] = {};
	_index[type] = {};
	
	for (var i = 0, l = index.length; i<l; i++)
	{
		_types[type].index[index[i]] = true;
		_index[type][index[i]] = {};
	}

	console.log ('Model : ' + type + ' is registered for cache');
};

var isRegistered = function (type)
{
	if (typeof type == 'function') type = type.name;
	return _types.hasOwnProperty(type);
};

var getType = function (type)
{
	type = typeof type === 'function' ? type.name:type;
	if (_types.hasOwnProperty(type))
	{
		return _types[type].constructor;
	}
	
	return false;
};

var idOf = function (type, data)
{
	switch (typeof type)
	{
		case 'string':
		break;
		case 'function':
			type = type.name;
		break;
		case 'object':
			if (typeof type.__static === 'function')
			{
				data = type;
				type = data.__static.name;
				break;
			}
		default:
			throw new Error ('First argument is not valid in function cache.idOf()');
	}
	if (!_types.hasOwnProperty (type)) throw new Error ('type is not registered in cache.idOf()');
	return data[_types[type].idProperty];
};

var trace = function ()
{
	console.log ('///////////////////////////////////////---CACHE---///////////////////////////////////////');
	for (var i in _types)
	{
		console.log ('// Type : '+i);
		console.log ('{');
		console.log ('	id property : '+_types[i].idProperty);
		console.log ('	index :');
		console.log ('	[');
		for (var j in _types[i].index)
		{
			console.log ('		'+j);
		}
		console.log ('	]');
		var l = 0;
		for (j in _cache[i])
		{
			l++;
		}
		console.log ('	length : '+l);
		console.log ('}');
		console.log (' ');
	}	
	console.log ('//////////////////////////////////////////////////////////////////////////////////////////////////');
};

module.exports = exports = {
	'get': get
,   'getType': getType
,   'getBy': getBy
,   'getOneBy': getOneBy
,   'getOneByOrCreate': getOneByOrCreate
,   'all': all
,   'updateIndex': updateIndex
,   'exists': exists
,   'register': register
,   'isRegistered': isRegistered
,   'idOf': idOf
,   'trace': trace
,   'watcher': watcher
,   'hasIndex': hasIndex
,   '_cache': _cache
,   '_index': _index
};