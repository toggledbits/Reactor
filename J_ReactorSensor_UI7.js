//# sourceURL=J_ReactorSensor_UI7.js
/**
 * J_ReactorSensor_UI7.js
 * Configuration interface for ReactorSensor
 *
 * Copyright 2018,2019,2020 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 *
 */
/* globals api,jQuery,unescape,escape,ace,Promise,setTimeout,MultiBox,console,alert,confirm,window,navigator,atob,btoa */
/* jshint multistr: true, laxcomma: true, undef: true, unused: false */

//"use strict"; // fails on UI7, works fine with ALTUI

var ReactorSensor = (function(api, $) {

	/* unique identifier for this plugin... */
	var uuid = '21b5725a-6dcd-11e8-8342-74d4351650de';

	var pluginVersion = '3.9develop-20352.1600';

	var DEVINFO_MINSERIAL = 482;

	var _UIVERSION = 20190;     /* must coincide with Lua core */

	var _CDATAVERSION = 20045;  /* must coincide with Lua core */

	var _DOCURL = "https://www.toggledbits.com/static/reactor/docs/3.9/";

	var _MIN_ALTUI_VERSION = [ 2, 46, 2536 ];
	var	_MAX_ALTUI_VERSION = [ 2, 49, 2545 ];

	var myModule = {};

	var serviceId = "urn:toggledbits-com:serviceId:ReactorSensor";
	var deviceType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

	var moduleReady = false;
	var needsRestart = false;
	var iData = [];
	var roomsByName = false;
	var actions = {};
	var deviceActionData = {};
	var deviceInfo = {};
	var userIx = {};
	var userNameIx = {};
	var configModified = false;
	var inStatusPanel = false;
	var spyDevice = false;
	var lastx = 0;

	var isOpenLuup = false;
	var isALTUI = false;
	var devVeraAlerts = false;
	var devVeraTelegram = false;
	var dateFormat = "%F"; /* ISO8601 defaults */
	var timeFormat = "%T";
	var unsafeLua = true;

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
		"grpstate": "Group State",
		"var": "Expression Value",
		"group": "Group"
	};
	/* Note: default true for the following: hold, pulse, latch */
	var condOptions = {
		"group": { sequence: true, duration: true, repeat: true },
		"service": { sequence: true, duration: true, repeat: true },
		"housemode": { sequence: true, duration: true, repeat: true },
		"weekday": { },
		"sun": { sequence: true },
		"trange": { },
		"interval": { pulse: false, latch: false },
		"ishome": { sequence: true, duration: true },
		"reload": { },
		"grpstate": { sequence: true, duration: true, repeat: true },
		"var": { sequence: true, duration: true, repeat: true }
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
		{ op: 'istrue', desc: 'is TRUE', args: 0, nocase: false },
		{ op: 'isfalse', desc: 'is FALSE', args: 0, nocase: false },
		{ op: 'isnull', desc: 'is NULL', args: 0, nocase: false },
		{ op: 'change', desc: 'changes', args: 2, format: "from %1 to %2", optional: 2, blank: "(any)" },
		{ op: 'update', desc: 'updates', args: 0, nocase: false }
	];

	var varRefPattern = /^\{([^}]+)\}\s*$/;

	var notifyMethods = [
		  { id: "", name: "Vera-native" }
		, { id: "SM", name: "SMTP Mail", users: false, extra: [
				{ id: "recipient", label: "Recipient(s):", placeholder: "blank=default recipient; comma-separate multiple", optional: true },
				{ id: "subject", label: "Subject:", placeholder: "blank=this ReactorSensor's name", optional: true }
			], config: { name: "SMTPServer" } }
		, { id: "PR", name: "Prowl", users: false, requiresUnsafeLua: true, extra: [
				{ id: "priority", label: "Priority:", type: "select", default: "0", values: [ "-2=Very low", "-1=Low", "0=Normal", "1=High", "2=Emergency" ] }
			], config: { name: "ProwlAPIKey" } }
		, { id: "PO", name: "Pushover", users: false, requiresUnsafeLua: true, extra: [
				{ id: "title", label: "Message Title", placeholder: "blank=this ReactorSensor's name", default: "", optional: true },
				{ id: "podevice", label: "Device:", placeholder: "optional", default: "", optional: true },
				{ id: "priority", label: "Priority:", type: "select", default: "0", values: [ "-2=Very low", "-1=Low", "0=Normal", "1=High" ] }, /* 2=Emergency doesn't seem to work, no alert is received 2020-09-23 */
				{ id: "sound", label: "Sound:", type: "select", default: "", optional: true,
					values: [
						"=(device default)", "none=(none/silent)", "vibrate=(vibrate only)", "pushover=Pushover",
						"bike=Bike", "bugle=Bugle", "cashregister=Cash Register", "classical=Classical", "cosmic=Cosmic", "falling=Falling",
						"gamelan=Gamelan", "incoming=Incoming", "intermission=Intermission", "magic=Magic", "mechanical=Mechanical",
						"pianobar=Piano Bar", "siren=Siren", "spacealarm=Space Alarm", "tugboat=Tug Boat", "alien=Alien Alarm (long)",
						"climb=Climb (long)", "persistent=Persistent (long)", "echo=Pushover Echo (long)", "updown=Up Down (long)"
					]
				},
				{ id: "token", label: "Pushover Token:", placeholder: "blank=from Reactor config", default:"", optional: true }
			], config: { name: "PushoverUser" } }
		, { id: "SD", name: "Syslog", users: false, extra: [
				{ id: "hostip", label: "Syslog Server IP:", placeholder: "Host IP4 Address", validpattern: "^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$" },
				{ id: "facility", label: "Facility:", type: "select", default: "23", values: [ "0=kern","1=user","2=mail","3-daemon","4=auth","5=syslog","6=lp","7=news","8=uucp","9=clock","10=security","11=FTP","12=NTP","13=audit","14=alert","16=local0","17=local1","18=local2","19=local3","20=local4","21=local5","22=local6","23=local7" ] },
				{ id: "severity", label: "Severity:", type: "select", default: "5", values: [ "0=emerg","1=alert","2=crit","3=err","4=warn","5=notice","6=info","7=debug" ] }
			] }
		, { id: "UU", name: "User URL", users: false, requiresUnsafeLua: true, extra: [
				{ id: "url", label: "URL:", type: "textarea", placeholder: "URL", validpattern: "^https?://", default: "http://localhost/alert?message={message}", fullwidth: true }
			] }
		, { id: "VA", name: "VeraAlerts" }
		, { id: "VT", name: "VeraTelegram", users: false, extra: [
				{ id: "imageurl", label: "Image URL:", type: "textarea", placeholder: "URL", validpattern: "^https?://", default: "", optional: true, fullwidth: true },
				{ id: "videourl",  label: "Video URL:", type: "textarea", placeholder: "URL", validpattern: "^https?://", default: "", optional: true, fullwidth: true },
				{ id: "chatid",  label: "Chat ID:", default: "", optional: true },
				{ id: "disablenotification",  label: "Disable Notification:", type: "select", values: [ "False=No", "True=Yes" ] }
			] }
	];

	var msgUnsavedChanges = "You have unsaved changes! Press OK to save them, or Cancel to discard them.";
	var msgGroupIdChange = "Click to change group name";
	var msgOptionsShow = "Show condition options";
	var msgOptionsHide = "Hide condition options";
	var msgRemoteAlert = "You appear to be using remote access for this session. Editing of ReactorSensor configurations via remote access is possible, but not recommended due to the latency and inconsistency of cloud connections and infrastructure. You may experience issues, particularly when saving large configurations. Using local access exclusively is strongly recommended. It is also a good idea to back up your ReactorSensors (using the Backup/Restore tab in the Reactor master device) prior to editing via remote access.";

	var NULLCONFIG = { conditions: {} };

	/* Insert the header items */
	/* Checkboxes, see https://codepen.io/VoodooSV/pen/XoZJme */
	function header() {
		if ( 0 !== $( 'style#reactor-core-styles' ).length ) return;
		/* Load material design icons */
		var $head = $( 'head' );
		$head.append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');
		$head.append( '\
<style id="reactor-core-styles">\
	div.reactortab { background-color: white; color: black; } \
	div.re-alertbox { border: 3px solid #ff3; border-radius: 8px; padding: 8px 8px; box-shadow: #999 2px 2px; background-color: #fff; color: #000; } \
	div.reactortab input.narrow { max-width: 6em; } \
	div.reactortab .re-fullwidth { width: 100%; } \
	div.reactortab input.tiny { max-width: 4em; text-align: center; } \
	div.reactortab label { font-weight: normal; padding: 0 2px; } \
	div.reactortab label.re-secondaryinput { margin-left: 0.5em; margin-right: 0.5em; } \
	div.reactortab .tbinline { display: inline-block; } \
	div.reactortab .tbhidden { display: none !important; } /* workaround for show/hide bug in jquery restoring wrong display mode */ \
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
	div.reactortab .tbdocslink { margin-left: 4px; } \
	div.reactortab .tbdocslink i.material-icons { font-size: 18px; position: relative; top: 4px; } \
	div.reactortab button.md-btn:disabled { color: #ccc; cursor: not-allowed; } \
	div.reactortab button.md-btn[disabled] { color: #ccc; cursor: not-allowed; } \
	div.reactortab button.md-btn { line-height: 1em; cursor: pointer; color: #333; background-color: #fff; padding: 1px 0px 0px 0px; border: 1px solid transparent; border-radius: 4px; box-shadow: #ccc 2px 2px; background-image: linear-gradient( to bottom, #fff, #e6e6e6 ); background-repeat: repeat-x; } \
	div.reactortab button.md-btn i { font-size: 16pt; line-height: 1em; } \
	div.reactortab optgroup { color: #333; font-weight: bold; } \
	div.reactortab .re-dropdown { border: 1px solid black; padding: 4px 4px; background-color: #fff; color: #000;} \
	div.reactortab .dropdown-item { display: block; width: 100%; padding: 2px 12px; clear: both; font-weight: normal; color: #000; text-align: inherit; white-space: nowrap; background-color: transparent; border: 0; } \
	div.reactortab .dropdown-item:hover { color: #fff; background-color: #66aaff; text-decoration: none; } \
	div.reactortab .dropdown-divider { border-top: 1px solid #999; margin: 0.5em 0; } \
	div.reactortab .dropdown-header { display: block; width: 100%; padding: 2px 12px; clear: both; font-weight: bold; color: #000; text-align: inherit; background-color: transparent; border: 0; } \
	div.reactortab .dropdown-header:hover { text-decoration: none; } \
	div#tbcopyright { display: block; margin: 12px 0px; } \
	div#tbbegging { display: block; color: #ff6600; margin-top: 12px; } \
	div.reactortab .vanotice { font-size: 0.9em; line-height: 1.5em; color: #666; margin-top: 4px; } \
	div.reactortab div.re-alertblock { margin: 4px 4px; padding: 8px 8px; border: 2px solid red; color: red; border-radius: 8px; font-size: 0.9em; } \
</style>');
		if ( isALTUI ) {
			$head.append( '<style id="reactor-platform-styles">/* ALTUI */</style>' );
		} else {
			/* Vera */
			$head.append( '<style id="reactor-platform-styles">/* Vera */\
div.reactortab .form-inline { display: -ms-flexbox; display: flex; -ms-flex-flow: row wrap; flex-flow: row wrap; align-items: center; } \
</style>' );
		}
	}

	/* Return footer */
	function footer() {
		var html = '';
		html += '<div class="clearfix">';
		html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
		html += '<div id="tbcopyright">Reactor ver ' + pluginVersion + ' &copy; 2018,2019,2020 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>,' +
			' All Rights Reserved. Please check out the <a href="' + _DOCURL + '" target="_blank">online documentation</a>' +
			' and <a href="https://community.getvera.com/c/plugins-and-plugin-development/reactor" target="_blank">community forums</a> for support.</div>';
		try {
			html += '<div id="browserident">' + navigator.userAgent + '</div>';
		} catch( e ) {}

		return html;
	}

	function checkRemoteAccess() {
		// return !isOpenLuup && null === api.getDataRequestURL().match( /^https?:\/\/(\d+)\.(\d+)\.(\d+)\.(\d+)/ );
		return false; /* LATER 3.5 2019-12-02... not yet, let's see how other var changes work out */
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

	/* Remove special characters that disrupt JSON processing on Vera (dkjson 1.2 in particular */
	/* Ref http://dkolf.de/src/dkjson-lua.fsl/home (see 1.2 comments) */
	/* Ref https://docs.microsoft.com/en-us/openspecs/ie_standards/ms-es3/def92c0a-e69f-4e5e-8c5e-9f6c9e58e28b */
	function purify( s ) {
		return "string" !== typeof(s) ? s :
			s.replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, "");
			/* or... s.replace( /[\u007F-\uFFFF]/g, function(ch) { return "\\u" + ("0000"+ch.charCodeAt(0).toString(16)).substr(-4); } ) */
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

	/* Find a value in an array using a function to match; returns value, not index. */
	function arrayFindValue( arr, func, start ) {
		var l = arr.length;
		for ( var k=(start || 0); k<l; ++k ) {
			if ( func( arr[k] ) ) return arr[k];
		}
		return null;
	}

	function idSelector( id ) {
		return String( id ).replace( /([^A-Z0-9_-])/ig, "\\$1" );
	}

	/* Select current value in menu; if not present, select first item. */
	function menuSelectDefaultFirst( $mm, val ) {
		var $opt = $( 'option[value=' + quot( coalesce( val, "" ) ) + ']', $mm );
		if ( 0 === $opt.length ) {
			$opt = $( 'option:first', $mm );
		}
		val = $opt.val(); /* actual value now */
		$mm.val( val );
		return val;
	}

	/** Select current value in menu; insert if not present. The menu txt is
	 * optional.
	 */
	function menuSelectDefaultInsert( $mm, val, txt ) {
		var $opt = $( 'option[value=' + quot( val ) + ']', $mm );
		if ( 0 === $opt.length ) {
			$opt = $( '<option></option>' ).val( val ).text( txt || ( val + '? (missing)' ) );
			$mm.addClass( "tberror" ).append( $opt );
		}
		val = $opt.val(); /* actual value now */
		$mm.val( val );
		return val;
	}

	/** getWiki - Get (as jQuery) a link to Wiki for topic */
	function getWiki( where ) {
		var $v = $( '<a></a>', {
			"class": "tbdocslink",
			"alt": "Link to documentation for topic",
			"title": "Link to documentation for topic",
			"target": "_blank",
			"href": _DOCURL + String(where || "")
		} );
		$v.append( '<i class="material-icons">help_outline</i>' );
		return $v;
	}

	/* Return value or default if undefined */
	function coalesce( v, d ) {
		return ( null === v || undefined === v ) ? d : v;
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

	function checkUpdate() {
		return new Promise( function( resolve, reject ) {
			$.ajax({
				url: "https://api.github.com/repos/toggledbits/Reactor/releases",
				data: {
					r: Math.random()
				},
				dataType: "json",
				timeout: 15000,
				cache: false
			}).fail( function( /* jqXHR, textStatus, errorThrown */ ) {
				reject();
			}).done( function( data ) {
				var newest = false;
				for ( var j=0; j<data.length; ++j ) {
					var rel = data[j];
					if ( "master" === rel.target_commitish || "hotfix" === rel.target_commitish ) {
						var pubtime = Date.parse( rel.published_at );
						rel.published_at = pubtime;
						if ( !newest || pubtime > rel.published_at ) {
							newest = rel;
						}
					}
				}

				/* Now see if newest is not current */
				if ( newest ) {
					var st = getParentState( "grelease", false ) || "";
					var r = st.split( /\|/ );
					if ( r.length > 0 && r[0] == String(newest.id) ) {
						/* Installed version is current version */
						newest = false;
					}
				}
				resolve( newest );
			});
		});
	}

	/* Get data for this instance */
	function getInstanceData( myid ) {
		myid = myid || api.getCpanelDeviceId();
		iData[ myid ] = iData[ myid ] || {};
		return iData[ myid ];
	}

	/* Generate an inline checkbox. */
	function getCheckbox( id, value, label, classes, help ) {
		var $div = $( '<div class="checkbox checkbox-inline"></div>' );
		if ( isALTUI ) {
			$div.removeClass().addClass( 'form-check' );
			$('<input>').attr( { type: 'checkbox', id: id } )
				.val( value )
				.addClass( 'form-check-input' )
				.appendTo( $div );
			$('<label></label>').attr( 'for', id )
				.addClass( 'form-check-label' )
				.html( label )
				.appendTo( $div );
		} else {
			$( '<input type="checkbox">' ).attr( 'id', id ).val( value )
				.addClass( classes || "" )
				.appendTo( $div );
			$( '<label></label>' ).attr( 'for', id ).html( label )
				.appendTo( $div );
		}
		if ( help ) {
			getWiki( help ).appendTo( $div );
		}
		return $div;
	}

	/* Generate an inline radio button */
	function getRadio( name, ix, value, label, classes ) {
		var $div;
		if ( isALTUI ) {
			$div = $( '<div></div>' ).addClass( 'form-check' );
			$('<input>').attr( { type: 'radio', id: name + ix, name: name } )
				.val( value )
				.addClass( 'form-check-input' )
				.addClass( classes || "" )
				.appendTo( $div );
			$('<label></label>').attr( 'for', name + ix )
				.addClass( 'form-check-label' )
				.html( label )
				.appendTo( $div );
		} else {
			$div = $( '<label class="radio"></label>' )
				.html( label );
			$( '<input type="radio">' )
				.attr( { id: name+ix, name: name } )
				.val( value )
				.addClass( classes || "" )
				.prependTo( $div );
		}
		return $div;
	}

	/* Load configuration data. As of 3.5, we do not do any updates here. */
	function loadConfigData( myid ) {
		var me = api.getDeviceObject( myid );
		if ( ! ( me && deviceType === me.device_type ) ) {
			throw "Device " + String(myid) + " not found or incorrect type";
		}
		// PHR??? Dynamic false needs more testing. Save/update of local/lustatus should be sufficient
		/* Empty configs are not allowed, but happen when the Vera UI gets wildly out of sync with Vera,
		   which has happened increasingly since 7.29. */
		var s = api.getDeviceState( myid, serviceId, "cdata" /* , { dynamic: false } */ ) || "";
		if ( isEmpty( s ) ) {
			console.log( "ReactorSensor " + myid + ": EMPTY DATA" );
			alert( 'Reactor has detected that the Vera UI may be badly out of sync with the Vera itself. To remedy this, please (1) reload Luup or reboot your Vera, and then (2) do a "hard-refresh" of your browser (refresh with cache flush). Do not edit any devices or do anything else until this issue has been remedied.' );
			throw "empty configuration";
		} else if ( "###" === s ) {
			alert( 'Please go back out to the device list and make sure this ReactorSensor is ENABLED before re-entering configuration.' );
			throw "reset configuration";
		}
		var cdata;
		try {
			cdata = JSON.parse( s );
			/* Old Luup's json library doesn't support __jsontype metadata,
			   so fix up empty objects, which it renders as empty arrays. */
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
		/* Special version check */
		if ( ( cdata.version || 0 ) > _CDATAVERSION ) {
			alert("This ReactorSensor configuration is an unsupported format/version " +
				String( cdata.version ) + " for this version of Reactor (" +
				pluginVersion + " " + _CDATAVERSION + "). If you've downgraded Reactor from a later " +
				"version, you need to restore a backup of this ReactorSensor's configuration made " +
				"from the earlier version.");
			console.log("The configuration for this ReactorSensor is an unsupported format/version (" +
				String( cdata.version ) + "). Upgrade Reactor or restore an older config from backup.");
			throw "Incompatible configuration format/version";
		}
		/* Check for upgrade tasks from prior versions */
		delete cdata.undefined;
		if ( undefined === cdata.variables ) {
			/* Fixup v2 */
			cdata.variables = {};
		}
		if ( undefined === cdata.activities ) {
			cdata.activities = {};
		}
		if ( undefined === cdata.conditions.root ) {
			var root = { id: "root", name: api.getDeviceObject( myid ).name, type: "group", operator: "and", conditions: [] };
			cdata.conditions = { root: root };
		}

		/* Update device */
		cdata.device = myid;

		/* Store config on instance data */
		var d = getInstanceData( myid );
		d.cdata = cdata;
		delete d.ixCond; /* Remove until needed/rebuilt */

		configModified = false;
		return cdata;
	}

	/* Get configuration; load if needed */
	function getConfiguration( myid, force ) {
		myid = myid || api.getCpanelDeviceId();
		var d = getInstanceData( myid );
		if ( force || ! d.cdata ) {
			try {
				loadConfigData( myid );
				console.log("getConfiguration(): loaded config serial " + String(d.cdata.serial) + ", timestamp " + String(d.cdata.timestamp));
			} catch ( e ) {
				console.log("getConfiguration(): can't load config for "+myid+": "+String(e));
				console.log(e);
				return false;
			}
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

	function getConditionStates( myid ) {
		myid = myid || api.getCpanelDeviceId();
		var s = api.getDeviceState( myid, serviceId, "cstate" ) || "";
		var cstate = {};
		if ( ! isEmpty( s ) ) {
			try {
				cstate = JSON.parse( s );
				return cstate;
			} catch (e) {
				console.log("cstate cannot be parsed: " + String(e));
			}
		} else {
			console.log("cstate unavailable");
		}
		/* Return empty cstate structure */
		return { vars: {} };
	}

	/* Generic filter for DOtraverse to return groups only */
	function isGroup( node ) {
		return "group" === ( node.type || "group" );
	}

	/* Traverse - pre-order */
	function DOtraverse( node, op, args, filter ) {
		if ( node ) {
			if ( ( !filter ) || filter( node ) ) {
				op( node, args );
			}
			if ( "group" === ( node.type || "group" ) ) {
				var l = node.conditions ? node.conditions.length : 0;
				for ( var ix=0; ix<l; ix++ ) {
					DOtraverse( node.conditions[ix], op, args, filter );
				}
			}
		}
	}

	/* Return true if the grp (id) is an ancestor of condition (id) */
	function isAncestor( groupID, condID, myid ) {
		myid = myid || api.getCpanelDeviceId();
		var c = getConditionIndex( myid )[condID];
		if ( c.__parent.id === groupID ) return true;
		if ( "root" === c.__parent.id ) return false; /* Can't go more */
		/* Move up tree looking for matching group */
		return isAncestor( groupID, c.__parent.id, myid );
	}

	/* Return true if node (id) is a descendent of group (id) */
	function isDescendent( nodeID, groupID, myid ) {
		myid = myid || api.getCpanelDeviceId();
		var g = getConditionIndex( myid )[groupID];
		/* Fast exit if our anchor condition isn't a group (only groups have descendents) */
		if ( ! isGroup( g ) ) return false;
		var l = g.conditions ? g.conditions.length : 0;
		for ( var k=0; k<l; k++ ) {
			if ( nodeID === g.conditions[k].id ) return true;
			if ( isGroup( g.conditions[k] ) && isDescendent( nodeID, g.conditions[k].id, myid ) ) {
				return true;
			}
		}
		return false;
	}

	/* Clear module's per-device data and cached info */
	function clearModule() {
		iData = [];
		actions = {};
		deviceActionData = {};
		deviceInfo = {};
		userIx = {};
		userNameIx = {};
		configModified = false;
		inStatusPanel = false;
		spyDevice = false;
		lastx = 0;
		moduleReady = false;
		needsRestart = false;
	}

	/* Initialize the module */
	function initModule( myid ) {
		myid = myid || api.getCpanelDeviceId();
		var ud = api.getUserData();
		if ( !moduleReady ) {

			/* Initialize module data */
			console.log("Initializing module data for ReactorSensor_UI7, device " + myid);
			try {
				console.log("initModule() using jQuery " + String($.fn.jquery) + "; jQuery-UI " + String($.ui.version));
			} catch( e ) {
				console.log("initModule() error reading jQuery/UI versions: " + String(e));
			}

			clearModule();

			isOpenLuup = false;
			isALTUI = "undefined" !== typeof(MultiBox);
			unsafeLua = true;
			devVeraAlerts = false;
			devVeraTelegram = false;

			/* Try to establish date format */
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

			/* Take a pass over devices and see what we discover */
			var dl = api.getListOfDevices();
			dl.forEach( function( devobj ) {
				if ( devobj.device_type === "openLuup" && devobj.id_parent == 0 ) {
					isOpenLuup = devobj.id;
				} else if ( devobj.device_type === "urn:richardgreen:device:VeraAlert:1" && devobj.id_parent == 0 ) {
					devVeraAlerts = devobj.id;
				} else if ( devobj.device_type === "urn:bochicchio-com:device:VeraTelegram:1" && devobj.id_parent == 0 ) {
					devVeraTelegram = devobj.id;
				} else if ( devobj.device_type === "urn:schemas-upnp-org:device:altui:1" && devobj.id_parent == 0 ) {
					isALTUI = devobj.id;
				}
			});

			/* Check UnsafeLua flag; old firmware doesn't have it so default OK (openLuup is always OK) */
			unsafeLua = ( false !== isOpenLuup ) || ( 0 !== parseInt( ud.UnsafeLua || "1" ) );

			/* User and geofence pre-processing */
			var l = ud.users ? ud.users.length : 0;
			for ( var ix=0; ix<l; ++ix ) {
				userIx[ud.users[ix].id] = { name: ud.users[ix].Name || ud.users[ix].id };
				userNameIx[ud.users[ix].Name || ud.users[ix].id] = ud.users[ix].id;
			}
			try {
				$.each( ud.usergeofences || [], function( ix, fobj ) {
					/* Logically, there should not be a usergeofences[] entry for a user that
					   doesn't exist in users[], but Vera says "hold my beer" apparently. */
					if ( undefined === userIx[ fobj.iduser ] ) userIx[ fobj.iduser ] = { name: String(fobj.iduser) + '?' };
					userIx[ fobj.iduser ].tags = {};
					userNameIx[ fobj.iduser ] = fobj.iduser;
					$.each( fobj.geotags || [], function( iy, gobj ) {
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
				console.log( e );
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

		if ( isALTUI ) {
			console.log("initModule() supported ALTUI versions:",_MIN_ALTUI_VERSION.join('.'),"to",_MAX_ALTUI_VERSION.join('.'));
			var validALTUI = false;
			var av;
			var av_range = "v" + _MIN_ALTUI_VERSION.join('.') + " to v" + _MAX_ALTUI_VERSION.join('.');
			try {
				var np = ( ud.InstalledPlugins2 || [] ).length;
				for ( var xp=0; xp<np; xp++ ) {
					var plugin = ud.InstalledPlugins2[xp];
					if ( plugin.id == 8246 ) {
						if ( plugin.VersionMajor === "Github" ) {
							/* Minor version check */
							av = parseInt( plugin.VersionMinor );
							console.log("initModule(): ALTUI release",plugin.VersionMinor,"from InstalledPlugins2");
							av_range = String(_MIN_ALTUI_VERSION[2]) + " to " + String(_MAX_ALTUI_VERSION[2] );
							if ( !isNaN( av ) && av >= _MIN_ALTUI_VERSION[2] && av <= _MAX_ALTUI_VERSION[2] ) {
								validALTUI = true;
							}
						} else {
							av = plugin.VersionMajor;
						}
						break;
					}
				}
			} catch( e ) {
				console.log("initModule(): InstalledPlugins2 ALTUI check threw", e);
			}
			if ( !validALTUI ) {
				try {
					if ( !av ) {
						console.log("initModule() using Version state variable for ALTUI version info");
						av = api.getDeviceState( isALTUI, "urn:upnp-org:serviceId:altui1",
							"Version", { dynamic: false } ) || "unknown";
					}
					console.log("initModule() checking major version",av);
					var m = av.match( /^v?(\d+)\.(\d+)(.*)/i );
					if ( m && m.length > 2 ) {
						m[1] = parseInt( m[1] );
						m[2] = parseInt( m[2] );
						if ( ! ( isNaN( m[1] ) || isNaN( m[2] ) ) ) {
							if ( m[1] >= _MIN_ALTUI_VERSION[0] && m[1] <= _MAX_ALTUI_VERSION[0] ) {
								if ( m[2] >= _MIN_ALTUI_VERSION[1] && m[2] <= _MAX_ALTUI_VERSION[1] ) {
									validALTUI = true;
								}
							}
						}
					}
				} catch ( e ) {
					console.log("initModule(): ALTUI major version check threw", e);
				}
			}
			if ( !validALTUI ) {
				alert("The running version of ALTUI has not been confirmed to be compatible with this version of the Reactor UI and is therefore not supported. Incompatibilities may cause loss of functionality or errors that result in data/configuration loss, and it is recommended that you up/downgrade to a compatible version of ALTUI before continuing. Supported versions are: " + av_range + ". You are running " + String(av));
			}
		}

		/* Load ACE. */
		s = getParentState( "UseACE", myid ) || "1";
		if ( "1" === s && ! window.ace ) {
			s = getParentState( "ACEURL" ) || "https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.12/ace.js";
			$( "head" ).append( '<script src="' + s + '"></script>' );
		}

		/* Initialize for instance */
		console.log("initModule() initializing instance data for " + myid);
		iData[myid] = iData[myid] || {};
		getConfiguration( myid );

		/* Force this false every time, and make the status panel change it. */
		inStatusPanel = false;

		/* Event handler */
		api.registerEventHandler('on_ui_cpanel_before_close', ReactorSensor, 'onBeforeCpanelClose');

		return true;
	}

	/**
	 * Return list of devices sorted alpha by room sorted alpha with "no room"
	 * forced last. Store this for future returns; deferred effort/memory use.
	 */
	function getSortedDeviceList() {
		if ( roomsByName ) return roomsByName;

		var myid = api.getCpanelDeviceId();
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
		var l = dd.length;
		for (var i=0; i<l; ++i) {
			var devobj = api.cloneObject( dd[i] );
			var roomid = devobj.room || 0;
			var roomObj = roomIx[String(roomid)];
			if ( undefined === roomObj ) {
				roomObj = api.cloneObject( api.getRoomObject(roomid) );
				roomObj.devices = [];
				roomIx[String(roomid)] = roomObj;
				rooms.push( roomObj );
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
		return roomsByName;
	}

	/* zero-fill */
	function fill( s, n, p ) {
		if ( "string" !== typeof(s) ) {
			s = String(s);
		}
		p = p || "0";
		var l = n - s.length;
		while ( l-- > 0 ) {
			s = p + s;
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
		$.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "variableset",
				DeviceNum: devnum,
				serviceId: serviceId,
				Variable: variable,
				Value: "",
				r: Math.random()
			},
			dataType: "text",
			cache: false,
			timeout: 5000
		}).fail( function( /* jqXHR, textStatus, errorThrown */ ) {
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
		if ( isOpenLuup ) return; /* Can't delete state vars on openLuup */
		var ud = api.getUserData();
		var dx = api.getDeviceIndex( myid );
		var deletes = [];
		var myinfo = ud.devices[dx];
		if ( undefined == myinfo ) return;
		/* N.B. ixCond will be present in the condition editor only */
		var ixCond = getConditionIndex( myid );
		var l = myinfo.states.length;
		for ( var ix=0; ix<l; ix++ ) {
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

	/* Return a Promise that resolves when Luup is reloaded and ready, as evidenced
	   by the functional state of the Reactor plugin's request handler. */
	function waitForReloadComplete( msg ) {
		return new Promise( function( resolve, reject ) {
			var expire = Date.now() + 90000;
			var dlg = false;
			function tryAlive() {
				$.ajax({
					url: api.getDataRequestURL(),
					data: {
						id: "lr_Reactor",
						action: "alive",
						r: Math.random()
					},
					dataType: "json",
					cache: false,
					timeout: 5000
				}).done( function( data ) {
					if ( data && data.status ) {
						if (dlg) $("#myModal").modal("hide");
						resolve( true );
					} else {
						if ( ! $("#myModal").is(":visible") ) {
							api.showCustomPopup( msg || "Waiting for Luup ready before operation...", { autoHide: false, category: 3 } );
							dlg = true;
						}
						if ( Date.now() >= expire ) {
							if (dlg) $("#myModal").modal("hide");
							reject( "timeout" );
						} else {
							setTimeout( tryAlive, 2000 );
						}
					}
				}).fail( function() {
					if ( Date.now() >= expire ) {
						if (dlg) $("#myModal").modal("hide");
						reject( "timeout" );
					} else {
						if ( ! $("#myModal").is(":visible") ) {
							api.showCustomPopup( msg || "Waiting for Luup ready before operation...", { autoHide: false, category: 3 } );
							dlg = true;
						}
						setTimeout( tryAlive, 5000 );
					}
				});
			}
			tryAlive();
		});
	}

	function saveConfiguration( myid, successFunc, failFunc ) {
		/* Save to persistent state */
		myid = myid || api.getCpanelDeviceId();
		var cdata = getConfiguration( myid );

		cdata.timestamp = Math.floor( Date.now() / 1000 );
		cdata.serial = ( cdata.serial || 0 ) + 1;
		cdata.device = myid;
		console.log("saveConfiguration(): saving #" + myid + " config serial " + String(cdata.serial) + ", timestamp " + String(cdata.timestamp));
		waitForReloadComplete( "Waiting for system ready before saving configuration..." ).then( function() {
			console.log("saveConfiguration() writing cdata");
			var jsstr = JSON.stringify( cdata,
				function( k, v ) { return ( k.match( /^__/ ) || v === null ) ? undefined : purify(v); }
			);
			api.setDeviceStateVariablePersistent( myid, serviceId, "cdata", jsstr,
				{
					'onSuccess' : function() {
						if ( ! isALTUI ) {
							api.setDeviceState( myid, serviceId, "cdata", jsstr ); /* force local/lu_status */
						}
						configModified = false;
						updateSaveControls();
						console.log("saveConfiguration(): successful");
						successFunc && successFunc();
					},
					'onFailure' : function() {
						console.log("saveConfiguration(): FAILED");
						failFunc && failFunc();
					}
				}
			); /* setDeviceStateVariable */
		}); /* then */
	}

	/**
	 * Handle save click: save the current configuration.
	 */
	function handleSaveClick( ev, fnext, fargs ) {
		var myid = api.getCpanelDeviceId();
		var cdata = getConfiguration( myid );

		$( "button.revertconf" ).prop( "disabled", true );
		$( "button.saveconf" ).text("Wait...").prop( "disabled", true );

		saveConfiguration( myid, function() {
			updateSaveControls();
			configModified = false;
			fnext && fnext.apply( null, fargs );
			if ( cdata.__reloadneeded ) {
				delete cdata.__reloadneeded;
				api.showCustomPopup( "Reloading Luup...", { autoHide: false, category: 3 } );
				setTimeout( function() {
					api.performActionOnDevice( 0, "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "Reload",
						{ actionArguments: { Reason: "Reactor saved config needs reload" } } );
					setTimeout( function() {
						waitForReloadComplete().then( function() {
							$("#myModal").modal("hide");
						}).catch( function(reason) {
							$("#myModal").modal("hide");
						});
					}, 5000 );
				}, 5000 );
			} else {
				clearUnusedStateVariables( myid, cdata );
			}
		}, function() {
			alert('There was a problem saving the configuration. Vera/Luup may have been restarting. Please try saving again in a moment.');
			updateSaveControls();
			fnext && fnext.apply( null, fargs );
		});
	}

	/**
	 * Check for unsaved changes, save...
	 */
	function checkUnsaved( myid ) {
		if ( configModified ) {
			if ( confirm( msgUnsavedChanges ) ) {
				handleSaveClick( undefined );
			} else {
				/* Discard unsaved config */
				var d = getInstanceData( myid );
				delete d.cdata;
				delete d.ixCond;
			}
		}
		configModified = false;
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
		updateSaveControls();

		/* Be careful about which tab we're on here. */
		/* ??? when all tabs are modules, module.redraw() is a one-step solution */
		var ctx = $( ev.currentTarget ).closest('div.reactortab').attr('id');
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
	function onBeforeCpanelClose( dev ) {
		console.log( 'onBeforeCpanelClose ' + String(dev) );
		if ( configModified ) {
			if ( confirm( msgUnsavedChanges ) ) {
				handleSaveClick( undefined );
			}
		}
		configModified = false;
		clearModule();
	}

	function conditionValueText( v, forceNumber ) {
		if ( "number" === typeof(v) ) return v;
		v = String(v).trim();
		if ( v.match( varRefPattern ) ) return v;
		if ( forceNumber ) {
			var n;
			if ( v.match( /^[+-]?[0-9]+$/ ) ) {
				n = parseInt( v );
			} else {
				n = parseFloat( v );
			}
			if ( isNaN( n ) ) return JSON.stringify( v ) + "(invalid)";
			return String( n );
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
				str = String(cond.name || cond.id);
				break;

			case 'service':
			case 'var':
				if ( "var" === cond.type ) {
					str += cond.var || "(undefined)";
				} else {
					t = getDeviceFriendlyName( cond.device );
					str += t ? t : '#' + cond.device + ' ' + ( cond.devicename || cond.deviceName || "name unknown" ) + ' (missing)';
					str += ' ' + ( cond.variable || "?" );
				}
				t = arrayFindValue( serviceOps, function( v ) { return v.op === cond.operator; } );
				if ( !t ) {
					str += ' ' + cond.operator + '? ' + conditionValueText( cond.value );
				} else {
					str += ' ' + (t.desc || t.op);
					if ( undefined === t.args || t.args > 0 ) {
						if ( t.args > 1 ) {
							var fmt = t.format || "%1,%2";
							k = coalesce( cond.value, "" ).split( /,/ );
							/* Remove trailing empties if they are optional */
							while ( k.length > 0 && ( t.optional || 0 ) >= k.length && isEmpty( k[k.length-1] ) ) {
								k.pop();
							}
							/* ??? FIXME -- Future pattern replacement loop. For now, never more than 2, so simple */
							fmt = fmt.replace( '%1', k.length > 0 && !isEmpty( k[0] ) ? conditionValueText( k[0], t.numeric ) : (t.blank || '""' ) );
							fmt = fmt.replace( '%2', k.length > 1 && !isEmpty( k[1] ) ? conditionValueText( k[1], t.numeric ) : (t.blank || '""' ) );
							str += ' ' + fmt;
						} else {
							str += ' ' + conditionValueText( cond.value, t.numeric );
						}
					}
				}
				if ( ( !t || 0 === ( t.numeric || 0 ) ) &&
						0 === coalesce( cond.nocase, 1 ) ) {
					str += ' (match case)';
				}
				break;

			case "grpstate":
				t = getDeviceFriendlyName( cond.device );
				str += t ? t : '#' + cond.device + ' ' + ( cond.devicename || cond.deviceName || "name unknown" ) + ' (missing)';
				try {
					var devnum = -1 === ( cond.device || -1 ) ? api.getCpanelDeviceId() : cond.device;
					t = ( getConditionIndex( devnum ) || {} )[ cond.groupid ];
					str += ' ' + ( t ? ( t.name || cond.groupid || "?" ) : ( ( cond.groupid || "?" ) + " (MISSING!)" ) );
				} catch( e ) {
					str += ' ' + ( cond.groupid || "?" ) + ' (' + String(e) + ')';
				}
				t = arrayFindValue( serviceOps, function( v ) { return v.op === cond.operator; } );
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
						if ( ! isEmpty( cond.basedate ) ) {
							var d = cond.basedate.split(/,/);
							try {
								var dt = new Date(
									parseInt( d[0] ),
									parseInt( d[1] - 1 ),
									parseInt( d[2] ),
									parseInt( t[0] ),
									parseInt( t[1] ),
									0, 0 );
								str += ftime( dt, dateFormat + " " + timeFormat );
							} catch ( e ) {
								str += String( cond.basedate ) + ' ' + String( cond.basetime );
							}
						} else {
							if ( t.length == 2 ) {
								str += t[0] + ":" + t[1];
							} else {
								str += String( cond.basetime );
							}
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
		val = coalesce( val, "" );
		var el = $('<select class="devicemenu form-control form-control-sm"></select>');
		getSortedDeviceList().forEach( function( roomObj ) {
			var haveItem = false;
			var xg = $( '<optgroup></optgroup>' ).attr( 'label', roomObj.name );
			var l = roomObj.devices.length;
			for ( var j=0; j<l; j++ ) {
				var devobj = roomObj.devices[j];
				if ( filter && !filter( devobj ) ) {
					continue;
				}
				haveItem = true;
				var fn = getDeviceFriendlyName( devobj.id, devobj );
				xg.append( $( '<option></option>' ).val( devobj.id ).text( fn ? fn : '#' + String(devobj.id) + '?' ) );
			}
			if ( haveItem ) {
				el.append( xg );
			}
		});

		el.prepend( $( '<option></option>' ).val( "-1" ).text( "(this ReactorSensor)" ) );
		el.prepend( $( '<option></option>' ).val( "" ).text( "--choose device--" ) );

		menuSelectDefaultInsert( el, val, "(missing) #" + String(val) + " " + String(name || "") );
		return el;
	}

	/**
	 * Update save/revert buttons (separate, because we use in two diff tabs
	 */
	function updateSaveControls() {
		var errors = $('.tberror');
		var pos = $( window ).scrollTop();
		$('button.saveconf').text("Save")
			.prop('disabled', ! ( configModified && errors.length === 0 ) )
			.attr('title', errors.length === 0 ? "" : "Fix errors before saving");
		$('button.revertconf').prop('disabled', !configModified);
		setTimeout( function() { $(window).scrollTop( pos ); }, 100 );
	}

/** ***************************************************************************
 *
 * S T A T U S
 *
 ** **************************************************************************/

	function updateTime( condid, target, prefix, countdown, limit ) {
		var $el = $( 'span#' + idSelector(condid) + ".timer" );
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
				' after ' + makeConditionDescription( getConditionIndex()[ condOpts.after ] ) +
				( 0 === ( condOpts.aftermode || 0 ) ? ' (which is still TRUE)' : '' );
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
			var pbo = condOpts.pulsebreak || 0;
			if ( pbo > 0 ) {
				condDesc += ", repeat after " + pbo + " secs";
				pbo = condOpts.pulsecount || 0;
				if ( pbo > 0 ) {
					condDesc += ", up to " + pbo + " times";
				}
			}
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
			if ( ( cs.pulsecount || 0 ) > 0 ) {
				var lim = ( cond.options||{} ).pulsecount || 0;
				el.append( " (pulsed " +
					(cs.pulsecount < 1000 ? cs.pulsecount : "&gt;999" ) +
					( lim > 0 ? ( " of max " + lim ) : "" ) +
					" times)" );
			}
			if ( cs.latched ) {
				el.append( '<span>&nbsp;(latched)' );
			}
			/* Generate unique IDs for timers so that redraws will have
			   different IDs, and the old timers will self-terminate. */
			var id;
			if ( cs.laststate && cs.waituntil ) {
				id = getUID();
				el.closest('div.cond').addClass('reactor-timing');
				el.append( $('<span class="timer"></span>').attr( 'id', id ) );
				(function( c, t, l ) {
					setTimeout( function() { updateTime( c, t, "; sustained", false, l ); }, 20 );
				})( id, cs.statestamp, ( cond.options || {} ).duration );
			} else if (cs.evalstate && cs.holduntil) {
				id = getUID();
				el.closest('div.cond').addClass('reactor-timing');
				el.append( $('<span class="timer"></span>').attr( 'id', id ) );
				(function( c, t, l ) {
					setTimeout( function() { updateTime( c, t, "; reset delayed", true, l ); }, 20 );
				})( id, cs.holduntil, 0 );
			} else if ( cs.pulseuntil) {
				id = getUID();
				el.closest('div.cond').addClass('reactor-timing');
				el.append( $('<span class="timer"></span>').attr( 'id', id ) );
				(function( c, t, l ) {
					setTimeout( function() { updateTime( c, t, "; pulse ", true, l ); }, 20 );
				})( id, cs.pulseuntil, 0 );
			} else {
				el.closest('div.cond').removeClass('reactor-timing');
			}
		}
	}

	function handleStatusCondClick( ev ) {
		var $el = $( ev.target );
		var $grp = $el.closest( 'div.reactorgroup' );
		var $body = $( 'div.grpbody', $grp );
		$grp.toggleClass( 're-grp-collapsed' );
		$body.toggle( ! $grp.hasClass( 're-grp-collapsed' ) );
	}

	function showGroupStatus( grp, container, cstate ) {
		var grpel = $( '\
<div class="reactorgroup"> \
  <div class="grouptitle"><button class="btn condbtn"></button><span class="re-title">??</span> <span class="currentvalue"></span></div> \
  <div class="grpbody"> \
	<div class="grpcond"></div> \
  </div> \
</div>' );

		var title = 'Group: ' + (grp.name || grp.id ) +
			( grp.disabled ? " (disabled)" : "" ) + " <" + grp.id + ">";
		$( 'span.re-title', grpel ).text( title + getCondOptionDesc( grp ) + "; " );
		$( '.condbtn', grpel ).text( (grp.invert ? "NOT " : "") + (grp.operator || "and" ).toUpperCase() )
			.on( "click.reactor", handleStatusCondClick );

		/* Highlight groups that are "true" */
		if ( grp.disabled || "0" === api.getDeviceState( api.getCpanelDeviceId(), serviceId, "Enabled" ) ) {
			grpel.addClass( 'groupdisabled' );
		} else {
			var gs = cstate[ grp.id ] || {};
			getCondState( grp, gs.laststate, cstate, $( 'span.currentvalue', grpel ) );
			if ( "undefined" === typeof gs.evalstate || null === gs.evalstate ) {
				grpel.addClass( "nostate" );
			} else if ( gs.evalstate ) {
				grpel.addClass( "truestate" );
			}
		}
		container.append( grpel );

		grpel = $( 'div.grpcond', grpel );
		var l = grp.conditions ? grp.conditions.length : 0;
		for ( var i=0; i<l; i++ ) {
			var cond = grp.conditions[i];

			if ( "group" === ( cond.type || "group" ) ) {
				showGroupStatus( cond, grpel, cstate );
			} else {
				var row = $('<div class="cond"></div>').attr( 'id', cond.id );
				var currentValue = ( cstate[cond.id] || {} ).lastvalue;

				var condType = condTypeName[ cond.type ] !== undefined ? condTypeName[ cond.type ] : cond.type;
				var condDesc = makeConditionDescription( cond );
				switch ( cond.type ) {
					case 'service':
					case 'grpstate':
					case 'var':
						if ( -1 !== ( cond.device || -1 ) ) {
							row.toggleClass( "re-cond-error", ! api.getDeviceObject( cond.device ) );
						}
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

				row.append( $( '<div class="condind"></div>' ).html( '<i class="material-icons">remove</i>' ) );
				row.append( $( '<div class="condtext"></div>' ).text( condType + ': ' + condDesc ) );

				/* Append current value and condition state */
				var el = $( '<div class="currentvalue"></div>' );
				row.append( el );
				getCondState( cond, currentValue, cstate, el );

				/* Apply highlight for state */
				if ( cond.type !== "comment" && undefined !== currentValue ) {
					var cs = cstate[cond.id] || {};
					row.toggleClass( 'truestate', true === cs.evalstate )
						.toggleClass( 'falsestate', true === cs.evalstate );
					$( 'div.condind i', row ).text( cs.evalstate ? 'check' : 'clear' );
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
		var stel = $('div#reactorstatus');
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

		var cstate = getConditionStates( pdev );

		stel.empty();

		var s = parseInt( api.getDeviceState( pdev, serviceId, "TestTime" ) || "0" );
		if ( s && s > 0 ) {
			var tid = getUID( "clk" );
			$('<div class="re-alertblock"></div>').attr( 'id', tid ).text("Test Time is in effect!")
				.appendTo( stel );
			var updateTestClock = function( fid, base ) {
				if ( !inStatusPanel ) return;
				var $f = $( 'div#' + fid + ".re-alertblock" );
				if ( 1 === $f.length ) {
					var now = Math.floor( Date.now() / 1000 );
					var offs = now - (parseInt( api.getDeviceState( pdev, serviceId, "tref" ) ) || now);
					var dt = new Date();
					dt.setTime( ( base + offs ) * 1000 );
					$f.text("Test Time is in effect! Test clock is " + dt.toLocaleString());
					window.setTimeout( function() { updateTestClock(fid, base); }, 500 );
				}
			};
			updateTestClock( tid, s );
		}

		var thm = api.getDeviceState( pdev, serviceId, "TestHouseMode" ) || "0";
		if ( ! ( isEmpty(thm) || "0" === thm ) ) {
			$('<div class="re-alertblock"></div>').text("Test House Mode is in effect!")
				.appendTo( stel );
		}

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
			var grpel = $( '<div class="reactorgroup" id="variables"></div>' );
			grpel.append( '<div class="grouptitle"><span class="re-title">Expressions</span></div>' );
			var body = $( '<div class="groupbody"></div>' );
			grpel.append( body );
			var l = vix.length;
			for ( var ix=0; ix<l; ix++ ) {
				var vd = vix[ix];
				var vs = ( cstate.vars || {} )[vd.name] || {};
				el = $( '<div class="row var"></div>' );
				var vv = ((cstate.vars || {})[vd.name] || {}).lastvalue;
				if ( null === vv ) {
					vv = "(null)";
				} else if ( "object" === typeof vv && "null" === vv.__type ) {
					vv = "( null )";
				} else {
					try {
						vv = JSON.stringify(vv);
					} catch( e ) {
						vv = String( vv );
					}
				}
				var ve = coalesce( vs.err, "" );
				if ( vv && vv.length > 256 ) {
					vv = vv.substring( 0, 253 ) + "...";
				}
				el.append( $('<div class="col-sm-6 col-md-2 tb-hardwrap"></div>').text( vd.name ) );
				el.append( $('<div class="col-sm-12 col-md-7 tb-sm tb-hardwrap"></div>').text( isEmpty( vd.expression ) ? "(no expression)" : vd.expression ) );
				el.append( $('<div class="col-sm-6 col-md-3 tb-hardwrap"></div>').text( "" !== ve ? ve : vv ) );
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
		if ( args.id == pdev ) {
			if ( arrayFindValue( args.states || [], function( v ) { return null !== v.variable.match( /^(cdata|cstate|Tripped|Armed|Enabled|TestTime|TestHouseMode|LastLoad)$/i ); } ) ) {
				try {
					updateStatus( pdev );
				} catch (e) {
					console.log( "Display update failed: " + String(e));
					console.log( e );
				}
			}
		}
	}

	function doStatusPanel()
	{
		console.log("doStatusPanel()");

		/* Make sure changes are saved. */
		var myid = api.getCpanelDeviceId();
		checkUnsaved( myid );

		if ( needsRestart && confirm( 'It is recommended that your ReactorSensor be restarted after setting or clearing the Test Time or House Mode. Press "OK" to restart it now, or "Cancel" to skip the restart.' ) ) {
			api.performActionOnDevice( myid, serviceId, "Restart", { actionArguments: {} } );
		}
		needsRestart = false;

		if ( ! initModule() ) {
			return;
		}

		/* Standard header stuff */
		header();

		/* Our styles. */
		if ( 0 === $('style#reactor-status-styles').length ) {
			$("head").append( '<style id="reactor-status-styles"> \
div#reactorstatus div.reactorgroup { position: relative; border-radius: 4px; border: none; margin: 8px 0; } \
div#reactorstatus div#variables.reactorgroup { border: 1px solid #039 } \
div#reactorstatus div.reactorgroup.groupdisabled * { background-color: #ccc !important; color: #000 !important } \
div#reactorstatus div.reactorgroup.truestate > div.grouptitle > button.condbtn { background-color: #0b0; color: #fff; } \
div#reactorstatus div.reactorgroup.nostate > div.grouptitle > button.condbtn { background-color: #ccc; color: #000; } \
div#reactorstatus div.grouptitle { color: #fff; background-color: #039; min-height: 32px; line-height: 2em; border: 1px solid #000; border-radius: inherit; } \
div#reactorstatus div.grouptitle span.re-title { margin-left: 1em; } \
div#reactorstatus div.grouptitle button.condbtn { background-color: #bce8f1; color: #000; width: 5em; border: none; padding: 6px 6px; } \
div#reactorstatus div.grpbody { position: relative; padding: 0; background-color: #fff; } \
div#reactorstatus div.grpcond { list-style: none; padding: 0 0 0 44px; margin: 0; } \
div#reactorstatus .cond { position: relative; min-height: 2em; margin: 8px 0; padding: 0; border-radius: 4px; border: 1px solid #0c6099; background: #fff; } \
div#reactorstatus .cond.truestate { color: #00aa00; font-weight: bold; } \
div#reactorstatus div.condind { display: inline-block; margin: 0 8px 0 0; padding: 0 4px; } \
div#reactorstatus div.condtext { display: inline-block; width: 50%; margin: 0; padding-top: 4px; vertical-align: top; } \
div#reactorstatus div.currentvalue { display: inline-block; margin-left: 1em; padding-top: 4px; vertical-align: top; } \
div#reactorstatus div.cond.falsestate div.condind { color: #ff0000; } \
div#reactorstatus div.cond.truestate div.condind { color: #00aa00; } \
div#reactorstatus div#variables .tb-valchanged { color: #006040; font-weight: bold; } \
div#reactorstatus div#variables .tb-exprerr { color: red; } \
div#reactorstatus div#variables .tb-hardwrap { overflow-wrap: break-word; } \
div#reactorstatus span.timer { } \
.grpcond > *::before, .grpcond > *::after { content: "";  position: absolute; left: -12px; width: 12px; border-style: solid; border-width: 0px 0px 3px 3px; } \
.grpcond > *:first-child::before { top: -8px; height: 24px; border-color: #333; display: block; } \
.grpcond > *::before { display: none; } \
.grpcond > *::after { top: 16px; height: calc(100% + 12px); border-color: #333; } \
.grpcond > *:last-child::after { display: none; } \
div#reactorstatus .var { min-height: 2em; color: #003399; padding: 2px 4px; } \
div#reactorstatus .tb-sm { font-family: Courier,Courier New,monospace; font-size: 0.9em; } \
div#reactorstatus div.cond.re-cond-error { border: 3px solid red; } \
div#reactorstatus div.cond.reactor-timing { animation: pulse 2s infinite; } \
@keyframes pulse { 0% { background-color: #fff; } 50% { background-color: #cfc; } 100% { background-color: #fff; } } \
</style>');
		}

		api.setCpanelContent( '<div id="reactorstatus" class="reactortab">Loading...</div>' );
		inStatusPanel = true; /* Tell the event handler it's OK */
		api.registerEventHandler('on_ui_deviceStatusChanged', ReactorSensor, 'onUIDeviceStatusChanged');

		try {
			updateStatus( myid );

			/*
			checkUpdate().then( function( data ) {
				if ( data ) {
					$( '<div class="re-updatestatus"></div>' )
						.text( 'An update for Reactor is available. Go to the Tools tab to install it.' )
						.insertBefore( $( 'div#reactorstatus' ) );
				}
			});
			*/
		}
		catch ( e ) {
			inStatusPanel = false; /* stop updates */
			console.log( e );
			alert( e.stack );
		}

		setTimeout( function() { clearUnusedStateVariables( myid, getConfiguration( myid ) ); }, 2000 );

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
			var $el = $( 'div#' + idSelector( grp.id ) + '.cond-container.cond-group' ).children( 'div.cond-group-body' ).children( 'div.cond-list' );
			var ixCond = getConditionIndex();
			var ix = 0;
			grp.conditions.splice( 0, grp.conditions.length ); /* empty in place */
			$el.children().each( function( n, row ) {
				var id = $( row ).attr( 'id' );
				var obj = ixCond[ id ];
				if ( obj ) {
					// console.log("reindexConditions(" + grp.id + ") " + id + " is now " + ix);
					$( row ).removeClass( 'level' + String( obj.__depth || 0 ) ).removeClass( 'levelmod0 levelmod1 levelmod2 levelmod3' );
					grp.conditions[ix] = obj;
					obj.__parent = grp;
					obj.__index = ix++;
					if ( "group" == ( obj.type || "group" ) ) {
						obj.__depth = grp.__depth + 1;
						$( row ).addClass( 'level' + obj.__depth ).addClass( 'levelmod' + (obj.__depth % 4) );
					}
				} else {
					/* Not found. Remove from UI */
					$( row ).remove();
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
		 * Make a menu of defined expressions
		 */
		function makeExprMenu( currExpr ) {
			var $el = $( '<select class="exprmenu form-control form-control-sm"></select>' );
			/* Create a list of variables by index, sorted. cdata.variables is a map/hash,
			   not an array */
			var cdata = getConfiguration();
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
			var l = vix.length;
			for ( var ix=0; ix<l; ix++ ) {
				$( '<option></option>' ).val( vix[ix].name ).text( vix[ix].name ).appendTo( $el );
			}
			if ( currExpr && 0 === $( "option[value=" + JSON.stringify( currExpr ) + "]", $el ).length ) {
				$( '<option></option>' ).val( currExpr ).text( currExpr + " (undefined)" )
					.prependTo( $el );
			}
			$( '<option></option>' ).val( "" ).text( '--choose--' ).prependTo( $el );
			$el.val( coalesce( currExpr, "" ) );
			return $el;
		}

		/**
		 * Make a service/variable menu of all state defined for the device. Be
		 * brief, using only the variable name in the menu, unless that name is
		 * used by multiple services, in which case the last component of the
		 * serviceId is added parenthetically to draw the distinction.
		 */
		function makeVariableMenu( device, service, variable ) {
			var el = $('<select class="varmenu form-control form-control-sm"></select>');
			var myid = api.getCpanelDeviceId();
			if ( -1 === device ) device = myid;
			var devobj = api.getDeviceObject( device );
			if ( devobj ) {
				var mm = {}, ms = [];
				var l = devobj.states ? devobj.states.length : 0;
				for ( var k=0; k<l; ++k ) {
					var st = devobj.states[k];
					if ( isEmpty( st.variable ) || isEmpty( st.service ) ) continue;
					/* For self-reference, only allow variables created from configured expressions */
					if ( devobj.device_type == deviceType ) {
						/* Never allow group states, as these should be done using a grpstate cond */
						if ( st.service === "urn:toggledbits-com:serviceId:ReactorGroup" ) continue;
						/* If own RS, eliminate "private" states */
						if ( device == myid && st.service !== "urn:toggledbits-com:serviceId:ReactorValues" &&
							st.variable.match( /^([a-z_])/ ) ) continue;
					}
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

			if ( isEmpty( service ) || isEmpty( variable ) ) {
				menuSelectDefaultFirst( el, "" );
			} else {
				var key = service + "/" + variable;
				menuSelectDefaultInsert( el, key );
			}
			return el;
		}

		function makeServiceOpMenu( op ) {
			var el = $('<select class="opmenu form-control form-control-sm"></select>');
			var l = serviceOps.length;
			for ( var ix=0; ix<l; ix++ ) {
				el.append( $('<option></option>').val(serviceOps[ix].op).text(serviceOps[ix].desc || serviceOps[ix].op) );
			}

			if ( undefined !== op ) {
				el.val( op );
			}
			return el;
		}

		function makeDateTimeOpMenu( op ) {
			var el = $('<select class="opmenu form-control form-control-sm"></select>');
			el.append( '<option value="bet">between</option>' );
			el.append( '<option value="nob">not between</option>' );

			if ( undefined !== op ) {
				el.val( op );
			}
			return el;
		}

		/* Make a menu of eligible groups in a ReactorSensor */
		function makeRSGroupMenu( cond ) {
			var mm = $( '<select class="form-control form-control-sm re-grpmenu"></select>' );
			mm.empty();
			$( '<option></option>' ).val( "" ).text("--choose--").appendTo( mm );
			try {
				var dc;
				var myid = api.getCpanelDeviceId();
				var myself = -1 === cond.device || cond.device === myid;
				if ( myself ) {
					/* Our own groups */
					dc = getConfiguration( myid );
				} else {
					dc = getConfiguration( cond.device );
				}
				if ( dc ) {
					var appendgrp = function ( grp, sel, pg ) {
						/* Don't add ancestors in same RS */
						if ( "nul" !== grp.operator && ! ( myself && isAncestor( grp.id, cond.id, myid ) ) ) {
							sel.append(
								$( '<option></option>' ).val( grp.id )
									.text( "root"===grp.id ? "Tripped/Untripped (root)" : ( grp.name || grp.id ) )
							);
						}
						/* Don't scan siblings or anything below. */
						if ( myself && grp.id == pg.id ) return;
						var l = grp.conditions ? grp.conditions.length : 0;
						for ( var ix=0; ix<l; ix++ ) {
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
			menuSelectDefaultInsert( mm, cond.groupid || "", ( cond.groupname || cond.groupid ) + "? (missing)" );
			return mm;
		}

		/**
		 * Update row structure from current display data.
		 */
		function updateConditionRow( $row, target ) {
			var condId = $row.attr("id");
			var cond = getConditionIndex()[ condId ];
			var typ = $row.hasClass( "cond-cond" ) ? $("select.re-condtype", $row).val() || "comment" : "group";
			cond.type = typ;
			$('.tberror', $row).removeClass('tberror');
			$row.removeClass('tberror');
			var val, res, $el;
			switch (typ) {
				case "":
					$( 'select.re-condtype', $row ).addClass( 'tberror' );
					break;

				case 'group':
					removeConditionProperties( cond, 'name,conditions,operator,invert,disabled' );
					if ( ( cond.conditions || [] ).length == 0 ) {
						$row.addClass( 'tberror' );
					}
					break;

				case 'comment':
					removeConditionProperties( cond, "comment" );
					cond.comment = $("div.params input", $row).val();
					break;

				case 'service':
				case 'var':
					if ( 'var' === cond.type ) {
						removeConditionProperties( cond, "var,operator,value,nocase,options" );
						$el = $( "div.params select.exprmenu", $row );
						cond['var'] = $el.val() || "";
						$el.toggleClass( 'tberror', isEmpty( cond['var'] ) );
					} else {
						removeConditionProperties( cond, "device,devicename,service,variable,operator,value,nocase,options" );
						$el = $( "div.params select.devicemenu", $row );
						cond.device = parseInt( $el.val() );
						delete cond.devicename;
						delete cond.deviceName; /* delete old form */
						if ( isNaN( cond.device ) ) {
							cond.device = "";
						} else {
							res = api.getDeviceObject( cond.device );
							if ( res ) {
								cond.devicename = res.name;
							}
						}
						$el.toggleClass( 'tberror', isEmpty( cond.device ) );

						$el = $( "div.params select.varmenu", $row );
						cond.service = $el.val() || "";
						cond.variable = cond.service.replace( /^[^\/]+\//, "" );
						cond.service = cond.service.replace( /\/.*$/, "" );
						$el.toggleClass( 'tberror', isEmpty( cond.service ) || isEmpty( cond.variable ) );
					}

					cond.operator = $("div.params select.opmenu", $row).val() || "=";
					var op = arrayFindValue( serviceOps, function( v ) { return v.op === cond.operator; } ) || serviceOps[0];
					if ( 0 === ( op.numeric || 0 ) && false !== op.nocase ) {
						/* Case-insensitive (nocase==1) is the default */
						val = ( $( 'input.nocase', $row ).prop( 'checked' ) || false ) ? 1 : 0;
						if ( val !== cond.nocase ) {
							if ( 0 === val ) {
								cond.nocase = 0;
							} else {
								delete cond.nocase;
							}
							configModified = true;
						}
					} else if ( undefined !== cond.nocase ) {
						delete cond.nocase;
						configModified = true;
					}
					if ( op.args > 1 ) {
						// Join simple two value list, but don't save "," on its own.
						cond.value = $( 'input#' + idSelector( cond.id + '-val1' ), $row ).val() || "";
						val = $( 'input#' + idSelector( cond.id + '-val2' ), $row ).val() || "";
						if ( ( isEmpty( cond.value ) || isEmpty( val ) ) && ! op.optional ) {
							$( 'input.re-secondaryinput', $row ).addClass( 'tberror' );
						}
						if ( 1 === op.optional && ( isEmpty( cond.value ) && isEmpty( val ) ) ) {
							$( 'input.re-secondaryinput', $row ).addClass( 'tberror' );
						}
						/* Other possibility is 2 === op.optional, allows both fields blank */
						if ( ! isEmpty( val ) ) {
							cond.value += "," + val;
						}
					} else if ( op.args == 1 ) {
						cond.value = $("input.operand", $row).val() || "";
						if ( isEmpty( cond.value ) && ! op.optional ) {
							$( 'input.operand', $row ).addClass( 'tberror' );
						}
					} else {
						delete cond.value;
					}
					/* For numeric op, check that value is parseable as a number (unless var ref) */
					if ( op && op.numeric && ! cond.value.match( varRefPattern ) ) {
						val = parseFloat( cond.value );
						if ( isNaN( val ) ) {
							$( 'input.operand', $row ).addClass( 'tberror' );
						}
					}
					break;

				case "grpstate":
					removeConditionProperties( cond, "device,devicename,groupid,groupname,operator,options" );
					cond.device = parseInt( $( 'div.params select.devicemenu', $row ).val(), $row );
					cond.groupid = $( 'div.params select.re-grpmenu', $row ).val() || "";
					$( "div.params select.re-grpmenu", $row ).toggleClass( 'tberror', isEmpty( cond.groupid ) );
					cond.groupname = $( 'div.params select.re-grpmenu option:selected', $row ).text();
					cond.operator = $( 'div.params select.opmenu', $row ).val() || "istrue";
					break;

				case 'weekday':
					removeConditionProperties( cond, "operator,value,options" );
					cond.operator = $("div.params select.wdcond", $row).val() || "";
					res = [];
					$("input.wdopt:checked", $row).each( function( ix, control ) {
						res.push( control.value /* DOM element */ );
					});
					cond.value = res.join( ',' );
					break;

				case 'housemode':
					removeConditionProperties( cond, "operator,value,options" );
					cond.operator = $("div.params select.opmenu", $row).val() || "is";
					if ( "change" === cond.operator ) {
						// Join simple two value list, but don't save "," on its own.
						cond.value = $( 'select.re-frommode', $row ).val() || "";
						val = $( 'select.re-tomode', $row ).val();
						if ( ! isEmpty( val ) ) {
							cond.value += "," + val;
						}
					} else {
						res = [];
						$("input.hmode:checked", $row).each( function( ix, control ) {
							res.push( control.value /* DOM element */ );
						});
						if ( 0 === res.length ) {
							$( 'select.opmenu', $row ).addClass( 'tberror' );
						} else {
							cond.value = res.join( ',' );
						}
					}
					break;

				case 'trange':
					cond.operator = $("div.params select.opmenu", $row).val() || "bet";
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
								losOtros = $('div.re-endfields input.year', $row);
							} else {
								losOtros = $('div.re-startfields input.year', $row);
							}
							if ( newval === "" && losOtros.val() !== "" ) {
								losOtros.val("");
							} else if ( newval !== "" && losOtros.val() === "" ) {
								losOtros.val(newval);
							}
						}
					}
					var mon = $("div.re-startfields select.monthmenu", $row).val() || "";
					if ( isEmpty( mon ) ) {
						/* No/any month. Disable years. */
						$( '.datespec', $row ).val( "" ).prop( 'disabled', true );
						/* Ending month must also be blank */
						$( 'div.re-endfields select.monthmenu', $row ).val( "" );
					} else {
						/* Month specified, year becomes optional, but either both
						   years must be specified or neither for between/not. */
						$( '.datespec', $row ).prop( 'disabled', false );
						$( 'div.re-startfields select.daymenu:has(option[value=""]:selected)', $row ).addClass( 'tberror' );
						if ( between ) {
							$( 'div.re-endfields select.daymenu:has(option[value=""]:selected)', $row ).addClass( 'tberror' );
							var y1 = $( 'div.re-startfields input.year', $row ).val() || "";
							var y2 = $( 'div.re-endfields input.year', $row ).val() || "";
							if ( isEmpty( y1 ) !== isEmpty( y2 ) ) {
								$( '.datespec', $row ).addClass( 'tberror' );
							}
							var m2 = $( 'div.re-endfields select.monthmenu', $row ).val() || "";
							if ( isEmpty( m2 ) ) {
								/* Ending month may not be blank--flag both start/end */
								$( 'select.monthmenu', $row ).addClass( 'tberror' );
							}
						}
					}
					var dom = $( 'div.re-startfields select.daymenu', $row ).val() || "";
					if ( isEmpty( dom ) ) {
						/* Start day is blank. So must be end day */
						$( 'div.re-endfields select.daymenu', $row ).val( "" );
					} else if ( between ) {
						/* Between with start day, end day must also be specified. */
						$( 'div.re-endfields select.daymenu:has(option[value=""]:selected)', $row ).addClass( 'tberror' );
					}

					/* Fetch and load */
					res = [];
					res.push( isEmpty( mon ) ? "" : $("div.re-startfields input.year", $row).val() || "" );
					res.push( mon );
					res.push( $("div.re-startfields select.daymenu", $row).val() || "" );
					res.push( $("div.re-startfields select.hourmenu", $row).val() || "0" );
					res.push( $("div.re-startfields select.minmenu", $row).val() || "0" );
					if ( ! between ) {
						Array.prototype.push.apply( res, ["","","","",""] );
						$('div.re-endfields', $row).hide();
					} else {
						$('div.re-endfields', $row).show();
						res.push( isEmpty( mon ) ? "" : $("div.re-endfields input.year", $row).val() || "" );
						res.push( isEmpty( mon ) ? "" : $("div.re-endfields select.monthmenu", $row).val() || "" );
						res.push( $("div.re-endfields select.daymenu", $row).val() || "" );
						res.push( $("div.re-endfields select.hourmenu", $row).val() || "0" );
						res.push( $("div.re-endfields select.minmenu", $row).val() || "0" );
					}
					cond.value = res.join(',');
					break;

				case 'sun':
					removeConditionProperties( cond, "operator,value,options" );
					cond.operator = $('div.params select.opmenu', $row).val() || "after";
					res = [];
					var whence = $('div.params select.re-sunstart', $row).val() || "sunrise";
					var offset = getInteger( $('div.params input.re-startoffset', $row).val() || "0" );
					if ( isNaN( offset ) ) {
						/* Validation error, flag and treat as 0 */
						offset = 0;
						$('div.params input.re-startoffset', $row).addClass('tberror');
					}
					res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
					if ( cond.operator == "bet" || cond.operator == "nob" ) {
						$( 'div.re-endfields', $row ).show();
						whence = $('select.re-sunend', $row).val() || "sunset";
						offset = getInteger( $('input.re-endoffset', $row).val() || "0" );
						if ( isNaN( offset ) ) {
							offset = 0;
							$('div.params input.re-endoffset', $row).addClass('tberror');
						}
						res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
					} else {
						$( 'div.re-endfields', $row ).hide();
						res.push("");
					}
					cond.value = res.join(',');
					break;

				case 'interval':
					removeConditionProperties( cond, "days,hours,mins,basetime,basedate,relto,relcond,options" );
					var nmin = 0;
					var v = $('div.params .re-days', $row).val() || "0";
					if ( v.match( varRefPattern ) ) {
						cond.days = v;
						nmin = 1440;
					} else {
						v = getOptionalInteger( v, 0 );
						if ( isNaN(v) || v < 0 ) {
							$( 'div.params .re-days', $row ).addClass( 'tberror' );
						} else {
							cond.days = v;
							nmin = nmin + 1440 * v;
						}
					}
					if ( typeof(cond.days) == "string" || ( typeof(cond.days) == "number" && 0 !== cond.days ) ) {
						$('div.params .re-hours,.re-mins', $row).prop('disabled', true).val("0");
						cond.hours = 0;
						cond.mins = 0;
					} else {
						$('div.params .re-hours,.re-mins', $row).prop('disabled', false);
						v = $('div.params .re-hours', $row).val() || "0";
						if ( v.match( varRefPattern ) ) {
							cond.hours = v;
							nmin = 60;
						} else {
							v = getOptionalInteger( v, 0 );
							if ( isNaN(v) || v < 0 || v > 23 ) {
								$( 'div.params .re-hours', $row ).addClass( 'tberror' );
							} else {
								cond.hours = v;
								nmin = nmin + 60 * v;
							}
						}
						v = $('div.params .re-mins', $row).val() || "0";
						if ( v.match( varRefPattern ) ) {
							cond.mins = v;
							nmin = 1;
						} else {
							v = getOptionalInteger( v, 0 );
							if ( isNaN(v) || v < 0 || v > 59 ) {
								$( 'div.params .re-mins', $row ).addClass( 'tberror' );
							} else {
								cond.mins = v;
								nmin = nmin + v;
							}
						}
						if ( 0 !== nmin ) {
							$( '.re-days', $row ).prop( 'disabled', true ).val("0");
						} else {
							$( '.re-days', $row ).prop( 'disabled', false );
						}
					}
					if ( nmin <= 0 ) {
						$( 'div.params .re-days,.re-hours,.re-mins', $row ).addClass( 'tberror' );
					}
					/* Interval relative to... */
					v = $( 'div.params select.re-relto', $row ).val() || "";
					if ( "condtrue" === v ) {
						cond.relto = v;
						cond.relcond = $( 'div.params select.re-relcond', $row).val() || "";
						if ( "" === cond.relcond ) {
							$( 'div.params select.re-relcond', $row ).addClass( 'tberror' );
						}
						delete cond.basetime;
						delete cond.basedate;
					} else {
						var ry = $( 'div.params input.re-relyear', $row ).val() || "";
						if ( isEmpty( ry ) ) {
							delete cond.basedate;
							$( '.re-reldate', $row ).prop( 'disabled', true );
						} else {
							$( '.re-reldate', $row ).prop( 'disabled', false );
							cond.basedate = ry + "," +
								( $( 'div.params select.re-relmon', $row ).val() || "1" ) +
								"," +
								( $( 'div.params select.re-relday', $row ).val() || "1" );
						}
						var rh = $( 'div.params select.re-relhour', $row ).val() || "00";
						var rm = $( 'div.params select.re-relmin', $row ).val() || "00";
						if ( rh == "00" && rm == "00" && isEmpty( cond.basedate ) ) {
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
					cond.operator = $("div.params select.geofencecond", $row).val() || "is";
					res = [];
					if ( "at" === cond.operator || "notat" === cond.operator ) {
						res[0] = $( 'select.re-userid', $row ).val() || "";
						res[1] = $( 'select.re-location', $row ).val() || "";
						if ( isEmpty( res[0] ) ) {
							$( 'select.re-userid', $row ).addClass( 'tberror' );
						}
						if ( isEmpty( res[1] ) ) {
							$( 'select.re-location', $row ).addClass( 'tberror' );
						}
					} else {
						$("input.useropt:checked", $row).each( function( ix, control ) {
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
			var $ct = $row.hasClass( 'cond-group' ) ? $row.children( 'div.condopts' ) : $( 'div.condopts', $row );
			if ( $ct.length > 0 ) {

				cond.options = cond.options || {};

				/* Predecessor condition (sequencing) */
				var $pred = $( 'select.re-predecessor', $ct );
				if ( isEmpty( $pred.val() ) ) {
					$( 'input.re-predtime', $ct ).prop( 'disabled', true ).val( "" );
					$( 'input.predmode', $ct ).prop( 'disabled', true );
					if ( undefined !== cond.options.after ) {
						delete cond.options.after;
						delete cond.options.aftertime;
						delete cond.options.aftermode;
						configModified = true;
					}
				} else {
					$( 'input.re-predtime', $ct ).prop( 'disabled', false );
					$( 'input.predmode', $ct ).prop( 'disabled', false );
					var pt = parseInt( $('input.re-predtime', $ct).val() );
					if ( isNaN( pt ) || pt < 0 ) {
						pt = 0;
						$('input.re-predtime', $ct).val(pt);
					}
					var predmode = $( 'input.predmode', $ct ).prop( 'checked' ) ? 0 : 1;
					if ( cond.options.after !== $pred.val() || cond.options.aftertime !== pt ||
						( cond.options.aftermode || 0 ) != predmode ) {
						cond.options.after = $pred.val();
						cond.options.aftertime = pt;
						if ( predmode == 1 ) cond.options.aftermode = 1;
						else delete cond.options.aftermode;
						configModified = true;
					}
				}

				/* Repeats */
				var $rc = $('input.re-repeatcount', $ct);
				if ( isEmpty( $rc.val() ) || $rc.prop('disabled') ) {
					$('input.re-duration', $ct).prop('disabled', false);
					$('select.re-durop', $ct).prop('disabled', false);
					$('input.re-repeatspan', $ct).val("").prop('disabled', true);
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
						$('input.re-duration', $ct).val("").prop('disabled', true);
						$('select.re-durop', $ct).val("ge").prop('disabled', true);
						$('input.re-repeatspan', $ct).prop('disabled', false);
						if ( $('input.re-repeatspan', $ct).val() === "" ) {
							$('input.re-repeatspan', $ct).val( "60" );
							cond.options.repeatwithin = 60;
							configModified = true;
						}
					}
				}
				var $rs = $('input.re-repeatspan', $ct);
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
				var $dd = $('input.re-duration', $ct);
				if ( isEmpty( $dd.val() ) || $dd.prop('disabled') ) {
					$('input.re-repeatcount', $ct).prop('disabled', false);
					// $('input.re-repeatspan', $ct).prop('disabled', false);
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
						$('input.re-repeatcount', $ct).val("").prop('disabled', true);
						// $('input.re-repeatspan', $ct).val("").prop('disabled', true);
						delete cond.options.repeatwithin;
						delete cond.options.repeatcount;
						if ( ( cond.options.duration || 0 ) !== dur ) {
							/* Changed */
							if ( dur === 0 ) {
								delete cond.options.duration;
								delete cond.options.duration_op;
								$('input.re-repeatcount', $ct).prop('disabled', false);
								// $('input.re-repeatspan', $ct).prop('disabled', false);
							} else {
								cond.options.duration = dur;
								cond.options.duration_op = $('select.re-durop', $ct).val() || "ge";
							}
							configModified = true;
						}
					}
				}

				var mode = $( 'input.opt-output:checked', $ct ).val() || "";
				if ( "L" === mode ) {
					/* Latching */
					$( '.followopts,.pulseopts', $ct ).prop( 'disabled', true );
					$( '.latchopts', $ct ).prop( 'disabled', false );
					configModified = configModified || ( undefined !== cond.options.holdtime );
					delete cond.options.holdtime;
					configModified = configModified || ( undefined !== cond.options.pulsetime );
					delete cond.options.pulsetime;
					delete cond.options.pulsebreak;
					delete cond.options.pulsecount;

					if ( undefined === cond.options.latch ) {
						cond.options.latch = 1;
						configModified = true;
					}
				} else if ( "P"  === mode ) {
					/* Pulse output */
					$( '.followopts,.latchopts', $ct ).prop( 'disabled', true );
					$( '.pulseopts', $ct ).prop( 'disabled', false );
					configModified = configModified || ( undefined !== cond.options.holdtime );
					delete cond.options.holdtime;
					$( 'input.re-pulsetime', $ct ).prop( 'disabled', false );
					configModified = configModified || ( undefined !== cond.options.latch );
					delete cond.options.latch;

					var $f = $( 'input.re-pulsetime', $ct );
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
						} else if ( pulsetime !== cond.options.pulsetime ) {
							cond.options.pulsetime = pulsetime;
							configModified = true;
						}
					}
					var repeats = "repeat" === $( 'select.re-pulsemode', $ct ).val();
					$( "div.re-pulsebreakopts", $ct ).toggle( repeats );
					if ( repeats ) {
						$f = $( 'input.re-pulsebreak', $ct );
						pulsetime = parseInt( $f.val() || "" );
						if ( isNaN( pulsetime ) || pulsetime <= 0 ) {
							$f.addClass( 'tberror' );
						} else {
							if ( pulsetime !== cond.options.pulsebreak ) {
								cond.options.pulsebreak = pulsetime;
								configModified = true;
							}
						}
						$f = $( 'input.re-pulsecount', $ct );
						var lim = $f.val() || "";
						if ( isEmpty( lim ) ) {
							if ( 0 !== cond.options.pulsecount ) {
								delete cond.options.pulsecount;
								configModified = true;
							}
						} else {
							lim = parseInt( lim );
							if ( isNaN( lim ) || lim < 0 ) {
								$f.addClass( 'tberror' );
							} else if ( 0 === lim && cond.options.pulsecount ) {
								delete cond.options.pulsecount;
								configModified = true;
							} else if ( cond.options.pulsecount !== lim ) {
								cond.options.pulsecount = lim;
								configModified = true;
							}
						}
					} else {
						if ( undefined !== cond.options.pulsebreak ) {
							configModified = true;
						}
						delete cond.options.pulsebreak;
						delete cond.options.pulsecount;
					}
				} else {
					/* Follow mode (default) */
					$( '.pulseopts,.latchopts', $ct ).prop( 'disabled', true );
					$( '.followopts', $ct ).prop( 'disabled', false );
					configModified = configModified || ( undefined !== cond.options.pulsetime );
					delete cond.options.pulsetime;
					delete cond.options.pulsebreak;
					delete cond.options.pulsecount;
					configModified = configModified || ( undefined !== cond.options.latch );
					delete cond.options.latch;

					/* Hold time (delay reset) */
					$dd = $( 'input.re-holdtime', $ct );
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
			var optButton = $( $row.hasClass( 'cond-group' ) ? '.cond-group-header > div > button.re-condmore:first' : '.cond-actions > button.re-condmore', $row );
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
			var el = $( ev.currentTarget );
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
			console.assert( row.hasClass("cond-cond") );
			var device = parseInt( $("select.devicemenu", row).val() );
			var service = $("select.varmenu", row).val() || "";
			var variable = service.replace( /^[^\/]+\//, "" );
			service = service.replace( /\/.*$/, "" );
			var blk = $( 'div.currval', row );
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
			var $el = $( ev.currentTarget );
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
					$( 'div.re-modechecks', $row ).hide();
					$( 'div.re-modeselects', $row ).show();
					menuSelectDefaultInsert( $( 'select.re-frommode', $row ), vv.length > 0 ? vv[0] : "" );
					menuSelectDefaultInsert( $( 'select.re-tomode', $row   ), vv.length > 1 ? vv[1] : "" );
				} else {
					$( 'div.re-modechecks', $row ).show();
					$( 'div.re-modeselects', $row ).hide();
					vv.forEach( function( ov ) {
						$('input#' + idSelector( cond.id + '-mode-' + ov ), $row).prop('checked', true);
					});
				}
			} else if ( "service" === cond.type || "var" === cond.type ) {
				var op = arrayFindValue( serviceOps, function( v ) { return v.op === cond.operator; } ) || serviceOps[0];
				var $inp = $( 'input#' + idSelector( cond.id + '-value' ), $row );
				if ( op.args > 1 ) {
					if ( $inp.length > 0 ) {
						/* Single input field; change this one for double */
						$inp.attr( 'id', cond.id + '-val1' ).show();
					} else {
						/* Already there */
						$inp = $( 'input#' + idSelector( cond.id + '-val1' ), $row );
					}
					/* Work on second field */
					var $in2 = $( 'input#' + idSelector( cond.id + '-val2' ), $row );
					if ( 0 === $in2.length ) {
						$in2 = $inp.clone().attr('id', cond.id + '-val2')
							.off( 'change.reactor' ).on( 'change.reactor', handleConditionRowChange );
						$in2.insertAfter( $inp );
					}
					if ( op.optional ) {
						$inp.attr( 'placeholder', 'blank=any value' );
						$in2.attr( 'placeholder', 'blank=any value' );
					} else {
						$inp.attr( 'placeholder', "" );
						$in2.attr( 'placeholder', "" );
					}
					/* Labels */
					$( 'label.re-secondaryinput', $row ).remove();
					var fmt = op.format || "%1,%2";
					var lbl = fmt.match( /^([^%]*)%\d+([^%]*)%\d+(.*)$/ );
					if ( null !== lbl ) {
						if ( !isEmpty( lbl[1] ) ) {
							$( '<label class="re-secondaryinput"></label>' )
								.attr( 'for', cond.id + "-val1" )
								.text( lbl[1] )
								.insertBefore( $inp );
						}
						if ( !isEmpty( lbl[2] ) ) {
							$( '<label class="re-secondaryinput"></label>' )
								.attr( 'for', cond.id + "-val2" )
								.text( lbl[2] )
								.insertBefore( $in2 );
						}
						if ( !isEmpty( lbl[3] ) ) {
							$( '<label class="re-secondaryinput"></label>' )
								.text( lbl[3] )
								.insertAfter( $in2 );
						}
					}
					/* Restore values */
					$inp.val( vv.length > 0 ? String(vv[0]) : "" );
					$( 'input#' + idSelector( cond.id + '-val2' ), $row ).val( vv.length > 1 ? String(vv[1]) : "" );
				} else {
					if ( $inp.length == 0 ) {
						/* Convert double fields back to single */
						$inp = $( 'input#' + idSelector( cond.id + '-val1' ), $row )
							.attr( 'id', cond.id + '-value' )
							.attr( 'placeholder', '' );
						$( 'input#' + idSelector( cond.id + '-val2' ) + ',label.re-secondaryinput', $row ).remove();
					}
					$inp.val( vv.length > 0 ? String(vv[0]) : "" );
					if ( 0 === op.args ) {
						$inp.val("").hide();
					} else {
						$inp.show();
					}
				}
				var $opt = $( 'div.re-nocaseopt', $row );
				if ( 0 === ( op.numeric || 0 ) && false !== op.nocase ) {
					$opt.show();
					$( 'input.nocase', $opt ).prop( 'checked', coalesce( cond.nocase, 1 ) !== 0 );
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
			var $el = $( ev.currentTarget );
			var val = $el.val();
			var $row = $el.closest('div.cond-container');
			var cond = getConditionIndex()[ $row.attr( 'id' ) ];

			cond.operator = val;
			setUpConditionOpFields( $row, cond );
			configModified = true;
			updateConditionRow( $row, $el );
		}

		/**
		 * Handler for device change
		 */
		function handleDeviceChange( ev ) {
			var $el = $( ev.currentTarget );
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
			delete cond.deviceName; /* remove old form */
			configModified = true;

			/* Make a new service/variable menu and replace it on the row. */
			var newMenu = makeVariableMenu( cond.device, cond.service, cond.variable );
			$("select.varmenu", $row).replaceWith( newMenu );
			$("select.varmenu", $row).off( 'change.reactor' ).on( 'change.reactor', handleConditionVarChange );

			newMenu = makeEventMenu( cond, $row );
			$( 'div.eventlist', $row ).replaceWith( newMenu );

			updateCurrentServiceValue( $row );

			updateConditionRow( $row ); /* pass it on */
		}

		function handleExpandOptionsClick( ev ) {
			var $el = $( ev.currentTarget );
			var $row = $el.closest( 'div.cond-container' );
			var isGroup = $row.hasClass( 'cond-group' );
			var cond = getConditionIndex()[ $row.attr( "id" ) ];

			/* If the options container already exists, just show it. */
			var $container = $( isGroup ? 'div.condopts' : 'div.cond-body > div.condopts', $row );
			if ( $container.length > 0 ) {
				/* Container exists and is open, close it, remove it. */
				$container.slideUp({
					complete: function() {
						$container.remove();
					}
				});
				$( 'i', $el ).text( 'expand_more' );
				$el.attr( 'title', msgOptionsShow );
				if ( $row.hasClass( 'tbautohidden' ) ) {
					$( '.cond-group-title button.re-expand', $row ).click();
					$row.removeClass( 'tbautohidden' );
				}
				return;
			}

			/* Doesn't exist. Create the options container and add options */
			$( 'i', $el ).text( 'expand_less' );
			$el.attr( 'title', msgOptionsHide );
			$container = $( '<div class="condopts"></div>' ).hide();

			var displayed = condOptions[ cond.type || "group" ] || {};
			var condOpts = cond.options || {};

			/* Options now fall into two general groups: output control, and restrictions. */

			/* Output Control */
			var out = $( '<div></div>', { "id": "outputopt", "class": "tboptgroup" } ).appendTo( $container );
			$( '<div class="opttitle">Output Control</div>' ).append( getWiki( 'Condition-Options' ) ).appendTo( out );
			var fs = $( '<div class="opt-fs form-inline"></div>').appendTo( out );
			var rid = "output" + getUID();
			getRadio( rid, 1, "", "Follow (default) - output remains true while condition matches", "opt-output" )
				.appendTo( fs );
			if ( false !== displayed.hold ) {
				fs.append( '; ' );
				$( '<div><label>delay reset <input type="number" class="form-control form-control-sm narrow followopts re-holdtime"> seconds (0=no delay)</label></div>' ).appendTo( fs );
			}
			/* Pulse group is not displayed for update and change operators; always display if configured, though,
			   do any legacy configs prior to this restriction being added are still editable. */
			if ( ( false !== displayed.pulse && !(cond.operator || "=").match( /^(update|change)/ ) ) ||
				condOpts.pulsetime ) {
				fs = $( '<div class="opt-fs form-inline"></div>' ).appendTo( out );
				getRadio( rid, 2, "P", "Pulse - output goes true for", "opt-output" )
					.appendTo( fs );
				$( '<input type="number" class="form-control form-control-sm narrow pulseopts re-pulsetime"> seconds</label>' )
					.appendTo( fs );
				$( '<select class="form-control form-control-sm pulseopts re-pulsemode"><option value="">once</option><option value="repeat">repeat</option></select><div class="re-pulsebreakopts form-inline"><label>after <input type="number" class="form-control form-control-sm narrow pulseopts re-pulsebreak"> seconds,</label> <label>up to <input type="number" class="form-control form-control-sm narrow pulseopts re-pulsecount">&nbsp;times&nbsp;(0/blank=no&nbsp;limit)</label></div>' )
					.appendTo( fs );
			}
			if ( false !== displayed.latch ) {
				fs = $( '<div class="opt-fs form-inline"></div>' ).appendTo( out );
				getRadio( rid, 3, "L", "Latch - output is held true until external reset", "opt-output" )
					.appendTo( fs );
			}

			/* Restore/configure */
			if ( ( condOpts.pulsetime || 0 ) > 0 ) {
				$( '.pulseopts', out ).prop( 'disabled', false );
				$( 'input#' + idSelector(rid+'2'), out ).prop( 'checked', true );
				$( 'input.re-pulsetime', out ).val( condOpts.pulsetime || 15 );
				$( 'input.re-pulsebreak', out ).val( condOpts.pulsebreak || "" );
				$( 'input.re-pulsecount', out ).val( condOpts.pulsecount || "" );
				var pbo = (condOpts.pulsebreak || 0) > 0;
				$( 'select.re-pulsemode', out ).val( pbo ? "repeat" : "" );
				$( 'div.re-pulsebreakopts', out ).toggle( pbo );
				$( '.followopts,.latchopts', out ).prop( 'disabled', true );
			} else if ( 0 !== ( condOpts.latch || 0 ) ) {
				$( '.latchopts', out ).prop( 'disabled', false );
				$( 'input#' + idSelector(rid+'3'), out ).prop( 'checked', true );
				$( '.followopts,.pulseopts', out ).prop( 'disabled', true );
				$( 'div.re-pulsebreakopts', out ).toggle( false );
			} else {
				$( '.followopts', out ).prop( 'disabled', false );
				$( 'input#' + idSelector(rid+'1'), out ).prop( 'checked', true );
				$( '.latchopts,.pulseopts', out ).prop( 'disabled', true );
				$( 'div.re-pulsebreakopts', out ).toggle( false );
				$( 'input.re-holdtime', out ).val( 0 !== (condOpts.holdtime || 0) ? condOpts.holdtime : "" );
			}

			/* Restrictions */
			if ( displayed.sequence || displayed.duration || displayed.repeat ) {
				var rst = $( '<div></div>', { "id": "restrictopt", "class": "tboptgroup" } ).appendTo( $container );
				$( '<div class="opttitle">Restrictions</div>' ).append( getWiki( 'Condition-Options' ) ).appendTo( rst );
				/* Sequence (predecessor condition) */
				if ( displayed.sequence ) {
					fs = $( '<div class="opt-fs form-inline"></div>' ).appendTo( rst );
					var $preds = $('<select class="form-control form-control-sm re-predecessor"><option value="">(any time/no sequence)</option></select>');
					/* Add groups that are not ancestor of condition */
					DOtraverse( (getConditionIndex()).root, function( node ) {
						$preds.append( $( '<option></option>' ).val( node.id ).text( makeConditionDescription( node ) ) );
					}, false, function( node ) {
						/* If node is not ancestor (line to root) or descendent of cond, allow as predecessor */
						return "comment" !== node.type && cond.id !== node.id && !isAncestor( node.id, cond.id ) && !isDescendent( node.id, cond.id );
					});
					$( '<label>Condition must occur after&nbsp;</label>' )
						.append( $preds )
						.appendTo( fs );
					fs.append('&nbsp;<label>within <input type="text" class="form-control form-control-sm narrow re-predtime" autocomplete="off">&nbsp;seconds (0=no time limit)</label>');
					fs.append( getCheckbox( getUID("check"), "0",
						"Predecessor must still be true for this condition to go true", "predmode" ) );
					$('select.re-predecessor', fs).val( condOpts.after || "" );
					$('input.re-predtime', fs).val( condOpts.aftertime || 0 )
						.prop( 'disabled', "" === ( condOpts.after || "" ) );
					$('input.predmode', fs)
						.prop( 'checked', 0 === ( condOpts.aftermode || 0 ) )
						.prop( 'disabled', "" === ( condOpts.after || "" ) );
				}

				/* Duration */
				if ( displayed.duration ) {
					fs = $( '<div class="opt-fs form-inline"></div>' ).appendTo( rst );
					fs.append('<label>Condition must be sustained for&nbsp;</label><select class="form-control form-control-sm re-durop"><option value="ge">at least</option><option value="lt">less than</option></select><input type="text" class="form-control form-control-sm narrow re-duration" autocomplete="off"><label>&nbsp;seconds</label>');
				}

				/* Repeat */
				if ( displayed.repeat ) {
					fs = $( '<div class="opt-fs form-inline"></div>' ).appendTo( rst );
					fs.append('<label>Condition must repeat <input type="text" class="form-control form-control-sm narrow re-repeatcount" autocomplete="off"> times within <input type="text" class="form-control form-control-sm narrow re-repeatspan" autocomplete="off"> seconds</label>');
				}

				if ( ( condOpts.duration || 0 ) > 0 ) {
					$('input.re-repeatcount,input.re-repeatspan', rst).prop('disabled', true);
					$('input.re-duration', rst).val( condOpts.duration );
					$('select.re-durop', rst).val( condOpts.duration_op || "ge" );
				} else {
					var rc = condOpts.repeatcount || "";
					$('input.re-duration', rst).prop('disabled', rc != "");
					$('select.re-durop', rst).prop('disabled', rc != "");
					$('input.re-repeatcount', rst).val( rc );
					$('input.re-repeatspan', rst).prop('disabled', rc=="").val( rc == "" ? "" : ( condOpts.repeatwithin || "60" ) );
				}
			}

			/* Handler for all fields */
			$( 'input,select', $container ).on( 'change.reactor', handleConditionRowChange );

			/* Add the options container (specific immediate child of this row selection) */
			if ( isGroup ) {
				$row.append( $container );
				if ( 1 === $( '.cond-group-title button.re-collapse', $row ).length ) {
					$( '.cond-group-title button.re-collapse', $row ).click();
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
			var user = $( 'select.re-userid', row ).val() || "";
			var mm = $( 'select.re-location', row );
			mm.empty();
			if ( "" !== user ) {
				var ud = api.getUserData();
				var l = ud.usergeofences ? ud.usergeofences.length : 0;
				for ( var k=0; k<l; ++k ) {
					if ( ud.usergeofences[k].iduser == user ) {
						mm.append( $( '<option></option>' ).val( "" ).text( '--choose location--' ) );
						$.each( ud.usergeofences[k].geotags || [], function( ix, v ) {
							mm.append( $( '<option></option>' ).val( v.id ).text( v.name ) );
						});
						var el = $( 'option[value="' + (loc || "") + '"]' );
						if ( el.length == 0 ) {
							mm.append( $( '<option></option>' ).val( loc )
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
			var row = $( ev.currentTarget ).closest( 'div.cond-container' );
			updateGeofenceLocations( row, "" );
			handleConditionRowChange( ev );
		}

		/**
		 * Handle geofence operator change event.
		 */
		function handleGeofenceOperatorChange( ev ) {
			var el = $( ev.currentTarget );
			var row = el.closest( 'div.cond-container' );
			var val = el.val() || "is";
			if ( "at" === val || "notat" === val ) {
				$( 'div.re-geolong', row ).show();
				$( 'div.re-geoquick', row ).hide();
			} else {
				$( 'div.re-geolong', row ).hide();
				$( 'div.re-geoquick', row ).show();
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
			var el = $( '<div class="eventlist dropdown"></div>' );
			var btnid = getUID('btn');
			el.append( '<button class="btn btn-default dropdown-toggle re-triggers" type="button" data-toggle="dropdown" title="Click for device-defined events"><i class="material-icons" aria-haspopup="true" aria-expanded="false">arrow_right</i></button>' );
			$( 'button.device-triggers', el ).attr( 'id', btnid );
			var mm = $( '<div class="dropdown-menu re-dropdown" role="menu"></div>' ).attr( 'aria-labelledby', btnid );
			el.append( mm );
			var myid = api.getCpanelDeviceId();
			var myself = -1 === cond.device || cond.device === myid;
			var events;
			if ( ! myself ) {
				if ( isALTUI ) {
					/* AltUI doesn't implement getDeviceTemplate() as of 2019-06-09 */
					var dobj = api.getDeviceObject( myself ? myid : cond.device );
					var eobj = dobj ? api.getEventDefinition( dobj.device_type ) || {} : {};
					/* AltUI returns object; reduce to array */
					events = [];
					for ( var ie=0; undefined !== eobj[String(ie)] ; ie++ ) {
						events.push( eobj[String(ie)] );
					}
				} else {
					var dtmp = api.getDeviceTemplate( myself ? myid : cond.device );
					events = dtmp ? dtmp.eventList2 : false;
				}
			}
			if ( events && events.length > 0 ) {
				var wrapAction = function( eventinfo, cond, $row ) {
					return function( ev ) {
						var el = $( ev.target );
						cond.service = el.data( 'service' ) || "?";
						cond.variable = el.data( 'variable' ) || "?";
						cond.operator = el.data( 'operator' ) || "=";
						cond.value = el.data( 'value' ) || "";
						delete cond.nocase;
						var sk = cond.service + "/" + cond.variable;
						menuSelectDefaultInsert( $( 'select.varmenu', $row ), sk );
						$( 'select.opmenu', $row ).val( cond.operator );
						setUpConditionOpFields( $row, cond );
						$( 'input#' + idSelector( cond.id + '-value' ), $row ).val( cond.value );
						configModified = true;
						updateCurrentServiceValue( $row );
						updateConditionRow( $row, $( ev ) );
						$( 'select.varmenu', $row ).focus();
						/* Hotfix 20103-01: Older UI/firmware (<=1040 at least) seems to need this
						               to prevent the button click from returning to the UI to the
						               dashboard, which is truly bizrre. */
						ev.preventDefault();
					};
				};
				var reptext = function( s ) {
					return ( s || "?" ).replace( /_DEVICE_NAME_/g, "device" ).replace( /_ARGUMENT_VALUE_/g, "<i>value</i>" );
				};
				var lx = events.length;
				for ( var ix=0; ix<lx; ix++ ) {
					var cx = events[ix];
					var item, txt, k;
					if ( cx.serviceStateTable ) {
						/* One fixed value (we hope--otherwise, we just use first) */
						item = $( '<a href="#" class="dropdown-item"></a>' );
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
						var ly = cx.argumentList ? cx.argumentList.length : 0;
						for ( var iy=0; iy<ly; iy++ ) {
							var arg = cx.argumentList[iy];
							if ( arg.allowedValueList ) {
								var lz = arg.allowedValueList.length;
								for ( var iz=0; iz<lz; iz++ ) {
									var av = api.cloneObject( arg.allowedValueList[iz] );
									item = $( '<a href="#" class="dropdown-item"></a>' );
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
								item = $( '<a href="#" class="dropdown-item"></a>' );
								item.data( 'id', cx.id );
								item.data('service', cx.serviceId);
								item.data( 'variable', arg.name );
								item.data( 'operator', arg.comparisson || "=" );
								item.data( 'value',
									( undefined === arg.defaultValue || arg.optional ) ? "" : String( arg.defaultValue ) );
								item.attr( 'id', arg.id );
								item.html( reptext( arg.HumanFriendlyText.text || "(invalid device_json description)" ) );
								mm.append( item );
								item.on( 'click.reactor', wrapAction( cx, cond, $row ) );
							}
						}
					}
				}
			}
			if ( $( 'a', mm ).length > 0 ) {
				mm.append( $( '<div class="dropdown-divider"></div>' ) );
				mm.append( $( '<a href="#" class="dropdown-header"></a>' )
					.text( "In addition to the above device-defined events, you can select any state variable defined on the device and test its value." ) );
			} else {
				mm.append( $( '<a href="#" class="dropdown-header"></a>' ).text( "This device does not define any events." ) );
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
				row = $( 'div.cond-container#' + idSelector( cond.id ) );
			}
			var container = $('div.params', row).empty().addClass("form-inline");
			container.closest( 'div.cond-body' ).addClass("form-inline");

			row.children( 'button.re-condmore' ).prop( 'disabled', "comment" === cond.type );

			switch (cond.type) {
				case "":
					break;

				case 'comment':
					container.removeClass("form-inline");
					container.closest("div.cond-body").removeClass("form-inline");
					container.append('<input type="text" class="form-control form-control-sm re-comment" autocomplete="off" placeholder="Type your comment here">');
					$('input', container).on( 'change.reactor', handleConditionRowChange ).val( cond.comment || "" );
					if ( "cond0" === cond.id && ( cond.comment || "").match( /^Welcome to your new Reactor/i ) ) {
						$( '<div><strong>New to Reactor?</strong> Check out the <a href="https://youtu.be/wkdFjwEuF58" target="_blank">tutorial videos</a>. There\'s also <a href="' +
						_DOCURL + '" target="_blank">the Reactor Documentation</a> and <a href="https://community.getvera.com/c/plugins-and-plugin-development/reactor" target="_blank">Community Forum Category</a>.</div>' )
							.appendTo( container );
					}
					break;

				case 'service':
				case 'var':
					if ( "var" === cond.type ) {
						var $mm = makeExprMenu( cond['var'] );
						container.append( $mm );
						$mm.on( "change.reactor", handleConditionRowChange );
					} else {
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
						if ( v && cond.devicename !== v ) {
							cond.devicename = v;
							delete cond.deviceName; /* remove old form */
							configModified = true;
						}
						fs = $('<div class="vargroup"></div>')
							.appendTo( container );
						try {
							fs.append( makeEventMenu( cond, row ) );
						} catch( e ) {
							console.log("Error while attempting to handle device JSON: " + String(e));
						}
						fs.append( makeVariableMenu( cond.device, cond.service, cond.variable ) );
						$("select.varmenu", container).on( 'change.reactor', handleConditionVarChange );
						$("select.devicemenu", container).on( 'change.reactor', handleDeviceChange );
					}

					if ( isEmpty( cond.operator ) ) {
						cond.operator = "=";
						configModified = true;
					}
					container.append( makeServiceOpMenu( cond.operator ) );
					container.append('<input type="text" id="' + cond.id + '-value" class="operand form-control form-control-sm" autocomplete="off" list="reactorvarlist">');
					v = $( '<div class="re-nocaseopt"></div>' ).appendTo( container );
					getCheckbox( cond.id + "-nocase", "1", "Ignore&nbsp;case", "nocase" )
						.appendTo( v );
					container.append('<div class="currval"></div>');

					setUpConditionOpFields( container, cond );
					$("input.operand", container).on( 'change.reactor', handleConditionRowChange );
					$('input.nocase', container).on( 'change.reactor', handleConditionRowChange );
					$("select.opmenu", container).on( 'change.reactor', handleConditionOperatorChange );

					if ( "var" === cond.type ) {
							/* Remove "updates" op for var condition */
						$( "select.opmenu option[value='update']", container ).remove();
						$( "div.currval", container ).text("");
					} else {
						$( "select.opmenu option[value='isnull']", container ).remove();
						updateCurrentServiceValue( row );
					}
					break;

				case 'grpstate':
					/* Default device to current RS */
					cond.device = coalesce( cond.device, -1 );
					/* Make a device menu that shows ReactorSensors only. */
					container.append( makeDeviceMenu( cond.device, cond.devicename || "unknown device", function( dev ) {
						return deviceType === dev.device_type;
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
						delete cond.deviceName; /* remove old form */
						configModified = true;
					}
					/* Create group menu for selected device (if any) */
					container.append( makeRSGroupMenu( cond ) );
					/* Make operator menu, short: only boolean and change */
					mm = $( '<select class="opmenu form-control form-control-sm"></select>' );
					mm.append( $( '<option></option>' ).val( "istrue" ).text( "is TRUE" ) );
					mm.append( $( '<option></option>' ).val( "isfalse" ).text( "is FALSE" ) );
					mm.append( $( '<option></option>' ).val( "change" ).text( "changes" ) );
					container.append( mm );
					menuSelectDefaultFirst( mm, cond.operator );
					container.append('<div class="currval"></div>');

					setUpConditionOpFields( container, cond );
					$("select.opmenu", container).on( 'change.reactor', handleConditionRowChange );
					$("select.re-grpmenu", container).on( 'change.reactor', handleConditionRowChange );
					$("select.devicemenu", container).on( 'change.reactor', function( ev ) {
						var $el = $( ev.currentTarget );
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
						delete cond.deviceName; /* remove old form */
						delete cond.groupname;
						delete cond.groupid;
						configModified = true;

						/* Make a new service/variable menu and replace it on the row. */
						var newMenu = makeRSGroupMenu( cond );
						$("select.re-grpmenu", $row).empty().append( newMenu.children() );

						updateConditionRow( $row ); /* pass it on */
					});

					updateCurrentServiceValue( row );
					break;

				case 'housemode':
					if ( isEmpty( cond.operator ) ) { cond.operator = "is"; }
					mm = $('<select class="opmenu form-control form-control-sm"></select>');
					mm.append( '<option value="is">is any of</option>' );
					mm.append( '<option value="change">changes from</option>' );
					menuSelectDefaultFirst( mm, cond.operator );
					mm.on( 'change.reactor', handleConditionOperatorChange );
					container.append( mm );
					container.append( " " );
					// Checkboxes in their own div
					var d = $( '<div class="condfields form-inline re-modechecks"></div>' );
					for ( k=1; k<=4; k++ ) {
						getCheckbox( cond.id + '-mode-' + k, k, houseModeName[k] || k, "hmode" )
							.appendTo( d );
					}
					container.append( d );
					$( "input.hmode", container ).on( 'change.reactor', handleConditionRowChange );
					// Menus in a separate div
					d = $( '<div class="condfields form-inline re-modeselects"></div>' );
					mm = $( '<select class="form-control form-control-sm"></select>' );
					mm.append( '<option value="">(any)</option>' );
					for ( k=1; k<=4; k++ ) {
						mm.append( $( '<option></option>' ).val(k).text( houseModeName[k] ) );
					}
					d.append( mm.clone().addClass( 're-frommode' ) );
					d.append( " to " );
					d.append( mm.addClass( 're-tomode' ) );
					container.append( d );
					$( 'select.re-frommode,select.re-tomode', container).on( 'change.reactor', handleConditionRowChange );

					// Restore values and set up correct display.
					setUpConditionOpFields( container, cond );
					break;

				case 'weekday':
					container.append(
						'<select class="wdcond form-control form-control-sm"><option value="">Every</option><option value="1">First</option><option value="2">2nd</option><option value="3">3rd</option><option value="4">4th</option><option value="5">5th</option><option value="last">Last</option></select>');
					fs = $( '<div class="re-wdopts form-inline"></div>' );
					getCheckbox( cond.id + '-wd-1', '1', 'Sun', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-2', '2', 'Mon', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-3', '3', 'Tue', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-4', '4', 'Wed', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-5', '5', 'Thu', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-6', '6', 'Fri', 'wdopt' ).appendTo( fs );
					getCheckbox( cond.id + '-wd-7', '7', 'Sat', 'wdopt' ).appendTo( fs );
					fs.appendTo( container );
					menuSelectDefaultFirst( $( 'select.wdcond', container ), cond.operator );
					(cond.value || "").split(',').forEach( function( val ) {
						$('input.wdopt[value="' + val + '"]', container).prop('checked', true);
					});
					$("input", container).on( 'change.reactor', handleConditionRowChange );
					$("select.wdcond", container).on( 'change.reactor', handleConditionRowChange );
					break;

				case 'sun':
					container.append( makeDateTimeOpMenu( cond.operator ) );
					$("select.opmenu", container).append('<option value="before">before</option>');
					$("select.opmenu", container).append('<option value="after">after</option>');
					container.append('<div class="re-startfields">' +
						'<select class="re-sunstart"></select>'+
						' offset&nbsp;<input type="text" value="" class="tiny form-control form-control-sm re-startoffset" autocomplete="off">&nbsp;minutes' +
						'</div>'
					);
					container.append('<div class="re-endfields">&nbsp;and ' +
						'<select class="re-sunend"></select> '+
						' offset&nbsp;<input type="text" value="" class="tiny form-control form-control-sm re-endoffset" autocomplete="off">&nbsp;minutes' +
						'</div>'
					);
					mm = $('<select class="form-control form-control-sm">' +
						'<option value="sunrise">Sunrise</option><option value="sunset">Sunset</option>' +
						'<option value="civdawn">Civil dawn</option><option value="civdusk">Civil dusk</option>' +
						'<option value="nautdawn">Nautical dawn</option><option value="nautdusk">Nautical dusk</option>' +
						'<option value="astrodawn">Astronomical dawn</option><option value="astrodusk">Astronomical dusk</option></select>'
						);
					$('select.re-sunend', container).replaceWith( mm.clone().addClass( 're-sunend' ) );
					$('select.re-sunstart', container).replaceWith( mm.addClass( 're-sunstart' ) );
					/* Restore. Condition first... */
					op = menuSelectDefaultFirst( $("select.opmenu", container), cond.operator );
					$("select.opmenu", container).on( 'change.reactor', handleConditionRowChange );
					if ( "bet" === op || "nob" === op ) {
						$("div.re-endfields", container).show();
					} else {
						$("div.re-endfields", container).hide();
					}
					/* Start */
					var vals = ( cond.value || "sunrise+0,sunset+0" ).split(/,/);
					k = vals[0].match( /^([^+-]+)(.*)/ );
					if ( k === null || k.length !== 3 ) {
						k = [ "", "sunrise", "0" ];
						configModified = true;
					}
					$("select.re-sunstart", container).on( 'change.reactor', handleConditionRowChange ).val( k[1] );
					$("input.re-startoffset", container).on( 'change.reactor', handleConditionRowChange ).val( k[2] );
					/* End */
					k = ( vals[1] || "sunset+0" ).match( /^([^+-]+)(.*)/ );
					if ( k === null || k.length !== 3 ) {
						k = [ "", "sunset", "0" ];
						configModified = true;
					}
					$("select.re-sunend", container).on( 'change.reactor', handleConditionRowChange ).val( k[1] );
					$("input.re-endoffset", container).on( 'change.reactor', handleConditionRowChange ).val( k[2] );
					break;

				case 'trange':
					container.append( makeDateTimeOpMenu( cond.operator ) );
					$("select.opmenu", container).append('<option value="before">before</option>');
					$("select.opmenu", container).append('<option value="after">after</option>');
					var months = $('<select class="monthmenu form-control form-control-sm"><option value="">(any month)</option></select>');
					for ( k=1; k<=12; k++ ) {
						months.append('<option value="' + k + '">' + monthName[k] + ' (' + k + ')</option>');
					}
					var days = $('<select class="daymenu form-control form-control-sm"><option value="">(any day)</option></select>');
					for ( k=1; k<=31; k++ ) {
						days.append('<option value="' + k + '">' + k + '</option>');
					}
					var hours = $('<select class="hourmenu form-control form-control-sm"></select>');
					for ( k=0; k<24; k++ ) {
						var hh = k % 12;
						if ( hh === 0 ) {
							hh = 12;
						}
						hours.append('<option value="' + k + '">' + k + ' (' + hh + ( k < 12 ? "am" : "pm" ) + ')</option>');
					}
					var mins = $('<select class="minmenu form-control form-control-sm"></select>');
					for ( var mn=0; mn<60; mn+=5 ) {
						mins.append('<option value="' + mn + '">:' + (mn < 10 ? '0' : '') + mn + '</option>');
					}
					container.append('<div class="re-startfields"></div>').append('<div class="re-endfields">&nbsp;and </div>');
					$("div.re-startfields", container).append( months.clone() )
						.append( days.clone() )
						.append('<input type="text" placeholder="yyyy or blank" title="Leave blank for any year" class="year narrow datespec form-control form-control-sm" autocomplete="off">')
						.append( hours.clone() )
						.append( mins.clone() );
					$("div.re-endfields", container).append( months )
						.append( days )
						.append('<input type="text" placeholder="yyyy" class="year narrow datespec form-control form-control-sm" autocomplete="off">')
						.append( hours )
						.append( mins );
					/* Default all menus to first option */
					$("select", container).each( function( ix, obj ) {
						$(obj).val( $("option:first", obj ).val() );
					});
					/* Restore values. */
					op = menuSelectDefaultFirst( $( "select.opmenu", container ), cond.operator );
					if ( "bet" === op || "nob" === op ) {
						$("div.re-endfields", container).show();
					} else {
						$("div.re-endfields", container).hide();
					}
					var vlist = (cond.value || "").split(',');
					var flist = [ 'div.re-startfields input.year', 'div.re-startfields select.monthmenu','div.re-startfields select.daymenu',
								  'div.re-startfields select.hourmenu', 'div.re-startfields select.minmenu',
								  'div.re-endfields input.year','div.re-endfields select.monthmenu', 'div.re-endfields select.daymenu',
								  'div.re-endfields select.hourmenu','div.re-endfields select.minmenu'
					];
					var lfx = flist.length;
					for ( var fx=0; fx<lfx; fx++ ) {
						if ( fx >= vlist.length ) {
							vlist[fx] = "";
						}
						if ( vlist[fx] !== "" ) {
							$( flist[fx], container ).val( vlist[fx] );
						}
					}
					/* Enable date fields if month spec present */
					$('.datespec', container).prop('disabled', vlist[1]==="");
					$("select", container).on( 'change.reactor', handleConditionRowChange );
					$("input", container).on( 'change.reactor', handleConditionRowChange );
					break;

				case 'interval':
					fs = $( '<div class="form-inline"></div>' ).appendTo( container );
					el = $( '<label>every </label>' );
					el.append( '<input title="Enter an integer >= 0; hours and minutes must be 0!" value="0" class="tiny text-center form-control form-control-sm re-days">' );
					el.append( ' days ' );
					fs.append( el );
					fs.append( " " );
					el = $( '<label></label>' );
					el.append( '<input title="Enter an integer >= 0" class="tiny text-center form-control form-control-sm re-hours">' );
					el.append( ' hours ' );
					fs.append( el );
					fs.append( " " );
					el = $( '<label></label>');
					el.append( '<input title="Enter an integer >= 0" value="0" class="tiny text-center form-control form-control-sm re-mins">' );
					el.append( ' minutes ');
					fs.append( el );
					container.append( " " );
					/* Interval relative time or condition (opposing divs) */
					el = $( '<label></label>' ).text( " relative to ");
					mm = $( '<select class="form-control form-control-sm re-relto"></select>' );
					mm.append( $( '<option></option>' ).val( "" ).text( "Time" ) );
					mm.append( $( '<option></option>' ).val( "condtrue" ).text( "Condition TRUE" ) );
					el.append( mm );
					container.append( el );
					fs = $( '<div class="re-reltimeset form-inline"></div>' );
					fs.append('<input type="text" placeholder="yyyy" class="re-relyear narrow datespec form-control form-control-sm" autocomplete="off">');
					mm = $('<select class="form-control form-control-sm re-relmon re-reldate">').appendTo( fs );
					for ( k=1; k<=12; k++ ) {
						$( '<option></option>').val( k ).text( monthName[k] ).appendTo( mm );
					}
					mm = $('<select class="form-control form-control-sm re-relday re-reldate">').appendTo( fs );
					for ( k=1; k<=31; k++) {
						$( '<option></option>' ).val( k ).text( k ).appendTo( mm );
					}
					mm = $('<select class="form-control form-control-sm re-relhour"></select>');
					for ( k=0; k<24; k++ ) {
						v = ( k < 10 ? "0" : "" ) + String(k);
						mm.append( $('<option></option>').val( v ).text( v ) );
					}
					fs.append( mm );
					fs.append(" : ");
					mm = $('<select class="form-control form-control-sm re-relmin"></select>');
					for ( k=0; k<60; k+=5 ) {
						v = ( k < 10 ? "0" : "" ) + String(k);
						mm.append( $('<option></option>').val( v ).text( v ) );
					}
					fs.append( mm );
					container.append( fs );
					fs = $( '<div class="re-relcondset form-inline"></div>' ).hide();
					mm = $( '<select class="form-control form-control-sm re-relcond"></select>' );
					mm.append( $( '<option></option>' ).val( "" ).text( '--choose--' ) );
					DOtraverse( getConditionIndex().root, function( n ) {
						var tt = (condTypeName[n.type || "group"] || "?") + ": " +
							makeConditionDescription( n ) + " <" + String(n.id) + ">";
						mm.append( $( '<option></option>' ).val( n.id ).text( tt ) );
					}, false, function( n ) {
						return "comment" !== n.type && n.id != cond.id && !isAncestor( n.id, cond.id );
					});
					fs.append( mm );
					container.append( fs );

					$( ".re-days", container ).val( cond.days || 0 );
					$( ".re-hours", container ).val( cond.hours===undefined ? 1 : cond.hours );
					$( ".re-mins", container ).val( cond.mins || 0 );
					$( "select.re-relto", container ).val( cond.relto || "" );
					if ( "condtrue" === cond.relto ) {
						/* Relative to condition */
						$( "div.re-relcondset", container ).show();
						$( "div.re-reltimeset", container ).hide();
						var t = cond.relcond || "";
						menuSelectDefaultInsert( $( "select.re-relcond", container ), t );
					} else {
						/* Relative to time (default) */
						if ( ! isEmpty( cond.basetime ) ) {
							mm = cond.basetime.split(/,/);
							menuSelectDefaultInsert( $( '.re-relhour', container ), mm[0] || '00' );
							menuSelectDefaultInsert( $( '.re-relmin', container ), mm[1] || '00' );
						}
						if ( ! isEmpty( cond.basedate ) ) {
							mm = cond.basedate.split(/,/);
							$( 'input.re-relyear', container ).val( mm[0] );
							menuSelectDefaultFirst( $( '.re-relmon', container ), mm[1] || "1" );
							menuSelectDefaultFirst( $( '.re-relday', container ), mm[2] || "1" );
						} else {
							$( '.re-reldate', container ).prop( 'disabled', true );
						}
					}
					$("select,input", container).on( 'change.reactor', function( ev ) {
						var $el = $( ev.currentTarget );
						var $row = $el.closest( 'div.cond-container' );
						if ( $el.hasClass( "re-relto" ) ) {
							var relto = $el.val() || "";
							if ( "condtrue" === relto ) {
								$( '.re-reltimeset', $row ).hide();
								$( '.re-relcondset', $row ).show();
								/* Rebuild the menu of conditions, in case changed */
								var $mm = $( 'select.re-relcond', $row );
								$( 'option[value!=""]', $mm ).remove();
								DOtraverse( getConditionIndex().root, function( n ) {
									$mm.append( $( '<option></option>' ).val( n.id ).text( makeConditionDescription( n ) ) );
								}, false, function( n ) {
									return "comment" !== n.type && n.id != cond.id && !isAncestor( n.id, cond.id );
								});
								$mm.val( "" );
							} else {
								$( '.re-reltimeset', $row ).show();
								$( '.re-relcondset', $row ).hide();
							}
						}
						handleConditionRowChange( ev ); /* pass on */
					} );
					break;

				case 'ishome':
					container.append(
						'<select class="geofencecond form-control form-control-sm"><option value="is">Any selected user is home</option><option value="is not">Any selected user is NOT home</option><option value="at">User in geofence</option><option value="notat">User not in geofence</option></select>');
					mm = $( '<select class="form-control form-control-sm re-userid"></select>' );
					mm.append( $( '<option></option>' ).val("").text('--choose user--') );
					fs = $( '<div class="re-geoquick"></div>' );
					for ( k in userIx ) {
						if ( userIx.hasOwnProperty( k ) ) {
							getCheckbox( cond.id + '-user-' + k, k, userIx[k].name || k, "useropt" )
								.appendTo( fs );
							mm.append( $( '<option></option>' ).val( k ).text( ( userIx[k] || {} ).name || k ) );
						}
					}
					container.append( fs );
					fs = $( '<div class="re-geolong"></div>' );
					fs.append( mm );
					fs.append( '<select class="form-control form-control-sm re-location"></select>' );
					container.append( fs );
					if ( !unsafeLua ) {
						$( '<div class="re-alertbox">It is recommended that "Allow Unsafe Lua" (<em>Users &amp; Account Info &gt; Security</em>) be enabled when using this condition. Otherwise, less efficient methods of acquiring the geofence data must be used and may impact system performance. This setting is currently disabled.</div>' )
							.appendTo( container );
					}
					$("input.useropt", container).on( 'change.reactor', handleConditionRowChange );
					$("select.geofencecond", container)
						.on( 'change.reactor', handleGeofenceOperatorChange );
					op = menuSelectDefaultFirst( $( "select.geofencecond", container ), cond.operator );
					$("select.re-userid", container).on( 'change.reactor', handleGeofenceUserChange );
					$("select.re-location", container).on( 'change.reactor', handleConditionRowChange );
					if ( op === "at" || op === "notat" ) {
						$( 'div.re-geoquick', container ).hide();
						$( 'div.re-geolong', container ).show();
						mm = ( cond.value || "" ).split(',');
						if ( mm.length > 0 ) {
							menuSelectDefaultInsert( $( 'select.re-userid', container ), mm[0] );
							updateGeofenceLocations( container, mm[1] );
						}
					} else {
						$( 'div.re-geoquick', container ).show();
						$( 'div.re-geolong', container ).hide();
						(cond.value || "").split(',').forEach( function( val ) {
							if ( ! isEmpty( val ) ) {
								var $c = $('input.useropt[value="' + val + '"]', container);
								if ( 0 === $c.length ) {
									$c = getCheckbox( cond.id + '-user-' + val, val, val + "?&nbsp;(unknown&nbsp;user)", "useropt" );
									$c.appendTo( $( 'div.re-geoquick', container ) );
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
			$( 'div.condopts', row ).remove();
			var btn = $( 'button.re-condmore', row );
			if ( condOptions[ cond.type ] ) {
				btn.prop( 'disabled', false ).show();
				if ( hasAnyProperty( cond.options ) ) {
					btn.addClass( 'attn' );
				} else {
					btn.removeClass( 'attn' );
					delete cond.options;
				}
			} else {
				btn.removeClass( 'attn' ).prop( 'disabled', true ).hide();
				delete cond.options;
			}
		}

		/**
		 * Type menu selection change handler.
		 */
		function handleTypeChange( ev ) {
			var $el = $( ev.currentTarget );
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
			var $el = $( ev.currentTarget );
			var $parentGroup = $el.closest( 'div.cond-container' );
			var parentId = $parentGroup.attr( 'id' );

			/* Create a new condition in data, assign an ID */
			var cond = { id: getUID("cond"), type: "comment" }; // ???

			/* Insert new condition in UI */
			var condel = getConditionTemplate( cond.id );
			$( 'select.re-condtype', condel ).val( cond.type );
			setConditionForType( cond, condel );
			$( 'div.cond-list:first', $parentGroup ).append( condel );

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

			$( 'select.re-condtype', condel ).focus();
		}

		function handleTitleChange( ev ) {
			var input = $( ev.currentTarget );
			var grpid = input.closest( 'div.cond-container.cond-group' ).attr( 'id' );
			var newname = (input.val() || "").trim();
			var span = $( 'span.re-title', input.parent() );
			var grp = getConditionIndex()[grpid];
			input.removeClass( 'tberror' );
			if ( newname !== grp.name ) {
				/* Group name check */
				if ( newname.length < 1 ) {
					ev.preventDefault();
					$( 'button.saveconf' ).prop( 'disabled', true );
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
			var $el = $( ev.currentTarget );
			var $p = $el.closest( 'div.cond-group-title' );
			$p.children().hide();
			var grpid = $p.closest( 'div.cond-container.cond-group' ).attr( 'id' );
			var grp = getConditionIndex()[grpid];
			if ( grp ) {
				$p.append( $( '<input class="titleedit form-control form-control-sm" title="Enter new group name">' )
					.val( grp.name || grp.id || "" ) );
				$( 'input.titleedit', $p ).on( 'change.reactor', handleTitleChange )
					.on( 'blur.reactor', handleTitleChange )
					.focus();
			}
		}

		/**
		 * Handle click on group expand/collapse.
		 */
		function handleGroupExpandClick( ev ) {
			var $el = $( ev.currentTarget );
			var $p = $el.closest( 'div.cond-container.cond-group' );
			var $l = $( 'div.cond-group-body:first', $p );
			if ( $el.hasClass( 're-collapse' ) ) {
				$l.slideUp();
				$el.addClass( 're-expand' ).removeClass( 're-collapse' ).attr( 'title', 'Expand group' );
				$( 'i', $el ).text( 'expand_more' );
				try {
					var n = $( 'div.cond-list:first > div', $p ).length;
					$( 'span.re-titlemessage:first', $p ).text( " (" + n +
						" condition" + ( 1 !== n ? "s" : "" ) + " collapsed)" );
				} catch( e ) {
					$( 'span.re-titlemessage:first', $p ).text( " (conditions collapsed)" );
				}
			} else {
				$l.slideDown();
				$el.removeClass( 're-expand' ).addClass( 're-collapse' ).attr( 'title', 'Collapse group' );
				$( 'i', $el ).text( 'expand_less' );
				$( 'span.re-titlemessage:first', $p ).text( "" );
			}
		}

		/**
		 * Handle click on group focus--collapses all groups except clicked
		 */
		function handleGroupFocusClick( ev ) {
			var $el = $( ev.currentTarget );
			var $p = $el.closest( 'div.cond-container.cond-group' );
			var $l = $( 'div.cond-group-body:first', $p );
			var focusGrp = getConditionIndex()[$p.attr('id')];

			var $btn = $( 'button.re-expand', $p );
			if ( $btn.length > 0 ) {
				$l.slideDown();
				$btn.removeClass( 're-expand' ).addClass( 're-collapse' ).attr( 'title', 'Collapse group' );
				$( 'i', $btn ).text( 'expand_less' );
				$( 'span.re-titlemessage:first', $p ).text( "" );
			}

			function hasCollapsedParent( grp ) {
				// var parent = grp.__parent;
				return false;
			}

			/*
				collapse: descendents of this group -- NO
						  ancestors of this group -- NO
						  siblings of this group -- YES
						  none of the above -- YES
			*/
			DOtraverse( getConfiguration().conditions.root,
				function( node ) {
					var gid = node.id;
					var $p = $( 'div#' + idSelector( gid ) + ".cond-group" );
					var $l = $( 'div.cond-group-body:first', $p );
					var $btn = $( 'button.re-collapse', $p );
					if ( $btn.length > 0 && !hasCollapsedParent( focusGrp ) ) {
						$l.slideUp();
						$( 'button.re-collapse', $p ).removeClass( 're-collapse' ).addClass( 're-expand' ).attr( 'title', 'Expand group');
						$( 'i', $btn ).text( 'expand_more' );
						try {
							var n = $( 'div.cond-list:first > div', $p ).length;
							$( 'span.re-titlemessage:first', $p ).text( " (" + n +
								" condition" + ( 1 !== n ? "s" : "" ) + " collapsed)" );
						} catch( e ) {
							$( 'span.re-titlemessage:first', $p ).text( " (conditions collapsed)" );
						}
					}
				},
				false,
				function( node ) {
					/* Filter out non-groups, focusGrp, and nodes that are neither ancestors nor descendents of focusGrp */
					return isGroup( node ) &&
						node.id !== focusGrp.id &&
						! ( isAncestor( node.id, focusGrp.id ) || isDescendent( node.id, focusGrp.id ) );
				}
			);
		}

		/**
		 * Delete condition. If it's a group, delete it and all children
		 * recursively.
		 */
		function deleteCondition( condId, ixCond, cdata, pgrp, reindex ) {
			var cond = ixCond[condId];
			if ( undefined === cond ) return;
			pgrp = pgrp || cond.__parent;
			if ( undefined === reindex ) reindex = true;

			/* Remove references to this cond in sequences */
			for ( var ci in ixCond ) {
				if ( ixCond.hasOwnProperty( ci ) && (ixCond[ci].options || {}).after === condId ) {
					delete ixCond[ci].options.after;
					delete ixCond[ci].options.aftertime;
					delete ixCond[ci].options.aftermode;
				}
			}

			/* If this condition is a group, delete all subconditions (recursively) */
			if ( "group" === ( cond.type || "group" ) ) {
				var lx = cond.conditions ? cond.conditions.length : 0;
				/* Delete end to front to avoid need to reindex each time */
				for ( var ix=lx-1; ix>=0; ix-- ) {
					deleteCondition( cond.conditions[ix].id, ixCond, cdata, cond, false );
				}

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
			var $el = $( ev.currentTarget );
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
			var $el = $( ev.currentTarget );

			/* Create a new condition group div, assign a group ID */
			var newId = getUID("grp");
			var $condgroup = getGroupTemplate( newId );

			/* Create an empty condition group in the data */
			var $parentGroup = $el.closest( 'div.cond-container.cond-group' );
			var $container = $( 'div.cond-list:first', $parentGroup );
			var parentId = $parentGroup.attr( 'id' );
			var ixCond = getConditionIndex();
			var grp = ixCond[ parentId ];
			var newgrp = { id: newId, name: newId, operator: "and", type: "group", conditions: [] };
			newgrp.__parent = grp;
			newgrp.__index = grp.conditions.length;
			newgrp.__depth = ( grp.__depth || 0 ) + 1;
			grp.conditions.push( newgrp );
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
			var el = $( ev.currentTarget );
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
					delete ixCond[ci].options.aftermode;
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
			var $el = $( ui.item );
			var $target = $( ev.target ); /* receiving .cond-list */
			// var $from = $( ui.sender );
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
			var $el = $( ui.item );
			var $target = $( ev.target ); /* receiving .cond-list */
			// var $from = $( ui.sender );
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
			var $el = $( ev.target );
			var grpid = $el.closest( 'div.cond-container.cond-group' ).attr( 'id' );
			var grp = getConditionIndex()[ grpid ];

			/* Generic handling */
			if ( $el.closest( '.btn-group' ).hasClass( 'tb-btn-radio' ) ) {
				$el.closest( '.btn-group' ).find( '.checked' ).removeClass( 'checked' );
				$el.addClass( 'checked' );
			} else {
				$el.toggleClass( "checked" );
			}

			if ( $el.hasClass( 're-op-not' ) ) {
				grp.invert = $el.hasClass( "checked" );
			} else if ( $el.hasClass( 're-disable' ) ) {
				grp.disabled = $el.hasClass( "checked" );
			} else {
				var opScan = [ "re-op-and", "re-op-or", "re-op-xor", "re-op-nul" ];
				var lx = opScan.length;
				for ( var ix=0; ix < lx; ix++ ) {
					var cls = opScan[ix];
					if ( $el.hasClass( cls ) && $el.hasClass( "checked" ) ) {
						/* Special case handling for NUL--remove activities, force no NOT */
						if ( "re-op-nul" === cls ) {
							var cdata = getConfiguration();
							if ( groupHasActivities( grp, cdata ) &&
								! confirm( 'This group currently has Activities associated with it. Groups with the NUL operator do not run Activities. OK to delete the associated Activities?' ) ) {
								return;
							}
							delete cdata.activities[grpid+'.true'];
							delete cdata.activities[grpid+'.false'];
						}

						grp.operator = cls.replace( /^re-op-/, "" );
						break;
					}
				}
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
			var el = $( '\
<div class="cond-container cond-cond"> \
  <div class="pull-right cond-actions"> \
	  <button class="btn md-btn re-condmore" title="Show condition options"><i class="material-icons">expand_more</i></button> \
	  <button class="btn md-btn draghandle" title="Move condition (drag)"><i class="material-icons">reorder</i></button> \
	  <button class="btn md-btn re-delcond" title="Delete condition"><i class="material-icons">clear</i></button> \
  </div> \
  <div class="cond-body form-inline"> \
	<div class="cond-type"> \
	  <select class="form-control form-control-sm re-condtype"><option value="">--choose--</option></select> \
	</div> \
	<div class="params"></div> \
  </div> \
</div>' );

			[ "comment", "service", "grpstate", "var", "housemode", "sun", "weekday", "trange", "interval", "ishome", "reload" ].forEach( function( k ) {
				if ( ! ( isOpenLuup && k == "ishome" ) ) {
					$( "select.re-condtype", el ).append( $( "<option></option>" ).val( k ).text( condTypeName[k] ) );
				}
			});

			el.attr( 'id', id );
			$('select.re-condtype', el).on( 'change.reactor', handleTypeChange );
			$('button.re-delcond', el).on( 'click.reactor', handleConditionDelete );
			$("button.re-condmore", el).on( 'click.reactor', handleExpandOptionsClick );
			return el;
		}

		function getGroupTemplate( grpid ) {
			var el = $( '\
<div class="cond-container cond-group"> \
  <div class="cond-group-header"> \
	<div class="pull-right"> \
	  <button class="btn md-btn noroot re-condmore" title="Show condition options"><i class="material-icons">expand_more</i></button> \
	  <button class="btn md-btn draghandle noroot" title="Move group (drag)"><i class="material-icons">reorder</i></button> \
	  <button class="btn md-btn noroot re-delgroup" title="Delete group"><i class="material-icons">clear</i></button> \
	</div> \
	<div class="cond-group-conditions"> \
	  <div class="btn-group cond-group-control tb-tbn-check"> \
		<button class="btn btn-xs btn-primary re-op-not" title="Invert the result of the AND/OR/XOR"> NOT </button> \
	  </div> \
	  <div class="btn-group cond-group-control tb-btn-radio"> \
		<button class="btn btn-xs btn-primary re-op-and checked" title="AND means group is true only if all conditions/subgroups are true"> AND </button> \
		<button class="btn btn-xs btn-primary re-op-or" title="OR means group is true if any child condition/subgroup is true"> OR </button> \
		<button class="btn btn-xs btn-primary re-op-xor" title="XOR (exclusive or) means group is true if one and only one condition/subgroup is true"> XOR </button> \
		<button class="btn btn-xs btn-primary re-op-nul" title="NUL means group does not affect logic state of parent group"> NUL </button> \
	  </div> \
	  <div class="btn-group cond-group-control tb-btn-check"> \
		<button class="btn btn-xs btn-primary re-disable" title="Disabled groups are ignored, as if they did not exist (conditions don\'t run)"> DISABLE </button> \
	  </div> \
	  <div class="cond-group-title"> \
		<span class="re-title"></span> \
		<button class="btn md-btn re-edittitle" title="Edit group name"><i class="material-icons">edit</i></button> \
		<button class="btn md-btn noroot re-collapse" title="Collapse group"><i class="material-icons">expand_less</i></button> \
		<button class="btn md-btn noroot re-focus" title="Focus on this group"><i class="material-icons">filter_center_focus</i></button> \
		<span class="re-titlemessage"></span> \
	  </div> \
	</div> \
  </div> \
  <div class="error-container"></div> \
  <div class="cond-group-body"> \
	<div class="cond-list"></div> \
	<div class="cond-group-actions"> \
	  <button class="btn md-btn re-addcond" title="Add condition to this group"><i class="material-icons">playlist_add</i></button> \
	  <button class="btn md-btn re-addgroup" title="Add subgroup to this group"><i class="material-icons">library_add</i></button> \
	</div> \
  </div> \
</div>' );
			el.attr('id', grpid);
			$( 'span.re-title', el ).text( grpid );
			$( 'div.cond-group-conditions input[type="radio"]', el ).attr('name', grpid);
			if ( 'root' === grpid ) {
				/* Can't delete root group, but use the space for Save and Revert */
				$( 'button.re-delgroup', el ).replaceWith(
					$( '<button class="btn btn-xs btn-success saveconf"> Save </button> <button class="btn btn-xs btn-danger revertconf"> Revert </button>' )
				);

				/* For root group, remove all elements with class noroot */
				$( '.noroot', el ).remove();
			}

			$( 'button.re-focus', el ).prop( 'disabled', true ).hide(); /* TODO: for now */

			$( 'button.re-addcond', el ).on( 'click.reactor', handleAddConditionClick );
			$( 'button.re-addgroup', el ).on( 'click.reactor', handleAddGroupClick );
			$( 'button.re-delgroup', el ).on( 'click.reactor', handleDeleteGroupClick );
			$( 'button.re-condmore', el).on( 'click.reactor', handleExpandOptionsClick );
			$( 'span.re-title,button.re-edittitle', el ).on( 'click.reactor', handleTitleClick );
			$( 'button.re-collapse', el ).on( 'click.reactor', handleGroupExpandClick );
			$( 'button.re-focus', el ).on( 'click.reactor', handleGroupFocusClick );
			$( '.cond-group-control > button', el ).on( 'click.reactor', handleGroupControlClick );
			$( '.cond-list', el ).addClass("tb-sortable").sortable({
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
			container = container || $( 'div#conditions' );
			depth = depth || 0;

			var el = getGroupTemplate( grp.id );
			container.append( el );

			el.addClass( 'level' + depth ).addClass( 'levelmod' + (depth % 4) );
			$( 'span.re-title', el ).text( grp.name || grp.id ).attr( 'title', msgGroupIdChange );
			$( 'div.cond-group-conditions .tb-btn-radio button', el ).removeClass( "checked" );
			$( 'div.cond-group-conditions .tb-btn-radio button.re-op-' + ( grp.operator || "and" ), el ).addClass( "checked" );
			if ( grp.invert ) {
				$( 'div.cond-group-conditions button.re-op-not', el ).addClass( "checked" );
			} else { delete grp.invert; }
			if ( grp.disabled ) {
				$( 'div.cond-group-conditions button.re-disable', el ).addClass( "checked" );
			} else { delete grp.disabled; }
			if ( grp.options && hasAnyProperty( grp.options ) ) {
				$( 'button.re-condmore', el ).addClass( 'attn' );
			}

			container = $( 'div.cond-list', el );

			var lx = grp.conditions ? grp.conditions.length : 0;
			for ( var ix=0; ix<lx; ix++ ) {
				var cond = grp.conditions[ix];
				if ( "group" !== ( cond.type || "group" ) ) {
					var row = getConditionTemplate( cond.id );
					container.append( row );

					var sel = $('select.re-condtype', row);
					if ( $('option[value="' + cond.type + '"]', sel).length === 0 ) {
						/* Condition type not on menu, probably a deprecated form. Insert it. */
						sel.append('<option value="' + cond.type + '">' +
							(condTypeName[cond.type] === undefined ? cond.type + ' (deprecated)' : condTypeName[cond.type] ) +
							'</option>');
					}
					$('select.re-condtype', row).val( cond.type );
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
			var container = $("div#conditions");
			container.empty();

			var cdata = getConfiguration( myid );
			redrawGroup( myid, cdata.conditions.root );

			$( 'div.cond-cond', container ).has( '.tberror' ).addClass( 'tberror' );

			$("button.saveconf").on( 'click.reactor', handleSaveClick );
			$("button.revertconf").on( 'click.reactor', handleRevertClick );

			updateSaveControls();

			/* Clear unused state variables here so that we catch ReactorGroup
			 * service, for which the function requires ixCond. */
			clearUnusedStateVariables( myid, cdata );
		}

		function startCondBuilder() {
			var myid = api.getCpanelDeviceId();

			redrawConditions( myid );

			if ( 0 !== parseInt( getParentState( "DefaultCollapseConditions", myid ) || "0" ) ) {
				$( 'div.reactortab .cond-group-title button.re-collapse').trigger( 'click' );
			}
		}

		/* Public interface */
		console.log("Initializing ConditionBuilder module");
		myModule = {
			init: function( dev ) {
				return initModule( dev );
			},
			start: startCondBuilder,
			redraw: redrawConditions,
			makeVariableMenu: makeVariableMenu
		};
		return myModule;

	})( api, jQuery );

	function doConditions()
	{
		console.log("doConditions()");
		try {
			var myid = api.getCpanelDeviceId();
			checkUnsaved( myid );

			if ( ! CondBuilder.init( myid ) ) {
				return;
			}

			header();

			/* Our styles. */
			if ( 0 === $('style#reactor-condition-styles').length ) {
				$('head').append( '<style id="reactor-condition-styles"> \
div#tab-conds.reactortab div#conditions { width: 100%; } \
div#tab-conds.reactortab .cond-group { position: relative; margin: 4px 0; border-radius: 4px; padding: 5px; border: 1px solid #EEE; background: rgba(255, 255, 255, 0.9); } \
div#tab-conds.reactortab .cond-group { padding: 10px; padding-bottom: 6px; border: 1px solid #0c6099; background: #bce8f1; } \
div#tab-conds.reactortab .cond-group.levelmod1 { background-color: #faebcc; } \
div#tab-conds.reactortab .cond-group.levelmod2 { background-color: #d6e9c6; } \
div#tab-conds.reactortab .cond-group.levelmod3 { background-color: #ebccd1; } \
div#tab-conds.reactortab .cond-cond { position: relative; margin: 4px 0; border-radius: 4px; padding: 5px; border: 1px solid #0c6099; background: #fff; } \
div#tab-conds.reactortab .cond-group-header { margin-bottom: 10px; } \
div#tab-conds.reactortab .cond-group-actions { margin-left: 15px; margin-bottom: 8px; } \
div#tab-conds.reactortab .cond-list { list-style: none; padding: 0 0 0 15px; margin: 0; min-height: 24px; } \
div#tab-conds.reactortab .error-container { display: none; cursor: help; color: #F00; } \
.cond-list > *:not(.ui-draggable-dragging)::before, .cond-list > *:not(.ui-draggable-dragging)::after { content: "";  position: absolute; left: -12px; width: 12px; height: calc(50% + 4px); border-color: #333333; border-style: solid; } \
.cond-list > *:not(.ui-draggable-dragging)::before { top: -4px; border-width: 0 0 2px 2px; } \
.cond-list > *:not(.ui-draggable-dragging)::after { top: 50%; border-width: 0 0 0 2px; } \
.cond-list > *:not(.ui-draggable-dragging):first-child::before { top: -12px; height: calc(50% + 14px); } \
.cond-list > *:not(.ui-draggable-dragging):last-child::before {  border-radius: 0 0 0 4px; } \
.cond-list > *:not(.ui-draggable-dragging):last-child::after { display: none; } \
div#tab-conds.reactortab .cond-group-title { display: inline-block; } \
div#tab-conds.reactortab .cond-group-title span.re-title { padding: 0 4px; font-size: 16px; font-weight: bold; color: #036; } \
div#tab-conds.reactortab .btn.checked { background-color: #5cb85c; } \
div#tab-conds.reactortab .btn.re-disable.checked { background-color: #d9534f; } \
div#tab-conds.reactortab div.cond-group.tbmodified:not(.tberror) { } \
div#tab-conds.reactortab div.cond-group.tberror { border-left: 4px solid red; } \
div#tab-conds.reactortab div.cond-cond.tbmodified:not(.tberror) { } \
div#tab-conds.reactortab div.cond-cond.tberror { border-left: 4px solid red; } \
div#tab-conds.reactortab div.condopts { padding-left: 32px; } \
div#tab-conds.reactortab div.cond-type { display: inline-block; vertical-align: top; } \
div#tab-conds.reactortab div.paramsX { display: inline-block; clear: right; } \
div#tab-conds.reactortab div.paramsX > div,label { display: inline-block; border: none; margin: 0 4px; padding: 0 0; } \
div#tab-conds.reactortab div.currval { font-family: "Courier New", Courier, monospace; font-size: 0.9em; margin: 8px 0px; display: block; } \
div#tab-conds.reactortab div.warning { color: red; } \
div#tab-conds.reactortab button.md-btn.attn { background-color: #ff8; background-image: linear-gradient( to bottom, #fff, #ff8 );} \
div#tab-conds.reactortab button.md-btn.draghandle { cursor: grab; } \
div#tab-conds.reactortab div.vargroup { display: inline-block; white-space: nowrap; } \
div#tab-conds.reactortab div.eventlist { display: inline-block; } \
div#tab-conds.reactortab div.eventlist button { padding: 5px 0px; border-radius: 4px 0 0 4px; background-color: #ccc; background-image: linear-gradient( to bottom, #fff, #e6e6e6 ); background-repeat: repeat-x; } \
div#tab-conds.reactortab div.eventlist button i { font-size: 21px; color: #666; vertical-align:middle; } \
div#tab-conds.reactortab .varmenu { border-left: none; border-top-left-radius: 0px; border-bottom-left-radius: 0px; } \
div#tab-conds.reactortab div.tboptgroup { background: #fff; border: 1px solid grey; border-radius: 12px; padding: 12px 12px; } \
div#tab-conds.reactortab div#restrictopt { margin-top: 4px; } \
div#tab-conds.reactortab div.opttitle { font-size: 1.15em; font-weight: bold; } \
div#tab-conds.reactortab div.condfieldsX { display: inline-block; } \
div#tab-conds.reactortab div.opt-fs { border-bottom: 1px solid #ccc; margin: 4px 0 0 16px; padding: 4px 0; } \
div#tab-conds.reactortab div.opt-fs input[type=radio] { margin-left: -16px; } \
div#tab-conds.reactortab input.titleedit { font-size: 12px; height: 24px; } \
div#tab-conds.reactortab input.re-comment { width: 100% !important; } \
</style>');
			}

			/* Body content */
			var html = '<div id="tab-conds" class="reactortab">';
			html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Conditions</h3></div></div>';

			var rr = api.getDeviceState( myid, serviceId, "Retrigger" ) || "0";
			if ( rr !== "0" ) {
				html += '<div class="row"><div class="warning col-xs-12 col-sm-12">WARNING! Retrigger is on! You should avoid using time-related conditions in this ReactorSensor, as they may cause frequent retriggers!</div></div>';
			}

			html += '<div id="conditions"></div>';

			html += '</div>'; /* #tab-conds */

			html += footer();

			api.setCpanelContent(html);

			if ( checkRemoteAccess() ) {
				$( 'div.reactortab' ).prepend(
					$( '<div class="remotealert re-alertblock"></div>' ).text( msgRemoteAlert )
				);
			}

			/* Set up a data list with our variables */
			var cd = getConfiguration( myid );
			var dl = $('<datalist id="reactorvarlist"></datalist>');
			if ( cd.variables ) {
				for ( var vname in cd.variables ) {
					if ( cd.variables.hasOwnProperty( vname ) ) {
						var opt = $( '<option></option>' ).val( '{'+vname+'}' ).text( '{'+vname+'}' );
						dl.append( opt );
					}
				}
			}
			$( 'div#tab-conds.reactortab' ).append( dl );

			CondBuilder.start( myid );
		}
		catch (e)
		{
			console.log( 'Error in ReactorSensor.doConditions(): ' + String( e ) );
			console.log( e );
			alert( e.stack );
		}
	}

/** ***************************************************************************
 *
 * E X P R E S S I O N S
 *
 ** **************************************************************************/

	function updateVariableControls() {
		var container = $('div#reactorvars');
		var errors = $('.tberror', container);
		$("button.saveconf", container).prop('disabled', ! ( configModified && errors.length === 0 ) );
		$("button.revertconf", container).prop('disabled', !configModified);
	}

	function handleVariableChange( ev ) {
		var container = $('div#reactorvars');
		var cd = getConfiguration();

		$('.tberror', container).removeClass( 'tberror' );
		$('div.varexp', container).each( function( ix, obj ) {
			var row = $(obj);
			var vname = row.attr("id");
			if ( undefined === vname ) return;
			var expr = ( $('textarea.expr', row).val() || "" ).trim();
			expr = expr.replace( /^=+\s*/, "" ); /* Remove leading =, this isn't Excel people */
			$( 'textarea.expr', row ).val( expr );
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
			var exp = $( 'button.re-export', row ).hasClass( 'attn' ) ? undefined : 0;
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
		var row = $( ev.currentTarget ).closest( "div.varexp" );
		$.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "lr_Reactor",
				action: "tryexpression",
				device: api.getCpanelDeviceId(),
				expr: $( 'textarea.expr', row ).val() || "",
				r: Math.random()
			},
			dataType: "json",
			cache: false,
			timeout: 5000
		}).done( function( data, statusText, jqXHR ) {
			var msg;
			if ( data.err ) {
				msg = 'There is an error in the expression';
				if ( data.err.location ) {
					$('textarea.expr', row).focus().prop('selectionStart', data.err.location);
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
		var row = $( ev.currentTarget ).closest( 'div.varexp' );
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
		var container = $('div#reactorvars');
		var row = $( 'div#opt-state', container );
		row.remove();
		$( 'button#addvar', container ).prop( 'disabled', false );
		$( 'textarea.expr,button.md-btn', container ).prop( 'disabled', false );
	}

	function handleGetStateClear( ev ) {
		ev.preventDefault();
		clearGetStateOptions();
	}

	function handleGetStateInsert( ev ) {
		var row = $( ev.currentTarget ).closest( 'div.row' );

		var device = $( 'select#gsdev', row ).val() || "-1";
		var service = $( 'select#gsvar', row ).val() || "";
		var variable = service.replace( /^[^\/]+\//, "" );
		service = service.replace( /\/.*$/, "" );
		if ( "-1" === device ) {
			device = "null";
		} else if ( $( 'input#usename', row ).prop( 'checked' ) ) {
			device = '"' + $( 'select#gsdev option:selected' ).text().replace( / +\(#\d+\)$/, "" ) + '"';
		}
		var str = ' getstate( ' + device + ', "' + service + '", "' + variable + '" ) ';

		var varrow = row.prev();
		var f = $( 'textarea.expr', varrow );
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
		var row = $( ev.currentTarget ).closest( 'div.row' );
		var f = $( ev.currentTarget );
		if ( f.attr( 'id' ) == "gsdev" ) {
			var device = parseInt( f.val() || "-1" );
			var s = CondBuilder.makeVariableMenu( device, "", "" ).attr( 'id', 'gsvar' );
			$( 'select#gsvar', row ).replaceWith( s );
			/* Switch to new varmenu */
			f = $( 'select#gsvar', row );
			f.on( 'change.reactor', handleGetStateOptionChange );
		}
		$( 'button#getstateinsert', row ).prop( 'disabled', "" === f.val() );
	}

	function handleGetStateClick( ev ) {
		var row = $( ev.currentTarget ).closest( 'div.varexp' );
		var container = $('div#reactorvars');

		$( 'button#addvar', container ).prop( 'disabled', true );
		$( 'button.md-btn', container ).prop( 'disabled', true );
		$( 'textarea.expr', row ).prop( 'disabled', false );

		/* Remove any prior getstates */
		$('div#opt-state').remove();

		var el = $( '<div class="col-xs-12 col-md-9 col-md-offset-2 form-inline"></div>' );
		el.append( makeDeviceMenu( "", "" ).attr( 'id', 'gsdev' ) );
		el.append( CondBuilder.makeVariableMenu( parseInt( $( 'select#gsdev', el ).val() ), "", "" )
			.attr( 'id', 'gsvar' ) );
		el.append(' ');
		el.append( '<label class="checkbox-inline"><input id="usename" type="checkbox">&nbsp;Use&nbsp;Name</label>' );
		el.append(' ');
		el.append( $( '<button></button>' ).attr( 'id', 'getstateinsert' )
			.addClass( "btn btn-xs btn-success" )
			.text( 'Insert' ) );
		el.append( $( '<button></button>' ).attr( 'id', 'getstatecancel' )
			.addClass( "btn btn-xs btn-default" )
			.text( 'Cancel' ) );
		$( '<div id="opt-state" class="row"></div>' ).append( el ).insertAfter( row );

		$( 'select.devicemenu', el ).on( 'change.reactor', handleGetStateOptionChange );
		$( 'button#getstateinsert', el ).prop( 'disabled', true )
			.on( 'click.reactor', handleGetStateInsert );
		$( 'button#getstatecancel', el ).on( 'click.reactor', handleGetStateClear );
		$( 'button.saveconf' ).prop( 'disabled', true );
	}

	function handleExportClick( ev ) {
		var $el = $( ev.currentTarget );
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
		var el = $('<div class="row varexp"></div>');
		el.append( '<div class="col-xs-12 col-sm-12 col-md-2 re-varname"></div>' );
		el.append( '<div class="col-xs-12 col-sm-9 col-md-8"><textarea class="expr form-control form-control-sm" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="off"></textarea><div class="currval"></div></div>');
		// ??? devices_other is an alternate for insert state variable
		el.append( '<div class="col-xs-12 col-sm-3 col-md-2 text-right">\
<button class="btn md-btn draghandle" title="Change order (drag)"><i class="material-icons">reorder</i></button>\
<button class="btn md-btn re-export" title="Result exports to state variable"><i class="material-icons">import_export</i></button>\
<button class="btn md-btn re-tryexpr" title="Try this expression"><i class="material-icons">directions_run</i></button>\
<button class="btn md-btn re-getstate" title="Insert device state variable value"><i class="material-icons">memory</i></button>\
<button class="btn md-btn re-deletevar" title="Delete this variable"><i class="material-icons">clear</i></button>\
</div>' );
		$( 'textarea.expr', el ).prop( 'disabled', true ).on( 'change.reactor', handleVariableChange );
		$( 'button.re-export', el ).prop( 'disabled', true ).on( 'click.reactor', handleExportClick );
		$( 'button.re-tryexpr', el ).prop( 'disabled', true ).on( 'click.reactor', handleTryExprClick );
		$( 'button.re-getstate', el ).prop( 'disabled', true ).on( 'click.reactor', handleGetStateClick );
		$( 'button.re-deletevar', el ).prop( 'disabled', true ).on( 'click.reactor', handleDeleteVariableClick );
		$( 'button.draghandle', el ).prop( 'disabled', true );
		return el;
	}

	function handleAddVariableClick() {
		var container = $('div#reactorvars');

		$( 'button#addvar', container ).prop( 'disabled', true );
		$( 'div.varexp textarea.expr,button.md-btn', container ).prop( 'disabled', true );

		var editrow = getVariableRow();
		$( 'div.re-varname', editrow ).empty().append( '<input class="form-control form-control-sm" title="Enter a variable name and then TAB out of the field.">' );
		$( 'div.re-varname input', editrow ).on('change.reactor', function( ev ) {
			/* Convert to regular row */
			var f = $( ev.currentTarget );
			var row = f.closest( 'div.varexp' );
			var vname = (f.val() || "").trim();
			if ( vname === "" || $( 'div.varexp#' + idSelector( vname ) ).length > 0 || !vname.match( /^[A-Z][A-Z0-9_]*$/i ) ) {
				row.addClass( 'tberror' );
				f.addClass('tberror');
				f.focus();
			} else {
				row.attr('id', vname).removeClass('editrow').removeClass('tberror');
				$( '.tberror', row ).removeClass('tberror');
				/* Remove the name input field and swap in the name (text) */
				f.parent().empty().text(vname);
				/* Re-enable fields and add button */
				$( 'button#addvar', container ).prop( 'disabled', false );
				$( 'button.md-btn', container ).prop('disabled', false);
				$( 'textarea.expr', container ).prop( 'disabled', false );
				$( 'textarea.expr', row ).focus();
				/* Do the regular stuff */
				handleVariableChange( null );
			}
		});
		$( 'div.varlist', container ).append( editrow );
		$( 'div.re-varname input', editrow ).focus();
	}

	/**
	 * Redraw variables and expressions.
	*/
	function redrawVariables() {
		var container = $('div#tab-vars.reactortab div#reactorvars');
		container.empty();
		var gel = $('<div class="vargroup"></div>');
		gel.append('<div class="row"><div class="tblisttitle col-xs-6 col-sm-6"><span class="re-title">Defined Variables</span></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button class="btn btn-xs btn-success saveconf">Save</button> <button class="btn btn-xs btn-danger revertconf">Revert</button></div></div>');

		var list = $( '<div class="varlist tb-sortable"></div>' );
		gel.append( list );

		var myid = api.getCpanelDeviceId();
		var cdata = getConfiguration( myid );

		var cstate = getConditionStates( myid );
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
		var lx = vix.length;
		for ( var ix=0; ix<lx; ix++ ) {
			var vd = vix[ix];
			var el = getVariableRow();
			el.attr( 'id', vd.name );
			$( 'div.re-varname', el).text( vd.name );
			$( 'textarea.expr', el ).val( vd.expression ).prop( 'disabled', false );
			$( 'button.md-btn', el ).prop( 'disabled', false );
			var blk = $( 'div.currval', el ).empty();
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
				$( 'button.re-export', el ).addClass( 'attn' );
			}
			list.append( el );
		}

		/* Add "Add" button */
		$( '<div class="row buttonrow"></div>' )
			.append( '<div class="col-xs-12 col-sm-12"><button id="addvar" class="btn btn-sm btn-success">Add Variable/Expression</button></div>' )
			.appendTo( gel );
		$( 'button#addvar', gel ).closest( 'div' ).append( getWiki( 'Expressions-&-Variables' ) );

		/* Append the group */
		container.append( gel );

		list.sortable({
			vertical: true,
			containment: 'div.varlist',
			helper: "clone",
			handle: ".draghandle",
			cancel: "", /* so draghandle can be button */
			update: handleVariableChange
		});


		$("button#addvar", container).on( 'click.reactor', handleAddVariableClick );
		$("button.saveconf", container).on( 'click.reactor', handleSaveClick );
		$("button.revertconf", container).on( 'click.reactor', handleRevertClick );

		updateVariableControls();
	}

	function doVariables()
	{
		console.log("doVariables()");
		try {
			/* Make sure changes are saved. */
			var myid = api.getCpanelDeviceId();
			checkUnsaved( myid );

			if ( ! initModule() ) {
				return;
			}

			header();

			/* Our styles. */
			if ( 0 === $( 'style#reactor-expression-styles' ).length ) {
				$('head').append( '<style id="reactor-expression-styles"> \
div#tab-vars.reactortab .color-green { color: #006040; } \
div#tab-vars.reactortab button.md-btn.draghandle { cursor: grab; } \
div#tab-vars.reactortab div.tblisttitle { background-color: #444; color: #fff; padding: 8px; min-height: 42px; } \
div#tab-vars.reactortab div.tblisttitle span.re-title { font-size: 16px; font-weight: bold; margin-right: 4em; } \
div#tab-vars.reactortab div.vargroup { border-radius: 8px; border: 2px solid #444; margin-bottom: 8px; } \
div#tab-vars.reactortab div.vargroup .row { margin-right: 0px; margin-left: 0px; } \
div#tab-vars.reactortab div.vargroup div.var:nth-child(odd) { background-color: #efefef; } \
div#tab-vars.reactortab div.varexp,div.buttonrow { padding: 8px; } \
div#tab-vars.reactortab div.varexp.tbmodified:not(.tberror) { border-left: 4px solid green; } \
div#tab-vars.reactortab div.varexp.tberror { border-left: 4px solid red; } \
div#tab-vars.reactortab textarea.expr { font-family: monospace; resize: vertical; width: 100% !important; } \
div#tab-vars.reactortab div.varexp { cursor: default; margin: 2px 0 2px 0; } \
div#tab-vars.reactortab div.re-varname:after { content: " ="; } \
div#tab-vars.reactortab div.currval { font-family: "Courier New", Courier, monospace; font-size: 0.9em; } \
div#tab-vars.reactortab button.md-btn.attn { background-color: #ff8; background-image: linear-gradient( to bottom, #bf9, #8c6 );} \
</style>');
			}

			/* Body content */
			var html = '<div id="tab-vars" class="reactortab">';
			html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Expressions/Variables</h3></div></div>';
			html += '<div class="row"><div class="col-xs-12 col-sm-12">Note that "Last Result" values shown here do not update dynamically. For help with expressions and functions, please <a href="' + _DOCURL +
				'/Expressions-&-Variables/" target="_blank">see the Reactor Documentation</a>.</div></div>';

			html += '<div id="reactorvars"></div>';

			html += '</div>'; //.reactortab

			html += footer();

			api.setCpanelContent(html);

			if ( checkRemoteAccess() ) {
				$( 'div.reactortab' ).prepend(
					$( '<div class="remotealert re-alertblock"></div>' ).text( msgRemoteAlert )
				);
			}

			redrawVariables();
		}
		catch (e)
		{
			console.log( 'Error in ReactorSensor.doVariables(): ' + String( e ) );
			console.log(e);
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
				lua: lua,
				r: Math.random()
			},
			dataType: 'json',
			cache: false,
			timeout: 5000
		}).done( function( data, statusText, jqXHR ) {
			if ( data.status ) {
				/* Good Lua */
				return;
			} else if ( data.status === false ) { /* specific false, not undefined */
				el.addClass( "tberror" );
				$( 'div.actiondata' , row ).prepend( '<div class="tberrmsg"></div>' );
				$( 'div.tberrmsg', row ).text( data.message || "Error in Lua" );
			}
		}).fail( function( stat ) {
			console.log("Failed to check Lua: " + stat);
		});
	}

	function makeSceneMenu() {
		var ud = api.getUserData();
		var scenes = api.cloneObject( ud.scenes || [] );
		var menu = $( '<select class="form-control form-control-sm re-scene"></select>' );
		/* If lots of scenes, sort by room; otherwise, use straight as-is */
		var i, l;
		if ( true || scenes.length > 10 ) {
			var rooms = api.cloneObject( ud.rooms );
			var rid = {};
			l = rooms.length;
			for ( i=0; i<l; ++i ) {
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
			l = scenes.length;
			for ( i=0; i<l; i++ ) {
				if ( scenes[i].notification_only || scenes[i].hidden ) {
					continue;
				}
				var r = scenes[i].room || 0;
				if ( r != lastRoom ) {
					if ( xg && $( 'option:first', xg ).length > 0 ) {
						menu.append( xg );
					}
					xg = $( '<optgroup></optgroup>' )
						.attr( 'label', ( rid[r] || {} ).name || ( "Room " + String(r) ) );
					lastRoom = r;
				}
				xg.append( $( '<option></option>' ).val( scenes[i].id )
					.text( String(scenes[i].name) + ' (#' + String(scenes[i].id) +
					( scenes[i].paused ? ", disabled" : "" ) +
					')' ) );
			}
			if ( xg && $( 'option:first', xg ).length > 0 ) {
				menu.append( xg );
			}
		} else {
			/* Simple alpha list */
			scenes.sort( function(a, b) { return ( a.name || "" ).toLowerCase() < ( b.name || "" ).toLowerCase() ? -1 : 1; } );
			l = scenes.length;
			for ( i=0; i<l; i++ ) {
				if ( scenes[i].notification_only || scenes[i].hidden ) {
					continue;
				}
				var opt = $('<option value="' + scenes[i].id + '"></option>');
				opt.text( scenes[i].name || ( "#" + scenes[i].id ) );
				menu.append( opt );
			}
		}
		return menu;
	}

	function validateActionRow( row ) {
		var actionType = $('select.re-actiontype', row).val();
		$('.tberror', row).removeClass( 'tberror' );
		$('.tbwarn', row).removeClass( 'tbwarn' );
		row.removeClass( 'tberror' );
		$( 'div.tberrmsg', row ).remove();
		var pfx = row.attr( 'id' ) + '-';

		var dev, k;
		switch ( actionType ) {
			case "comment":
				break;

			case "delay":
				dev = $( 'input#' + idSelector( pfx + 'delay' ), row );
				var delay = dev.val() || "";
				if ( delay.match( varRefPattern ) ) {
					// Variable reference. ??? check it?
				} else if ( delay.match( /^([0-9][0-9]?)(:[0-9][0-9]?){1,2}$/ ) ) {
					// MM:SS or HH:MM:SS
				} else {
					var n = parseInt( delay );
					if ( isNaN( n ) || n < 1 ) {
						dev.addClass( "tberror" );
					}
				}
				break;

			case "device":
				dev = $( 'select.devicemenu', row ).val();
				if ( isEmpty( dev ) ) {
					$( 'select.devicemenu', row ).addClass( 'tberror' );
				} else {
					var devnum = parseInt( dev );
					if ( -1 === devnum ) devnum = api.getCpanelDeviceId();
					var sact = $('select.re-actionmenu', row).val();
					if ( isEmpty( sact ) ) {
						$( 'select.re-actionmenu', row ).addClass( "tberror" );
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
						var lk = ai.parameters ? ai.parameters.length : 0;
						for ( k=0; k<lk; k++ ) {
							var p = ai.parameters[k];
							if ( undefined === p.value ) { /* ignore fixed value */
								/* Fetch value */
								var field = $( '#' + idSelector( pfx + p.name ), row );
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
									/* Not optional/empty allowed, flag error. */
									field.toggleClass( 'tbwarn', ! ( p.optional || p.allowempty ) );
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
				dev = $( 'select.re-scene', row );
				dev.toggleClass( 'tberror', isEmpty( dev.val() ) );
				break;

			case "runlua":
				var lua = $( 'textarea.re-luacode', row ).val() || "";
				// check Lua?
				if ( lua.match( /^[\r\n\s]*$/ ) ) {
					$( 'textarea.re-luacode', row ).addClass( "tberror" );
				} else {
					testLua( lua, $( 'textarea.re-luacode', row ), row );
				}
				break;

			case "rungsa":
				dev = $( 'select.devicemenu', row );
				dev.toggleClass( 'tberror', isEmpty( dev.val() ) );
				dev = $( 'select.re-activity', row );
				dev.toggleClass( 'tberror', isEmpty( dev.val() ) );
				break;

			case "stopgsa":
				dev = $( 'select.devicemenu', row );
				dev.toggleClass( 'tberror', isEmpty( dev.val() ) );
				break;

			case "setvar":
				var vname = $( 'select.re-variable', row );
				vname.toggleClass( 'tberror', isEmpty( vname.val() ) );
				break;

			case "resetlatch":
				dev = $( 'select.devicemenu', row );
				dev.toggleClass( 'tberror', isEmpty( dev.val() ) );
				break;

			case "notify":
				var method = $( 'select.re-method', row ).val() || "";
				var ninfo = arrayFindValue( notifyMethods, function( v ) { return v.id === method; } ) || notifyMethods[0];
				if ( false !== ninfo.users && 0 === $("div.re-users input:checked", row ).length ) {
					$( 'div.re-users', row ).addClass( 'tberror' );
				}
				/* Message cannot be empty. */
				dev = $( 'input.re-message', row );
				var vv = (dev.val() || "").trim();
				dev.val( vv );
				if ( isEmpty( vv ) ) {
					dev.addClass( 'tberror' );
				} else if ( null !== vv.match(/{[^}]+}/) ) {
					/* Check substitution validity and syntax */
					$( 'div.nativesub' ).toggle( "" === method );
					$( 'div.subformat' ).toggle( !vv.match( varRefPattern ) );
				}
				var lf = ninfo.extra ? ninfo.extra.length : 0;
				for ( var f=0; f<lf; f++ ) {
					dev = $( '.re-extra-' + ninfo.extra[f].id, row );
					vv = (dev.val() || "").trim();
					var fails = false;
					if ( isEmpty( vv ) ) {
						fails = true !== ninfo.extra[f].optional;
					} else if ( ninfo.extra[f].validpattern && !vv.match( ninfo.extra[f].validpattern ) ) {
						fails = true;
					}
					dev.toggleClass( 'tberror', fails );
				}
				break;

			case "request":
				var rmethod = $( 'select.re-method', row ).val() || "GET";
				var url = $( '.re-url', row ).val() || "";
				if ( ! url.match( "^https?://" ) ) {
					$( '.re-url', row ).addClass( "tberror" );
				}
				/* Header format check */
				var pd = $( '.re-reqheads', row ).val() || "";
				if ( ! isEmpty( pd ) ) {
					var heads = pd.trim().split( /\n/ );
					var lh = heads.length;
					for ( k=0; k<lh; ++k ) {
						/* Must be empty or "Header-Name: stuff" */
						if ( ! ( isEmpty( heads[k] ) || heads[k].match( /^([A-Z0-9-]+):\s*/ ) ) ) {
							$( 're-reqheads', row ).addClass( "tberror" );
							break;
						}
					}
				}
				if ( "POST" === rmethod && ! pd.match( /content-type:/i ) ) {
					$( '.re-reqheads', row ).val( "Content-Type: application/x-www-form-urlencoded\n" + pd );
				}
				/* We don't validate post data */
				$( 'div.re-reqdatafs', row ).toggle( "POST" === rmethod );
				break;

			default:
				/* Do nothing */
		}

		row.has('.tberror').addClass('tberror');
	}

	/* Find notification scene by notification ID */
	function findNotificationScene( myid, nid ) {
		var ud = api.getUserData();
		var lk = ud.scenes ? ud.scenes.length : 0;
		for ( var k=0; k<lk; k++ ) {
			if ( String(ud.scenes[k].notification_only) === String(myid) &&
				String((ud.scenes[k].triggers || [])[0].template) === "10" && /* magic */
				String(ud.scenes[k].triggers[0].arguments[0].value) == String(nid) ) {
					return ud.scenes[k];
			}
		}
		return false;
	}

	/* Test if notification scene is controlled by VeraAlerts */
	function isVAControlledScene( scene ) {
		if ( devVeraAlerts ) {
			try {
				if ( !isEmpty( scene.triggers[0].lua ) ) {
					var m = scene.triggers[0].lua;
					if ( 0 != ( scene.triggers[0].encoded_lua || 0 ) ) {
						m = atob( m );
					}
					return null !== m.match( /StartVeraAlerts/i );
				}
			} catch( e ) {
				console.log("Failed to decode/handle VA scene lua for #" + scene.id);
				console.log(e);
			}
		}
		return false;
	}

	/* Given a notification scene ID, return VeraAlerts message override, if any. */
	function getVAMessageOverride( scid ) {
		var mo = api.getDeviceStateVariable( devVeraAlerts, "urn:richardgreen:serviceId:VeraAlert1", "MsgOverride" ) || "";
		try {
			if ( !isEmpty(mo) ) {
				/* custom array, Lua-ish, not JSON */
				var md = mo.match( /'([^']*)',?/g );
				var vad = new RegExp( "^'" + String(scid) + "_0'", "i" );
				var lk = md.length;
				for ( var k=0; k<lk; k+=2 ) {
					if ( vad.test( md[k] ) && !isEmpty( md[k+1] ) ) {
						vad = decodeURIComponent( md[k+1].replace( /',?$/, "" ).replace( /^'/, "" ) );
						if ( !isEmpty( vad ) ) {
							return vad;
						}
						return false;
					}
				}
			}
		} catch( e ) {
			console.log("Failed to get VA message for " + String(scid) + " from " + String(mo));
			console.log(e);
		}
	}

	/* Return next available notification slot (integer as string) */
	function nextNotification( config ) {
		/* Safety first and second. */
		config.notifications = config.notifications || {};
		if ( ! parseInt( config.notifications.nextid ) ) {
			config.notifications.nextid = 1;
		}
		var nid = String(config.notifications.nextid);
		while ( config.notifications[nid] ) {
			nid = String(++config.notifications.nextid);
		}
		return nid;
	}

	/* Check that notification scene exists; create it if not */
	function checkNotificationScene( myid, nid ) {
		myid = myid || api.getCpanelDeviceId();
		var scene = findNotificationScene( myid, nid );
		/* Create or update it. */
		var cf = getConfiguration( myid );
		cf.notifications = cf.notifications || {};
		cf.notifications[String(nid)] = cf.notifications[String(nid)] || { id: nid };
		var nn = cf.notifications[String(nid)];
		nn.message = nn.message || nid;
		if ( !scene ) {
			/* Set up new scene */
			scene = {
				name: nn.message, /* message should go here */
				notification_only: myid,
				modeStatus: "0",
				triggers: [{
					device: myid,
					name: nn.message,
					enabled: 1,
					arguments: [{ id: "1", value: nid }], /* notification id here */
					template: "10",
					users: nn.users || ""
				}],
				users: nn.users || "",
				room: 0
			};
		} else {
			/* Existing scene */
			nn.scene = scene.id;
			/* If VeraAlerts is installed, see if scene has been modified with VA's scene Lua */
			if ( devVeraAlerts && isVAControlledScene( scene ) ) {
				nn.veraalerts = 1;
			} else {
				delete nn.veraalerts;
			}
			/* Maybe update existing scene */
			if ( scene.name === nn.message && scene.users === ( nn.users || "" ) ) {
				return false;
			}
			scene.name = nn.message;
			scene.users = nn.users || "";
			scene.triggers[0].users = scene.users;
			scene.triggers[0].name = scene.name;
		}
		var req = { id: "scene", action: "create" };
		req.json = JSON.stringify( scene );
		$.ajax({
			url: api.getDataRequestURL(),
			method: "POST",
			data: req,
			dataType: "text",
			cache: false,
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
		cf.__reloadneeded = true;
		return true;
	}

	/* Removes unused notification scenes from the RS */
	function cleanNotificationScenes( myid ) {
		var k, lk, deletes = [];
		myid = myid || api.getCpanelDeviceId();
		var cf = getConfiguration( myid );

		/* First, make map of all notification keys */
		var nots = {};
		var nk = Object.keys( cf.notifications || {} );
		lk = nk.length;
		for ( k=0; k<lk; k++ ) {
			nots[nk[k]] = true;
		}
		delete nots.nextid; /* reserved key */

		/* Remove all keys from nots for which there is an action. */
		var valids = {};
		for ( var act in (cf.activities || {}) ) {
			if ( ! cf.activities.hasOwnProperty(act) ) continue;
			lk = cf.activities[act].groups ? cf.activities[act].groups.length : 0;
			for ( k=0; k<lk; k++ ) {
				var ll = cf.activities[act].groups[k].actions ? cf.activities[act].groups[k].actions.length : 0;
				for ( var l=0; l<ll; l++) {
					var action = cf.activities[act].groups[k].actions[l];
					if ( "notify" === action.type ) {
						var key = String(action.notifyid);
						if ( undefined === cf.notifications[key] ) {
							console.log("cleanNotificationScenes() action #" + l + " in group #" +
								k + " of " + act + " refers to non-existent notification " + key);
						} else {
							valids[key] = true;
							delete nots[key];
							/* If this is a non-native method, remove a scene */
							if ( "" !== (action.method || "") && cf.notifications[key].scene ) {
								console.log("cleanNotificationScenes() marking scene " + String(cf.notifications[key].scene) +
									" for deletion, non-native method for notification " + key);
								deletes.push( cf.notifications[key].scene );
								delete cf.notifications[key].scene;
							}
						}
					}
				}
			}
		}

		/* At this point, any remaining in nots are not associated with any action */
		for ( var n in nots ) {
			if ( nots.hasOwnProperty( n ) ) {
				console.log("cleanNotificationScenes() removing orphan notification " + String(n));
				delete cf.notifications[n];
			}
		}

		/* Now find and remove any notification scenes that are not associated
		   with known notify actions remaining. */
		var scenes = api.cloneObject( api.getUserData().scenes || [] );
		lk = scenes.length;
		for ( k=0; k<lk; ++k ) {
			if ( String(scenes[k].notification_only) === String(myid) &&
					String((scenes[k].triggers || [])[0].template) === "10" ) { /* template id from static JSON, never changes */
				/* This is a notification scene for this RS */
				console.log("Checking notification scene #" + scenes[k].id);
				if ( deletes.indexOf( scenes[k].id ) >= 0 ) {
					console.log("Scene " + scenes[k].id + " already marked for deletion");
				} else if ( undefined === valids[String(scenes[k].triggers[0].arguments[0].value)] ) {
					console.log("Marking orphaned notification scene #" + scenes[k].id);
					deletes.push(scenes[k].id);
				} else {
					/* Save scene on notification. Remove from valids so any dups are also removed. */
					cf.notifications[String(scenes[k].triggers[0].arguments[0].value)].scene = scenes[k].id;
					delete valids[String(scenes[k].triggers[0].arguments[0].value)];
				}
			}
		}
		function _rmscene( myid, dl ) {
			var scene = dl.pop();
			if ( scene ) {
				console.log("Removing unused notification scene #" + scene);
				$.ajax({
					url: api.getDataRequestURL(),
					data: { id: "scene", action: "delete", scene: scene },
					dataType: "text",
					cache: false,
					timeout: 5000
				}).always( function() {
					_rmscene( myid, dl );
				});
			}
		}
		_rmscene( myid, deletes );
	}

	/* Rebuild actions for section (class actionlist) */
	function buildActionList( root ) {
		if ( $('.tberror', root ).length > 0 ) {
			return false;
		}
		/* Set up scene framework and first group with no delay */
		var id = root.attr( 'id' );
		var scene = { isReactorScene: 1, id: id, name: id, groups: [] };
		var group = { groupid: "grp0", actions: [] };
		scene.groups.push( group );
		var firstScene = true;
		$( 'div.actionrow', root ).each( function( ix ) {
			var row = $( this );
			var pfx = row.attr( 'id' ) + '-';
			var actionType = $( 'select.re-actiontype', row ).val();
			var action = { type: actionType, index: ix+1 };
			var k, pt, t, devnum, devobj;

			switch ( actionType ) {
				case "comment":
					action.comment = $( 'input.argument', row ).val() || "";
					break;

				case "delay":
					t = $( 'input#' + idSelector( pfx + 'delay' ), row ).val() || "0";
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
						group = { actions: [], delay: t, delaytype: $( 'select.re-delaytype', row ).val() || "inline" };
						scene.groups.push( group );
					} else {
						/* There are no actions in the current group; just modify the delay in this group. */
						group.delay = t;
						group.delaytype = $( 'select.re-delaytype', row ).val() || "inline";
					}
					/* We've set up a new group, not an action, so take an early exit
					   from this each() */
					return true;

				case "device":
					action.device = parseInt( $( 'select.devicemenu', row ).val() );
					devnum = -1 === action.device ? api.getCpanelDeviceId() : action.device;
					devobj = api.getDeviceObject( devnum );
					action.devicename = (devobj || {}).name;
					delete action.deviceName; /* remove old form */
					t = $( 'select.re-actionmenu', row ).val() || "";
					pt = t.split( /\//, 2 );
					action.service = pt[0]; action.action = pt[1];
					var ai = actions[ t ];
					if ( ai && ai.deviceOverride && ai.deviceOverride[devnum] ) {
						ai = ai.deviceOverride[devnum];
					}
					/* Make LUT of known fields (if we know any) */
					var ap = {};
					var lk = ( ai && ai.parameters ) ? ai.parameters.length : 0;
					for ( k=0; k < lk; k++ ) ap[ai.parameters[k].name] = ai.parameters[k];
					/* We always use the on-page fields as the reference list of parameters. What
					   the user sees is what we store. */
					action.parameters = [];
					$( '.argument', row ).each( function() {
						var val = $( this ).val() || "";
						var pname = ($( this ).attr( 'id' ) || "unnamed").replace( pfx, '' );
						if ( ! isEmpty( val ) || ( ap[pname] && !ap[pname].optional ) ) {
							action.parameters.push( { name: pname, value: val } );
						}
						delete ap[pname];
					});
					/* Known fields that remain... */
					for ( k in ap ) {
						if ( ap.hasOwnProperty(k) ) {
							if ( ap[k].value ) {
								/* Supply fixed value field */
								action.parameters.push( { name: k, value: ap[k].value } );
							} else if ( ! ap[k].optional ) {
								action.parameters.push( { name: k, value: "" } );
							}
						}
					}
					delete action.wrap;
					break;

				case "housemode":
					action.housemode = $( 'select.re-mode', row ).val() || "1";
					break;

				case "runscene":
					action.scene = parseInt( $( "select.re-scene", row ).val() || "0" );
					if ( isNaN( action.scene ) || 0 === action.scene ) {
						console.log("buildActionList: invalid scene selected");
						scene = false;
						return false;
					}
					if ( "V" === ($( 'select.re-method', row ).val() || "") ) {
						action.usevera = 1;
					} else {
						delete action.usevera;
					}
					// action.sceneName = sceneByNumber[ action.scene ].name
					$.ajax({
						url: api.getDataRequestURL(),
						data: {
							id: "lr_Reactor",
							action: "preloadscene",
							device: api.getCpanelDeviceId(),
							scene: action.scene,
							flush: firstScene ? 0 : 1,
							r: Math.random()
						},
						dataType: "json",
						cache: false,
						timeout: 5000
					}).done( function( data, statusText, jqXHR ) {
					}).fail( function( jqXHR ) {
					});
					firstScene = false;
					break;

				case "runlua":
					var lua = $( 'textarea.re-luacode', row ).val() || "";
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
					devnum = parseInt( $( 'select.devicemenu', row ).val() || "-1" );
					if ( isNaN( devnum ) || devnum < 0 ) {
						delete action.device;
						delete action.devicename;
					} else {
						action.device = devnum;
						devobj = api.getDeviceObject( devnum < 0 ? api.getCpanelDeviceId() : devnum );
						action.devicename = devobj.name;
					}
					delete action.deviceName; /* remove old form */
					action.activity = $( 'select.re-activity', row ).val() || "";
					if ( $( 'input.re-stopall', row ).prop( 'checked' ) ) {
						action.stopall = 1;
					} else {
						delete action.stopall;
					}
					break;

				case "stopgsa":
					devnum = parseInt( $( 'select.devicemenu', row ).val() || "-1" );
					if ( isNaN( devnum ) || devnum < 0 ) {
						delete action.device;
						delete action.devicename;
					} else {
						action.device = devnum;
						devobj = api.getDeviceObject( devnum < 0 ? api.getCpanelDeviceId() : devnum );
						action.devicename = devobj.name;
					}
					delete action.deviceName; /* remove old form */
					action.activity = $( 'select.re-activity', row ).val() || "";
					if ( isEmpty( action.activity ) ) { delete action.activity; }
					break;

				case "setvar":
					action.variable = $( 'select.re-variable', row ).val();
					action.value = $( 'input#' + idSelector( pfx + "value" ), row ).val();
					if ( $( "input.tbreeval", row ).prop( "checked" ) ) {
						action.reeval = 1;
					} else {
						delete action.reeval;
					}
					break;

				case "resetlatch":
					devnum = parseInt( $( 'select.devicemenu', row ).val() || "-1" );
					if ( devnum < 0 || isNaN( devnum ) ) {
						delete action.device;
						delete action.devicename;
					} else {
						action.device = devnum;
						devobj = api.getDeviceObject( devnum < 0 ? api.getCpanelDeviceId() : devnum );
						action.devicename = devobj.name;
					}
					delete action.deviceName; /* remove old form */
					var gid = $( 'select.re-group', row ).val() || "";
					if ( isEmpty( gid ) ) {
						delete action.group;
					} else {
						action.group = gid;
					}
					break;

				case "notify":
					var nid = $( 'input.re-notifyid', row ).val() || "";
					var method = $( 'select.re-method', row ).val() || "";
					var ua = $( 'div.re-users input:checked', row );
					var users = [], unames = [];
					ua.each( function() {
						var val = $(this).val();
						if ( !isEmpty( val ) ) {
							users.push( val );
							if ( userIx[val] ) unames.push( userIx[val].name );
						}
					});
					var myid = api.getCpanelDeviceId();
					var cf = getConfiguration( myid );
					cf.notifications = cf.notifications || { nextid: 1 };
					if ( "" === nid || undefined === cf.notifications[nid] ) {
						/* No slot assigned or gone missing, reassign: get next id and create slot */
						nid = nextNotification( cf );
						cf.notifications[nid] = { 'id': parseInt(nid) };
						$( 'input.re-notifyid', row ).val( nid );
					}
					cf.notifications[nid].users = users.join(',');
					cf.notifications[nid].usernames = unames.join(',');
					cf.notifications[nid].message = $( 'input.re-message', row ).val() || nid;
					action.notifyid = nid;
					if ( "" === method ) {
						delete action.method;
						checkNotificationScene( myid, nid );
						$( 'input.re-message', row ).prop( 'disabled', cf.notifications[nid].veraalerts == 1 );
						$( '.vanotice', row ).toggle( cf.notifications[nid].veraalerts == 1 );
					} else {
						action.method = method;
						delete cf.notifications[nid].veraalerts;
						$( 'input.re-message', row ).prop( 'disabled', false );
						$( '.vanotice', row ).hide();
					}
					var ninfo = arrayFindValue( notifyMethods, function( v ) { return v.id === action.method; } ) || notifyMethods[0];
					var lf = ninfo.extra ? ninfo.extra.length : 0;
					for ( var f=0; f<lf; ++f ) {
						var fld = ninfo.extra[f];
						var fv = $( '.re-extra-' + fld.id, row ).val() || "";
						if ( fv !== ( fld.default || "" ) ) {
							action[fld.id] = fv;
						} else {
							delete action[fld.id]; /* eco, don't store default */
						}
					}
					break;

				case "request":
					action.method = $( 'select.re-method', row ).val() || "GET";
					action.url = $( 'textarea.re-requrl', row ).val() || "";
					t = $( 'textarea.re-reqheads', row ).val() || "";
					if ( ! isEmpty(t) ) {
						action.headers = t.trim().split(/\n/);
					} else {
						delete action.headers;
					}
					action.target = $( 'select.re-reqtarget', row ).val() || "";
					t = $( 'textarea.re-reqdata', row ).val() || "";
					if ( "POST" !== action.method || isEmpty( t ) ) {
						delete action.data;
					} else {
						action.data = t;
					}
					break;

				default:
					console.log("buildActionList: " + actionType + " action unrecognized");
					var ad = $( 'input#' + idSelector( pfx + 'unrecdata' ), row ).val() || "";
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
		$( 'div.actionlist' ).each( function() {
			var id = $( this ).attr( 'id' );
			var scene = buildActionList( $( this ) );
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
					$( 'div.actionlist.tbmodified' ).removeClass( "tbmodified" );
					$( 'div.actionlist .tbmodified' ).removeClass( "tbmodified" );
				}

				$( 'div.actionlist button.re-tryactivity' ).prop( 'disabled', configModified );
			}, [] ); /* pass up */
			return;
		}
		alert( "Configuration not saved. Please correct the indicated errors, then try again." );
	}

	function updateActionControls() {
		$( 'div.actionlist' ).each( function( ix, obj ) {
			var section = $( this );
			$('div.controls button.re-moveup', section).prop('disabled', false);
			$('div.actionrow:first div.controls button.re-moveup', section).prop('disabled', true);
			$('div.controls button.re-movedown', section).prop('disabled', false);
			$('div.actionrow:last div.controls button.re-movedown', section).prop('disabled', true);
		});

		/* Run activity button only when saved/unmodified */
		$( 'div.actionlist button.re-tryactivity' ).prop( 'disabled', configModified );

		if ( 0 !== $( '.tberror' ).length ) {
			$( '.re-titlewarning' )
				.html( '<i class="material-icons" title="Correct errors before saving!" style="color: #f00; background-color: white;">report</i>' );
		} else if ( 0 !== $( '.tbwarn' ).length ) {
			$( '.re-titlewarning' )
				.html( '<i class="material-icons" title="Check warnings!" style="color: #ff0;">warning</i>' );
		} else {
			$( '.re-titlewarning' ).html( "" );
		}

		/* Save and revert buttons */
		updateSaveControls();
	}

	/**
	 * Given a section (class actionlist), update cdata to match.
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
		$( 'div.actionlist' ).addClass( "tbmodified" ); // all lists, because save saves all.
		validateActionRow( row );
		var section = row.closest( 'div.actionlist' );
		updateActionList( section );
		updateActionControls();
	}

	function handleActionValueChange( ev ) {
		var row = $( ev.currentTarget ).closest( 'div.actionrow' );
		changeActionRow( row );
	}

	function appendVariables( menu ) {
		var cd = getConfiguration();
		var hasOne = false;
		var xg = $( '<optgroup label="Variables"></optgroup>' );
		for ( var vname in ( cd.variables || {} ) ) {
			if ( cd.variables.hasOwnProperty( vname ) ) {
				hasOne = true;
				xg.append( $( '<option></option>' ).val( '{' + vname + '}' )
					.text( '{' + vname + '}' ) );
			}
		}
		if ( hasOne ) {
			menu.append( xg );
		}
	}

	function changeNotifyActionMethod( $row, method, action ) {
		var ninfo = arrayFindValue( notifyMethods, function( v ) { return v.id === method; } ) || notifyMethods[0];
		$( "select.re-method", $row ).val( ninfo.id ); /* override */
		// $( 'div.re-users', $row ).toggle( false !== ninfo.users );
		$( 'div.re-users', $row ).toggleClass( 'tbhidden', false === ninfo.users )
			.toggleClass( 'tbinline', false !== ninfo.users );
		$( 'div.re-extrafields', $row ).remove();
		$( 'div.vanotice', $row ).hide();
		$( 'div.notifynotice', $row ).remove();
		/*  Do not clear message or users (even if we don't use them) */
		var f, lf, fld;
		if ( ninfo.extra ) {
			var $extra = $( '<div class="re-extrafields"></div>' )
				.appendTo( $( 'div.actiondata', $row ) );
			lf = ninfo.extra.length;
			for ( f=0; f<lf; f++ ) {
				fld = ninfo.extra[f];
				var xf;
				if ( "select" === fld.type ) {
					xf = $( '<select class="form-control form-control-sm"></select>' );
					var lv = fld.values ? fld.values.length : 0;
					for ( var vi=0; vi<lv; vi++ ) {
						var pm = fld.values[vi].match( "^([^=]*)=(.*)$" );
						if ( pm ) {
							$( '<option></option>' ).val( pm[1] ).text( pm[2] )
								.appendTo( xf );
						}
					}
				} else if ( "textarea" === fld.type ) {
					xf = $( '<textarea class="form-control form-control-sm"></textarea>' )
						.attr( 'placeholder', fld.placeholder || "" );
				} else {
					xf = $( '<input class="form-control form-control-sm">' )
						.attr( 'placeholder', fld.placeholder || "" );
				}
				if ( ! isEmpty( fld.default ) ) {
					xf.val( fld.default );
				}
				xf.addClass( 're-extra-' + fld.id )
					.on( 'change.reactor', handleActionValueChange );
				if ( ! isEmpty( fld.label ) ) {
					/* Wrap the field in a label */
					xf = $( '<label></label>' )
						.text( fld.label )
						.toggleClass( "re-fullwidth", fld.fullwidth )
						.append( xf );
				}
				xf.appendTo( $extra );
			}
		}
		var cf = getConfiguration();
		if ( action && (cf.notifications || {})[action.notifyid] ) {
			/* Load current values from passed action */
			var note = cf.notifications[action.notifyid];
			var scene = findNotificationScene( api.getCpanelDeviceId(), action.notifyid );
			var isVA = scene && isVAControlledScene( scene );
			if ( isVA && ! note.veraalerts ) {
				note.veraalerts = 1;
				configModified = true;
			} else if ( note.veraalerts && !isVA ) {
				delete note.veraalerts;
				configModified = true;
			}
			$( 'input.re-message', $row ).val( note.message || "" );
			if ( false !== ninfo.users ) {
				/* See if scene has been updated behind us */
				if ( scene && scene.users !== ( note.users || "" ) ) {
					note.users = scene.users || "";
					configModified = true;
				}
				var ua = note.users || "";
				if ( "" !== ua ) {
					ua = ua.split( /,/ );
					lf = ua.length;
					for ( f=0; f<lf; f++ ) {
						var $c = $( 'div.re-users input[value="' + ua[f] + '"]', $row );
						if ( 0 === $c.length ) {
							$c = getCheckbox( getUID( 'chk' ), ua[f], ua[f] + '?&nbsp;(unknown&nbsp;user)' );
							$c.appendTo( $( 'div.re-users', $row ) );
						}
						$c.prop( 'checked', true );
					}
				}
			}
			lf = ninfo.extra ? ninfo.extra.length : 0;
			for ( f=0; f<lf; f++ ) {
				fld = ninfo.extra[f];
				$( '.re-extra-' + fld.id, $row ).val( action[fld.id] || fld.default || "" );
			}
			if ( devVeraAlerts ) {
				$( '<div class="vanotice"></div>' )
					.text("NOTE: This notification has been modified by VeraAlerts. The message text can only be changed there. You may change recipients here, but you must go into VeraAlerts \"Edit\" mode after so that it updates its data. Delivery and filtering of this message is under control of VeraAlerts.")
					.toggle( isVA )
					.appendTo( $( 'div.actionfooter', $row ) );
				$( 'input.re-message', $row ).prop( 'disabled', isVA );
			}
		}
		if ( ninfo.config ) {
			var s = getParentState( ninfo.config.name );
			if ( isEmpty(s) ) {
				$( '<div class="notifynotice"></div>' )
					.text( ninfo.config.warning || ninfo.config.message || "This method requires additional configuration that has not been completed." )
					.appendTo( $( 'div.actionfooter', $row ) );
				$( 'div.notifynotice', $row ).append( getWiki( 'Notify-Action' ) );
			}
		}
		if ( ninfo.requiresUnsafeLua && ! unsafeLua ) {
			$( '<div class="re-alertbox">This notification method requires that "Allow Unsafe Lua" (<em>Users &amp; Account Info &gt; Security</em>) be enabled to operate. It is currently disabled.</div>' )
				.appendTo( $( 'div.actionfooter', $row ) );
		}
	}

	function handleNotifyActionMethodChange( ev ) {
		var $row = $( ev.currentTarget ).closest( '.actionrow' );
		var val = $( ev.currentTarget ).val() || "";
		changeNotifyActionMethod( $row, val );
		return changeActionRow( $row );
	}

	function changeActionAction( row, newVal ) {
		// assert( row.hasClass( 'actionrow' ) );
		/* If action isn't changing, don't obliterate filled fields (i.e. device changes, same action) */
		var prev = row.data( 'prev-action' ) || "";
		if ( !isEmpty(prev) && prev == newVal ) return;
		/* Load em up... */
		var j, lj;
		row.data( 'prev-action', newVal ); /* save for next time */
		var pfx = row.attr( 'id' );
		var ct = $( 'div.actiondata', row );
		$( 'label,.argument', ct ).remove();
		if ( isEmpty( newVal ) ) {
			return;
		}
		var action = actions[newVal];
		/* Check for device override to service/action */
		var devNum = parseInt( $( 'select.devicemenu', ct ).val() || "-1" );
		if ( devNum === -1 ) devNum = api.getCpanelDeviceId();
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
			var lk = action.parameters ? action.parameters.length : 0;
			for ( var k=0; k<lk; ++k ) {
				var opt, z;
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
						if ( 0 == $( 'datalist#' + idSelector( dlid ) ).length ) {
							/* Datalist doesn't exist yet, create it */
							inp = $('<datalist class="argdata"></datalist>').attr( 'id', dlid );
							lj = parm.values.length;
							for ( j=0; j<lj; j++ ) {
								opt = $( '<option></option>' );
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
							$( 'div#tab-actions.reactortab' ).append( inp );
						}
						/* Now pass on the input field */
						inp = $( '<input class="argument form-control form-control-sm" placeholder="Click for predefined values" list="' + dlid + '">' );
					} else {
						/* Standard select menu */
						inp = $( '<select class="argument form-control form-control-sm"></select>' );
						if ( parm.optional ) {
							inp.append( '<option value="">(unspecified)</option>' );
						}
						lj = parm.values.length;
						for ( j=0; j<lj; j++ ) {
							opt = $( '<option></option>' );
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
						/* As a default, just choose the first option, unless specified & required */
						if ( undefined !== parm.default && !parm.optional ) {
							inp.val( parm.default );
						} else {
							$( 'option:first', inp ).prop( 'selected', true );
						}
					}
				} else if ( parm.type == "scene" ) {
					inp = makeSceneMenu();
					var topItem = $( '<option></option>' ).val("")
						.text( parm.optional ? "(unspecified)" : "--choose--" );
					inp.prepend( topItem );
					if ( 0 !== ( parm._reactor_with_activities || 0 ) ) {
						/* Show activities in traversal order */
						var cd = getConfiguration( devNum ) || NULLCONFIG;
						var grp = $('<optgroup>').attr('label', 'ReactorSensor Activities');
						/* Wrap because upvalue refs with multiples executing (fully re-entrant) */
						(function ( cd, grp, topItem ) {
							DOtraverse( cd.conditions.root,
								function( node ) {
									if ( cd.activities[node.id + ".true"] ) {
										$( '<option></option>' ).val( node.id + ".true" )
											.text( node.name + " is TRUE" )
											.appendTo( grp );
									}
									if ( cd.activities[node.id + ".false"] ) {
										$( '<option></option>' ).val( node.id + ".false" )
											.text( node.name + " is FALSE" )
											.appendTo( grp );
									}
								},
								false,
								isGroup
							);
							if ( $('option', grp).length > 0 ) {
								grp.insertAfter( topItem );
							}
						})( cd, grp );
					}
					if ( undefined !== parm.extraValues ) {
						if ( Array.isArray( parm.extraValues ) ) {
							lj = parm.extraValues.length;
							for ( j=0; j<lj; j++ ) {
								opt = $( '<option></option>' ).val( parm.extraValues[j] ).text( parm.extraValues[j] );
								opt.insertAfter( topItem );
							}
						} else {
							for ( var key in parm.extraValues ) {
								if ( parm.extraValues.hasOwnProperty( key ) ) {
									opt = $( '<option></option>' ).val( key ).text( parm.extraValues[key] );
									opt.insertAfter( topItem );
								}
							}
						}
					}
					/* Add variables */
					inp.val( "" );
					appendVariables( inp );
				} else if ( parm.type == "boolean" ) {
					/* Menu */
					inp = $('<select class="argument form-control form-control-sm"></select>');
					if ( parm.optional ) {
						inp.prepend( '<option value="">(not specified)</option>' );
					}
					inp.append('<option value="0">0/off/false</option>');
					inp.append('<option value="1">1/on/true</option>');
					/* Add variables */
					if ( !parm.novars ) {
						appendVariables( inp );
					}
					/* Force default when available and not optional, otherwise first */
					if ( undefined !== parm.default && !parm.optional ) {
						inp.val( parm.default );
					} else {
						$( 'option:first', inp ).prop( 'selected', true );
					}
				} else if ( false && parm.type == "ui1" && parm.min !== undefined && parm.max !== undefined ) {
					inp = $('<div class="argument tbslider"></div>');
					inp.slider({
						min: parm.min, max: parm.max, step: parm.step || 1,
						range: "min",
						stop: function ( ev, ui ) {
							// DeusExMachinaII.changeDimmerSlider( $(this), ui.value );
						},
						slide: function( ev, ui ) {
							$( 'a.ui-slider-handle', $( this ) ).text( ui.value );
						},
						change: function( ev, ui ) {
							$( 'a.ui-slider-handle', $( this ) ).text( ui.value );
						}
					});
					inp.slider("option", "disabled", false);
					inp.slider("option", "value", parm.default || parm.min ); /* parm.min always defined in this block */
				} else if ( (parm.type || "").match(/^(r|u?i)[124]$/i ) ) {
					inp = $( '<input class="argument narrow form-control form-control-sm">' );
					if ( ! parm.novars ) {
						inp.attr( 'list', 'reactorvarlist' );
					}
					inp.attr( 'placeholder', parm.name );
					inp.val( parm.optional ? "" : ( parm.default || parm.min || 0 ) );
				} else {
					if ( "string" !== parm.type ) {
						console.log("changeActionAction: using default (string) presentation for type " +
							String(parm.type) + " " + String(parm.name) );
					}
					inp = $( '<input class="argument form-control form-control-sm">' );
					if ( ! parm.novars ) {
						inp.attr( 'list', 'reactorvarlist' );
					}
					inp.attr( 'placeholder', parm.name );
					inp.val( ( undefined===parm.default || parm.optional ) ? "" : parm.default );
				}
				inp.attr('id', pfx + '-' + parm.name ).addClass( 'argument' );
				inp.on( 'change.reactor', handleActionValueChange );
				/* If there is more than one parameter, wrap each in a label. */
				if ( action.parameters.length > 1 ) {
					var label = $("<label></label>");
					label.attr("for", pfx + '-' + parm.name );
					label.text( ( parm.label || parm.name ) + ":" );
					label.append( '&nbsp;' );
					label.toggleClass( 'reqarg', !(parm.optional || false) ).toggleClass( 'optarg', parm.optional || false );
					label.append( inp );
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
		var el = $( ev.currentTarget );
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
			var lm = base.match ? base.match.length : 0;
			for ( var im=0; im<lm; im++ ) {
				/* Conditions separated by ";", all must be met. for match to succeed */
				var cond = (base.match[im].condition || "").split( /;/ );
				var match = true;
				var lc = cond.length;
				for ( var ic=0; ic<lc; ++ic ) {
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
		var i, j, lj, key;
		var l = data.serviceList ? data.serviceList.length : 0;
		for ( i=0; i<l; i++ ) {
			var section = $( "<select></select>" );
			var service = data.serviceList[i];
			var opt;
			lj = service.actionList ? service.actionList.length : 0;
			for ( j=0; j<lj; j++ ) {
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
					var lp = service.actionList[j].arguments ? service.actionList[j].arguments.length : 0;
					for ( var ip=0; ip<lp; ++ip ) {
						var p = service.actionList[j].arguments[ip];
						p.type = p.dataType || "string";
						p.optional = 1; /* In this case, all are assumed optional */
						p.default = p.defaultValue;
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

				opt = $( '<option></option>' ).val( key ).text( actname );
				if ( nodata ) opt.append(" &diams;").addClass( "nodata" );
				section.append( opt );

				hasAction = true;
			}
			if ( $("option", section).length > 0 ) {
				opt = $( '<optgroup></optgroup>' ).attr( 'label', service.serviceId.replace(/^([^:]+:)+/, "") );
				opt.append( section.children() );
				actionMenu.append( opt );
			}
		}

		try {
			var over = getDeviceOverride( dev );
			if ( over ) {
				var known = $( '<optgroup></optgroup>' ).attr( 'label', 'Common Actions' );
				lj = over.length;
				for ( j=0; j<lj; j++ ) {
					var thisover = over[j];
					key = thisover.service + "/" + thisover.action;
					var el = $( '<option></option>' ).val( key );
					if ( undefined === actions[key] || actions[key].noddb ) {
						/* Service+action not in lu_actions or no DDB data for it */
						el.text( String(thisover.description || thisover.action) );
						el.append( '&nbsp&#9652;' );
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

		var lopt = $( '<option selected></option>' ).val( "" ).text( hasAction ? "--choose action--" : "(invalid device--no actions)" );
		actionMenu.prepend( lopt );
		actionMenu.prop( 'disabled', false );

		/* Try to reselect the previous action, if available. This help preserve the fields when
		   the device is changed to another that supports that action. */
		var prev = row.data( 'prev-action' ) || "";
		lopt = $( 'option[value="' + prev + '"]', actionMenu );
		if ( lopt.length > 0 ) {
			actionMenu.val( prev );
		} else {
			$( 'option:first', actionMenu ).prop( 'selected' );
		}
	}

	function changeActionDevice( row, newVal, fnext, fargs, retries ) {
		var ct = $( 'div.actiondata', row );
		var actionMenu = $( 'select.re-actionmenu', ct );

		// Clear the action menu and remove all arguments.
		actionMenu.empty().prop( 'disabled', true ).show()
			.append( $( '<option></option>' ).val("").text( '(loading...)' ) );
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
		if ( !devobj ) {
			actionMenu.empty().show();
			if ( fnext ) fnext.apply( null, fargs );
			return;
		}
		/* Wait on a Promise to get the data from the "actions" request */
		if ( undefined === deviceActionData[devobj.device_type] ) {
			deviceActionData[devobj.device_type] = Promise.resolve( $.ajax(
				{
					url: api.getDataRequestURL(),
					data: {
						id: "actions",
						DeviceNum: newVal,
						output_format: "json",
						r: Math.random()
					},
					dataType: "json",
					cache: false,
					timeout: 10000
				}
			) );
		}
		deviceActionData[devobj.device_type].then( function( data, statusText, jqXHR ) {
			/* Success */
			loadActionMenu( newVal, actionMenu, row, data );
			if ( undefined !== fnext ) {
				fnext.apply( null, fargs );
			}
		}).catch( function( jqXHR, textStatus, errorThrown ) {
			/* Failed. And deviceinfo as a fallback isn't really appropriate here (only lists exceptions) */
			console.log("changeActionDevice: failed to load service data: " + String(textStatus) + "; " + String(errorThrown));
			console.log(jqXHR);
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
			}, 5000 );
		});
	}

	function handleActionDeviceChange( ev ) {
		configModified = true;
		var el = $( ev.currentTarget );
		var newVal = parseInt( el.val() );
		if ( ! isNaN( newVal ) ) {
			var $row = el.closest( 'div.actionrow' );
			changeActionDevice( $row, newVal, changeActionRow, [ $row ] );
		}
	}

	/* Convert plain textarea to ACE. Keep the textarea as shadow field for content
	 * that's synced with ACE content--it's easier to read from that (and consistent) */
	function doEditor( field ) {
		var ediv = $( '<div class="editor"></div>' );
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
			root = ( getConfiguration( dev ) || NULLCONFIG ).root;
			grp = null;
			$m.val("*");
			$( 'option[value=""]', $m ).prop( 'disabled', true );
		} else {
			$( 'option[value=""]', $m ).prop( 'disabled', false );
		}
		DOtraverse( root || {}, function( node ) {
			$m.append( $( '<option></option>' )
				.addClass( "groupoption" )
				.val( node.id )
				.text( makeConditionDescription( node ) ) );
		}, false, function( node ) {
			/* If node is not ancestor (line to root) or descendent of cond, allow as predecessor */
			return isGroup( node ) && "nul" !== node.operator;
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
			root = ( getConfiguration( dev ) || NULLCONFIG ).conditions.root;
			grp = null;
		}
		DOtraverse( root || {}, function( node ) {
				$m.append( $( '<option></option>' ).val( node.id + ".true" ).text( (node.name || node.id ) + " is true" ) )
					.append( $( '<option></option>' ).val( node.id + ".false" ).text( (node.name || node.id ) + " is false" ) );
			}, false, function( node ) {
				return node.id !== grp && isGroup( node ) && "nul" !== node.operator;
			}
		);
		return $m;
	}

	function changeActionType( row, newVal ) {
		var ct = $('div.actiondata', row);
		var pfx = row.attr( 'id' ) + '-';
		var $m, $fs;
		ct.empty();
		$( 'button.re-tryaction,button.re-import', row ).hide();

		switch ( newVal ) {
			case "comment":
				ct.append('<input type="text" class="argument form-control form-control-sm re-comment" placeholder="Enter comment text" autocomplete="off">');
				$( 'input', ct ).on( 'change.reactor', handleActionValueChange );
				break;

			case "device":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				$fs.append( makeDeviceMenu( "", "" ) );
				$fs.append('<select class="form-control form-control-sm re-actionmenu"></select>');
				$( 'select.devicemenu', $fs ).on( 'change.reactor', handleActionDeviceChange );
				$( 'select.re-actionmenu', $fs ).on( 'change.reactor', handleActionActionChange );
				$( 'button.re-tryaction', row ).show();
				break;

			case "housemode":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				$m = $( '<select class="form-control form-control-sm re-mode">')
					.append( '<option value="1">Home</option>' ).append( '<option value="2">Away</option>' )
					.append( '<option value="3">Night</option>' ).append( '<option value="4">Vacation</option>' )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $fs );
				break;

			case "delay":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				$fs.append('<label>for <input type="text" id="' +
					pfx + 'delay" class="argument narrow form-control form-control-sm" title="Enter delay time as seconds, MM:SS, or HH:MM:SS" placeholder="delay time" list="reactorvarlist"></label>');
				$fs.append('<select class="form-control form-control-sm re-delaytype"><option value="inline">from this point</option><option value="start">from start of actions</option></select>');
				$( 'input', $fs ).on( 'change.reactor', handleActionValueChange );
				$( 'select', $fs ).on( 'change.reactor', handleActionValueChange );
				break;

			case "runscene":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				$m = makeSceneMenu()
					.prepend('<option value="" selected>--choose--</option>')
					.val("")
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $fs );
				$( '<select class="form-control form-control-sm re-method"><option value="" selected">Use Reactor to run scene</option><option value="V">Hand off to Luup</option></select>' )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $fs );
				getWiki( "Run-Scene-Action" ).appendTo( $fs );
				if ( !unsafeLua ) {
					$( '<div class="re-alertbox">This action requires that "Allow Unsafe Lua" (<em>Users &amp; Account Info &gt; Security</em>) be enabled to operate. It is currently disabled.</div>' )
						.insertAfter( $fs );
				}
				$( 'button.re-import', row ).show();
				break;

			case "runlua":
				/* Handle upgrade to ACE separately */
				ct.append( '<textarea wrap="off" autocorrect="off" autocomplete="off" autocapitalize="off" spellcheck="off" class="re-luacode form-control form-control-sm" rows="6"></textarea>' );
				if ( window.ace ) {
					doEditor( $( 'textarea.re-luacode', ct ) );
				} else {
					$( 'textarea.re-luacode', ct ).on( 'change.reactor', handleActionValueChange );
				}
				ct.append('<div class="tbhint">If your Lua code returns boolean <em>false</em>, scene execution will stop and the remaining actions that follow will not be run (this is a feature). It is also recommended that the first line of your Lua be a comment with text to help you identify the code--if there\'s an error logged, the first line of the script is almost always shown. Also, you can use the <tt>print()</tt> function to write to Reactor\'s event log, which is shown in the Logic Summary and easier/quicker to get at than the Vera log file.</div>');
				break;

			case "rungsa":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				makeDeviceMenu( "", "", function( devobj ) {
						return devobj.device_type === deviceType;
					})
					.val( "-1" )
					.on( 'change.reactor', function( ev ) {
						var $el = $( ev.currentTarget );
						var newVal = parseInt( $el.val() || -1 );
						var $row = $el.closest( '.actionrow' );
						var $m = $( 'select.re-activity', $row ).empty();
						if ( !isNaN( newVal ) ) {
							makeDeviceActivityMenu( newVal, $m ).val( "root.true" );
						} else {
							$(this).addClass( "tberror" );
							$m.addClass( "tberror" );
						}
						handleActionValueChange( ev );
					}).appendTo( $fs );
				$m = $( '<select></select>', { class: "form-control form-control-sm re-activity" } )
					.appendTo( $fs );
				makeDeviceActivityMenu( -1, $m )
					.val( "root.true" )
					.on( 'change.reactor', handleActionValueChange );
				getCheckbox( getUID( "stopall" ), "1", "Stop all other running activities first", "re-stopall",
					"Run-Activity-Action" )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $fs );
				break;

			case "stopgsa":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				makeDeviceMenu( "", "", function( devobj ) {
						return devobj.device_type === deviceType;
					})
					.val( "-1" )
					.on( 'change.reactor', function( ev ) {
						var $el = $( ev.currentTarget );
						var newVal = parseInt( $el.val() || -1 );
						var $row = $el.closest( '.actionrow' );
						var $m = $( 'select.re-activity', $row ).empty();
						if ( !isNaN( newVal ) ) {
							makeDeviceActivityMenu( newVal, $m )
								.prepend( '<option value="">(all activities)</option>' )
								.val( "" );
						} else {
							$(this).addClass( "tberror" );
							$m.addClass( "tberror" );
						}
						handleActionValueChange( ev );
					}).appendTo( $fs );
				$m = $( '<select></select>', { class: "form-control form-control-sm re-activity" } )
					.appendTo( $fs );
				makeDeviceActivityMenu( -1, $m )
					.prepend( '<option value="">(all activities)</option>' )
					.val( "" )
					.on( 'change.reactor', handleActionValueChange );
				break;

			case "setvar":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				$m = $( '<select></select>', { class: "form-control form-control-sm re-variable" } )
					.appendTo( $fs );
				var cdata = getConfiguration();
				var vix = [];
				for ( var vn in ( cdata.variables || {} ) ) {
					if ( cdata.variables.hasOwnProperty( vn ) ) {
						var v = cdata.variables[vn];
						if ( isEmpty( v.expression ) ) {
							vix.push( v );
						}
					}
				}
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
				var lv = vix.length;
				for ( var iv=0; iv<lv; iv++ ) {
					$( '<option></option>' ).val( vix[iv].name ).text( vix[iv].name )
						.appendTo( $m );
				}
				$( '<option></option>' ).val( "" ).text( '--choose--' ).prependTo( $m );
				$m.val("").on( 'change.reactor', handleActionValueChange );
				$fs.append( "<span> = </span>" );
				$( '<input class="form-control form-control-sm" list="reactorvarlist">' )
					.attr( 'id', pfx + "value" )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $fs );
				$m = getCheckbox( getUID("reeval"), "1", "Force re-evaluation of expressions and conditions", "",
					"Set-Variable-Action" );
				$( 'input', $m ).addClass("tbreeval")
					.on( 'change.reactor', handleActionValueChange );
				$m.appendTo( $fs );
				break;

			case "resetlatch":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				makeDeviceMenu( "", "", function( devobj ) {
						return devobj.device_type === deviceType;
					})
					.val( "-1" )
					.on( 'change', function( ev ) {
						var $el = $( ev.currentTarget );
						var newVal = parseInt( $el.val() || -1 );
						var $row = $el.closest( '.actionrow' );
						var $m = $( 'select.re-group', $row ).val("*");
						$( "option.groupoption", $m ).remove();
						if ( !isNaN( newVal ) ) {
							makeDeviceGroupMenu( newVal, $m );
						} else {
							$(this).addClass( "tberror" );
							$m.addClass( "tberror" );
						}
						handleActionValueChange( ev );
					}).appendTo( $fs );
				$m = $( '<select class="form-control form-control-sm re-group"></select>' )
					.appendTo( $fs );
				makeDeviceGroupMenu( -1, $m )
					.prepend( '<option value="*">(all groups)</option>' )
					.prepend( '<option value="" selected>(this group)</option>' )
					.val( "*" )
					.on( 'change.reactor', handleActionValueChange );
				break;

			case "notify":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				$( '<div class="actionfooter"></div>' ).appendTo( ct );
				$('<input type="hidden" class="re-notifyid" value="">').appendTo( $fs );
				$m = $( '<select class="form-control form-control-sm re-method"></select>' );
				var lk = notifyMethods.length;
				for ( k=0; k<lk; ++k ) {
					if ( "VA" === notifyMethods[k].id && !devVeraAlerts ) continue;
					if ( "" === notifyMethods[k].id && isOpenLuup ) continue;
					var $opt = $( '<option></option>' ).val( notifyMethods[k].id )
						.text( notifyMethods[k].name )
						.appendTo( $m );
					if ( "VT" === notifyMethods[k].id && !devVeraTelegram ) {
						$opt.prop( 'disabled', true );
					}
				}
				menuSelectDefaultFirst( $m, "" );
				$m.on( 'change.reactor', handleNotifyActionMethodChange )
					.appendTo( $fs );
				$('<input class="form-control form-control-sm re-fullwidth re-message" value="">')
					.attr( 'placeholder', 'Enter notification message' )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $fs );
				$('<div class="nativesub">WARNING! Variable/expression substitutions are not supported in Vera-native notifications!</div>').hide().appendTo( $fs );
				$('<div class="subformat">WARNING! Inline substititons like <tt>"Humidity is {n}%"</tt> are not supported; the correct form is <tt>{ expression }</tt>, like this: <tt>{ "Humidity is " .. n .. "%" }</tt></div>').hide().appendTo( $fs );
				/* User FS appends as separate group, so message field can grow max */
				var $ufs = $('<div class="form-inline re-users"></div>').appendTo( ct );
				for ( var k in userIx ) {
					if ( userIx.hasOwnProperty( k ) ) {
						getCheckbox( getUID( "chk" ), k, userIx[k].name || k )
							.on( 'change.reactor', handleActionValueChange )
							.appendTo( $ufs );
					}
				}
				changeNotifyActionMethod( ct, $m.val() );
				break;

			case "request":
				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				$m = $( '<select class="form-control form-control-sm re-method"></select>' );
				$( '<option></option>' ).val( "GET" ).text( "GET" ).appendTo( $m );
				$( '<option></option>' ).val( "POST" ).text( "POST" ).appendTo( $m );
				menuSelectDefaultFirst( $m, "GET" );
				$m.on( 'change.reactor', handleActionValueChange )
					.appendTo( $fs );

				$fs = $( '<div class="re-fullwidth"></div>' ).appendTo( ct );
				var $lb = $( '<label class="re-fullwidth"></label>' ).text( "Request URL:" ).appendTo( $fs );
				$( '<textarea class="form-control re-reqfield re-requrl"></textarea>' )
					.attr( 'placeholder', "Request URL")
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $lb );

				$fs = $( '<div></div>' ).appendTo( ct );
				$lb = $( '<label class="re-fullwidth"></label>' ).text( "Request Headers:" ).appendTo( $fs );
				$( '<textarea class="form-control re-reqfield re-reqheads"></textarea>' )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $lb );

				$fs = $( '<div class="re-reqdatafs"></div>' ).hide().appendTo( ct );
				$lb = $( '<label class="re-fullwidth"></label>' ).text( "POST data:" ).appendTo( $fs );
				$( '<textarea class="form-control re-reqfield re-reqdata"></textarea>' )
					.on( 'change.reactor', handleActionValueChange )
					.appendTo( $lb );

				$fs = $( '<div class="form-inline"></div>' ).appendTo( ct );
				$lb = $( '<label></label>' ).text( "Capture response to:" ).appendTo( $fs );
				$m = $( '<select class="form-control re-reqtarget"></select>' )
					.on( "change.reactor", handleActionValueChange );
				$( '<option></option>' ).val( "" ).text( "(ignore/discard response)" )
					.appendTo( $m );
				var cd = getConfiguration();
				for ( var vname in ( cd.variables || {} ) ) {
					if ( cd.variables.hasOwnProperty( vname ) && isEmpty( cd.variables[vname].expression ) ) {
						$( '<option></option>' ).val( vname ).text( vname ).appendTo( $m );
					}
				}
				$m.appendTo( $lb );

				$('<div></div>').html("Substitutions are available in all request fields using <tt>{expr}</tt> syntax.")
					.appendTo( ct );
				break;

			default:
				$( '<input type="hidden">' ).attr( 'id', pfx + 'unrecdata' )
					.appendTo( ct );
				$( '<div>This action is not editable.</div>' ).appendTo( ct );
				/* See loadActions */
		}
	}

	function handleActionChange( ev ) {
		configModified = true;
		var row = $( ev.currentTarget ).closest( '.actionrow' );
		var newVal = $( 'select.re-actiontype', row ).val();
		changeActionType( row, newVal );
		changeActionRow( row );
	}

	function handleActionControlClick( ev ) {
		var $el = $( ev.currentTarget );
		if ( $el.prop('disabled') ) {
			return;
		}
		var row = $el.closest('div.actionrow');
		var op = $el.data( 'action' );
		switch ( op ) {
			case "up":
				/* Move up in display */
				var prior = row.prev( 'div.actionrow' ); /* find prior row */
				if ( prior.length > 0 ) {
					row.detach();
					row.insertBefore( prior );
					changeActionRow( row ); /* pass it on */
				}
				break;

			case "down":
				/* Move down in display */
				var next = row.next( 'div.actionrow' );
				if ( next.length > 0 ) {
					row.detach();
					row.insertAfter( next );
					changeActionRow( row );
				}
				break;

			case "delete":
				var list = row.closest( 'div.actionlist' );
				row.remove();
				$( 'div.actionlist' ).addClass( "tbmodified" ); // all lists, because save saves all.
				updateActionList( list );
				updateActionControls(); /* handles save controls too */
				break;

			case "try":
				$el.addClass( "re-activemode" );
				var cvars = false;
				if ( $( '.tberror', row ).length > 0 ) {
					alert( 'Please fix the errors before attempting to run this action.' );
					return;
				}
				var typ = $( 'select.re-actiontype', row ).val() || "comment";
				var pfx = row.attr( 'id' ) + '-';
				if ( "device" === typ ) {
					var d = parseInt( $( 'select.devicemenu', row ).val() );
					if ( -1 === d ) d = api.getCpanelDeviceId();
					var s = $( 'select.re-actionmenu', row ).val() || "";
					var pt = s.split( /\//, 2 );
					// var act = (deviceInfo.services[pt[0]] || { actions: {} }).actions[pt[1]];
					var act = actions[s];
					if ( act && (act.deviceOverride || {})[d] ) {
						act = act.deviceOverride[d];
					}
					/* Make LUT of known fields */
					var ap = {};
					var lk = ( act && act.parameters ) ? act.parameters.length : 0;
					for ( var k=0; k < lk; k++ ) ap[act.parameters[k].name] = act.parameters[k];
					/* Use on-page fields as list */
					var param = {};
					var actionText = s + "( ";
					$( '.argument', row ).each( function() {
						var val = $( this ).val() || "";
						var pname = ($( this ).attr( 'id' ) || "unnamed").replace( pfx, '' );
						var vn = val.match( varRefPattern );
						if ( vn && vn.length == 2 ) {
							/* Variable reference, get current value. */
							if ( ! cvars ) {
								var cstate = getConditionStates();
								cvars = cstate.vars || {};
							}
							if ( undefined !== cvars[vn[1]] ) {
								val = cvars[vn[1]].lastvalue || "";
							}
						}
						if ( ! isEmpty( val ) || ( ap[pname] && !ap[pname].optional ) ) {
							param[pname] = val;
						}
						delete ap[pname];
					});
					/* Known fields that remain... */
					for ( k in ap ) {
						if ( ap.hasOwnProperty(k) ) {
							if ( ap[k].value ) {
								/* Supply fixed value field */
								param[k] = ap.value;
							} else if ( ! ap[k].optional ) {
								param[k] = "";
							}
						}
					}
					/* Build string and prep for action */
					ap = [];
					for ( k in param ) {
						if ( param.hasOwnProperty( k ) ) {
							ap.push( k + "=" + quot( param[k] ) );
						}
					}
					actionText += ap.join(", ");
					actionText += " )\n\n";

					/* 2020-04-12: Don't use api.performActionOnDevice() because its URL-encoding
					               discipline is inconsistent. */
					param.id = "action";
					param.DeviceNum = d;
					param.serviceId = pt[0] || "";
					param.action = pt[1] || "";
					console.log("Try action: ");
					console.log(param);
					$.ajax({
						method: "POST",
						url: api.getDataRequestURL(),
						data: param,
						timeout: 10000,
						cache: false,
						dataType: "text"
					}).done( function( data ) {
						alert( actionText + data );
						$el.removeClass( "re-activemode" );
					}).fail( function( xhr, textStatus, errorThrown ) {
						console.log( xhr );
						console.log( textStatus );
						console.log( errorThrown );
						if ( 501 === xhr.status ) {
							alert(actionText + "The requested action may not be implemented by the selected device.");
						} else if ( 401 === xhr.status ) {
							alert(actionText + "The requested action's service is unrecognized or not supported by the device.");
						} else if ( 503 === xhr.status || 500 === xhr.status ) {
							alert(actionText + "Luup appears to be reloading; wait a moment and try again.");
						} else if ( "timeout" === xhr.status ) {
							alert(actionText + "Luup appears to be taking a long time to respond.");
						} else {
							alert(actionText + String(xhr.status) + " " + String(xhr.statusText) + " " + String(xhr.errorThrown) );
						}
						$el.removeClass( "re-activemode" );
					});
				}
				break;

			case "import":
				if ( "runscene" !== $( 'select.re-actiontype', row ).val() ) {
					return;
				}
				if ( $( '.tberror', row ).length > 0 ) {
					return;
				}
				var scene = parseInt( $( 'select.re-scene', row ).val() );
				if ( !isNaN( scene ) ) {
					waitForReloadComplete().then( function() {
						$.ajax({
							url: api.getDataRequestURL(),
							data: {
								id: "scene",
								action: "list",
								scene: scene,
								output_format: "json",
								r: Math.random()
							},
							dataType: "json",
							cache: false,
							timeout: 5000
						}).done( function( data, statusText, jqXHR ) {
							var pred = row;
							var newRow;
							var ns = Date.now();
							var container = row.closest( 'div.actionlist' );
							if ( ! isEmpty( data.lua ) ) {
								/* Insert Lua */
								var lua = (data.encoded_lua || 0) != 0 ? atob(data.lua) : data.lua;
								newRow = getActionRow();
								newRow.attr( 'id', container.attr( 'id' ) + ns++ );
								$( "select.re-actiontype", newRow).val( "runlua" );
								changeActionType( newRow, "runlua" );
								$( "textarea.re-luacode", newRow ).val( lua ).trigger( "reactorinit" );
								pred = newRow.addClass( "tbmodified" ).insertAfter( pred );
							}
							/* Sort groups by delay ascending */
							data.groups = data.groups || [];
							data.groups.sort( function( a, b ) { return (a.delay||0) - (b.delay||0); });
							var lg = data.groups ? data.groups.length : 0;
							for ( var ig=0; ig<lg; ig++ ) {
								var pfx;
								var gr = data.groups[ig];
								if ( 0 != (gr.delay || 0) ) {
									/* Delayed group -- insert delay action */
									newRow = getActionRow();
									pfx = container.attr( 'id' ) + ns++;
									newRow.attr( 'id', pfx );
									$( "select.re-actiontype", newRow).val( "delay" );
									changeActionType( newRow, "delay" );
									$( "input#" + idSelector( pfx + "-delay" ), newRow ).val( gr.delay );
									$( "select.re-delaytype", newRow ).val( "start" );
									pred = newRow.addClass( "tbmodified" ).insertAfter( pred );
								}
								var lk = gr.actions ? gr.actions.length : 0;
								for ( var k=0; k<lk; k++ ) {
									var act = gr.actions[k];
									newRow = getActionRow();
									pfx = container.attr( 'id' ) + ns++;
									newRow.attr( 'id', pfx );
									$( 'select.re-actiontype', newRow).val( "device" );
									changeActionType( newRow, "device" );
									if ( 0 == $( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
										var opt = $( '<option></option>' ).val( act.device ).text( '#' + act.device + ' ' + ( act.devicename || 'name?' ) + ' (missing)' );
										// opt.insertAfter( $( 'select.devicemenu option[value=""]:first', newRow ) );
										$( 'select.devicemenu', newRow ).prepend( opt ).addClass( "tberror" );
									}
									$( 'select.devicemenu', newRow ).val( act.device );
									pred = newRow.addClass( "tbmodified" ).insertAfter( pred );
									changeActionDevice( newRow, parseInt( act.device ), function( row, action ) {
										var pfx = row.attr( 'id' ) + '-';
										var key = action.service + "/" + action.action;
										if ( 0 == $( 'select.re-actionmenu option[value="' + key + '"]', row ).length ) {
											var opt = $( '<option></option>' ).val( key ).text( key );
											$( 'select.re-actionmenu', row ).prepend( opt ).prop( 'disabled', false );
										}
										$( 'select.re-actionmenu', row ).val( key );
										changeActionAction( row, key );
										var lj = action.arguments ? action.arguments.length : 0;
										for ( var j=0; j<lj; j++ ) {
											var a = action.arguments[j];
											if ( 0 === $( '#' + idSelector( pfx + a.name ), row ).length ) {
												var inp = $( '<input class="argument form-control form-control-sm">' ).attr('id', a.name);
												var lbl = $( '<label></label>' ).attr('for', a.name).text(a.name).addClass('tbrequired').append(inp);
												$( 'div.actiondata', row ).append( lbl );
											}
											$( '#' + idSelector( pfx + a.name ), row ).val( a.value || "" );
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
					});
				}
				break;

			default:
				/* nada */
		}
	}

	function getActionRow() {
		var row = $( '<div class="row actionrow"></div>' );
		row.append( '<div class="col-xs-12 col-sm-12 col-md-4 col-lg-2"><select class="form-control form-control-sm re-actiontype">' +
			'<option value="comment">Comment</option>' +
			'<option value="device">Device Action</option>' +
			'<option value="housemode">Change House Mode</option>' +
			'<option value="delay">Delay</option>' +
			'<option value="notify">Notify</option>' +
			'<option value="runlua">Run Lua</option>' +
			'<option value="runscene">Run Scene</option>' +
			'<option value="rungsa">Run Group Activity</option>' +
			'<option value="stopgsa">Stop Group Activity</option>' +
			'<option value="setvar">Set Variable</option>' +
			'<option value="resetlatch">Reset Latched</option>' +
			'<option value="request">HTTP Request</option>' +
			'</select></div>' );
		row.append('<div class="actiondata col-xs-12 col-sm-12 col-md-6 col-lg-8"></div>');
		var controls = $('<div class="controls col-xs-12 col-sm-12 col-md-2 col-lg-2 text-right"></div>');
		controls.append( '<button class="btn md-btn re-tryaction" data-action="try" title="Try this action"><i class="material-icons">directions_run</i></button>' );
		controls.append( '<button class="btn md-btn re-import" data-action="import" title="Import scene to actions"><i class="material-icons">save_alt</i></button>' );
		controls.append( '<button class="btn md-btn re-moveup" data-action="up" title="Move up"><i class="material-icons">arrow_upward</i></button>' );
		controls.append( '<button class="btn md-btn re-movedown" data-action="down" title="Move down"><i class="material-icons">arrow_downward</i></button>' );
		controls.append( '<button class="btn md-btn re-delete" data-action="delete" title="Remove action"><i class="material-icons">clear</i></button>' );
		$( 'button.md-btn', controls ).on( 'click.reactor', handleActionControlClick );
		$( 'button.re-tryaction,button.re-import', controls ).hide();
		row.append( controls );
		$( 'select.re-actiontype', row ).val( 'comment' ).on( 'change.reactor', handleActionChange );
		changeActionType( row, "comment" );
		return row;
	}

	function handleAddActionClick( ev ) {
		var btn = $( ev.currentTarget );
		var container = btn.closest( 'div.actionlist' );
		var newRow = getActionRow();
		var id = container.attr( 'id' ) + Date.now();
		newRow.attr( 'id', id );
		newRow.insertBefore( $( '.buttonrow', container ) );
		container.addClass( 'tbmodified' );
		newRow.addClass( 'tbmodified' );
		configModified = true;
		updateActionControls();
	}

	function loadActions( section, scene, copying ) {
		var insertionPoint = $( 'div.buttonrow', section );
		var newRow;
		var ns = Date.now();
		var l = scene.groups ? scene.groups.length : 0;
		for ( var i=0; i<l; i++ ) {
			var gr = scene.groups[i];
			if ( 0 !== (gr.delay || 0) ) {
				newRow = getActionRow();
				newRow.attr( 'id', section.attr( 'id' ) + ns++ );
				$( "select.re-actiontype", newRow ).val( "delay" );
				changeActionType( newRow, "delay" );
				$( "input#" + idSelector( newRow.attr('id') + "-delay" ), newRow ).val( gr.delay );
				$( "select.re-delaytype", newRow ).val( gr.delaytype || "inline" );
				newRow.insertBefore( insertionPoint );
			}
			var lk = gr.actions ? gr.actions.length : 0;
			for ( var k=0; k<lk; k++ ) {
				var $m;
				var act = gr.actions[k];
				newRow = getActionRow();
				var rid = section.attr( 'id' ) + ns++;
				newRow.attr( 'id', rid );
				$( 'select.re-actiontype', newRow).val( act.type || "comment" );
				changeActionType( newRow, act.type || "comment" );
				switch ( act.type ) {
					case "comment":
						$( 'input', newRow ).val( act.comment || "" );
						break;

					case "device":
						if ( 0 === $( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
							var opt = $( '<option></option>' ).val( act.device ).text( '#' + act.device + ' ' + ( act.devicename || 'name?' ) + ' (missing)' );
							// opt.insertAfter( $( 'select.devicemenu option[value=""]:first', newRow ) );
							$( 'select.devicemenu', newRow ).prepend( opt ).addClass( "tberror" );
						}
						$( 'select.devicemenu', newRow ).val( act.device );
						changeActionDevice( newRow, parseInt( act.device ), function( row, action ) {
							var pfx = row.attr( 'id' ) + '-';
							var key = action.service + "/" + action.action;
							if ( 0 === $( 'select.re-actionmenu option[value="' + key + '"]', row ).length ) {
								var opt = $( '<option></option>' ).val( key ).text( key );
								$( 'select.re-actionmenu', row ).prepend( opt );
							}
							$( 'select.re-actionmenu', row ).val( key ).prop( 'disabled', false );
							/* If selected action is not already known, pre-populate extended data if it exists.
							   This assists full display and preservation of params if device is remove/replaced. */
							if ( undefined === actions[key] && undefined != deviceInfo.services[action.service || ""] &&
									deviceInfo.services[action.service || ""].actions[action.action || ""] ) {
								actions[key] = deviceInfo.services[action.service || ""].actions[action.action || ""];
								actions[key].deviceOverride = {};
								actions[key].service = action.service || "";
							}
							changeActionAction( row, key );
							var lj = action.parameters ? action.parameters.length : 0;
							for ( var j=0; j<lj; j++ ) {
								var fld = $( '#' + idSelector( pfx + action.parameters[j].name ), row );
								if ( 0 === fld.length ) {
									fld = $( '<input class="argument form-control form-control-sm">' )
										.attr( 'id', pfx + action.parameters[j].name )
										.on( "change.reactor", handleActionValueChange );
									var lbl = $( '<label></label>' )
										.attr( 'for', pfx + action.parameters[j].name )
										.addClass( 'optarg' )
										.text( action.parameters[j].name + ' (unrecognized parameter):' )
										.append( fld );
									$( 'div.actiondata', row ).append( lbl );
								}
								fld.val( coalesce( action.parameters[j].value, "" ) );
							}
						}, [ newRow, act ]);
						if ( false && -1 === act.device &&
							"urn:toggledbits-com:serviceId:ReactorSensor" === act.service &&
							"SetVariable" === act.action ) {
							$( '<div class="notice">ATTENTION: Consider changing this <em>Device Action</em> to a <em>Set Variable</em>", which is more efficient (and easier to read).</div>' )
								.appendTo( newRow );
						}
						break;

					case "runscene":
						menuSelectDefaultInsert( $( 'select.re-scene', newRow), act.scene,
							( act.sceneName || "name?" ) + ' (#' + act.scene + ') (missing)' );
						$( 'select.re-method', newRow).val( act.usevera ? "V" : "" );
						break;

					case "housemode":
						$( 'select.re-mode', newRow ).val( act.housemode || 1 );
						break;

					case "runlua":
						var lua = "";
						if ( act.lua ) {
							lua = (act.encoded_lua || 0) != 0 ? atob( act.lua ) : act.lua;
							lua = decodeURIComponent(escape(lua)); /* decode from UTF-8 */
						}
						$( 'textarea.re-luacode', newRow ).val( lua ).trigger( 'reactorinit' );
						break;

					case "rungsa":
						if ( undefined !== act.device && 0 === $( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
							$( '<option></option>' ).val( act.device )
								.text( '#' + act.device + ' ' + ( act.devicename || 'name?' ) + ' (missing)' )
								.prependTo( $( 'select.devicemenu', newRow )
								.addClass( "tberror" ) );
							newRow.addClass( "tberror" );
						}
						$( 'select.devicemenu', newRow ).val( act.device || "-1" );
						$m = $( 'select.re-activity', newRow ).empty();
						makeDeviceActivityMenu( act.device || -1, $m );
						if ( 0 === $( 'option[value=' + quot(act.activity) + ']', $m ).length ) {
							$( '<option></option>' ).val( act.activity || "undef" )
								.text( ( act.activity || "name?" ) + " (missing)" )
								.prependTo( $m.addClass( 'tberror' ) );
						}
						$m.val( act.activity || "undef" );
						$( 'input.re-stopall', newRow ).prop( 'checked', 0 !== ( act.stopall || 0 ) );
						break;

					case "stopgsa":
						if ( undefined !== act.device && 0 === $( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
							$( '<option></option>' ).val( act.device )
								.text( '#' + act.device + ' ' + ( act.devicename || 'name?' ) + ' (missing)' )
								.prependTo( $( 'select.devicemenu', newRow )
								.addClass( "tberror" ) );
							newRow.addClass( "tberror" );
						}
						$( 'select.devicemenu', newRow ).val( act.device || "-1" );
						$m = $( 'select.re-activity', newRow ).empty();
						makeDeviceActivityMenu( act.device || -1, $m )
							.prepend( '<option value="">(all activities)</option>' );
						if ( 0 === $( 'option[value=' + quot(act.activity || "") + ']', $m ).length ) {
							$( '<option></option>' ).val( act.activity || "undef" )
								.text( ( act.activity || "name?" ) + " (missing)" )
								.prependTo( $m.addClass( 'tberror' ) );
						}
						$m.val( act.activity || "" );
						break;

					case "setvar":
						$m = $( 'select.re-variable', newRow );
						if ( 0 === $( 'option[value=' + quot(act.variable) + ']', newRow ).length ) {
							$( '<option></option>' ).val( act.variable )
								.text( act.variable + "? (invalid)" )
								.appendTo( $m.addClass( 'tberror' ) );
						}
						$m.val( act.variable || "" );
						$( 'input#' + idSelector( rid + "-value"), newRow ).val( coalesce( act.value, "" ) );
						$( 'input.tbreeval', newRow ).prop( "checked", 0 !== ( act.reeval || 0 ) );
						break;

					case "resetlatch":
						if ( undefined !== act.device && 0 === $( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
							$( '<option></option>' ).val( act.device )
								.text( '#' + act.device + ' ' + ( act.devicename || 'name?' ) + ' (missing)' )
								.prependTo( $( 'select.devicemenu', newRow )
								.addClass( "tberror" ) );
						}
						$( 'select.devicemenu', newRow ).val( act.device || "-1" );
						$m = $( 'select.re-group', newRow );
						$( 'option.groupoption', $m ).remove();
						makeDeviceGroupMenu( act.device || -1, $m );
						if ( 0 === $( 'option[value=' + quot(act.group) + ']', $m ).length ) {
							$( '<option></option>' ).val( act.group || "undef" )
								.text( ( act.group || "name?" ) + " (missing)" )
								.prependTo( $m.addClass( 'tberror' ) );
						}
						$m.val( act.group || "undef" );
						break;

					case "notify":
						/* If we're copying, we need to clone the notification */
						if ( copying ) {
							/* Clone the old notification, and set clone's ID to new ID. */
							var cf = getConfiguration();
							var nid = nextNotification( cf );
							cf.notifications[nid] = api.cloneObject( cf.notifications[String(act.notifyid)] || {} );
							cf.notifications[nid].id = parseInt(nid);
							$( 'input.re-notifyid', newRow ).val( nid );
							configModified = true;
						} else {
							$( 'input.re-notifyid', newRow ).val( act.notifyid || "" );
						}
						$m = $( 'select.re-method', newRow );
						if ( 0 === $( 'option[value="' + (act.method || "") + '"]', $m ).length ) {
							if ( !devVeraAlerts && "VA" === act.method ) {
								$( '<option></option>' ).val("VA")
									.text("VeraAlerts Direct (not running)")
									.appendTo( $m );
							} else if ( !devVeraTelegram && "VT" === act.method ) {
								$( '<option></option>' ).val("VT")
									.text("VeraTelegram (plugin not installed)")
									.appendTo( $m );
							} else {
								$( '<option></option>' ).val( act.method )
									.text( act.method + "? (unrecognized)" )
									.appendTo( $m );
							}
							$m.addClass( 'tbwarn' ).show();
						}
						$m.val( act.method || "" );
						changeNotifyActionMethod( newRow, act.method, act );
						break;

					case "request":
						$( 'select.re-method', newRow ).val( act.method || "GET" );
						$( 'textarea.re-requrl', newRow ).val( act.url || "http://" );
						$( 'textarea.re-reqheads', newRow )
							.val( Array.isArray( act.headers ) ? act.headers.join("\n") : "" );
						$( 'textarea.re-reqdata', newRow ).val( act.data || "" );
						$( 'div.re-reqdatafs', newRow ).toggle( "POST" === act.method );
						var $opt = $( 'select.re-reqtarget option[value="' + (act.target || "") + '"]', newRow );
						if ( 0 === $opt.length ) {
							$( '<option></option>' ).val( act.target ).text( act.target + " ?")
								.appendTo( $( 'select.re-reqtarget', newRow ) );
						}
						$( 'select.re-reqtarget', newRow ).val( act.target || "" );
						break;

					default:
						console.log("loadActions: what's a " + act.type + "? Skipping it!");
						alert( "Action type " + act.type + " unrecognized. Did you downgrade from a higher version of Reactor? I will try to preserve this action, but I can't edit it." );
						var $am = $( 'select.re-actiontype', newRow );
						if ( 0 === $( 'option[value="'+act.type+'"]', $am ).length ) {
							$( '<option></option>' ).val( act.type ).text( String(act.type) + ' (unrecognized)' )
								.prependTo( $am );
						}
						$am.val( act.type );
						$( 'input#' + idSelector( rid + '-unrecdata' ), newRow ).val( JSON.stringify( act ) );
				}

				newRow.has('.tberror').addClass('tberror');
				newRow.insertBefore( insertionPoint );
			}
		}
	}

	function handleActionCopyClick( ev ) {
		ev.preventDefault();
		var $el = $( ev.currentTarget );
		var source = $el.attr( 'id' ) || "";
		if ( "" === source ) return; /* clicked a non-clickable */

		var $target = $el.closest( 'div.actionlist' );

		/* Pass clone of actions so adding to ourselves isn't infinite loop */
		var cdata = getConfiguration();
		loadActions( $target, api.cloneObject( cdata.activities[source] || {} ), true );
		updateActionList( $target );
		updateActionControls();
	}

	/**
	 * Handle click on activity expand/collapse.
	 */
	function handleActivityCollapseClick( ev ) {
		var $el = $( ev.currentTarget );
		var $p = $el.closest( 'div.actionlist' );
		var $g = $( 'div.activity-group', $p );
		if ( $el.hasClass( 're-collapse' ) ) {
			$g.slideUp();
			$el.addClass( 're-expand' ).removeClass( 're-collapse' ).attr( 'title', 'Expand action' );
			$( 'i', $el ).text( 'expand_more' );
			try {
				var n = $( 'div.actionrow', $g ).length;
				$( 'span.re-titlemessage', $p ).text( " (" + n +
					" action" + ( 1 !== n ? "s" : "" ) + " collapsed)" );
			} catch( e ) {
				$( 'span.re-titlemessage', $p ).text( " (actions collapsed)" );
			}
		} else {
			$g.slideDown();
			$el.removeClass( 're-expand' ).addClass( 're-collapse' ).attr( 'title', 'Collapse action' );
			$( 'i', $el ).text( 'expand_less' );
			$( 'span.re-titlemessage', $p ).text( "" );
		}
	}

	/* */
	function getActionListContainer() {
		var el = $( "<div></div>" ).addClass( "actionlist" );
		var row = $( '<div class="row"></div>' );
		row.append( '\
<div class="tblisttitle col-xs-9 col-sm-9 col-lg-10"> \
  <span class="re-title">?title?</span> \
  <button class="btn md-btn re-tryactivity" title="Run activity now"><i class="material-icons">directions_run</i></button> \
  <button class="btn md-btn re-collapse" title="Collapse action"><i class="material-icons">expand_less</i></button> \
  <span class="re-titlemessage"></span> \
</div> \
<div class="tblisttitle col-xs-3 col-sm-3 col-lg-2 text-right"> \
  <div class="re-titlewarning"></div> \
  <div class="btn-group"> \
	<button class="btn btn-xs btn-success saveconf">Save</button> \
	<button class="btn btn-xs btn-danger revertconf">Revert</button> \
  </div> \
</div>' );
		el.append( row );
		/* activity-group is container for actionrows and buttonrow */
		var g = $( '<div class="activity-group"></div>' );
		row = $( '<div class="row buttonrow"></div>' );
		row.append( '\
<div class="col-xs-12 col-sm-12"> \
  <div class="btn-group"> \
	<button class="addaction btn btn-sm btn-success">Add Action</button> \
	<div class="btn-group"> \
	  <button class="btn btn-sm btn-default dropdown-toggle re-global-import" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Import activity or scene to this activity"> \
		Copy From <span class="caret"></span> \
	  </button> \
	  <ul class="dropdown-menu re-activities-list"></ul> \
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
		var el = $( ev.currentTarget );
		var vis = el.val() || "";
		setParentState( "showactivities", vis );
		var cd = getConfiguration();
		var ac = cd.activities || {};
		$( 'div.re-filteralert' ).toggle( "" !== vis );
		var decide = function( id ) {
			var target = $( 'div#' + idSelector( id ) + ".actionlist" );
			if ( ( "inuse" === vis && isEmptyActivity( ac[id] ) ) ||
				( "true" === vis && ! id.match( /\.true$/ ) ) ||
				( "false" === vis && ! id.match( /\.false$/ ) ) ||
				( "errors" === vis && 0 === $(".tberror,.tbwarn", target).length )
				) {
				target.slideUp();
			} else {
				$( 'div#' + idSelector( id ) + ".actionlist" ).slideDown();
			}
		};
		var scanActivities = function( grp ) {
			decide( grp.id + ".true" );
			decide( grp.id + ".false" );
			var lx = grp.conditions ? grp.conditions.length : 0;
			for ( var ix=0; ix<lx; ix++ ) {
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
		var container = $( 'div#re-activities' ).empty();

		var el = $( '<div class="form-inline"></div>' )
			.append( $( "<label>" ).text( "Show Activities: " )
				.append( $( '<select id="whatshow" class="form-control form-control-sm"></select>' )
					.append( $( '<option value="">All</option>' ) )
					.append( $( '<option value="inuse">In Use</option>' ) )
					.append( $( '<option value="true">True Only</option>' ) )
					.append( $( '<option value="false">False Only</option>' ) )
					.append( $( '<option value="errors">With Errors</option>' ) )
				)
			);
		container.append( el );

		/* Showing all rows now; we'll apply filter later below */
		var showWhich = getParentState( "showactivities", myid ) || "";
		$( 'select#whatshow', container ).on( 'change.reactor', handleActivityVisChange )
			.val( showWhich );

		var ul = $( '<ul></ul>' );
		var showedAny = false;
		var orderly = function( gr ) {
			if ( "nul" !== gr.operator ) {
				ul.append( $( '<li></li>' ).attr( 'id', gr.id + ".true" ).text( ( gr.name || gr.id ) + " True" ) );
				ul.append( $( '<li></li>' ).attr( 'id', gr.id + ".false" ).text( ( gr.name || gr.id ) + " False" ) );
				var scene = gr.id + '.true';
				el = getActionListContainer();
				el.attr( 'id', scene );
				$( 'span.re-title', el ).text( 'When ' +
					( gr.name || gr.id ) + ' is TRUE' );
				container.append( el );
				loadActions( el, cd.activities[scene] || {}, false );
				if ( "inuse" === showWhich && isEmptyActivity( cd.activities[scene] ) ) {
					el.hide();
				}

				scene = gr.id + '.false';
				el = getActionListContainer();
				el.attr( 'id', scene );
				$( 'span.re-title', el ).text( 'When ' +
					( gr.name || gr.id ) + ' is FALSE' );
				container.append( el );
				loadActions( el, cd.activities[scene] || {}, false );

				showedAny = true;
			}

			/* Handle children of this group */
			var lx = gr.conditions ? gr.conditions.length : 0;
			for ( var ix=0; ix<lx; ix++ ) {
				var cond = gr.conditions[ix];
				if ( "group" === ( cond.type || "group" ) ) {
					orderly( cond );
				}
			}
		};
		orderly( ( cd.conditions || {} ).root || [ { id: "root", conditions: [] } ] );

		if ( ! showedAny ) {
			container.append( $( '<div></div>' )
				.html( '<em>There are no groups eligible for activities.</em>' ) );
		} else {
			container.append(
				$( '<div class="re-alertbox re-filteralert"></div>' )
					.text( 'Not all possible activities are being shown. Choose "All" from the "Show Activities" menu at top to see everything.' )
			);
			$( 'select#whatshow', container ).trigger( 'change.reactor' );
		}

		$("div#tab-actions.reactortab button.re-collapse").on( 'click.reactor', handleActivityCollapseClick );
		$("div#tab-actions.reactortab button.re-tryactivity").on( 'click.reactor', function( ev ) {
			var $ct = $( ev.target ).closest( 'div.actionlist' );
			var act = $ct.attr( 'id' );
			var dev = api.getCpanelDeviceId();
			/* Pass UI version to bypass disabled check on RS */
			var param = { SceneNum: act,
				Options: JSON.stringify({ contextDevice: dev, stopRunningScenes: true }) };
			api.performActionOnDevice( dev, serviceId, "RunSceneInline", {
				actionArguments: param,
				onSuccess: function( xhr ) {
					/* Briefly highlight button and restore as UI feedback */
					/* TODO: Eventually, actual status? */
					function crestore( $el ) {
						$el.addClass( 're-activemode' );
						window.setTimeout( function() {
							$el.removeClass( 're-activemode' );
						}, 2000 );
					}
					crestore( $( ev.currentTarget ) );
				},
				onFailure: function( xhr ) {
					alert( "An error occurred. Try again in a moment; Vera may be busy or reloading." );
				}
			} );
		});
		$("div#tab-actions.reactortab button.addaction").on( 'click.reactor', handleAddActionClick );
		$("div#tab-actions.reactortab ul.re-activities-list").empty().append( ul.children() );
		$("div#tab-actions.reactortab ul.re-activities-list li").on( 'click.reactor', handleActionCopyClick );
		$("div#tab-actions.reactortab button.saveconf").on( 'click.reactor', handleActionsSaveClick )
			.prop( "disabled", !configModified );
		$("div#tab-actions.reactortab button.revertconf").on( 'click.reactor', handleRevertClick )
			.prop( "disabled", !configModified );

		updateActionControls();
	}

	/* Set up the Activities tab */
	function doActivities()
	{
		console.log("doActivities()");

		var myid = api.getCpanelDeviceId();

		try {
			$( 'div#tbcopyright' ).append('<span> Reactor device info ver ' + String(deviceInfo.serial) + '</span>');
			if ( checkRemoteAccess() ) {
				$( 'div.reactortab' ).prepend(
					$( '<div class="remotealert re-alertblock"></div>' ).text( msgRemoteAlert )
				);
			}
		}
		catch (e) {}

		try {
			var cd = getConfiguration( myid );

			/* Set up a data list with our variables */
			var dl = $( '<datalist id="reactorvarlist"></datalist>' );
			if ( cd.variables ) {
				for ( var vname in cd.variables ) {
					if ( cd.variables.hasOwnProperty( vname ) ) {
						var opt = $( '<option></option>' ).val( '{'+vname+'}' ).text( '{'+vname+'}' );
						dl.append( opt );
					}
				}
			}
			$( 'div#tab-actions.reactortab' ).append( dl );

			redrawActivities();

			if ( undefined !== deviceInfo ) {
				var uc = $( '<div id="di-ver-check"></div>' );
				$('div#tab-actions').prepend( uc );
				$.ajax({
					url: "https://www.toggledbits.com/deviceinfo/checkupdate.php",
					data: {
						"v": deviceInfo.serial,
						"fw": "",
						r: Math.random()
					},
					dataType: "jsonp",
					jsonp: "callback",
					crossDomain: true,
					cache: false,
					timeout: 10000
				}).done( function( respData, statusText, jqXHR ) {
					console.log("Response from server is " + JSON.stringify(respData));
					if ( undefined !== respData.serial && respData.serial > deviceInfo.serial ) {
						$( 'div#di-ver-check' ).empty().append( "<p>A newer version of the device information database is available. Please use the update function on the Tools tab to get it. This process is quick and does not require a Luup reload or browser refresh--you can immediately come back here and go right back to work! The new version is " +
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
			alert( e );
		}
	}

	function preloadActivities() {
		var myid = api.getCpanelDeviceId();
		checkUnsaved( myid );

		if ( ! initModule() ) {
			return;
		}

		header();

		/* Our styles. */
		if ( 0 === $( 'style#reactor-activity-styles' ).length ) {
			$( 'head' ).append( '<style id="reactor-activity-styles"> \
div#tab-actions.reactortab datalist { display: none; } \
div#tab-actions.reactortab div#di-ver-check p { margin: 8px 8px 8px 8px; padding: 8px 8px 8px 8px; border: 2px solid yellow; } \
div#tab-actions.reactortab .color-green { color: #428BCA; } \
div#tab-actions.reactortab .tberrmsg { padding: 8px 8px 8px 8px; color: red; } \
div#tab-actions.reactortab div.actionlist { border-radius: 8px; border: 2px solid #428BCA; margin-bottom: 16px; } \
div#tab-actions.reactortab div.actionlist .row { margin-right: 0px; margin-left: 0px; } \
div#tab-actions.reactortab div.tblisttitle { background-color: #428BCA; color: #fff; padding: 4px 8px; min-height: 45px; } \
div#tab-actions.reactortab div.tblisttitle span.re-title { font-size: 16px; font-weight: bold; margin-right: 1em; } \
div#tab-actions.reactortab span.re-titlemessage { padding-left: 8px; } \
div#tab-actions.reactortab div.re-titlewarning { float: left !important; } \
div#tab-actions.reactortab div.actionlist label:not(.reqarg) { font-weight: normal; } \
div#tab-actions.reactortab div.actionlist label.reqarg { font-weight: bold; } \
div#tab-actions.reactortab div.actionlist.tbmodified div.tblisttitle span.re-title:after { content: " (unsaved)" } \
div#tab-actions.reactortab div.actionrow,div.buttonrow { padding: 8px; } \
div#tab-actions.reactortab div.actionlist div.actionrow:nth-child(odd) { background-color: #EFF6FF; } \
div#tab-actions.reactortab div.actionrow.tbmodified:not(.tberror) { border-left: 4px solid green; } \
div#tab-actions.reactortab div.actionrow.tberror { border-left: 4px solid red; } \
div#tab-actions.reactortab input.re-comment { width: 100% !important; } \
div#tab-actions.reactortab select.re-actionmenu { max-width: 16em; } \
div#tab-actions.reactortab textarea.re-extra-url { resize: both; } \
div#tab-actions.reactortab textarea.re-luacode { font-family: monospace; resize: vertical; width: 100% !important; white-space: nowrap; } \
div#tab-actions.reactortab textarea.re-reqfield { font-family: monospace; resize: vertical; height: auto; width: 100% !important; white-space: nowrap; } \
div#tab-actions.reactortab div.editor { width: 100%; min-height: 240px; } \
div#tab-actions.reactortab div.tbhint { font-size: 90%; font-weight: normal; } \
div#tab-actions.reactortab div.warning { color: red; } \
div#tab-actions.reactortab option.nodata { font-style: italic; } \
div#tab-actions.reactortab .tbslider { display: inline-block; width: 200px; height: 1em; border-radius: 8px; } \
div#tab-actions.reactortab .tbslider .ui-slider-handle { background: url("/cmh/skins/default/img/other/slider_horizontal_cursor_24.png?") no-repeat scroll left center rgba(0,0,0,0); cursor: pointer !important; height: 24px !important; width: 24px !important; margin-top: 6px; font-size: 12px; text-align: center; padding-top: 4px; text-decoration: none; } \
div#tab-actions.reactortab .tbslider .ui-slider-range-min { background-color: #12805b !important; } \
div#tab-actions.reactortab ul.dropdown-menu { color: #333; background-color: white; border: 1px solid #333; text-align: initial; padding: 4px 4px; width: 320px; max-height: 320px; overflow: auto; } \
div#tab-actions.reactortab ul.dropdown-menu li:hover { color: white; background-color: #333; } \
div#tab-actions.reactortab button.re-activemode { color: #6f6; } \
</style>');
		}

		api.setCpanelContent( '<div id="loading">Please wait... loading device and activity data, which may take a few seconds.</div>' );

		/* Load the device data through the system-ready promise. */
		waitForReloadComplete( "Waiting for system ready..." ).then( function() {
			var start = Date.now();
			var urlbase = api.getDataRequestURL().replace( /data_request.*$/i, "" );
			console.log("Fetching " + urlbase + "D_ReactorDeviceInfo.json");
			$.ajax({
				url: urlbase + "D_ReactorDeviceInfo.json",
				data: {
					r: Math.random()
				},
				dataType: "json",
				cache: false,
				timeout: 15000
			}).done( function( data, statusText, jqXHR ) {
				console.log("D_ReactorDeviceInfo loaded (" + String(Date.now()-start) +
					"ms), timestamp=" + String(data.timestamp) + ", serial=" +
					String(data.serial));
				if ( (data.serial || 0) < DEVINFO_MINSERIAL ) {
					$("div#loading").empty().append( '<h3>Update Required</h3>Your device information database file needs to be at least serial ' + String(DEVINFO_MINSERIAL) + ' to run with this version of Reactor. Please go to the Tools tab to update it, then come back here.' );
					return;
				}

				deviceInfo = data;

				/* Body content */
				var html = '<div id="tab-actions" class="reactortab">';

				html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Activities</h3></div></div>';

				html += '<div id="re-activities"></div>';

				html += '</div>'; // tab-actions

				html += footer();

				$('div#loading').replaceWith( html );

				doActivities();
			}).fail( function( jqXHR, textStatus, errorThrown ) {
				// Bummer.
				console.log("Failed to load D_ReactorDeviceInfo.json: " + textStatus + " " + String(errorThrown));
				console.log(jqXHR.responseText);
				deviceInfo = { services: {}, devices: {} };
				if ( jqXHR.status == 500 || jqXHR.status == 503 ) {
					$('div#loading').html("<b>Sorry, not able to load data at this moment!</b> Vera is busy or reloading. Don't panic! Wait a moment, switch to the Status tab, and then back here to retry loading.");
				} else {
					$('div#loading').html('<h1>Hmmm...</h1>Well, that didn\'t go well. Try waiting a few moments, and then switching back to the Status tab and then back to this tab. If that doesn\'t work, please <a href="mailto:reactor@toggledbits.com?subject=Reactor+Activities+Load+Problem">send email to reactor@toggledbits.com</a> with the following text: <pre id="diag"></pre>');
					var str = String(errorThrown) + "\n" + String(textStatus);
					for ( var k in jqXHR ) {
						if ( jqXHR.hasOwnProperty(k) && typeof(jqXHR[k]) != "function" ) {
							str += "\n" + k + '=' + String(jqXHR[k]);
						}
					}
					$('#diag').text( str );
				}
			});
		});
	}

 /** ***************************************************************************
 *
 * T O O L S
 *
 ** **************************************************************************/

	function grabLog( ev ) {
		$( 'div#rslogdata' ).empty();
		var url = api.getDataRequestURL();
		url = url.replace( /(:3480|\/port_3480).*/, "" );
		url = url + "/cgi-bin/cmh/log.sh?Device=LuaUPnP";
		$( 'div#rslogdata' ).append( '<h3>Debug Log Snippet</h3><p>Fetching ' + url + '</p>' );
		$.ajax({
			url: url,
			data: {},
			cache: false,
			dataType: 'text',
			timeout: 15000
		}).done( function( data, statusText, jqXHR ) {
			var keypat = new RegExp( "9c6c9aa0-1060-11ea-b3de-9303e5fab7a5" );
			var pos = data.search( keypat );
			if ( pos < 0 ) {
				$( 'div#rslogdata' ).append( '<p><strong>SUBJECT DATA NOT FOUND. RESTART THIS REACTOR SENSOR AFTER ENABLING DEBUG. SEE INSTRUCTIONS ABOVE.</strong></p>' );
				return;
			}
			while ( pos >= 0 ) {
				data = data.substring( pos+36 );
				pos = data.search( keypat );
			}
			$( 'div#rslogdata' ).empty().append( '<h3>Debug Log Snippet</h3><pre></pre>' );
			var lines = data.split( /\r?\n/ );
			var k = 0, n = 0;
			var nmax = parseInt( api.getDeviceState( api.getCpanelDeviceId(), serviceId, "MaxLogSnippet" ) || "" );
			if ( isNaN( nmax ) || nmax < 500 ) nmax = 500;
			var $f = $( 'div#rslogdata pre' );
			var ln = lines.length;
			while ( n < nmax && k < ln ) {
				var l = lines[k].replace( /<span\s+[^>]*>/i, "" ).replace( /<\/span>/i, "" );
				if ( ! l.match( /^(06)/ ) ) {
					$f.append( l + "\n" );
					n++;
				}
				k++;
			}
		}).fail( function() {
			$( 'div#rslogdata' ).empty().append("<b>Hmm, that didn't go well. Try again in a few moments.</b>");
		});
	}

	function handleTestChange( ev ) {
		var container = $('div#reactortools.reactortab');
		var el = $('input#testdateenable', container);
		var $ct = el.closest( 'div.row' );
		var vv = "";
		if ( el.prop('checked') ) {
			$('select,input#testtime', $ct).prop('disabled', false);
			var t = new Date();
			t.setFullYear( $('select#testyear', container).val() );
			t.setMonth( parseInt( $('select#testmonth', container).val() ) - 1 );
			t.setDate( $('select#testday', container).val() );
			t.setSeconds( 0 );
			var s = $('input#testtime', container).val();
			var p = ( s || "0:00" ).match( /^(\d+):(\d+)(:(\d+))?$/ );
			if ( p !== null ) {
				t.setHours( p[1] );
				t.setMinutes( p[2] );
				if ( p.length >= 5 && p[4] !== undefined ) {
					t.setSeconds( p[4] );
				} else {
					t.setSeconds( 0 );
				}
			}
			t.setMilliseconds( 0 );
			vv = Math.floor( t.getTime() / 1000 );
			if ( isNaN(vv) ) {
				vv = "";
			}
		} else {
			$('select,input#testtime', $ct).prop('disabled', true);
		}
		api.setDeviceStateVariablePersistent( api.getCpanelDeviceId(), serviceId, "TestTime", vv );
		needsRestart = true;

		el = $('input#testhousemode', container);
		if ( el.prop('checked') ) {
			$('select#mode', container).prop('disabled', false);
			vv = $('select#mode', container).val();
		} else {
			$('select#mode', container).prop('disabled', true);
			vv = "";
		}
		api.setDeviceStateVariablePersistent( api.getCpanelDeviceId(), serviceId, "TestHouseMode", vv );
		needsRestart = true;
	}

	function processServiceFile( dd, serviceId, scpdurl ) {
		var jqXHR = $.ajax({
			url: scpdurl,
			dataType: "xml",
			cache: false,
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
		var p = $.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "lu_device",
				output_format: "xml",
				r: Math.random()
			},
			dataType: "xml",
			cache: false,
			timeout: 15000
		}).done( function( data, statusText, jqXHR ) {
			var devs = $( data ).find( "device" );
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
						return $.ajax({
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
		var ct = $( ev.currentTarget ).closest( 'div' );
		var device = $( 'select#devices', ct ).val();
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
		var lx = ud.devices.length;
		for ( var ix=0; ix<lx; ix++ ) {
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
		$.ajax({
			url: "https://www.toggledbits.com/deviceinfo/checkupdate.php",
			data: {
				"v": ( deviceInfo || {}).serial || "",
				"fw": "",
				r: Math.random()
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
				$( 'span#di-ver-info' ).html( msg );
			}
		}).fail( function( jqXHR, textStatus, errorThrown ) {
			$( 'span#di-ver-info' ).text( "Information about the current version is not available." );
			console.log( "deviceInfo version check failed: " + String(errorThrown) );
		});
	}

	function spyDeviceChangeHandler( args ) {
		if ( ! spyDevice ) return;
		console.log(args);
		if ( args.id == spyDevice ) {
			var l = args.states.length;
			var txt = "";
			for ( var i=0; i<l; i++ ) {
				txt += args.states[i].service + " / " + args.states[i].variable + " = " +
						JSON.stringify( args.states[i].value ) + "\n";
			}
			var $fld = $( '#devspyoutput' ).append( txt ).show();
			if ( $fld.length ) {
				$fld.scrollTop( $fld.prop( 'scrollHeight' ) - $fld.height() );
			}
		}
	}

	function handleDevSpyDevice( ev ) {
		var menu = $( ev.currentTarget );
		var dev = menu.val();
		spyDevice = false;
		$( '#devspyoutput' ).empty();
		if ( isEmpty( dev ) ) {
			$( '#devspyoutput' ).hide();
			return;
		}
		spyDevice = parseInt( dev );
		var devobj = api.getDeviceObject( spyDevice );
		if ( devobj ) {
			$( '#devspyoutput' ).show();
			$( '#devspyoutput' ).text( 'Watching #' + spyDevice + " " + devobj.name +
				"; waiting for changes in device states...\n" );
		}
	}

	function repair_scan( cf, node, result ) {
		console.log("Repair check " + ((node || {}).id || "undefined"));
		result = result || {};
		if ( undefined === node ) {
			return result;
		} else if ( "group" === ( node.type || "group" ) ) {
			/* Check activities */
			console.log("Need to check activities for " + node.id);
			function checkActivity( activity ) {
				if ( !activity ) return;
				console.log("checking "+String(activity.id));
				for ( var igrp=0; igrp < (activity.groups || []).length; ++igrp ) {
					var grp = activity.groups[igrp];
					console.log(grp);
					for ( var iact=0; iact < (grp.actions || []).length; ++iact ) {
						var act = grp.actions[iact];
						console.log(act);
						if ( undefined !== act.device && -1 !== act.device ) {
							var oldname = act.devicename || act.deviceName;
							var key = activity.id + "/" + igrp + "/" + iact;
							var dd = api.getDeviceObject( act.device );
							console.log("checking " + key + " " + String(act.device) + " " + String(oldname));
							if ( !dd || dd.name !== oldname ) {
								if ( undefined === result[String(act.device)] ) {
									result[String(act.device)] = {
										"device": act.device,
										"lastname": act.devicename || act.deviceName,
										"newname": (dd || {}).name,
										"act": [ key ]
									};
								} else {
									result[String(act.device)].act = result[String(act.device)].act || [];
									result[String(act.device)].act.push( key );
								}
							}
						}
					}
				}
			}
			console.log(node.id + ".true=" + (cf.activities || {})[node.id + ".true"]);
			console.log(node.id + ".false=" + (cf.activities || {})[node.id + ".false"]);
			checkActivity( ( cf.activities || {} )[node.id + ".true"] );
			checkActivity( ( cf.activities || {} )[node.id + ".false"] );

			/* Check sub-conditions */
			for ( var ix=0; ix<(node.conditions || []).length; ++ix ) {
				result = repair_scan( cf, node.conditions[ix], result );
			}
		} else if ( undefined !== node.device && -1 !== node.device ) {
			var oldname = node.devicename || node.deviceName;
			var dd = api.getDeviceObject( node.device );
			if ( ! dd || dd.name !== oldname ) {
				if ( undefined === result[String(node.device)] ) {
					result[String(node.device)] = { "device": node.device,
						"lastname": node.devicename || node.deviceName,
						"newname": (dd || {}).name,
						"cond": [ node.id ] };
				} else {
					result[String(node.device)].cond = result[String(node.device)].cond || [];
					result[String(node.device)].cond.push( node.id );
				}
			}
		}
		return result;
	}

	function repair_activity( activity, old_dev, new_dev, new_name ) {
		if ( undefined === activity ) {
			return;
		}
		for ( var igrp=0; igrp<(activity.groups || []).length; ++igrp ) {
			for ( var iact=0; iact<(activity.groups[igrp].actions || []).length; ++iact ) {
				var act = activity.groups[igrp].actions[iact];
				if ( act.device && act.device === old_dev ) {
					console.log("Repairing "+old_dev+" in "+activity.id+"/"+igrp+"/"+iact);
					act.device = new_dev;
					act.devicename = new_name;
					delete act.deviceName;
					configModified = true;
				}
			}
		}
	}

	function repair_replace( cf, node, old_dev, new_dev, new_name ) {
		if ( undefined === node ) {
			return;
		} else if ( "group" === ( node.type || "group" ) ) {
			for ( var ix=0; ix<(node.conditions || []).length; ++ix ) {
				repair_replace( cf, node.conditions[ix], old_dev, new_dev, new_name );
			}
			repair_activity( (cf.activities || {})[node.id + '.true'], old_dev, new_dev, new_name );
			repair_activity( (cf.activities || {})[node.id + '.false'], old_dev, new_dev, new_name );
		} else if ( node.device && node.device === old_dev ) {
			console.log("Repairing "+old_dev+" in "+node.id);
			node.device = new_dev;
			node.devicename = new_name;
			delete node.deviceName;
			configModified = true;
		}
	}

	function do_device_repairs() {
		var cf = getConfiguration();
		var $ct = $('div#re-devicerepair');
		$( 'button#re-make-repairs', $ct ).prop( 'disabled', true );
		$( 'span#re-repairstatus', $ct ).html("Saving, please wait...");
		$( 'div.re-lost-device', $ct ).each( function() {
			var old_dev = $(this).attr( 'id' );
			var new_dev = $( "select.re-replacemenu", $(this) ).val() || "";
			var ndev, dd;
			if ( "*" === new_dev ) {
				console.log("Device "+old_dev+" repair by fixing stored name.");
				ndev = parseInt( old_dev );
				dd = api.getDeviceObject( ndev );
				if ( dd ) {
					repair_replace( cf, cf.conditions.root, ndev, ndev, dd.name );
					$(this).remove();
				}
			} else if ( "" !== new_dev ) {
				console.log("Device "+old_dev+" reassign to "+new_dev);
				ndev = parseInt( new_dev );
				dd = api.getDeviceObject( ndev );
				if ( dd ) {
					repair_replace( cf, cf.conditions.root, parseInt( old_dev ), ndev, dd.name );
					$(this).remove();
				}
			} else {
				console.log("Device "+old_dev+" no change.");
			}
		});

		saveConfiguration( false, function() {
			$( 'span#re-repairstatus', $ct ).html("Changes saved.");
		}, function() {
			$( 'span#re-repairstatus', $ct ).html('<em style="color: red">FAILED! Please try again!</em>');
			$( 'button#re-make-repairs', $ct ).prop( 'disabled', false );
		});
	}

	function doPluginUpdate( releaseId ) {
		$( 'div#re-pluginupdate button' ).prop( 'disabled', true );
		api.showCustomPopup( "Updating Reactor...", { autoHide: false, category: 3 } );
		$.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "lr_Reactor",
				action: "updateplugin",
				release: releaseId,
				r: Math.random()
			},
			dataType: "json",
			cache: false,
			timeout: 60000
		}).done( function( data ) {
			if ( data.status ) {
				api.showCustomPopup( "Update completed. Reloading Luup...", { autoHide: false, category: 3 } );
				setTimeout( function() {
					api.performActionOnDevice( 0, "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "Reload",
						{ actionArguments: { Reason: "Reactor plugin updated by user" } } );
					setTimeout( function() {
						waitForReloadComplete().then( function() {
							$("#myModal").modal("hide");
							alert("Please hard-refresh your browser!");
						}).catch( function(reason) {
							$("#myModal").modal("hide");
						});
					}, 5000 );
				}, 5000 );
			} else {
				$("#myModal").modal("hide");
				alert("Update failed: " + String(data.message));
			}
		}).fail( function( /* jqXHR, textStatus, errorThrown */ ) {
			$("#myModal").modal("hide");
			alert("Update request failed. Luup may be reloading. Try again in a moment.");
		}).always( function() {
			$( 'div#re-pluginupdate button' ).prop( 'disabled', false );
		});
	}

	function doTools()
	{
		console.log("doTools()");

		var myid = api.getCpanelDeviceId();
		checkUnsaved( myid );

		if ( ! initModule() ) {
			return;
		}

		header();

		var html = '';

		html += '<style> \
textarea#devspyoutput { width: 100%; font-family: monospace; } \
</style>';

		html += '<div id="reactortools" class="reactortab">';

		html += '<h3>Test Tools</h3> \
<div class="row"> \
  <div class="col-sm-2 col-md-4 col-lg-3 col-xl-2"> \
	<span id="testdateenable"></span> \
  </div> \
  <div class="col-sm-10 col-md-8 col-lg-9 col-xl-10 form-inline"> \
	<select id="testyear" class="form-control form-control-sm"></select> \
	<select id="testmonth" class="form-control form-control-sm"></select> \
	<select class="form-control form-control-sm" id="testday"></select> \
	<input class="narrow form-control form-control-sm" id="testtime"> \
  </div> \
</div>'; /* row */

		html += '<div class="row"> \
  <div class="col-sm-2 col-md-4 col-lg-3 col-xl-2"><span id="testhousemode"></div> \
  <div class="col-sm-10 col-md-8 col-lg-9 col-xl-10 form-inline"> \
	<select class="form-control form-control-sm" id="mode"> \
	  <option value="1">Home</option> \
	  <option value="2">Away</option> \
	  <option value="3">Night</option> \
	  <option value="4">Vacation</option> \
	</select> \
  </div> \
</div>'; /* row */

		html += '<div class="row"> \
  <div class="col-sm-12 col-md-12"> \
	These settings do not change system configuration. They override the system values \
	when your ReactorSensor requests them, allowing you to more easily test your conditions. \
	For example, turn on the "Test Date" checkbox above and use the controls to set a date, \
	then go back to the "Control" tab and press the "Restart" button to force a \
	re-evaluation of the sensor state using your selected date/time. \
	<b>Remember to turn these settings off when you have finished testing!</b> \
  </div> \
</div>'; /* row */

		html += '<div>\
  <h3>Update Device Information Database</h3>\
  <p>The "Activities" tab will notify you when an update to the Device Information Database is \
	available. Update by clicking the button below; this does not require a Luup restart or \
	browser refresh. Updates are shared by all ReactorSensors, so updating once updates all of \
	them. This process sends information about the versions of your Vera firmware, this plugin, \
	and the current database, but no personally-identifying information. This information is \
	used to select the correct database for your configuration; it is not used for tracking you. \
  </p> \
  <span id="di-ver-info"></span> \
  <p><button id="updateinfo" class="btn btn-sm btn-success">Update Device Info</button> \
	<span id="status"></span> \
  </p> \
</div>';

		// html += '<div id="re-updateplugin"><h3>Update Reactor</h3><span id="re-updatestatus">Update information not available at the moment.</span><p><button id="updateplugin" class="btn btn-sm btn-success">Update Reactor Now</button></p></div>';

		/* This feature doesn't work on openLuup -- old form of lu_device request isn't implemented */
		if ( !isOpenLuup ) {
			html += '<div id="enhancement" class="form-inline">\
  <h3>Submit Device Data</h3>\
  If you have a device that is missing "Common Actions" or warns you about missing enhancement \
  data in the Activities tab (actions in <i>italics</i>), you can submit the device data to \
  rigpapa for evaluation. This process sends the relevant data about the device. It does not \
  send any identifying information about you or your Vera, and the data is used only for \
  enhancement of the device information database. \
  <p>\
	<select id="devices"></select> \
	<button id="submitdata" class="btn btn-sm btn-info">Submit Device Data</button> \
  </p>\
</div>';
		}

		html += '<div id="re-devicerepair"></div>';

		html += '<div id="troubleshooting"><h3>Troubleshooting &amp; Support</h3>If you are having trouble working out your condition logic, or you think you have found a bug, here are some steps and tools you can use:';
		html += '<ul><li>Check the <a href="' + _DOCURL + '" target="_blank">Reactor Documentation</a>.</li>\
<li>Generate and examine a <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=summary&device=' + api.getCpanelDeviceId() + '" target="_blank">Logic&nbsp;Summary</a> report. This text-based report shows your ReactorSensor\'s current state, and its event list, which may tell you a lot about what it\'s doing.</li>\
<li>If the logic summary is not helping you, please post it to the <a href="https://community.getvera.com/c/plugins-and-plugin-development/reactor/178" target="_blank">Reactor Board in the Vera Community Forums</a>. <strong>Be sure to read the instructions in the report header before posting.</strong>. In your post, describe what you are trying to accomplish and/or the problem you are having. <strong>Please do not post screenshots unless asked to do so.</strong>.</li>';
		if ( ! isOpenLuup ) {
			html += '<li>If you are asked for a "debug log snippet", use this procedure (unless given other instructions in the request):<ol><li>Turn on debug by clicking this link: <a href="' +
			api.getDataRequestURL() + '?id=lr_Reactor&action=debug&debug=1" target="_blank">Turn debug ON</a></li><li>Restart this sensor to force a re-evaluation of all conditions: <a href="' +
			api.getDataRequestURL() + '?id=action&output_format=xml&DeviceNum=' + api.getCpanelDeviceId() + '&serviceId=' +
			encodeURIComponent( serviceId ) + '&action=Restart" target="_blank">Restart this ReactorSensor</a></li><li><strong>Wait at least 60 seconds, not less.</strong> This is very important&mdash;proceeding too soon may result in incomplete log data. During this period, you should also provide any "stimulus" needed to demonstrate the issue (e.g. turn devices on/off).</li><li>Click this link to <a href="javascript:void(0);" id="grablog">generate the log snippet</a> (the relevant part the log file). It should magically appear at the bottom of this page&mdash;scroll down!</li><li>Post the log snippet to the forum thread, or email it <em>together with your logic summary report and your forum username</em> to <a href="mailto:reactor-logs@toggledbits.com" target="_blank">reactor-logs@toggledbits.com</a>. Note: this email address is for receiving logs only; do not submit questions or other requests to this address.</li></ol>';
		}
		html += '</ul></div>';

		html += '<div id="devicespy">\
  <h3>Device Spy</h3>\
  If you\'re trying to figure out what state variables are changing on a device, choose \
  the device below, and then perform operations on the device any way that is consistent \
  with what you want to detect. The list will show you what state variables are changing. \
  <strong>Due to the way in which Vera handles state variables and UI7, not all variables \
	may be shown.</strong> \
  This display is therefore not entirely conclusive: it is meant as an assistive tool, \
  not an authoritative tool. \
  <div class="form-inline"> \
	<select id="devspydev" class="form-control form-control-sm">\
	  <option value="">--choose--</option>\
	</select>\
  </div> \
  <textarea id="devspyoutput" rows="16" wrap="off" class="form-control form-control-sm"></textarea> \
</div>';

		html += '</div>'; /* .reactortab */

		html += footer();

		api.setCpanelContent( html );

		$( 'span#testdateenable' ).replaceWith( getCheckbox( 'testdateenable', '1', 'Use Test Date:' ) );
		$( 'span#testhousemode' ).replaceWith( getCheckbox( 'testhousemode', '1', 'Use Test House Mode:' ) );

		var container = $('div#reactortools.reactortab');
		var el = $('select#testyear', container);
		var i, vv;
		var now = new Date();
		vv = now.getFullYear() - 2;
		for ( i=0; i<12; i++, vv++ ) {
			el.append('<option value="' + vv + '">' + vv + '</option>');
		}
		el = $('select#testmonth', container);
		for ( i=1; i<=12; i++) {
			el.append('<option value="' + i + '">' + monthName[ i ] + '</option>');
		}
		el = $('select#testday', container);
		for ( i=1; i<=31; i++) {
			el.append('<option value="' + i + '">' + i + '</option>');
		}

		/* Restore test date */
		var s = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "TestTime" ) || "0";
		$('input#testdateenable', container).prop('checked', false);
		$('select#testyear,select#testmonth,select#testday,input#testtime', container).prop('disabled', true);
		s = parseInt( s );
		if ( ! isNaN( s ) && 0 !== s ) {
			/* Test time spec overrides now */
			now = new Date( s * 1000 );
			$('input#testdateenable', container).prop('checked', true);
			$('select#testyear,select#testmonth,select#testday,input#testtime', container).prop('disabled', false);
		}
		$('select#testyear', container).on( 'change.reactor', handleTestChange ).val( now.getFullYear() );
		$('select#testmonth', container).on( 'change.reactor', handleTestChange ).val( now.getMonth() + 1 );
		$('select#testday', container).on( 'change.reactor', handleTestChange ).val( now.getDate() );
		var mm = now.getMinutes();
		$('input#testtime', container).on( 'change.reactor', handleTestChange ).val( now.getHours() + ":" + ( mm < 10 ? '0' + mm : mm ) );
		$('input#testdateenable', container).on( 'click.reactor', handleTestChange );

		/* Restore test house mode */
		var mode = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "TestHouseMode" ) || "";
		$('input#testhousemode', container).prop('checked', false);
		$('select#mode', container).prop('disabled', true);
		if ( ! ( isEmpty( mode ) || "0" === mode ) ) {
			mode = parseInt( mode );
			if ( ! isNaN( mode ) ) {
				$('input#testhousemode', container).prop('checked', true);
				$('select#mode', container).prop('disabled', false).val( mode );
			}
		}
		$('input#testhousemode,select#mode', container).on( 'change.reactor', handleTestChange );

		var deviceMenu = makeDeviceMenu( "", "" );
		deviceMenu.attr('id', 'devices');
		$( 'div#enhancement select#devices', container ).replaceWith( deviceMenu );
		$( 'div#enhancement button#submitdata', container ).on( 'click.reactor', handleSendDeviceDataClick );

		$( 'button#updateinfo', container ).on( 'click.reactor', function( ) {
			var msg = $( 'button#updateinfo', container ).parent().find('span#status');
			msg.text("Please wait, downloading update...");
			$.ajax({
				url: api.getDataRequestURL(),
				data: {
					id: "lr_Reactor",
					action: "infoupdate",
					infov: deviceInfo.serial || 0,
					r: Math.random()
				},
				dataType: 'json',
				cache: false,
				timeout: 30000
			}).done( function( respData /* , respText, jqXHR */ ) {
				if ( respData && respData.status ) {
					msg.text( "Update successful! The changes take effect immediately; no restart necessary." );
					// don't call updateToolsVersionDisplay() again because we'd need to reload devinfo to
					// get the right message.
					$( 'span#di-ver-info', container ).html( "Your database is up to date!" );
				} else {
					msg.text( "The update could not be retrieved. If this problem persists, consult the documentation." );
				}
			}).fail( function( /* jqXHR, textStatus, errorThrown */ ) {
				msg.text( "The update failed; Vera busy/restarting. Try again in a moment." );
			});
		});

		var cf = getConfiguration( false, true );
		var lost = repair_scan( cf, cf.conditions.root );
		if ( hasAnyProperty( lost ) ) {
			var $mm = deviceMenu.clone().attr( 'id', '' ).addClass( "re-replacemenu" );
			$( 'option[value=""]', $mm ).text("(no change)");
			$( 'option[value="-1"]', $mm ).remove();
			var $ct = $('div#re-devicerepair');
			var $row = $('<div class="row"></div>').appendTo( $ct );
			$( '<div class="col-xs-12 col-sm-12"><h3>Device Repair</h3><p>This tool identifies missing or suspect devices and allows you to reassign them, without having to go in and edit each individual condition and action. If the device is listed here, it is either missing entirely, or its name has changed since you last edited the ReactorSensor configuration. <em>This tool does not repair device references in Expressions</em>, including <tt>getstate()</tt>. You will need to do those manually.</p><p>It is always a good idea to <strong>back up your ReactorSensors</strong> (from the Reactor master device) before making reassignments/repairs.</p></div>' )
				.appendTo( $row );
			$row = $('<div class="row"></div>').appendTo( $ct );
			$( '<div class="col-xs-12 col-sm-8 col-md-6 col-lg-6 col-xl-4"></div>' ).html( '<b>Missing/Suspect Device</b>' )
				.appendTo( $row );
			$( '<div class="col-xs-12 col-sm-4 col-md-6 col-lg-6 col-xl-3"></div>' ).html( '<b>Replace With</b>' )
				.appendTo( $row );
			for ( var ds in lost ) {
				$row = $('<div class="row re-lost-device"></div>' ).attr( 'id', ds ).appendTo( $ct );
				$( '<div class="col-xs-12 col-sm-8 col-md-6 col-lg-6 col-xl-4"></div>' )
					.text( "#" + ds + " last known as \"" + (lost[ds].lastname || "") +
						"\"; used in " + ( lost[ds].cond ? lost[ds].cond.length : 0 ) +
						" conditions and " + ( lost[ds].act ? lost[ds].act.length : 0 ) +
						" actions" +
						( lost[ds].newname ? ( "; current device name \"" + lost[ds].newname + '"' ) : "; missing" ) +
						"."
					).appendTo( $row );
				$( '<div class="col-xs-12 col-sm-8 col-md-6 col-lg-6 col-xl-3"><select></select></div>' )
					.appendTo( $row );
				var $mx = $mm.clone().attr( 'id', 'lost' + ds );
				$( 'select', $row ).replaceWith( $mx );
				if ( undefined !== lost[ds].newname ) {
					$( '<option></option>' ).val("*").text("(keep device #, update to current name)")
						.prependTo( $mx );
				} else {
					$( 'option[value="*"]', $mx ).remove();
				}
				$mx.off( 'change.reactor' ).on( 'change.reactor', function( ev ) {
					var $m = $( 'div#re-devicerepair select.re-replacemenu option[value!=""]:selected' );
					var pending = configModified || $m.length > 0;
					$( 'div#re-devicerepair button#re-make-repairs' )
						.prop( 'disabled', !pending );
					$( 'div#re-devicerepair span#re-repairstatus' )
						.text( pending ? "Changes pending (unsaved)" : "" );
				});
			}
			$row = $('<div class="row"></div>').appendTo( $ct );
			$( '<div class="col-xs-12 col-sm-12"><button id="re-make-repairs" class="btn btn-sm btn-primary">Apply and Save</button><span id="re-repairstatus"></span></div>' )
				.appendTo( $row );
			$( 'button#re-make-repairs', $ct )
				.prop( 'disabled', true )
				.on( 'click.reactor', do_device_repairs );
		}

		deviceMenu = deviceMenu.clone().attr( 'id', 'devspydev' ).on( 'change.reactor', handleDevSpyDevice );
		$( 'select#devspydev', container ).replaceWith( deviceMenu );
		$( '#devspyoutput', container ).hide();

		/* Tools get log fetcher */
		if ( ! isOpenLuup ) {
			$( '<div id="rslogdata"></div>' ).insertAfter( 'div#tbcopyright' );
			$( 'a#grablog', container ).on( 'click', grabLog );
		}

		updateToolsVersionDisplay();

		/*
		$( 'div#re-updateplugin' ).toggle( false );
		checkUpdate().then( function( data ) {
			if ( data ) {
				$( 'div#re-updateplugin' ).toggle( true );
				$( 'div#re-updateplugin #re-updatestatus' )
					.html( "An update to Reactor is available: " + String(data.name) +
						". Click to update; a restart of Luup is required after." +
						' <a href="' + data.html_url + '" target="_blank">More Information</a>' );
				$( 'div#re-updateplugin button' ).on( 'click.reactor', function() { doPluginUpdate( data.id ); } );
			}
		}).catch( function() {
			// nada
		});
		*/

		api.registerEventHandler('on_ui_deviceStatusChanged', ReactorSensor, 'spyDeviceChangeHandler');
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
		spyDeviceChangeHandler: spyDeviceChangeHandler,
		doActivities: preloadActivities,
		doConditions: doConditions,
		doVariables: doVariables,
		doStatusPanel: doStatusPanel
	};
	return myModule;
})(api, jQuery);
