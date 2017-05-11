"use stric";

/**
 * Module dependencies.
 */
var crypto = require('crypto')
  ,  SecurizedUser = require('../security/securizeduser')
  ,  Remoted = require('../remote/remoted')
  ,  {Client, mongoose} = require('../config')
  ,  util = require('util')
  ,  timers = require('timers')
  ,  cache = require('../remote/cache')
  ,  Diacritics = require('diacritic');


const loginPattern = /^[a-z0-9\-_\.\+]+$/i;

/**
 *		User	Group	Other
 * 	rwx	rw-	r-x	r--	-wx	-w-	--x
 * 	7		6		5		4		3		2		1
*/
const mapDefaults = {required: true};
const map =
{
    client: ['=', 440, 'index', Client]
,   created_at: ['createdAt', 440, {type: Date, default: Date.now}]
,   admin: ['=', 400, {type: Boolean, default: false}]
,   name: ['()', 640, String, {loginpattern:true}]
,   login: ['()', 440, {type: String, required: false}, {pattern: loginPattern}]
,   cookie: ['=', 0, 'unique', String]
,   authorized_modules: ['authorizedModules()', 0, {default: []}]
,   remotedMethods:
    {
        setPassword: 100
    ,   setName: 100
    ,   ping: 110
    }
	/**
	 *  0 = super user
	 *  1 = authenticated user
	 *  2 = anonymous user
	**/
,   remotedStaticMethods:
	{
		checkNameExists: 1
	}
};

class User extends Remoted
{

    preInit (data)
    {
        if (!data.hasOwnProperty ('cookie') && data.hasOwnProperty ('name') && data.hasOwnProperty ('password'))
        {
            if (data.client && typeof data.client === 'object' && data.client.hasOwnProperty('_id'))
            {
                data.cookie = User.hash(data.client._id) + User.hash(User.nameToLogin(data.name)) + User.hash(data.password);
                delete data.password;
            }
            else if (data.client_id)
            {
                data.cookie = User.hash(data.client_id) + User.hash(User.nameToLogin(data.name)) + User.hash(data.password);
                delete data.password;
            }
        }
    }

    init ()
    {
        this.connected = 0;
        this.chown (this);
        this.chgrp(this.client.group());
        this.parent = this.client;
        this.sockets = {};

        if (typeof this._login == 'undefined')
        {
            this._login = User.nameToLogin (this.name());
        }
    }

    login (login)
    {
        this.hashName = User.hash(login);
        this.cookie = cache.updateIndex (this, 'cookie', this.cookie);
        this.save ('cookie');
    }

    name (name, user)
    {
        return User.checkNameExists({name: name}, this.client.id)
        .bind(this)
        .then (function (exists)
        {
            var login = User.nameToLogin(name);
            if (!exists || login == this.login())
            {
                var oldName = this.name();
                this.login (login);
                this.emit ('name-change', name, oldName);
                return name;
            }
            else
            {
                throw new Remoted.Error ('user name is already used');
            }
        });
    }

    setName (name, user)
    {
        return this.r_name(name, user).then(function()
        {
            return {name: this.name(), cookie: this.cookie};
        });
    }

    setPassword (pass)
    {
        var self = this;
        var hashPass = User.hash(pass);
        var rollback = hashPass;

        if (hashPass != this.hashPassword)
        {
            this.hashPassword = hashPass;
            return this.save ('cookie').then(function ()
            {
                cache.updateIndex (self, 'cookie', self.cookie);
                return self.cookie;
            })
            .catch (function (err)
            {
                self.hashPassword = rollback;
                throw err;
            });
        }
        else
        {
            return this.cookie;
        }
    }

    get hashName ()
	{
		return this.cookie.substr(32,32);
	}

	set hashName(val)
	{
		this.cookie = this.cookie.substr(0,32) + val+this.hashPassword;
	}

    get hashPassword ()
    {
        return this.cookie.substr(64,32);
    }

