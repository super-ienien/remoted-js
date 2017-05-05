module.exports = {
    Remoted: require('./lib/remote/remoted')
,   User: require('./lib/remote/remoted')
,   cache: require('./lib/cache')
,   errors: {
        NotFoundError: require('./lib/errors/not-found-error')
    }
};

