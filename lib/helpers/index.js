"use strict";
const _ = require ('lodash');
const Promise = require ('bluebird');

exports.parseCookies = function (rc)
{
	var list = {};

	rc && rc.split(';').forEach(function( cookie ) 
	{
		var parts = cookie.split('=');
		list[parts.shift().trim()] = unescape(parts.join('='));
	});
	return list;
}

exports.sqlDateTime = function (date)
{
	date = date || new Date();
	var dd = date.getDate();
	var mm = date.getMonth()+1; //January is 0!
	var hh = date.getHours();
	var MM = date.getMinutes();
	var ss = date.getSeconds();
	var yyyy = date.getFullYear();
	if(dd<10){dd='0'+dd}
	if(mm<10){mm='0'+mm}
	if(hh<10){hh='0'+hh}
	if(MM<10){MM='0'+MM}
	if(ss<10){ss='0'+ss}
	return yyyy+'-'+mm+'-'+dd+' '+hh+':'+MM+':'+ss; 
};

exports.copy = function (obj, limit)
{
    var newObj = {};
    if (!isNaN(limit))
    {
        var l = 1;
        for (var i in obj)
        {
            newObj[i] = obj[i];
            if (l >= limit) break;
            l++;
        }
    }
    else
    {
        for (var i in obj)
        {
            newObj[i] = obj[i];
        }
    }
	return newObj;
};

exports.mixin = function (source, dest)
{
	for (var i in source)
	{
		dest[i] = source[i]
	}
	return dest;
};

exports.defer = function ()
{
	var resolve, reject;
	var promise = new Promise(function()
	{
		resolve = arguments[0];
		reject = arguments[1];
	});
	return {
		resolve: resolve,
		reject: reject,
		promise: promise
    };
}

exports.pathValue = function (path, obj)
{
	if (!obj || typeof obj !== 'object') return;
	if (typeof path !== 'string') return;
	path = path.split ('.');
	var pathLength = path.length;
	var value = obj;
	for (var i = 0, l = pathLength; i<l; i++)
	{
		value = value[path[i]];
		if (typeof value === 'function') value = value.apply(obj);
		if (typeof value !== 'object') return value;
	}
	return value !== obj ? value:undefined;
};

exports.getRandomInt = function (min, max) 
{
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

exports.randomString = function (len, bits)
{
	bits = bits || 36;
	var outStr = "", newStr;
	while (outStr.length < len)
	{
		newStr = Math.random().toString(bits).slice(2);
		outStr += newStr.slice(0, Math.min(newStr.length, (len - outStr.length)));
	}
	return outStr.toUpperCase();
};

exports.addListenersTo = function (target, listeners)
{
	for (var i in listeners)
	{
		target.on(i,listeners[i]);
	}
	return target;
};

exports.removeListenersFrom = function (target, listeners)
{
	for (var i in listeners)
	{
		target.removeListener(i,listeners[i]);
	}
	return target;
};

exports.overrideDescriptor = function (selfClass, prop, descriptor)
{
    let superProto = selfClass.prototype;
    while (superProto)
    {
        if (superProto.hasOwnProperty(prop)) break;
        superProto = Object.getPrototypeOf(superProto);
    }
	let superDescriptor = Object.getOwnPropertyDescriptor(superProto, prop);
	if (descriptor.hasOwnProperty('get'))
	{
        if (descriptor.get === 'inherited')
        {
            descriptor.get = superDescriptor.get;
        }
        else
        {
            let g = {
                superGetter: superDescriptor.get
            ,	getter: descriptor.get
            };
            descriptor.get = g.getter.bind(this, g.superGetter);
        }
    }
	if (descriptor.hasOwnProperty('set'))
	{
        if (descriptor.set === 'inherited')
        {
            descriptor.set = superDescriptor.set;
        }
        else
        {
            let s = {
                 superSetter: superDescriptor.set
            ,    setter: descriptor.set
            };
            descriptor.set = function (val)
            {
                return s.setter.call(this, val, s.superSetter);
            }
        }
	}
	Object.defineProperty(selfClass.prototype, prop, exports.mixin (descriptor, superDescriptor));
};

exports.noop = function (){};

exports.toArray = function (obj)
{
    var ret = [];
    for (var i in obj)
    {
        ret.push(obj[i]);
    }
    return ret;
};

exports.equals = function (o1, o2) {
	if (o1 === o2) return true;
	if (o1 === null || o2 === null) return false;
	if (o1 !== o1 && o2 !== o2) return true; // NaN === NaN
	var t1 = typeof o1, t2 = typeof o2, length, key, keySet;
	if (t1 == t2) {
		if (t1 == 'object') {
			if (exports.isArray(o1)) {
				if (!exports.isArray(o2)) return false;
				if ((length = o1.length) == o2.length) {
					for (key = 0; key < length; key++) {
						if (!exports.equals(o1[key], o2[key])) return false;
					}
					return true;
				}
			} else if (exports.isDate(o1)) {
				if (!exports.isDate(o2)) return false;
				return exports.equals(o1.getTime(), o2.getTime());
			} else if (exports.isRegExp(o1)) {
				return exports.isRegExp(o2) ? o1.toString() == o2.toString() : false;
			} else {
				if (exports.isWindow(o1) || exports.isWindow(o2) ||
					exports.isArray(o2) || exports.isDate(o2) || exports.isRegExp(o2)) return false;
				keySet =exports.createMap();
				for (key in o1) {
					if (key.charAt(0) === '$' || exports.isFunction(o1[key])) continue;
					if (!exports.equals(o1[key], o2[key])) return false;
					keySet[key] = true;
				}
				for (key in o2) {
					if (!(key in keySet) &&
						key.charAt(0) !== '$' &&
						exports.isDefined(o2[key]) &&
						!exports.isFunction(o2[key])) return false;
				}
				return true;
			}
		}
	}
	return false;
};

exports.isArray = Array.isArray;

exports.isDate = function (value)
{
	return toString.call(value) === '[object Date]';
};

exports.isFunction = function isFunction(value)
{
	return typeof value === 'function';
};

exports.isWindow = function (obj)
{
	return obj && obj.window === obj;
};

exports.isRegExp = function (value)
{
	return toString.call(value) === '[object RegExp]';
};

exports.isDefined = function (value)
{
	return typeof value !== 'undefined';
};

exports.createMap = function ()
{
	return Object.create(null);
};

exports.wordsPattern = function (words)
{
    return '(\\W|^)(' + words.map(_.escapeRegExp).sort().join('|') + ')(\\W|$)';
};

exports.wordsRegExp = function (words, flags = 'i')
{
    return new RegExp(this.wordsPattern(words), flags);
};