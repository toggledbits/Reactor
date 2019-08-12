//# sourceURL=J_ReactorSensor_UI7.js
/**
 * J_ReactorSensor_UI7.js
 * Configuration interface for ReactorSensor
 *
 * Copyright 2018,2019 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 *
 */
/* globals api,jQuery,$,unescape,ace,Promise,setTimeout,MultiBox */
/* jshint multistr: true */

//"use strict"; // fails on UI7, works fine with ALTUI

var ReactorSensor = (function(api, $) {

	/* unique identifier for this plugin... */
	var uuid = '21b5725a-6dcd-11e8-8342-74d4351650de';

	var pluginVersion = '3.4develop-19224';

	var DEVINFO_MINSERIAL = 71.222;

	var _UIVERSION = 19195;     /* must coincide with Lua core */

	var _CDATAVERSION = 19082;  /* must coincide with Lua core */

	var myModule = {};

	var serviceId = "urn:toggledbits-com:serviceId:ReactorSensor";
	var deviceType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

	var moduleReady = false;
	var iData = [];
	var roomsByName = [];
	var actions = {};
	var deviceActionData = {};
	var deviceInfo = {};
	var userIx = {};
	var userNameIx = {};
	var dateFormat = "%F"; /* ISO8601 defaults */
	var timeFormat = "%T";
	var configModified = false;
	var inStatusPanel = false;
	var isOpenLuup = false;
	var isALTUI = false;
	var devVeraAlerts = false;
	var lastx = 0;
	var condTypeName = {
		"comment": "Comment",
		"service": "Device State",
		"housemode": "House Mode",
		"weekday": "Weekday",
		"sun": "Sunrise/Sunset",
		"trange": "Date/Time",
		"interval": "Interval",
		"ishome": "Geofence",
		"reload": "Luup Reloaded",
		"grpstate": "Group State"
	};
	/* Note: default true for the following: hold, pulse, latch */
	var condOptions = {
		"group": { sequence: true, duration: true, repeat: true },
		"service": { sequence: true, duration: true, repeat: true },
		"housemode": { sequence: true, duration: true, repeat: true },
		"weekday": { },
		"sun": { sequence: true },
		"trange": { },
		"interval": { latch: false },
		"ishome": { sequence: true, duration: true },
		"reload": { },
		"grpstate": { sequence: true, duration: true, repeat: true }
	};
	var weekDayName = [ '?', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
	var monthName = [ '?', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
	var opName = { "bet": "between", "nob": "not between", "after": "after", "before": "before" };
	var houseModeName = [ '?', 'Home', 'Away', 'Night', 'Vacation' ];
	var inttypes = {
		"ui1": { min: 0, max: 255 }, "i1": { min: -128, max: 127 },
		"ui2": { min: 0, max: 65535 }, "i2": { min: -32768, max: 32767 },
		"ui4": { min: 0, max: 4294967295 }, "i4": { min: -2147483648, max: 2147483647 },
		"int": { min: -2147483648, max: 2147483647 }
	};
	var serviceOps = [
		{ op: '=', desc: 'equals', args: 1, optional: 1 },
		{ op: '<>', desc: 'not equals', args: 1, optional: 1 },
		{ op: '<', desc: '<', args: 1, numeric: 1,  },
		{ op: '<=', desc: '<=', args: 1, numeric: 1,  },
		{ op: '>', desc: '>', args: 1, numeric: 1,  },
		{ op: '>=', desc: '>=', args: 1, numeric: 1,  },
		{ op: 'bet', desc: 'between', args: 2, numeric: 1, format: "%1 and %2" },
		{ op: 'nob', desc: 'not between', args: 2, numeric: 1, format: "%1 and %2" },
		{ op: 'starts', desc: 'starts with', args: 1,  },
		{ op: 'notstarts', desc: 'does not start with', args: 1,  },
		{ op: 'ends', desc: 'ends with', args: 1,  },
		{ op: 'notends', desc: 'does not end with', args: 1,  },
		{ op: 'contains', desc: 'contains', args: 1,  },
		{ op: 'notcontains', desc: 'does not contain', args: 1,  },
		{ op: 'in', desc: 'in', args: 1 },
		{ op: 'notin', desc: 'not in', args: 1 },
		{ op: 'istrue', desc: 'is TRUE', args: 0 },
		{ op: 'isfalse', desc: 'is FALSE', args: 0 },
		{ op: 'change', desc: 'changes', args: 2, format: "from %1 to %2", optional: 2 },
		{ op: 'update', desc: 'updates', args: 0 }
	];
	var noCaseOptPattern = /^(=|<>|contains|notcontains|starts|notstarts|ends|notends|in|notin|change)$/i;
	var serviceOpsIndex = {};

	var varRefPattern = /^\{([^}]+)\}\s*$/;

	var msgUnsavedChanges = "You have unsaved changes! Press OK to save them, or Cancel to discard them.";
	var msgGroupIdChange = "Click to change group name";
	var msgOptionsShow = "Show condition options";
	var msgOptionsHide = "Hide condition options";

	/* Insert the header items */
	/* Checkboxes, see https://codepen.io/VoodooSV/pen/XoZJme */
	function header() {
		var $head = jQuery( 'head' );
		/* Load material design icons */
		$head.append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');
		$head.append( '\
<style>\
	div.reactortab input.narrow { max-width: 6em; } \
	div.reactortab input.tiny { max-width: 4em; text-align: center; } \
	div.reactortab label { font-weight: normal; } \
	div.reactortab label.tbsecondaryinput { margin-left: 0.5em; margin-right: 0.5em; } \
	div.reactortab .checkbox { padding-left: 20px; } \
	div.reactortab .checkbox label { display: inline-block; vertical-align: middle; position: relative; padding-left: 8px; } \
	div.reactortab .checkbox label::before { content: ""; display: inline-block; position: absolute; width: 20px; height: 20px; left: 0; margin-left: -20px; border: 1px solid #ccc; border-radius: 3px; background-color: #fff; -webkit-transition: border 0.15s ease-in-out, color 0.15s ease-in-out; -o-transition: border 0.15s ease-in-out, color 0.15s ease-in-out; transition: border 0.15s ease-in-out, color 0.15s ease-in-out; } \
	div.reactortab .checkbox label::after { display: inline-block; position: absolute; width: 20px; height: 20px; left: 1px; top: -2px; margin-left: -20px; padding-left: 0; padding-top: 0; font-size: 18px; color: #333; } \
	div.reactortab .checkbox input[type="checkbox"],div.reactortab .checkbox input[type="radio"] { opacity: 0; z-index: 1; } \
	div.reactortab .checkbox input[type="checkbox"]:focus + label::before { outline: thin dotted; outline: 5px auto -webkit-focus-ring-color; outline-offset: -2px; } \
	div.reactortab .checkbox input[type="checkbox"]:checked + label::after { font-family: "Material Icons"; content: "\\e5ca"; } \
	div.reactortab .checkbox input[type="checkbox"]:disabled + label { opacity: 0.65; } \
	div.reactortab .checkbox input[type="checkbox"]:disabled + label::before { background-color: #eee; cursor: not-allowed; } \
	div.reactortab .checkbox.checkbox-inline { margin-top: 0; display: inline-block; } \
	div.reactortab .tb-about { margin-top: 24px; } \
	div.reactortab .tberror { border: 1px solid red; } \
	div.reactortab .tbwarn { border: 1px solid yellow; background-color: yellow; } \
	div.reactortab .tbwikilink { margin-left: 4px; } \
	div.reactortab .tbwikilink i.material-icons { font-size: 18px; position: relative; top: 4px; } \
	div.reactortab button.md-btn:disabled { color: #ccc; cursor: not-allowed; } \
	div.reactortab button.md-btn[disabled] { color: #ccc; cursor: not-allowed; } \
	div.reactortab button.md-btn { line-height: 1em; cursor: pointer; color: #333; background-color: #fff; padding: 1px 0px 0px 0px; border-radius: 4px; box-shadow: #ccc 2px 2px; } \
	div.reactortab button.md-btn i { font-size: 16pt; line-height: 1em; } \
	div.reactortab optgroup { color: #333; font-weight: bold; } \
	div.reactortab .dropdown-item { display: block; width: 100%; padding: 2px 12px; clear: both; font-weight: normal; color: #000; text-align: inherit; white-space: nowrap; background-color: transparent; border: 0; } \
	div.reactortab .dropdown-item:hover { color: #fff; background-color: #66aaff; text-decoration: none; } \
	div.reactortab .dropdown-divider { border-top: 1px solid #999; margin: 0.5em 0; } \
	div.reactortab .dropdown-header { display: block; width: 100%; padding: 2px 12px; clear: both; font-weight: bold; color: #000; text-align: inherit; background-color: transparent; border: 0; } \
	div.reactortab .dropdown-header:hover { text-decoration: none; } \
	div#tbcopyright { display: block; margin: 12px 0px; } \
	div#tbbegging { display: block; color: #ff6600; margin-top: 12px; } \
	div.reactortab .vanotice { font-size: 0.9em; line-height: 1.5em; color: #666; \
</style>');
	}

	/* Return footer */
	function footer() {
		var html = '';
		html += '<div class="clearfix">';
		html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
		html += '<div id="tbcopyright">Reactor ver ' + pluginVersion + ' &copy; 2018,2019 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>,' +
			' All Rights Reserved. Please check out the <a href="https://github.com/toggledbits/Reactor/wiki" target="_blank">online documentation</a>' +
			' and <a href="https://community.getvera.com/c/plugins-amp-plugin-development/reactor" target="_blank">community forums</a> for support.</div>';
		try {
			html += '<div id="browserident">' + navigator.userAgent + '</div>';
		} catch( e ) {}

		return html;
	}

	/* Create an ID that's functionally unique for our purposes. */
	function getUID( prefix ) {
		/* Not good, but good enough. */
		var newx = Date.now() - 1529298000000;
		if ( newx <= lastx ) newx = lastx + 1;
		lastx = newx;
		return ( prefix === undefined ? "" : prefix ) + newx.toString(36);
	}

	function isEmpty( s ) {
		return undefined === s || null === s || "" === s ||
			( "string" === typeof( s ) && null !== s.match( /^\s*$/ ) );
	}

	function quot( s ) {
		return JSON.stringify( s );
	}

	function hasAnyProperty( obj ) {
		// assert( "object" === typeof( obj );
		if ( "object" === typeof( obj ) ) {
			for ( var p in obj ) {
				if ( obj.hasOwnProperty( p ) ) return true;
			}
		}
		return false;
	}

	function idSelector( id ) {
		return String( id ).replace( /([^A-Z0-9_])/ig, "\\$1" );
	}

	/* Select current value in menu; if not present, select first item. */
	function menuSelectDefaultFirst( $mm, val ) {
		var $opt = jQuery( 'option[value=' + quot( val || "" ) + ']', $mm );
		if ( 0 === $opt.length ) {
			$opt = jQuery( 'option:first', $mm );
		}
		val = $opt.val(); /* actual value now */
		$mm.val( val );
		return val;
	}

	/** Select current value in menu; insert if not present. The menu txt is
	 * optional.
	 */
	function menuSelectDefaultInsert( $mm, val, txt ) {
		var $opt = jQuery( 'option[value=' + quot( val ) + ']', $mm );
		if ( 0 === $opt.length ) {
			$opt = jQuery( '<option/>' ).val( val ).text( txt || ( val + '? (missing)' ) );
			$mm.append( $opt );
		}
		val = $opt.val(); /* actual value now */
		$mm.val( val );
		return val;
	}

	/** getWiki - Get (as jQuery) a link to Wiki for topic */
	function getWiki( where ) {
		var $v = jQuery( '<a/>', {
			"class": "tbwikilink",
			"alt": "Link to Reactor Wiki for topic help",
			"title": "Link to Reactor Wiki for topic help",
			"target": "_blank",
			"href": "https://github.com/toggledbits/Reactor/wiki/" + String(where || "")
		} );
		$v.append( '<i class="material-icons">help_outline</i>' );
		return $v;
	}

	/* Return value or default if undefined */
	function coalesce( v, d ) {
		return ( undefined === v ) ? d : v;
	}

	/* Evaluate input string as integer, strict (no non-numeric chars allowed other than leading/trailing whitespace, empty string fails). */
	function getInteger( s ) {
		s = String(s).trim().replace( /^\+/, '' ); /* leading + is fine, ignore */
		if ( s.match( /^-?[0-9]+$/ ) ) {
			return parseInt( s );
		}
		return NaN;
	}

	/* Like getInteger(), but returns dflt if no value provided (blank/all whitespace) */
	function getOptionalInteger( s, dflt ) {
		if ( /^\s*$/.test( String(s) ) ) {
			return dflt;
		}
		return getInteger( s );
	}

	function getDeviceFriendlyName( dev, devobj ) {
		if ( -1 === dev ) return '(self)';
		devobj = devobj || api.getDeviceObject( dev );
		if ( ! devobj ) {
			console.log( "getDeviceFriendlyName() dev=(" + typeof(dev) + ")" + String(dev) + ", devobj=(" + typeof(devobj) + ")" + String(devobj) + ", returning false" );
			return false;
		}
		return String(devobj.name) + " (#" + String(devobj.id) + ")";
	}

	/* Get parent state */
	function getParentState( varName, myid ) {
		var me = api.getDeviceObject( myid || api.getCpanelDeviceId() );
		return api.getDeviceState( me.id_parent || me.id, "urn:toggledbits-com:serviceId:Reactor", varName );
	}

	/* Set parent state */
	function setParentState( varName, val, myid ) {
		var me = api.getDeviceObject( myid || api.getCpanelDeviceId() );
		return api.setDeviceStatePersistent( me.id_parent || me.id, "urn:toggledbits-com:serviceId:Reactor", varName, val );
	}

	/* Get data for this instance */
	function getInstanceData( myid ) {
		myid = myid || api.getCpanelDeviceId();
		iData[ myid ] = iData[ myid ] || {};
		return iData[ myid ];
	}

	/* Generate an inline checkbox. */
	function getCheckbox( id, value, label, classes ) {
		var $div = jQuery( '<div class="checkbox checkbox-inline"/>' );
		jQuery( '<input type="checkbox" />' ).attr( 'id', id ).val( value )
			.addClass( classes || "" )
			.appendTo( $div );
		jQuery( '<label/>' ).attr( 'for', id ).html( label )
			.appendTo( $div );
		return $div;
	}

	/* Load configuration data. */
	function loadConfigData( myid ) {
		var upgraded = false;
		var me = api.getDeviceObject( myid );
		if ( ! ( me && deviceType === me.device_type ) ) {
			throw "Device " + String(myid) + " not found or incorrect type";
		}
		var s = api.getDeviceState( myid, serviceId, "cdata" ) || "";
		var cdata;
		if ( ! isEmpty( s ) ) {
			try {
				cdata = JSON.parse( s );
				/* Luup's json library doesn't seem to support __jsontype metadata,
				   so fixup empty objects, which it renders as empty arrays. */
				if ( cdata.variables && Array.isArray( cdata.variables ) && cdata.variables.length == 0 ) {
					console.log("Fixing cdata.variables from array to object");
					cdata.variables = {};
				}
				if ( cdata.activities && Array.isArray( cdata.activities ) && cdata.activities.length == 0 ) {
					console.log("Fixing cdata.activities from array to object");
					cdata.activities = {};
				}
			} catch (e) {
				console.log("Unable to parse cdata: " + String(e));
				throw e;
			}
		}
		if ( cdata === undefined || typeof cdata !== "object" ||
				cdata.conditions === undefined || typeof cdata.conditions !== "object" ) {
			console.log("Initializing new config for " + String(myid));
			cdata = {
				version: _CDATAVERSION,
				variables: {},
				conditions: {
					root: {
						id: "root",
						name: api.getDeviceObject( myid ).name,
						type: "group",
						operator: "and",
						conditions: []
					}
				},
				activities: {}
			};
			upgraded = true;
		}

		/* Special version check */
		if ( ( cdata.version || 0 ) > _CDATAVERSION ) {
			console.log("The configuration for this ReactorSensor is an unsupported format/version (" +
				String( cdata.version ) + "). Upgrade Reactor or restore an older config from backup.");
			throw "Incompatible configuration format/version";
		}

		/* Check for upgrade tasks from prior versions */
		delete cdata.undefined;
		if ( undefined === cdata.variables ) {
			/* Fixup v2 */
			cdata.variables = {};
			upgraded = true;
		}
		if ( undefined === cdata.activities ) {
			/* Fixup pre 19051 to 19052 */
			cdata.activities = {};
			if ( undefined !== cdata.tripactions ) {
				cdata.activities['root.true'] = cdata.tripactions;
				cdata.activities['root.true'].id = 'root.true';
				delete cdata.tripactions;
			}
			if ( undefined !== cdata.untripactions ) {
				cdata.activities['root.false'] = cdata.untripactions;
				cdata.activities['root.false'].id = 'root.false';
				delete cdata.untripactions;
			}
			upgraded = true;
		}
		if ( cdata.activities.__trip ) {
			/* Fixup 19051 to 19052 -- development only, should not be seen in wild */
			cdata.activities['root.true'] = cdata.activities.__trip;
			cdata.activities['root.true'].id = 'root.true';
			delete cdata.activities.__trip;
			upgraded = true;
		}
		if ( cdata.activities.__untrip ) {
			/* Fixup 19051 to 19052 -- development only, should not be seen in wild */
			cdata.activities['root.false'] = cdata.activities.__untrip;
			cdata.activities['root.false'].id = 'root.false';
			delete cdata.activities.__untrip;
			upgraded = true;
		}
		if ( undefined === cdata.conditions.root ) {
			/* Fixup any pre to 19052 */
			var ix;
			var root = { id: "root", name: api.getDeviceObject( myid ).name, type: "group", operator: "and", conditions: [] };
			var ng = (cdata.conditions || []).length;
			if ( ng == 0 || ( ng == 1 && ( cdata.conditions[0].groupconditions || [] ).length == 0 ) ) {
				/* No conditions here. Leave empty root. */
			} else if ( ng == 1 ) {
				/* Single group. Just add all conditions to root group. */
				root.name = cdata.conditions[0].name || cdata.conditions[0].id || root.name;
				root.operator = 'and';
				root.conditions = cdata.conditions[0].groupconditions || [];
			} else {
				/* Multiple groups. */
				root.operator = "or"; /* OR between groups */
				for ( ix=0; ix<cdata.conditions.length; ix++ ) {
					var grp = cdata.conditions[ix];
					root.conditions[ix] = { id: grp.groupid || ix, name: grp.name || grp.groupid, operator: "and" }; /* AND within groups */
					root.conditions[ix].conditions = grp.groupconditions || [];
				}
			}
			cdata.conditions = { root: root };

			/* Handle cdata.variables indexing upgrade. */
			ix = 0;
			for ( var vn in ( cdata.variables || {} ) ) {
				if ( cdata.variables.hasOwnProperty( vn ) ) {
					cdata.variables[vn].index = ix++;
				}
			}

			upgraded = true;
		}

		/* Keep version on config as highest that has edited it. */
		if ( ( cdata.version || 0 ) < _CDATAVERSION ) {
			cdata.version = _CDATAVERSION;
		}
		cdata.device = myid;
		if ( upgraded ) {
			/* Write updated config. We don't care if it fails, as nothing we can't redo would be lost. */
			console.log('Re-writing upgraded config data');
			cdata.timestamp = Math.floor( Date.now() / 1000 );
			cdata.serial = ( cdata.serial || 0 ) + 1;
			console.log("loadConfigData(): saving upgraded config serial " + String(cdata.serial) + ", timestamp " + String(cdata.timestamp));
			api.setDeviceStateVariablePersistent( myid, serviceId, "cdata",
				JSON.stringify( cdata, function( k, v ) { return k.match( /^__/ ) ? undefined : v; } )
			);
		}

		/* Store config on instance data */
		var d = getInstanceData( myid );
		d.cdata = cdata;
		delete d.ixCond; /* Remove until needed/rebuilt */

		configModified = false;
		return cdata;
	}

	/* Get configuration; load if needed */
	function getConfiguration( myid, force ) {
		var d = getInstanceData( myid );
		if ( force || ! d.cdata ) {
			loadConfigData( myid );
			console.log("getConfiguration(): loaded config serial " + String(d.cdata.serial) + ", timestamp " + String(d.cdata.timestamp));
		} else {
			console.log("getConfiguration(): returning cached config serial " + String(d.cdata.serial));
		}
		return d.cdata;
	}

	/* Get condition index; build if needed (used by Status and Condition tabs) */
	function getConditionIndex( myid ) {
		var d = getInstanceData( myid );
		if ( undefined === d.ixCond ) {
			var cf = getConfiguration( myid );
			d.ixCond = {};
			var makeix = function( grp, level ) {
				d.ixCond[grp.id] = grp;
				grp.__depth = level; /* assigned to groups only */
				for ( var ix=0; ix<(grp.conditions || []).length; ix++ ) {
					grp.conditions[ix].__parent = grp;
					grp.conditions[ix].__index = ix;
					d.ixCond[grp.conditions[ix].id] = grp.conditions[ix];
					if ( "group" === ( grp.conditions[ix].type || "group" ) ) {
						makeix( grp.conditions[ix], level+1 );
					}
				}
			};
			makeix( cf.conditions.root || {}, 0 );
		}
		return d.ixCond;
	}

	/* Traverse - Depth Order */
	function DOtraverse( node, op, args, filter ) {
		if ( ( !filter ) || filter( node ) ) {
			op( node, args );
		}
		if ( "group" === ( node.type || "group" ) ) {
			for ( var ix=0; ix<(node.conditions||[]).length; ix++ ) {
				DOtraverse( node.conditions[ix], op, args, filter );
			}
		}
	}

	/* Return true if the grp (id) is an ancestor of condition (id) */
	function isAncestor( grp, cond, myid ) {
		myid = myid || api.getCpanelDeviceId();
		var c = getConditionIndex( myid )[cond];
		if ( c.__parent.id === grp ) return true;
		if ( "root" === c.__parent.id ) return false; /* Can't go more */
		/* Move up tree looking for matching group */
		return isAncestor( grp, c.__parent.id, myid );
	}

	/* Return true if node (id) is a descendent of grp (id) */
	function isDescendent( node, grp, myid ) {
		myid = myid || api.getCpanelDeviceId();
		var c = getConditionIndex( myid )[grp];
		/* Fast exit if our anchor condition isn't a group (only groups have descendents) */
		if ( "group" !== ( c.type || "group" ) ) return false;
		for ( var k=0; k<( c.conditions || [] ).length; k++ ) {
			if ( node === c.conditions[k].id ) return true;
			if ( "group" === ( c.conditions[k].type || "group" ) &&
				isDescendent( node, c.conditions[k].id, myid ) ) return true;
		}
		return false;
	}

	/* Initialize the module */
	function initModule( myid ) {
		myid = myid || api.getCpanelDeviceId();
		if ( !moduleReady ) {

			/* Initialize module data */
			console.log("Initializing module data for ReactorSensor_UI7");
			try {
				console.log("initModule() using jQuery " + String(jQuery.fn.jquery) + "; jQuery-UI " + String(jQuery.ui.version));
			} catch( e ) {
				console.log("initModule() error reading jQuery/UI versions: " + String(e));
			}

			iData = [];
			actions = {};
			deviceActionData = {};
			deviceInfo = {};
			userIx = {};
			userNameIx = {};
			configModified = false;
			inStatusPanel = false;
			isOpenLuup = false;
			isALTUI = "undefined" !== typeof(MultiBox);
			lastx = 0;

			/* Try to establish date format */
			var ud = api.getUserData();
			dateFormat = "%F"; /* ISO8601 default */
			timeFormat = "%T";
			var cfd = parseInt( getParentState( "ForceISODateTime", myid ) || "0" );
			if ( isNaN(cfd) || 0 === cfd ) {
				console.log("initModule() configured date format " + String(ud.date_format) + " time " + String(ud.timeFormat));
				cfd = ud.date_format;
				if ( undefined !== cfd ) {
					dateFormat = cfd.replace( /yy/, "%Y" ).replace( /mm/, "%m" ).replace( /dd/, "%d" ).replace( "\\", "" );
					timeFormat = ( "12hr" === ud.timeFormat ) ? "%I:%M:%S%p" : "%T";
				}
			}

			/* Make our own list of devices, sorted by room, and alpha within room. */
			var devices = api.cloneObject( api.getListOfDevices() );
			var noroom = { "id": 0, "name": "No Room", "devices": [] };
			var rooms = [ noroom ];
			var roomIx = {};
			roomIx[String(noroom.id)] = noroom;
			var dd = devices.sort( function( a, b ) {
				if ( a.id == myid ) return -1;
				if ( b.id == myid ) return 1;
				if ( a.name.toLowerCase() === b.name.toLowerCase() ) {
					return a.id < b.id ? -1 : 1;
				}
				return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
			});
			for (var i=0; i<dd.length; i+=1) {
				var devobj = api.cloneObject( dd[i] );
				/* Detect openLuup while we're at it */
				if ( "openLuup" === devobj.device_type ) {
					isOpenLuup = true;
				} else if ( "urn:richardgreen:device:VeraAlert:1" === devobj.device_type ) {
					devVeraAlerts = devobj.id;
				}

				var roomid = devobj.room || 0;
				var roomObj = roomIx[String(roomid)];
				if ( undefined === roomObj ) {
					roomObj = api.cloneObject( api.getRoomObject(roomid) );
					roomObj.devices = [];
					roomIx[String(roomid)] = roomObj;
					rooms[rooms.length] = roomObj;
				}
				roomObj.devices.push( devobj );
			}
			roomsByName = rooms.sort(
				/* Special sort for room name -- sorts "No Room" last */
				function (a, b) {
					if (a.id === 0) return 1;
					if (b.id === 0) return -1;
					if (a.name.toLowerCase() === b.name.toLowerCase()) return 0;
					return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
				}
			);

			for ( ix=0; ix<(ud.users || []).length; ++ix ) {
				userIx[ud.users[ix].id] = { name: ud.users[ix].Name || ud.users[ix].id };
				userNameIx[ud.users[ix].Name || ud.users[ix].id] = ud.users[ix].id;
			}
			try {
				jQuery.each( ud.usergeofences || [], function( ix, fobj ) {
					/* Logically, there should not be a usergeofences[] entry for a user that
					   doesn't exist in users[], but Vera says "hold my beer" apparently. */
					if ( undefined === userIx[ fobj.iduser ] ) userIx[ fobj.iduser ] = { name: String(fobj.iduser) + '?' };
					userIx[ fobj.iduser ].tags = {};
					jQuery.each( fobj.geotags || [], function( iy, gobj ) {
						userIx[ fobj.iduser ].tags[ gobj.id ] = {
							id: gobj.id,
							ishome: gobj.ishome,
							name: gobj.name
						};
					});
				});
			}
			catch (e) {
				console.log("Error applying usergeofences to userIx: " + String(e));
				console.log( e.stack );
			}

			serviceOpsIndex = {};
			for ( var ix=0; ix<serviceOps.length; ix++ ) {
				serviceOpsIndex[serviceOps[ix].op] = serviceOps[ix];
			}

			/* Don't do this again. */
			moduleReady = true;
		}

		/* Check agreement of plugin core and UI */
		var s = api.getDeviceState( myid, serviceId, "_UIV", { dynamic: false } ) || "0";
		console.log("initModule() for device " + myid + " requires UI version " + _UIVERSION + ", seeing " + s);
		if ( String(_UIVERSION) != s ) {
			api.setCpanelContent( '<div class="reactorwarning" style="border: 4px solid red; padding: 8px;">' +
				" ERROR! The Reactor plugin core version and UI version do not agree." +
				" This may cause errors or corrupt your ReactorSensor configuration." +
				" Please hard-reload your browser and try again " +
				' (<a href="https://duckduckgo.com/?q=hard+reload+browser" target="_blank">how?</a>).' +
				" If you have installed hotfix patches, you may not have successfully installed all required files." +
				" Expected " + String(_UIVERSION) + " got " + String(s) +
				".</div>" );
			return false;
		}

		if ( undefined === Promise ) {
			alert( "Warning! The browser you are using does not support features required by this interface. The recommended browsers are Firefox, Chrome, Safari, and Edge. If you are using a modern version of one of these browsers and getting this message, please report to rigpapa via the Vera Community forums." );
			return false;
		}

		/* Load ACE. Since the jury is still out with LuaView on this, default is no
		   ACE for now. As of 2019-01-06, one user has reported that ACE does not function
		   on Chrome Mac (unknown version, but does function with Safari and Firefox on Mac).
		   That's just one browser, but still... */
		s = getParentState( "UseACE" ) || "";
		if ( "1" === s && ! window.ace ) {
			s = getParentState( "ACEURL" ) || "https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.2/ace.js";
			jQuery( "head" ).append( '<script src="' + s + '"></script>' );
		}

		/* Initialize for instance */
		console.log("Initializing ReactorSensor_UI7 instance data for " + myid);
		iData[myid] = iData[myid] || {};
		getConfiguration( myid );

		/* Force this false every time, and make the status panel change it. */
		inStatusPanel = false;

		/* Event handler */
		api.registerEventHandler('on_ui_cpanel_before_close', ReactorSensor, 'onBeforeCpanelClose');

		return true;
	}

	/* zero-fill */
	function fill( s, n, p ) {
		if ( "string" !== typeof(s) ) {
			s = String(s);
		}
		while ( s.length < n ) {
			s = (p || "0") + s;
		}
		return s;
	}

	/* Format timestamp to string (models strftime) */
	function ftime( t, fmt ) {
		var dt = new Date();
		dt.setTime( t );
		var str = fmt || dateFormat;
		str = str.replace( /%(.)/g, function( m, p ) {
			switch( p ) {
				case 'Y':
					return String( dt.getFullYear() );
				case 'm':
					return fill( dt.getMonth()+1, 2 );
				case 'd':
					return fill( dt.getDate(), 2 );
				case 'H':
					return fill( dt.getHours(), 2 );
				case 'I':
					var i = dt.getHours() % 12;
					if ( 0 === i ) i = 12;
					return fill( i, 2 );
				case 'p':
					return dt.getHours() < 12 ? "AM" : "PM";
				case 'M':
					return fill( dt.getMinutes(), 2 );
				case 'S':
					return fill( dt.getSeconds(), 2 );
				case '%':
					return '%';
				case 'T':
					return ftime( t, "%H:%M:%S" );
				case 'F':
					return ftime( t, "%Y-%m-%d" );
				default:
					return m;
			}
		});
		return str;
	}

	function textDateTime( y, m, d, hh, mm, isEnd ) {
		hh = parseInt( hh || "0" );
		mm = parseInt( mm || "0" );
		var tstr = ( hh < 10 ? '0' : '' ) + hh + ':' + ( mm < 10 ? '0' : '' ) + mm;
		/* Possible forms are YMD, MD, D with time, or just time */
		if ( isEmpty( m ) ) {
			if ( isEmpty( d ) ) {
				return tstr;
			}
			return tstr + " on day " + d + " of each month";
		 }
		 m = parseInt( m );
		 return monthName[m] + ' ' + d + ( isEmpty( y ) ? '' : ' ' + y ) + ' ' + tstr;
	}

	/**
	 * Convert Lua timestamp (secs since Epoch) to text; if within 24 hours,
	 * show time only.
	 */
	function shortLuaTime( dt ) {
		if ( ( dt || 0 ) === 0 ) {
			return "";
		}
		var dtms = dt * 1000;
		var ago = Date.now() - dtms;
		if ( ago < 86400000 ) {
			return ftime( dtms, timeFormat );
		}
		return ftime( dtms, dateFormat + " " + timeFormat );
	}

	/**
	 * Delete a state variable (with callback). Note that failing to delete a
	 * variable isn't fatal, as we get ample opportunities to try again later.
	 */
	function deleteStateVariable( devnum, serviceId, variable, fnext ) {
		console.log("deleteStateVariable: deleting " + devnum + "." + serviceId + "/" + variable);
		jQuery.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "variableset",
				DeviceNum: devnum,
				serviceId: serviceId,
				Variable: variable,
				Value: "",
				output_format: "json"
			},
			dataType: "json",
			timeout: 5000
		}).fail( function( jqXHR, textStatus, errorThrown ) {
			console.log( "deleteStateVariable: failed, maybe try again later" );
		}).always( function() {
			console.log("deleteStateVariable: finished, calling next");
			if ( fnext ) { fnext(); }
		});
	}

	/**
	 * Attempt to remove state variables that are no longer used.
	 */
	function clearUnusedStateVariables( myid, cdata ) {
		var ud = api.getUserData();
		var dx = api.getDeviceIndex( myid );
		var deletes = [];
		var myinfo = ud.devices[dx];
		if ( undefined == myinfo ) return;
		/* N.B. ixCond will be present in the condition editor only */
		var ixCond = getConditionIndex( myid );
		for ( var ix=0; ix<myinfo.states.length; ix++ ) {
			var st = myinfo.states[ix];
			var vname;
			if ( st.service === "urn:toggledbits-com:serviceId:ReactorValues" ) {
				vname = st.variable.replace( /_Error$/, "" );
				/* If variable doesn't exist or isn't marked for export, clear state vars */
				if ( ! ( cdata.variables || {} )[vname] || 0 === cdata.variables[vname].export ) {
					deletes.push( { service: st.service, variable: vname } );
					deletes.push( { service: st.service, variable: vname + "_Error" } );
				}
			} else if ( ixCond && st.service === "urn:toggledbits-com:serviceId:ReactorGroup" ) {
				vname = st.variable.replace( /^GroupStatus_/, "" );
				if ( ! ixCond[ vname ] ) {
					deletes.push( { service: st.service, variable: st.variable } );
				}
			}
		}
		function dodel() {
			var v = deletes.shift();
			if ( v ) {
				deleteStateVariable( myid, v.service, v.variable, dodel );
			}
		}
		dodel();
	}

	/**
	 * Handle save click: save the current configuration.
	 */
	function handleSaveClick( ev, fnext, fargs ) {
		var myid = api.getCpanelDeviceId();
		var cdata = getConfiguration( myid );

		/* Save to persistent state */
		cdata.timestamp = Math.floor( Date.now() / 1000 );
		cdata.serial = ( cdata.serial || 0 ) + 1;
		cdata.device = myid;
		console.log("handleSaveClick(): saving config serial " + String(cdata.serial) + ", timestamp " + String(cdata.timestamp));
		api.setDeviceStateVariablePersistent( myid, serviceId, "cdata",
			JSON.stringify( cdata, function( k, v ) { return k.match( /^__/ ) ? undefined : v; } ),
			{
				'onSuccess' : function() {
					configModified = false;
					updateSaveControls();
					if ( "function" === typeof(fnext) ) fnext.apply( null, fargs );
					clearUnusedStateVariables( myid, cdata );
					console.log("handleSaveClick(): successful save of config serial " + String(cdata.serial) + ", timestamp " + String(cdata.timestamp));
				},
				'onFailure' : function() {
					alert('There was a problem saving the configuration. Vera/Luup may have been restarting. Please try hitting the "Save" button again.');
					updateSaveControls();
					if ( "function" === typeof(fnext) ) fnext.apply( null, fargs );
				}
			}
		);
	}

	/**
	 * Handle revert button click: restore setting to last saved and redisplay.
	 */
	function handleRevertClick( ev ) {
		if ( ! confirm( "Discard changes and revert to last saved configuration?" ) ) {
			return;
		}

		var myid = api.getCpanelDeviceId();
		getConfiguration( myid, true );
		configModified = false;

		/* Be careful about which tab we're on here. */
		/* ??? when all tabs are modules, module.redraw() is a one-step solution */
		var ctx = jQuery( ev.currentTarget ).closest('div.reactortab').attr('id');
		if ( ctx === "tab-vars" ) {
			redrawVariables();
		} else if ( ctx === "tab-conds" ) {
			CondBuilder.redraw( myid );
		} else if ( ctx === "tab-actions" ) {
			redrawActivities();
		} else {
			alert("OK, I did the revert, but now I'm lost. Go to the Status tab, and then come back to this tab.");
		}
	}

	/* Closing the control panel. */
	function onBeforeCpanelClose(args) {
		// console.log( 'onBeforeCpanelClose args: ' + JSON.stringify(args) );
		if ( configModified && confirm( msgUnsavedChanges ) ) {
			handleSaveClick( undefined );
		}
		configModified = false;
	}

	function conditionValueText( v, forceNumber ) {
		if ( "number" === typeof(v) ) return v;
		v = String(v);
		if ( v.match( varRefPattern ) ) return v;
		if ( forceNumber ) {
			var n = parseInt( v );
			if ( isNaN( n ) ) return JSON.stringify(v) + "(NaN)";
			return String(n);
		}
		return JSON.stringify( v );
	}

	function makeConditionDescription( cond ) {
		if ( cond === undefined ) {
			return "(undefined)";
		}

		var str = "", t, k;
		switch ( cond.type || "group" ) {
			case 'group':
				str = "Group: " + String(cond.name || cond.id);
				break;

			case 'service':
				t = getDeviceFriendlyName( cond.device );
				str += t ? t : '#' + cond.device + ' ' + ( cond.devicename === undefined ? "name unknown" : cond.devicename ) + ' (missing)';
				str += ' ' + ( cond.variable || "?" );
				t = serviceOpsIndex[cond.operator || ""];
				if ( undefined === t ) {
					str += ' ' + cond.operator + '? ' + conditionValueText( cond.value );
				} else {
					str += ' ' + (t.desc || t.op);
					if ( undefined === t.args || t.args > 0 ) {
						if ( t.args > 1 ) {
							var fmt = t.format || "%1,%2";
							k = ( cond.value || "" ).split( /,/ );
							fmt = fmt.replace( '%1', k.length > 0 ? conditionValueText( k[0], t.numeric ) : "" );
							fmt = fmt.replace( '%2', k.length > 1 ? conditionValueText( k[1], t.numeric ) : "" );
							str += ' ' + fmt;
						} else {
							str += ' ' + conditionValueText( cond.value, t.numeric );
						}
					}
				}
				if ( ( cond.operator || "=" ).match( noCaseOptPattern ) &&
						coalesce( cond.nocase, 1 ) == 0 ) {
					str += ' (match case)';
				}
				break;

			case 'grpstate':
				t = getDeviceFriendlyName( cond.device );
				str += t ? t : '#' + cond.device + ' ' + ( cond.devicename === undefined ? "name unknown" : cond.devicename ) + ' (missing)';
				try {
					var devnum = -1 === ( cond.device || -1 ) ? api.getCpanelDeviceId() : cond.device;
					t = ( getConditionIndex( devnum ) || {} )[ cond.groupid ];
					str += ' ' + ( t ? ( t.name || cond.groupid || "?" ) : ( ( cond.groupid || "?" ) + " (MISSING!)" ) );
				} catch( e ) {
					str += ' ' + ( cond.groupid || "?" ) + ' (' + String(e) + ')';
				}
				t = serviceOpsIndex[cond.operator || ""];
				if ( t ) {
					str += ' ' + ( t.desc || t.op );
				} else {
					str += ' ' + String(cond.operator) + '?';
				}
				break;

			case 'comment':
				str = cond.comment;
				break;

			case 'housemode':
				t = ( cond.value || "" ).split( /,/ );
				if ( cond.operator == "change" ) {
					str += "changes from ";
					if ( t.length > 0 && t[0] !== "" ) {
						str += houseModeName[t[0]] || t[0];
					} else {
						str += "any mode";
					}
					str += " to ";
					if ( t.length > 1 && t[1] !== "" ) {
						str += houseModeName[t[1]] || t[1];
					} else {
						str += "any mode";
					}
				} else {
					str += "is ";
					if ( t.length == 0 || t[0] === "" ) {
						str += "invalid";
					} else {
						for ( k=0; k<t.length; ++k ) {
							t[k] = houseModeName[t[k]] || t[k];
						}
						str += t.join(' or ');
					}
				}
				break;

			case 'weekday':
				var wmap = { "1": "first", "2": "second", "3": "third", "4": "fourth", "5": "fifth", "last": "last" };
				if ( isEmpty( cond.operator ) ) {
					str = "every";
				} else if ( wmap[cond.operator] ) {
					str = 'on the ' + wmap[cond.operator];
				} else {
					str = cond.operator;
				}
				if ( isEmpty( cond.value ) ) {
					str += " day";
				} else {
					t = ( cond.value || "" ).split(/,/);
					for ( k=0; k<t.length; ++k ) {
						t[k] = weekDayName[ t[k] ];
					}
					str += ' ' + t.join(', ');
				}
				break;

			case 'sun':
				if ( opName[ cond.operator ] !== undefined ) {
					str += opName[ cond.operator ];
				} else {
					str += cond.operator + '?';
				}
				function sunrange( spec ) {
					var names = { 'sunrise': 'sunrise', 'sunset': 'sunset',
							'civdawn': 'civil dawn', 'civdusk': 'civil dusk',
							'nautdawn': 'nautical dawn', 'nautdusk': 'nautical dusk',
							'astrodawn': 'astronomical dawn', 'astrodusk': 'astronomical dusk'
						};
					k = spec.match( /^([^+-]+)(.*)/ );
					if ( k === null || k.length !== 3 ) {
						return spec + '?';
					} else {
						var offs = parseInt( k[2] );
						var str = ' ';
						if ( offs < 0 ) {
							str = str + String(-offs) + " mins before ";
						} else if ( offs > 0 ) {
							str = str + String(offs) + " mins after ";
						}
						str = str + ( names[k[1]] || k[1] );
						return str;
					}
				}
				t = ( cond.value || "sunrise+0,sunset+0" ).split(/,/);
				str += sunrange( t[0] || "sunrise+0" );
				if ( cond.operator == "bet" || cond.operator == "nob" ) {
					str += " and ";
					str += sunrange( t[1] || "sunset+0" );
				}
				break;

			case 'trange':
				if ( opName[ cond.operator ] !== undefined ) {
					str += opName[ cond.operator ];
				} else {
					str += cond.operator + '?';
				}
				t = ( cond.value || "" ).split(/,/);
				str += ' ' + textDateTime( t[0], t[1], t[2], t[3], t[4], false );
				if ( cond.operator !== "before" && cond.operator !== "after" ) {
					str += ' and ' + textDateTime( t[5], t[6], t[7], t[8], t[9], true );
				}
				break;

			case 'interval':
				str += "every";
				if ( cond.days > 0 ) {
					str += " " + String(cond.days) + " days";
				}
				if ( cond.hours > 0 ) {
					str += " " + String(cond.hours) + " hours";
				}
				if ( cond.mins > 0 ) {
					str += " " + String(cond.mins) + " minutes";
				}
				if ( "condtrue" === ( cond.relto || "" ) ) {
					str += " (relative to ";
					str += makeConditionDescription( getConditionIndex()[ cond.relcond ] );
					str += ")";
				} else {
					if ( ! isEmpty( cond.basetime ) ) {
						t = cond.basetime.split(/,/);
						str += " (relative to ";
						if ( t.length == 2 ) {
							str += t[0] + ":" + t[1];
						} else {
							str += String( cond.basetime );
						}
						str += ")";
					}
				}
				break;

			case 'ishome':
				t = ( cond.value || "" ).split(/,/);
				if ( "at" === cond.operator || "notat" === cond.operator ) {
					var desc = cond.operator == "at" ? " at " : " not at ";
					var uu = userIx[t[0]];
					if ( undefined === uu ) {
						str += String(t[0]) + desc + " location " + String(t[1]);
					} else {
						var nn = uu.name || t[0];
						if ( uu.tags && uu.tags[t[1]] ) {
							str += nn + desc + uu.tags[t[1]].name;
						} else {
							str += nn + desc + " location " + t[1];
						}
					}
				} else {
					if ( t.length < 1 || t[0] == "" ) {
						str += cond.operator === "is not" ? "no user is home" : "any user is home";
					} else {
						/* Replace IDs with names for display */
						for ( k=0; k<t.length; ++k ) {
							t[k] = userIx[t[k]] ? userIx[t[k]].name : ( t[k] + '?' );
						}
						if ( t.length == 1 ) {
							str += t[0];
						} else {
							str += " any of " + t.join(', ');
						}
						str += " " + ( cond.operator || "is" ) + " home";
					}
				}
				break;

			case 'reload':
				str = "Luup reload";
				break; /* no additional information */

			default:
				str = JSON.stringify( cond );
		}

		return str;
	}

	/**
	 * Create a device menu from available devices, sorted alpha with room
	 * names sorted alpha.
	 */
	function makeDeviceMenu( val, name, filter ) {
		val = val || "";
		var el = jQuery('<select class="devicemenu form-control form-control-sm"></select>');
		roomsByName.forEach( function( roomObj ) {
			var haveItem = false;
			var xg = jQuery( '<optgroup />' ).attr( 'label', roomObj.name );
			for ( var j=0; j<roomObj.devices.length; j++ ) {
				var devobj = roomObj.devices[j];
				if ( filter && !filter( devobj ) ) {
					continue;
				}
				haveItem = true;
				var fn = getDeviceFriendlyName( devobj.id, devobj );
				xg.append( jQuery( '<option/>' ).val( devobj.id ).text( fn ? fn : '#' + String(devobj.id) + '?' ) );
			}
			if ( haveItem ) {
				el.append( xg );
			}
		});

		el.prepend( jQuery( '<option/>' ).val( "-1" ).text( "(this ReactorSensor)" ) );
		el.prepend( jQuery( '<option/>' ).val( "" ).text( "--choose device--" ) );

		if ( val !== "" ) {
			var opt = jQuery( 'option[value="' + val + '"]', el );
			if ( 0 === opt.length ) {
				el.append( jQuery( '<option/>' ).val( val ).text( "(missing) #" + val + " " + name ) );
			}
			el.val( val );
		} else {
			jQuery( 'option:first', el ).prop('selected', true);
		}
		return el;
	}

	/**
	 * Update save/revert buttons (separate, because we use in two diff tabs
	 */
	function updateSaveControls() {
		var errors = jQuery('.tberror');
		var pos = $( window ).scrollTop();
		jQuery('button#saveconf').prop('disabled', ! ( configModified && errors.length === 0 ) );
		jQuery('button#revertconf').prop('disabled', !configModified);
		setTimeout( function() { $(window).scrollTop( pos ); }, 100 );
	}

