function NotFoundError (message, search, type)
{
    this.name = "NotFoundError";
    this.message = message || "Not found";
    this.search = search;
    this.type = type;
    this.typeName = type ? type.name:'';
}
NotFoundError.prototype = Object.create (Error.prototype);
NotFoundError.constructor = NotFoundError;

exports = module.exports = NotFoundError;