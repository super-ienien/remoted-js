/**
 * Module dependencies.
 */
var util = require('util')
  ,  Remoted = require('../remote/remoted')
  ,  SecurizedGroup = require('../security/securizedgroup')
  ,  SecurizedUser = require('../security/securizeduser')
  ,  cache = require('../remote/cache');

  /**
 * Export constructor. For instanceof keyword.
 */
module.exports = exports = Client;

/**
 * Client constructor.
 */
function Client (data)
{
	//Call base constructor
	Client.__super.call(this, data);
	this.setMaxListeners(Infinity);
	if (data != undefined) console.log ('CREATE CLIENT : '+data.name);
}

/**
 * Extends BaseObject.
 */
Remoted.inherits(Client);
cache.register (Client,
{
	index: 'name'
});

Client.chmodStatic (0);

/**
 *		User	Group	Other
 * 	rwx	rw-	r-x	r--	-wx	-w-	--x
 * 	7		6		5		4		3		2		1
*/
const defaultMapOptions = {required: true, persistent: true};
var map = 
{
    created_at: ['createdAt', 440, {type: Date, default: Date.now}]
,   expired_at: ['expiredAt', 440, Date]
,   name: ['=', 440, 'unique', String, {pattern: /^[a-z0-9]+$/i}]
,   license_code: ['licenseCode', 0, String]
,   authorized_modules_defaults: [['authorizedModulesDefaults'], 0, {default: []}]
,   remotedMethods:
	{
	    clearTweets: 110
    ,   isExpired: 110
    ,   getLicenseInfos: 110
	}
	/**
	 *  0 = super user
	 *  1 = authenticated user
	 *  2 = anonymous user
	**/
,   remotedStaticMethods:
	{
		checkNameExists: 0
	}
};

Client.prototype.init = function ()
{
	this.chown(new SecurizedUser());
	this.owner().chgrp(SecurizedGroup.get (this.name));
};

Client.prototype.group = function ()
{
	return this.owner().group();
}

/**
* remoted function
**/
Client.prototype.isExpired = function ()
{
	return this.expiredAt < new Date();
};

Client.prototype.getLicenseInfos = function ()
{
	return {
		expiredAt: this.expiredAt
	,	code: this.licenseCode
	,	valid: !this.isExpired()
	};
};

Client.setMap (map, defaultMapOptions);
Client.checkNameExists = function (name)
{
	return this.find({name: new RegExp ('^'+name+'$', 'i')}).then (function (data)
	{
		return data.length>0;
	});
}