/** ***************************************************************************
 *
 * S T A T U S
 *
 ** **************************************************************************/

	function updateTime( condid, target, prefix, countdown, limit ) {
		var $el = jQuery( 'span#' + idSelector(condid) + ".timer" );
		if ( 0 === $el.length ) { console.log(condid+" not found, bye!"); return; }
		var now = Math.floor( Date.now() / 1000 + 0.5 );
		var d;
		if ( countdown ) {
			/* Count down -- delta is (future) target to now */
			d = target - now;
			if ( d < ( limit || 0 ) ) {
				$el.remove();
				return;
			}
		} else {
			/* Count up -- delta is now since target */
			d = now - target;
			if ( limit && d > limit ) {
				$el.remove();
				return;
			}
		}
		var hh = Math.floor( d / 3600 );
		d -= hh * 3600;
		var mm = Math.floor( d / 60 );
		d -= mm * 60;
		d = (mm < 10 ? '0' : '') + String(mm) + ':' + (d < 10 ? '0' : '') + String(d);
		if ( 0 !== hh ) d = (hh < 10 ? '0' : '') + String(hh) + ':' + d;
		$el.text( prefix + ' ' + d );
		setTimeout( function() { updateTime( condid, target, prefix, countdown, limit ); }, 500 );
	}

	function getCondOptionDesc( cond ) {
		var condOpts = cond.options || {};
		var condDesc = "";
		if ( undefined !== condOpts.after ) {
			condDesc += ( ( condOpts.aftertime || 0 ) > 0 ? ' within ' + condOpts.aftertime + ' secs' : '' ) +
				' after ' + makeConditionDescription( getConditionIndex()[ condOpts.after] );
		}
		if ( ( condOpts.repeatcount || 0 ) > 1 ) {
			condDesc += " repeats " + condOpts.repeatcount +
				" times within " + ( condOpts.repeatwithin || 60 ) + " secs";
		} else if ( ( condOpts.duration || 0 ) > 0 ) {
			condDesc += " for " +
				( condOpts.duration_op === "lt" ? "less than " : "at least " ) +
				condOpts.duration + " secs";
		}
		if ( ( condOpts.holdtime || 0 ) > 0 ) {
			condDesc += "; delay reset for " + condOpts.holdtime + " secs";
		}
		if ( ( condOpts.pulsetime || 0 ) != 0 ) {
			condDesc += "; pulse for " + condOpts.pulsetime + " secs";
		}
		if ( ( condOpts.latch || 0 ) != 0 ) {
			condDesc += "; latching";
		}
		return condDesc;
	}

	function getCondState( cond, currentValue, cstate, el ) {
		el.text( "" );
		if ( cond.type !== "comment" && undefined !== currentValue ) {
			var cs = cstate[cond.id] || {};
			var shortVal = String( currentValue );
			el.attr( 'title', shortVal ); /* before we cut it */
			if ( shortVal.length > 20 ) {
				shortVal = shortVal.substring( 0, 17 ) + '...';
			}
			el.text( shortVal +
				( currentValue === cs.laststate ? "" : ( cs.laststate ? " (true)" : " (false)" ) ) +
				' as of ' + shortLuaTime( cs.statestamp ) );
			if ( condOptions[ cond.type || "group" ].repeat && ( ( cond.options||{} ).repeatcount || 0 ) > 1 ) {
				if ( cs.repeats !== undefined && cs.repeats.length > 1 ) {
					var dtime = cs.repeats[ cs.repeats.length - 1 ] - cs.repeats[0];
					el.append( " (last " + cs.repeats.length + " span " + dtime + " secs)" );
				}
			}
			/* Generate unique IDs for timers so that redraws will have
			   different IDs, and the old timers will self-terminate. */
			var id;
			if ( cs.laststate && cs.waituntil ) {
				id = getUID();
				el.append( jQuery('<span class="timer"/>').attr( 'id', id ) );
				(function( c, t, l ) {
					setTimeout( function() { updateTime( c, t, "; sustained", false, l ); }, 20 );
				})( id, cs.statestamp, ( cond.options || {} ).duration );
			} else if (cs.evalstate && cs.holduntil) {
				id = getUID();
				el.append( jQuery('<span class="timer"/>').attr( 'id', id ) );
				(function( c, t, l ) {
					setTimeout( function() { updateTime( c, t, "; reset delayed", true, l ); }, 20 );
				})( id, cs.holduntil, 0 );
			} else if ( cs.pulseuntil) {
				id = getUID();
				el.append( jQuery('<span class="timer"/>').attr( 'id', id ) );
				(function( c, t, l ) {
					setTimeout( function() { updateTime( c, t, "; pulse ", true, l ); }, 20 );
				})( id, cs.pulseuntil, 0 );
			}
			if ( cs.latched ) {
				el.append( '<span>&nbsp;(latched)' );
			}
		}
	}

	function showGroupStatus( grp, container, cstate, parentGroup ) {
		var grpel = jQuery( '\
<div class="reactorgroup"> \
  <div class="grouptitle"><button class="btn condbtn"/><span id="titletext">??</span> <span class="currentvalue"/></div> \
  <div class="grpbody"> \
	<div class="grpcond"/> \
  </div> \
</div>' );

		var title = 'Group: ' + (grp.name || grp.id ) +
			( grp.disabled ? " (disabled)" : "" ) + " <" + grp.id + ">";
		jQuery( 'span#titletext', grpel ).text( title + getCondOptionDesc( grp ) );
		jQuery( '.condbtn', grpel ).text( (grp.invert ? "NOT " : "") + (grp.operator || "and" ).toUpperCase() );

		/* Highlight groups that are "true" */
		if ( grp.disabled ) {
			grpel.addClass( 'groupdisabled' );
		} else {
			var gs = cstate[ grp.id ] || {};
			getCondState( grp, gs.laststate, cstate, jQuery( 'span.currentvalue', grpel ) );
			if ( gs.evalstate ) {
				grpel.addClass( "truestate" );
			}
		}
		container.append( grpel );

		grpel = jQuery( 'div.grpcond', grpel );
		for ( var i=0; i<(grp.conditions || []).length; i++ ) {
			var cond = grp.conditions[i];

			if ( "group" === ( cond.type || "group" ) ) {
				showGroupStatus( cond, grpel, cstate, grp );
			} else {
				var row = jQuery('<div class="cond" />').attr( 'id', cond.id );
				var currentValue = ( cstate[cond.id] || {} ).lastvalue;

				var condType = condTypeName[ cond.type ] !== undefined ? condTypeName[ cond.type ] : cond.type;
				var condDesc = makeConditionDescription( cond );
				var condOpts = cond.options || {};
				switch ( cond.type ) {
					case 'service':
					case 'grpstate':
						break;

					case 'weekday':
						if ( currentValue !== undefined && weekDayName[ currentValue ] !== undefined ) {
							currentValue = weekDayName[ currentValue ];
						}
						break;

					case 'housemode':
						if ( currentValue !== undefined && houseModeName[ currentValue ] !== undefined ) {
							currentValue = houseModeName[ currentValue ];
						}
						break;

					case 'sun':
					case 'trange':
						if ( currentValue !== undefined ) {
							currentValue = shortLuaTime( currentValue );
						}
						break;

					case 'interval':
						currentValue = shortLuaTime( currentValue );
						break;

					case 'ishome':
						var t = (currentValue || "").split( /,/ );
						if ( "at" === cond.operator || "notat" === cond.operator ) {
							/* Nada */
						} else {
							/* Replace IDs with names for display */
							if ( t.length > 0 && t[0] !== "" ) {
								for ( var k=0; k<t.length; ++k ) {
									t[k] = userIx[t[k]] ? userIx[t[k]].name : ( t[k] + '?' );
								}
								currentValue = t.join(', ');
							} else {
								currentValue = "";
							}
						}
						break;

					default:
						/* Nada */
				}

				/* Apply options to condition description */
				condDesc += getCondOptionDesc( cond );

				row.append( jQuery( '<div class="condind" />' ).html( '<i class="material-icons">remove</i>' ) );
				row.append( jQuery( '<div class="condtext" />' ).text( condType + ': ' + condDesc ) );

				/* Append current value and condition state */
				var el = jQuery( '<div class="currentvalue" />' );
				row.append( el );
				getCondState( cond, currentValue, cstate, el );

				/* Apply highlight for state */
				if ( cond.type !== "comment" && undefined !== currentValue ) {
					var cs = cstate[cond.id] || {};
					if ( cs.evalstate ) {
						row.addClass( "truestate" ).removeClass( "falsestate" );
						jQuery( 'div.condind i', row ).text( 'check' );
					} else {
						row.removeClass("truestate").addClass( "falsestate" );
						jQuery( 'div.condind i', row ).text( 'clear' );
					}
				}

				grpel.append( row );
			}
		}
	}

	/**
	 * Update status display.
	 */
	function updateStatus( pdev ) {
		var el;
		var stel = jQuery('div#reactorstatus');
		if ( stel.length === 0 || !inStatusPanel ) {
			/* If not displayed, do nothing. */
			return;
		}

		/* Get configuration data and current state */
		var cdata = getConfiguration( pdev, true );
		if ( undefined === cdata ) {
			stel.empty().text("An error occurred while attempting to fetch the configuration data. Luup may be reloading. Try again in a few moments.");
			console.log("cdata unavailable");
			return;
		}
		var s = api.getDeviceStateVariable( pdev, serviceId, "cstate" ) || "";
		var cstate = {};
		if ( ! isEmpty( s ) ) {
			try {
				cstate = JSON.parse( s );
			} catch (e) {
				console.log("cstate cannot be parsed: " + String(e));
			}
		} else {
			console.log("cstate unavailable");
		}

		/* If starting from scratch (first call), purge unused state */
		if ( 0 === stel.children( 'div' ).length ) {
			clearUnusedStateVariables( pdev, cdata );
		}

		stel.empty();

		var vix = [];
		for ( var vn in ( cdata.variables || {} ) ) {
			if ( cdata.variables.hasOwnProperty( vn ) ) {
				var v = cdata.variables[vn];
				vix.push( v );
			}
		}
		if ( vix.length > 0 ) {
			vix.sort( function( a, b ) {
				var i1 = a.index || -1;
				var i2 = b.index || -1;
				if ( i1 === i2 ) {
					i1 = (a.name || "").toLowerCase();
					i2 = (b.name || "").toLowerCase();
					if ( i1 === i2 ) return 0;
					/* fall through */
				}
				return ( i1 < i2 ) ? -1 : 1;
			});
			var grpel = jQuery( '<div class="reactorgroup" id="variables"/>' );
			grpel.append( '<div class="grouptitle"><span id="titletext">Expressions</span></div>' );
			var body = jQuery( '<div class="groupbody" />' );
			grpel.append( body );
			for ( var ix=0; ix<vix.length; ix++ ) {
				var vd = vix[ix];
				var vs = ( cstate.vars || {} )[vd.name] || {};
				el = jQuery( '<div class="row var" />' ).attr( 'id', vd.name );
				var vv = ((cstate.vars || {})[vd.name] || {}).lastvalue;
				if ( null === vv ) {
					vv = "(null)";
				} else {
					try {
						vv = JSON.stringify(vv);
					} catch( e ) {
						vv = String( vv );
					}
				}
				var ve = vs.err || "";
				if ( vv && vv.length > 256 ) {
					vv = vv.substring( 0, 253 ) + "...";
				}
				el.append( jQuery('<div class="col-sm-6 col-md-2" />').text( vd.name ) );
				el.append( jQuery('<div class="col-sm-12 col-md-7 tb-sm" />').text( isEmpty( vd.expression || "" ) ? "(no expression)" : vd.expression ) );
				el.append( jQuery('<div class="col-sm-6 col-md-3 tb-hardwrap" />').text( "" !== ve ? ve : vv ) );
				if ( "" !== ve ) {
					el.addClass( 'tb-exprerr' );
				} else if ( vs.changed ) {
					el.addClass( 'tb-valchanged' );
				}
				body.append( el );
			}
			stel.append( grpel );
		}

		showGroupStatus( cdata.conditions.root, stel, cstate );
	}

	function onUIDeviceStatusChanged( args ) {
		if ( !inStatusPanel ) {
			return;
		}
		var pdev = api.getCpanelDeviceId();
		var doUpdate = false;
		if ( args.id == pdev ) {
			for ( var k=0; k<(args.states || []).length; ++k ) {
				if ( args.states[k].variable.match( /^(cdata|cstate|Tripped|Armed)$/ ) ||
						args.states[k].service == "urn:toggledbits-com:serviceId:ReactorValues" ) {
					doUpdate = true;
					break;
					// console.log( args.states[k].service + '/' + args.states[k].variable + " updated!");
				}
			}
			if ( doUpdate ) {
				try {
					updateStatus( pdev );
				} catch (e) {
					console.log( e );
					console.log( e.stack );
				}
			}
		}
	}

	function doStatusPanel()
	{
		console.log("doStatusPanel()");
		/* Make sure changes are saved. */
		if ( configModified && confirm( msgUnsavedChanges ) ) {
			handleSaveClick( undefined );
		}

		if ( ! initModule() ) {
			return;
		}

		/* Standard header stuff */
		header();

		/* Our styles. */
		var html = "<style>";
		html += 'div#reactorstatus div.reactorgroup { position: relative; border-radius: 4px; border: none; margin: 8px 0; }';
		html += 'div#reactorstatus div#variables.reactorgroup { border: 1px solid #039 }';
		html += 'div#reactorstatus div.reactorgroup.groupdisabled * { background-color: #ccc !important; color: #000 !important }';
		html += 'div#reactorstatus div.grouptitle { color: #fff; background-color: #039; min-height: 32px; line-height: 2em; border: 1px solid #000; border-radius: inherit; }';
		html += 'div#reactorstatus div.grouptitle span#titletext { margin-left: 1em; }';
		html += 'div#reactorstatus div.grouptitle button.condbtn { background-color: #bce8f1; color: #000; width: 5em; border: none; padding: 6px 6px; }';
		html += 'div#reactorstatus div.grpbody { position: relative; padding: 0; background-color: #fff; }';
		html += 'div#reactorstatus div.grpcond { list-style: none; padding: 0 0 0 44px; margin: 0; }';
		html += 'div#reactorstatus .cond { position: relative; min-height: 2em; margin: 8px 0; padding: 0; border-radius: 4px; border: 1px solid #0c6099; background: #fff; }';
		html += 'div#reactorstatus .cond.truestate { color: #00aa00; font-weight: bold; }';
		html += 'div#reactorstatus div.reactorgroup.truestate > div.grouptitle > button.condbtn { background-color: #0b0; color: #fff; }';
		html += 'div#reactorstatus div.condind { display: inline-block; margin: 0 8px 0 0; padding: 0 4px; }';
		html += 'div#reactorstatus div.condtext { display: inline-block; width: 50%; margin: 0; padding-top: 4px; vertical-align: top; }';
		html += 'div#reactorstatus div.currentvalue { display: inline-block; margin-left: 1em; padding-top: 4px; vertical-align: top; }';
		html += 'div#reactorstatus div.cond.falsestate div.condind { color: #ff0000; }';
		html += 'div#reactorstatus div.cond.truestate div.condind { color: #00aa00; }';
		html += 'div#reactorstatus div#variables .tb-valchanged { color: #006040; font-weight: bold; }';
		html += 'div#reactorstatus div#variables .tb-exprerr { color: red; }';
		html += 'div#reactorstatus div#variables .tb-hardwrap { overflow-wrap: break-word; }';
		html += 'div#reactorstatus span.timer { }';

		html += '.grpcond > *::before, .grpcond > *::after { content: "";  position: absolute; left: -12px; width: 12px; border-style: solid; border-width: 0px 0px 3px 3px; }';
		html += '.grpcond > *:first-child::before { top: -8px; height: 24px; border-color: #333; display: block; }';
		html += '.grpcond > *::before { display: none; }';
		html += '.grpcond > *::after { top: 16px; height: calc(100% + 12px); border-color: #333; }';
		html += '.grpcond > *:last-child::after { display: none; }';

		html += 'div#reactorstatus .var { min-height: 2em; color: #003399; padding: 2px 4px; }';
		html += 'div#reactorstatus .tb-sm { font-family: Courier,Courier New,monospace; font-size: 0.9em; }';
		html += "</style>";
		jQuery("head").append( html );

		api.setCpanelContent( '<div id="reactorstatus" class="reactortab"></div>' );
		inStatusPanel = true; /* Tell the event handler it's OK */

		try {
			updateStatus( api.getCpanelDeviceId() );
		} catch( e ) {
			console.log( e );
			console.log( e.stack );
		}

		api.registerEventHandler('on_ui_deviceStatusChanged', ReactorSensor, 'onUIDeviceStatusChanged');
	}

