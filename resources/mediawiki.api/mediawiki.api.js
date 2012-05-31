/* mw.Api objects represent the API of a particular MediaWiki server. */

( function( $, mw, undefined ) {

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
		 * @param {Object|Function} ajax options, or just a success function
		 * @return {jqXHR}
		 */
		get: function( parameters, ajaxOptions ) {
			ajaxOptions = this.normalizeAjaxOptions( ajaxOptions );
			ajaxOptions.type = 'GET';
			return this.ajax( parameters, ajaxOptions );
		},

		/**
		 * Perform API post request
		 * @todo Post actions for nonlocal will need proxy
		 *
		 * @param {Object} request parameters
		 * @param {Object|Function} ajax options, or just a success function
		 * @return {jqXHR}
		 */
		post: function( parameters, ajaxOptions ) {
			ajaxOptions = this.normalizeAjaxOptions( ajaxOptions );
			ajaxOptions.type = 'POST';
			return this.ajax( parameters, ajaxOptions );
		},

		/**
		 * Perform the API call.
		 *
		 * @param {Object} request parameters
		 * @param {Object} ajax options
		 * @return {jqXHR}
		 */
		ajax: function( parameters, ajaxOptions ) {
		
			if (! "format" in parameters )
				parameters.format = ajaxOptions.dataType || this.settings.format;
			if (! "action" in parameters )
				parameters.action = "query"; // legacy: should be removed
			
			ajaxOptions.dataType = parameters.format;
			ajaxOptions.url = this.getUrl();
			if (! "timeout" in ajaxOptions)
				ajaxOptions.timeout = this.settings.timeout;
				

			// Some deployed MediaWiki >= 1.17 forbid periods in URLs, due to an IE XSS bug
			// So let's escape them here. See bug #28235
			// This works because jQuery accepts data as a query string or as an Object
			ajaxOptions.data = $.param( parameters ).replace( /\./g, '%2E' );

			ajaxOptions.error = function( xhr, textStatus, exception ) {
				ajaxOptions.err( 'http', {
					xhr: xhr,
					textStatus: textStatus,
					exception: exception
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

			return $.ajax( ajaxOptions );
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

})( jQuery, mediaWiki );
