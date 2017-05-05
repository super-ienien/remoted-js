var RemoteServer = require ('./remote/remote-server')
    , User = require ('./models/user')
    , Server = require ('./server')
    , Util = require ('./helpers/util');

/*
Doc config :
exports.config = {
    name: '' //nom du module
,   namespace: '' //namespace socket io pour le remoteServer? default : /nom du module
,   room: RoomClass //RemoteRoom class
,   pattern: /^$/ //pattern url du module
,   userRestricted: false //seul les user disposant du role 'module name' pourront utiliser le module
,   clientRestricted: false //seul les clients disposant du role 'module name' pourront utiliser le module
,   frontend: {
         title: '' //titre
     ,   icon: '' //icone font awesome
     ,   index: 2 //index pour l'ordre d'affichage dans les listes
     ,   root: '' //root url
    }
}
*/

var modules = {};
var frontModules = {};
var _cache = {};

exports.exists = function (name, cond)
{
    if (cond && typeof cond !== 'object') return modules.hasOwnProperty(name);
    if (modules.hasOwnProperty(name))
    {
        for (var i in cond)
        {
            if (modules[name][i] != cond[i]) return false;
        }
        return true;
    }
    return false;
};

exports.createModule = function (config)
{
    if (modules.hasOwnProperty(config.name)) return;
    var module = {
        name: config.name
    };
    
    var r;
    if (config.room)
    {
        r = Promise.resolve(config.room.autorun())
        .then(function ()
        {
            module.remoteServer = RemoteServer.createServer(config);
        });
    }
    
    if (config.frontend)
    {
        module.frontend = config.frontend;
        config.frontend.name = module.name;
        frontModules[module.name] = module;
    }

    if (config.home)
    {
        exports.home = module;
    }

    module.pattern = config.pattern ? config.pattern:new RegExp("^/"+config.name+".*$");

    modules[config.name] = module;
    exports.clearCache();
    return r || Promise.resolve();
};

exports.allModules = function ()
{
    return modules;
};

exports.modules = function (user)
{
    if (_cache.hasOwnProperty(user.id)) return _cache[user.id];
    console.log ('Create modules cache for user '+user._name);
    var res = [];
    var module;
    for (var i in modules)
    {
        module = modules[i];
        if (user.hasAuthorizedModule(module.name) && module.frontend) res.push(module.frontend);
    }
    user.once ('destroy', exports.clearCache);
    _cache[user.id] = res;
    return res;
};

exports.clearCache = function (user)
{
    if (user)
    {
        console.log ('Clear modules cache for user '+user._name);
        user.removeListener('destroy', exports.clearCache);
        delete _cache[user.id];
    }
    else
    {
        _cache = {};
    }
};

Server.addRoute ('/module', function (req, res)
{
    var cookies = Util.parseCookies(req.headers.cookie);
    var cookie = cookies.tuituit;
    var module;
    for (var i in modules)
    {
        if (modules[i].pattern.test(req.urlObject.query.url))
        {
            module = modules[i];
            break;
        }
    }
    if (module)
    {
        if (!module.anonymous && cookie)
        {
            return User.getOne({cookie: cookie}).then (function (user)
            {
                if (!user.hasAuthorizedModule(module.name)) throw "user "+user.name()+" is not allowed to access "+module.name;
                moduleResponse (res, module.name, module.history);
            })
            .catch(function (err)
            {
                console.log (err);
                moduleResponse (res, 'login');
            });
        }
        else
        {
            moduleResponse (res, module.name, module.history);
            return;
        }
    }
    else if (cookie)
    {
        return User.getOne({cookie: cookie}).then (function (user)
        {
            moduleResponse (res, exports.home.name);
        })
        .catch(function (err)
        {
            console.log (err);
            moduleResponse (res, 'login');
        });
    }
    else
    {
        moduleResponse (res, 'login');
    }
});

function moduleResponse (res, module, history)
{
    history = typeof history === 'boolean' ? history:false;
    res.writeHead (200);
    res.end (JSON.stringify({module: module, history: history}));
}