/** ***************************************************************************
 *
 * C O N D I T I O N S
 *
 ** **************************************************************************/
	/**
	 * The condition builder is encapsulated into its own module for "private"
	 * implementation. It shares some global functions with other tab code,
	 * but I'll clean this up as I go along and make everything more modular.
	 */
	var CondBuilder = (function( api, $ ) {

		/**
		 * Renumber group conditions.
		 */
		function reindexConditions( grp ) {
			var $el = jQuery( 'div#' + idSelector( grp.id ) + '.cond-container.cond-group' ).children( 'div.cond-group-body' ).children( 'div.cond-list' );
			var ixCond = getConditionIndex();
			var ix = 0;
			grp.conditions.splice( 0, grp.conditions.length ); /* empty in place */
			$el.children().each( function( n, row ) {
				var id = jQuery( row ).attr( 'id' );
				var obj = ixCond[ id ];
				if ( obj ) {
					// console.log("reindexConditions(" + grp.id + ") " + id + " is now " + ix);
					jQuery( row ).removeClass( 'level' + String( obj.__depth || 0 ) ).removeClass( 'levelmod0 levelmod1 levelmod2 levelmod3' );
					grp.conditions[ix] = obj;
					obj.__parent = grp;
					obj.__index = ix++;
					if ( "group" == ( obj.type || "group" ) ) {
						obj.__depth = grp.__depth + 1;
						jQuery( row ).addClass( 'level' + obj.__depth ).addClass( 'levelmod' + (obj.__depth % 4) );
					}
				} else {
					/* Not found. Remove from UI */
					jQuery( row ).remove();
				}
			});
		}

		/**
		 * Remove all properies on condition except those in the exclusion list.
		 * The id and type properties are always preserved.
		 */
		function removeConditionProperties( cond, excl ) {
			var elist = (excl || "").split(/,/);
			var emap = { id: true, type: true, options: true }; /* never remove these */
			for ( var ix=0; ix<elist.length; ++ix ) {
				emap[elist[ix]] = true;
			}
			for ( var prop in cond ) {
				if ( cond.hasOwnProperty( prop ) && emap[prop] === undefined &&
						!prop.match( /^__/ ) ) {
					delete cond[prop];
				}
			}
		}

		/**
		 * Make a service/variable menu of all state defined for the device. Be
		 * brief, using only the variable name in the menu, unless that name is
		 * used by multiple services, in which case the last component of the
		 * serviceId is added parenthetically to draw the distinction.
		 */
		function makeVariableMenu( device, service, variable ) {
			var el = jQuery('<select class="varmenu form-control form-control-sm"></select>');
			var myid = api.getCpanelDeviceId();
			if ( -1 === device ) device = myid;
			var devobj = api.getDeviceObject( device );
			if ( devobj ) {
				var mm = {}, ms = [];
				for ( var k=0; k<( devobj.states || []).length; ++k ) {
					var st = devobj.states[k];
					if ( undefined === st.variable || undefined === st.service ) continue;
					/* For self-reference, only allow variables created from configured expressions */
					if ( device == myid && ! st.service.match( /^urn:toggledbits-com:serviceId:Reactor(Values|Group)$/ ) ) continue;
					var vnm = st.variable.toLowerCase();
					if ( undefined === mm[vnm] ) {
						/* Just use variable name as menu text, unless multiple with same name (collision) */
						mm[vnm] = ms.length;
						ms.push( { text: st.variable, service: st.service,
							variable: st.variable } );
					} else {
						/* Collision. Modify existing element to include service name. */
						var n = mm[vnm];
						ms[n].text = ms[n].variable + ' (' + ms[n].service.replace(/^([^:]+:)+/, "") + ')';
						/* Append new entry (text includes service name) */
						ms.push( { text: st.variable + ' (' +
							st.service.replace(/^([^:]+:)+/, "") + ')',
							service: st.service,
							variable: st.variable
						} );
					}
				}
				var r = ms.sort( function( a, b ) {
					if ( a.text.toLowerCase() === b.text.toLowerCase() ) return 0;
					return a.text.toLowerCase() < b.text.toLowerCase() ? -1 : 1;
				});
				r.forEach( function( sv ) {
					el.append( '<option value="' + sv.service + '/' + sv.variable + '">' + sv.text + '</option>' );
				});
				if ( 0 === r.length ) {
					el.append( '<option value="" disabled>(no eligible variables)</option>' );
				}
			}

			if ( ! ( isEmpty( service ) || isEmpty( variable ) ) ) {
				var opt = jQuery( 'option[value="' + service + '/' + variable + '"]', el );
				if ( opt.length === 0 ) {
					el.append( '<option value="' + service + '/' + variable + '" selected>' + service + '/' + variable + ' *</option>' );
				} else {
					el.val( service + '/' + variable );
				}
			}
			return el;
		}

		function makeServiceOpMenu( cond ) {
			var el = jQuery('<select class="opmenu form-control form-control-sm"></select>');
			for ( var ix=0; ix<serviceOps.length; ix++ ) {
				el.append( jQuery('<option/>').val(serviceOps[ix].op).text(serviceOps[ix].desc || serviceOps[ix].op) );
			}

			if ( undefined !== cond ) {
				if ( cond == '><' ) { cond = '<>'; configModified = true; }
				el.val( cond );
			}
			return el;
		}

		function makeDateTimeOpMenu( cond ) {
			var el = jQuery('<select class="opmenu form-control form-control-sm"></select>');
			el.append( '<option value="bet">between</option>' );
			el.append( '<option value="nob">not between</option>' );

			if ( undefined !== cond ) {
				el.val( cond );
			}
			return el;
		}

		/* Make a menu of groups in a ReactorSensor */
		function makeRSGroupMenu( cond ) {
			var mm = jQuery( '<select id="grpmenu" class="form-control form-control-sm tberror" />' );
			try {
				var dc;
				var myid = api.getCpanelDeviceId();
				var myself = -1 === cond.device || cond.device === myid;
				if ( myself ) {
					/* Our own groups */
					dc = getConfiguration( myid );
				} else {
					/* Get config of another device */
					dc = api.getDeviceState( cond.device, "urn:toggledbits-com:serviceId:ReactorSensor", "cdata" );
					dc = JSON.parse( dc );
				}
				if ( dc ) {
					var appendgrp = function ( grp, sel, pg ) {
						/* Don't add ancestors in same RS */
						if ( ! ( myself && isAncestor( grp.id, cond.id, myid ) ) ) {
							sel.append(
								jQuery( '<option/>' ).val( grp.id )
									.text( "root"===grp.id ? "Tripped/Untripped (root)" : ( grp.name || grp.id ) )
							);
						}
						/* Don't scan siblings or anything below. */
						if ( myself && grp.id == pg.id ) return;
						for ( var ix=0; ix<(grp.conditions || []).length; ix++ ) {
							if ( "group" === ( grp.conditions[ix].type || "group" ) ) {
								appendgrp( grp.conditions[ix], sel, pg );
							}
						}
					};
					/* Get the parent group of this condition */
					var pgrp = ( getConditionIndex( myid )[cond.id] || {}).__parent || {};
					appendgrp( dc.conditions.root, mm, pgrp );
				}
			} catch( e ) {
				console.log( "makeRSGroupMenu: " + String(e) );
			}
			/* Default-select the current value, or root if none. */
			if ( !isEmpty( cond.groupid ) ) {
				var gid = cond.groupid || "?";
				var el = jQuery( 'option[value="' + gid + '"]', mm );
				if ( el.length == 0 ) {
					/* Current value not in menu, may refer to deleted group! */
					el = jQuery( '<option/>' ).val( gid ).text( gid + " (missing?)" );
					mm.append( el );
				} else {
					mm.removeClass( 'tberror' );
				}
				mm.val( gid );
				if ( cond.groupname !== el.text() ) {
					cond.groupname = el.text();
					configModified = true;
				}
			} else {
				mm.val( 'root' );
			}
			return mm;
		}

		/**
		 * Update row structure from current display data.
		 */
		function updateConditionRow( $row, target ) {
			var condId = $row.attr("id");
			var cond = getConditionIndex()[ condId ];
			var typ = $row.hasClass( "cond-cond" ) ? jQuery("select#condtype", $row).val() || "comment" : "group";
			cond.type = typ;
			jQuery('.tberror', $row).removeClass('tberror');
			$row.removeClass('tberror');
			var val, res;
			switch (typ) {
				case "":
					jQuery( 'select#condtype', $row ).addClass( 'tberror' );
					break;

				case 'group':
					removeConditionProperties( cond, 'name,conditions,operator,invert,disabled' );
					if ( ( cond.conditions || [] ).length == 0 ) {
						$row.addClass( 'tberror' );
					}
					break;

				case 'comment':
					removeConditionProperties( cond, "comment" );
					cond.comment = jQuery("div.params input", $row).val();
					break;

				case 'service':
					removeConditionProperties( cond, "device,devicename,service,variable,operator,value,nocase,options" );
					cond.device = parseInt( jQuery("div.params select.devicemenu", $row).val() );
					cond.service = jQuery("div.params select.varmenu", $row).val() || "";
					cond.variable = cond.service.replace( /^[^\/]+\//, "" );
					cond.service = cond.service.replace( /\/.*$/, "" );
					cond.operator = jQuery("div.params select.opmenu", $row).val() || "=";
					if ( cond.operator.match( noCaseOptPattern ) ) {
						/* Case-insensitive (nocase==1) is the default */
						val = ( jQuery( 'input.nocase', $row ).prop( 'checked' ) || false ) ? 1 : 0;
						if ( val !== cond.nocase ) {
							cond.nocase = ( 0 === val ) ? 0 : undefined;
							configModified = true;
						}
					} else if ( undefined !== cond.nocase ) {
						delete cond.nocase;
						configModified = true;
					}
					var op = serviceOpsIndex[cond.operator || ""];
					if ( op.args > 1 ) {
						// Join simple two value list, but don't save "," on its own.
						cond.value = jQuery( 'input#val1', $row ).val() || "";
						val = jQuery( 'input#val2', $row ).val() || "";
						if ( ( isEmpty( cond.value ) || isEmpty( val ) ) && ! op.optional ) {
							jQuery( 'input.tbsecondaryinput', $row ).addClass( 'tberror' );
						}
						if ( 1 === op.optional && ( isEmpty( cond.value ) && isEmpty( val ) ) ) {
							jQuery( 'input.tbsecondaryinput', $row ).addClass( 'tberror' );
						}
						/* Other possibility is 2 === op.optional, allows both fields blank */
						if ( ! isEmpty( val ) ) {
							cond.value += "," + val;
						}
					} else if ( op.args == 1 ) {
						cond.value = jQuery("input#value", $row).val() || "";
						if ( isEmpty( cond.value ) && ! op.optional ) {
							jQuery( 'input#value', $row ).addClass( 'tberror' );
						}
					} else {
						delete cond.value;
					}
					/* For numeric op, check that value is parseable as a number (unless var ref) */
					if ( op && op.numeric && ! cond.value.match( varRefPattern ) ) {
						val = parseFloat( cond.value );
						if ( isNaN( val ) ) {
							jQuery( 'input#value', $row ).addClass( 'tberror' );
						}
					}
					break;

				case 'grpstate':
					removeConditionProperties( cond, "device,devicename,groupid,groupname,operator,options" );
					cond.device = parseInt( jQuery( 'div.params select.devicemenu', $row ).val(), $row );
					cond.groupid = jQuery( 'div.params select#grpmenu', $row ).val() || "root";
					cond.groupname = jQuery( 'div.params select#grpmenu option:selected', $row ).text();
					cond.operator = jQuery( 'div.params select.opmenu', $row ).val() || "istrue";
					break;

				case 'weekday':
					removeConditionProperties( cond, "operator,value,options" );
					cond.operator = jQuery("div.params select.wdcond", $row).val() || "";
					res = [];
					jQuery("input.wdopt:checked", $row).each( function( ix, control ) {
						res.push( control.value /* DOM element */ );
					});
					cond.value = res.join( ',' );
					break;

				case 'housemode':
					removeConditionProperties( cond, "operator,value,options" );
					cond.operator = jQuery("div.params select.opmenu", $row).val() || "is";
					if ( "change" === cond.operator ) {
						// Join simple two value list, but don't save "," on its own.
						cond.value = jQuery( 'select#frommode', $row ).val() || "";
						val = jQuery( 'select#tomode', $row ).val();
						if ( ! isEmpty( val ) ) {
							cond.value += "," + val;
						}
					} else {
						res = [];
						jQuery("input.hmode:checked", $row).each( function( ix, control ) {
							res.push( control.value /* DOM element */ );
						});
						cond.value = res.join( ',' );
					}
					break;

				case 'trange':
					cond.operator = jQuery("div.params select.opmenu", $row).val() || "bet";
					var between = "bet" === cond.operator || "nob" == cond.operator;
					if ( target !== undefined && target.hasClass('year') ) {
						var pdiv = target.closest('div');
						var newval = target.val().trim();
						/* Vera's a 32-bit system, so date range is bound to MAXINT32 (2038-Jan-19 03:14:07 aka Y2K38) */
						if ( newval != "" && ( (!newval.match( /^[0-9]+$/ )) || newval < 1970 || newval > 2037 ) ) {
							target.addClass( 'tberror' );
						} else {
							var losOtros;
							if ( pdiv.hasClass('start') ) {
								losOtros = jQuery('fieldset#end input.year', $row);
							} else {
								losOtros = jQuery('fieldset#start input.year', $row);
							}
							if ( newval === "" && losOtros.val() !== "" ) {
								losOtros.val("");
							} else if ( newval !== "" && losOtros.val() === "" ) {
								losOtros.val(newval);
							}
						}
					}
					var mon = jQuery("fieldset#start select.monthmenu", $row).val() || "";
					if ( isEmpty( mon ) ) {
						/* No/any month. Disable years. */
						jQuery( '.datespec', $row ).val( "" ).prop( 'disabled', true );
						/* Ending month must also be blank */
						jQuery( 'fieldset#end select.monthmenu', $row ).val( "" );
					} else {
						/* Month specified, year becomes optional, but either both
						   years must be specified or neither for between/not. */
						jQuery( '.datespec', $row ).prop( 'disabled', false );
						jQuery( 'fieldset#start select.daymenu:has(option[value=""]:selected)', $row ).addClass( 'tberror' );
						if ( between ) {
							jQuery( 'fieldset#end select.daymenu:has(option[value=""]:selected)', $row ).addClass( 'tberror' );
							var y1 = jQuery( 'fieldset#start input.year', $row ).val() || "";
							var y2 = jQuery( 'fieldset#end input.year', $row ).val() || "";
							if ( isEmpty( y1 ) !== isEmpty( y2 ) ) {
								jQuery( '.datespec', $row ).addClass( 'tberror' );
							}
							var m2 = jQuery( 'fieldset#end select.monthmenu', $row ).val() || "";
							if ( isEmpty( m2 ) ) {
								/* Ending month may not be blank--flag both start/end */
								jQuery( 'select.monthmenu', $row ).addClass( 'tberror' );
							}
						}
					}
					var dom = jQuery( 'fieldset#start select.daymenu', $row ).val() || "";
					if ( isEmpty( dom ) ) {
						/* Start day is blank. So must be end day */
						jQuery( 'fieldset#end select.daymenu', $row ).val( "" );
					} else if ( between ) {
						/* Between with start day, end day must also be specified. */
						jQuery( 'fieldset#end select.daymenu:has(option[value=""]:selected)', $row ).addClass( 'tberror' );
					}

					/* Fetch and load */
					res = [];
					res.push( isEmpty( mon ) ? "" : jQuery("fieldset#start input.year", $row).val() || "" );
					res.push( mon );
					res.push( jQuery("fieldset#start select.daymenu", $row).val() || "" );
					res.push( jQuery("fieldset#start select.hourmenu", $row).val() || "0" );
					res.push( jQuery("fieldset#start select.minmenu", $row).val() || "0" );
					if ( ! between ) {
						Array.prototype.push.apply( res, ["","","","",""] );
						jQuery('fieldset#end', $row).hide();
					} else {
						jQuery('fieldset#end', $row).show();
						res.push( isEmpty( mon ) ? "" : jQuery("fieldset#end input.year", $row).val() || "" );
						res.push( isEmpty( mon ) ? "" : jQuery("fieldset#end select.monthmenu", $row).val() || "" );
						res.push( jQuery("fieldset#end select.daymenu", $row).val() || "" );
						res.push( jQuery("fieldset#end select.hourmenu", $row).val() || "0" );
						res.push( jQuery("fieldset#end select.minmenu", $row).val() || "0" );
					}
					cond.value = res.join(',');
					break;

				case 'sun':
					removeConditionProperties( cond, "operator,value,options" );
					cond.operator = jQuery('div.params select.opmenu', $row).val() || "after";
					res = [];
					var whence = jQuery('div.params select#sunstart', $row).val() || "sunrise";
					var offset = getInteger( jQuery('div.params input#startoffset', $row).val() || "0" );
					if ( isNaN( offset ) ) {
						/* Validation error, flag and treat as 0 */
						offset = 0;
						jQuery('div.params input#startoffset', $row).addClass('tberror');
					}
					res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
					if ( cond.operator == "bet" || cond.operator == "nob" ) {
						jQuery( 'fieldset#end', $row ).show();
						whence = jQuery('select#sunend', $row).val() || "sunset";
						offset = getInteger( jQuery('input#endoffset', $row).val() || "0" );
						if ( isNaN( offset ) ) {
							offset = 0;
							jQuery('div.params input#endoffset', $row).addClass('tberror');
						}
						res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
					} else {
						jQuery( 'fieldset#end', $row ).hide();
						res.push("");
					}
					cond.value = res.join(',');
					break;

				case 'interval':
					removeConditionProperties( cond, "days,hours,mins,basetime,relto,relcond,options" );
					var nmin = 0;
					var v = jQuery('div.params #days', $row).val() || "0";
					if ( v.match( varRefPattern ) ) {
						cond.days = v;
						nmin = 1440;
					} else {
						v = getOptionalInteger( v, 0 );
						if ( isNaN(v) || v < 0 ) {
							jQuery( 'div.params #days', $row ).addClass( 'tberror' );
						} else {
							cond.days = v;
							nmin = nmin + 1440 * v;
						}
					}
					if ( typeof(cond.days) == "string" || ( typeof(cond.days) == "number" && 0 !== cond.days ) ) {
						jQuery('div.params #hours,#mins', $row).prop('disabled', true).val("0");
						cond.hours = 0;
						cond.mins = 0;
					} else {
						jQuery('div.params #hours,#mins', $row).prop('disabled', false);
						v = jQuery('div.params #hours', $row).val() || "0";
						if ( v.match( varRefPattern ) ) {
							cond.hours = v;
							nmin = 60;
						} else {
							v = getOptionalInteger( v, 0 );
							if ( isNaN(v) || v < 0 || v > 23 ) {
								jQuery( 'div.params #hours', $row ).addClass( 'tberror' );
							} else {
								cond.hours = v;
								nmin = nmin + 60 * v;
							}
						}
						v = jQuery('div.params #mins', $row).val() || "0";
						if ( v.match( varRefPattern ) ) {
							cond.mins = v;
							nmin = 1;
						} else {
							v = getOptionalInteger( v, 0 );
							if ( isNaN(v) || v < 0 || v > 59 ) {
								jQuery( 'div.params #mins', $row ).addClass( 'tberror' );
							} else {
								cond.mins = v;
								nmin = nmin + v;
							}
						}
						if ( 0 !== nmin ) {
							jQuery( '#days', $row ).prop( 'disabled', true ).val("0");
						} else {
							jQuery( '#days', $row ).prop( 'disabled', false );
						}
					}
					if ( nmin <= 0 ) {
						jQuery( 'div.params #days,#hours,#mins', $row ).addClass( 'tberror' );
					}
					/* Interval relative to... */
					v = jQuery( 'div.params select#relto', $row ).val() || "";
					if ( "condtrue" === v ) {
						cond.relto = v;
						cond.relcond = jQuery( 'div.params select#relcond', $row).val() || "";
						if ( "" === cond.relcond ) {
							jQuery( 'div.params select#relcond', $row ).addClass( 'tberror' );
						}
						delete cond.basetime;
					} else {
						var rh = jQuery( 'div.params select#relhour', $row ).val() || "00";
						var rm = jQuery( 'div.params select#relmin', $row ).val() || "00";
						if ( rh == "00" && rm == "00" ) {
							delete cond.basetime;
						} else {
							cond.basetime = rh + "," + rm;
						}
						delete cond.relcond;
						delete cond.relto;
					}
					break;

				case 'ishome':
					removeConditionProperties( cond, "operator,value,options" );
					cond.operator = jQuery("div.params select.geofencecond", $row).val() || "is";
					res = [];
					if ( "at" === cond.operator || "notat" === cond.operator ) {
						res[0] = jQuery( 'select#userid', $row ).val() || "";
						res[1] = jQuery( 'select#location', $row ).val() || "";
						if ( isEmpty( res[0] ) ) {
							jQuery( 'select#userid', $row ).addClass( 'tberror' );
						}
						if ( isEmpty( res[1] ) ) {
							jQuery( 'select#location', $row ).addClass( 'tberror' );
						}
					} else {
						jQuery("input.useropt:checked", $row).each( function( ix, control ) {
							res.push( control.value /* DOM element */ );
						});
					}
					cond.value = res.join( ',' );
					break;

				case 'reload':
					/* No parameters */
					removeConditionProperties( cond, "options" );
					break;

				default:
					break;
			}

			/* If condition options are present, check them, too. */
			var $ct = $row.hasClass( 'cond-group' ) ? $row.children( 'div.condopts' ) : jQuery( 'div.condopts', $row );
			if ( $ct.length > 0 ) {

				cond.options = cond.options || {};

				/* Predecessor condition (sequencing) */
				var $pred = jQuery( 'select#pred', $ct );
				if ( isEmpty( $pred.val() ) ) {
					jQuery( 'input#predtime', $ct ).prop( 'disabled', true ).val( "" );
					if ( undefined !== cond.options.after ) {
						delete cond.options.after;
						delete cond.options.aftertime;
						configModified = true;
					}
				} else {
					jQuery( 'input#predtime', $ct ).prop( 'disabled', false );
					var pt = parseInt( jQuery('input#predtime', $ct).val() );
					if ( isNaN( pt ) || pt < 0 ) {
						pt = 0;
						jQuery('input#predtime', $ct).val(pt);
					}
					if ( cond.options.after !== $pred.val() || cond.options.aftertime !== pt ) {
						cond.options.after = $pred.val();
						cond.options.aftertime = pt;
						configModified = true;
					}
				}

				/* Repeats */
				var $rc = jQuery('input#rcount', $ct);
				if ( isEmpty( $rc.val() ) || $rc.prop('disabled') ) {
					jQuery('input#duration', $ct).prop('disabled', false);
					jQuery('select#durop', $ct).prop('disabled', false);
					jQuery('input#rspan', $ct).val("").prop('disabled', true);
					if ( undefined !== cond.options.repeatcount ) {
						delete cond.options.repeatcount;
						delete cond.options.repeatwithin;
						configModified = true;
					}
				} else {
					val = getInteger( $rc.val() );
					if ( isNaN( val ) || val < 2 ) {
						$rc.addClass( 'tberror' );
					} else if ( val > 1 ) {
						$rc.removeClass( 'tberror' );
						if ( val != cond.options.repeatcount ) {
							cond.options.repeatcount = val;
							delete cond.options.duration;
							delete cond.options.duration_op;
							configModified = true;
						}
						jQuery('input#duration', $ct).val("").prop('disabled', true);
						jQuery('select#durop', $ct).val("ge").prop('disabled', true);
						jQuery('input#rspan', $ct).prop('disabled', false);
						if ( jQuery('input#rspan', $ct).val() === "" ) {
							jQuery('input#rspan', $ct).val( "60" );
							cond.options.repeatwithin = 60;
							configModified = true;
						}
					}
				}
				var $rs = jQuery('input#rspan', $ct);
				if ( ! $rs.prop('disabled') ) {
					var rspan = getInteger( $rs.val() );
					if ( isNaN( rspan ) || rspan < 1 ) {
						$rs.addClass( 'tberror' );
					} else {
						$rs.removeClass( 'tberror' );
						if ( rspan !== ( cond.options.repeatwithin || 0 ) ) {
							cond.options.repeatwithin = rspan;
							configModified = true;
						}
					}
				}

				/* Duration (sustained for) */
				var $dd = jQuery('input#duration', $ct);
				if ( isEmpty( $dd.val() ) || $dd.prop('disabled') ) {
					jQuery('input#rcount', $ct).prop('disabled', false);
					// jQuery('input#rspan', $ct).prop('disabled', false);
					if ( undefined !== cond.options.duration ) {
						delete cond.options.duration;
						delete cond.options.duration_op;
						configModified = true;
					}
				} else {
					var dur = getInteger( $dd.val() );
					if ( isNaN( dur ) || dur < 0 ) {
						$dd.addClass('tberror');
					} else {
						$dd.removeClass('tberror');
						jQuery('input#rcount', $ct).val("").prop('disabled', true);
						// jQuery('input#rspan', $ct).val("").prop('disabled', true);
						delete cond.options.repeatwithin;
						delete cond.options.repeatcount;
						if ( ( cond.options.duration || 0 ) !== dur ) {
							/* Changed */
							if ( dur === 0 ) {
								delete cond.options.duration;
								delete cond.options.duration_op;
								jQuery('input#rcount', $ct).prop('disabled', false);
								// jQuery('input#rspan', $ct).prop('disabled', false);
							} else {
								cond.options.duration = dur;
								cond.options.duration_op = jQuery('select#durop', $ct).val() || "ge";
							}
							configModified = true;
						}
					}
				}

				var mode = jQuery( 'input#output:checked', $ct ).val() || "";
				if ( "L" === mode ) {
					/* Latching */
					jQuery( 'input#holdtime', $ct ).prop( 'disabled', true );
					configModified = configModified || ( undefined !== cond.options.holdtime );
					delete cond.options.holdtime;
					jQuery( 'input#pulsetime', $ct ).prop( 'disabled', true );
					configModified = configModified || ( undefined !== cond.options.pulsetime );
					delete cond.options.pulsetime;

					if ( undefined === cond.options.latch ) {
						cond.options.latch = 1;
						configModified = true;
					}
				} else if ( "P"  === mode ) {
					/* Pulse output */
					jQuery( 'input#holdtime', $ct ).prop( 'disabled', true );
					configModified = configModified || ( undefined !== cond.options.holdtime );
					delete cond.options.holdtime;
					jQuery( 'input#pulsetime', $ct ).prop( 'disabled', false );
					configModified = configModified || ( undefined !== cond.options.latch );
					delete cond.options.latch;

					var $f = jQuery( 'input#pulsetime', $ct );
					var pulsetime = $f.val() || "";
					if ( isEmpty( pulsetime ) ) {
						pulsetime = 15; /* force a default */
						$f.val( pulsetime );
						configModified = configModified || pulsetime !== cond.options.pulsetime;
						cond.options.pulsetime = pulsetime;
					} else {
						pulsetime = getInteger( pulsetime );
						if ( isNaN( pulsetime ) || pulsetime <= 0 ) {
							$f.addClass( 'tberror' );
							cond.options.pulsetime = 1;
						} else if ( pulsetime !== cond.options.pulsetime ) {
							cond.options.pulsetime = pulsetime;
							configModified = true;
						}
					}
				} else {
					/* Follow mode (default) */
					jQuery( 'input#holdtime', $ct ).prop( 'disabled', false );
					jQuery( 'input#pulsetime', $ct ).prop( 'disabled', true );
					configModified = configModified || ( undefined !== cond.options.pulsetime );
					delete cond.options.pulsetime;
					configModified = configModified || ( undefined !== cond.options.latch );
					delete cond.options.latch;

					/* Hold time (delay reset) */
					$dd = jQuery( 'input#holdtime', $ct );
					if ( isEmpty( $dd.val() ) ) {
						/* Empty and 0 are equivalent */
						configModified = configModified || ( undefined !== cond.options.holdtime );
						delete cond.options.holdtime;
					} else {
						var holdtime = getInteger( $dd.val() );
						if ( isNaN( holdtime ) || holdtime < 0 ) {
							delete cond.options.holdtime;
							$dd.addClass( 'tberror' );
						} else if ( ( cond.options.holdtime || 0 ) !== holdtime ) {
							if ( holdtime > 0 ) {
								cond.options.holdtime = holdtime;
							} else {
								delete cond.options.holdtime;
							}
							configModified = true;
						}
					}
				}
			}

			/* Options open or not, make sure options expander is highlighted */
			var optButton = jQuery( $row.hasClass( 'cond-group' ) ? '.cond-group-header > div > button#condmore:first' : '.cond-actions > button#condmore', $row );
			if ( hasAnyProperty( cond.options ) ) {
				optButton.addClass( 'attn' );
			} else {
				optButton.removeClass( 'attn' );
				delete cond.options;
			}

			$row.has('.tberror').addClass('tberror');

			updateSaveControls();
		}

		/**
		 * Handler for row change (generic change to some value we don't otherwise
		 * need additional processing to respond to)
		 */
		function handleConditionRowChange( ev ) {
			var el = jQuery( ev.currentTarget );
			var row = el.closest('div.cond-container');

			console.log('handleConditionRowChange ' + String(row.attr('id')));

			row.addClass( 'tbmodified' );
			configModified = true;
			updateConditionRow( row, el );
		}

		/**
		 * Update current value display for service condition
		 */
		function updateCurrentServiceValue( row ) {
			var device = parseInt( jQuery("select.devicemenu", row).val() );
			var service = jQuery("select.varmenu", row).val() || "";
			var variable = service.replace( /^[^\/]+\//, "" );
			service = service.replace( /\/.*$/, "" );
			var blk = jQuery( 'div#currval', row );
			if ( ! ( isNaN(device) || isEmpty( service ) || isEmpty( variable ) ) ) {
				var val = api.getDeviceState( device, service, variable );
				if ( undefined === val || false === val ) {
					blk.text( 'Current value: (not set)' ).attr( 'title', "This variable is not present in the device state." );
				} else {
					var abbrev = val.length > 64 ? val.substring(0,61) + '...' : val;
					blk.text( 'Current value: ' + abbrev ).attr( 'title', val.length==0 ? "The string is blank/empty." : val );
				}
			} else {
				blk.empty().attr( 'title', "" );
			}
		}

		/**
		 * Handler for variable change. Change the displayed current value.
		 */
		function handleConditionVarChange( ev ) {
			var $el = jQuery( ev.currentTarget );
			var $row = $el.closest('div.cond-container');

			updateCurrentServiceValue( $row );

			/* Same closing as handleConditionRowChange() */
			configModified = true;
			updateConditionRow( $row, $el );
		}

		/* Set up fields for condition based on current operator */
		function setUpConditionOpFields( $row, cond ) {
			var vv = (cond.value || "").split(/,/);

			if ( "housemode" === cond.type ) {
				if ( "change" == ( cond.operator || "is" ) ) {
					jQuery( 'fieldset#housemodechecks', $row ).hide();
					jQuery( 'fieldset#housemodeselects', $row ).show();
					menuSelectDefaultInsert( jQuery( 'select#frommode', $row ), vv.length > 0 ? vv[0] : "" );
					menuSelectDefaultInsert( jQuery( 'select#tomode', $row   ), vv.length > 1 ? vv[1] : "" );
				} else {
					jQuery( 'fieldset#housemodechecks', $row ).show();
					jQuery( 'fieldset#housemodeselects', $row ).hide();
					vv.forEach( function( ov ) {
						jQuery('input#' + idSelector( cond.id + '-mode-' + ov ), $row).prop('checked', true);
					});
				}
			} else if ( "service" === cond.type ) {
				var val = cond.operator || "=";
				var op = serviceOpsIndex[val];
				var $inp = jQuery( 'input#value', $row );
				if ( op.args > 1 ) {
					if ( $inp.length > 0 ) {
						/* Single input field; change this one for double */
						$inp.attr( 'id', 'val1' ).show();
					} else {
						/* Already there */
						$inp = jQuery( 'input#val1', $row );
					}
					/* Work on second field */
					var $in2 = jQuery( 'input#val2', $row );
					if ( 0 === $in2.length ) {
						$in2 = $inp.clone().attr('id', 'val2')
							.off( 'change.reactor' ).on( 'change.reactor', handleConditionRowChange );
						$in2.insertAfter( $inp );
					}
					if ( op.optional ) {
						$inp.attr( 'placeholder', 'blank=any value' );
						$in2.attr( 'placeholder', 'blank=any value' );
					}
					/* Labels */
					jQuery( 'label.tbsecondaryinput', $row ).remove();
					var fmt = op.format || "%1,%2";
					var lbl = fmt.match( /^([^%]*)%\d+([^%]*)%\d+(.*)$/ );
					if ( null !== lbl ) {
						if ( !isEmpty( lbl[1] ) ) {
							jQuery( '<label for="val1" class="tbsecondaryinput"/>' ).text( lbl[1] ).insertBefore( $inp );
						}
						if ( !isEmpty( lbl[2] ) ) {
							jQuery( '<label for="val2" class="tbsecondaryinput">' ).text( lbl[2] ).insertBefore( $in2 );
						}
						if ( !isEmpty( lbl[3] ) ) {
							jQuery( '<label class="tbsecondaryinput">' ).text( lbl[3] ).insertAfter( $in2 );
						}
					}
					/* Restore values */
					$inp.val( vv.length > 0 ? String(vv[0]) : "" );
					jQuery( 'input#val2', $row ).val( vv.length > 1 ? String(vv[1]) : "" );
				} else {
					if ( $inp.length == 0 ) {
						/* Convert double fields back to single */
						$inp = jQuery( 'input#val1', $row ).attr( 'id', 'value' ).attr( 'placeholder', '' );
						jQuery( 'input#val2,label.tbsecondaryinput', $row ).remove();
					}
					$inp.val( vv.length > 0 ? String(vv[0]) : "" );
					if ( 0 === op.args ) {
						$inp.val("").hide();
					} else {
						$inp.show();
					}
				}
				var $opt = jQuery( 'fieldset#nocaseopt', $row );
				if ( val.match( noCaseOptPattern ) ) {
					$opt.show();
					jQuery( 'input.nocase', $opt ).prop( 'checked', coalesce( cond.nocase, 1 ) !== 0 );
				} else {
					$opt.hide();
				}
			} else if ( "grpstate" === cond.type ) {
				/* nada */
			} else {
				console.log( "Invalid row type in handleConditionOperatorChange(): " + String( cond.type ) );
				return;
			}
		}

		/**
		 * Handler for operator change
		 */
		function handleConditionOperatorChange( ev ) {
			var $el = jQuery( ev.currentTarget );
			var val = $el.val();
			var $row = $el.closest('div.cond-container');
			var cond = getConditionIndex()[ $row.attr( 'id' ) ];

			cond.value = "";
			cond.operator = val;
			setUpConditionOpFields( $row, cond );
			configModified = true;
			updateConditionRow( $row, $el );
		}

		/**
		 * Handler for device change
		 */
		function handleDeviceChange( ev ) {
			var $el = jQuery( ev.currentTarget );
			var newDev = $el.val();
			var $row = $el.closest( 'div.cond-container' );
			var condId = $row.attr( 'id' );
			var cond = getConditionIndex()[condId];

			cond.device = parseInt( newDev );
			if ( -1 === cond.device ) {
				cond.devicename = "(self)";
			} else {
				var dobj = api.getDeviceObject( cond.device );
				cond.devicename = ( dobj || {}).name;
			}
			configModified = true;

			/* Make a new service/variable menu and replace it on the row. */
			var newMenu = makeVariableMenu( cond.device, cond.service, cond.variable );
			jQuery("select.varmenu", $row).replaceWith( newMenu );
			jQuery("select.varmenu", $row).off( 'change.reactor' ).on( 'change.reactor', handleConditionVarChange );

			newMenu = makeEventMenu( cond, $row );
			jQuery( 'div#eventlist', $row ).replaceWith( newMenu );

			updateCurrentServiceValue( $row );

			updateConditionRow( $row ); /* pass it on */
		}

		function handleExpandOptionsClick( ev ) {
			var $el = jQuery( ev.currentTarget );
			var $row = $el.closest( 'div.cond-container' );
			var isGroup = $row.hasClass( 'cond-group' );
			var cond = getConditionIndex()[ $row.attr( "id" ) ];

			/* If the options container already exists, just show it. */
			var $container = jQuery( isGroup ? 'div.condopts' : 'div.cond-body > div.condopts', $row );
			if ( $container.length > 0 ) {
				/* Container exists and is open, close it, remove it. */
				$container.slideUp({
					complete: function() {
						$container.remove();
					}
				});
				jQuery( 'i', $el ).text( 'expand_more' );
				$el.attr( 'title', msgOptionsShow );
				if ( $row.hasClass( 'tbautohidden' ) ) {
					jQuery( '.cond-group-title button#expand', $row ).click();
					$row.removeClass( 'tbautohidden' );
				}
				return;
			}

			/* Doesn't exist. Create the options container and add options */
			jQuery( 'i', $el ).text( 'expand_less' );
			$el.attr( 'title', msgOptionsHide );
			$container = jQuery( '<div class="condopts" />' ).hide();

			var displayed = condOptions[ cond.type || "group" ] || {};
			var condOpts = cond.options || {};

			/* Options now fall into two general groups: output control, and restrictions. */

			/* Output Control */
			var out = jQuery( '<div/>', { "id": "outputopt", "class": "form-inline tboptgroup" } ).appendTo( $container );
			jQuery( '<div class="opttitle">Output Control</div>' ).append( getWiki( 'Condition-Options' ) ).appendTo( out );
			jQuery( '<label><input type="radio" id="output" name="output" value="">Follow (default) - output remains true while condition matches</label>' ).appendTo( out );
			if ( false !== displayed.hold ) {
				jQuery( '<label>; delay reset <input type="number" id="holdtime" class="form-control form-control-sm narrow"> seconds (0=no delay)</label>' ).appendTo( out );
			}
			if ( false !== displayed.pulse ) {
				jQuery( '<br/><label><input type="radio" id="output" name="output" value="P">Pulse - on match, output goes true for <input type="number" id="pulsetime" class="form-control form-control-sm narrow"> seconds</label>' ).appendTo( out );
			}
			if ( false !== displayed.latch ) {
				jQuery( '<br/><label><input type="radio" id="output" name="output" value="L">Latch - output is held true until external reset</label>' ).appendTo( out );
			}

			/* Restore/configure */
			if ( ( condOpts.pulsetime || 0 ) > 0 ) {
				jQuery( 'input#output[value="P"]', out ).prop( 'checked', true );
				jQuery( 'input#pulsetime', out ).prop( 'disabled', false ).val( condOpts.pulsetime || 15 );
				jQuery( 'input#holdtime', out ).prop( 'disabled', true ).val( "" );
			} else if ( 0 !== ( condOpts.latch || 0 ) ) {
				jQuery( 'input#output[value="L"]', out ).prop( 'checked', true );
				jQuery( 'input#pulsetime', out ).prop( 'disabled', true ).val( "" );
				jQuery( 'input#holdtime', out ).prop( 'disabled', true ).val( "" );
			} else {
				jQuery( 'input#output[value=""]', out ).prop( 'checked', true );
				jQuery( 'input#pulsetime', out ).prop( 'disabled', true ).val( "" );
				jQuery( 'input#holdtime', out ).prop( 'disabled', false ).val( condOpts.holdtime || 0 );
			}

			/* Restrictions */
			if ( displayed.sequence || displayed.duration || displayed.repeat ) {
				var rst = jQuery( '<div/>', { "id": "restrictopt", "class": "form-inline tboptgroup" } ).appendTo( $container );
				jQuery( '<div class="opttitle">Restrictions</div>' ).append( getWiki( 'Condition-Options' ) ).appendTo( rst );
				/* Sequence (predecessor condition) */
				if ( displayed.sequence ) {
					var $preds = jQuery('<select id="pred" class="form-control form-control-sm"><option value="">(any time/no sequence)</option></select>');
					/* Add groups that are not ancestor of condition */
					DOtraverse( (getConditionIndex()).root, function( node ) {
						$preds.append( jQuery( '<option/>' ).val( node.id ).text( makeConditionDescription( node ) ) );
					}, false, function( node ) {
						/* If node is not ancestor (line to root) or descendent of cond, allow as predecessor */
						return "comment" !== node.type && cond.id !== node.id && !isAncestor( node.id, cond.id ) && !isDescendent( node.id, cond.id );
					});
					rst.append('<div id="predopt" class="form-inline"><label>Condition must occur after&nbsp;</label></div>');
					jQuery('div#predopt label', rst).append( $preds );
					jQuery('div#predopt', rst).append('&nbsp;<label>within <input type="text" id="predtime" class="form-control form-control-sm narrow" autocomplete="off">&nbsp;seconds (0=no time limit)</label>');
					jQuery('select#pred', rst).val( condOpts.after || "" );
					jQuery('input#predtime', rst).val( condOpts.aftertime || 0 ).prop( 'disabled', "" !== ( condOpts.after || "" ) );
				}

				/* Duration */
				if ( displayed.duration ) {
					rst.append('<div id="duropt" class="form-inline"><label>Condition must be sustained for&nbsp;</label><select id="durop" class="form-control form-control-sm"><option value="ge">at least</option><option value="lt">less than</option></select><input type="text" id="duration" class="form-control form-control-sm narrow" autocomplete="off"><label>&nbsp;seconds</label></div>');
				}

				/* Repeat */
				if ( displayed.repeat ) {
					rst.append('<div id="repopt" class="form-inline"><label>Condition must repeat <input type="text" id="rcount" class="form-control form-control-sm narrow" autocomplete="off"> times within <input type="text" id="rspan" class="form-control form-control-sm narrow" autocomplete="off"> seconds</label></div>');
				}

				if ( ( condOpts.duration || 0 ) > 0 ) {
					jQuery('input#rcount,input#rspan', rst).prop('disabled', true);
					jQuery('input#duration', rst).val( condOpts.duration );
					jQuery('select#durop', rst).val( condOpts.duration_op || "ge" );
				} else {
					var rc = condOpts.repeatcount || "";
					jQuery('input#duration', rst).prop('disabled', rc != "");
					jQuery('select#durop', rst).prop('disabled', rc != "");
					jQuery('input#rcount', rst).val( rc );
					jQuery('input#rspan', rst).prop('disabled', rc=="").val( rc == "" ? "" : ( condOpts.repeatwithin || "60" ) );
				}
			}

			/* Handler for all fields */
			jQuery( 'input,select', $container ).on( 'change.reactor', handleConditionRowChange );

			/* Add the options container (specific immediate child of this row selection) */
			if ( isGroup ) {
				$row.append( $container );
				if ( 1 === jQuery( '.cond-group-title button#collapse', $row ).length ) {
					jQuery( '.cond-group-title button#collapse', $row ).click();
					$row.addClass('tbautohidden');
				}
			} else {
				$row.children( 'div.cond-body' ).append( $container );
			}
			$container.slideDown();
		}

		/**
		 * Update location selector to show correct locations for selected user.
		 */
		function updateGeofenceLocations( row, loc ) {
			var user = jQuery( 'select#userid', row ).val() || "";
			var mm = jQuery( 'select#location', row );
			mm.empty();
			if ( "" !== user ) {
				var ud = api.getUserData();
				for ( var k=0; k<(ud.usergeofences || []).length; ++k ) {
					if ( ud.usergeofences[k].iduser == user ) {
						mm.append( jQuery( '<option/>' ).val( "" ).text( '--choose location--' ) );
						jQuery.each( ud.usergeofences[k].geotags || [], function( ix, v ) {
							mm.append( jQuery( '<option/>' ).val( v.id ).text( v.name ) );
						});
						var el = jQuery( 'option[value="' + (loc || "") + '"]' );
						if ( el.length == 0 ) {
							mm.append( jQuery( '<option/>' ).val( loc )
								.text( "Deleted location " + String(loc) )
							);
						}
						mm.val( loc || "" );
						break;
					}
				}
			}
		}

		/**
		 * Handle user selector changed event.
		 */
		function handleGeofenceUserChange( ev ) {
			var row = jQuery( ev.currentTarget ).closest( 'div.cond-container' );
			updateGeofenceLocations( row, "" );
			handleConditionRowChange( ev );
		}

		/**
		 * Handle geofence operator change event.
		 */
		function handleGeofenceOperatorChange( ev ) {
			var el = jQuery( ev.currentTarget );
			var row = el.closest( 'div.cond-container' );
			var val = el.val() || "is";
			if ( "at" === val || "notat" === val ) {
				jQuery( 'fieldset#geolong', row ).show();
				jQuery( 'fieldset#geoquick', row ).hide();
			} else {
				jQuery( 'fieldset#geolong', row ).hide();
				jQuery( 'fieldset#geoquick', row ).show();
			}
			handleConditionRowChange( ev );
		}

		function firstKey( t ) {
			for ( var d in t ) {
				if ( t.hasOwnProperty( d ) ) return d;
			}
			return undefined;
		}

		/**
		 * Make event menu from static JSON eventlist for device
		 */
		function makeEventMenu( cond, $row ) {
			var el = jQuery( '<div id="eventlist" class="dropdown" />' );
			el.append( '<button id="dropdownTriggers" class="btn btn-default dropdown-toggle" type="button" data-toggle="dropdown" title="Click for device-defined events"><i class="material-icons" aria-haspopup="true" aria-expanded="false">chevron_right</i></button>' );
			var mm = jQuery( '<div class="dropdown-menu" role="menu" aria-labelledby="dropdownTriggers" />' );
			el.append( mm );
			var events;
			if ( isALTUI ) {
				/* AltUI doesn't implement getDeviceTemplate() as of 2019-06-09 */
				var dobj = api.getDeviceObject( -1 === cond.device ? api.getCpanelDeviceId() : cond.device );
				var eobj = dobj ? api.getEventDefinition( dobj.device_type ) || {} : {};
				/* AltUI returns object; reduce to array */
				events = [];
				for ( var ie=0; undefined !== eobj[String(ie)] ; ie++ ) {
					events.push( eobj[String(ie)] );
				}
			} else {
				var dtmp = api.getDeviceTemplate( -1 === cond.device ? api.getCpanelDeviceId() : cond.device );
				events = dtmp ? dtmp.eventList2 : false;
			}
			if ( events && events.length > 0 ) {
				var wrapAction = function( eventinfo, cond, $row ) {
					return function( ev ) {
						var el = jQuery( ev.target );
						cond.service = el.data( 'service' ) || "?";
						cond.variable = el.data( 'variable' ) || "?";
						cond.operator = el.data( 'operator' ) || "=";
						cond.value = el.data( 'value' ) || "";
						delete cond.nocase;
						var sk = cond.service + "/" + cond.variable;
						if ( 0 === jQuery( 'select.varmenu option[value="' + idSelector( sk ) + '"]', $row ).length ) {
							jQuery( 'select.varmenu', $row ).append( jQuery( '<option/>').val( sk ).text( sk ) );
						}
						jQuery( 'select.varmenu', $row ).val( sk );
						jQuery( 'select.opmenu', $row ).val( cond.operator );
						jQuery( 'input#value', $row ).val( cond.value );
						configModified = true;
						setUpConditionOpFields( $row, cond );
						updateCurrentServiceValue( $row );
						updateConditionRow( $row, jQuery( ev ) );
						jQuery( 'select.varmenu', $row ).focus();
					};
				};
				var reptext = function( s ) {
					return ( s || "?" ).replace( /_DEVICE_NAME_/g, "device" ).replace( /_ARGUMENT_VALUE_/g, "<i>value</i>" );
				};
				for ( var ix=0; ix<events.length; ix++ ) {
					var cx = events[ix];
					var item, txt, k;
					if ( cx.serviceStateTable ) {
						/* One fixed value (we hope--otherwise, we just use first) */
						item = jQuery( '<a href="#" class="dropdown-item"></a>' );
						item.attr( 'id', cx.id );
						k = firstKey( cx.serviceStateTable );
						item.data('service', cx.serviceId);
						item.data('variable', k);
						item.data('operator', (cx.serviceStateTable[k] || {}).comparisson || "=");
						item.data('value', String( cx.serviceStateTable[k].value ) );
						txt = reptext( (cx.label || {}).text || String(cx.id) );
						item.html( txt );
						mm.append( item );
						item.on( 'click.reactor', wrapAction( cx, cond, $row ) );
					} else { /* argumentList */
						for ( var iy=0; iy<(cx.argumentList || {}).length; iy++ ) {
							var arg = cx.argumentList[iy];
							if ( arg.allowedValueList ) {
								for ( var iz=0; iz<arg.allowedValueList.length; iz++ ) {
									var av = api.cloneObject( arg.allowedValueList[iz] );
									item = jQuery( '<a href="#" class="dropdown-item"></a>' );
									item.attr( 'id', cx.id );
									item.data('service', cx.serviceId);
									item.data( 'variable', arg.name );
									item.data( 'operator', arg.comparisson || "=" );
									k = firstKey( av );
									item.data( 'value', String( av[k] || "" ) );
									item.attr( 'id', arg.id );
									item.html( reptext( av.HumanFriendlyText.text || "(invalid device_json description)" ) );
									mm.append( item );
									item.on( 'click.reactor', wrapAction( cx, cond, $row ) );
								}
							} else {
								item = jQuery( '<a href="#" class="dropdown-item"></a>' );
								item.data( 'id', cx.id );
								item.data('service', cx.serviceId);
								item.data( 'variable', arg.name );
								item.data( 'operator', arg.comparisson || "=" );
								item.data( 'value', String( arg.defaultValue || "" ) );
								item.attr( 'id', arg.id );
								item.html( reptext( arg.HumanFriendlyText.text || "(invalid device_json description)" ) );
								mm.append( item );
								item.on( 'click.reactor', wrapAction( cx, cond, $row ) );
							}
						}
					}
				}
			}
			if ( jQuery( 'a', mm ).length > 0 ) {
				mm.append( jQuery( '<div class="dropdown-divider" />' ) );
				mm.append( jQuery( '<a href="#" class="dropdown-header" />' )
					.text( "In addition to the above device-defined events, you can select any state variable defined on the device and test its value." ) );
			} else {
				mm.append( jQuery( '<a href="#" class="dropdown-header" />' ).text( "This device does not define any events." ) );
			}
			return el;
		}

		/**
		 * Set condition fields and data for type. This also replaces existing
		 * data from the passed condition. The condition must have at least
		 * id and type keys set (so new conditions may be safely be otherwise
		 * empty).
		 */
		function setConditionForType( cond, row ) {
			var op, k, v, mm, fs, el, dobj;
			if ( undefined === row ) {
				row = jQuery( 'div.cond-container#' + idSelector( cond.id ) );
			}
			var container = jQuery('div.params', row).empty();

			row.children( 'button#condmore' ).prop( 'disabled', "comment" === cond.type );

			switch (cond.type) {
				case "":
					break;

				case 'comment':
					container.append('<input id="commenttext" type="text" class="form-control form-control-sm" autocomplete="off">');
					jQuery('input', container).on( 'change.reactor', handleConditionRowChange ).val( cond.comment || "" );
					break;

				case 'service':
					if ( isEmpty( cond.operator ) ) cond.operator = "=";
					container.append( makeDeviceMenu( cond.device, cond.devicename || "unknown device" ) );
					/* Fix-up: makeDeviceMenu will display current userdata name
							   for device, but if that's changed from what we've stored,
							   we need to update our store. */
					v = cond.devicename;
					if ( -1 === cond.device ) {
						v = "(self)";
					} else {
						dobj = api.getDeviceObject( cond.device );
						v = (dobj || {}).name; /* may be undefined, that's OK */
					}
					if ( cond.devicename !== v ) {
						cond.devicename = v;
						configModified = true;
					}
					try {
						container.append( makeEventMenu( cond, row ) );
					} catch( e ) {
						console.log("Error while attempting to handle device JSON: " + String(e));
					}
					container.append( makeVariableMenu( cond.device, cond.service, cond.variable ) );
					container.append( makeServiceOpMenu( cond.operator || "=" ) );
					container.append('<input type="text" id="value" class="form-control form-control-sm" autocomplete="off" list="reactorvarlist">');
					v = jQuery( '<fieldset id="nocaseopt" />' ).appendTo( container );
					getCheckbox( cond.id + "-nocase", "1", "Ignore&nbsp;case", "nocase" )
						.appendTo( v );
					container.append('<div id="currval"/>');

					setUpConditionOpFields( container, cond );
					jQuery("input#value", container).on( 'change.reactor', handleConditionRowChange );
					jQuery('input.nocase', container).on( 'change.reactor', handleConditionRowChange );
					jQuery("select.opmenu", container).on( 'change.reactor', handleConditionOperatorChange );
					jQuery("select.varmenu", container).on( 'change.reactor', handleConditionVarChange );
					jQuery("select.devicemenu", container).on( 'change.reactor', handleDeviceChange );

					updateCurrentServiceValue( container );
					break;

				case 'grpstate':
					/* Default device to current RS */
					cond.device = coalesce( cond.device, api.getCpanelDeviceId() );
					/* Make a device menu that shows ReactorSensors only. */
					container.append( makeDeviceMenu( cond.device, cond.devicename || "unknown device", function( dev ) {
						return "urn:schemas-toggledbits-com:device:ReactorSensor:1" === dev.device_type;
					}));
					/* Fix-up: makeDeviceMenu will display current userdata name
							   for device, but if that's changed from what we've stored,
							   we need to update our store. */
					v = cond.devicename;
					if ( -1 === cond.device ) {
						v = "(self)";
					} else {
						dobj = api.getDeviceObject( cond.device );
						v = (dobj || {}).name; /* may be undefined, that's OK */
					}
					if ( cond.devicename !== v ) {
						cond.devicename = v;
						configModified = true;
					}
					/* Create group menu for selected device (if any) */
					container.append( makeRSGroupMenu( cond ) );
					/* Make operator menu, short: only boolean and change */
					mm = jQuery( '<select class="opmenu form-control form-control-sm" />' );
					mm.append( jQuery( '<option/>' ).val( "istrue" ).text( "is TRUE" ) );
					mm.append( jQuery( '<option/>' ).val( "isfalse" ).text( "is FALSE" ) );
					mm.append( jQuery( '<option/>' ).val( "change" ).text( "changes" ) );
					container.append( mm );
					menuSelectDefaultFirst( mm, cond.operator );
					container.append('<div id="currval"/>');

					setUpConditionOpFields( container, cond );
					jQuery("select.opmenu", container).on( 'change.reactor', handleConditionRowChange );
					jQuery("select#grpmenu", container).on( 'change.reactor', handleConditionRowChange );
					jQuery("select.devicemenu", container).on( 'change.reactor', function( ev ) {
						var $el = jQuery( ev.currentTarget );
						var newDev = $el.val();
						var $row = $el.closest( 'div.cond-container' );
						var condId = $row.attr( 'id' );
						var cond = getConditionIndex()[condId];

						cond.device = parseInt( newDev );
						if ( -1 === cond.device ) {
							cond.devicename = "(self)";
						} else {
							var dobj = api.getDeviceObject( cond.device );
							cond.devicename = (dobj || {}).name;
						}
						delete cond.groupname;
						delete cond.groupid;
						configModified = true;

						/* Make a new service/variable menu and replace it on the row. */
						var newMenu = makeRSGroupMenu( cond );
						jQuery("select#grpmenu", $row).empty().append( newMenu.children() );

						updateConditionRow( $row ); /* pass it on */
					});

					updateCurrentServiceValue( container );
					break;

				case 'housemode':
					if ( isEmpty( cond.operator ) ) { cond.operator = "is"; }
					mm = jQuery('<select class="opmenu form-control form-control-sm"></select>');
					mm.append( '<option value="is">is any of</option>' );
					mm.append( '<option value="change">changes from</option>' );
					menuSelectDefaultFirst( mm, cond.operator );
					mm.on( 'change.reactor', handleConditionOperatorChange );
					container.append( mm );
					container.append( " " );
					// Checkboxes in their own fieldset
					var d = jQuery( '<fieldset id="housemodechecks" class="condfields form-inline"/>' );
					for ( k=1; k<=4; k++ ) {
						getCheckbox( cond.id + '-mode-' + k, k, houseModeName[k] || k, "hmode" )
							.appendTo( d );
					}
					container.append( d );
					jQuery( "input.hmode", container ).on( 'change.reactor', handleConditionRowChange );
					// Menus in a separate fieldset
					d = jQuery( '<fieldset id="housemodeselects" class="condfields"/>' );
					mm = jQuery( '<select class="form-control form-control-sm"/>' );
					mm.append( '<option value="">(any)</option>' );
					for ( k=1; k<=4; k++ ) {
						mm.append( jQuery( '<option/>' ).val(k).text( houseModeName[k] ) );
					}
					d.append( mm.clone().attr( 'id', 'frommode' ) );
					d.append( " to " );
					d.append( mm.attr( 'id', 'tomode' ) );
					container.append( d );
					jQuery( 'select#frommode,select#tomode', container).on( 'change.reactor', handleConditionRowChange );

					// Restore values and set up correct display.
					setUpConditionOpFields( container, cond );
					break;

				case 'weekday':
					container.append(
						'<select class="wdcond form-control form-control-sm"><option value="">Every</option><option value="1">First</option><option value="2">2nd</option><option value="3">3rd</option><option value="4">4th</option><option value="5">5th</option><option value="last">Last</option></select>');
					fs = jQuery( '<fieldset id="wdopts" />' );
					getCheckbox( cond.id + '-wd-1', '1', 'Sun', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-2', '2', 'Mon', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-3', '3', 'Tue', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-4', '4', 'Wed', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-5', '5', 'Thu', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-6', '6', 'Fri', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-7', '7', 'Sat', 'wdopt' ).appendTo( fs );
					fs.appendTo( container );
					menuSelectDefaultFirst( jQuery( 'select.wdcond', container ), cond.operator );
					(cond.value || "").split(',').forEach( function( val ) {
						jQuery('input.wdopt[value="' + val + '"]', container).prop('checked', true);
					});
					jQuery("input", container).on( 'change.reactor', handleConditionRowChange );
					jQuery("select.wdcond", container).on( 'change.reactor', handleConditionRowChange );
					break;

				case 'sun':
					container.append( makeDateTimeOpMenu( cond.operator ) );
					jQuery("select.opmenu", container).append('<option value="before">before</option>');
					jQuery("select.opmenu", container).append('<option value="after">after</option>');
					container.append('<fieldset id="start">' +
						'<select id="sunstart"></select> '+
						' offset&nbsp;<input type="text" id="startoffset" value="" class="tiny form-control form-control-sm" autocomplete="off">&nbsp;minutes' +
						'</fieldset>'
					);
					container.append('<fieldset id="end">&nbsp;and ' +
						'<select id="sunend"></select> '+
						' offset&nbsp;<input type="text" id="endoffset" value="" class="tiny form-control form-control-sm" autocomplete="off">&nbsp;minutes' +
						'</fieldset>'
					);
					mm = jQuery('<select class="form-control form-control-sm">' +
						'<option value="sunrise">Sunrise</option><option value="sunset">Sunset</option>' +
						'<option value="civdawn">Civil dawn</option><option value="civdusk">Civil dusk</option>' +
						'<option value="nautdawn">Nautical dawn</option><option value="nautdusk">Nautical dusk</option>' +
						'<option value="astrodawn">Astronomical dawn</option><option value="astrodusk">Astronomical dusk</option></select>'
						);
					jQuery('select#sunend', container).replaceWith( mm.clone().attr( 'id', 'sunend' ) );
					jQuery('select#sunstart', container).replaceWith( mm.attr( 'id', 'sunstart' ) );
					/* Restore. Condition first... */
					op = menuSelectDefaultFirst( jQuery("select.opmenu", container), cond.operator );
					jQuery("select.opmenu", container).on( 'change.reactor', handleConditionRowChange );
					if ( "bet" === op || "nob" === op ) {
						jQuery("fieldset#end", container).show();
					} else {
						jQuery("fieldset#end", container).hide();
					}
					/* Start */
					var vals = ( cond.value || "sunrise+0,sunset+0" ).split(/,/);
					k = vals[0].match( /^([^+-]+)(.*)/ );
					if ( k === null || k.length !== 3 ) {
						k = [ "", "sunrise", "0" ];
						configModified = true;
					}
					jQuery("select#sunstart", container).on( 'change.reactor', handleConditionRowChange ).val( k[1] );
					jQuery("input#startoffset", container).on( 'change.reactor', handleConditionRowChange ).val( k[2] );
					/* End */
					k = ( vals[1] || "sunset+0" ).match( /^([^+-]+)(.*)/ );
					if ( k === null || k.length !== 3 ) {
						k = [ "", "sunset", "0" ];
						configModified = true;
					}
					jQuery("select#sunend", container).on( 'change.reactor', handleConditionRowChange ).val( k[1] );
					jQuery("input#endoffset", container).on( 'change.reactor', handleConditionRowChange ).val( k[2] );
					break;

				case 'trange':
					container.append( makeDateTimeOpMenu( cond.operator ) );
					jQuery("select.opmenu", container).append('<option value="before">before</option>');
					jQuery("select.opmenu", container).append('<option value="after">after</option>');
					var months = jQuery('<select class="monthmenu form-control form-control-sm"><option value="">(any month)</option></select>');
					for ( k=1; k<=12; k++ ) {
						months.append('<option value="' + k + '">' + monthName[k] + ' (' + k + ')</option>');
					}
					var days = jQuery('<select class="daymenu form-control form-control-sm"><option value="">(any day)</option></select>');
					for ( k=1; k<=31; k++ ) {
						days.append('<option value="' + k + '">' + k + '</option>');
					}
					var hours = jQuery('<select class="hourmenu form-control form-control-sm"></select>');
					for ( k=0; k<24; k++ ) {
						var hh = k % 12;
						if ( hh === 0 ) {
							hh = 12;
						}
						hours.append('<option value="' + k + '">' + k + ' (' + hh + ( k < 12 ? "am" : "pm" ) + ')</option>');
					}
					var mins = jQuery('<select class="minmenu form-control form-control-sm"></select>');
					for ( var mn=0; mn<60; mn+=5 ) {
						mins.append('<option value="' + mn + '">:' + (mn < 10 ? '0' : '') + mn + '</option>');
					}
					container.append('<fieldset id="start" />').append('<fieldset id="end">&nbsp;and </fieldset>');
					jQuery("fieldset#start", container).append( months.clone() )
						.append( days.clone() )
						.append('<input type="text" placeholder="yyyy or blank" title="Leave blank for any year" class="year narrow datespec form-control form-control-sm" autocomplete="off">')
						.append( hours.clone() )
						.append( mins.clone() );
					jQuery("fieldset#end", container).append( months )
						.append( days )
						.append('<input type="text" placeholder="yyyy" class="year narrow datespec form-control form-control-sm" autocomplete="off">')
						.append( hours )
						.append( mins );
					/* Default all menus to first option */
					jQuery("select", container).each( function( ix, obj ) {
						jQuery(obj).val( jQuery("option:first", obj ).val() );
					});
					/* Restore values. */
					op = menuSelectDefaultFirst( jQuery( "select.opmenu", container ), cond.operator );
					if ( "bet" === op || "nob" === "op" ) {
						jQuery("fieldset#end", container).show();
					} else {
						jQuery("fieldset#end", container).hide();
					}
					var vlist = (cond.value || "").split(',');
					var flist = [ 'fieldset#start input.year', 'fieldset#start select.monthmenu','fieldset#start select.daymenu',
								  'fieldset#start select.hourmenu', 'fieldset#start select.minmenu',
								  'fieldset#end input.year','fieldset#end select.monthmenu', 'fieldset#end select.daymenu',
								  'fieldset#end select.hourmenu','fieldset#end select.minmenu'
					];
					for ( var fx=0; fx<flist.length; fx++ ) {
						if ( fx >= vlist.length ) {
							vlist[fx] = "";
						}
						if ( vlist[fx] !== "" ) {
							jQuery( flist[fx], container ).val( vlist[fx] );
						}
					}
					/* Enable date fields if month spec present */
					jQuery('.datespec', container).prop('disabled', vlist[1]==="");
					jQuery("select", container).on( 'change.reactor', handleConditionRowChange );
					jQuery("input", container).on( 'change.reactor', handleConditionRowChange );
					break;

				case 'interval':
					fs = jQuery( '<fieldset />' );
					el = jQuery( '<label for="days">every </label>' );
					el.append( '<input id="days" title="Enter an integer >= 0; hours and minutes must be 0!" value="0" class="tiny text-center form-control form-control-sm">' );
					el.append( ' days ' );
					fs.append( el );
					fs.append( " " );
					el = jQuery( '<label for="hours"> </label>' );
					el.append( '<input id="hours" title="Enter an integer >= 0" class="tiny text-center form-control form-control-sm">' );
					el.append( ' hours ' );
					fs.append( el );
					fs.append( " " );
					el = jQuery( '<label for="mins"> </label> ');
					el.append( '<input id="mins" title="Enter an integer >= 0" value="0" class="tiny text-center form-control form-control-sm">' );
					el.append( ' minutes ');
					fs.append( el );
					container.append( fs );
					container.append( " " );
					/* Interval relative time or condition (opposing fieldsets) */
					el = jQuery( '<label/>' ).text( " relative to ");
					mm = jQuery( '<select id="relto" class="form-control form-control-sm"/>' );
					mm.append( jQuery( '<option/>' ).val( "" ).text( "Time" ) );
					mm.append( jQuery( '<option/>' ).val( "condtrue" ).text( "Condition TRUE" ) );
					el.append( mm );
					fs = jQuery( '<fieldset />' ).attr( 'id', 'reltimeset' );
					mm = jQuery('<select id="relhour" class="form-control form-control-sm"/>');
					for ( k=0; k<24; k++ ) {
						v = ( k < 10 ? "0" : "" ) + String(k);
						mm.append( jQuery('<option/>').val( v ).text( v ) );
					}
					fs.append( mm );
					fs.append(" : ");
					mm = jQuery('<select id="relmin" class="form-control form-control-sm" />');
					for ( k=0; k<60; k+=5 ) {
						v = ( k < 10 ? "0" : "" ) + String(k);
						mm.append( jQuery('<option/>').val( v ).text( v ) );
					}
					fs.append( mm );
					el.append( fs );
					fs = jQuery( '<fieldset />' ).attr( 'id', 'relcondset' ).hide();
					mm = jQuery( '<select id="relcond" class="form-control form-control-sm" />' );
					mm.append( jQuery( '<option/>' ).val( "" ).text( '--choose--' ) );
					DOtraverse( getConditionIndex().root, function( n ) {
						mm.append( jQuery( '<option/>' ).val( n.id ).text( makeConditionDescription( n ) ) );
					}, false, function( n ) {
						return "comment" !== n.type && n.id != cond.id && !isAncestor( n.id, cond.id );
					});
					fs.append( mm );
					el.append( fs );
					/* Fin */
					container.append( jQuery( '<fieldset />' ).append( el ) );
					jQuery( "#days", container ).val( cond.days || 0 );
					jQuery( "#hours", container ).val( cond.hours===undefined ? 1 : cond.hours );
					jQuery( "#mins", container ).val( cond.mins || 0 );
					jQuery( "select#relto", container ).val( cond.relto || "" );
					if ( "condtrue" === cond.relto ) {
						/* Relative to condition */
						jQuery( "fieldset#relcondset", container ).show();
						jQuery( "fieldset#reltimeset", container ).hide();
						var t = cond.relcond || "";
						if ( 0 === jQuery( "select#relcond option[value='" + idSelector( t ) + "']", container ).length ) {
							jQuery( "select#relcond", container )
								.append( jQuery( '<option/>' ).val( t ).text( t + " (missing?)" ) );
						}
						jQuery( "#relcond", container ).val( t );
					} else {
						/* Relative to time (default) */
						if ( ! isEmpty( cond.basetime ) ) {
							mm = cond.basetime.split(/,/);
							menuSelectDefaultInsert( jQuery( '#relhour', container ), mm[0] || '00' );
							menuSelectDefaultInsert( jQuery( '#relmin', container ), mm[1] || '00' );
						}
					}
					jQuery("select,input", container).on( 'change.reactor', function( ev ) {
						var $el = jQuery( ev.currentTarget );
						var $row = $el.closest( 'div.cond-container' );
						if ( "relto" === $el.attr( 'id' ) ) {
							var relto = $el.val() || "";
							if ( "condtrue" === relto ) {
								jQuery( '#reltimeset', $row ).hide();
								jQuery( '#relcondset', $row ).show();
								/* Rebuild the menu of conditions, in case changed */
								var $mm = jQuery( 'select#relcond', $row );
								jQuery( 'option[value!=""]', $mm ).remove();
								DOtraverse( getConditionIndex().root, function( n ) {
									$mm.append( jQuery( '<option/>' ).val( n.id ).text( makeConditionDescription( n ) ) );
								}, false, function( n ) {
									return "comment" !== n.type && n.id != cond.id && !isAncestor( n.id, cond.id );
								});
								$mm.val( "" );
							} else {
								jQuery( '#reltimeset', $row ).show();
								jQuery( '#relcondset', $row ).hide();
							}
						}
						handleConditionRowChange( ev ); /* pass on */
					} );
					break;

				case 'ishome':
					container.append(
						'<select class="geofencecond form-control form-control-sm"><option value="is">Any selected user is home</option><option value="is not">Any selected user is NOT home</option><option value="at">User in geofence</option><option value="notat">User not in geofence</option></select>');
					mm = jQuery( '<select id="userid" class="form-control form-control-sm"/>' );
					mm.append( jQuery( '<option/>' ).val("").text('--choose user--') );
					fs = jQuery( '<fieldset id="geoquick" />' );
					for ( k in userIx ) {
						if ( userIx.hasOwnProperty( k ) ) {
							getCheckbox( cond.id + '-user-' + k, k, userIx[k].name || k, "useropt" )
								.appendTo( fs );
							mm.append( jQuery( '<option/>' ).val( k ).text( ( userIx[k] || {} ).name || k ) );
						}
					}
					container.append( fs );
					fs = jQuery( '<fieldset id="geolong" />' );
					fs.append( mm );
					fs.append( '<select id="location" class="form-control form-control-sm"/>' );
					container.append( fs );
					jQuery("input.useropt", container).on( 'change.reactor', handleConditionRowChange );
					jQuery("select.geofencecond", container)
						.on( 'change.reactor', handleGeofenceOperatorChange );
					op = menuSelectDefaultFirst( jQuery( "select.geofencecond", container ), cond.operator );
					jQuery("select#userid", container).on( 'change.reactor', handleGeofenceUserChange );
					jQuery("select#location", container).on( 'change.reactor', handleConditionRowChange );
					if ( op === "at" || op === "notat" ) {
						jQuery( 'fieldset#geoquick', container ).hide();
						jQuery( 'fieldset#geolong', container ).show();
						mm = ( cond.value || "" ).split(',');
						if ( mm.length > 0 ) {
							menuSelectDefaultInsert( jQuery( 'select#userid', container ), mm[0] );
							updateGeofenceLocations( container, mm[1] );
						}
					} else {
						jQuery( 'fieldset#geoquick', container ).show();
						jQuery( 'fieldset#geolong', container ).hide();
						(cond.value || "").split(',').forEach( function( val ) {
							if ( ! isEmpty( val ) ) {
								var $c = jQuery('input.useropt[value="' + val + '"]', container);
								if ( 0 === $c.length ) {
									$c = getCheckbox( cond.id + '-user-' + val, val, val + "?&nbsp;(unknown&nbsp;user)", "useropt" );
									$c.appendTo( jQuery( 'fieldset#geoquick', container ) );
								}
								$c.prop('checked', true);
							}
						});
					}
					break;

				case 'reload':
					/* no fields */
					break;

				default:
					/* nada */
			}

			/* Set up display of condition options. Not all conditions have
			 * options, and those that do don't have all options. Clear the UI
			 * each time, so it's rebuilt as needed. */
			jQuery( 'div.condopts', row ).remove();
			var btn = jQuery( 'button#condmore', row );
			if ( condOptions[ cond.type ] ) {
				btn.prop( 'disabled', false ).show();
				if ( hasAnyProperty( cond.options ) ) {
					btn.addClass( 'attn' );
				} else {
					btn.removeClass( 'attn' );
				}
			} else {
				btn.removeClass( 'attn' ).prop( 'disabled', true ).hide();
			}
		}

		/**
		 * Type menu selection change handler.
		 */
		function handleTypeChange( ev ) {
			var $el = jQuery( ev.currentTarget );
			var newType = $el.val();
			var $row = $el.closest( 'div.cond-container' );
			var condId = $row.attr( 'id' );
			var ixCond = getConditionIndex();

			if ( newType !== ixCond[condId].type ) {
				/* Change type */
				removeConditionProperties( ixCond[condId], "type" );
				ixCond[condId].type = newType;
				ixCond[condId].options = {}; /* must clear on type change */
				setConditionForType( ixCond[condId], $row );

				$row.addClass( 'tbmodified' );
				configModified = true;
				updateConditionRow( $row );
			}
		}

		/**
		 * Handle click on Add Condition button.
		 */
		function handleAddConditionClick( ev ) {
			var $el = jQuery( ev.currentTarget );
			var $parentGroup = $el.closest( 'div.cond-container' );
			var parentId = $parentGroup.attr( 'id' );

			/* Create a new condition in data, assign an ID */
			var cond = { id: getUID("cond"), type: "comment" }; // ???

			/* Insert new condition in UI */
			var condel = getConditionTemplate( cond.id );
			jQuery( 'select#condtype', condel ).val( cond.type );
			setConditionForType( cond, condel );
			jQuery( 'div.cond-list:first', $parentGroup ).append( condel );

			/* Add to data */
			var ixCond = getConditionIndex();
			var grp = ixCond[ parentId ];
			grp.conditions.push( cond );
			cond.__parent = grp;
			ixCond[ cond.id ] = cond;
			reindexConditions( grp );

			condel.addClass( 'tbmodified' );
			configModified = true;
			updateConditionRow( condel );

			jQuery( 'select#condtype', condel ).focus();
		}

		function handleTitleChange( ev ) {
			var input = jQuery( ev.currentTarget );
			var grpid = input.closest( 'div.cond-container.cond-group' ).attr( 'id' );
			var newname = (input.val() || "").trim();
			var span = jQuery( 'span#titletext', input.parent() );
			var grp = getConditionIndex()[grpid];
			input.removeClass( 'tberror' );
			if ( newname !== grp.name ) {
				/* Group name check */
				if ( newname.length < 1 ) {
					ev.preventDefault();
					jQuery( 'button#saveconf' ).prop( 'disabled', true );
					input.addClass( 'tberror' );
					input.focus();
					return;
				}

				/* Update config */
				input.closest( 'div.cond-group' ).addClass( 'tbmodified' );
				grp.name = newname;
				configModified = true;
			}

			/* Remove input field and replace text */
			input.remove();
			span.text( newname );
			span.closest( 'div.cond-group-title' ).children().show();
			updateSaveControls();
		}

		function handleTitleClick( ev ) {
			/* N.B. Click can be on span or icon */
			var $el = jQuery( ev.currentTarget );
			var $p = $el.closest( 'div.cond-group-title' );
			$p.children().hide();
			var grpid = $p.closest( 'div.cond-container.cond-group' ).attr( 'id' );
			var grp = getConditionIndex()[grpid];
			if ( grp ) {
				$p.append( jQuery( '<input class="titleedit form-control form-control-sm" title="Enter new group name">' )
					.val( grp.name || grp.id || "" ) );
				jQuery( 'input.titleedit', $p ).on( 'change.reactor', handleTitleChange )
					.on( 'blur.reactor', handleTitleChange );
			}
		}

		/**
		 * Handle click on group expand/collapse.
		 */
		function handleGroupExpandClick( ev ) {
			var $el = jQuery( ev.currentTarget );
			var $p = $el.closest( 'div.cond-container.cond-group' );
			var $l = jQuery( 'div.cond-group-body:first', $p );
			if ( "collapse" === $el.attr( 'id' ) ) {
				$l.slideUp();
				$el.attr( 'id', 'expand' ).attr( 'title', 'Expand group' );
				jQuery( 'i', $el ).text( 'expand_more' );
				try {
					var n = jQuery( 'div.cond-list:first > div', $p ).length;
					jQuery( 'span#titlemessage:first', $p ).text( " (" + n +
						" condition" + ( 1 !== n ? "s" : "" ) + " collapsed)" );
				} catch( e ) {
					jQuery( 'span#titlemessage:first', $p ).text( " (conditions collapsed)" );
				}
			} else {
				$l.slideDown();
				$el.attr( 'id', 'collapse' ).attr( 'title', 'Collapse group' );
				jQuery( 'i', $el ).text( 'expand_less' );
				jQuery( 'span#titlemessage:first', $p ).text( "" );
			}
		}

		/**
		 * Delete condition. If it's a group, delete it and all children
		 * recursively.
		 */
		function deleteCondition( condId, ixCond, cdata, pgrp, reindex ) {
			var ix;
			var cond = ixCond[condId];
			if ( undefined === cond ) return;
			pgrp = pgrp || cond.__parent;
			if ( undefined === reindex ) reindex = true;

			/* Remove references to this cond in sequences */
			for ( var ci in ixCond ) {
				if ( ixCond.hasOwnProperty( ci ) && (ixCond[ci].options || {}).after === condId ) {
					delete ixCond[ci].options.after;
					delete ixCond[ci].options.aftertime;
				}
			}

			/* If this condition is a group, delete all subconditions (recursively) */
			if ( "group" === ( cond.type || "group" ) ) {
				for ( ix=0; ix<(cond.conditions || []).length; ix++ ) {
					deleteCondition( cond.conditions[ix].id, ixCond, cdata, cond, false );
				}
				delete cond.conditions;

				/* Remove related activities */
				if ( (cond.activities || {})[condId + ".true"] ) {
					delete cond.activities[condId + ".true"];
				}
				if ( (cond.activities || {})[condId + ".false"] ) {
					delete cond.activities[condId + ".false"];
				}
			}

			/* Remove from index, and parent group, possibly reindex */
			pgrp.conditions.splice( cond.__index, 1 );
			delete ixCond[condId];
			if ( reindex ) {
				reindexConditions( pgrp );
			}

			configModified = true;
		}

		/**
		 * Handle delete group button click
		 */
		function handleDeleteGroupClick( ev ) {
			var $el = jQuery( ev.currentTarget );
			if ( $el.prop( 'disabled' ) || "root" === $el.attr( 'id' ) ) { return; }

			var $grpEl = $el.closest( 'div.cond-container.cond-group' );
			var grpId = $grpEl.attr( 'id' );

			var ixCond = getConditionIndex();
			var grp = ixCond[ grpId ];
			/* Confirm deletion only if group is not empty */
			if ( ( grp.conditions || [] ).length > 0 && ! confirm( 'This group has conditions and/or sub-groups, which will all be deleted as well. Really delete this group?' ) ) {
				return;
			}

			$grpEl.remove();
			deleteCondition( grpId, ixCond, getConfiguration(), grp.__parent, true );
			configModified = true;
			$el.closest( 'div.cond-container.cond-group' ).addClass( 'tbmodified' ); // ??? NO! Parent group!
			updateSaveControls();
		}

		/**
		 * Handle click on Add Group button.
		 */
		function handleAddGroupClick( ev ) {
			var $el = jQuery( ev.currentTarget );

			/* Create a new condition group div, assign a group ID */
			var newId = getUID("grp");
			var $condgroup = getGroupTemplate( newId );

			/* Create an empty condition group in the data */
			var $parentGroup = $el.closest( 'div.cond-container.cond-group' );
			var $container = jQuery( 'div.cond-list:first', $parentGroup );
			var parentId = $parentGroup.attr( 'id' );
			var ixCond = getConditionIndex();
			var grp = ixCond[ parentId ];
			var newgrp = { id: newId, name: newId, operator: "and", type: "group", conditions: [] };
			grp.conditions.push( newgrp );
			newgrp.__parent = grp;
			newgrp.__index = grp.conditions.length - 1; /* ??? for now */
			newgrp.__depth = ( grp.__depth || 0 ) + 1;
			ixCond[ newId ] = newgrp;

			/* Append the new condition group to the container */
			$container.append( $condgroup );
			$condgroup.addClass( 'level' + newgrp.__depth ).addClass( 'levelmod' + (newgrp.__depth % 4) );
			$condgroup.addClass( 'tbmodified' );

			configModified = true;
			updateSaveControls();
		}

		/**
		 * Handle click on the condition delete tool
		 */
		function handleConditionDelete( ev ) {
			var el = jQuery( ev.currentTarget );
			var row = el.closest( 'div.cond-container' );
			var condId = row.attr('id');

			if ( el.prop( 'disabled' ) ) { return; }

			/* See if the condition is referenced in a sequence */
			var okDelete = false;
			var ixCond = getConditionIndex();
			for ( var ci in ixCond ) {
				if ( ixCond.hasOwnProperty(ci) && ( ixCond[ci].options || {} ).after == condId ) {
					if ( !okDelete ) {
						if ( ! ( okDelete = confirm('This condition is used in sequence options in another condition. Click OK to delete it and disconnect the sequence, or Cancel to leave everything unchanged.') ) ) {
							return;
						}
					}
					delete ixCond[ci].options.after;
					delete ixCond[ci].options.aftertime;
				}
			}

			deleteCondition( condId, ixCond, getConfiguration(), ixCond[condId].__parent, true );

			/* Remove the condition row from display, reindex parent. */
			row.remove();

			el.closest( 'div.cond-container.cond-group' ).addClass( 'tbmodified' );
			configModified = true;
			updateSaveControls();
		}

		/**
		 * Receive a node at the end of a drag/drop (list-to-list move).
		 */
		function handleNodeReceive( ev, ui ) {
			var $el = jQuery( ui.item );
			var $target = jQuery( ev.target ); /* receiving .cond-list */
			// var $from = jQuery( ui.sender );
			var ixCond = getConditionIndex();

			/* Now, disconnect the data object from its current parent */
			var obj = ixCond[ $el.attr( 'id' ) ];
			obj.__parent.conditions.splice( obj.__index, 1 );
			reindexConditions( obj.__parent );

			/* Attach it to new parent. */
			var prid = $target.closest( 'div.cond-container.cond-group' ).attr( 'id' );
			var pr = ixCond[prid];
			pr.conditions.push( obj ); /* doesn't matter where we put it */
			obj.__parent = pr;
			/* Don't get fancy, just reindex as it now appears. */
			reindexConditions( pr );

			$el.addClass( 'tbmodified' ); /* ??? Is this really what we want to flag? */
			configModified = true;
			updateSaveControls();
		}

		function handleNodeUpdate( ev, ui ) {
			var $el = jQuery( ui.item );
			var $target = jQuery( ev.target ); /* receiving .cond-list */
			// var $from = jQuery( ui.sender );
			var ixCond = getConditionIndex();

			/* UI is handled, so just reindex parent */
			var prid = $target.closest( 'div.cond-container.cond-group' ).attr( 'id' );
			var pr = ixCond[prid];
			reindexConditions( pr );

			$el.addClass( 'tbmodified' ); /* ??? Is this really what we want to flag? */
			configModified = true;
			updateSaveControls();
		}

		/**
		 * Does activity have actions?
		 */
		function activityHasActions( act, cdata ) {
			var scene = (cdata.activities||{})[act];
			/* Check, first group has actions or delay > 0 */
			return scene && (scene.groups||[]).length > 0 && ( (scene.groups[0].actions||[]).length > 0 || (scene.groups[0].delay||0) > 0 );
		}

		/**
		 * Does group have activities?
		 */
		function groupHasActivities( grp, cdata ) {
			cdata = cdata || getConfiguration();
			return activityHasActions( grp.id+'.true', cdata ) || activityHasActions( grp.id+'.false', cdata );
		}

		/**
		 * Handle click on group controls (NOT/AND/OR/XOR/NUL)
		 */
		function handleGroupControlClick( ev ) {
			var $el = jQuery( ev.target );
			var action = $el.attr( 'id' );
			var grpid = $el.closest( 'div.cond-container.cond-group' ).attr( 'id' );
			var grp = getConditionIndex()[ grpid ];
			var cdata = getConfiguration();

			/* Special case handling for NUL--remove activities */
			if ( "nul" === action && groupHasActivities( grp, cdata ) ) {
				if ( ! confirm( 'This group currently has activities associated with it. Groups with the NUL operator do not run activities. OK to delete the associated activities?' ) ) {
					return;
				}
				delete cdata.activities[grpid+'.true'];
				delete cdata.activities[grpid+'.false'];
			}

			if ( $el.closest( '.btn-group' ).hasClass( 'tb-btn-radio' ) ) {
				$el.closest( '.btn-group' ).find( '.checked' ).removeClass( 'checked' );
				$el.addClass( 'checked' );
			} else {
				if ( $el.hasClass( "checked" ) ) {
					$el.removeClass( "checked" );
				} else {
					$el.addClass( "checked" );
				}
			}

			switch (action) {
				case 'not':
					grp.invert = $el.hasClass( "checked" );
					break;

				case 'and':
					grp.operator = "and";
					break;

				case 'or':
					grp.operator = "or";
					break;

				case 'xor':
					grp.operator = "xor";
					break;

				case 'nul':
					grp.operator = "nul";
					break;

				case 'disable':
					grp.disabled = $el.hasClass( 'checked' );
					break;

				default:
					/* nada */
			}

			if ( false === grp.disabled ) delete grp.disabled;
			if ( false === grp.invert ) delete grp.invert;

			$el.closest( 'div.cond-container.cond-group' ).addClass( 'tbmodified' );
			configModified = true;
			updateSaveControls();
		}

		/**
		 * Create an empty condition row. Only type selector is pre-populated.
		 */
		function getConditionTemplate( id ) {
			var el = jQuery( '\
<div class="cond-container cond-cond"> \
  <div class="pull-right cond-actions"> \
	  <button id="condmore" class="btn md-btn" title="Show condition options"><i class="material-icons">expand_more</i></button> \
	  <button class="btn md-btn draghandle" title="Move condition (drag)"><i class="material-icons">reorder</i></button> \
	  <button id="delcond" class="btn md-btn" title="Delete condition"><i class="material-icons">clear</i></button> \
  </div> \
  <div class="cond-body form-inline"> \
	<div class="cond-type"> \
	  <select id="condtype" class="form-control form-control-sm"><option value="">--choose--</option></select> \
	</div> \
	<div class="params" /> \
  </div> \
</div>' );

			[ "comment", "service", "grpstate", "housemode", "sun", "weekday", "trange", "interval", "ishome", "reload" ].forEach( function( k ) {
				if ( ! ( isOpenLuup && k == "ishome" ) ) {
					jQuery( "select#condtype", el ).append( jQuery( "<option/>" ).val( k ).text( condTypeName[k] ) );
				}
			});

			el.attr( 'id', id );
			jQuery('select#condtype', el).on( 'change.reactor', handleTypeChange );
			jQuery('button#delcond', el).on( 'click.reactor', handleConditionDelete );
			jQuery("button#condmore", el).on( 'click.reactor', handleExpandOptionsClick );
			return el;
		}

		function getGroupTemplate( grpid ) {
			var el = jQuery( '\
<div class="cond-container cond-group"> \
  <div class="cond-group-header"> \
	<div class="pull-right"> \
	  <button id="condmore" class="btn md-btn noroot" title="Show condition options"><i class="material-icons">expand_more</i></button> \
	  <button id="sortdrag" class="btn md-btn draghandle noroot" title="Move group (drag)"><i class="material-icons">reorder</i></button> \
	  <button id="delgroup" class="btn md-btn noroot" title="Delete group"><i class="material-icons">clear</i></button> \
	</div> \
	<div class="cond-group-conditions"> \
	  <div class="btn-group cond-group-control tb-tbn-check"> \
		<button id="not" class="btn btn-xs btn-primary" title="Invert the result of the AND/OR/XOR"> NOT </button> \
	  </div> \
	  <div class="btn-group cond-group-control tb-btn-radio"> \
		<button id="and" class="btn btn-xs btn-primary checked" title="AND means group is true only if all conditions/subgroups are true"> AND </button> \
		<button id="or" class="btn btn-xs btn-primary" title="OR means group is true if any child condition/subgroup is true"> OR </button> \
		<button id="xor" class="btn btn-xs btn-primary" title="XOR (exclusive or) means group is true if one and only one condition/subgroup is true"> XOR </button> \
		<button id="nul" class="btn btn-xs btn-primary" title="NUL means group does not affect logic state of parent group"> NUL </button> \
	  </div> \
	  <div class="btn-group cond-group-control tb-btn-check"> \
		<button id="disable" class="btn btn-xs btn-primary tb-disable" title="Disabled groups are ignored, as if they did not exist (conditions don\'t run)"> DISABLE </button> \
	  </div> \
	  <div class="cond-group-title"> \
		<span id="titletext" /> \
		<button id="edittitle" class="btn md-btn" title="Edit group name"><i class="material-icons">edit</i></button> \
		<button id="collapse" class="btn md-btn noroot" title="Collapse group"><i class="material-icons">expand_less</i></button> \
		<span id="titlemessage" /> \
	  </div> \
	</div> \
  </div> \
  <div class="error-container"></div> \
  <div class="cond-group-body"> \
	<div class="cond-list"></div> \
	<div class="cond-group-actions"> \
	  <button id="addcond" class="btn md-btn" title="Add condition to this group"><i class="material-icons">playlist_add</i></button> \
	  <button id="addgroup" class="btn md-btn" title="Add subgroup to this group"><i class="material-icons">library_add</i></button> \
	</div> \
  </div> \
</div>' );
			el.attr('id', grpid);
			jQuery( 'span#titletext', el ).text( grpid );
			jQuery( 'div.cond-group-conditions input[type="radio"]', el ).attr('name', grpid);
			if ( 'root' === grpid ) {
				/* Can't delete root group, but use the space for Save and Revert */
				jQuery( 'button#delgroup', el ).replaceWith(
					jQuery( '<button id="saveconf" class="btn btn-xs btn-success"> Save </button> <button id="revertconf" class="btn btn-xs btn-danger"> Revert </button>' )
				);

				/* For root group, remove all elements with class noroot */
				jQuery( '.noroot', el ).remove();
			}
			jQuery( 'button#addcond', el ).on( 'click.reactor', handleAddConditionClick );
			jQuery( 'button#addgroup', el ).on( 'click.reactor', handleAddGroupClick );
			jQuery( 'button#delgroup', el ).on( 'click.reactor', handleDeleteGroupClick );
			jQuery( 'button#condmore', el).on( 'click.reactor', handleExpandOptionsClick );
			jQuery( 'span#titletext,button#edittitle', el ).on( 'click.reactor', handleTitleClick );
			jQuery( 'button#collapse', el ).on( 'click.reactor', handleGroupExpandClick );
			jQuery( '.cond-group-control > button', el ).on( 'click.reactor', handleGroupControlClick );
			jQuery( '.cond-list', el ).addClass("tb-sortable").sortable({
				helper: 'clone',
				handle: '.draghandle',
				cancel: '', /* so draghandle can be button */
				items: '> *:not([id="root"])',
				// containment: 'div.cond-list.tb-sortable',
				connectWith: 'div.cond-list.tb-sortable',
				/* https://stackoverflow.com/questions/15724617/jQuery-dragmove-but-leave-the-original-if-ctrl-key-is-pressed
				start: function( ev, ui ) {
					if ( ev.ctrlKey ) {
						$clone = ui.item.clone().insertBefore( ui.item );
						$clone.css({position:"static"});
					}
				},
				*/
				receive: handleNodeReceive, /* between cond-lists */
				update: handleNodeUpdate    /* within one cond-list */
			});
			return el;
		}

		function redrawGroup( myid, grp, container, depth ) {
			container = container || jQuery( 'div#conditions' );
			depth = depth || 0;

			var el = getGroupTemplate( grp.id );
			container.append( el );

			el.addClass( 'level' + depth ).addClass( 'levelmod' + (depth % 4) );
			jQuery( 'span#titletext', el ).text( grp.name || grp.id ).attr( 'title', msgGroupIdChange );
			jQuery( 'div.cond-group-conditions .tb-btn-radio button', el ).removeClass( "checked" );
			jQuery( 'div.cond-group-conditions .tb-btn-radio button#' + ( grp.operator || "and" ), el ).addClass( "checked" );
			if ( grp.invert ) {
				jQuery( 'div.cond-group-conditions button#not', el ).addClass( "checked" );
			} else { delete grp.invert; }
			if ( grp.disabled ) {
				jQuery( 'div.cond-group-conditions button#disable', el ).addClass( "checked" );
			} else { delete grp.disabled; }
			if ( grp.options && hasAnyProperty( grp.options ) ) {
				jQuery( 'button#condmore', el ).addClass( 'attn' );
			}

			container = jQuery( 'div.cond-list', el );

			for ( var ix=0; ix<(grp.conditions || []).length; ix++ ) {
				var cond = grp.conditions[ix];
				if ( "group" !== ( cond.type || "group" ) ) {
					var row = getConditionTemplate( cond.id );
					container.append( row );

					var sel = jQuery('select#condtype', row);
					if ( jQuery('option[value="' + cond.type + '"]', sel).length === 0 ) {
						/* Condition type not on menu, probably a deprecated form. Insert it. */
						sel.append('<option value="' + cond.type + '">' +
							(condTypeName[cond.type] === undefined ? cond.type + ' (deprecated)' : condTypeName[cond.type] ) +
							'</option>');
					}
					jQuery('select#condtype', row).val( cond.type );
					setConditionForType( cond, row );
				} else {
					/* Group! */
					redrawGroup( myid, cond, container, depth + 1 );
				}
			}
		}

		/**
		 * Redraw the conditions from the current cdata
		*/
		function redrawConditions( myid ) {
			var container = jQuery("div#conditions");
			container.empty();

			var cdata = getConfiguration( myid );
			redrawGroup( myid, cdata.conditions.root );

			jQuery("button#saveconf").on( 'click.reactor', handleSaveClick );
			jQuery("button#revertconf").on( 'click.reactor', handleRevertClick );

			updateSaveControls();

			/* Clear unused state variables here so that we catch ReactorGroup
			 * service, for which the function requires ixCond. */
			clearUnusedStateVariables( myid, cdata );
		}

		/* Public interface */
		console.log("Initializing ConditionBuilder module");
		myModule = {
			init: function( dev ) {
				return initModule( dev );
			},
			start: redrawConditions,
			redraw: redrawConditions,
			makeVariableMenu: makeVariableMenu
		};
		return myModule;

	})( api, jQuery );

	function doConditions()
	{
		console.log("doConditions()");
		try {
			if ( configModified && confirm( msgUnsavedChanges) ) {
				handleSaveClick( undefined );
			}

			var myid = api.getCpanelDeviceId();

			if ( ! CondBuilder.init( myid ) ) {
				return;
			}

			header();

			/* Our styles. */
			var html = "<style>";
			html += 'div#tab-conds.reactortab div#conditions { width: 100%; }';
			html += 'div#tab-conds.reactortab .cond-group { position: relative; margin: 4px 0; border-radius: 4px; padding: 5px; border: 1px solid #EEE; background: rgba(255, 255, 255, 0.9); }';
			html += 'div#tab-conds.reactortab .cond-group { padding: 10px; padding-bottom: 6px; border: 1px solid #0c6099; background: #bce8f1; }';
			html += 'div#tab-conds.reactortab .cond-group.levelmod1 { background-color: #faebcc; }';
			html += 'div#tab-conds.reactortab .cond-group.levelmod2 { background-color: #d6e9c6; }';
			html += 'div#tab-conds.reactortab .cond-group.levelmod3 { background-color: #ebccd1; }';
			html += 'div#tab-conds.reactortab .cond-cond { position: relative; margin: 4px 0; border-radius: 4px; padding: 5px; border: 1px solid #0c6099; background: #fff; }';
			html += 'div#tab-conds.reactortab .cond-group-header { margin-bottom: 10px; }';
			html += 'div#tab-conds.reactortab .cond-group-actions { margin-left: 15px; margin-bottom: 8px; }';
			html += 'div#tab-conds.reactortab .cond-list { list-style: none; padding: 0 0 0 15px; margin: 0; min-height: 24px; }';
			html += 'div#tab-conds.reactortab .error-container { display: none; cursor: help; color: #F00; }';
			html += '.cond-list > *:not(.ui-draggable-dragging)::before, .cond-list > *:not(.ui-draggable-dragging)::after { content: "";  position: absolute; left: -12px; width: 12px; height: calc(50% + 4px); border-color: #333333; border-style: solid; }';
			html += '.cond-list > *:not(.ui-draggable-dragging)::before { top: -4px; border-width: 0 0 2px 2px; }';
			html += '.cond-list > *:not(.ui-draggable-dragging)::after { top: 50%; border-width: 0 0 0 2px; }';
			html += '.cond-list > *:not(.ui-draggable-dragging):first-child::before { top: -12px; height: calc(50% + 14px); }';
			html += '.cond-list > *:not(.ui-draggable-dragging):last-child::before {  border-radius: 0 0 0 4px; }';
			html += '.cond-list > *:not(.ui-draggable-dragging):last-child::after { display: none; }';
			html += 'div#tab-conds.reactortab .cond-group-title { display: inline-block; }';
			html += 'div#tab-conds.reactortab .cond-group-title span#titletext { padding: 0 4px; font-size: 16px; font-weight: bold; color: #036; }';
			html += 'div#tab-conds.reactortab .btn.checked { background-color: #5cb85c; }';
			html += 'div#tab-conds.reactortab .btn.tb-disable.checked { background-color: #d9534f; }';

			html += 'div#tab-conds.reactortab div.cond-group.tbmodified:not(.tberror) { }';
			html += 'div#tab-conds.reactortab div.cond-group.tberror { border-left: 4px solid red; }';
			html += 'div#tab-conds.reactortab div.cond-cond.tbmodified:not(.tberror) { }';
			html += 'div#tab-conds.reactortab div.cond-cond.tberror { border-left: 4px solid red; }';
			html += 'div#tab-conds.reactortab div.condopts { padding-left: 32px; }';
			html += 'div#tab-conds.reactortab div.cond-type { display: inline-block; vertical-align: top; }';
			html += 'div#tab-conds.reactortab div.params { display: inline-block; clear: right; }';
			html += 'div#tab-conds.reactortab div.params fieldset { display: inline-block; border: none; margin: 0 4px; padding: 0 0; }';

			html += 'div#tab-conds.reactortab div#eventlist { display: inline-block; }';
			html += 'div#tab-conds.reactortab div#eventlist button { padding: 6px 4px; }';
			html += 'div#tab-conds.reactortab div#eventlist button i { font-size: 16pt; color: #666; vertical-align:middle; }';
			html += 'div#tab-conds.reactortab div#currval { font-family: "Courier New", Courier, monospace; font-size: 0.9em; margin: 8px 0px; display: block; }';
			html += 'div#tab-conds.reactortab div.warning { color: red; }';
			html += 'div#tab-conds.reactortab button.md-btn.attn { background-color: #ffff80; }';
			html += 'div#tab-conds.reactortab button.md-btn.draghandle { cursor: grab; }';
			html += 'div#tab-conds.reactortab div.tboptgroup { background: #fff; border: 1px solid grey; border-radius: 12px; padding: 12px 12px; }';
			// html += 'div#tab-conds.reactortab div#outputopt { }';
			html += 'div#tab-conds.reactortab div#restrictopt { margin-top: 4px; }';
			html += 'div#tab-conds.reactortab div.opttitle { font-size: 1.15em; font-weight: bold; }';
			html += 'div#tab-conds.reactortab fieldset.condfields { display: inline-block; }';
			html += 'div#tab-conds.reactortab input.titleedit { font-size: 12px; height: 24px; }';
			html += "</style>";
			jQuery("head").append( html );

			/* Body content */
			html = '<div id="tab-conds" class="reactortab">';
			html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Conditions</h3></div></div>';

			var rr = api.getDeviceState( myid, serviceId, "Retrigger" ) || "0";
			if ( rr !== "0" ) {
				html += '<div class="row"><div class="warning col-xs-12 col-sm-12">WARNING! Retrigger is on! You should avoid using time-related conditions in this ReactorSensor, as they may cause retriggers frequent retriggers!</div></div>';
			}

			html += '<div id="conditions"/>';

			html += '</div>'; /* #tab-conds */

			html += footer();

			api.setCpanelContent(html);

			/* Set up a data list with our variables */
			var cd = getConfiguration( myid );
			var dl = jQuery('<datalist id="reactorvarlist"></datalist>');
			if ( cd.variables ) {
				for ( var vname in cd.variables ) {
					if ( cd.variables.hasOwnProperty( vname ) ) {
						var opt = jQuery( '<option/>' ).val( '{'+vname+'}' ).text( '{'+vname+'}' );
						dl.append( opt );
					}
				}
			}
			jQuery( 'div#tab-conds.reactortab' ).append( dl );

			CondBuilder.start( myid );
		}
		catch (e)
		{
			console.log( 'Error in ReactorSensor.doConditions(): ' + String( e ) );
			alert( e.stack );
		}
	}

/** ***************************************************************************
 *
 * E X P R E S S I O N S
 *
 ** **************************************************************************/

	function updateVariableControls() {
		var container = jQuery('div#reactorvars');
		var errors = jQuery('.tberror', container);
		jQuery("button#saveconf", container).prop('disabled', ! ( configModified && errors.length === 0 ) );
		jQuery("button#revertconf", container).prop('disabled', !configModified);
	}

	function handleVariableChange( ev ) {
		var container = jQuery('div#reactorvars');
		var cd = getConfiguration();

		jQuery('.tberror', container).removeClass( 'tberror' );
		jQuery('div.varexp', container).each( function( ix, obj ) {
			var row = jQuery(obj);
			var vname = row.attr("id");
			if ( undefined === vname ) return;
			var expr = ( jQuery('textarea.expr', row).val() || "" ).trim();
			expr = expr.replace( /^=+\s*/, "" ); /* Remove leading =, this isn't Excel people */
			jQuery( 'textarea.expr', row ).val( expr );
			if ( cd.variables[vname] === undefined ) {
				cd.variables[vname] = { name: vname, expression: expr, index: ix };
				configModified = true;
			} else {
				if ( cd.variables[vname].expression !== expr ) {
					cd.variables[vname].expression = expr;
					configModified = true;
				}
				if ( cd.variables[vname].index !== ix ) {
					cd.variables[vname].index = ix;
					configModified = true;
				}
			}
			var exp = jQuery( 'button#export', row ).hasClass( 'attn' ) ? undefined : 0;
			if ( cd.variables[vname].export !== exp ) {
				if ( 0 === exp ) {
					cd.variables[vname].export = 0;
				} else {
					delete cd.variables[vname].export; /* default is export */
				}
				configModified = true;
			}
		});

		updateVariableControls();
	}

	function handleTryExprClick( ev ) {
		var row = jQuery( ev.currentTarget ).closest( "div.varexp" );
		jQuery.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "lr_Reactor",
				action: "tryexpression",
				device: api.getCpanelDeviceId(),
				expr: jQuery( 'textarea.expr', row ).val() || ""
			},
			dataType: "json",
			timeout: 5000
		}).done( function( data, statusText, jqXHR ) {
			var msg;
			if ( data.err ) {
				msg = 'There is an error in the expression';
				if ( data.err.location ) {
					jQuery('textarea.expr', row).focus().prop('selectionStart', data.err.location);
					msg += ' at ' + String( data.err.location );
				}
				msg += ': ' + data.err.message;
			} else {
				msg = "The expression result is: " + String( data.resultValue ) + ' (' + typeof( data.resultValue ) + ')';
			}
			alert( msg );
		}).fail( function( jqXHR ) {
			alert( "There was an error making the request. Vera may be busy; try again in a moment." );
		});
	}

	function handleDeleteVariableClick( ev ) {
		var row = jQuery( ev.currentTarget ).closest( 'div.varexp' );
		var vname = row.attr('id');
		if ( confirm( 'Deleting "' + vname + '" will break conditions, actions, or other expressions that use it.' ) ) {
			var cdata = getConfiguration();
			delete cdata.variables[vname];
			row.remove();
			configModified = true;
			updateVariableControls();
		}
	}

	function clearGetStateOptions() {
		var container = jQuery('div#reactorvars');
		var row = jQuery( 'div#opt-state', container );
		row.remove();
		jQuery( 'button#addvar', container ).prop( 'disabled', false );
		jQuery( 'textarea.expr,button.md-btn', container ).prop( 'disabled', false );
	}

	function handleGetStateClear( ev ) {
		clearGetStateOptions();
	}

	function handleGetStateInsert( ev ) {
		var row = jQuery( ev.currentTarget ).closest( 'div.row' );

		var device = jQuery( 'select#gsdev', row ).val() || "-1";
		var service = jQuery( 'select#gsvar', row ).val() || "";
		var variable = service.replace( /^[^\/]+\//, "" );
		service = service.replace( /\/.*$/, "" );
		if ( "-1" === device ) {
			device = "null";
		} else if ( jQuery( 'input#usename', row ).prop( 'checked' ) ) {
			device = '"' + jQuery( 'select#gsdev option:selected' ).text().replace( / +\(#\d+\)$/, "" ) + '"';
		}
		var str = ' getstate( ' + device + ', "' + service + '", "' + variable + '" ) ';

		var varrow = row.prev();
		var f = jQuery( 'textarea.expr', varrow );
		var expr = f.val() || "";
		var p = f.get(0).selectionEnd || -1;
		if ( p >= 0 ) {
			expr = expr.substring(0, p) + str + expr.substring(p);
		} else {
			expr = str + expr;
		}
		expr = expr.trim();
		f.val( expr );
		f.removeClass( 'tberror' );
		var vname = varrow.attr("id");
		var cd = getConfiguration();
		if ( cd.variables[vname] === undefined ) {
			cd.variables[vname] = { name: vname, expression: expr };
		} else {
			cd.variables[vname].expression = expr;
		}
		configModified = true;

		clearGetStateOptions();
		updateVariableControls();
	}

	function handleGetStateOptionChange( ev ) {
		var row = jQuery( ev.currentTarget ).closest( 'div.row' );
		var f = jQuery( ev.currentTarget );
		if ( f.attr( 'id' ) == "gsdev" ) {
			var device = parseInt( f.val() || "-1" );
			var s = CondBuilder.makeVariableMenu( device, "", "" ).attr( 'id', 'gsvar' );
			jQuery( 'select#gsvar', row ).replaceWith( s );
			/* Switch to new varmenu */
			f = jQuery( 'select#gsvar', row );
			f.on( 'change.reactor', handleGetStateOptionChange );
		}
		jQuery( 'button#getstateinsert', row ).prop( 'disabled', "" === f.val() );
	}

	function handleGetStateClick( ev ) {
		var row = jQuery( ev.currentTarget ).closest( 'div.varexp' );
		var container = jQuery('div#reactorvars');

		jQuery( 'button#addvar', container ).prop( 'disabled', true );
		jQuery( 'button.md-btn', container ).prop( 'disabled', true );
		jQuery( 'textarea.expr', row ).prop( 'disabled', false );

		var el = jQuery( '<div class="col-xs-12 col-md-9 col-md-offset-2 form-inline" />' );
		el.append( makeDeviceMenu( "", "" ).attr( 'id', 'gsdev' ) );
		el.append( CondBuilder.makeVariableMenu( parseInt( jQuery( 'select#gsdev', el ).val() ), "", "" )
			.attr( 'id', 'gsvar' ) );
		el.append(' ');
		el.append( '<label class="checkbox-inline" for="usename"><input id="usename" type="checkbox">&nbsp;Use&nbsp;Name</label>' );
		el.append(' ');
		el.append( jQuery( '<button/>' ).attr( 'id', 'getstateinsert' )
			.addClass( "btn btn-xs btn-success" )
			.text( 'Insert' ) );
		el.append( jQuery( '<button/>' ).attr( 'id', 'getstatecancel' )
			.addClass( "btn btn-xs btn-default" )
			.text( 'Cancel' ) );
		jQuery( '<div id="opt-state" class="row" />' ).append( el ).insertAfter( row );

		jQuery( 'select.devicemenu', el ).on( 'change.reactor', handleGetStateOptionChange );
		jQuery( 'button#getstateinsert', el ).prop( 'disabled', true )
			.on( 'click.reactor', handleGetStateInsert );
		jQuery( 'button#getstatecancel', el ).on( 'click.reactor', handleGetStateClear );
		jQuery( 'button#saveconf' ).prop( 'disabled', true );
	}

	function handleExportClick( ev ) {
		var $el = jQuery( ev.currentTarget );
		if ( $el.hasClass( 'attn' ) ) {
			/* Turn off export */
			$el.removeClass( 'attn' ).attr( 'title', 'Result not exported to state variable' );
		} else {
			$el.addClass( 'attn' ).attr( 'title', 'Result exports to state variable' );
		}
		/* Pass it on */
		handleVariableChange( ev );
	}

	function getVariableRow() {
		var el = jQuery('<div class="row varexp"></div>');
		el.append( '<div id="varname" class="col-xs-12 col-sm-12 col-md-2"></div>' );
		el.append( '<div class="col-xs-12 col-sm-9 col-md-8"><textarea class="expr form-control form-control-sm" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="off"/><div id="currval" /></div>' );
		// ??? devices_other is an alternate for insert state variable
		el.append( '<div class="col-xs-12 col-sm-3 col-md-2 text-right">\
<button class="btn md-btn draghandle" title="Change order (drag)"><i class="material-icons">reorder</i></button>\
<button id="export" class="btn md-btn" title="Result exports to state variable"><i class="material-icons">import_export</i></button>\
<button id="tryexpr" class="btn md-btn" title="Try this expression"><i class="material-icons">directions_run</i></button>\
<button id="getstate" class="btn md-btn" title="Insert device state variable value"><i class="material-icons">memory</i></button>\
<button id="deletevar" class="btn md-btn" title="Delete this variable"><i class="material-icons">clear</i></button>\
</div>' );
		jQuery( 'textarea.expr', el ).prop( 'disabled', true ).on( 'change.reactor', handleVariableChange );
		jQuery( 'button#export', el ).prop( 'disabled', true ).on( 'click.reactor', handleExportClick );
		jQuery( 'button#tryexpr', el ).prop( 'disabled', true ).on( 'click.reactor', handleTryExprClick );
		jQuery( 'button#getstate', el ).prop( 'disabled', true ).on( 'click.reactor', handleGetStateClick );
		jQuery( 'button#deletevar', el ).prop( 'disabled', true ).on( 'click.reactor', handleDeleteVariableClick );
		jQuery( 'button.draghandle', el ).prop( 'disabled', true );
		return el;
	}

	function handleAddVariableClick() {
		var container = jQuery('div#reactorvars');

		jQuery( 'button#addvar', container ).prop( 'disabled', true );
		jQuery( 'div.varexp textarea.expr,button.md-btn', container ).prop( 'disabled', true );

		var editrow = getVariableRow();
		jQuery( 'div#varname', editrow ).empty().append( '<input class="form-control form-control-sm" title="Enter a variable name and then TAB out of the field.">' );
		jQuery( 'div#varname input', editrow ).on('change.reactor', function( ev ) {
			/* Convert to regular row */
			var f = jQuery( ev.currentTarget );
			var row = f.closest( 'div.varexp' );
			var vname = (f.val() || "").trim();
			if ( vname === "" || jQuery( 'div.varexp#' + idSelector( vname ) ).length > 0 || !vname.match( /^[A-Z][A-Z0-9_]*$/i ) ) {
				row.addClass( 'tberror' );
				f.addClass('tberror');
				f.focus();
			} else {
				row.attr('id', vname).removeClass('editrow').removeClass('tberror');
				jQuery( '.tberror', row ).removeClass('tberror');
				/* Remove the name input field and swap in the name (text) */
				f.parent().empty().text(vname);
				/* Re-enable fields and add button */
				jQuery( 'button#addvar', container ).prop( 'disabled', false );
				jQuery( 'button.md-btn', container ).prop('disabled', false);
				jQuery( 'textarea.expr', container ).prop( 'disabled', false );
				jQuery( 'textarea.expr', row ).focus();
				/* Do the regular stuff */
				handleVariableChange( null );
			}
		});
		jQuery( 'div.varlist', container ).append( editrow );
		jQuery( 'div#varname input', editrow ).focus();
	}

	function handleVariableSaveClick( ev ) {
		try {
			var myid = api.getCpanelDeviceId();
			var cdata = getConfiguration( myid );
			for ( var vn in ( cdata.variables || {} ) ) {
				if ( cdata.variables.hasOwnProperty( vn ) ) {
					if ( 0 !== cdata.variables[vn].export ) {
						api.setDeviceStateVariablePersistent( myid, "urn:toggledbits-com:serviceId:ReactorValues", vn, "" );
						api.setDeviceStateVariablePersistent( myid, "urn:toggledbits-com:serviceId:ReactorValues", vn + "_Error", "Not yet initialized" );
					}
				}
			}
		} catch( e ) {
			console.log(String(e));
		}
		return handleSaveClick( ev );
	}

	/**
	 * Redraw variables and expressions.
	*/
	function redrawVariables() {
		var container = jQuery('div#tab-vars.reactortab div#reactorvars');
		container.empty();
		var gel = jQuery('<div class="vargroup"></div>');
		gel.append('<div class="row"><div class="tblisttitle col-xs-6 col-sm-6"><span class="titletext">Defined Variables</span></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button id="saveconf" class="btn btn-xs btn-success">Save</button> <button id="revertconf" class="btn btn-xs btn-danger">Revert</button></div></div>');

		var list = jQuery( '<div class="varlist tb-sortable" />' );
		gel.append( list );

		var myid = api.getCpanelDeviceId();
		var cdata = getConfiguration( myid );

		var s = api.getDeviceState( myid, serviceId, "cstate" ) || "";
		var cstate = {};
		if ( ! isEmpty( s ) ) {
			try {
				cstate = JSON.parse( s );
			} catch (e) {
				console.log("cstate cannot be parsed: " + String(e));
			}
		} else {
			console.log("cstate unavailable");
		}
		var csvars = cstate.vars || {};

		/* Create a list of variables by index, sorted. cdata.variables is a map/hash,
		   not an array */
		var vix = [];
		for ( var vn in ( cdata.variables || {} ) ) {
			if ( cdata.variables.hasOwnProperty( vn ) ) {
				var v = cdata.variables[vn];
				vix.push( v );
			}
		}
		vix.sort( function( a, b ) {
			var i1 = a.index || -1;
			var i2 = b.index || -1;
			if ( i1 === i2 ) return 0;
			return ( i1 < i2 ) ? -1 : 1;
		});
		for ( var ix=0; ix<vix.length; ix++ ) {
			var vd = vix[ix];
			var el = getVariableRow();
			el.attr( 'id', vd.name );
			jQuery( 'div#varname', el).text( vd.name );
			jQuery( 'textarea.expr', el ).val( vd.expression ).prop( 'disabled', false );
			jQuery( 'button.md-btn', el ).prop( 'disabled', false );
			var blk = jQuery( 'div#currval', el ).empty();
			if ( csvars[ vd.name ] && undefined !== csvars[ vd.name ].lastvalue ) {
				var vs = csvars[ vd.name ];
				if ( null === vs.lastvalue ) {
					blk.text( 'Last result: (null)' ).attr( 'title', 'This variable has an empty/null value' );
				} else {
					var val = JSON.stringify( vs.lastvalue );
					var abbrev = val.length > 64 ? val.substring(0,61) + '...' : val;
					blk.text( 'Last result: ' + abbrev ).attr( 'title', ""===val ? "(empty string)" : val );
				}
			} else {
				blk.text( '(expression has not yet been evaluated or caused an error)' ).attr( 'title', "" );
			}
			if ( 0 !== vd.export ) {
				jQuery( 'button#export', el ).addClass( 'attn' );
			}
			list.append( el );
		}

		/* Add "Add" button */
		gel.append('<div class="row buttonrow">' +
			'<div class="col-xs-12 col-sm-12"><button id="addvar" class="btn btn-sm btn-success">Add Variable/Expression</button> Need help? Check out the <a href="https://github.com/toggledbits/Reactor/wiki/Expressions-&-Variables" target="_blank">documentation</a> or ask in the <a href="https://community.getvera.com/c/plugins-amp-plugin-development/reactor" target="_blank">Vera community forums</a>.</div>' +
			'</div>');

		/* Append the group */
		container.append(gel);

		list.sortable({
			vertical: true,
			containment: 'div.varlist',
			helper: "clone",
			handle: ".draghandle",
			cancel: "", /* so draghandle can be button */
			update: handleVariableChange
		});


		jQuery("button#addvar", container).on( 'click.reactor', handleAddVariableClick );
		jQuery("button#saveconf", container).on( 'click.reactor', handleVariableSaveClick );
		jQuery("button#revertconf", container).on( 'click.reactor', handleRevertClick );

		updateVariableControls();
	}

	function doVariables()
	{
		console.log("doVariables()");
		try {
			/* Make sure changes are saved. */
			if ( configModified && confirm( msgUnsavedChanges ) ) {
				handleSaveClick( undefined );
			}

			if ( ! initModule() ) {
				return;
			}

			header();

			/* Our styles. */
			var html = "<style>";
			html += "div#tab-vars.reactortab .color-green { color: #006040; }";
			html += 'div#tab-vars.reactortab button.md-btn.draghandle { cursor: grab; }';
			html += 'div#tab-vars.reactortab div.tblisttitle { background-color: #444444; color: #fff; padding: 8px; min-height: 42px; }';
			html += 'div#tab-vars.reactortab div.tblisttitle span.titletext { font-size: 16px; font-weight: bold; margin-right: 4em; }';
			html += 'div#tab-vars.reactortab div.vargroup { border-radius: 8px; border: 2px solid #444444; margin-bottom: 8px; }';
			html += 'div#tab-vars.reactortab div.vargroup .row { margin-right: 0px; margin-left: 0px; }';
			html += 'div#tab-vars.reactortab div.vargroup div.var:nth-child(odd) { background-color: #efefef; }';
			html += 'div#tab-vars.reactortab div.varexp,div.buttonrow { padding: 8px; }';
			html += 'div#tab-vars.reactortab div.varexp.tbmodified:not(.tberror) { border-left: 4px solid green; }';
			html += 'div#tab-vars.reactortab div.varexp.tberror { border-left: 4px solid red; }';
			html += 'div#tab-vars.reactortab textarea.expr { font-family: monospace; resize: vertical; width: 100% !important; }';
			html += 'div#tab-vars.reactortab div.varexp { cursor: default; margin: 2px 0 2px 0; }';
			html += 'div#tab-vars.reactortab div#varname:after { content: " ="; }';
			html += 'div#tab-vars.reactortab div#currval { font-family: "Courier New", Courier, monospace; font-size: 0.9em; }';
			html += 'div#tab-vars.reactortab button.md-btn.attn { background-color: #bf9; box-shadow: none; }';
			html += "</style>";
			jQuery("head").append( html );

			/* Body content */
			html = '<div id="tab-vars" class="reactortab">';
			html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Expressions/Variables</h3></div></div>';
			html += '<div class="row"><div class="col-xs-12 col-sm-12">Expressions allow you to do complex arithmetic, string, and other operations that otherwise cannot be done in the Conditions editor. When you create an expression, you specify a variable name into which its result is stored. You can then use that variable name in your conditions and activities.</div></div>';

			html += '<div id="reactorvars"/>';

			html += '</div>'; //.reactortab

			html += footer();

			api.setCpanelContent(html);

			redrawVariables();
		}
		catch (e)
		{
			console.log( 'Error in ReactorSensor.doVariables(): ' + String( e ) );
			alert( e.stack );
		}
	}


 /** ***************************************************************************
 *
 * A C T I V I T I E S
 *
 ** **************************************************************************/

	function testLua( lua, el, row ) {
		$.ajax({
			url: api.getDataRequestURL(),
			method: 'POST', /* data could be long */
			data: {
				id: "lr_Reactor",
				action: "testlua",
				lua: lua
			},
			cache: false,
			dataType: 'json',
			timeout: 5000
		}).done( function( data, statusText, jqXHR ) {
			if ( data.status ) {
				/* Good Lua */
				return;
			} else if ( data.status === false ) { /* specific false, not undefined */
				el.addClass( "tberror" );
				jQuery( 'div.actiondata' , row ).prepend( '<div class="tberrmsg"/>' );
				jQuery( 'div.tberrmsg', row ).text( data.message || "Error in Lua" );
			}
		}).fail( function( stat ) {
			console.log("Failed to check Lua: " + stat);
		});
	}

	function makeSceneMenu() {
		var ud = api.getUserData();
		var scenes = api.cloneObject( ud.scenes || [] );
		var menu = jQuery( '<select class="form-control form-control-sm" />' );
		/* If lots of scenes, sort by room; otherwise, use straight as-is */
		var i;
		if ( true || scenes.length > 10 ) {
			var rooms = api.cloneObject( ud.rooms );
			var rid = {};
			for ( i=0; i<rooms.length; ++i ) {
				rid[rooms[i].id] = rooms[i];
			}
			rid[0] = { id: 0, name: "(no room)" };
			scenes.sort( function( a, b ) {
				var ra = ( rid[a.room || 0] || {} ).name || "";
				var rb = ( rid[b.room || 0] || {} ).name || "";
				if ( ra.toLowerCase() == rb.toLowerCase() ) {
					return (a.name || "").toLowerCase() < (b.name || "").toLowerCase() ? -1 : 1;
				}
				return ra.toLowerCase() < rb.toLowerCase() ? -1 : 1;
			});
			var lastRoom = -1;
			var xg = false;
			for ( i=0; i<scenes.length; i++ ) {
				if ( scenes[i].notification_only || scenes[i].hidden ) {
					continue;
				}
				var r = scenes[i].room || 0;
				if ( r != lastRoom ) {
					if ( xg && jQuery( 'option:first', xg ).length > 0 ) {
						menu.append( xg );
					}
					xg = jQuery( '<optgroup />' )
						.attr( 'label', ( rid[r] || {} ).name || ( "Room " + String(r) ) );
				}
				xg.append( jQuery( '<option/>' ).val( scenes[i].id )
					.text( String(scenes[i].name) + ' (#' + String(scenes[i].id) + ')' ) );
			}
			if ( xg && jQuery( 'option:first', xg ).length > 0 ) {
				menu.append( xg );
			}
		} else {
			/* Simple alpha list */
			scenes.sort( function(a, b) { return ( a.name || "" ).toLowerCase() < ( b.name || "" ).toLowerCase() ? -1 : 1; } );
			for ( i=0; i<scenes.length; i++ ) {
				if ( scenes[i].notification_only || scenes[i].hidden ) {
					continue;
				}
				var opt = jQuery('<option value="' + scenes[i].id + '"></option>');
				opt.text( scenes[i].name || ( "#" + scenes[i].id ) );
				menu.append( opt );
			}
		}
		return menu;
	}

	function validateActionRow( row ) {
		var actionType = jQuery('select#actiontype', row).val();
		jQuery('.tberror', row).removeClass( 'tberror' );
		jQuery('.tbwarn', row).removeClass( 'tbwarn' );
		row.removeClass( 'tberror' );
		jQuery( 'div.tberrmsg', row ).remove();

		var dev;
		switch ( actionType ) {
			case "comment":
				break;

			case "delay":
				var delay = jQuery( 'input#delay', row ).val() || "";
				if ( delay.match( varRefPattern ) ) {
					// Variable reference. ??? check it?
				} else if ( delay.match( /^([0-9][0-9]?)(:[0-9][0-9]?){1,2}$/ ) ) {
					// MM:SS or HH:MM:SS
				} else {
					var n = parseInt( delay );
					if ( isNaN( n ) || n < 1 ) {
						jQuery( 'input#delay', row ).addClass( "tberror" );
					}
				}
				break;

			case "device":
				dev = jQuery( 'select.devicemenu', row ).val();
				if ( isEmpty( dev ) ) {
					jQuery( 'select.devicemenu', row ).addClass( 'tberror' );
				} else {
					var devnum = parseInt( dev );
					if ( -1 === devnum ) devnum = api.getCpanelDeviceId();
					var sact = jQuery('select#actionmenu', row).val();
					if ( isEmpty( sact ) ) {
						jQuery( 'select#actionmenu', row ).addClass( "tberror" );
					} else {
						// check parameters, with value/type check when available?
						// type, valueSet/value list, min/max
						var ai = actions[ sact ];
						if ( ai && ai.deviceOverride && ai.deviceOverride[devnum] ) {
							console.log('validateActionRow: applying device ' + devnum + ' override for ' + sact);
							ai = ai.deviceOverride[devnum];
						}
						if ( ! ai ) {
							console.log('validateActionRow: no info for ' + sact + ' for device ' + devnum);
							return; /* If we don't know, we don't check */
						}
						for ( var k=0; k < (ai.parameters || [] ).length; k++ ) {
							var p = ai.parameters[k];
							if ( undefined === p.value ) { /* ignore fixed value */
								/* Fetch value */
								var field = jQuery( '#' + idSelector( p.name ), row );
								if ( field.length != 1 ) {
									console.log("validateActionRow: field " + p.name + " expected 1 found " +
										field.length );
									continue; /* don't validate to avoid user jail */
								}
								var v = field.val() || "";
								v = v.replace( /^\s+/, "" ).replace( /\s+$/, "" );
								field.val( v ); /* replace with trimmed value */
								/* Ignore default here, it's assumed to be valid when needed */
								/* Blank and optional OK? Move on. */
								if ( "" === v ) {
									if ( p.optional || p.allowempty ) {
										continue;
									}
									/* Not optional/empty allowed, flag error. */
									field.addClass( 'tbwarn' );
								} else if ( v.match( varRefPattern ) ) {
									/* Variable reference, do nothing, can't check */
								} else {
									// check value type, range?
									// ??? subtypes? like RGB; validation pattern(s) from data?
									var typ = p.type || p.dataType || "string";
									if ( "int" === typ || typ.match( /^u?i[124]$/i ) ) {
										/* Integer. Watch for RGB spec of form #xxx or #xxxxxx */
										v = v.replace( /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "0x\\1\\1\\2\\2\\3\\3" );
										v = v.replace( /^#[0-9a-f]{6,8}$/, "0x" );
										v = parseInt( v );
										if ( undefined === inttypes[typ] ) {
											console.log( "validateActionRow: no type data for " + typ );
										} else if ( isNaN(v) || ( v < inttypes[typ].min ) || ( v > inttypes[typ].max ) ||
											( undefined !== p.min && v < p.min ) || ( undefined != p.max && v > p.max ) ) {
											field.addClass( 'tbwarn' ); // ???explain why?
										}
									} else if ( typ.match( /(r4|r8|float|number)/i ) ) {
										/* Float */
										v = parseFloat( v );
										if ( isNaN( v ) || ( undefined !== p.min && v < p.min ) || ( undefined !== p.max && v > p.max ) ) {
											field.addClass( 'tbwarn' );
										}
									} else if ( "boolean" === typ ) {
										if ( ! v.match( /^(0|1|true|false|yes|no)$/i ) ) {
											field.addClass( 'tbwarn' );
										}
									} else if ( "string" !== typ ) {
										/* Known unsupported/TBD: date/dateTime/dateTime.tz/time/time.tz (ISO8601), bin.base64, bin.hex, uri, uuid, char, fixed.lll.rrr */
										console.log("validateActionRow: no validation for type " + String(typ));
									}
								}
							}
						}
					}
				}
				break;

			case "housemode":
				break;

			case "runscene":
				var sc = jQuery( 'select#scene', row ).val();
				if ( isEmpty( sc ) ) {
					jQuery( 'select#scene', row ).addClass( "tberror" );
				}
				/* don't need to validate method */
				break;

			case "runlua":
				var lua = jQuery( 'textarea.luacode', row ).val() || "";
				// check Lua?
				if ( lua.match( /^[\r\n\s]*$/ ) ) {
					jQuery( 'textarea.luacode', row ).addClass( "tberror" );
				} else {
					testLua( lua, jQuery( 'textarea.luacode', row ), row );
				}
				break;

			case "rungsa":
				dev = jQuery( 'select.devicemenu', row ).val() || "";
				if ( "" === dev ) {
					jQuery( 'select#device' ).addClass( 'tberror' );
				}
				var activity = jQuery( 'select#activity', row ).val() || "";
				if ( "" === activity ) {
					jQuery( 'select#activity' ).addClass( 'tberror' );
				}
				break;

			case "resetlatch":
				dev = jQuery( 'select.devicemenu', row ).val() || "";
				if ( "" === dev ) {
					jQuery( 'select#device' ).addClass( 'tberror' );
				}
				var group = jQuery( 'select#group', row ).val() || "";
				break;

			case "notify":
				// If no users selected, error.
				if ( 0 === jQuery("fieldset#users input:checked", row ).length ) {
					jQuery( 'fieldset#users', row ).addClass( 'tberror' );
				}
				/* Message cannot be empty. */
				dev = jQuery( 'input#message', row );
				if ( isEmpty( dev.val() ) ) {
					dev.addClass( 'tberror' );
				}
				break;

			default:
				/* Do nothing */
		}

		row.has('.tberror').addClass('tberror');
	}

	/* Check that notification scene exists; create it if not */
	function checkNotificationScene( myid, nid ) {
		var k;
		myid = myid || api.getCpanelDeviceId();
		var scene = false;
		var ud = api.getUserData();
		for ( k=0; k<ud.scenes.length; k++ ) {
			if ( String(ud.scenes[k].notification_only) === String(myid) &&
				String((ud.scenes[k].triggers || [])[0].template) === "10" &&
				String(ud.scenes[k].triggers[0].arguments[0].value) == String(nid) ) {
					scene = ud.scenes[k];
					break;
			}
		}
		/* Create or update it. */
		var cf = getConfiguration( myid );
		var req = { id: "scene", action: "create" };
		var nn = (cf.notifications || {})[String(nid)] || {};
		if ( !scene ) {
			/* Set up new scene */
			scene = {
				name: nn.message || nid, /* message should go here */
				notification_only: myid,
				modeStatus: "0",
				triggers: [{
					device: myid,
					name: nn.message || nid,
					enabled: 1,
					arguments: [{ id: "1", value: nid }], /* notification id here */
					template: "10",
					users: nn.users || ""
				}],
				users: nn.users || "",
				room: 0
			};
		} else {
			if ( devVeraAlerts ) {
				/* If VeraAlerts is in use, check for message override. */
				var mo = api.getDeviceStateVariable( devVeraAlerts, "urn:richardgreen:serviceId:VeraAlert1", "MsgOverride" ) || "";
				try {
					if ( !isEmpty(mo) ) {
						/* custom array, Lua-ish, not JSON */
						var md = mo.match( /'([^']*)',?/g );
						var vad = new RegExp( "^'" + String(scene.id) + "_0'", "i" );
						for ( k=0; k<md.length; k+=2 ) {
							if ( vad.test( md[k] ) && !isEmpty( md[k+1] ) ) {
								vad = md[k+1].replace( /',?$/, "" ).replace( /^'/, "" );
console.log( vad );
								nn.message = decodeURIComponent( vad);
								nn.veraalerts = 1;
								break;
							}
						}
					}
				} catch( e ) {
					console.log("Failed to save VA message for " + scene.id + ", data " + mo);
					console.log(e);
				}
				/* Recipients overrides as well. */
				try {
					if ( !isEmpty( scene.triggers[0].lua ) ) {
						var m = scene.triggers[0].lua;
						if ( 0 != ( scene.triggers[0].encoded_lua || 0 ) ) {
							m = atob( m );
						}
						var r = m.match( /Recipients\s*=\s*'([^']*)'/ );
						if ( r.length > 1 && !isEmpty( r[1] ) ) {
							/* VA uses list of names; map them back to user IDs for Vera and us */
							var uu = [];
							r = r[1].match( /([^,]+)/g );
							if ( r.length > 0 ) {
								for ( k=0; k<r.length; k++ ) {
									if ( userNameIx[r[k]] )
										uu.push( userNameIx[r[k]] );
									else
										console.log("*** Did not find user ID for VeraAlerts username " + String(r[u]) + "; skipping.");
								}
							}
							nn.users = uu.join( ',' );
							nn.veraalerts = 1;
						}
					}
				} catch( e ) {
					console.log("Failed to decode/handle VA scene lua for #" + scene.id);
					console.log(e);
				}
			}
			/* Maybe update existing scene */
			nn.scene = scene.id;
			if ( scene.name === nn.message && scene.users === nn.users ) {
				return false;
			}
			scene.name = nn.message || nid;
			scene.users = nn.users || "";
			scene.triggers[0].users = scene.users;
			scene.triggers[0].name = nn.message || nid;
		}
		req.json = JSON.stringify( scene );
		jQuery.ajax({
			url: api.getDataRequestURL(),
			method: "POST",
			data: req,
			dataType: "text",
			timeout: 15000
		}).done( function( data, statusText, jqXHR ) {
			if ( "OK" !== data ) {
				alert("Failed to save notification configuration. Vera may be reloading. Please wait a moment and try again.");
				configModified = true;
				updateSaveControls();
			}
		}).fail( function( jqXHR ) {
			alert("Failed to save notification configuration. Vera may be reloading. Please wait a moment and try again.");
			configModified = true;
			updateSaveControls();
		});
		return true;
	}

	/* Removes unused notification scenes from the RS */
	function cleanNotificationScenes( myid ) {
		var k;
		myid = myid || api.getCpanelDeviceId();
		var cf = getConfiguration( myid );

		/* First, make map of all notification keys */
		var nots = {};
		var nk = Object.keys( cf.notifications || {} );
		for ( k=0; k<nk.length; k++ ) {
			nots[nk[k]] = true;
		}

		/* Remove all keys from nots for which there is an action. */
		var valids = {};
		for ( var act in (cf.activities || {}) ) {
			if ( ! cf.activities.hasOwnProperty(act) ) continue;
			for ( k=0; k<(cf.activities[act].groups || []).length; k++ ) {
				for ( var l=0; l<(cf.activities[act].groups[k].actions || []).length; l++) {
					if ( cf.activities[act].groups[k].actions[l].type == "notify" ) {
						var key = String(cf.activities[act].groups[k].actions[l].notifyid);
						if ( undefined === cf.notifications[key] ) {
							console.log("Action #" + l + " in group #" + k +
								" of " + act + " refers to non-existent notification " +
								key);
						} else {
							valids[key] = true;
							delete nots[key];
						}
					}
				}
			}
		}

		/* At this point, any remaining in nots are not associated with any action */
		for ( var n in nots ) {
			if ( nots.hasOwnProperty( n ) && n !== "nextid" ) delete cf.notifications[n];
		}

		/* Now remove any notification scenes that are not associated with known actions. */
		/* Work on a clone of the scene list so it doesn't shift while we work. */
		var scenes = api.cloneObject( api.getUserData().scenes || [] );
		nots = [];
		for ( k=0; k<scenes.length; ++k ) {
			if ( String(scenes[k].notification_only) === String(myid) &&
					String((scenes[k].triggers || [])[0].template) === "10" ) {
				/* This is a notification scene for this RS */
				console.log("Checking notification scene #" + scenes[k].id);
				if ( undefined === valids[String(scenes[k].triggers[0].arguments[0].value)] ) {
					console.log("Marking unused notification scene #" + scenes[k].id);
					nots.push(scenes[k].id);
				} else {
					/* Save scene on notification. Remove from valids so any dups are also removed. */
					cf.notifications[String(scenes[k].triggers[0].arguments[0].value)].scene = scenes[k].id;
					delete valids[String(scenes[k].triggers[0].arguments[0].value)];
				}
			}
		}

		/* Now remove the scenes that need removal, one at a time. Aync. */
		function _rmscene( myid, nots ) {
			if ( nots.length > 0 ) {
				var scene = nots.pop();
				console.log("Removing unused notifications scene #" + scene);
				jQuery.ajax({
					url: api.getDataRequestURL(),
					data: { id: "scene", action: "delete", scene: scene },
					dataType: "text",
					timeout: 5000
				}).always( function() {
					_rmscene( myid, nots );
				});
			}
		}
		_rmscene( myid, nots );
	}

	function buildActionList( root ) {
		if ( jQuery('.tberror', root ).length > 0 ) {
			return false;
		}
		/* Set up scene framework and first group with no delay */
		var id = root.attr( 'id' );
		var scene = { isReactorScene: 1, id: id, name: id, groups: [] };
		var group = { groupid: "grp0", actions: [] };
		scene.groups.push( group );
		var firstScene = true;
		jQuery( 'div.actionrow', root ).each( function( ix ) {
			var row = jQuery( this );
			var actionType = jQuery( 'select#actiontype', row ).val();
			var action = { type: actionType, index: ix+1 };
			var k, pt, t, devnum, devobj;

			switch ( actionType ) {
				case "comment":
					action.comment = jQuery( 'input.argument', row ).val() || "";
					break;

				case "delay":
					t = jQuery( 'input#delay', row ).val() || "0";
					if ( t.match( varRefPattern ) ) {
						/* Variable reference is OK as is. */
					} else {
						if ( t.indexOf( ':' ) >= 0 ) {
							pt = t.split( /:/ );
							t = 0;
							for ( var i=0; i<pt.length; i++ ) {
								t = t * 60 + parseInt( pt[i] );
							}
						} else {
							t = parseInt( t );
						}
						if ( isNaN( t ) ) {
							scene = false;
							return false;
						}
					}
					/* Create a new group, marked with the delay, for all subsequent actions */
					if ( group.actions.length > 0 ) {
						group = { actions: [], delay: t, delaytype: jQuery( 'select#delaytype', row ).val() || "inline" };
						scene.groups.push( group );
					} else {
						/* There are no actions in the current group; just modify the delay in this group. */
						group.delay = t;
						group.delaytype = jQuery( 'select#delaytype', row ).val() || "inline";
					}
					/* We've set up a new group, not an action, so take an early exit
					   from this each() */
					return true;

				case "device":
					action.device = parseInt( jQuery( 'select.devicemenu', row ).val() );
					devnum = -1 === action.device ? api.getCpanelDeviceId() : action.device;
					devobj = api.getDeviceObject( devnum );
					action.deviceName = (devobj || {}).name;
					t = jQuery( 'select#actionmenu', row ).val() || "";
					pt = t.split( /\//, 2 );
					action.service = pt[0]; action.action = pt[1];
					var ai = actions[ t ];
					if ( ai && ai.deviceOverride && ai.deviceOverride[devnum] ) {
						ai = ai.deviceOverride[devnum];
					}
					action.parameters = [];
					if ( ai ) {
						for ( k=0; k < (ai.parameters || [] ).length; k++ ) {
							pt = { name: ai.parameters[k].name };
							if ( undefined !== ai.parameters[k].value ) {
								/* Fixed value */
								pt.value = ai.parameters[k].value;
							} else {
								/* Ignore default here, it's assumed to be valid when needed */
								t = jQuery( '#' + idSelector( ai.parameters[k].name ), row ).val() || "";
								if ( isEmpty( t ) ) {
									if ( ai.parameters[k].optional ) {
										continue; /* skip it, not even put on the list */
									}
									/* fall through and accept empty */
								}
								pt.value = t;
							}
							action.parameters.push( pt );
						}
					} else {
						/* No action info; build using fields directly */
						console.log( "Can't find actioninfo for " + t );
						jQuery( '.argument', row ).each( function() {
							var val = jQuery( this ).val();
							if ( ! isEmpty( val ) ) {
								action.parameters.push( { name: jQuery( this ).attr('id'), value: val } );
							}
						});
					}
					break;

				case "housemode":
					action.housemode = jQuery( 'select#housemode', row ).val() || "1";
					break;

				case "runscene":
					action.scene = parseInt( jQuery( "select#scene", row ).val() || "0" );
					if ( isNaN( action.scene ) || 0 === action.scene ) {
						console.log("buildActionList: invalid scene selected");
						scene = false;
						return false;
					}
					if ( "V" === (jQuery( 'select#method', row ).val() || "") ) {
						action.usevera = 1;
					} else {
						delete action.usevera;
					}
					// action.sceneName = sceneByNumber[ action.scene ].name
					jQuery.ajax({
						url: api.getDataRequestURL(),
						data: {
							id: "lr_Reactor",
							action: "preloadscene",
							device: api.getCpanelDeviceId(),
							scene: action.scene,
							flush: firstScene ? 0 : 1
						},
						dataType: "json",
						timeout: 5000
					}).done( function( data, statusText, jqXHR ) {
					}).fail( function( jqXHR ) {
					});
					firstScene = false;
					break;

				case "runlua":
					var lua = jQuery( 'textarea.luacode', row ).val() || "";
					lua = lua.replace( /\r\n/g, "\n" );
					lua = lua.replace( /\r/, "\n" );
					lua = lua.replace( /\s+\n/g, "\n" );
					lua = lua.replace( /[\r\n\s]+$/m, "" ); // rtrim
					lua = unescape( encodeURIComponent( lua ) ); // Fanciness to keep UTF-8 chars well
					if ( isEmpty( lua ) ) {
						delete action.encoded_lua;
						action.lua = "";
					} else {
						action.encoded_lua = 1;
						action.lua = btoa( lua );
					}
					break;

				case "rungsa":
					devnum = parseInt( jQuery( 'select.devicemenu', row ).val() || "-1" );
					if ( isNaN( devnum ) || devnum < 0 ) {
						delete action.device;
						delete action.deviceName;
					} else {
						action.device = devnum;
						devobj = api.getDeviceObject( devnum < 0 ? api.getCpanelDeviceId() : devnum );
						action.deviceName = devobj.name;
					}
					action.activity = jQuery( 'select#activity', row ).val() || "";
					break;

				case "resetlatch":
					devnum = parseInt( jQuery( 'select.devicemenu', row ).val() || "-1" );
					if ( devnum < 0 || isNaN( devnum ) ) {
						delete action.device;
						delete action.deviceName;
					} else {
						action.device = devnum;
						devobj = api.getDeviceObject( devnum < 0 ? api.getCpanelDeviceId() : devnum );
						action.deviceName = devobj.name;
					}
					var gid = jQuery( 'select#group', row ).val() || "";
					if ( isEmpty( gid ) ) {
						delete action.group;
					} else {
						action.group = gid;
					}
					break;

				case "notify":
					var nid = jQuery( 'input#notifyid', row ).val() || "";
					var ua = jQuery( 'fieldset#users input:checked', row );
					var users = [];
					ua.each( function() {
						var val = $(this).val();
						if ( !isEmpty( val ) ) users.push( val );
					});
					var myid = api.getCpanelDeviceId();
					var cf = getConfiguration( myid );
					cf.notifications = cf.notifications || { nextid: 1 };
					if ( isNaN( cf.notifications.nextid ) ) cf.notifications.nextid = 1;
					if ( "" === nid ) {
						/* Search for an empty slot */
						do {
							nid = String(cf.notifications.nextid++);
						} while ( undefined !== cf.notifications[nid] );
						jQuery( 'input#notifyid', row ).val( nid );
					}
					cf.notifications[nid] = cf.notifications[nid] || { id: parseInt(nid) };
					cf.notifications[nid].users = users.join(',');
					cf.notifications[nid].message = jQuery( 'input#message', row ).val() || nid;
					checkNotificationScene( myid, nid );
					action.notifyid = nid;
					break;

				default:
					console.log("buildActionList: " + actionType + " action unrecognized");
					var ad = jQuery( 'input#unrecdata', row ).val() || "";
					if ( "" !== ad ) {
						action = JSON.parse( ad );
						if ( ! action ) scene = false;
					} else {
						scene = false;
					}
					if ( !scene ) return false;
			}

			/* Append action to current group */
			group.actions.push( action );
		});
		return scene;
	}

	function handleActionsSaveClick( ev ) {
		var cd = getConfiguration();
		var ixCond = getConditionIndex();
		var errors = false;

		/* Check activity/group relationships */
		cd.activities = cd.activities || {};
		for ( var k in cd.activities ) {
			if ( cd.activities.hasOwnProperty( k ) ) {
				var id = k.replace( /\.(true|false)$/, "" );
				if ( undefined === ixCond[id] ) {
					delete cd.activities[k];
					configModified = true;
				}
			}
		}

		/* Now clean, save as displayed. */
		jQuery( 'div.actionlist' ).each( function() {
			var id = jQuery( this ).attr( 'id' );
			var scene = buildActionList( jQuery( this ) );
			if ( scene ) {
				if ( (scene.groups || []).length == 0 || ( scene.groups.length == 1 && ( scene.groups[0].actions || []).length == 0 ) ) {
					delete cd.activities[id];
				} else {
					cd.activities[id] = scene;
				}
			} else {
				errors = true;
				return false; /* break */
			}
		});

		try {
			cleanNotificationScenes();
		} catch( e ) {
			console.log("Exception thrown while cleaning notifications: "+String(e));
			console.log(e);
		}

		if ( ! errors ) {
			/* Save has async action, so use callback to complete. */
			handleSaveClick( ev, function() {
				if ( !configModified ) { /* successful save? */
					jQuery( 'div.actionlist.tbmodified' ).removeClass( "tbmodified" );
					jQuery( 'div.actionlist .tbmodified' ).removeClass( "tbmodified" );
				}
			}, [] ); /* pass up */
			return;
		}
		alert( "Configuration not saved. Please correct the indicated errors, then try again." );
	}

	function updateActionControls() {
		jQuery( 'div.actionlist' ).each( function( ix ) {
			var section = jQuery( this );
			jQuery('div.controls button#action-up', section).prop('disabled', false);
			jQuery('div.actionrow:first div.controls button#action-up', section).prop('disabled', true);
			jQuery('div.controls button#action-down', section).prop('disabled', false);
			jQuery('div.actionrow:last div.controls button#action-down', section).prop('disabled', true);
		});

		/* Save and revert buttons */
		updateSaveControls();
	}

	/**
	 * Given a section, update cdata to match.
	 */
	function updateActionList( section ) {
		var sn = section.attr( 'id' );
		if ( !isEmpty( sn ) ) {
			var scene = buildActionList( section );
			if ( scene ) {
				var cd = getConfiguration();
				cd.activities[sn] = scene;
				configModified = true;
			}
		}
	}

	function changeActionRow( row ) {
		configModified = true;
		row.addClass( "tbmodified" );
		jQuery( 'div.actionlist' ).addClass( "tbmodified" ); // all lists, because save saves all.
		validateActionRow( row );
		var section = row.closest( 'div.actionlist' );
		updateActionList( section );
		updateActionControls();
	}

	function handleActionValueChange( ev ) {
		var row = jQuery( ev.currentTarget ).closest( 'div.actionrow' );
		changeActionRow( row );
	}

	function appendVariables( menu ) {
		var cd = getConfiguration();
		var hasOne = false;
		var xg = jQuery( '<optgroup label="Variables" />' );
		for ( var vname in ( cd.variables || {} ) ) {
			if ( cd.variables.hasOwnProperty( vname ) ) {
				hasOne = true;
				xg.append( jQuery( '<option/>' ).val( '{' + vname + '}' )
					.text( '{' + vname + '}' ) );
			}
		}
		if ( hasOne ) {
			menu.append( xg );
		}
	}

	function changeActionAction( row, newVal ) {
		var ct = jQuery( 'div.actiondata', row );
		jQuery( 'label,.argument', ct ).remove();
		if ( isEmpty( newVal ) ) {
			return;
		}
		var action = actions[newVal];
		/* Check for device override to service/action */
		var devNum = parseInt( jQuery( 'select.devicemenu', ct ).val() );
		if ( !isNaN(devNum) && action && action.deviceOverride && action.deviceOverride[devNum] ) {
			console.log("changeActionAction: using device override for " + String(devNum));
			action = action.deviceOverride[devNum];
			if ( undefined != action && undefined == action.name ) {
				/* exceptions use different key ??? should fix this in data! */
				action.name = action.action;
			}
		}
		if ( undefined !== action ) {
			/* Info assist from our enhancement data */
			for ( var k=0; k<( action.parameters || [] ).length; ++k ) {
				var opt, j, z;
				var parm = action.parameters[k];
				if ( "out" === parm.direction ) continue; /* Don't display output params */
				if ( parm.hidden ) continue; /* or hidden parameters */
				if ( undefined !== parm.value ) continue; /* fixed value */
				var inp;
				if ( parm.valueSet && deviceInfo.valuesets[parm.valueSet] ) {
					parm.values = deviceInfo.valuesets[parm.valueSet];
				}
				if ( undefined !== parm.values && Array.isArray( parm.values ) ) {
					/* Menu, can be array of strings or objects */
					if ( undefined !== window.HTMLDataListElement ) {
						/* Use datalist when supported (allows more flexible entry) */
						var dlid = ("data-" + action.service + '-' + action.name + '-' + parm.name).replace( /[^a-z0-9-]/ig, "-" );
						if ( 0 == jQuery( 'datalist#' + idSelector( dlid ) ).length ) {
							/* Datalist doesn't exist yet, create it */
							inp = jQuery('<datalist class="argdata" id="' + dlid + '"/>');
							for ( j=0; j<parm.values.length; j++ ) {
								opt = jQuery( '<option/>' );
								if ( "object" === typeof(parm.values[j]) ) {
									for ( z in parm.values[j] ) {
										if ( parm.values[j].hasOwnProperty( z ) ) {
											opt.val( String(z) );
											opt.text( String( parm.values[j][z] ) + ( parm.default && z == parm.default ? " *" : "" ) );
										}
									}
								} else {
									opt.val( String( parm.values[j] ) );
									opt.text( String( parm.values[j] ) + ( parm.default && parm.values[j] == parm.default ? " *" : "" ) );
								}
								inp.append( opt );
							}
							/* Add variables and append to tab (datalists are global to tab) */
							if ( ! parm.novars ) {
								appendVariables( inp );
							}
							jQuery( 'div#tab-actions.reactortab' ).append( inp );
						}
						/* Now pass on the input field */
						inp = jQuery( '<input class="argument form-control form-control-sm" placeholder="Click for predefined values" list="' + dlid + '">' );
					} else {
						/* Standard select menu */
						inp = jQuery( '<select class="argument form-control form-control-sm"/>' );
						if ( parm.optional ) {
							inp.append( '<option value="">(unspecified)</option>' );
						}
						for ( j=0; j<parm.values.length; j++ ) {
							opt = jQuery( '<option/>' );
							if ( "object" === typeof(parm.values[j]) ) {
								for ( z in parm.values[j] ) {
									if ( parm.values[j].hasOwnProperty( z ) ) {
										opt.val( String(z) );
										opt.text( String( parm.values[j][z] ) );
									}
								}
							} else {
								opt.val( String( parm.values[j] ) );
								opt.text( String( parm.values[j] ) );
							}
							inp.append( opt );
						}
						/* Add variables */
						if ( ! parm.novars ) {
							appendVariables( inp );
						}
						/* As a default, just choose the first option, unless specified */
						if ( undefined !== parm.default ) {
							inp.val( parm.default );
						} else {
							jQuery( 'option:first' ).prop( 'selected', true );
						}
					}
				} else if ( parm.type == "scene" ) {
					inp = makeSceneMenu();
					if ( parm.optional ) {
						inp.append( '<option value="" selected>(unspecified)</option>' );
					} else {
						inp.append( '<option value="" selected>--choose--</option>' );
					}
					if ( undefined !== parm.extraValues ) {
						if ( Array.isArray( parm.extraValues ) ) {
							for ( j=0; j<parm.extraValues.length; j++ ) {
								opt = jQuery( '<option/>' ).val( parm.extraValues[j] ).text( parm.extraValues[j] );
								//inp.append( opt );
								opt.insertAfter( jQuery( 'option[value=""]:first', inp ) );
							}
						} else {
							for ( var key in parm.extraValues ) {
								if ( parm.extraValues.hasOwnProperty( key ) ) {
									opt = jQuery( '<option/>' ).val( key ).text( parm.extraValues[key] );
									opt.insertAfter( jQuery( 'option[value=""]:first', inp ) );
									//inp.append( opt );
								}
							}
						}
					}
					/* Add variables */
					appendVariables( inp );
				} else if ( parm.type == "boolean" ) {
					/* Menu */
					inp = jQuery('<select class="argument form-control form-control-sm"/>');
					if ( parm.optional ) {
						inp.prepend( '<option value="">not specified</option>' );
					}
					inp.append('<option value="0">0/off/false</option>');
					inp.append('<option value="1">1/on/true</option>');
					/* Add variables */
					appendVariables( inp );
					/* Don't set default, let default default -- WHY???? */
					if ( parm.default ) {
						inp.val( parm.default );
					}
				} else if ( false && parm.type == "ui1" && parm.min !== undefined && parm.max !== undefined ) {
					inp = jQuery('<div class="argument tbslider"/>');
					inp.slider({
						min: parm.min, max: parm.max, step: parm.step || 1,
						range: "min",
						stop: function ( ev, ui ) {
							// DeusExMachinaII.changeDimmerSlider( jQuery(this), ui.value );
						},
						slide: function( ev, ui ) {
							jQuery( 'a.ui-slider-handle', jQuery( this ) ).text( ui.value );
						},
						change: function( ev, ui ) {
							jQuery( 'a.ui-slider-handle', jQuery( this ) ).text( ui.value );
						}
					});
					inp.slider("option", "disabled", false);
					inp.slider("option", "value", undefined === parm.default ? parm.min : parm.default ); //??? fixme: clobbered later
				} else if ( (parm.type || "").match(/^(r|u?i)[124]$/i ) ) {
					inp = jQuery( '<input class="argument narrow form-control form-control-sm">' );
					if ( ! parm.novars ) {
						inp.attr( 'list', 'reactorvarlist' );
					}
					inp.attr( 'placeholder', action.parameters[k].name );
					inp.val( undefined==parm.default ? (undefined==parm.min ? (undefined==parm.optional ? 0 : "") : parm.min ) : parm.default );
				} else {
					console.log("J_ReactorSensor_UI7.js: using default field presentation for type " + String(parm.type));
					inp = jQuery( '<input class="argument form-control form-control-sm">' );
					if ( ! parm.novars ) {
						inp.attr( 'list', 'reactorvarlist' );
					}
					inp.attr( 'placeholder', action.parameters[k].name );
					inp.val( undefined===parm.default ? "" : parm.default );
				}
				inp.attr('id', parm.name ).addClass( 'argument' );
				inp.on( 'change.reactor', handleActionValueChange );
				/* If there are more than one parameters, wrap each in a label. */
				if ( action.parameters.length > 1 ) {
					var label = jQuery("<label/>");
					label.attr("for", parm.name );
					label.text( ( parm.label || parm.name ) + ": " );
					label.append( inp );
					if ( parm.optional ) inp.addClass("optarg");
					ct.append(" ");
					ct.append( label );
				} else {
					/* No label */
					ct.append( inp );
				}
			}
		}
	}

	function handleActionActionChange( ev ) {
		configModified = true;
		var el = jQuery( ev.currentTarget );
		var newVal = el.val() || "";
		var row = el.closest( 'div.actionrow' );
		changeActionAction( row, newVal );
		changeActionRow( row );
	}

	/* Perform numeric comparison for device override */
	function doNumericComparison( str1, op, str2 ) {
		var v1 = parseInt( str1 );
		var v2 = parseInt( str2 );
		if ( isNaN( v1 ) || isNaN( v2 ) ) {
			return false;
		}
		if ( op == "<" ) return v1 < v2;
		if ( op == "<=" ) return v1 <= v2;
		if ( op == ">" ) return v1 > v2;
		if ( op == ">=" ) return v1 >= v2;
		if ( op == "=" || op == "==" ) return v1 == v2;
		if ( op == "!=" || op == "~=" ) return v1 != v2;
		return false;
	}

	/* Find an override for a device. */
	function getDeviceOverride( devnum ) {
		var devobj = api.getDeviceObject( devnum );
		if ( ! devobj ) return false;
		var mytype = devobj.device_type || "?";
		var base = deviceInfo.devices[mytype] || deviceInfo.devices[ 'type:' + mytype ];
		if ( undefined !== base ) {
			if ( Array.isArray( base ) ) {
				/* Early syntax without match conditions. Just return array */
				return base;
			}
			/* Attempt to find a match condition */
			for ( var im=0; im<(base.match || []).length; im++ ) {
				/* Conditions separated by ";", all must be met. for match to succeed */
				var cond = (base.match[im].condition || "").split( /;/ );
				var match = true;
				for ( var ic=0; ic<cond.length; ++ic ) {
					/* Each condition uses simple RPN script */
					var pt = cond[ic].split( /,/ );
					var stack = []; /* Start off */
					var refdev = devnum;
					var v, op1, op2;
					while ( pt.length > 0 ) {
						var seg = decodeURIComponent( pt.shift() || "" ).trim();
						try {
							if ( "openluup" === seg ) {
								/* Fail immediately if not running on openLuup */
								if ( ! isOpenLuup ) {
									match = false;
									break;
								}
							} else if ( "vera" === seg ) {
								/* Fail immediately if not running on genuine Vera */
								if ( isOpenLuup ) {
									match = false;
									break;
								}
							} else if ( "parent" === seg ) {
								/* Does not change stack, but switches reference device to parent */
								var refobj = api.getDeviceObject( refdev );
								if ( 0 != refobj.id_parent ) {
									refdev = refobj.id_parent;
								}
							} else if ( "var" === seg ) {
								var vname = stack.pop() || "?";
								var vserv = stack.pop() || "?";
								v = api.getDeviceStateVariable( refdev, vserv, vname ) || null;
								stack.push( v );
							} else if ( "attr" === seg ) {
								var aname = stack.pop() || "";
								v = api.getDeviceAttribute( refdev, aname ) || null;
								stack.push( v );
							} else if ( "and" === seg ) {
								op2 = stack.pop() || false;
								op1 = stack.pop() || false;
								stack.push( op1 && op2 );
							} else if ( "or" === seg ) {
								op2 = stack.pop() || false;
								op1 = stack.pop() || false;
								stack.push( op1 || op2 );
							} else if ( "not" === seg ) {
								v = stack.pop();
								if ( typeof(v) == "boolean" ) {
									stack.push( !v );
								} else {
									throw "invalid operand type for not: ("+
										typeof(v) + ")" + String(v);
								}
							} else if ( "isnull" === seg ) {
								v = stack.pop() || null;
								stack.push( v === null );
							} else if ( "dup" === seg ) {
								v = stack.pop() || null; /* sloppy peek??? */
								stack.push( v );
								stack.push( v );
							} else if ( "lower" == seg ) {
								if ( stack.length > 0 ) {
									v = String( stack.pop() );
									stack.push( v.toLowerCase() );
								} else {
									throw "stack empty (lower)";
								}
							} else if ( seg.match( /^(<|<=|>|>=|=|==|!=|~=|<>)$/ ) ) {
								/* Binary op, takes two values */
								op2 = stack.pop() || null;
								op1 = stack.pop() || null;
								var res;
								if ( seg == "==" || seg == "=" ) {
									res = op1 == op2;
								} else if ( seg == "!=" || seg == "~=" || seg == "<>" ) {
									res = op1 != op2;
								} else {
									res = doNumericComparison( op1, seg, op2 );
								}
								stack.push( res );
							} else if ( seg.match( /^\// ) ) {
								/* Regular expression match */
								var re = new RegExp( seg );
								v = stack.pop() || "";
								stack.push( v.match( re ) );
							} else if ( seg.match( /^["']/ ) ) {
								v = seg.substring( 1, seg.length-1 );
								stack.push( v );
							} else if ( ! isNaN( seg ) ) {
								stack.push( parseInt( seg ) );
							} else {
								throw "unrecognized device match expression " + String(seg);
							}
						} catch(e) {
							console.log("getDeviceOverride: error parsing match " + String(seg) +
								" for " + cond[ic] + " on " + mytype + ": " + String(e));
							match = false;
							break;
						}
					}
					/* Done. Test succeeds iff stack has (boolean)true */
					if ( 1 !== stack.length ) {
						console.log("getDeviceOverride: eval of " + cond[ic] + " for " + devobj.device_type +
							" end of conditions stack len expected 1 got " + stack.length );
					}
					var result = stack.pop() || null;
					console.log("getDeviceOverride: eval of " + cond[ic] +
						" yields (" + typeof(result) + ")" + String(result));
					if ( result !== true ) {
						match = false;
						break;
					}
					console.log("getDeviceOverride: match condition " + cond[ic] +
						" succeeded for " + devnum + " (" + devobj.name + ") type " +
						devobj.device_type);
				}
				/* If all conditions met, return this override */
				if ( match ) {
					console.log("getDeviceOverride: all conditions succeeded for " +
						devnum + " (" + devobj.name + ") type " + devobj.device_type);
					return base.match[im].actions || [];
				}
			}
			/* None of the match specs matched */
			return base.actions || false;
		}
		return false;
	}

	/**
	 * Load the action menu for a device with the device data.
	 */
	function loadActionMenu( dev, actionMenu, row, data ) {
		if ( -1 === dev ) dev = api.getCpanelDeviceId();
		actionMenu.empty();
		var hasAction = false;
		var i, j, key;
		for ( i=0; i<(data.serviceList || []).length; i++ ) {
			var section = jQuery( "<select/>" );
			var service = data.serviceList[i];
			var opt;
			for ( j=0; j<(service.actionList || []).length; j++ ) {
				var nodata = false;
				var actname = service.actionList[j].name;
				var ai;
				if ( deviceInfo.services[service.serviceId] && (deviceInfo.services[service.serviceId].actions || {})[actname] ) {
					/* Have extended data */
					ai = deviceInfo.services[service.serviceId].actions[actname];
				} else {
					/* No extended data; copy what we got from lu_actions */
					nodata = true;
					ai = { service: service.serviceId, action: actname, parameters: service.actionList[j].arguments, noddb: true };
					for ( var ip=0; ip < (service.actionList[j].arguments || []).length; ++ip ) {
						var p = service.actionList[j].arguments[ip];
						p.type = p.dataType || "string";
						if ( ! p.defaultValue ) {
							p.optional = 1;
						} else {
							p.default = p.defaultValue;
						}
					}
				}
				key = service.serviceId + "/" + actname;
				if ( actions[key] === undefined ) {
					// Save action data as we use it.
					ai.deviceOverride = {};
					ai.service = service.serviceId;
					actions[key] = ai;
				}
				if ( ai.hidden ) {
					continue;
				}

				opt = jQuery( '<option/>' ).val( key ).text( actname + ( nodata ? "??(E)" : "") );
				if ( nodata ) opt.addClass( "nodata" );
				section.append( opt );

				hasAction = true;
			}
			if ( jQuery("option", section).length > 0 ) {
				opt = jQuery( '<optgroup />' ).attr( 'label', service.serviceId.replace(/^([^:]+:)+/, "") );
				opt.append( section.children() );
				actionMenu.append( opt );
			}
		}

		try {
			var over = getDeviceOverride( dev );
			if ( over ) {
				var known = jQuery( '<optgroup />' ).attr( 'label', 'Common Actions' );
				for ( j=0; j<over.length; j++ ) {
					var thisover = over[j];
					key = thisover.service + "/" + thisover.action;
					var el = jQuery( '<option/>' ).val( key );
					if ( undefined === actions[key] || actions[key].noddb ) {
						/* Service+action not in lu_actions or no DDB data for it */
						el.text( String(thisover.description || thisover.action) + '??(M)' );
						el.prop( 'disabled', true );
					} else {
						/* There's a well-known service/action, so copy it, and apply overrides */
						var act;
						if ( undefined === ( actions[key].deviceOverride||{} )[dev] ) {
							/* Store new action override */
							var actinfo = deviceInfo.services[thisover.service].actions[thisover.action];
							act = { service: thisover.service, name: thisover.action };
							for ( var k in actinfo ) {
								if ( actinfo.hasOwnProperty(k) ) {
									act[k] = actinfo[k];
								}
							}
							/* Apply overrides */
							for ( k in thisover ) {
								if ( thisover.hasOwnProperty(k) ) {
									act[k] = thisover[k];
								}
							}
							if ( undefined === actions[key].deviceOverride ) {
								actions[key].deviceOverride = {};
							}
							actions[key].deviceOverride[dev] = act;
						} else {
							/* Override already processed; re-use */
							act = actions[key].deviceOverride[dev];
							if ( act.hidden ) continue;
						}
						el.text( act.description || act.name );
					}
					known.append( el );
					hasAction = true;
				}
				actionMenu.prepend( known );
			}
		} catch(e) {
			console.log(String(e));
			alert(String(e));
		}

		var lopt = jQuery( '<option selected/>' ).val( "" ).text( hasAction ? "--choose action--" : "(invalid device--no actions)" );
		actionMenu.prepend( lopt );
		actionMenu.prop( 'disabled', false );
		jQuery( 'option:first', actionMenu ).prop( 'selected' );
	}

	function changeActionDevice( row, newVal, fnext, fargs, retries ) {
		var ct = jQuery( 'div.actiondata', row );
		var actionMenu = jQuery( 'select#actionmenu', ct );

		// Clear the action menu and remove all arguments.
		actionMenu.empty().prop( 'disabled', true )
			.append( jQuery( '<option/>' ).val("").text( '(loading...)' ) );
		jQuery('label,.argument', ct).remove();
		if ( "number" !== typeof(newVal) ) return;

		/**
		 * Use actions/lu_actions to get list of services/actions for this
		 * device. We could also use lu_device and fetch/parse /luvd/S_...xml
		 * to get even more data, but let's see how this goes for now.
		 * Wrap the request in a Promise, so that subsequent requests for the
		 * same device can use the same data without an additional request (and
		 * will block until the original request/Promise is fulfilled).
		 */
		if ( -1 === newVal ) newVal = api.getCpanelDeviceId();
		var devobj = api.getDeviceObject( newVal );
		if ( !devobj ) return;
		if ( undefined === deviceActionData[devobj.device_type] ) {
			deviceActionData[devobj.device_type] = Promise.resolve( jQuery.ajax(
				{
					url: api.getDataRequestURL(),
					data: {
						id: "actions",
						DeviceNum: newVal,
						output_format: "json"
					},
					dataType: "json",
					timeout: 15000
				}
			) );
		}
		deviceActionData[devobj.device_type].then( function( data, statusText, jqXHR ) {
			/* Success */
			loadActionMenu( newVal, actionMenu, row, data );
			if ( undefined !== fnext ) {
				fnext.apply( null, fargs );
			}
		}, function( jqXHR, textStatus, errorThrown ) {
			/* Failed. And deviceinfo as a fallback isn't really appropriate here (only lists exceptions) */
			console.log("changeActionDevice: failed to load service data: " + textStatus + "; " + String(errorThrown));
			console.log(jqXHR.responseText);
			retries = ( undefined === retries ? 0 : retries ) + 1;
			if ( retries > 10 ) {
				alert("Unable to load service data for this device. If you are on a remote connection, the connection to your Vera may have been lost.");
				actionMenu.empty().append( '<option value="">[ERROR--failed to get actions from Vera]</option>' );
				actionMenu.prop( 'disabled', false );
				actionMenu.val("");
				if ( undefined !== fnext ) {
					fnext.apply( null, fargs );
				}
				return;
			}
			/* Set up a retry */
			window.setTimeout( function() {
				return changeActionDevice( row, newVal, fnext, fargs, retries );
			}, 3000 );
		});
	}

	function handleActionDeviceChange( ev ) {
		configModified = true;
		var el = jQuery( ev.currentTarget );
		var newVal = parseInt( el.val() );
		if ( ! isNaN( newVal ) ) {
			var row = el.closest( 'div.actionrow' );
			changeActionDevice( row, newVal, changeActionRow, [ row ] );
		}
	}

	/* Convert plain textarea to ACE. Keep the textarea as shadow field for content
	 * that's synced with ACE content--it's easier to read from that (and consistent) */
	function doEditor( field ) {
		var ediv = jQuery( '<div class="editor"/>' );
		ediv.insertAfter( field );
		var editor = ace.edit( ediv.get(0), {
			minLines: 8,
			maxLines: 32,
			theme: "ace/theme/xcode",
			mode: "ace/mode/lua",
			fontSize: "16px",
			tabSize: 4
		});
		/* Apply options from state if set */
		var myid = api.getCpanelDeviceId();
		var exopts = api.getDeviceState( myid, serviceId, "AceOptions" ) || "";
		if ( isEmpty( exopts ) ) {
			exopts = getParentState( "AceOptions" ) || "";
		}
		if ( ! isEmpty( exopts ) ) {
			try {
				var opts = JSON.parse( exopts );
				if ( opts !== undefined ) {
					editor.setOptions( opts );
				}
			} catch( e ) {
				alert("Can't apply your custom AceOptions: " + String(e));
			}
		}
		var session = editor.session;
		session.setValue( field.val() || "" );
		editor.on( 'change', function( delta ) { field.val( session.getValue() ); } );
		editor.on( 'blur', handleActionValueChange );
			/* Finally, hide our field, remove any change action, and add a custom action
		   to reload ACE from the field. */
		field.off( 'change.reactor' ).hide();
		field.on( 'reactorinit', function() { session.setValue( field.val() || "" ); } );
	}

	function makeDeviceGroupMenu( dev, $m ) {
		var $row = $m.closest( '.actionrow' );

		/* Parent group */
		var $grpel = $row.closest( '.actionlist' );
		var grp = String( $grpel.attr( 'id' ) || "" ).replace( /\.(true|false)$/i, "" );

		/* Get root condition (group) of selected device */
		var root = getConditionIndex().root;
		if ( ! isNaN( dev ) && dev >= 0 ) {
			root = ( ( ( getConfiguration( dev ) || {} ).conditions ) || {} ).root;
			grp = null;
			$m.val("*");
			jQuery( 'option[value=""]', $m ).prop( 'disabled', true );
		} else {
			jQuery( 'option[value=""]', $m ).prop( 'disabled', false );
		}
		DOtraverse( root || {}, function( node ) {
			$m.append( jQuery( '<option/>' )
				.addClass( "groupoption" )
				.val( node.id )
				.text( makeConditionDescription( node ) ) );
		}, false, function( node ) {
			/* If node is not ancestor (line to root) or descendent of cond, allow as predecessor */
			return "group" === ( node.type || "group" ) && "nul" !== node.operator;
		});
		return $m;
	}

	function makeDeviceActivityMenu( dev, $m ) {
		var $row = $m.closest( '.actionrow' );

		/* Parent group */
		var $grpel = $row.closest( '.actionlist' );
		var grp = String( $grpel.attr( 'id' ) || "" ).replace( /\.(true|false)$/i, "" );

		/* Get root condition (group) of selected device */
		var root = getConditionIndex().root;
		if ( dev >= 0 ) {
			root = ( ( ( getConfiguration( dev ) || {} ).conditions ) || {} ).root;
			grp = null;
		}
		DOtraverse( root || {}, function( node ) {
				$m.append( jQuery( '<option/>' ).val( node.id + ".true" ).text( node.name + " is true" ) )
					.append( jQuery( '<option/>' ).val( node.id + ".false" ).text( node.name + " is false" ) );
			}, false, function( node ) {
				return node.id !== grp && "group" === ( node.type || "group" ) && "nul" !== node.operator;
			}
		);
		return $m;
	}

	function changeActionType( row, newVal ) {
		var ct = jQuery('div.actiondata', row);
		var $m;
		ct.empty().addClass( "form-inline" );
		jQuery( 'button#action-try,button#action-import', row ).hide();

		switch ( newVal ) {
			case "comment":
				ct.append('<input type="text" id="comment" class="argument form-control form-control-sm" placeholder="Enter comment text" autocomplete="off">');
				jQuery( 'input', ct ).on( 'change.reactor', handleActionValueChange );
				break;

			case "device":
				ct.append( makeDeviceMenu( "", "" ) );
				ct.append('<select id="actionmenu" class="form-control form-control-sm"></select>');
				jQuery( 'select.devicemenu', ct ).on( 'change.reactor', handleActionDeviceChange );
				jQuery( 'select#actionmenu', ct ).on( 'change.reactor', handleActionActionChange );
				jQuery( 'button#action-try', row ).show();
				break;

			case "housemode":
				$m = jQuery( '<select id="housemode" class="form-control form-control-sm">')
					.append( '<option value="1">Home</option>' ).append( '<option value="2">Away</option>' )
					.append( '<option value="3">Night</option>' ).append( '<option value="4">Vacation</option>' )
					.on( 'change.reactor', handleActionValueChange );
				ct.append( $m );
				break;

			case "delay":
				ct.append('<label for="delay">for <input type="text" id="delay" class="argument narrow form-control form-control-sm" title="Enter delay time as seconds, MM:SS, or HH:MM:SS" placeholder="delay time" list="reactorvarlist"></label>');
				ct.append('<select id="delaytype" class="form-control form-control-sm"><option value="inline">from this point</option><option value="start">from start of actions</option></select>');
				jQuery( 'input', ct ).on( 'change.reactor', handleActionValueChange );
				jQuery( 'select', ct ).on( 'change.reactor', handleActionValueChange );
				break;

			case "runscene":
				$m = makeSceneMenu()
					.attr('id', 'scene')
					.prepend('<option value="" selected>--choose--</option>')
					.val("")
					.on( 'change.reactor', handleActionValueChange );
				ct.append( $m );
				jQuery( '<select id="method" class="form-control form-control-sm"><option value="" selected">Use Reactor to run scene</option><option value="V">Hand off to Luup</option></select>' )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( ct );
				getWiki( "Run-Scene-Action" ).appendTo( ct );
				jQuery( 'button#action-import', row ).show();
				break;

			case "runlua":
				/* Handle upgrade to ACE separately */
				ct.append( '<textarea id="lua" wrap="off" autocorrect="off" autocomplete="off" autocapitalize="off" spellcheck="off" class="luacode form-control form-control-sm" rows="6"/>' );
				if ( window.ace ) {
					doEditor( jQuery( 'textarea.luacode', ct ) );
				} else {
					jQuery( 'textarea.luacode', ct ).on( 'change.reactor', handleActionValueChange );
				}
				ct.append('<div class="tbhint">If your Lua code returns boolean <em>false</em>, scene execution will stop and the remaining actions that follow will not be run (this is a feature). It is also recommended that the first line of your Lua be a comment with text to help you identify the code--if there\'s an error logged, the first line of the script is almost always shown. Also, you can use the <tt>print()</tt> function to write to Reactor\'s event log, which is shown in the Logic Summary and easier/quicker to get at than the Vera log file.</div>');
				break;

			case "rungsa":
				makeDeviceMenu( "", "", function( devobj ) {
						return devobj.device_type === deviceType;
					})
					.val( "-1" )
					.on( 'change', function( ev ) {
						var $el = jQuery( ev.currentTarget );
						var newVal = parseInt( $el.val() || -1 );
						var $row = $el.closest( '.actionrow' );
						var $m = jQuery( 'select#activity', $row ).empty();
						if ( !isNaN( newVal ) ) {
							makeDeviceActivityMenu( newVal, $m ).val( "root.true" );
						} else {
							$(this).addClass( "tberror" );
							$m.addClass( "tberror" );
						}
						handleActionValueChange( ev );
					}).appendTo( ct );
				$m = jQuery( '<select/>', { id: "activity", class: "form-control form-control-sm" } )
					.appendTo( ct );
				makeDeviceActivityMenu( -1, $m )
					.val( "root.true" )
					.on( 'change.reactor', handleActionValueChange );
				break;

			case "resetlatch":
				makeDeviceMenu( "", "", function( devobj ) {
						return devobj.device_type === deviceType;
					})
					.val( "-1" )
					.on( 'change', function( ev ) {
						var $el = jQuery( ev.currentTarget );
						var newVal = parseInt( $el.val() || -1 );
						var $row = $el.closest( '.actionrow' );
						var $m = jQuery( 'select#group', $row ).val("*");
						jQuery( "option.groupoption", $m ).remove();
						if ( !isNaN( newVal ) ) {
							makeDeviceGroupMenu( newVal, $m );
						} else {
							$(this).addClass( "tberror" );
							$m.addClass( "tberror" );
						}
						handleActionValueChange( ev );
					}).appendTo( ct );
				$m = jQuery( '<select id="group" class="form-control form-control-sm" />' )
					.appendTo( ct );
				makeDeviceGroupMenu( -1, $m )
					.prepend( '<option value="*">(all groups)</option>' )
					.prepend( '<option value="" selected>(this group)</option>' )
					.val( "*" )
					.on( 'change.reactor', handleActionValueChange );
				break;

			case "notify":
				ct.removeClass( "form-inline" );
				jQuery('<input type="hidden" id="notifyid" value="">').appendTo( ct );
				var fs = jQuery('<fieldset id="users"/>').appendTo( ct );
				for ( var k in userIx ) {
					if ( userIx.hasOwnProperty( k ) ) {
						getCheckbox( getUID( "chk" ), k, userIx[k].name || k )
							.on( 'change.reactor', handleActionValueChange )
							.appendTo( fs );
					}
				}
				jQuery('<input id="message" class="form-control form-control-sm" value="">')
					.attr( 'placeholder', 'Enter message' )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( ct );
				break;

			default:
				jQuery( '<input type="hidden" id="unrecdata">' ).appendTo( ct );
				jQuery( '<div>This action is not editable.</div>' ).appendTo( ct );
				/* See loadActions */
		}
	}

	function handleActionChange( ev ) {
		configModified = true;
		var row = jQuery( ev.currentTarget ).closest( '.actionrow' );
		var newVal = jQuery( 'select#actiontype', row ).val();
		changeActionType( row, newVal );
		changeActionRow( row );
	}

	function handleActionControlClick( ev ) {
		var el = ev.currentTarget;
		if ( jQuery( el ).prop('disabled') ) {
			return;
		}
		var row = jQuery(el).closest('div.actionrow');
		var op = jQuery( el ).attr('id');
		switch ( op ) {
			case "action-up":
				/* Move up in display */
				var prior = row.prev( 'div.actionrow' ); /* find prior row */
				if ( prior.length > 0 ) {
					row.detach();
					row.insertBefore( prior );
					changeActionRow( row ); /* pass it on */
				}
				break;

			case "action-down":
				/* Move down in display */
				var next = row.next( 'div.actionrow' );
				if ( next.length > 0 ) {
					row.detach();
					row.insertAfter( next );
					changeActionRow( row );
				}
				break;

			case "action-delete":
				var list = row.closest( 'div.actionlist' );
				row.remove();
				jQuery( 'div.actionlist' ).addClass( "tbmodified" ); // all lists, because save saves all.
				updateActionList( list );
				updateActionControls(); /* handles save controls too */
				break;

			case "action-try":
				if ( jQuery( '.tberror', row ).length > 0 ) {
					alert( 'Please fix the errors before attempting to run this action.' );
					return;
				}
				var typ = jQuery( 'select#actiontype', row ).val() || "comment";
				if ( "device" === typ ) {
					var d = parseInt( jQuery( 'select.devicemenu', row ).val() );
					if ( -1 === d ) d = api.getCpanelDeviceId();
					var s = jQuery( 'select#actionmenu', row ).val() || "";
					var pt = s.split( /\//, 2 );
					// var act = (deviceInfo.services[pt[0]] || { actions: {} }).actions[pt[1]];
					var act = actions[s];
					if ( act && (act.deviceOverride || {})[d] ) {
						act = act.deviceOverride[d];
					}
					var param = {};
					var actionText = s + "(";
					if ( act ) {
						for ( var k=0; k<(act.parameters || []).length; ++k ) {
							var p = act.parameters[k];
							if ( undefined !== p.value ) {
								/* Fixed value */
								param[p.name] = p.value;
								actionText += "{" + p.name + "=" + String(p.value) + "}, ";
							} else {
								var v = (jQuery( '#' + idSelector( p.name ), row ).val() || "").trim();
								var vn = v.match( varRefPattern );
								if ( vn && vn.length == 2 ) {
									/* Variable reference, get current value. */
									v = api.getDeviceState( api.getCpanelDeviceId(), "urn:toggledbits-com:serviceId:ReactorValues", vn[1] ) || "";
								}
								if ( "" === v && undefined !== p.default ) v = p.default;
								if ( "" === v && p.optional ) continue;
								param[p.name] = v;
								actionText += p.name + "=" + quot(v) + ", ";
							}
						}
					} else {
						/* No action info whatsoever, build from fields */
						jQuery( '.argument', row ).each( function() {
							var val = jQuery( this ).val();
							var vname = jQuery( this ).attr('id');
							param[ vname ] = val;
							actionText += vname + "=" + quot(val) + ", ";
						});
					}
					actionText += '): ';

					api.performActionOnDevice( d, pt[0], pt[1], {
						actionArguments: param,
						onSuccess: function( xhr ) {
							console.log(actionText + "performActionOnDevice.onSuccess: " + String(xhr));
							if (typeof(xhr)==="object") {
								for ( var k in xhr ) {
									if ( xhr.hasOwnProperty(k) )
										console.log("xhr." + k + "=" + String(xhr[k]));
								}
							}
							if ( "object" === typeof( xhr ) ) {
								if ( xhr.responseText && xhr.responseText.match( /ERROR:/ ) ) {
									alert( actionText + xhr.responseText );
								} else {
									alert( actionText + xhr.responseText );
								}
							}
							// alert( "The action completed successfully!" );
						},
						onFailure: function( xhr ) {
							//??? are there undocumented parameters here?
							if (typeof(xhr)==="object") {
								for ( var k in xhr ) {
									if ( xhr.hasOwnProperty(k) )
										console.log("xhr." + k + "=" + String(xhr[k]));
								}
							}
							alert( "An error occurred. Try again in a moment; Vera may be busy." );
						}
					} );
				} else {
					alert( "Can't perform selected action. You should not be seeing this message." );
				}
				break;

			case "action-import":
				if ( "runscene" !== jQuery( 'select#actiontype', row ).val() ) {
					return;
				}
				if ( jQuery( '.tberror', row ).length > 0 ) {
					return;
				}
				var scene = parseInt( jQuery( 'select#scene', row ).val() );
				if ( !isNaN( scene ) ) {
					jQuery.ajax({
						url: api.getDataRequestURL(),
						data: {
							id: "scene",
							action: "list",
							scene: scene,
							output_format: "json"
						},
						dataType: "json",
						timeout: 5000
					}).done( function( data, statusText, jqXHR ) {
						var pred = row;
						var newRow;
						if ( ! isEmpty( data.lua ) ) {
							/* Insert Lua */
							var lua = (data.encoded_lua || 0) != 0 ? atob(data.lua) : data.lua;
							newRow = getActionRow();
							jQuery( "select#actiontype", newRow).val( "runlua" );
							changeActionType( newRow, "runlua" );
							jQuery( "textarea.luacode", newRow ).val( lua ).trigger( "reactorinit" );
							pred = newRow.addClass( "tbmodified" ).insertAfter( pred );
						}
						/* Sort groups by delay ascending */
						data.groups = data.groups || [];
						data.groups.sort( function( a, b ) { return (a.delay||0) - (b.delay||0); });
						for ( var ig=0; ig<(data.groups || []).length; ig++ ) {
							var gr = data.groups[ig];
							if ( 0 != (gr.delay || 0) ) {
								/* Delayed group -- insert delay action */
								newRow = getActionRow();
								jQuery( "select#actiontype", newRow).val( "delay" );
								changeActionType( newRow, "delay" );
								jQuery( "input#delay", newRow ).val( gr.delay );
								jQuery( "select#delaytype", newRow ).val( "start" );
								pred = newRow.addClass( "tbmodified" ).insertAfter( pred );
							}
							for ( var k=0; k < (gr.actions || []).length; k++ ) {
								var act = gr.actions[k];
								newRow = getActionRow();
								jQuery( 'select#actiontype', newRow).val( "device" );
								changeActionType( newRow, "device" );
								if ( 0 == jQuery( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
									var opt = jQuery( '<option/>' ).val( act.device ).text( '#' + act.device + ' ' + ( act.deviceName || 'name?' ) + ' (missing)' );
									// opt.insertAfter( jQuery( 'select.devicemenu option[value=""]:first', newRow ) );
									jQuery( 'select.devicemenu', newRow ).prepend( opt ).addClass( "tberror" );
								}
								jQuery( 'select.devicemenu', newRow ).val( act.device );
								pred = newRow.addClass( "tbmodified" ).insertAfter( pred );
								changeActionDevice( newRow, parseInt( act.device ), function( row, action ) {
									var key = action.service + "/" + action.action;
									if ( 0 == jQuery( 'select#actionmenu option[value="' + key + '"]', row ).length ) {
										var opt = jQuery( '<option/>' ).val( key ).text( key );
										jQuery( 'select#actionmenu', row ).prepend( opt ).prop( 'disabled', false );
									}
									jQuery( 'select#actionmenu', row ).val( key );
									changeActionAction( row, key );
									for ( var j=0; j<(action.arguments || []).length; j++ ) {
										var a = action.arguments[j];
										if ( 0 === jQuery( '#' + idSelector( a.name ), row ).length ) {
											var inp = jQuery( '<input class="argument form-control form-control-sm">' ).attr('id', a.name);
											var lbl = jQuery( '<label/>' ).attr('for', a.name).text(a.name).addClass('tbrequired').append(inp);
											jQuery( 'div.actiondata', row ).append( lbl );
										}
										jQuery( '#' + idSelector( a.name ), row ).val( a.value || "" );
									}
								}, [ newRow, act ]);
							}
						}

						/* All actions inserted. Remove original row. */
						row.remove();
						configModified = true;
						changeActionRow( row );
					}).fail( function( jqXHR, textStatus, errorThrown ) {
						// Bummer.
						console.log("Failed to load scene data: " + textStatus + " " + String(errorThrown));
						console.log(jqXHR.responseText);
						alert( "Unable to load scene data. Luup may be reloading; try again in a moment." );
					});
				}
				break;

			default:
				/* nada */
		}
	}

	function getActionRow() {
		var row = jQuery( '<div class="row actionrow"></div>' );
		row.append( '<div class="col-xs-12 col-sm-12 col-md-4 col-lg-2"><select id="actiontype" class="form-control form-control-sm">' +
			'<option value="comment">Comment</option>' +
			'<option value="device">Device Action</option>' +
			'<option value="housemode">Change House Mode</option>' +
			'<option value="delay">Delay</option>' +
			( isOpenLuup ? "" : '<option value="notify">Notify</option>' ) +
			'<option value="runlua">Run Lua</option>' +
			'<option value="runscene">Run Scene</option>' +
			'<option value="rungsa">Run Group Activity</option>' +
			'<option value="resetlatch">Reset Latched</option>' +
			'</select></div>' );
		row.append('<div class="actiondata col-xs-12 col-sm-12 col-md-6 col-lg-8 form-inline"></div>');
		var controls = jQuery('<div class="controls col-xs-12 col-sm-12 col-md-2 col-lg-2 text-right"></div>');
		controls.append( '<button id="action-try" class="btn md-btn" title="Try this action"><i class="material-icons">directions_run</i></button>' );
		controls.append( '<button id="action-import" class="btn md-btn" title="Import scene to actions"><i class="material-icons">save_alt</i></button>' );
		controls.append( '<button id="action-up" class="btn md-btn" title="Move up"><i class="material-icons">arrow_upward</i></button>' );
		controls.append( '<button id="action-down" class="btn md-btn" title="Move down"><i class="material-icons">arrow_downward</i></button>' );
		controls.append( '<button id="action-delete" class="btn md-btn" title="Remove action"><i class="material-icons">clear</i></button>' );
		jQuery( 'button.md-btn', controls ).on( 'click.reactor', handleActionControlClick );
		jQuery( 'button#action-try,button#action-import', controls ).hide();
		row.append( controls );
		jQuery( 'select#actiontype', row ).val( 'comment' ).on( 'change.reactor', handleActionChange );
		changeActionType( row, "comment" );
		return row;
	}

	function handleAddActionClick( ev ) {
		var btn = jQuery( ev.currentTarget );
		var container = btn.closest( 'div.actionlist' );
		var newRow = getActionRow();
		newRow.insertBefore( jQuery( '.buttonrow', container ) );
		container.addClass( 'tbmodified' );
		newRow.addClass( 'tbmodified' );
		configModified = true;
		updateActionControls();
	}

	function loadActions( section, scene ) {
		var insertionPoint = jQuery( 'div.buttonrow', section );
		var newRow;
		for ( var i=0; i < (scene.groups || []).length; i++ ) {
			var gr = scene.groups[i];
			if ( 0 !== (gr.delay || 0) ) {
				newRow = getActionRow();
				jQuery( "select#actiontype", newRow ).val( "delay" );
				changeActionType( newRow, "delay" );
				jQuery( "input#delay", newRow ).val( gr.delay );
				jQuery( "select#delaytype", newRow ).val( gr.delaytype || "inline" );
				newRow.insertBefore( insertionPoint );
			}
			for ( var k=0; k < (gr.actions || []).length; k++ ) {
				var $m;
				var act = gr.actions[k];
				newRow = getActionRow();
				jQuery( 'select#actiontype', newRow).val( act.type || "comment" );
				changeActionType( newRow, act.type || "comment" );
				switch ( act.type ) {
					case "comment":
						jQuery( 'input', newRow ).val( act.comment || "" );
						break;

					case "device":
						if ( 0 == jQuery( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
							var opt = jQuery( '<option/>' ).val( act.device ).text( '#' + act.device + ' ' + ( act.deviceName || 'name?' ) + ' (missing)' );
							// opt.insertAfter( jQuery( 'select.devicemenu option[value=""]:first', newRow ) );
							jQuery( 'select.devicemenu', newRow ).prepend( opt ).addClass( "tberror" );
						}
						jQuery( 'select.devicemenu', newRow ).val( act.device );
						changeActionDevice( newRow, parseInt( act.device ), function( row, action ) {
							var key = action.service + "/" + action.action;
							if ( 0 == jQuery( 'select#actionmenu option[value="' + key + '"]', row ).length ) {
								var opt = jQuery( '<option/>' ).val( key ).text( key );
								jQuery( 'select#actionmenu', row ).prepend( opt );
							}
							jQuery( 'select#actionmenu', row ).val( key );
							changeActionAction( row, key );
							for ( var j=0; j<(action.parameters || []).length; j++ ) {
								if ( false && 0 === jQuery( '#' + idSelector( action.parameters[j].name ), row ).length ) {
									var inp = jQuery( '<input class="argument form-control form-control-sm">' ).attr('id', action.parameters[j].name);
									var lbl = jQuery( '<label/>' ).attr('for', action.parameters[j].name).text(action.parameters[j].name).addClass('tbrequired').append(inp);
									jQuery( 'div.actiondata', row ).append( lbl );
								}
								jQuery( '#' + idSelector( action.parameters[j].name ), row ).val( action.parameters[j].value || "" );
							}
						}, [ newRow, act ]);
						break;

					case "runscene":
						if ( 0 === jQuery( 'select#scene option[value="' + act.scene + '"]', newRow ).length ) {
							/* Insert missing value (ref to non-existent scene) */
							var el = jQuery( '<option/>' ).val( act.scene ).text( ( act.sceneName || "name?" ) + ' (#' + act.scene + ') (missing)' );
							jQuery( 'select#scene', newRow ).prepend( el ).addClass( "tberror" );
						}
						jQuery( 'select#scene', newRow).val( act.scene );
						jQuery( 'select#method', newRow).val( act.usevera ? "V" : "" );
						break;

					case "housemode":
						jQuery( 'select#housemode', newRow ).val( act.housemode || 1 );
						break;

					case "runlua":
						var lua = "";
						if ( act.lua ) {
							lua = (act.encoded_lua || 0) != 0 ? atob( act.lua ) : act.lua;
						}
						jQuery( 'textarea.luacode', newRow ).val( lua ).trigger( 'reactorinit' );
						break;

					case "rungsa":
						if ( undefined !== act.device && 0 === jQuery( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
							jQuery( '<option/>' ).val( act.device )
								.text( '#' + act.device + ' ' + ( act.deviceName || 'name?' ) + ' (missing)' )
								.prependTo( jQuery( 'select.devicemenu', newRow ).addClass( "tberror" ) );
						}
						jQuery( 'select.devicemenu', newRow ).val( act.device || "-1" );
						$m = jQuery( 'select#activity', newRow );
						makeDeviceActivityMenu( act.device || -1, $m );
						if ( 0 === jQuery( 'option[value=' + quot(act.activity) + ']', $m ).length ) {
							jQuery( '<option/>' ).val( act.activity || "undef" )
								.text( ( act.activity || "name?" ) + " (missing)" )
								.prependTo( $m.addClass( 'tberror' ) );
						}
						$m.val( act.activity || "undef" );
						break;

					case "resetlatch":
						if ( undefined !== act.device && 0 === jQuery( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
							jQuery( '<option/>' ).val( act.device )
								.text( '#' + act.device + ' ' + ( act.deviceName || 'name?' ) + ' (missing)' )
								.prependTo( jQuery( 'select.devicemenu', newRow ).addClass( "tberror" ) );
						}
						jQuery( 'select.devicemenu', newRow ).val( act.device || "-1" );
						$m = jQuery( 'select#group', newRow );
						makeDeviceGroupMenu( act.device || -1, $m );
						if ( 0 === jQuery( 'option[value=' + quot(act.group) + ']', $m ).length ) {
							jQuery( '<option/>' ).val( act.group || "undef" )
								.text( ( act.group || "name?" ) + " (missing)" )
								.prependTo( $m.addClass( 'tberror' ) );
						}
						$m.val( act.group || "undef" );
						break;

					case "notify":
						jQuery( 'input#notifyid', newRow ).val( act.notifyid || "" );
						if ( "" !== ( act.notifyid || "" ) ) {
							var cf = getConfiguration();
							if ( undefined !== (cf.notifications || {} )[act.notifyid] ) {
								/* Update here if VA in use */
								if ( devVeraAlerts ) checkNotificationScene( false, act.notifyid );
								jQuery( 'input#message', newRow ).val( cf.notifications[act.notifyid].message || act.notifyid );
								var ua = cf.notifications[act.notifyid].users || "";
								if ( "" !== ua ) {
									ua = ua.split( /,/ );
									for ( var uk=0; uk<ua.length; uk++ ) {
										var $c = jQuery( 'fieldset#users input[value="' + ua[uk] + '"]', newRow );
										if ( 0 === $c.length ) {
											$c = getCheckbox( getUID( 'chk' ), ua[uk], ua[uk] + '?&nbsp;(unknown&nbsp;user)' );
											$c.appendTo( jQuery( 'fieldset#users', newRow ) );
										}
										$c.prop( 'checked', true );
									}
								}
								if ( devVeraAlerts && cf.notifications[act.notifyid].veraalerts ) {
									jQuery( '<div class="vanotice"/>' ).text("NOTE: This notification has been modified by VeraAlerts. In order for changes to be effective, they must be made in VeraAlerts. Also note that regardless of the configuration/use here, VA controls the recipients, message text, delivery, and filtering.")
										.insertAfter( jQuery( 'input#message', newRow ) );
									jQuery( 'input', newRow ).prop( 'disabled', true );
								}
							}
						}
						break;

					default:
						console.log("loadActions: what's a " + act.type + "? Skipping it!");
						alert( "Action type " + act.type + " unrecognized. Did you downgrade from a higher version of Reactor? I will try to preserve this action, but I can't edit it." );
						var $am = jQuery( 'select#actiontype', newRow );
						if ( 0 === jQuery( 'option[value="'+act.type+'"]', $am ).length ) {
							jQuery( '<option/>' ).val( act.type ).text( String(act.type) + ' (unrecognized)' )
								.prependTo( $am );
						}
						$am.val( act.type );
						jQuery( 'input#unrecdata', newRow ).val( JSON.stringify( act ) );
				}

				newRow.insertBefore( insertionPoint );
			}
		}
	}

	function handleActionCopyClick( ev ) {
		var $el = jQuery( ev.currentTarget );
		var source = $el.attr( 'id' ) || "";
		if ( "" === source ) return; /* clicked a non-clickable */

		var $target = $el.closest( 'div.actionlist' );

		/* Pass clone of actions so adding to ourselves isn't infinite loop */
		var cdata = getConfiguration();
		loadActions( $target, api.cloneObject( cdata.activities[source] || {} ) );
		updateActionList( $target );
		updateActionControls();
	}

	/**
	 * Handle click on activity expand/collapse.
	 */
	function handleActivityCollapseClick( ev ) {
		var $el = jQuery( ev.currentTarget );
		var $p = $el.closest( 'div.actionlist' );
		var $g = jQuery( 'div.activity-group', $p );
		if ( "collapse" === $el.attr( 'id' ) ) {
			$g.slideUp();
			$el.attr( 'id', 'expand' ).attr( 'title', 'Expand action' );
			jQuery( 'i', $el ).text( 'expand_more' );
			try {
				var n = jQuery( 'div.actionrow', $g ).length;
				jQuery( 'span#titlemessage', $p ).text( " (" + n +
					" action" + ( 1 !== n ? "s" : "" ) + " collapsed)" );
			} catch( e ) {
				jQuery( 'span#titlemessage', $p ).text( " (actions collapsed)" );
			}
		} else {
			$g.slideDown();
			$el.attr( 'id', 'collapse' ).attr( 'title', 'Collapse action' );
			jQuery( 'i', $el ).text( 'expand_less' );
			jQuery( 'span#titlemessage', $p ).text( "" );
		}
	}

	/* */
	function getActionListContainer() {
		var el = jQuery( "<div/>" ).addClass( "actionlist" );
		var row = jQuery( '<div class="row"/>' );
		row.append( '\
<div class="tblisttitle col-xs-9 col-sm-9 col-lg-10"> \
  <span class="titletext">?title?</span> \
  <button id="collapse" class="btn md-btn" title="Collapse action"><i class="material-icons">expand_less</i></button> \
  <span id="titlemessage" /> \
</div> \
<div class="tblisttitle col-xs-3 col-sm-3 col-lg-2 text-right"> \
  <div class="btn-group"> \
	<button id="saveconf" class="btn btn-xs btn-success">Save</button> \
	<button id="revertconf" class="btn btn-xs btn-danger">Revert</button> \
  </div> \
</div>' );
		el.append( row );
		/* activity-group is container for actionrows and buttonrow */
		var g = jQuery( '<div class="activity-group" />' );
		row = jQuery( '<div class="row buttonrow"/>' );
		row.append( '\
<div class="col-xs-12 col-sm-12"> \
  <div class="btn-group"> \
	<button class="addaction btn btn-sm btn-success">Add Action</button> \
	<div class="btn-group"> \
	  <button id="global-import" class="btn btn-sm btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Import activity or scene to this activity"> \
		Copy From <span class="caret"></span> \
	  </button> \
	  <ul id="activities" class="dropdown-menu"></ul> \
	</div> \
  </div> \
</div>' );
		g.append( row );
		el.append( g );
		return el;
	}

	function isEmptyActivity( act ) {
		return !act ||
			(act.groups || []).length == 0 ||
			(act.groups.length == 1 && (act.groups[0].actions || []).length == 0);
	}

	/* Handle change of activity visibility */
	function handleActivityVisChange( ev ) {
		var el = jQuery( ev.currentTarget );
		var vis = el.val() || "";
		setParentState( "showactivities", vis );
		var cd = getConfiguration();
		var ac = cd.activities || {};
		var decide = function( id ) {
			if ( "inuse" === vis && isEmptyActivity( ac[id] ) ) {
				jQuery( 'div#' + idSelector( id ) + ".actionlist" ).slideUp();
			} else {
				jQuery( 'div#' + idSelector( id ) + ".actionlist" ).slideDown();
			}
		};
		var scanActivities = function( grp ) {
			decide( grp.id + ".true" );
			decide( grp.id + ".false" );
			for ( var ix=0; ix<(grp.conditions || []).length; ix++ ) {
				if ( "group" === ( grp.conditions[ix].type || "group" ) ) {
					scanActivities( grp.conditions[ix] );
				}
			}
		};
		scanActivities( cd.conditions.root );
	}

	/* Redraw the activities lists within the existing tab structure. */
	function redrawActivities() {
		var myid = api.getCpanelDeviceId();
		var cd = getConfiguration( myid );
		var container = jQuery( 'div#activities' ).empty();

		var el = jQuery( '<div class="form-inline" />' )
			.append( jQuery( "<label>" ).text( "Show Activities: " )
				.append( jQuery( '<select id="whatshow" class="form-control form-control-sm" />' )
					.append( jQuery( '<option value="">All</option>' ) )
					.append( jQuery( '<option value="inuse">In Use</option>' ) )
				)
			);
		container.append( el );
		var showWhich = getParentState( "showactivities", myid ) || "";
		jQuery( 'select#whatshow', container ).on( 'change.reactor', handleActivityVisChange )
			.val( showWhich );

		var ul = jQuery( '<ul />' );
		var showedAny = false;
		var orderly = function( gr ) {
			if ( "nul" !== gr.operator ) {
				ul.append( jQuery( '<li />' ).attr( 'id', gr.id + ".true" ).text( ( gr.name || gr.id ) + " True" ) );
				ul.append( jQuery( '<li />' ).attr( 'id', gr.id + ".false" ).text( ( gr.name || gr.id ) + " False" ) );
				var scene = gr.id + '.true';
				el = getActionListContainer();
				el.attr( 'id', scene );
				jQuery( 'span.titletext', el ).text( 'When ' +
					( gr.name || gr.id ) + ' is TRUE' );
				container.append( el );
				loadActions( el, cd.activities[scene] || {} );
				if ( "inuse" === showWhich && isEmptyActivity( cd.activities[scene] ) ) {
					el.hide();
				}

				scene = gr.id + '.false';
				el = getActionListContainer();
				el.attr( 'id', scene );
				jQuery( 'span.titletext', el ).text( 'When ' +
					( gr.name || gr.id ) + ' is FALSE' );
				container.append( el );
				loadActions( el, cd.activities[scene] || {} );
				if ( "inuse" === showWhich && isEmptyActivity( cd.activities[scene] ) ) {
					el.hide();
				}

				showedAny = true;
			}

			/* Handle children of this group */
			for ( var ix=0; ix<(gr.conditions || []).length; ix++ ) {
				var cond = gr.conditions[ix];
				if ( "group" === ( cond.type || "group" ) ) {
					orderly( cond );
				}
			}
		};
		orderly( ( cd.conditions || {} ).root || [ { id: "root", conditions: [] } ] );

		if ( ! showedAny ) {
			container.append( jQuery( '<div/>' )
				.html( '<em>There are no groups eligible for activities.</em>' ) );
		} else if ( "" !== showWhich ) {
			container.append( jQuery( '<div/>' )
				.text( 'Not all possible activities are being shown. Choose "All" from the "Show Activities" menu at top to see everything.' ) );
		}

		jQuery("div#tab-actions.reactortab button#collapse").on( 'click.reactor', handleActivityCollapseClick );
		jQuery("div#tab-actions.reactortab button.addaction").on( 'click.reactor', handleAddActionClick );
		jQuery("div#tab-actions.reactortab ul#activities").empty().append( ul.children() );
		jQuery("div#tab-actions.reactortab ul#activities li").on( 'click.reactor', handleActionCopyClick );
		jQuery("div#tab-actions.reactortab button#saveconf").on( 'click.reactor', handleActionsSaveClick )
			.prop( "disabled", !configModified );
		jQuery("div#tab-actions.reactortab button#revertconf").on( 'click.reactor', handleRevertClick )
			.prop( "disabled", !configModified );

		updateActionControls();
	}

	/* Set up the Activities tab */
	function doActivities()
	{
		console.log("doActivities()");

		var myid = api.getCpanelDeviceId();

		try {
			jQuery( 'div#tbcopyright' ).append('<span> Reactor device info ver ' + String(deviceInfo.serial) + '</span>');
		}
		catch (e) {}

		try {
			var cd = getConfiguration( myid );

			/* Set up a data list with our variables */
			var dl = jQuery( '<datalist id="reactorvarlist" />' );
			if ( cd.variables ) {
				for ( var vname in cd.variables ) {
					if ( cd.variables.hasOwnProperty( vname ) ) {
						var opt = jQuery( '<option/>' ).val( '{'+vname+'}' ).text( '{'+vname+'}' );
						dl.append( opt );
					}
				}
			}
			jQuery( 'div#tab-actions.reactortab' ).append( dl );

			redrawActivities();

			if ( undefined !== deviceInfo ) {
				var uc = jQuery( '<div id="di-ver-check"/>' );
				uc.insertBefore( jQuery( 'div#tripactions' ) );
				jQuery.ajax({
					url: "https://www.toggledbits.com/deviceinfo/checkupdate.php",
					data: {
						"v": deviceInfo.serial,
						"fw": ""
					},
					dataType: "jsonp",
					jsonp: "callback",
					crossDomain: true,
					timeout: 10000
				}).done( function( respData, statusText, jqXHR ) {
					console.log("Response from server is " + JSON.stringify(respData));
					if ( undefined !== respData.serial && respData.serial > deviceInfo.serial ) {
						jQuery( 'div#di-ver-check' ).empty().append( "<p>A newer version of the device information database is available. Please use the update function on the Tools tab to get it. This process is quick and does not require a Luup reload or browser refresh--you can immediately come back here and go right back to work! The new version is " +
							String(respData.serial) + ", and you are currently using " + String(deviceInfo.serial) + ".</p>" );
					}
				}).fail( function( jqXHR, textStatus, errorThrown ) {
					console.log( "deviceInfo version check failed: " + String(errorThrown) );
				});
			}
		}
		catch (e)
		{
			console.log( 'Error in ReactorSensor.doActivities(): ' + String( e ) );
			alert( e.stack );
		}
	}

	function preloadActivities() {
		if ( configModified && confirm( msgUnsavedChanges) ) {
			handleSaveClick( undefined );
		}

		if ( ! initModule() ) {
			return;
		}

		header();

		/* Our styles. */
		var html = "<style>";
		html += "div#tab-actions.reactortab datalist { display: none; }";
		html += "div#tab-actions.reactortab div#di-ver-check p { margin: 8px 8px 8px 8px; padding: 8px 8px 8px 8px; border: 2px solid yellow; }";
		html += "div#tab-actions.reactortab .color-green { color: #428BCA; }";
		html += 'div#tab-actions.reactortab .tberrmsg { padding: 8px 8px 8px 8px; color: red; }';
		html += 'div#tab-actions.reactortab div.actionlist { border-radius: 8px; border: 2px solid #428BCA; margin-bottom: 16px; }';
		html += 'div#tab-actions.reactortab div.actionlist .row { margin-right: 0px; margin-left: 0px; }';
		html += 'div#tab-actions.reactortab div.tblisttitle { background-color: #428BCA; color: #fff; padding: 4px 8px; min-height: 45px; }';
		html += 'div#tab-actions.reactortab div.tblisttitle span.titletext { font-size: 16px; font-weight: bold; margin-right: 1em; }';
		html += 'div#tab-actions.reactortab div.actionlist label:not(.required) { font-weight: normal; }';
		html += 'div#tab-actions.reactortab div.actionlist label.required { font-weight: bold; }';
		html += 'div#tab-actions.reactortab div.actionlist.tbmodified div.tblisttitle span.titletext:after { content: " (unsaved)" }';
		html += 'div#tab-actions.reactortab div.actionrow,div.buttonrow { padding: 8px; }';
		html += 'div#tab-actions.reactortab div.actionlist div.actionrow:nth-child(odd) { background-color: #EFF6FF; }';
		html += 'div#tab-actions.reactortab div.actionrow.tbmodified:not(.tberror) { border-left: 4px solid green; }';
		html += 'div#tab-actions.reactortab div.actionrow.tberror { border-left: 4px solid red; }';
		html += 'div#tab-actions.reactortab input#comment { width: 100% !important; }';
		html += 'div#tab-actions.reactortab textarea.luacode { font-family: monospace; resize: vertical; width: 100% !important; }';
		html += 'div#tab-actions.reactortab div.editor { width: 100%; min-height: 240px; }';
		html += 'div#tab-actions.reactortab div.tbhint { font-size: 90%; font-weight: normal; }';
		html += 'div#tab-actions.reactortab div.warning { color: red; }';
		html += 'div#tab-actions.reactortab option.nodata { font-style: italic; }';
		html += 'div#tab-actions.reactortab option.nodata:after { content: "[1] see footer"; }';
		html += 'div#tab-actions.reactortab .tbslider { display: inline-block; width: 200px; height: 1em; border-radius: 8px; }';
		html += 'div#tab-actions.reactortab .tbslider .ui-slider-handle { background: url("/cmh/skins/default/img/other/slider_horizontal_cursor_24.png?") no-repeat scroll left center rgba(0,0,0,0); cursor: pointer !important; height: 24px !important; width: 24px !important; margin-top: 6px; font-size: 12px; text-align: center; padding-top: 4px; text-decoration: none; }';
		html += 'div#tab-actions.reactortab .tbslider .ui-slider-range-min { background-color: #12805b !important; }';
		html += 'div#tab-actions.reactortab ul.dropdown-menu { color: #333; background-color: white; border: 1px solid #333; text-align: initial; padding: 4px 4px; width: 320px; max-height: 320px; overflow: auto; }';
		html += 'div#tab-actions.reactortab ul.dropdown-menu li:hover { color: white; background-color: #333; }';
		html += "</style>";
		jQuery("head").append( html );

		api.setCpanelContent( '<div id="loading">Please wait... loading device and activity data, which may take a few seconds.</div>' );

		/* Load the device data */
		var start = Date.now();
		var urlbase = api.getDataRequestURL();
		console.log("Base URL: " + urlbase);
		urlbase = urlbase.replace( /data_request.*$/i, "" );
		console.log("Fetching " + urlbase + "D_ReactorDeviceInfo.json");
		jQuery.ajax({
			url: urlbase + "D_ReactorDeviceInfo.json",
			dataType: "json",
			timeout: 15000
		}).done( function( data, statusText, jqXHR ) {
			console.log("D_ReactorDeviceInfo loaded (" + String(Date.now()-start) +
				"ms), timestamp=" + String(data.timestamp) + ", serial=" +
				String(data.serial));
			if ( (data.serial || 0) < DEVINFO_MINSERIAL ) {
				jQuery("div#loading").empty().append( '<h3>Update Required</h3>Your device information database file needs to be at least serial ' + String(DEVINFO_MINSERIAL) + ' to run with this version of Reactor. Please go to the Tools tab to update it, then come back here.' );
				return;
			}

			deviceInfo = data;

			/* Body content */
			html += '<div id="tab-actions" class="reactortab">';

			html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Activities</h3></div></div>';

			html += '<div id="activities"/>';

			html += '</div>'; // tab-actions

			html += footer();

			jQuery('div#loading').replaceWith( html );

			doActivities();
		}).fail( function( jqXHR, textStatus, errorThrown ) {
			// Bummer.
			console.log("Failed to load D_ReactorDeviceInfo.json: " + textStatus + " " + String(errorThrown));
			console.log(jqXHR.responseText);
			deviceInfo = { services: {}, devices: {} };
			if ( jqXHR.status == 500 ) {
				jQuery('div#loading').html("<b>Sorry, not able to load data at this moment!</b> Vera may be busy or reloading. Don't panic! Wait a moment, switch to the Status tab, and then back here to retry loading.");
			} else {
				jQuery('div#loading').html('<h1>Hmmm...</h1>Well, that didn\'t go well. Try waiting a few moments, and then switching back to the Status tab and then back to this tab. If that doesn\'t work, please <a href="mailto:reactor@toggledbits.com?subject=Reactor+Activities+Load+Problem">send email to reactor@toggledbits.com</a> with the following text: <pre id="diag"></pre>');
				var str = String(errorThrown) + "\n" + String(textStatus);
				for ( var k in jqXHR ) {
					if ( jqXHR.hasOwnProperty(k) && typeof(jqXHR[k]) != "function" ) {
						str += "\n" + k + '=' + String(jqXHR[k]);
					}
				}
				jQuery('#diag').text( str );
			}
		});
	}

 /** ***************************************************************************
 *
 * T O O L S
 *
 ** **************************************************************************/

	function grabLog( ev ) {
		jQuery( 'div#logdata' ).empty();
		var url = api.getDataRequestURL();
		url = url.replace( /(:3480|\/port_3480).*/, "" );
		url = url + "/cgi-bin/cmh/log.sh?Device=LuaUPnP";
		jQuery( 'div#logdata' ).append( jQuery( '<p/>' ).text( 'Fetching ' + url ) );
		$.ajax({
			url: url,
			data: {},
			cache: false,
			dataType: 'text',
			timeout: 15000
		}).done( function( data, statusText, jqXHR ) {
			var keypat = new RegExp( "Reactor\\(debug\\): startSensor\\(" + api.getCpanelDeviceId() + "," );
			var pos = data.search( keypat );
			if ( pos < 0 ) {
				jQuery( 'div#logdata' ).append( '<b>SUBJECT DATA NOT FOUND. RESTART THIS REACTOR SENSOR AFTER ENABLING DEBUG.</b>' );
				return;
			}
			while ( pos >= 0 ) {
				data = data.substring( pos+16 );
				pos = data.search( keypat );
			}
			jQuery( 'div#logdata' ).empty().append( '<pre/>' );
			var lines = data.split( /\r?\n/ );
			var k = 0, n = 0;
			while ( n < 500 && k<lines.length ) {
				var l = lines[k].replace( /<span\s+[^>]*>/i, "" ).replace( /<\/span>/i, "" );
				if ( ! l.match( /^(06)/ ) ) {
					jQuery( 'div#logdata pre' ).append( l + "\n" );
					n++;
				}
				k++;
			}
		}).fail( function() {
			jQuery( 'div#logdata' ).empty().append("<b>Hmm, that didn't go well. Try again in a few moments.</b>");
		});
	}

	function handleTestChange( ev ) {
		var container = jQuery('div#reactortools.reactortab');
		var el = jQuery('input#testdateenable', container);
		var vv = "";
		if ( el.prop('checked') ) {
			jQuery('select,input#testtime', el.closest('div.row')).prop('disabled', false);
			var t = new Date();
			t.setFullYear( jQuery('select#testyear', container).val() );
			t.setMonth( parseInt( jQuery('select#testmonth', container).val() ) - 1 );
			t.setDate( jQuery('select#testday', container).val() );
			t.setSeconds( 0 );
			var s = jQuery('input#testtime', container).val();
			var p = ( s || "0:00" ).match( /^(\d+):(\d+)(:(\d+))?$/ );
			if ( p !== null ) {
				t.setHours( p[1] );
				t.setMinutes( p[2] );
				if ( p.length >= 5 && p[5] !== undefined ) {
					t.setSeconds( p[4] );
				}
			}
			t.setMilliseconds( 0 );
			vv = Math.floor( t.getTime() / 1000 );
			if ( isNaN(vv) ) {
				vv = "";
			}
		} else {
			jQuery('select,input#testtime', el.closest('div.row')).prop('disabled', true);
		}
		api.setDeviceStateVariablePersistent( api.getCpanelDeviceId(), serviceId, "TestTime", vv );

		el = jQuery('input#testhousemode', container);
		if ( el.prop('checked') ) {
			jQuery('select#mode', container).prop('disabled', false);
			vv = jQuery('select#mode').val();
		} else {
			jQuery('select#mode', container).prop('disabled', true);
			vv = "";
		}
		api.setDeviceStateVariablePersistent( api.getCpanelDeviceId(), serviceId, "TestHouseMode", vv );
	}

	function processServiceFile( dd, serviceId, scpdurl ) {
		var jqXHR = jQuery.ajax({
			url: scpdurl,
			dataType: "xml",
			timeout: 15000
		});

		jqXHR.done( function( serviceData, statusText ) {
			console.log("Got service data for " + serviceId);
			var sd = { service: serviceId, stateVariables: {}, actions: {} };
			var svs = $(serviceData).find( 'stateVariable' );
			svs.each( function() {
				var name = $('name', this).text();
				var type = $('dataType', this).text();
				sd.stateVariables[name] = { name: name, type: type };
				if ( $('defaultValue', this).length > 0 ) sd.stateVariables[name].default = $('defaultValue', this).text();
				if ( $('shortCode', this).length > 0 ) sd.stateVariables[name].shortcode = $('shortCode', this).text();
				if ( $('Optional', this).length > 0 ) sd.stateVariables[name].optional = true;
				if ( $(this).attr('sendEvents') === "yes" ) sd.stateVariables[name].events = true;
				if ( $('sendEventsAttribute', this).text() === "yes" ) sd.stateVariables[name].events = true;
				if ( $('allowedValueRange', this).length > 0 ) {
					var min = $(this).find('minimum').text();
					var max = $(this).find('maximum').text();
					sd.stateVariables[name].min = min;
					sd.stateVariables[name].max = max;
				}
				var vals = $(this).find( 'allowedValue' );
				if ( vals.length ) {
					sd.stateVariables[name].values = [];
					vals.each( function() {
						sd.stateVariables[name].values.push( $(this).text() );
					});
				}
			});
			svs = $(serviceData).find( 'action' );
			svs.each( function() {
				var actname = $(this).children('name').text();
				sd.actions[actname] = { name: actname };
				var args = $(this).find( 'argument' );
				if ( args.length > 0 ) {
					sd.actions[actname].parameters = [];
					args.each( function() {
						var name = $('name', this).text();
						var dir = $('direction', this).text() || "?";
						var po = { name: name, direction: dir };
						if ( $('relatedStateVariable', this).length == 0 ) {
							po.type = "string";
						} else {
							var rel = $('relatedStateVariable', this).text();
							po.related = rel;
							po.type = (sd.stateVariables[rel] || {}).type || "string";
						}
						if ( $('retval', this).length > 0 ) po.retval = true;
						sd.actions[actname].parameters.push( po );
					});
				}
			});
			dd.services[ sd.service ] = sd;
		});

		jqXHR.fail( function( jqXHR, textStatus, err ) {
			console.log(String(err));
		});

		return jqXHR.promise();
	}

	function sendDeviceData( device, chain ) {
		/* Fetch the device file */
		var p = jQuery.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "lu_device",
				output_format: "xml"
			},
			dataType: "xml",
			timeout: 15000
		}).done( function( data, statusText, jqXHR ) {
			var devs = jQuery( data ).find( "device" );
			devs.each( function() {
				var devid = $(this).children('Device_Num').text();
				if ( devid == device ) {

					/* Send device data */
					var typ = $('deviceType', this).first().text();
					var dd = { version: 1, timestamp: Date.now(), devicetype: typ, services: {} };
					dd.manufacturer = $( 'manufacturer', this ).first().text();
					dd.modelname = $( 'modelName', this ).first().text();
					dd.modelnum = $( 'modelNumber', this ).first().text();
					dd.modeldesc = $( 'modelDescription', this ).first().text();
					dd.category = $( 'Category_Num', this ).first().text();
					dd.subcat = $( 'Subcategory_Num', this ).first().text();
					dd.devfile = $( 'UpnpDevFilename', this ).first().text();
					dd.staticjson = $( 'staticJson', this ).first().text();
					dd.plugin = $( 'plugin', this ).first().text();

					/* Handle services */
					var rp = api.getDataRequestURL().replace( /\/data_request.*$/i, "" );
					var sl = $(this).find('serviceList');
					var services = sl.find('service');
					services.each( function() {
						console.log( $('serviceId',this).text() + " at " + $("SCPDURL",this).text() );
						var serviceId = $('serviceId', this).text();
						var scpdurl = $("SCPDURL", this).text();
						chain.push( function() { return processServiceFile( dd, serviceId, rp + scpdurl ); } );
					});

					chain.push( function() {
						var jd = JSON.stringify( dd );
						console.log("Sending " + jd);
						return jQuery.ajax({
							type: "POST",
							url: api.getDataRequestURL(),
							data: {
								id: "lr_Reactor",
								action: "submitdevice",
								data: jd
							},
							dataType: 'json',
							timeout: 15000
						}).promise();
					});
				}
			});
		}).fail( function( jqXHR, textStatus, errorThrown ) {
			// Bummer.
			alert("Unable to request data from Vera. Try again in a moment; it may be reloading or busy.");
			console.log("Failed to load lu_device data: " + textStatus + " " + String(errorThrown));
			console.log(jqXHR.responseText);
		}).promise();

		chain.push( function() { return p; } );
	}

	function handleSendDeviceDataClick( ev ) {
		var ct = jQuery( ev.currentTarget ).closest( 'div' );
		var device = jQuery( 'select#devices', ct ).val();
		if ( isEmpty( device ) ) {
			alert("Please select a device first.");
			return;
		}

		// https://stackoverflow.com/questions/13651243/how-do-i-chain-a-sequence-of-deferred-functions-in-jQuery-1-8-x#24041521
		var copy = function(a) { return Array.prototype.slice.call(a); };
		$.sequence = function( steps, continueOnFailure ) {
			var handleStep, handleResult,
				def = new $.Deferred(),
				defs = [],
				results = [];
			handleStep = function () {
				if (!steps.length) {
					def.resolveWith(defs, [ results ]);
					return;
				}
				var step = steps.shift(),
					result = step();
				handleResult(
					$.when(result).always(function () {
						defs.push(this);
					}).done(function () {
						results.push({ resolved: copy(arguments) });
					}).fail(function () {
						results.push({ rejected: copy(arguments) });
					})
				);
			};
			handleResult = continueOnFailure ?
				function (result) {
					result.always(function () {
						handleStep();
					});
				} :
				function (result) {
					result.done(handleStep)
						.fail(function () {
							def.rejectWith(defs, [ results ]);
						});
				};
			handleStep();
			return def.promise();
		};

		var chain = [];
		sendDeviceData( device, chain );
		/* If device has a parent, or has children, send them as well */
		var dobj = api.getDeviceObject( device );
		if ( dobj && dobj.id_parent != 0 ) {
			sendDeviceData( dobj.id_parent, chain ); /* parent */
		}
		var typs = {};
		/* ??? only one level deep */
		var ud = api.getUserData();
		for ( var ix=0; ix<ud.devices.length; ix++ ) {
			if ( ud.devices[ix].id_parent == device && undefined === typs[ ud.devices[ix].device_type ] ) {
				sendDeviceData( ud.devices[ix].id, chain );
				typs[ ud.devices[ix].device_type ] = true;
			}
		}

		$.sequence( chain, true ).done( function() {
			alert("Thank you! Your data has been submitted.");
		}).fail( function() {
			alert("Something went wrong and the data could not be submitted.");
		});
	}

	function updateToolsVersionDisplay() {
		jQuery.ajax({
			url: "https://www.toggledbits.com/deviceinfo/checkupdate.php",
			data: {
				"v": ( deviceInfo || {}).serial || "",
				"fw": ""
			},
			dataType: "jsonp",
			jsonp: "callback",
			crossDomain: true,
			timeout: 10000
		}).done( function( respData, statusText, jqXHR ) {
			// console.log("Response from server is " + JSON.stringify(respData));
			if ( undefined !== respData.serial ) {
				var msg = "The latest version is " + String( respData.serial ) + ".";
				if ( undefined !== ( deviceInfo || {}).serial ) {
					msg += " You are currently using " + String(deviceInfo.serial) + ".";
					if ( respData.serial > deviceInfo.serial ) {
						msg = "<b>" + msg + " You should update now.</b>";
					} else {
						msg += " No update is needed.";
					}
				} else {
					msg += " Information about the version you are using has not yet been loaded (that is normal if you haven't yet been on the Activites tab). If you go to the Activities tab, the database will be loaded, and if an update is available, an alert will show.";
				}
				jQuery( 'span#di-ver-info' ).html( msg );
			}
		}).fail( function( jqXHR, textStatus, errorThrown ) {
			jQuery( 'span#di-ver-info' ).text( "Information about the current version is not available." );
			console.log( "deviceInfo version check failed: " + String(errorThrown) );
		});
	}

	function doTools()
	{
		console.log("doTools()");

		if ( configModified && confirm( msgUnsavedChanges ) ) {
			handleSaveClick( undefined );
		}

		if ( ! initModule() ) {
			return;
		}

		header();

		var html = '<div id="reactortools" class="reactortab">';
		html += '<h3>Test Tools</h3>';

		html += '<div class="row">';
		html += '<div class="col-sm-2 col-md-4 col-lg-3 col-xl-2"><label for="testdateenable" class="checkbox-inline"><input type="checkbox" value="1" id="testdateenable">&nbsp;Test&nbsp;Date:</label></div>';
		html += '<div class="col-sm-10 col-md-8 col-lg-9 col-xl-10 form-inline"><select id="testyear" class="form-control form-control-sm"></select><select id="testmonth" class="form-control form-control-sm"></select><select class="form-control form-control-sm" id="testday"></select><input class="narrow form-control form-control-sm" id="testtime"></div>';
		html += '</div>'; /* row */

		html += '<div class="row">';
		html += '<div class="col-sm-2 col-md-4 col-lg-3 col-xl-2"><label for="testhousemode" class="checkbox-inline"><input type="checkbox" value="1" id="testhousemode">&nbsp;Test&nbsp;House&nbsp;Mode</label></div>';
		html += '<div class="col-sm-10 col-md-8 col-lg-9 col-xl-10 form-inline"><select class="form-control form-control-sm" id="mode"><option value="1">Home</option><option value="2">Away</option><option value="3">Night</option><option value="4">Vacation</option></select></div>';
		html += '</div>'; /* row */

		html += '<div class="row">';
		html += '<div class="col-sm-12 col-md-12">' +
			'These settings do not change system configuration.' +
			' They override the system values when your ReactorSensor requests them, allowing you to more easily test your conditions.' +
			' For example, turn on the "Test Date" checkbox above' +
			' and use the controls to set a date, then go back to the "Control" tab and press the "Restart" button to force a re-evaluation of the sensor state' +
			' using your selected date/time. <b>Remember to turn these settings off when you have finished testing!</b></div>';
		html += '</div>'; /* row */

		html += '</div>'; /* .reactortab */

		html += '<div><h3>Update Device Information Database</h3>The device information database contains information to help smooth out the user interface for device actions. The "Activities" tab will notify you when an update is available. You may update by clicking the button below; this process does not require a Luup restart or browser refresh. The updates are shared by all ReactorSensors, so updating any one of them updates all of them. This process sends information about the versions of your Vera firmware, this plugin, and the current database, but no personally-identifying information. This information is used to select the correct database for your configuration; it is not used for tracking you. <span id="di-ver-info"/><p><button id="updateinfo" class="btn btn-sm btn-success">Update Device Info</button> <span id="status"/></p>';

		/* This feature doesn't work on openLuup -- old form of lu_device request isn't implemented */
		if ( !isOpenLuup ) {
			html += '<div id="enhancement" class="form-inline"><h3>Submit Device Data</h3>If you have a device that is missing "Common Actions" or warns you about missing enhancement data in the Activities tab (actions in <i>italics</i>), you can submit the device data to rigpapa for evaluation. This process sends the relevant data about the device. It does not send any identifying information about you or your Vera, and the data is used only for enhancement of the device information database. <p><select id="devices"></select> <button id="submitdata" class="btn btn-sm btn-info">Submit Device Data</button></p></div>';
		}

		html += '<div id="troubleshooting"><h3>Troubleshooting &amp; Support</h3>If you are having trouble working out your condition logic, or you think you have found a bug, here are some steps and tools you can use:';
		html += '<ul><li>Check the documentation in the <a href="https://github.com/toggledbits/Reactor/wiki" target="_blank">Reactor Wiki</a>.</li><li>The <a href="https://community.getvera.com/c/plugins-amp-plugin-development/reactor" target="_blank">Reactor Board</a> in the Vera Community Forums is a great way to get support for questions, how-to\'s, etc.</li><li>Generate and examine a <a href="' +
			api.getDataRequestURL() + '?id=lr_Reactor&action=summary&device=' + api.getCpanelDeviceId() + '" target="_blank">Logic&nbsp;Summary</a> report. This text-based report shows your ReactorSensor\'s current state, and its event list, which may tell you a lot about what led up to that state.</li>' +
			'<li>If the logic summary is not helping you, please post it in its entirety, together with a description of what you are trying to accomplish and/or the problem you are having, to a new thread on the Reactor Board (linked above). <strong>Please do not post screenshots</strong> unless you are reporting a UI/appearance bug. Generally speaking, the logic summary is far more useful (and easier to make and post, by design).</li>';
		if ( ! isOpenLuup ) {
			html += '<li>If you are asked for a "debug log snippet", use this procedure (unless given other instructions in the request):<ol><li>Turn on debug by clicking this link: <a href="' +
			api.getDataRequestURL() + '?id=lr_Reactor&action=debug&debug=1" target="_blank">Turn debug ON</a></li><li>Restart this sensor to force a re-evaluation of all conditions: <a href="' +
			api.getDataRequestURL() + '?id=action&output_format=xml&DeviceNum=' + api.getCpanelDeviceId() + '&serviceId=' +
			encodeURIComponent( serviceId ) + '&action=Restart" target="_blank">Restart this ReactorSensor</a></li><li><strong>Wait at least 60 seconds, not less.</strong> This is very important&mdash;proceeding too soon may result in incomplete log data. During this period, you should also provide any "stimulus" needed to demonstrate the issue (e.g. turn devices on/off).</li><li>Click this link to <a href="javascript:void();" id="grablog">generate the log snippet</a> (the relevant part the log file). It should magically appear at the bottom of this page&mdash;scroll down!</li><li>Post the log snippet to the forum thread, or email it <em>together with your logic summary report and your forum username</em> to <a href="mailto:reactor-logs@toggledbits.com" target="_blank">reactor-logs@toggledbits.com</a>. Note: this email address is for receiving logs only; do not submit questions or other requests to this address.</li></ol>';
		}
		html += '</ul></div>';

		html += footer();

		api.setCpanelContent( html );

		var container = jQuery('div#reactortools.reactortab');
		var el = jQuery('select#testyear', container);
		var i, vv;
		var now = new Date();
		vv = now.getFullYear() - 2;
		for ( i=0; i<12; i++, vv++ ) {
			el.append('<option value="' + vv + '">' + vv + '</option>');
		}
		el = jQuery('select#testmonth', container);
		for ( i=1; i<=12; i++) {
			el.append('<option value="' + i + '">' + monthName[ i ] + '</option>');
		}
		el = jQuery('select#testday', container);
		for ( i=1; i<=31; i++) {
			el.append('<option value="' + i + '">' + i + '</option>');
		}

		/* Restore test date */
		var s = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "TestTime" ) || "0";
		jQuery('input#testdateenable', container).prop('checked', false);
		jQuery('select#testyear,select#testmonth,select#testday,input#testtime', container).prop('disabled', true);
		s = parseInt( s );
		if ( ! isNaN( s ) && 0 !== s ) {
			/* Test time spec overrides now */
			now = new Date( s * 1000 );
			jQuery('input#testdateenable', container).prop('checked', true);
			jQuery('select#testyear,select#testmonth,select#testday,input#testtime', container).prop('disabled', false);
		}
		jQuery('select#testyear', container).on( 'change.reactor', handleTestChange ).val( now.getFullYear() );
		jQuery('select#testmonth', container).on( 'change.reactor', handleTestChange ).val( now.getMonth() + 1 );
		jQuery('select#testday', container).on( 'change.reactor', handleTestChange ).val( now.getDate() );
		var mm = now.getMinutes();
		jQuery('input#testtime', container).on( 'change.reactor', handleTestChange ).val( now.getHours() + ":" + ( mm < 10 ? '0' + mm : mm ) );
		jQuery('input#testdateenable', container).on( 'click.reactor', handleTestChange );

		/* Restore test house mode */
		var mode = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "TestHouseMode" ) || "";
		jQuery('input#testhousemode', container).prop('checked', false);
		jQuery('select#mode', container).prop('disabled', true);
		if ( ! isEmpty( mode ) ) {
			mode = parseInt( mode );
			if ( ! isNaN( mode ) ) {
				jQuery('input#testhousemode', container).prop('checked', true);
				jQuery('select#mode', container).prop('disabled', false).val( mode );
			}
		}
		jQuery('input#testhousemode,select#mode', container).on( 'change.reactor', handleTestChange );

		var deviceMenu = makeDeviceMenu( "", "" );
		deviceMenu.attr('id', 'devices');
		jQuery( 'div#enhancement select#devices' ).replaceWith( deviceMenu );
		jQuery( 'div#enhancement button#submitdata' ).on( 'click.reactor', handleSendDeviceDataClick );

		jQuery( 'button#updateinfo' ).on( 'click.reactor', function( ) {
			var msg = jQuery( 'button#updateinfo' ).parent().find('span#status');
			msg.text("Please wait, downloading update...");
			$.ajax({
				url: api.getDataRequestURL(),
				data: {
					id: "lr_Reactor",
					action: "infoupdate",
					infov: deviceInfo.serial || 0
				},
				dataType: 'json',
				timeout: 30000
			}).done( function( respData, respText, jqXHR ) {
				msg.text( "Update successful! The changes take effect immediately; no restart necessary." );
				// don't call updateToolsVersionDisplay() again because we'd need to reload devinfo to
				// get the right message.
				jQuery( 'span#di-ver-info' ).html( "Your database is up to date!" );
			}).fail( function( x, y, z ) {
				msg.text( "The update failed; Vera busy/restarting. Try again in a moment." );
			});
		});

		/* Tools get log fetcher */
		if ( ! isOpenLuup ) {
			jQuery( '<div id="logdata"/>' ).insertAfter( 'div#tbcopyright' );
			jQuery( 'a#grablog' ).on( 'click', grabLog );
		}

		updateToolsVersionDisplay();
	}

/** ***************************************************************************
 *
 * C L O S I N G
 *
 ** **************************************************************************/

	console.log("Initializing ReactorSensor (UI7) module");

	myModule = {
		uuid: uuid,
		onBeforeCpanelClose: onBeforeCpanelClose,
		onUIDeviceStatusChanged: onUIDeviceStatusChanged,
		doTools: doTools,
		doActivities: preloadActivities,
		doConditions: doConditions,
		doVariables: doVariables,
		doStatusPanel: doStatusPanel
	};
	return myModule;
})(api, $ || jQuery);
