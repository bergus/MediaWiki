/**
 * mw.Api objects represent the API of a particular MediaWiki server.
 */
( function ( mw, $ ) {

	/**
	 * Constructor to create a settings object for a particular Api
	 *
	 * @constructor
	 * @param options {Object} The settings to override. See prototype for defaults
	 */
	function Settings(options) {
		$.extend(this, options);
	}
	
	// the defaults are exposed to the public
	Api.defaultSettings = Settings.prototype = {
		
		timeout: 30000, // 30 seconds

		format: "json", // default response format
		
		remote: { // settings for remote Apis that don't have CORS enabled
			url: { format: "json" },
			jsonp: "callback"
		},
		
		// @todo: should be queried from the corresponding User object
		highlimits: false, // whether the current user has the apihighlimits right
		
		maxURIlength: 2000, // maximum character length for serialized query parameters - when above they will get POSTed
		/*	http://bots.wmflabs.org/~petrb/logs/%23wikimedia-operations/20120424.txt:
			[21:29:37] <RoanKattouw>   Does anyone know at what URL length Squid will return ERR_TOO_BIG?
			[21:29:49] <RoanKattouw>   Someone in -dev triggered it with a long API request and he's wondering what the limit is
			[21:45:50] <binasher>      RoanKattouw: I think it's 8k but might only be 4k  */
	};

	/**
	 * Constructor to create an object to interact with the API of a particular MediaWiki server.
	 *
	 * @todo Share API objects with exact same config.
	 * @example
	 * <code>
	 * var api = new mw.Api();
	 * api.get( {
	 *     action: 'query',
	 *     meta: 'userinfo'
	 * }, {
	 *     ok: function () { console.log( arguments ); }
	 * } );
	 * </code>
	 *
	 * @constructor
	 * @param url {String} The URL to the MediaWiki api entry point.
	 * @param options {Object} See Settings documentation above. All options can also be
	 * overridden for each individual request later on.
	 */
	mw.Api = function( url, options ) {
		if ( typeof url == "object" ) {
			options = url;
			url = options.url;
			delete options.url;
		}
		if ( options === undefined ) {
			options = {};
		}

		// getter for the api's url
		this.getURL = function() {
			return String( url );
		}

		this.settings = new Settings( options );
	};

	mw.Api.prototype = {

		/**
		 * For api queries, in simple cases the caller just passes a success callback.
		 * In complex cases they pass an object with a success property as callback and
		 * probably other options.
		 * Normalize the argument so that it's always the latter case.
		 *
		 * @param {Object|Function} An object contaning one or more of options.ajax,
		 * or just a success function (options.ajax.ok).
		 * @return {Object} Normalized ajax options.
		 */
		normalizeAjaxOptions: function( arg ) {
			var opt = arg;
			if ( typeof arg === 'function' ) {
				opt = { 'ok': arg };
			}
			if ( !opt.ok ) {
				throw new Error( 'ajax options must include ok callback' );
			}
			return opt;
		},

		/**
		 * Perform API get request
		 *
		 * @param {Object} request parameters
		 * @param {Object|Function} [optional] ajax options
		 * @return {jQuery.Promise}
		 */
		get: function ( parameters, ajaxOptions ) {
			ajaxOptions = this.normalizeAjaxOptions( ajaxOptions );
			ajaxOptions.type = 'GET';
			return this.ajax( parameters, ajaxOptions );
		},

		/**
		 * Perform API post request
		 * @todo Post actions for nonlocal will need proxy
		 *
		 * @param {Object} request parameters
		 * @param {Object|Function} [optional] ajax options
		 * @return {jQuery.Promise}
		 */
		post: function ( parameters, ajaxOptions ) {
			ajaxOptions = this.normalizeAjaxOptions( ajaxOptions );
			ajaxOptions.type = 'POST';
			return this.ajax( parameters, ajaxOptions );
		},

		/**
		 * Perform an api call
		 *
		 * @param {Object}: request parameters as key-value-pairs. The values will be encoded appropriate to their type, different from $.param:
				{Function}:      will be executed before
				undefined, null: property is dropped
				{Boolean}:       "1" for true, "0" for false
				{Number}:        will be stringified
				{String}:        will just get escaped
				{Array}:         items are joined with "|", the usual value separator for query api parameters
				{Object}:        will be converted to a string
		 * @param {Object}: ajax options
		 * @return {jQuery.Promise}
		 * - done: API response data as first argument
		 * - fail: errorcode as first arg, details (string or object) as second arg.
		 */
		ajax: function ( parameters, ajaxOptions ) {
			var token,
				apiDeferred = $.Deferred();

		
			if (! "format" in parameters )
				parameters.format = ajaxOptions.dataType || this.settings.format;
			if (! "action" in parameters )
				parameters.action = "query"; // legacy: should be removed
			
			ajaxOptions.dataType = parameters.format;
			if (! "timeout" in ajaxOptions)
				ajaxOptions.timeout = this.settings.timeout;
			if (ajaxOptions.type != "POST")
				ajaxOptions.type = "GET";
			/**
			* We don't trust $.param for a couple of reasons:
			* IE XSS bug with dots
			* prevent ERR_TOO_BIG for very large GET requests.
			* different handling of Array values
			* different handling of Boolean values
			*/
			var get = [], post = [], getChars = 1;
			for (var key in parameters) {
				var value = parameters[key];
				if (typeof value == "function")
					value = value();
				if ($.isArray(value))
					value = value.join("|");
				var p = encodeURIComponent(key) + "=";
				if (typeof value == "string" || typeof value == "object")
					p += encodeURIComponent(value);
				else if (typeof value == "boolean")
					p += value ? "1" : "0";
				else if (typeof value == "number")
					p += value;
				else
					return;
					
				p = p.replace(/%20/g, "+").replace( /\./g, '%2E' ); // escape dots for IE, see bug #28235
				if (ajaxOptions.type == "POST" && key != "action" || (getChars += p.length) > this.settings.maxURIlength)
					post.push(p);
				else
					get.push(p);
			}

			if (post.length) {
				ajaxOptions.type = "POST";
				ajaxOptions.data = post.join("&");
			} else
				ajaxOptions.data = undefined;
			ajaxOptions.url = this.getUrl()+"?"+get.join("&"); // will at least contain the action

				} );
			};

			// Success just means 200 OK; also check for output and API errors
			ajaxOptions.success = function( result ) {
				if ( result === undefined || result === null || result === '' ) {
					ajaxOptions.err( 'ok-but-empty',
						'OK response but empty result (check HTTP headers?)' );
				} else if ( result.error ) {
					var code = result.error.code === undefined ? 'unknown' : result.error.code;
					ajaxOptions.err( code, result );
				} else {
					ajaxOptions.ok( result );
				}
			};

			return $.ajax( ajaxOptions ).pipe( function(result) {
				if (! result) {
					return (new $.Deferred).reject("ok-but-empty", 'OK response but empty result (check HTTP headers?)', result);
				} else if (parameters.format == "json") {
					if (result.error) {
						return (new $.Deferred).reject(result.error.code || "unknown", result.error, result);
					} else if( ! result[parameters.action] ) {
						if (parameters.action == "query" && query.prop && query.prop.length > 0)) // Bug 31901
							result["query"] = {pages:{}};
						else
							return (new $.Deferred).reject("missing_"+parameters.action+"-element", "no "+parameters.action+"-element found", result);
					}
				} else if (parameters.format == "xml") {
					var dom = result.documentElement, e, a;
					if ((e = dom.getElementsByTagName('error')).length > 0) {
						return (new $.Deferred).reject(e[0].getAttribute('code'), e[0], result);
					} else if ((a = dom.getElementsByTagName(parameters.action)).length == 0) {
						if (parameters.action == "query" && query.prop && query.prop.length > 0)) // Bug 31901
							dom.appendChild(result.createElement("query"));
						else
							return (new $.Deferred).reject("missing_"+parameters.action+"-element", "no "+parameters.action+"-element found", result);
					}
				}
				return result; // This is now a safe return value: It exists, it has no errors, and it contains a result element matching the action
			} );
		}

	};

	/**
	 * @var {Array} List of errors we might receive from the API.
	 * For now, this just documents our expectation that there should be similar messages
	 * available.
	 */
	mw.Api.errors = [
		// occurs when POST aborted
		// jQuery 1.4 can't distinguish abort or lost connection from 200 OK + empty result
		'ok-but-empty',

		// timeout
		'timeout',

		// really a warning, but we treat it like an error
		'duplicate',
		'duplicate-archive',

		// upload succeeded, but no image info.
		// this is probably impossible, but might as well check for it
		'noimageinfo',
		// remote errors, defined in API
		'uploaddisabled',
		'nomodule',
		'mustbeposted',
		'badaccess-groups',
		'stashfailed',
		'missingresult',
		'missingparam',
		'invalid-file-key',
		'copyuploaddisabled',
		'mustbeloggedin',
		'empty-file',
		'file-too-large',
		'filetype-missing',
		'filetype-banned',
		'filetype-banned-type',
		'filename-tooshort',
		'illegal-filename',
		'verification-error',
		'hookaborted',
		'unknown-error',
		'internal-error',
		'overwrite',
		'badtoken',
		'fetchfileerror',
		'fileexists-shared-forbidden',
		'invalidtitle',
		'notloggedin'
	];

	/**
	 * @var {Array} List of warnings we might receive from the API.
	 * For now, this just documents our expectation that there should be similar messages
	 * available.
	 */
	mw.Api.warnings = [
		'duplicate',
		'exists'
	];
	
	/**
	* @var mw.api {Api} The mw.Api for the current wiki
	* Uses a getter to dynamically create the Api object only when needed
	* and creates one when the gettere feature is not supported
	*/
	var staticApi;
	function getDefaultApi() {
		var url =  mw.config.get('wgScriptPath')+"/api"+mw.config.get('wgScriptExtension');
		return staticApi || (staticApi = new Api(url));
	}
	if (Object.defineProperty)
		Object.defineProperty(mw, "api", {
			get: getDefaultApi,
			enumerable: true,
			configurable: true
		});
	else
		mw.api = getDefaultApi();

}( mediaWiki, jQuery ) );
