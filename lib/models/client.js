"use strict";

/**
 * Module dependencies.
 */
const Remoted = require('../remote/remoted')
  ,  SecurizedGroup = require('../security/securizedgroup')
  ,  SecurizedUser = require('../security/securizeduser');

  /**
 * Export constructor. For instanceof keyword.
 */

/**
 *		User	Group	Other
 * 	rwx	rw-	r-x	r--	-wx	-w-	--x
 * 	7		6		5		4		3		2		1
*/
const mapDefaults = {required: true};
const map =
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

class Client extends Remoted
{
    init ()
    {
        this.chown(new SecurizedUser());
        this.owner().chgrp(SecurizedGroup.get (this.name));
    }

    group ()
    {
        return this.owner().group();
    }

    /**
    * remoted function
    **/
    isExpired ()
    {
        return this.expiredAt < new Date();
    };

    getLicenseInfos ()
    {
        return {
            expiredAt: this.expiredAt
        ,	code: this.licenseCode
        ,	valid: !this.isExpired()
        };
    };

    static checkNameExists (name)
    {
        return this.find({name: new RegExp ('^'+name+'$', 'i')}).then (function (data)
        {
            return data.length>0;
        });
    }
}

Client.chmodStatic (0);

module.exports = Client.build ({
    map
,   mapDefaults
,   index: 'name'
});

