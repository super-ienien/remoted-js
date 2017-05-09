"use strict";

const helpers = require ('../helpers/index')
    ,  {User} = require ('../conf')
    ,  RemoteSocket = require('./remote-socket')
    ,  RemoteRoom = require('./remote-room')
    ,  config = require('../config')
    ,  Route = require ('route-parser');

const servers = {};

exports.createServer = function (namespace, conf)
{
    conf.namespace = namespace;
    if (servers.hasOwnProperty(namespace)) return;

    const io = servers[namespace] = config.io.of(namespace);

    for (let route in conf.routes)
    {
        if (typeof conf.routes[route] === 'function') conf.routes[route] = {route: new Route(route), handler: conf.routes[route]}
        else delete conf.routes[route];
    }

    console.log ('IO Namespace creation : '+namespace);
    //Authentification
    io.use(function(socket, next)
    {
        let cookies = helpers.parseCookies(socket.request.headers.cookie);
        User.getOne({cookie: cookies[config.cookieName]})
        .then(function (user)
        {
            socket.user = user;
            if (conf.monoSocket && user.connected)
            {
                for (var i in user.sockets)
                {
                    if (user.sockets[i].socket.handshake.query.uid == sock.handshake.query.uid)
                    {
                        console.log('Handshake Reconnection : '+ namespace + ' - '+user.name());
                        var oldSock = user.sockets[i].socket;
                        oldSock.on('disconnect', function()
                        {
                            return next();
                        });
                        oldSock.disconnect();
                        return;
                    }
                }
                console.log(namespace + ' is alive ? ' + user.name());
                user.isAlive().then(function ()
                {
                    console.log('Handshake Failed user is alive');
                    return next(new Error('Authentication error'));
                }, next)
                .catch(function (error)
                {
                    console.log(error.stack);
                    next(new Error('internal server error'));
                });
            }
            else
            {
                return next();
            }
        })
        .catch (function (err)
        {
            console.error('Handshake Failed : '+ namespace);
            console.error (err.stack);
            return next(new Error('Authentication error'));
        });
    });

    io.on('connection', function (socket)
    {
        RemoteRoom.getOne(conf, socket.user.client)
        .then(function (room)
        {
            console.log (socket.user.name()+' connected to '+ namespace);
            return room.bindSocket(new RemoteSocket(socket));
        })
        .catch (function(err)
        {
            console.error (socket.user.name()+' load failed : '+socket.user.client.name + ' - '+namespace);
            if (err instanceof Error)
            {
                console.error (err.stack);
            }
            /** AJOUTER ENVOI D'ERREUR AU CLIENT **/
            socket.disconnect();
        });
    });
    console.log (namespace +' : remote server started');
    return io;
};