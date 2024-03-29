//# sourceURL=J_Reactor_UI7.js
/**
 * J_Reactor_UI7.js
 * Configuration interface for Reactor master device
 *
 * Copyright 2018-2022 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. Use subject to license; please see
 * license details at https://www.toggledbits.com/static/reactor/docs/Installation#license-and-use-restrictions
 *
 */
/* globals api,jQuery,$,MultiBox */
/* jshint multistr: true */

//"use strict"; // fails on UI7, works fine with ALTUI

var Reactor = (function(api, $) {

	/* unique identifier for this plugin... */
	var uuid = '72acc6ea-f24d-11e8-bd87-74d4351650de';

	var pluginVersion = "3.11 (22314)";

	var _UIVERSION = 22314;     /* must coincide with Lua core */

	var _DOCURL = "https://www.toggledbits.com/static/reactor/docs/3.9/";
	var _FORUMURL = "https://community.getvera.com/c/plugins-and-plugin-development/reactor/178";

	var myModule = {};

	var serviceId = "urn:toggledbits-com:serviceId:Reactor";
	// unused: var deviceType = "urn:schemas-toggledbits-com:device:Reactor:1";
	var rsType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

	var dateFormat = "%F"; /* ISO8601 default */
	var timeFormat = "%T";
	var isOpenLuup = false;
	var isALTUI = false;
	var backupInfo = false;

	/* Quote string */
	function quot( s ) {
		return JSON.stringify( String(s) );
	}

	/* Remove special characters that disrupt JSON processing on Vera (dkjson 1.2 in particular */
	/* Ref http://dkolf.de/src/dkjson-lua.fsl/home (see 1.2 comments) */
	/* Ref https://docs.microsoft.com/en-us/openspecs/ie_standards/ms-es3/def92c0a-e69f-4e5e-8c5e-9f6c9e58e28b */
	function purify( s ) {
		return "string" !== typeof(s) ? s :
			s.replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, "");
			/* or... s.replace( /[\u007F-\uFFFF]/g, function(ch) { return "\\u" + ("0000"+ch.charCodeAt(0).toString(16)).substr(-4); } ) */
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

	/* Return a "safe" selector for ID passed */
	function idSelector( id ) {
		return String( id ).replace( /([^a-z0-9_-])/ig, "\\\1" );
	}

	/* Return footer */
	function footer() {
		var html = '';
		html += '<div class="clearfix">';
		html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
		html += '<div id="tbcopyright">Reactor ver ' + pluginVersion + ' &copy; 2018-2021 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>,' +
			' All Rights Reserved. Please check out the <a href="' + _DOCURL + '" target="_blank">online documentation</a>' +
			' and <a href="' + _FORUMURL + '" target="_blank">Vera Community Forum</a> for support. Double-ring spinner by <a href="https://loading.io/spinner/double-ring" target="_blank">loading.io</a>.</div>';
		html += '<div id="supportlinks">Support links: ' +
			' <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=debug" target="_blank">Toggle&nbsp;Debug</a>' +
			' &bull; <a href="/cgi-bin/cmh/log.sh?Device=LuaUPnP" target="_blank">Log&nbsp;File</a>' +
			' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=status" target="_blank">Plugin&nbsp;Status</a>' +
			' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=files" target="_blank">Plugin&nbsp;Files</a>' +
			' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=summary" target="_blank">Logic&nbsp;Summary</a>' +
			' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=clearstate" target="_blank">Clear&nbsp;Data</a>' +
			'</div>';
		return html;
	}

	function initModule( myid ) {
		myid = myid || api.getCpanelDeviceId();

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

		/* Go */
		isALTUI = "undefined" !== typeof(MultiBox) && null !== document.location.href.match( /id=lr_ALTUI/i );
		isOpenLuup = false;
		var dl = api.getListOfDevices();
		var n = dl.length;
		for ( var k=0; k<n; ++k ) {
			if ( "openLuup" === dl[ k ].device_type && "0" === String( dl[ k ].id_parent ) ) {
				isOpenLuup = k;
				break;
			}
		}
		console.log("isALTUI=", isALTUI,", isOpenLuup=", isOpenLuup);

		/* Try to establish date format */
		var ud = api.getUserData();
		dateFormat = "%F"; /* ISO8601 default */
		timeFormat = "%T";
		var cfd = parseInt( api.getDeviceState( myid, serviceId, "ForceISODateTime" ) || "0" );
		if ( isNaN(cfd) || 0 === cfd ) {
			console.log("initModule() configured date format " + String(ud.date_format) + " time " + String(ud.timeFormat));
			cfd = ud.date_format;
			if ( undefined !== cfd ) {
				dateFormat = cfd.replace( /yy/, "%Y" ).replace( /mm/, "%m" ).replace( /dd/, "%d" ).replace( "\\", "" );
				timeFormat = "24hr" !== ( ud.timeFormat || "24hr" ) ? "%I:%M:%S%p" : "%T";
			}
		}

		return true;
	}

	function updateBackupInfo() {
		jQuery( ".reactortab select#restoreitem option[value!='']" ).remove();
		jQuery( ".reactortab select#restoreitem,button#dorestore" ).prop( 'disabled', true );
		jQuery( ".reactortab div#restorestatus" ).empty().hide();
		jQuery( '.reactortab div#renameblock' ).hide();

		if ( backupInfo ) {
			var dt = ftime( backupInfo.timestamp * 1000, dateFormat + " " + timeFormat );
			var el = jQuery( ".reactortab #mostrecent" );
			el.empty().append( '<div class="lastbackup">Last backup date: ' + dt + '</div>' );
			var path = api.getDataRequestURL().replace( /data_request.*$/i, "" );
			el.append( '<div>' +
				'If you would like to keep a copy of this backup on your local storage or network, you can ' +
				'<a href="' + path +
				'reactor-config-backup.json" target="_blank">download the backup file</a> (tip: don\'t just click the link; right-click it and choose "Save link as...").</p>' +
				'</div>' );

			el = jQuery( ".reactortab select#restoreitem" );
			for ( var s in backupInfo.sensors ) {
				if ( backupInfo.sensors.hasOwnProperty( s ) ) {
					el.append( jQuery( '<option/>' ).val( s ).text( backupInfo.sensors[s].name ) );
				}
			}
			el.prop( 'disabled', false );
			el.val( "" );
			jQuery( ".reactortab button#dorestore" ).prop( 'disabled', false );

			var dl = api.cloneObject( api.getListOfDevices() );
			dl = dl.sort( function( a, b ) {
				if ( a.name.toLowerCase() === b.name.toLowerCase() ) {
					return a.id < b.id ? -1 : 1;
				}
				return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
			});

			el = jQuery( '.reactortab select#restoretarget' );
			for ( var k=0; k<dl.length; k++ ) {
				if ( dl[k].device_type == rsType ) {
					el.append( jQuery( '<option/>' ).val(dl[k].id).text(dl[k].name) );
				}
			}
			el.val("");
			el.prop( 'disabled', true ); /* Start disabled because restoreitem ALL is selected */

			jQuery( '.reactortab select#restoreitem' ).off( 'change.reactor' ).on( 'change.reactor', function() {
				var sel = jQuery( this ).val();
				var rt = jQuery( '.reactortab select#restoretarget' );
				if ( "" === sel ) {
					/* Restoring ALL */
					rt.val("");
					jQuery( '.reactortab div#renameblock' ).hide();
				} else {
					jQuery( '.reactortab div#renameblock' ).show();
				}
				rt.prop( 'disabled', ""===sel );
				/* ??? select matching name, disable default selection if matching device not found??? */
			});
		} else {
			jQuery( ".reactortab div#mostrecent" ).empty().text("No backup information available.");
		}
	}

	function reloadBackupInfo() {
		/* Load the backup data */
		jQuery( ".reactortab div#mostrecent" ).empty().html("<b>LOADING...</b>");
		console.log("Fetching backup data");
		jQuery.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "lr_Reactor",
				action: "getcurrentbackup"
			},
			dataType: "json",
			timeout: 10000
		}).done( function( data, statusText, jqXHR ) {
			if ( false === data.backupstatus ) {
				backupInfo = false;
			} else {
				backupInfo = data;
			}
			updateBackupInfo();
		}).fail( function( jqXHR, textStatus, errorThrown ) {
			// Bummer.
			console.log("Failed to load reactor-config-backup.json: " + textStatus + " " + String(errorThrown));
			console.log(jqXHR.responseText);
			backupInfo = false;
			updateBackupInfo();
			if ( jqXHR.status == 500 ) {
				jQuery( ".reactortab div#mostrecent" ).empty().html("<b>PLEASE WAIT... VERA BUSY... RETRYING...</b>");
				setTimeout( reloadBackupInfo, 1000 );
			} else if ( jqXHR.status == 404 ) {
				/* OK. */
				return;
			} else {
				var str = String(errorThrown) + "\n" + String(textStatus);
				for ( var k in jqXHR ) {
					if ( jqXHR.hasOwnProperty(k) && typeof(jqXHR[k]) != "function" ) {
						str += "\n" + k + '=' + String(jqXHR[k]);
					}
				}
				console.log( str );
			}
		});
	}

	function findDevice( name ) {
		var ud = api.getUserData();
		name = name.toLowerCase();
		for ( var k=0; k<ud.devices.length; ++k ) {
			if ( ud.devices[k].name.toLowerCase() == name ) {
				return ud.devices[k];
			}
		}
		return false;
	}

	function restore( item, dev, tries ) {
		if ( undefined === tries ) tries = 0;

		/* Write new (old/restored) config */
		/* Writing cdata restarts the sensor, so no explicit action call needed after. */
		var cdata = backupInfo.sensors[item].config;
		if ( undefined === cdata ) {
			var img = jQuery( '.reactortab div#restorestatus p#' + idSelector(item) + ' > img' );
			img.replaceWith( '<span> <b>FAILED!</b> No data.</span>' );
			return;
		}
		cdata.device = dev.id; /* Make sure device agrees with config (new target?) */
		var jsstr = JSON.stringify( cdata,
			function( k, v ) { return ( k.match( /^__/ ) || v === null ) ? undefined : purify(v); }
		);
		api.setDeviceStateVariablePersistent( dev.id, "urn:toggledbits-com:serviceId:ReactorSensor",
			"cdata", jsstr,
			{
				'onSuccess' : function() {
					if ( ! isALTUI ) { /* this makes ALTUI nuts, not sure why */
						api.setDeviceState( dev.id, "urn:toggledbits-com:serviceId:ReactorSensor",
							"cdata", jsstr ); /* force local/lu_status */
					}
					try {
						/* If specific restore item selected, also check rename option */
						var $ri = jQuery( '.reactortab select#restoreitem option:selected' );
						if ( 1 === $ri.length && "" !== $ri.val() && jQuery( '.reactortab input#renamers' ).prop( 'checked' ) ) {
							api.setDeviceAttribute( dev.id, 'name', $ri.text(), { persistent: true } );
						}
						jQuery( '.reactortab div#restorestatus p#' + idSelector(item) + ' > img' ).replaceWith( "<span> succeeded.</span>" );
					} catch(e) {
						jQuery( '.reactortab div#restorestatus p#' + idSelector(item) + ' > img' ).replaceWith( "<span> restore succeeded; name change failed.</span>" );
					}
				},
				'onFailure' : function() {
					try {
						var el = jQuery( '.reactortab div#restorestatus p#' + idSelector(item) + ' > img' );
						if ( tries < 12 ) {
							if ( 0 === tries ) {
								jQuery( "<span> waiting for Luup...</span>" ).insertBefore( el );
							} else {
								jQuery( "<span> &sdot;</span>" ).insertBefore( el );
							}
							setTimeout( function() { restore( item, dev, tries+1 ); }, 5000 );
						} else {
							el.replaceWith( '<b> FAILED!</b>' );
						}
					} catch(e) { console.log(String(e)); console.log(e.stack); }
				}
			}
		);
	}

	function handleRestoreClick( ev ) {
		if ( ! backupInfo ) {
			return;
		}
		jQuery( '.reactortab div#restorestatus' ).empty().show().append( '<p>Restore started at ' +
			ftime((new Date()).getTime(), dateFormat + " " + timeFormat ) + '</p>' );
		var selected = jQuery( '.reactortab select#restoreitem' ).val();
		for ( var item in backupInfo.sensors ) {
			if ( "" == selected || item == selected ) {
				var dev = jQuery( '.reactortab select#restoretarget' ).val();
				if ( "" === dev ) {
					/* Restore to original; find original device */
					dev = findDevice( backupInfo.sensors[item].name );
				} else {
					/* Restore to specific */
					dev = api.getDeviceObject( parseInt( dev ) );
				}
				if ( ! dev ) {
					jQuery( '.reactortab div#restorestatus' ).append( '<p id=' + quot(item) + '>Cannot restore ' +
						backupInfo.sensors[item].name + ' -- no device with matching name found.</p>' );
				} else if ( dev.device_type != rsType ) {
					jQuery( '.reactortab div#restorestatus' ).append( '<p id=' + quot(item) + '>Cannot restore ' +
						backupInfo.sensors[item].name + ' to device #' + dev.id +
						' -- device with that name is not a ReactorSensor.</p>' );
				} else {
					/* Writing cdata restarts the sensor, so no explicit action call needed */
					jQuery( '.reactortab div#restorestatus' ).append( '<p id=' + quot(item) + '>Restoring ' +
						backupInfo.sensors[item].name + ' configuration to device #' + String(dev.id) +
						' (' + String(dev.name) + ')... <img id="spinner" src="https://www.toggledbits.com/assets/reactor/spinner-animated.gif" alt="Busy... please wait" border="0"></p>' );

					/* Stop all running scenes on the target ReactorSensor */
					api.performActionOnDevice( dev.id,  "urn:toggledbits-com:serviceId:ReactorSensor",
						"StopScene", { actionArguments: { SceneNum: 0, contextDevice: dev.id } } );

					/* Erase its condition state */
					api.setDeviceStateVariablePersistent( dev.id, "urn:toggledbits-com:serviceId:ReactorSensor", "cstate", "{}" );

					restore( item, dev );
				}
			}
		}
		jQuery( '.reactortab div#restorestatus' ).append( '<p class="attn"><b>PLEASE NOTE!</b> A hard-refresh of your browser is required <i>after the restore completes</i>, or inconsistent/outdated configuration data may be displayed.</p>' );

		/* Erase global scene cache -- ??? we should do once per restore only */
		api.setDeviceStateVariablePersistent( api.getCpanelDeviceId(), serviceId, "scenedata", "{}" );
	}

	function handleBackupClick( ev ) {
		jQuery.ajax({
			url: api.getDataRequestURL(),
			data: {
				id: "lr_Reactor",
				action: "backup"
			},
			dataType: 'json'
		}).done( function( data, textStatus, jqXHR ) {
			if ( data.status ) {
				reloadBackupInfo();
			} else {
				alert( "The backup failed due to an error: " + String(data.message) );
			}
		}).fail( function( jqXHR, textStatus, errThrown ) {
			alert( "The backup request failed. Luup may be busy/reloading. Wait a moment, then try again." );
		});
	}

	function handleCreateRSClick( ev ) {
		var val = jQuery( '.reactortab select#countrs' ).val();
		api.performActionOnDevice( api.getCpanelDeviceId(),  "urn:toggledbits-com:serviceId:Reactor",
			"AddSensor",
			{
				actionArguments: { Count: val },
				onSuccess: function() {
					jQuery( '.reactortab button' ).prop( 'disabled', true );
					alert("Creating ReactorSensors. Please hard-refresh your browser now. Luup is now reloading.");
				},
				onFailure: function() {
					alert("The request failed. Luup may be busy/reloading. Wait a moment, then try again.");
				}
			}
		);
	}

	function doBackupRestore() {
		if ( ! initModule() ) {
			return;
		}

		try {

			/* Our styles. */
			var html = "<style>";
			html += 'div#tab-backup.reactortab div#restorestatus { border: 1px solid #666; border-radius: 8px; padding: 8px 8px; background-color: #eef; }';
			html += 'div#tab-backup.reactortab p.attn { color: #000; background-color: #ff0; }';
			html += 'div#tab-backup.reactortab div.lastbackup { font-weight: bold; color: #008040; }';
			html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
			html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
			html += "</style>";
			jQuery("head").append( html );

			/* Body content */
			html = '<div id="tab-backup" class="reactortab">';

			html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Backup and Restore</h3></div></div>';
			html += '<div class="row"><div class="col-xs-12 col-sm-12">You may back up your Reactor configuration here, or restore a previously backed-up configuration.</div></div>';

			html += '<div class="row">\
  <div class="col-xs-12 col-sm-12">\
	<h4>Most Recent Backup</h4>\
	<div id="mostrecent"></div>\
  </div>\
</div>';
			html += '<div class="row">\
  <div class="col-xs-12 col-sm-12">\
	<h4>Back Up Current Configuration</h4>\
	Press this button to back up your current Reactor configuration: <button id="dobackup" class="btn btn-sm btn-success">Back Up Now</button> \
  </div>\
</div>';
			html += '<div class="row">\
  <div class="col-xs-12 col-sm-12">\
	<h4>Restore from Backup</h4>\
	<p>Tip: Read the <a href="' +
				_DOCURL + 'Backup-&-Restore" target="_blank">online documentation</a>.</p>\
	<p>To restore from the current backup (info above), select the item to restore (or ALL to restore everything), and then press the \
	"Begin Restore" button. <b>WARNING:</b> Restoring will overwrite the configuration of any current ReactorSensor having the same \
	name(s). If you want to restore from another backup file (e.g. one you downloaded previously from this or another system), please \
	read the linked documentation above before proceeding.</p>\
	<div class="form-inline">\
	  <label>Restore: <select id="restoreitem" class="form-control form-control-sm" disabled><option value="">ALL</option></select></label>\
	  <label>to device: <select id="restoretarget" class="form-control form-control-sm" disabled><option value="">with matching name</option></select> \
	  <button id="dorestore" class="btn btn-sm btn-warning">Begin Restore</button>\
	</div>\
	<div id="renameblock">\
	  <label>\
		<input id="renamers" type="checkbox" class="form-checkbox form-checkbox-sm"> \
		Rename target ReactorSensor to match restored configuration\
	  </label>\
	</div>\
	<div id="restorestatus"></div>\
  </div>\
</div>';

			html += '<div class="row mt-3"> \
  <div class="col-xs-12 col-sm-12"> \
	<h3>Bulk Create New ReactorSensors</h3> \
	<div>To create multiple ReactorSensors at once, select the number of sensors and click "Create ReactorSensors". This operation causes a Luup reload, and you will need to hard-refresh your browser. \
	  <div class="form-inline"> \
		<label>Count: <select id="countrs" class="form-control form-control-sm"></select></label> \
		<button id="creaters" class="btn btn-sm btn-warning">Create ReactorSensors</button> \
	  </div> \
	</div>\
  </div>\
</div>';

			html += '</div>'; // .reactortab

			html += footer();

			api.setCpanelContent( html );

			jQuery( '.reactortab button#dobackup' ).on( 'click.reactor', handleBackupClick );
			jQuery( '.reactortab button#dorestore' ).on( 'click.reactor', handleRestoreClick );
			jQuery( '.reactortab div#renameblock' ).hide();

			var $el = jQuery( '.reactortab select#countrs' );
			for ( var k = 1; k <= 16; ++k ) {
				$el.append( jQuery( '<option/>' ).val( k ).text( k ) );
			}
			jQuery( '.reactortab button#creaters' ).on( 'click.reactor', handleCreateRSClick );

			reloadBackupInfo();
		}
		catch (e)
		{
			console.log( 'Error in Reactor.doBackupRestore(): ' + String( e ) );
			alert( e.stack );
		}
	}

	function doAbout() {
		if ( ! initModule() ) {
			return;
		}

		try {
			/* Our styles. */
			var html = "<style>";
			html += 'div#tab-about.reactortab div#restorestatus { border: 1px solid #666; border-radius: 8px; padding: 8px 8px; background-color: #eef; }';
			html += 'div#tab-about.reactortab p.attn { color: #000; background-color: #ff0; }';
			html += 'div#tab-about.reactortab div.lastbackup { font-weight: bold; color: #008040; }';
			html += 'div#tab-about.reactortab ul#re-releases { list-style: none; }';
			html += 'div#tab-about.reactortab span.re-rel-name { font-size: 1.5em; font-weight: bold; margin-left: 8px; }';
			html += 'div#tab-about.reactortab span.re-rel-status { margin-left: 8px; }';
			html += 'div#tab-about.reactortab div.re-rel-note { border: 2px solid #f80; padding: 8px 8px; }';
			html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
			html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
			html += "</style>";
			$("head").append( html );

			/* Body content */
			html = '<div id="tab-about" class="reactortab"></div>';
			html += footer();
			api.setCpanelContent( html );
			var $body = $( 'div#tab-about.reactortab' );

			$( '<h3></h3>' ).text( 'Reactor ' + pluginVersion ).appendTo( $body );
			$( '<div></div>' )
				.html( '&#169; 2018-2021 Patrick H. Rigney, All Rights Reserved<br/> \
The Reactor Plugin for Vera is a community-supported project. If you find Reactor useful, please consider \
making a donation via PayPal or crypto <a href="https://www.toggledbits.com/donate" target="_blank">here</a>. \
' )
				.appendTo( $body );

			if ( false === isOpenLuup ) {
				$( '<hr></hr>' ).appendTo( $body );
				var $list = $( '<ul id="re-releases"><li>Loading release information...</li></ul>' )
					.appendTo( $body );
				$.ajax({
					url: api.getDataRequestURL(),
					data: {
						id: "lr_Reactor",
						action: "updateplugin",
						r: Math.random()
					},
					dataType: "json",
					cache: false,
					timeout: 15000
				}).done( function( data ) {
					$list.empty();
					if ( data.status ) {
						data.data.forEach( function( rel ) {
							var pubtime = Date.parse( rel.published_at );
							if ( pubtime < 1600616760000 ) { // v3.8 2020-09-20T15:46:00Z
								return;
							}
							var $el = $( '<li></li>' ).attr( 'id', 're-rel-' + rel.id ).appendTo( $list );
							$( '<button class="btn btn-sm btn-success re-rel-install">Install</button>' ).appendTo( $el );
							$( '<span class="re-rel-name">name</span>' ).text( rel.name ).appendTo( $el );
							$( '<span class="re-rel-status"></span>').appendTo( $el );
							$( '<pre></pre>' ).text( rel.body ).appendTo( $el );
						});
						$( 'button.re-rel-install', $list ).on( 'click.reactor', function( event ) {
							var $el = $( event.currentTarget ).closest( 'li' );
							var rel = $el.attr( 'id' ).replace( /^re-rel-/, "" );
							$( 'button', $el ).prop( 'disabled', true );
							$( 'li', $list ).not( 'li#' + $el.attr( 'id' ) ).remove();
							$( '.re-rel-status', $el ).text( 'Installing... please wait...' );
							$.ajax({
								url: api.getDataRequestURL(),
								data: {
									id: "lr_Reactor",
									action: "updateplugin",
									release: rel,
									r: Math.random()
								},
								dataType: 'json',
								cache: false,
								timeout: 32000
							}).done( function( res ) {
								if ( res.status ) {
									$( '.re-rel-status', $el ).text( "" );
									$( 'pre', $el ).remove();
									$( '<div class="re-rel-note"><h4>Install Finalizing!</h4><p>The installation is finalizing \
	in the background with a Luup reload. You must now \
	<a href="https://www.howtogeek.com/672607/how-to-hard-refresh-your-web-browser-to-bypass-your-cache/" target="_blank">hard-refresh \
	your browser</a> to make sure that the correct UI implementation files load to match the installed Reactor core. Please do it now.</p>\
	</div>' )
										.appendTo( $el );
								} else {
									$( 'span.re-rel-status', $el ).css( 'color', 'red' ).text( 'Update failed; ' + res.message );
								}
							}).fail( function( jqXHR, textStatus, textM ) {
								console.log( jqXHR, textStatus, textM );
								$( 'span.re-rel-status', $el ).css( 'color', 'red' ).text( 'Update failed; try again later.' );
							});
						});
					} else {
						$list.text( 'Release information is not available right now; try again later. ' + data.message );
					}
				}).fail( function( /* jqXHR, textStatus, errorThrown */ ) {
					$list.empty().text( "Can't load release information. " );
				});
			}
		} catch( err ) {
			console.error( err );
		}
	}

	myModule = {
		uuid: uuid,
		doBackupRestore: doBackupRestore,
		doAbout: doAbout
	};
	return myModule;
})(api, $ || jQuery);
