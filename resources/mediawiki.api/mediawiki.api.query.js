/**
 * Additional mw.Api methods to assist with every call to the Query Api
 * especially handling complicated multi-property queries
 * and query-continues of !every! type
 */

( function( $, mw, undefined ) {

	/**
	* The Query class represents a request to the MediaWiki Query Api <http://www.mediawiki.org/wiki/API:Query>
	* 
	* It allows to set all those different parameters that can possibly turn up in a query url.
	* It represent the structure of such a request by its public properties, which are fairly associated with the url syntax
	* 
		this.auswahl:                  object with optional keys representing "what" is getting queried
		            .[prop|list|meta]: Array with names of the called components (querymodules)
		            .generator:        name of the querymodule used as generator
		this.query:                    object with parameters for each querymodule, keyed by the prefix of the module (including "g" for generator)
		this.set:                      Array with titles/pageids/revids to work on
		this.source:                   string for the type of the set (titles|pageids|revids)
		this.features:                 general parameters to the Query module, like "redirects", "converttitles" or "export" stuff
		this.unrecognized:             every other unknown property come from an argument (parameters of each querymodule not checked).
		
	* A Query object can be constructed - even empty - and changed according to this structure.
	* See the methods maximizeLimits() and toGenerator() on the prototype for example.
	* Then you will be able to get URL parameters, full Request objects and other stuff from the corresponding methods, which you will be able to pass into the .ajax() method.
		
	* @example: new Query("categories", null, {titles:["Wikipedia:Main Page", "Portal:Bahn"]});
	* @example: new Query("globalusage",{prop:["pageid","namespace"]},{"categorymembers": {title:"Category:Images with watermarks", type:"file"}});
	* @example: new Query("info", {prop:"protection"}, {"allpages":{prtype:["edit","move","upload"], prlevel:"sysop"}});
	* @example: new Query("backlinks",{filterredir:"redirects", redirect:true, limit:"max", title:"Benutzer:Example"});
	* @example: new Query("langlinks", {}, {generator:"categorymembers", title:"Category:Hood films"});
	* @example: new Query({pageprops: {prop:"staticredirect"}, categories:null, generator:"allpages"}, {filterredir:"redirects", filterlanglinks:"withoutlanglinks"});
	* @example: new Query({backlinks: {title: t}, links: null}, {titles:[...], nocontinue:true, redirects:true});
	* @example: new Query({"info":{token:"edit",prop:["protection","preload","displaytitle"]}, "revisions":{prop:["ids","timestamp","size","content"], limit:undefined}});
	* @example: new Query({siteinfo:{prop:["general","namespaces","namespacealiases","extensions"]}, userinfo:{prop:["blockinfo","hasmsg","rights","options","editcount","ratelimits"]},info:{token:["edit","watch"]},titles:"Main Page"});
	
	* @param was {String}: (optional) name of querymodule
	* @param params {Object}: parameters for the querymodule "was". Can be null if none needed   OR
	* @param params {Object}: map of querymodule names and their parameters. Can include the generators' querymodulename in the "generator" property
	* @param generatorparams {Object}: (optional) parameters for the generator if that is already given in "params"  OR
	* @param generatorparams {Object}: (optional) single key-value pair for generator's modulename and its parameters
	* @param spezial {Mixed}: (optional) further arguments
		The pageset will be determined by looking for the property names titles/pageids/revids in the params, generatorparams and special objects.
		A single pagename can be passed as a String to the last parameter, as a single pageid can be passed as a Number.
		For further options please dig through the code :-)	
	* @throws an Error when there are too many generators!
	*/
	function Query(was, params, generatorparams, spezial) {
// Needs Object.set, Array.isArray, Array:toObject
		
		// handle parameter overload
		if (typeof was == "object") { // != "string"
			spezial = generatorparams;
			generatorparams = params;
			params = was;
		} else if (typeof was == "string") {
			params = Object.set({}, was, params);
		} else if (typeof was == "undefined") { // expecting "params" to be undefined, too
			params = {};
		} else ;
	//console.log("mw.Api.Query: parameter "+typeof was+" 'was' is ignored");
		if (typeof generatorparams != "object" || Array.isArray(generatorparams) ) {
			spezial = generatorparams;
			generatorparams = {};
		}
		if (typeof spezial == "string")
			spezial = {titles: spezial};
		else if (typeof spezial == "number")
			spezial = {pageids: spezial};
		else if (typeof spezial != "object") // mit boolean, function oder undefined ist nichts anzufangen
			spezial = {};
		
		// determine generator and query modules
		this.auswahl = {};
		this.query = {};
		if (params.generator || generatorparams.generator) {
			this.auswahl.generator = params.generator || generatorparams.generator;
			if (params.generator && !generatorparams[this.auswahl.generator]) {
				params[this.auswahl.generator] = generatorparams;
				generatorparams = {};
			} else if (generatorparams.generator) {
				delete generatorparams.generator;
				generatorparams = Object.set({}, this.auswahl.generator, generatorparams);
			}
		} else {
			for (var gen in generatorparams) {
				if (mw.Api.knownQueryParameters.generators.indexOf(gen) > -1) {
					if (this.auswahl.generator)
						throw new Error("mw.Api.Query: only one Generator per Request is possible (you tried: "+auswahl.generator+" and "+gen+")");
					this.auswahl.generator = gen;
				}
			}
		}
		function checkparam(p, v) {
			var typ = mw.Api.knownQueryParameters.types[p];
			if (typ) {
				var pref = mw.Api.knownQueryParameters.prefixes[p];
				if ( this.auswahl.generator && this.auswahl.generator == p) {
					pref = "g"+pref;
				} else {
					if ( !this.auswahl[typ])
						this.auswahl[typ] = [];
					this.auswahl[typ].push(p);
				}
				if (Array.isArray(v))
					v = v.toObject(function(m, p){m[p]=true;});
				this.query[pref] = v; // store by prefix because of possible duplicate (generator ? prop)
			} else {
	//console.log(about(v, "nicht erkannter Parameter: "+p+", wird spezial"+(typeof spezial[p] == "undefined"?" ":" nicht ")+"zugeordnet"));
				if (typeof spezial[p] == "undefined")
					spezial[p] = v;
			}
		}
		for (var i in params)
			checkparam.call(this, i, params[i]);
		for (var i in generatorparams)
			checkparam.call(this, i, generatorparams[i]);
		
		// determine pageset
		this.set = [];
		this.source = false;
		mw.Api.knownQueryParameters.sources.forEach(function(s) {
			if (typeof spezial[s] == "undefined")
				return;
			if (this.set.length) // this.source
				throw new Error("mw.Api.query: Es darf nur einer der Parameter titles, pageids und revids vorhanden sein");
			this.set = Array.isArray(spezial[s]) ? spezial[s] : (""+spezial[s]).split("|");
			delete spezial[s];
			this.source = s;
		}, this);
		
		// ... and special params
		this.features = {};
		mw.Api.knownQueryParameters.features.forEach(function(s) {
			if (typeof spezial[s] == "undefined") // must be even boolean?
				return;
			this.features[s] = spezial[s];
			delete spezial[s];
		}, this);
		this.unrecognized = spezial; // they were too much
	}
		
	$.extend(mw.Api, {
		// the constructor function, of course
		Query: Query,
		// Some static limits, see /includes/api/ApiBase.php
		limitBigLow: 500, // Fast query, std user limit
		limitBigHigh: 5000, // Fast query, bot/sysop limit
		limitSmallLow: 50, // Slow query, std user limit
		limitSmallHigh: 500 // Slow query, bot/sysop limit
		knownQueryParameters: (function() { /*
		* querymodule overview (should be based on a query, I know, and should be specific for a mw.Api object)
		* @todo: make this object available as a dynamically created ResourceLoader Module
		*/
			var params = {
				generators: ["allimages","allpages","alllinks","allcategories","allusers","backlinks","blocks","categorymembers","deletedrevs","embeddedin","filearchive","imageusage","iwbacklinks","logevents","recentchanges","search","tags","usercontribs","watchlist","watchlistraw","exturlusage","users","random","protectedtitles","oldreviewedpages","globalblocks","abuselog","abusefilters","reviewedpages","unreviewedpages","info","revisions","links","iwlinks","langlinks","images","imageinfo","stashimageinfo","templates","categories","extlinks","categoryinfo","duplicatefiles","pageprops","flagged","globalusage"],
				sources: ["titles", "pageids", "revids"],
				features: ["redirects", "converttitles", "indexpageids", "export", "exportnowrap", "iwurl"],
				types: {},
				prefixes: {}
			};
			var typen = {
				"prop":{"categories":"cl","categoryinfo":"ci","duplicatefiles":"df","extlinks":"el","flagged":"","globalusage":"gu","imageinfo":"ii","images":"im","info":"in","iwlinks":"iw","langlinks":"ll","links":"pl","pageprops":"pp","revisions":"rv","stashimageinfo":"sii","templates":"tl"},
				"list":{"abusefilters":"abf","abuselog":"afl","allcategories":"ac","allimages":"ai","alllinks":"al","allpages":"ap","allusers":"au","backlinks":"bl","blocks":"bk","categorymembers":"cm","deletedrevs":"dr","embeddedin":"ei","exturlusage":"eu","filearchive":"fa","globalblocks":"bg","imageusage":"iu","iwbacklinks":"iwbl","logevents":"le","oldreviewedpages":"or","protectedtitles":"pt","random":"rn","recentchanges":"rc","reviewedpages":"rp","search":"sr","tags":"tg","unreviewedpages":"ur","usercontribs":"uc","users":"us","watchlist":"wl","watchlistraw":"wr"},
				"meta":{"allmessages":"am","globaluserinfo":"gui","siteinfo":"si","userinfo":"ui"}
			};
			for (var typ in typen) {
				for (var m in typen[typ]) {
					params.types[m] = typ;
					params.prefixes[m] = typen[typ][m];
				}
			}
			return params;
		})(), // just for shorter listing
	});
	
	$.extend(Query.prototype, {
		// constructor: Query,
		toString: function() {
/* returns a String describing the Query object for debugging purposes
@todo: relies on custom about() function! */
			var r = about(this.auswahl,"mw.Api::Query:\nmodule",2) + about(this.query, "\nquery",2);
			if (this.source)
				r += about(this.set,"\n"+this.source,1);
			if (Object.keys(this.unrecognized).length)
				r += about(this.unrecognized, "\nunrecognized",2);
			return r;
		},
		validateParams: function() {
			// generator properties are useless, only pageid|ns|title will be listed
			if (Object.keys(this.auswahl).length < 1) // ein generator-modul liefert auch etwas
				throw new Error("mw.Api::Query: leere Abfrage");
			if (!this.source && this.auswahl.prop && (!this.auswahl.generator || mw.Api.knownQueryParameters.types[this.auswahl.generator] == 'prop'))
				throw new Error("mw.Api::Query: Es muss genau einer der Parameter titles, pageids und revids vorhanden sein");
		},
		getParams: function getParams(prop, ind) {
/* get: {Boolean} property- (und impliziert auch generator-) parameter ausgeben, {Boolean} list- und meta-parameter (independent) ausgeben
return: a plain url parameter object */
			var q = $.extend({action:"query"}, this.features); // better: Object.set(Object.clone(this.features, true), "action", "query") ???
			for (var t in this.auswahl) {
				if (!prop && (t=="generator" || t=="prop") || !ind && (t=="list" || t=="meta"))
					continue;
				var p = this.auswahl[t], prefs = [];
				if (t == "generator") {
					q[t] = p;
					prefs = ["g" + mw.Api.knownQueryParameters.prefixes[p]];
				} else {
					q[t] = p.slice(0); // auswahl[!generator] ist ein Array
					for (var i=0; i<p.length; i++)
						prefs.push(mw.Api.knownQueryParameters.prefixes[p[i]]);
				}
				for (var i=0; i<prefs.length; i++)
					if (this.query[prefs[i]]) // false, null etc: parameterlose Queries
						for (var par in this.query[prefs[i]])
							q[prefs[i] + par] = this.query[prefs[i]][par]; // module prefix + parameter name
			}
			return q;
		},
		getRequests: function(qc, current, speclimit) {
/* get: queryContinue-Object (from result), current base object, how many set items for each query
return: Array of branch objects */
			this.validateParams();
			if (!qc || $.isEmptyObject(qc)) { // no querycontinue object yet, or nothing to continue
				if (!current && speclimit) { // when there are no base objects, we are at the beginning
					if (this.set.length) { // with a set
						var branches = []; // we may have to return many start bases
						for (var i=0; i<this.set.length; i+=speclimit) { // namely ceil(length/speclimit)
							branches.push({
								params: this.getParams(true, true), // so a full parameter set with everything
								base: Object.set({}, this.source, this.set.slice(i, i+speclimit)) // each with a different part of the set
							});
						}
						return branches;
					} else // only generators, list or meta info
						return [{ // we return only one
							params: this.getParams(true, true), // full parameter set
							base:{} // but nothing specific
						}];
				}
				return false; // a base object and no continues? We've reached the end
			}
			var ic = {}, // independent continues
				gc = {}, // generator continues
				pc = {}, // property continues
				// qc: query continue (an argument)
				g = this.auswahl.generator;
			for (var i in qc) { // every module may return some continue parameters
				if (g && i == g) { // if that module is our generator (as far as we have one)
					var pref = mw.Api.knownQueryParameters.prefixes[g];
					for (var j in qc[i]) // we check for the continue parameters
						if (j.startsWith("g"+pref)) { // if they are generator continue parameters (they don't have to!)
							gc[j] = qc[i][j];
							delete qc[i][j]; // affects the result object!
						} // else if (!j.startsWith(pref)) console.log("mw.Api.Query.getRequests: unknown continue parameter '"+j+"' for the "+i+" module!");
				}
				if (mw.Api.knownQueryParameters.types[qc[i]] == "prop") // so after generator continue parameters are filtered out, 
					$.extend(pc, qc[i]); // there may be some properties to continue
				else
					$.extend(ic, qc[i]); // or anything that doesn't belong to a generator pageset (i.e. lists)
			}
			if (current.next) { // if the current is part of a branch
				if ($.isEmptyObject(pc)) // and when there are no properties to continue
					return false; // this branch ends
				current.params = $.extend(this.getParams(true, false), pc); // else let's generate a parameter set with generator and property values, and property continue values
				return [current]; // and return it
			}
			if (!g || $.isEmptyObject(gc)) { // else if we have no generator or no continue parameters for it
				if ($.isEmptyObject(pc)) { // when there are also no property continue parameters
					if ($.isEmptyObject(ic))
						return false; // Ende! qc war leer (toter Code, isEmpty(qc) wird oben schon behandelt)
					current.params = $.extend(this.getParams(false, true), ic); // we will only have to continue with pageset-independent modules
					current.base = {}; // and for those there's no base
				} else {
					current.params = $.extend(this.getParams(true, !$.isEmptyObject(ic)), pc, ic); // or we will continue with properties (and others alongside, should they exist)
				}
				return [current]; // and go on with this branch
			}
			// if (g && gc && !current.next)
			current.next = { // create a new step for generator continue
				params: $.extend(this.getParams(true, !$.isEmptyObject(ic)), ic), // with a parameter set of generator and property values (and others along, should they exist and want to continue)
				base: this.source // base the new step
					? Object.set(gc, this.source, current.base[this.source]) // on the (continued) generator page set, together with current step's set, of course
					: gc // as far as one would exist
			};
			if ($.isEmptyObject(pc)) { // when the current wants to continue with properties
				current.params = $.extend(this.getParams(true, false), pc); // build a parameter set with generator and property values, and property continue values
				return [current, current.next]; // and return both
			} else
				return [current.next]; // or just return the new step
		},
		maximizeLimits: function() {
/* sets the limit of each query module to the value "max", when there isn't a different value already */
			function max(typ, m, gen) {
				var key = (gen || "") + mw.Api.knownQueryParameters.prefixes[m];
				var params = this.query[key] || (this.query[key] = {}); // creates new params object if there is none
				if ("limit" in params) // not check for typeof params.limit != "undefined", to allow disabling
					return;
				if (typ == "prop")
					if (["info","categoryinfo"/*, "imageinfo"*/, "pageprops"].indexOf(props[i]) != -1 // imageinfo queries (image) revisions. Is max intended then?
						||	m == "revisions" // special case: can throw errors when used within specific queries
						&& (this.source == "revids" || this.auswahl.generator || this.set.length > 1) // would be /allowed/ when none of startid, endid, dirNewer, user, excludeuser, start and end are supplied - but it won't be inteded anyway
					)
						return;
				params.limit = "max";
			}
			var lists, props, gen;
			if (lists = this.auswahl.list)
				for (var i=0; i<lists.length; i++)
					max.call(this, "list", lists[i]);
			if (props = this.auswahl.prop)
				for (var i=0; i<props.length; i++)
					max.call(this, "prop", props[i]);
			if (gen = this.auswahl.generator)
				max.call(this, mw.Api.knownQueryParameters.types[gen], gen, "g");
			return this; // chainable
		},
		toGenerator: function() {
/* returns a new Query object with the same pageSet and features, but the current generator/prop/list module used as a generator.
	returns false when there is currently more than one module */
			var a = this.auswahl, q;
			if (a.meta && a.meta.length)
				return false;
			if (a.generator && (a.prop || []).length + (a.list || []).length < 1) {
				q = new this.constructor({generator: a.generator});
				q.query = Object.clone(this.query, true);
			} else if (!a.generator && (a.prop || []).length + (a.list || []).length == 1) {
				var g = a.prop ? a.prop[0] : a.list[0];
				if (mw.Api.knownQueryParameters.generators.indexOf(g) > -1) {
					q = new this.constructor({generator: g});
					q.query["g"+Object.keys(this.query)[0]] = Object.clone(Object.values(this.query)[0]);
				}
			}
			if (!q)
				return false;
			q.source = this.source;
			q.set = this.set.slice(0);
			q.features = Object.clone(this.features);
			return q;
		}
	});
	
	$.extend( mw.Api.prototype, {
	})

} )( jQuery, mediaWiki );