    set hashPassword (val)
    {
        this.cookie = this.cookie.substr(0,32) + this.hashName + val;
    }

    bindSocket (socket)
    {
        if (!socket) return;
        if (this.sockets.hasOwnProperty(socket.id)) return console.log ('socket '+socket.id+' is already bound to user '+this._name);
        this.sockets[socket.id] = socket;
        this.connected++;
        socket.user = this;
        socket.once('disconnect', this._onSocketDisconnect);
        console.log ('---------->USER BIND SOCKET '+ this._name + ' : '+this.connected);
        if (this.connected === 1) this.emit('connect');
    }

    unbindSocket (socket)
    {
        if (!socket) return;
        if (!this.sockets.hasOwnProperty(socket.id)) return console.log ('socket '+socket.id+' is not bound to user '+this._name);
        delete this.sockets[socket.id];
        this.connected--;
        console.log ('<---------- USER UNBIND SOCKET '+ this._name + ' : '+this.connected);
        if (this.connected === 0) this.emit('disconnected');
    }

    _onSocketDisconnect (socket)
    {
        socket.user.unbindSocket(socket);
    }

    isAlive ()
    {
        var promises = [];
        for (var i in this.sockets)
        {
            promises.push(this.sockets[i].isAlive());
        }
        return Promise.settle(promises);
    }

    kill ()
    {
        var promises = [];
        for (var i in this.sockets)
        {
            promises.push(this.sockets[i].kill());
        }
        return Promise.settle(promises);
    }

    destroy ()
    {
        var self = this;
        if (this.connected)
        {
            var promises = [];
            var socket;
            for (var i in this.sockets)
            {
                socket = this.sockets[i];
                promises.push(new Promise(function (resolve)
                {
                    socket.once('disconnect', resolve);
                    socket.disconnect();
                }));
            }
            return Promise.settle(promises).then(function ()
            {
                return superDestroy.call(self);
            });
        }
        else
        {
            delete this.client;
            return Promise.resolve(superDestroy.call(this));
        }
    }

    /**
    *	STATIC
    **/

    static checkNameExists(arg, clientId, user)
    {
        var search = {};
        switch (typeof arg)
        {
            case 'string':
                search.login = arg;
            break;
            case 'object':
                if (arg != null)
                {
                    if (arg.hasOwnProperty('name'))
                    {
                        search.login = User.nameToLogin (arg.name);
                        break;
                    }
                    else if (arg.hasOwnProperty('login'))
                    {
                        search.login = arg.login;
                        break;
                    }
                }
            default:
                return Promise.reject(new Error ("wrong name argument in function User.checkNameExists"));
        }
        switch (typeof clientId)
        {
            case 'undefined':
                search.client_id = user.client.id;
            break;
            case 'string':
                search.client_id = mongoose.Types.ObjectId(clientId);
            break;
            case 'object':
                if (clientId instanceof mongoose.Types.ObjectId)
                {
                    search.client_id = clientId;
                    break;
                }
            default:
                return Promise.reject(new Error ("wrong clientId argument in function User.checkNameExists"));
        }
        return this.find(search).then (function (data)
        {
            return data.length>0;
        });
    }

    static hash (str)
    {
        if (typeof str === "object" && typeof str.toString === "function")
        {
            str = str.toString();
        }
        var key = helpers.randomString();
        var iv = helpers.randomString();
        var md5 = crypto.createHash('md5');
        var cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
        var crypted = cipher.update(str, 'utf-8', 'hex');

        crypted += cipher.final('hex');
        md5.update(crypted);

        return md5.digest('hex');
    }

    static nameToLogin (name)
    {
        if (typeof name !== 'string') return '';
        var login = Diacritics.clean(name).toLowerCase();
        login = login.replace(/\s+/g, '');
        return login;
    }
}

User.chmodStatic (0);

SecurizedUser.implements (User);

module.exports = exports = User.build({
    map
,   mapDefaults
,   index: 'cookie'
});
