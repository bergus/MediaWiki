/*
 * Implementation for mediaWiki.user
 */

( function ( mw, $ ) {

	/**
	 * Generates a random user session ID (32 alpha-numeric characters).
	 *
	 * This information would potentially be stored in a cookie to identify a user during a
	 * session or series of sessions. Its uniqueness should not be depended on.
	 *
	 * @return String: Random set of 32 alpha-numeric characters
	 */
	function generateId() {
		var id = '',
			seed = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
		for (var i = 0; i < 32; i++ ) {
			id += seed.charAt( Math.floor( Math.random() * seed.length ) );
		}
		return id;
	}

	/**
	 * User object
	 */
	function User( api, name, options, tokens ) {

		/* Private Members */

		var user = this,
			callbacks = {};
		// @TODO: this.invalidateCallbacks()
		// or declare callback options static (not changing when logout etc)
		// or just make them public

		/* Public Members */

		this.options = options || new mw.Map();

		this.tokens = tokens || new mw.Map();

		/* Public Methods */

		/**
		 * Gets the current user's groups or rights or the like
		 * 
		 * @param {String, Array} info: One of 'groups', 'rights', 'blockinfo', 'implicitgroups', 'editcount', 'registration' etc.
		 *                              or also 'hasmsg', 'options', 'ratelimits' etc, for logged-in users only 
		 * @param deprecated {Function} callback
		 * 
		 * @return Promise: for all the requested information
		 */
		this.getUserInfo = function( info, callback ) {
			var api;
			if ( ! $.isArray( info ) )
				info = [info];
			var promises = [];
			for (var i=0; i<info.length; i++) {
				var prop = info[i];
				if ( prop in callbacks )
					info.splice(i--, 1);
				else
					callbacks[prop] = $.Deferred();
				promises.push(callbacks[prop]);
			}
			if (info.length)
				/* 
				 * @TODO use api.query('allusers', {prop:info, from:this.getName(), limit:1})
				 *        or api.query('users', {users:this.getName(), prop:info})
				 * for logged-out users
				 */
				api.query('userinfo', {prop:info}).done( function(data) {
					for (var i=0; i<info.length; i++)
 						callbacks[info[i]].resolve( data[info[i]] || null );
 					// @TODO: set this.options if they were requested
				} );
				/*
				 * @TODO: fail callback?
				 * at least invalidate the promises
				*/
			var result = $.when.apply(null, promises);
			if (callback)
				result.done(callback); 
			return result;
		};
		
		/** 
		 * Gets the current Api connection
		 *
		 * @return Api: the mw.Api object on which this user operates 
		 */
		this.getApi = function() {
			return api;
		}
		
		/**
		 * Gets the current user's name.
		 *
		 * @return Mixed: User name string or null if users is anonymous
		 */
		this.getName = function() {
			return name;
		};
		/**
		 * @deprecated since 1.20 use mw.user.getName() instead
		 */
		this.name = this.getName;

		/**
		 * Checks if the current user is anonymous.
		 *
		 * @return Boolean
		 */
		this.isAnon = function () {
			return this.getName() === null;
		};
		/**
		 * @deprecated since 1.20 use mw.user.isAnon() instead
		 */
		this.anonymous = this.isAnon;
	}
	
	/**
	 * Gets a random session ID automatically generated and kept in a cookie.
	 *
	 * This ID is ephemeral for everyone, staying in their browser only until they close
	 * their browser.
	 *
	 * @return String: User name or random session ID
	 */
	User.prototype.sessionId = function () {
		var sessionId = $.cookie( 'mediaWiki.user.sessionId' );
		if ( ! sessionId ) {
			sessionId = generateId();
			$.cookie( 'mediaWiki.user.sessionId', sessionId, { 'expires': null, 'path': '/' } );
		}
		return sessionId;
	};

	/**
	 * Gets the current user's name or a random ID automatically generated and kept in a cookie.
	 *
	 * This ID is persistent for anonymous users, staying in their browser up to 1 year. The
	 * expiration time is reset each time the ID is queried, so in most cases this ID will
	 * persist until the browser's cookies are cleared or the user doesn't visit for 1 year.
	 *
	 * @return String: User name or random session ID
	 */
	User.prototype.id = function() {
		var name = this.getName();
		if ( name ) {
			return name;
		}
		var id = $.cookie( 'mediaWiki.user.id' ) || generateId();

		// Set cookie if not set, or renew it if already set
		$.cookie( 'mediaWiki.user.id', id, {
			expires: 365,
			path: '/'
		} );
		return id;
	};

	/**
	 * Gets the user's bucket, placing them in one at random based on set odds if needed.
	 *
	 * @param key String: Name of bucket
	 * @param options Object: Bucket configuration options
	 * @param options.buckets Object: List of bucket-name/relative-probability pairs (required,
	 * must have at least one pair)
	 * @param options.version Number: Version of bucket test, changing this forces rebucketing
	 * (optional, default: 0)
	 * @param options.tracked Boolean: Track the event of bucketing through the API module of
	 * the ClickTracking extension (optional, default: false)
	 * @param options.expires Number: Length of time (in days) until the user gets rebucketed
	 * (optional, default: 30)
	 * @return String: Bucket name - the randomly chosen key of the options.buckets object
	 *
	 * @example
	 *     mw.user.bucket( 'test', {
	 *         'buckets': { 'ignored': 50, 'control': 25, 'test': 25 },
	 *         'version': 1,
	 *         'tracked': true,
	 *         'expires': 7
	 *     } );
	 */
	User.prototype.bucket = function ( key, options ) {
		var cookie, parts, version, bucket,
			range, k, rand, total;

		options = $.extend( {
			buckets: {},
			version: 0,
			tracked: false,
			expires: 30
		}, options || {} );

		cookie = $.cookie( 'mediaWiki.user.bucket:' + key );

		// Bucket information is stored as 2 integers, together as version:bucket like: "1:2"
		if ( typeof cookie === 'string' && cookie.length > 2 && cookie.indexOf( ':' ) > 0 ) {
			parts = cookie.split( ':' );
			if ( parts.length > 1 && Number( parts[0] ) === options.version ) {
				version = Number( parts[0] );
				bucket = String( parts[1] );
			}
		}
		if ( bucket === undefined ) {
			if ( !$.isPlainObject( options.buckets ) ) {
				throw 'Invalid buckets error. Object expected for options.buckets.';
			}
			version = Number( options.version );
			// Find range
			range = 0;
			for ( k in options.buckets ) {
				range += options.buckets[k];
			}
			// Select random value within range
			rand = Math.random() * range;
			// Determine which bucket the value landed in
			total = 0;
			for ( k in options.buckets ) {
				bucket = k;
				total += options.buckets[k];
				if ( total >= rand ) {
					break;
				}
			}
			if ( options.tracked ) {
				mw.loader.using( 'jquery.clickTracking', function () {
					$.trackAction(
						'mediaWiki.user.bucket:' + key + '@' + version + ':' + bucket
					);
				} );
			}
			$.cookie(
				'mediaWiki.user.bucket:' + key,
				version + ':' + bucket,
				{ 'path': '/', 'expires': Number( options.expires ) }
			);
		}
		return bucket;
	};

	/**
	 * Gets the current user's groups.
	 */
	User.prototype.getGroups = function ( callback ) {
		return this.getUserInfo( 'groups', callback );
	};

	/**
	 * Gets the current user's rights.
	 */
	User.prototype.getRights = function ( callback ) {
		return this.getUserInfo( 'rights', callback );
	};

	mw.User = User;
	
	// Extend the skeleton mw.user from mediawiki.js
	// This is kind of ugly but we're stuck with this for b/c reasons
	mw.user = new User( mw.getApi(), mw.config.get('wgUsername'), mw.user.options, mw.user.tokens );

}( mediaWiki, jQuery ) );
