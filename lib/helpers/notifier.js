"use strict";
const EventEmitter = require('events').EventEmitter;

const notifiers = new WeakMap();

exports.of = function (key)
{
    if (notifiers.has(key)) return notifiers.get(key);
    else
    {
        let notifier = new EventEmitter();
        notifier.setMaxListeners(200);
        notifiers.set(key, notifier);
        return notifier;
    }
};