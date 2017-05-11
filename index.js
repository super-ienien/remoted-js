'use strict';
const config = require ('./lib/config');

module.exports = {
    config: function (cfg)
    {
        config.mongoose = cfg.mongoose || require ('mongoose');
        config.Client = cfg.Client || require ('./lib/models/client');
        config.User = cfg.User || require ('./lib/models/user');
        config.httpServer = cfg.httpServer || createDefaultHttpServer(config.httpPort || 80);
        config.io = cfg.io || require('socket.io')(config.httpServer, cfg.ioOptions);
        config.path = cfg.path || '';
        attachServer(config.path, config.httpServer);

        this.Remoted = require('./lib/remote/remoted')
        this.cache = require('./lib/remote/cache')
        this.NotFoundError = require('./lib/errors/not-found-error')
        this.endpoint = require('./lib/remote/remote-server').createServer
    }
};

function createDefaultHttpServer()
{
    let server = require('http').createServer();
    server.listen(port);
    return server
}

function attachServer(path, srv)
{
    const url = path + '/remoted.js';
    const urlMap = path + '/remoted.js.map';
    const evs = srv.listeners('request').slice(0);

    srv.removeAllListeners('request');
    srv.on('request', (req, res) => {
        if (0 === req.url.indexOf(urlMap)) {
            self.serveMap(req, res);
        } else if (0 === req.url.indexOf(url)) {
            self.serve(req, res);
        } else {
            for (var i = 0; i < evs.length; i++) {
                evs[i].call(srv, req, res);
            }
        }
    });
}

