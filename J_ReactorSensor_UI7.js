//# sourceURL=J_ReactorSensor_UI7.js
/**
 * J_ReactorSensor_UI7.js
 * Configuration interface for ReactorSensor
 *
 * Copyright 2018,2019 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 */
/* globals api,jQuery,$,unescape,MultiBox,ace */
/* jshint multistr: true */

//"use strict"; // fails on UI7, works fine with ALTUI

var ReactorSensor = (function(api, $) {

    /* unique identifier for this plugin... */
    var uuid = '21b5725a-6dcd-11e8-8342-74d4351650de';

    var pluginVersion = '2.4groupactions';

    var DEVINFO_MINSERIAL = 71.222;

    var CDATA_VERSION = 19051; /* must coincide with (Lua) loadSensorConfig! */

    var myModule = {};

    var serviceId = "urn:toggledbits-com:serviceId:ReactorSensor";
    // var deviceType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

    var iData = [];
    var roomsByName = [];
    var actions = {};
    var deviceInfo = {};
    var userIx = {};
    var configModified = false;
    var inStatusPanel = false;
    var isOpenLuup = false;
    // unused: isALTUI = undefined !== MultiBox;
    var lastx = 0;
    var condTypeName = { "service": "Service/Variable", "housemode": "House Mode", "comment": "Comment", "weekday": "Weekday",
        "sun": "Sunrise/Sunset", "trange": "Date/Time", "interval": "Interval", "ishome": "Geofence", "reload": "Luup Reloaded"
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
    var serviceOps = [ { op: '=', desc: 'equals', args: 1 }, { op: '<>', desc: 'not equals', args: 1 },
        { op: '<', desc: '<', args: 1, numeric: 1 }, { op: '<=', desc: '<=', args: 1, numeric: 1 },
        { op: '>', desc: '>', args: 1, numeric: 1 }, { op: '>=', desc: '>=', args: 1, numeric: 1 },
        { op: 'starts', desc: 'starts with', args: 1 }, { op: 'notstarts', desc: 'does not start with', args: 1 },
        { op: 'ends', desc: 'ends with', args: 1 }, { op: 'notends', desc: 'does not end with', args: 1 },
        { op: 'contains', desc: 'contains', args: 1 }, { op: 'notcontains', desc: 'does not contain', args: 1 },
        { op: 'in', desc: 'in', args: 1 }, { op: 'notin', desc: 'not in', args: 1 },
        { op: 'istrue', desc: 'is TRUE', args: 0 }, { op: 'isfalse', desc: 'is FALSE', args: 0 },
        { op: 'change', desc: 'changes', args: 2 }
    ];
    var noCaseOptPattern = /(=|<>|contains|notcontains|starts|notstarts|ends|notends|in|notin|change)/i;
    var serviceOpsIndex = {};

    var varRefPattern = /^\{[^}]+\}\s*$/;

    var msgUnsavedChanges = "You have unsaved changes! Press OK to save them, or Cancel to discard them.";
    var msgGroupNormal = "Normal; click for inverted (false when all conditions are met)";
    var msgGroupInvert = "Inverted; click for normal (true when all conditions are met)";
    var msgGroupIdChange = "Click to change group ID";

    function TBD( ev ) { alert( String(ev) ); } /* receiver for handlers yet to be written ??? */

    /* Return footer */
    function footer() {
        var html = '';
        html += '<div class="clearfix">';
        html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
        html += '<div id="tbcopyright">Reactor ver ' + pluginVersion + ' &copy; 2018,2019 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>,' +
            ' All Rights Reserved. Please check out the <a href="https://github.com/toggledbits/Reactor/wiki" target="_blank">online documentation</a>' +
            ' and <a href="http://forum.micasaverde.com/index.php/board,93.0.html" target="_blank">forum board</a> for support.</div>';
        try {
            html += '<div id="browserident">' + navigator.userAgent + '</div>';
        } catch( e ) {}

        return html;
    }

    /* Create an ID that's functionally unique for our purposes. */
    function getUID( prefix ) {
        /* Not good, but good enough. */
        var newx = Date.now() - 1529298000000;
        if ( newx == lastx ) ++newx;
        lastx = newx;
        return ( prefix === undefined ? "" : prefix ) + newx.toString(36);
    }

    function isEmpty( s ) {
        return s === undefined || s === "" || s.match( /^\s*$/ );
    }

    function quot( s ) {
        return JSON.stringify( s );
    }

    function idSelector( id ) {
        return id.replace( /([^A-Z0-9_])/ig, "\\$1" );
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

    function getDeviceFriendlyName( dev ) {
        var devobj = api.getDeviceObject( dev );
        if ( undefined === devobj || false === devobj ) {
            console.log( "getDeviceFriendlyName() dev=(" + typeof(dev) + ")" + String(dev) + ", devobj=(" + typeof(devobj) + ")" + String(devobj) + ", returning false" );
            return false;
        }
        return String(devobj.name) + " (#" + String(devobj.id) + ")";
    }

    /* Get parent state */
    function getParentState( varName ) {
        var me = api.getDeviceObject( api.getCpanelDeviceId() );
        return api.getDeviceState( me.id_parent || me.id, "urn:toggledbits-com:serviceId:Reactor", varName );
    }

    /* Load configuration data. */
    function loadConfigData( myid ) {
        var upgraded = false;
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
                version: CDATA_VERSION,
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
                for (var ix=0; ix<cdata.conditions.length; ix++ ) {
                    var grp = cdata.conditions[ix];
                    root.conditions[ix] = { id: grp.groupid || ix, name: grp.name || grp.groupid, operator: "and" }; /* AND within groups */
                    root.conditions[ix].conditions = grp.groupconditions || [];
                }
            }
            cdata.conditions = { root: root };
        }

        /* Keep version on config as highest that has edited it. */
        if ( ( cdata.version || 0 ) < CDATA_VERSION ) {
            cdata.version = CDATA_VERSION;
        }
        cdata.device = myid;
        if ( upgraded ) {
            /* Write updated config. We don't care if it fails, as nothing we can't redo would be lost. */
            console.log('Re-writing upgraded config data');
            api.setDeviceStateVariablePersistent( myid, serviceId, "cdata",
                JSON.stringify( cdata, function( k, v ) { return k.match( /^__/ ) ? undefined : v; } )
            );
        }

        iData[ myid ] = { cdata: cdata };

        configModified = false;
        return cdata;
    }

    function getInstanceData( myid ) {
        myid = myid || api.getCpanelDeviceId();
        iData[ myid ] = iData[ myid ] || {};
        return iData[ myid ];
    }

    function setInstanceData( key, data, myid ) {
        myid = myid || api.getCpanelDeviceId();
        iData[ myid ] = iData[ myid ] || {};
        iData[ myid ][ key ] = data;
    }

    function getConfiguration( myid ) {
        var d = getInstanceData( myid );
        if ( ! d.cdata ) {
            loadConfigData( myid );
        }
        return d.cdata;
    }

    /* Initialize the module */
    function initModule( myid ) {
        myid = myid || api.getCpanelDeviceId();
        console.log("initModule() for device " + myid);
        var devices = api.cloneObject( api.getListOfDevices() );

        /* Load ACE. Since the jury is still out with LuaView on this, default is no
           ACE for now. As of 2019-01-06, one user has reported that ACE does not function
           on Chrome Mac (unknown version, but does function with Safari and Firefox on Mac).
           That's just one browser, but still... */
        var s = getParentState( "UseACE" ) || "";
        if ( "1" === s && ! window.ace ) {
            s = getParentState( "ACEURL" ) || "https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.2/ace.js";
            jQuery( "head" ).append( '<script src="' + s + '"></script>' );
        }

        actions = {};

        /* Instance data */
        iData[myid] = {};

        /* Force this false every time, and make the status panel change it. */
        inStatusPanel = false;

        /* Get the config and parse it */
        getConfiguration( myid );

        /* Make our own list of devices, sorted by room, and alpha within room. */
        var rooms = [];
        var noroom = { "id": 0, "name": "No Room", "devices": [] };
        rooms[noroom.id] = noroom;
        var dd = devices.sort( function( a, b ) {
            if ( a.id == myid ) return -1;
            if ( b.id == myid ) return 1;
            if ( a.name.toLowerCase() === b.name.toLowerCase() ) {
                return a.id < b.id ? -1 : 1;
            }
            return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
        });
        for (var i=0; i<dd.length; i+=1) {
            var devobj = dd[i];
            /* Detect openLuup while we're at it */
            if ( "openLuup" === devobj.device_type ) {
                isOpenLuup = true;
            }

            var roomid = devobj.room || 0;
            var roomObj = rooms[roomid];
            if ( undefined === roomObj ) {
                roomObj = api.cloneObject( api.getRoomObject(roomid) );
                roomObj.devices = [];
                rooms[roomid] = roomObj;
            }
            roomObj.devices.push( devobj.id );
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

        serviceOpsIndex = {};
        for ( var ix=0; ix<serviceOps.length; ix++ ) {
            serviceOpsIndex[serviceOps[ix].op] = serviceOps[ix];
        }

        var ud = api.getUserData();
        userIx = {};
        for ( ix=0; ix<(ud.users || []).length; ++ix ) {
            userIx[ud.users[ix].id] = { name: ud.users[ix].Name || ud.users[ix].id };
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

        api.registerEventHandler('on_ui_cpanel_before_close', ReactorSensor, 'onBeforeCpanelClose');
    }

    function textDateTime( y, m, d, hh, mm, isEnd ) {
        hh = parseInt( hh || "0" );
        mm = parseInt( mm || "0" );
        var tstr = ( hh < 10 ? '0' : '' ) + hh + ':' + ( mm < 10 ? '0' : '' ) + mm;
        if ( isEmpty( m ) ) {
            return tstr;
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
        var ago = Math.floor( ( Date.now() - dtms ) / 1000 );
        if ( ago < 86400 ) {
            return new Date(dtms).toLocaleTimeString();
        }
        return new Date(dtms).toLocaleString();
    }

    /**
     * Attempt to remove variables that are no longer used.
     */
    function clearUnusedVariables() {
        var myid = api.getCpanelDeviceId();
        var ud = api.getUserData();
        var dx = api.getDeviceIndex( myid );
        var deleted = {};
        var configVars = iData[myid].cdata.variables || {};
        for ( var k=0; k<(ud.devices[dx].states || []).length; ++k) {
            var state = ud.devices[dx].states[k];
            if ( state.service.match( /:ReactorValues$/i ) ) {
                if ( state.variable.match( /_Error$/i ) ) {
                    if ( undefined === configVars[ state.variable.replace( /_Error$/i, "" ) ] ) {
                        deleted[state.variable] = state;
                    }
                } else if ( undefined === configVars[state.variable] ) {
                    deleted[state.variable] = state;
                }
            }
        }
        for ( var vn in deleted ) {
            if ( deleted.hasOwnProperty( vn ) ) {
                console.log("Removing unused state variable for deleted expression " + vn);
                $.ajax({
                    url: api.getDataRequestURL(),
                    data: {
                        id: "variableset",
                        DeviceNum: myid,
                        serviceId: deleted[vn].service,
                        Variable: vn,
                        Value: ""
                    }
                }).done( function( data, statusText, jqXHR ) {
                    /* nothing */
                });
            }
        }
    }

    /**
     * Handle save click: save the current configuration.
     */
    function handleSaveClick( ev, fnext, fargs ) {
        var myid = api.getCpanelDeviceId();
        var cdata = getConfiguration( myid );

        /* Save to persistent state */
        cdata.timestamp = Math.floor( Date.now() / 1000 );
        api.setDeviceStateVariablePersistent( myid, serviceId, "cdata",
            JSON.stringify( cdata, function( k, v ) { return k.match( /^__/ ) ? undefined : v; } ),
            {
                'onSuccess' : function() {
                    configModified = false;
                    if ( undefined !== fnext ) {
                        fnext.apply( null, fargs );
                    }
                    configModified = false;
                    updateSaveControls();
                    clearUnusedVariables();
                },
                'onFailure' : function() {
                    alert('There was a problem saving the configuration. Vera/Luup may have been restarting. Please try hitting the "Save" button again.');
                    configModified = true;
                    if ( undefined !== fnext ) {
                        fnext.apply( null, fargs );
                    }
                    updateSaveControls();
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

        getConfiguration();
        configModified = false;

        /* Be careful about which tab we're on here. */
        /* ??? when all tabs are modules, module.redraw() is a one-step solution */
        var ctx = jQuery( ev.currentTarget ).closest('div.reactortab').attr('id');
        if ( ctx === "tab-vars" ) {
            redrawVariables();
        } else if ( ctx === "tab-conds" ) {
            CondBuilder.redraw();
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

    function conditionValueText( v ) {
        if ( "number" === typeof(v) ) return v;
        v = String(v);
        if ( v.match( varRefPattern ) ) return v;
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
                str += ' ' + cond.variable;
                t = serviceOpsIndex[cond.operator || ""];
                if ( undefined === t ) {
                    str += ' ' + cond.operator + '?' + cond.value;
                } else {
                    str += ' ' + (t.desc || t.op);
                    if ( undefined === t.args || t.args > 0 ) {
                        if ( "change" == t.op ) {
                            k = ( cond.value || "" ).split( /,/ );
                            if ( k.length > 0 && k[0] !== "" ) {
                                str += " from " + conditionValueText( k[0] );
                            }
                            if ( k.length > 1 && k[1] !== "" ) {
                                str += " to " + conditionValueText( k[1] );
                            }
                        } else {
                            str += ' ' + conditionValueText( cond.value );
                        }
                    }
                }
                if ( ( cond.operator || "=" ).match( noCaseOptPattern ) &&
                        coalesce( cond.nocase, 1 ) == 0 ) {
                    str += ' (match case)';
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
    function makeDeviceMenu( val, name ) {
        val = val || "";
        var el = jQuery('<select class="devicemenu form-control form-control-sm"></select>');
        roomsByName.forEach( function( roomObj ) {
            var first = true; /* per-room first */
            for ( var j=0; j<roomObj.devices.length; j++ ) {
                var devid = roomObj.devices[j];
                if ( first ) {
                    el.append( jQuery( '<option class="optheading" disabled/>' ).val("").text( "--" + roomObj.name + "--" ) );
                    first = false;
                }
                var fn = getDeviceFriendlyName( devid );
                if ( !fn ) console.log( "makeDeviceMenu() friendly name for (" + typeof(devid) + ")" + String(devid) + "=" + String(fn));
                el.append( jQuery( '<option/>' ).val( devid ).text( fn ? fn : '#' + String(devid) + '?' ) );
            }
        });

        if ( false && jQuery( 'option[value="0"]', el).length == 0 ) {
            el.prepend( jQuery( '<option/>' ).val( "0" ).text( "Gateway/Controller" ) );
        }

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
        jQuery('button#saveconf').prop('disabled', ! ( configModified && errors.length === 0 ) );
        jQuery('button#revertconf').prop('disabled', !configModified);
    }

/** ***************************************************************************
 *
 * S T A T U S
 *
 ** **************************************************************************/

    function showGroupStatus( grp, container, cstate, parentGroup ) {
        var grpel = jQuery( '\
<div class="reactorgroup"> \
  <div class="grouptitle"><button class="btn condbtn"/><span id="titletext">??</span></div> \
  <div class="grpbody"> \
    <div class="grpcond"/> \
  </div> \
</div>' );

        var title = 'Group: ' + (grp.name || grp.id ) + ( grp.invert ? " (inverted)" : "" ) +
            ( grp.disabled ? " (disabled)" : "" ) + " <" + grp.id + ">";
        jQuery( 'span#titletext', grpel ).text( title );
        jQuery( '.condbtn', grpel ).text( (grp.invert ? "NOT " : "") + (grp.operator || "and" ).toUpperCase() );

        /* Highlight groups that are "true" */
        if ( grp.disabled ) {
            grpel.addClass( 'groupdisabled' );
        } else {
            var gs = cstate[ grp.id ] || {};
            jQuery( 'span#titletext', grpel).append( ' - ' +
                ( gs.evalstate ? 'TRUE' : 'false' ) +
                ' since ' + shortLuaTime( gs.evalstamp || 0 ) );
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
                switch ( cond.type ) {
                    case 'service':
                        if ( ( cond.repeatcount || 0 ) > 1 ) {
                            condDesc += " repeats " + cond.repeatcount +
                                " times within " + ( cond.repeatwithin || 60 ) + " secs";
                        } else if ( ( cond.duration || 0 ) > 0 ) {
                            condDesc += " for " +
                                ( cond.duration_op === "lt" ? "less than " : "at least " ) +
                                cond.duration + " secs";
                        }
                        if ( ( cond.latch || 0 ) != 0 ) {
                            condDesc += " (latching)";
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
                if ( cond.after !== undefined ) {
                    condDesc += ' (' +
                        ( (cond.aftertime||0) > 0 ? 'within ' + cond.aftertime + ' secs ' : '' ) +
                        'after ' + makeConditionDescription( iData[pdev].ixCond[cond.after] ) +
                        ')';
                }

                row.append( jQuery( '<button class="btn condbtn" />' ).text( '=' ) );
                row.append( jQuery( '<div class="condtext" />' ).text( condType + ': ' + condDesc ) );

                /* Append current value and condition state */
                var el = jQuery( '<div class="currentvalue" />' );
                row.append( el );

                if ( cond.type !== "comment" && undefined !== currentValue ) {
                    var cs = cstate[cond.id] || {};
                    el.text( '(' + String(currentValue) + ') ' +
                        ( cs.laststate ? "true" : "false" ) +
                        ' as of ' + shortLuaTime( cs.statestamp ) +
                        ( ( cond.latch || false ) && cs.evalstate && !cs.laststate ? " (latched true)" : "" )
                    );
                    if ( "service" === cond.type && ( cond.repeatcount || 0 ) > 1 ) {
                        if ( cs.repeats !== undefined && cs.repeats.length > 1 ) {
                            var dtime = cs.repeats[ cs.repeats.length - 1 ] - cs.repeats[0];
                            el.append( " (last " + cs.repeats.length + " span " + dtime + " secs)" );
                        }
                    }
                    if ( cs.evalstate ) {
                        row.addClass( "truecond" ).removeClass("falsecond");
                    } else {
                        row.addClass( "falsecond" ).removeClass("truecond");
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
        stel.empty();

        var cdata = getConfiguration( pdev );
        if ( undefined === cdata ) {
            console.log("cdata unavailable");
            return;
        }

        var s = api.getDeviceState( pdev, serviceId, "cstate" ) || "";
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
                if ( i1 === i2 ) return 0; // ??? fix both to sort by name secondarily
                return ( i1 < i2 ) ? -1 : 1;
            });
            var grpel = jQuery( '<div class="reactorgroup" id="variables"/>' );
            grpel.append( '<div class="row"><div id="vartitle" class="grouptitle col-xs-12">Expressions</div></div>' );
            for ( var ix=0; ix<vix.length; ix++ ) {
                var vd = vix[ix];
                el = jQuery( '<div class="row var" />' ).attr( 'id', vd.name );
                var vv = ((cstate.vars || {})[vd.name] || {}).lastvalue || "(undefined)"
                if ( typeof(vv) == "object" && vv.__type == "null" ) {
                    vv = "(null)";
                } else {
                    try {
                        vv = JSON.stringify(vv);
                    } catch( e ) {
                        vv = String( vv );
                    }
                }
                var ve = ((cstate.vars || {})[vd.name] || {}).err || ""
                el.append( jQuery('<div class="col-sm-6 col-md-2" />').text(vd.name) );
                el.append( jQuery('<div class="col-sm-12 col-md-7 tb-sm" />').text(vd.expression) );
                el.append( jQuery('<div class="col-sm-6 col-md-3" />').text( "" !== ve ? ve : vv ) );
                grpel.append( el );
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

        initModule();

        /* Our styles. */
        var html = "<style>";
        html += 'div#reactorstatus div.reactorgroup { position: relative; border-radius: 4px; border: 1px solid #006040; margin: 0 4px 8px 0; }';
        html += 'div#reactorstatus div.reactorgroup.groupdisabled * { background-color: #ccc !important; color: #000 !important }';
        html += 'div#reactorstatus div.reactorgroup .row { margin-right: 0px; margin-left: 0px; }';
        html += 'div#reactorstatus div.grouptitle { background-color: #003399; min-height: 1.5em; border-bottom: 1px solid black; }';
        html += 'div#reactorstatus div.grouptitle span#titletext { color: #fff; margin-left: 1em; }';
        html += 'div#reactorstatus div.grpbody { position: relative; padding: 10px 0; background-color: #fff; }';
        html += 'div#reactorstatus .cond { position: relative; margin: 4px 0; padding: 0; border-radius: 4px; border: 1px solid #0c6099; background: #fff; }';
        html += '.grpcond { list-style: none; padding: 0 0 0 20px; margin: 0 4px 0 0; }';
        html += 'div#reactorstatus div.condtext, div.currentvalue { display: inline-block; margin-left: 1em; }';
        html += 'div#reactorstatus button.condbtn { background-color: #bce8f1; width: 5em; border: none; padding: 6px 6px; }';
        html += 'div#reactorstatus div.reactorgroup.truestate > .grouptitle > .condbtn { background-color: #00aa00; color: black; }';

        // html += '.grpcond > *::before, .grpcond > *::after { content: "";  position: absolute; left: -12px; width: 12px; height: calc(50% + 6px); border-color: #333333; border-style: solid; }';
        html += '.grpcond > *::before, .grpcond > *::after { content: "";  position: absolute; left: -12px; width: 12px; height: calc(100%); border-color: #333333; border-style: solid; }';
        // html += '.grpcond > *::before { top: -6px; border-width: 0 0 2px 2px; }';
        html += '.grpcond > *::before { top: calc(100% * -1 + 16px); border-width: 0 0 2px 2px; }';
        // html += '.grpcond > *::after { top: 50%; border-width: 0 0 0 2px; }';
        html += '.grpcond > *::after { top: 0; border-width: 0 0 0 2px; }';
        // html += '.grpcond > *:first-child::before { top: -12px; height: calc(50% + 14px); }';
        html += '.grpcond > *:first-child::before { top: -12px; height: 30px; }';
        html += '.grpcond > *:last-child::before {  border-radius: 0 0 0 4px; }';
        html += '.grpcond > *:last-child::after { display: none; }';

        html += 'div#reactorstatus div#vartitle { background-color: #444444; }';
        html += 'div#reactorstatus .row.cond { min-height: 2em; }';
        html += 'div#reactorstatus .row.var { min-height: 2em; color: #003399; }';
        // html += 'div#reactorstatus div.reactorgroup.truestate > .grouptitle { background-color: #008030; font-weight: bold; }';
        // html += 'div#reactorstatus div.reactorgroup.truestate > .grpbody { background-color: #d2ffd2; }';
        html += 'div#reactorstatus .tb-sm { font-family: Courier,Courier New,monospace; font-size: 0.9em; }';
        html += 'div#reactorstatus div.truecond { color: #00aa00; font-weight: bold; }';
        html += 'div#reactorstatus div.truecond > .condbtn { background-color: #00aa00; color: black; }';
        html += 'div#reactorstatus div.falsecond { color: #000000; }';
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
            var $el = jQuery( 'div#' + idSelector( grp.id ) + '.cond-group-container' ).children( 'div.cond-group-body' ).children( 'div.cond-list' );
            var ixCond = getInstanceData().ixCond;
            var ix = 0;
            $el.children().each( function() {
                var id = jQuery( this ).attr( 'id' );
                var obj = ixCond[ id ];
                obj.__index = ix++;
            });
        }

        /**
         * Remove all properies on condition except those in the exclusion list.
         * The id and type properties are always preserved.
         */
        function removeConditionProperties( cond, excl ) {
            var elist = (excl || "").split(/,/);
            var emap = { id: true, type: true }; /* never remove these */
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
            var devobj = api.getDeviceObject( device );
            if ( devobj ) {
                var mm = {}, ms = [];
                for ( var k=0; k<( devobj.states || []).length; ++k ) {
                    var st = devobj.states[k];
                    if ( undefined === st.variable || undefined === st.service ) continue;
                    /* For self-reference, only allow variables created from configured expressions */
                    if ( device == myid && st.service != "urn:toggledbits-com:serviceId:ReactorValues" ) continue;
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
            var el = jQuery('<select class="opmenu form-control form-control-sm pull-left"></select>');
            el.append( '<option value="bet">between</option>' );
            el.append( '<option value="nob">not between</option>' );

            if ( undefined !== cond ) {
                el.val( cond );
            }
            return el;
        }

         /**
         * Update controls for current conditions.
         */
        function updateControls() {
            /* Disable all "Add Condition" buttons if any condition type menu
               has no selection. */
            var nset = jQuery('select.condtype option[value=""]:selected').length > 0;

            /* ... or if any group has no conditions */
            nset = nset || jQuery( 'div.condlist:empty' ).length > 0;

            /* Disable "Add" buttons while the condition is true. */
            jQuery('button#addcond').prop('disabled', nset );
            jQuery('button#addgroup').prop('disabled', nset );

            updateSaveControls();
        }

        /**
         * Update row structure from current display data.
         */
        function updateConditionRow( $row, target ) {
            var condId = $row.attr("id");
            var cond = getInstanceData().ixCond[ condId ];
            var typ = jQuery("select.condtype", $row).val() || "";
            cond.type = typ;
            jQuery('.tberror', $row).removeClass('tberror');
            $row.removeClass('tberror');
            var val, res;
            switch (typ) {
                case "":
                    jQuery( 'select.condtype', $row ).addClass( 'tberror' );
                    break;

                case 'group':
                    removeConditionProperties( cond, 'conditions,operator,invert,disabled' );
                    if ( ( cond.conditions || [] ).length == 0 ) {
                        $row.addClass( 'tberror' );
                    }
                    break;

                case 'comment':
                    removeConditionProperties( cond, "comment" );
                    cond.comment = jQuery("div.params input", $row).val();
                    break;

                case 'service':
                    var n;
                    removeConditionProperties( cond, "device,devicename,service,variable,operator,value,duration,duration_op,after,aftertime,repeatcount,repeatwithin,latch,nocase" );
                    cond.device = parseInt( jQuery("div.params select.devicemenu", $row).val() );
                    cond.service = jQuery("div.params select.varmenu", $row).val() || "";
                    cond.variable = cond.service.replace( /^[^\/]+\//, "" );
                    cond.service = cond.service.replace( /\/.*$/, "" );
                    cond.operator = jQuery("div.params select.opmenu", $row).val() || "=";
                    if ( cond.operator.match( noCaseOptPattern ) ) {
                        /* Case-insensitive is the default */
                        n = ( jQuery( 'input#nocase', $row ).prop( 'checked' ) || false ) ? 0 : 1;
                        if ( n !== cond.nocase ) {
                            cond.nocase = ( 0 === n ) ? 0 : undefined;
                            configModified = true;
                        }
                    }
                    var op = serviceOpsIndex[cond.operator || ""];
                    jQuery( "input#value", $row ).css( "visibility", ( undefined !== op && 0 === op.args ) ? "hidden" : "visible" );
                    // use op.args???
                    if ( "change" == cond.operator ) {
                        // Join simple two value list, but don't save "," on its own.
                        cond.value = jQuery( 'input#val1', $row ).val() || "";
                        val = jQuery( 'input#val2', $row ).val();
                        if ( ! isEmpty( val ) ) {
                            cond.value += "," + val;
                        }
                    } else {
                        cond.value = jQuery("input#value", $row).val() || "";
                    }
                    /* For numeric op, check that value is parseable as a number (unless var ref) */
                    if ( op && op.numeric && ! cond.value.match( varRefPattern ) ) {
                        n = parseFloat( cond.value );
                        if ( isNaN( n ) ) {
                            jQuery( 'input#value', $row ).addClass( 'tberror' );
                        }
                    }

                    /* If condition options are open, check them, too. */
                    if ( jQuery( 'div.condopts', $row ).length > 0 ) {

                        /* Predecessor condition (sequencing) */
                        var $pred = jQuery( 'select#pred', $row );
                        if ( isEmpty( $pred.val() ) ) {
                            if ( undefined !== cond.after ) {
                                delete cond.after;
                                delete cond.aftertime;
                                configModified = true;
                            }
                        } else {
                            var pt = parseInt( jQuery('input#predtime', $row).val() );
                            if ( isNaN( pt ) || pt < 0 ) {
                                pt = 0;
                                jQuery('input#predtime', $row).val(pt);
                            }
                            if ( cond.after !== $pred.val() || cond.aftertime !== pt ) {
                                cond.after = $pred.val();
                                cond.aftertime = pt;
                                configModified = true;
                            }
                        }

                        /* Repeats */
                        var $rc = jQuery('input#rcount', $row);
                        if ( isEmpty( $rc.val() ) || $rc.prop('disabled') ) {
                            jQuery('input#duration', $row).prop('disabled', false);
                            jQuery('select#durop', $row).prop('disabled', false);
                            jQuery('input#rspan', $row).val("").prop('disabled', true);
                            if ( undefined !== cond.repeatcount ) {
                                delete cond.repeatcount;
                                delete cond.repeatwithin;
                                configModified = true;
                            }
                        } else {
                            n = getInteger( $rc.val() );
                            if ( isNaN( n ) || n < 2 ) {
                                $rc.addClass( 'tberror' );
                            } else if ( n > 1 ) {
                                $rc.removeClass( 'tberror' );
                                if ( n != cond.repeatcount ) {
                                    cond.repeatcount = n;
                                    delete cond.duration;
                                    delete cond.duration_op;
                                    configModified = true;
                                }
                                jQuery('input#duration', $row).val("").prop('disabled', true);
                                jQuery('select#durop', $row).val("ge").prop('disabled', true);
                                jQuery('input#rspan', $row).prop('disabled', false);
                                if ( jQuery('input#rspan', $row).val() === "" ) {
                                    jQuery('input#rspan', $row).val( "60" );
                                    cond.repeatwithin = 60;
                                    configModified = true;
                                }
                            }
                        }
                        var $rs = jQuery('input#rspan', $row);
                        if ( ! $rs.prop('disabled') ) {
                            var rspan = getInteger( $rs.val() );
                            if ( isNaN( rspan ) || rspan < 1 ) {
                                $rs.addClass( 'tberror' );
                            } else {
                                $rs.removeClass( 'tberror' );
                                if ( rspan !== ( cond.repeatwithin || 0 ) ) {
                                    cond.repeatwithin = rspan;
                                    configModified = true;
                                }
                            }
                        }

                        /* Duration */
                        var $dd = jQuery('input#duration', $row);
                        if ( isEmpty( $dd.val() ) || $dd.prop('disabled') ) {
                            jQuery('input#rcount', $row).prop('disabled', false);
                            // jQuery('input#rspan', $row).prop('disabled', false);
                            if ( undefined !== cond.duration ) {
                                delete cond.duration;
                                delete cond.duration_op;
                                configModified = true;
                            }
                        } else {
                            var dur = getInteger( $dd.val() );
                            if ( isNaN( dur ) || dur < 0 ) {
                                $dd.addClass('tberror');
                            } else {
                                $dd.removeClass('tberror');
                                jQuery('input#rcount', $row).val("").prop('disabled', true);
                                // jQuery('input#rspan', $row).val("").prop('disabled', true);
                                delete cond.repeatwithin;
                                delete cond.repeatcount;
                                if ( (cond.duration||0) !== dur ) {
                                    /* Changed */
                                    if ( dur === 0 ) {
                                        delete cond.duration;
                                        delete cond.duration_op;
                                        jQuery('input#rcount', $row).prop('disabled', false);
                                        // jQuery('input#rspan', $row).prop('disabled', false);
                                    } else {
                                        cond.duration = dur;
                                        cond.duration_op = jQuery('select#durop', $row).val() || "ge";
                                    }
                                    configModified = true;
                                }
                            }
                        }

                        /* Latching */
                        var latchval = jQuery('input#latchcond', $row).prop('checked') ? 1 : 0;
                        if ( latchval != ( cond.latch || 0 ) ) {
                            /* Changed. Don't store false, just remove key */
                            if ( 0 !== latchval ) {
                                cond.latch = latchval;
                            } else {
                                delete cond.latch;
                            }
                            configModified = true;
                        }
                    }
                    break;

                case 'weekday':
                    removeConditionProperties( cond, "operator,value" );
                    cond.operator = jQuery("div.params select.wdcond", $row).val() || "";
                    res = [];
                    jQuery("input#opts:checked", $row).each( function( ix, control ) {
                        res.push( control.value /* DOM element */ );
                    });
                    cond.value = res.join( ',' );
                    break;

                case 'housemode':
                    removeConditionProperties( cond, "operator,value" );
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
                        jQuery("input#opts:checked", $row).each( function( ix, control ) {
                            res.push( control.value /* DOM element */ );
                        });
                        cond.value = res.join( ',' );
                    }
                    break;

                case 'trange':
                    /* Pre-sanity check */
                    if ( typ === "trange" && target !== undefined && target.hasClass('year') ) {
                        var pdiv = target.closest('div');
                        var newval = target.val().trim();
                        /* Vera's a 32-bit system, so date range is bound to MAXINT32 (2038-Jan-19 03:14:07 aka Y2K38) */
                        if ( newval != "" && ( (!newval.match( /^[0-9]+$/ )) || newval < 1970 || newval > 2037 ) ) {
                            target.addClass( 'tberror' );
                        } else {
                            var losOtros;
                            if ( pdiv.hasClass('start') ) {
                                losOtros = jQuery('div.end input.year', $row);
                            } else {
                                losOtros = jQuery('div.start input.year', $row);
                            }
                            if ( newval === "" && losOtros.val() !== "" ) {
                                losOtros.val("");
                            } else if ( newval !== "" && losOtros.val() === "" ) {
                                losOtros.val(newval);
                            }
                        }
                    }
                    /* Fetch and load */
                    cond.operator = jQuery("div.params select.opmenu", $row).val() || "bet";
                    res = [];
                    var mon = jQuery("div.start select.monthmenu", $row).val();
                    if ( ! isEmpty( mon ) ) {
                        res.push( jQuery("div.start input.year", $row).val() || "" );
                        res.push( jQuery("div.start select.monthmenu", $row).val() || "" );
                        res.push( jQuery("div.start select.daymenu", $row).val() || "1" );
                    } else {
                        Array.prototype.push.apply( res, ["","",""] );
                    }
                    res.push( jQuery("div.start select.hourmenu", $row).val() || "0" );
                    res.push( jQuery("div.start select.minmenu", $row).val() || "0" );
                    if ( cond.operator === "before" || cond.operator === "after" ) {
                        Array.prototype.push.apply( res, ["","","","",""] );
                    } else {
                        jQuery('div.end', $row).show();
                        if ( ! isEmpty( mon ) ) {
                            res.push( jQuery("div.end input.year", $row).val() || "" );
                            res.push( jQuery("div.end select.monthmenu", $row).val() || "" );
                            res.push( jQuery("div.end select.daymenu", $row).val() || "1" );
                        } else {
                            Array.prototype.push.apply( res, ["","",""] );
                        }
                        res.push( jQuery("div.end select.hourmenu", $row).val() || "0" );
                        res.push( jQuery("div.end select.minmenu", $row).val() || "0" );
                    }
                    cond.value = res.join(',');
                    if ( typ === "trange" ) {
                        jQuery('.datespec', $row).prop('disabled', res[1]==="");
                        if ( cond.operator !== "bet" && cond.operator !== "nob" ) {
                            jQuery('div.end', $row).hide();
                        } else {
                            jQuery('div.end', $row).show();
                        }
                    }
                    break;

                case 'sun':
                    removeConditionProperties( cond, "operator,value" );
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
                        jQuery( 'div.end', $row ).show();
                        whence = jQuery('select#sunend', $row).val() || "sunset";
                        offset = getInteger( jQuery('input#endoffset', $row).val() || "0" );
                        if ( isNaN( offset ) ) {
                            offset = 0;
                            jQuery('div.params input#endoffset', $row).addClass('tberror');
                        }
                        res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
                    } else {
                        jQuery( 'div.end', $row ).hide();
                        res.push("");
                    }
                    cond.value = res.join(',');
                    break;

                case 'interval':
                    removeConditionProperties( cond, "days,hours,mins,basetime" );
                    var nmin = 0;
                    var v = jQuery('div.params #days', $row).val();
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
                    jQuery('div.params #hours', $row).val();
                    if ( v.match( varRefPattern ) ) {
                        cond.hours = v;
                        nmin = 60;
                    } else {
                        v = getOptionalInteger( v, 0 );
                        if ( isNaN(v) || v < 0 ) {
                            jQuery( 'div.params #hours', $row ).addClass( 'tberror' );
                        } else {
                            cond.hours = v;
                            nmin = nmin + 60 * v;
                        }
                    }
                    v = jQuery('div.params #mins', $row).val();
                    if ( v.match( varRefPattern ) ) {
                        cond.mins = v;
                        nmin = 1;
                    } else {
                        v = getOptionalInteger( v, 0 );
                        if ( isNaN(v) || v < 0 ) {
                            jQuery( 'div.params #mins', $row ).addClass( 'tberror' );
                        } else {
                            cond.mins = v;
                            nmin = nmin + v;
                        }
                    }
                    if ( nmin <= 0 ) {
                        jQuery( 'div.params select', $row ).addClass( 'tberror' );
                    }
                    var rh = jQuery( 'div.params select#relhour' ).val() || "00";
                    var rm = jQuery( 'div.params select#relmin' ).val() || "00";
                    if ( rh == "00" && rm == "00" ) {
                        delete cond.basetime;
                    } else {
                        cond.basetime = rh + "," + rm;
                    }
                    break;

                case 'ishome':
                    removeConditionProperties( cond, "operator,value" );
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
                        jQuery("input#opts:checked", $row).each( function( ix, control ) {
                            res.push( control.value /* DOM element */ );
                        });
                    }
                    cond.value = res.join( ',' );
                    break;

                case 'reload':
                    /* No parameters */
                    removeConditionProperties( cond, "" );
                    break;

                default:
                    break;
            }

            $row.has('.tberror').addClass('tberror');

            updateControls();
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

        /**
         * Handler for operator change
         */
        function handleConditionOperatorChange( ev ) {
            var $el = jQuery( ev.currentTarget );
            var $row = $el.closest('div.cond-container');
            var cond = getInstanceData().ixCond[ $row.attr( 'id' || "" ) ];
            var val = $el.val() || "";
            var op = serviceOpsIndex[val];

            if ( "housemode" === cond.type ) {
                if ( val == "change" ) {
                    jQuery( 'fieldset#housemodechecks', $row ).hide();
                    jQuery( 'fieldset#housemodeselects', $row ).show();
                } else {
                    jQuery( 'fieldset#housemodechecks', $row ).show();
                    jQuery( 'fieldset#housemodeselects', $row ).hide();
                }
            } else if ( "service" === cond.type ) {
                var $inp = jQuery( 'input#value', $row );
                if ( val == "change" ) {
                    if ( $inp.length > 0 ) {
                        // Change single input field to double fields.
                        $inp.show();
                        var lab = jQuery( '<label class="tbsecondaryinput"> to </label>' );
                        lab.append( $inp.clone().attr('id', 'val2').val( '' )
                            .attr( 'placeholder', 'blank=any value' )
                            .off( 'change.reactor' ).on( 'change.reactor', handleConditionRowChange ) );
                        lab.insertAfter( $inp );
                        $inp.attr( 'id', 'val1' ).attr( 'placeholder', 'blank=any value' );
                    }
                } else {
                    if ( $inp.length == 0 ) {
                        $inp = jQuery( 'input#val1', $row );
                        jQuery( 'label.tbsecondaryinput', $row ).remove();
                        $inp.attr('id', 'value').attr('placeholder', '');
                    }
                    $inp.css( "visibility", ( undefined !== op && 0 === op.args ) ? "hidden" : "visible" );
                }
                var $opt = jQuery( '#nocaseopt', $row );
                if ( val.match( noCaseOptPattern ) ) {
                    $opt.show();
                    jQuery( 'input#nocase', $opt ).prop( 'checked', coalesce( cond.nocase, 1 ) !== 0 );
                } else {
                    $opt.hide();
                }
            } else {
                console.log( "Invalid row type in handleConditionOperatorChange(): " + String( cond.type ) );
                return;
            }

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
            var cond = getInstanceData().ixCond[condId];
            if ( undefined !== cond.device ) {
                cond.device = parseInt( newDev );
                var dobj = api.getDeviceObject( cond.device );
                cond.devicename = dobj ? dobj.name : ( "#" + String(cond.device) + "?" );
                configModified = true;
            }

            /* Make a new service/variable menu and replace it on the row. */
            var newMenu = makeVariableMenu( cond.device, cond.service, cond.variable );
            jQuery("select.varmenu", $row).replaceWith( newMenu );
            jQuery("select.varmenu", $row).off( 'change.reactor' ).on( 'change.reactor', handleConditionVarChange );
            updateCurrentServiceValue( $row );

            updateConditionRow( $row ); /* pass it on */
        }

        function handleCloseOptionsClick( ev ) {
            var $row = jQuery( ev.currentTarget ).closest('div.cond-container');

            /* Don't remove the option block, just hide it. */
            jQuery('div.cond-body div.condopts', $row).slideUp();

            /* Put the open tool back */
            jQuery('div.params i#condmore').show();
        }

        function handleExpandOptionsClick( ev ) {
            var $el = jQuery( ev.currentTarget );
            var $row = $el.closest( 'div.cond-container' );
            var cond = getInstanceData().ixCond[ $row.attr( "id" ) ];
            var grp = cond.__parent;

            /* Remove the open tool */
            $el.hide();

            /* If the options container already exists, just show it. */
            var $container = jQuery( 'div.cond-body div.condopts' );
            if ( $container.length > 0 ) {
                $container.slideDown();
                return;
            }

            /* Create the options container and add options */
            $container = jQuery('<div class="condopts"></div>');

            /* Predecessor */
            var $preds = jQuery('<select id="pred" class="form-control form-control-sm"><option value="">(any time/no sequence)</option></select>');
            for ( var ic=0; ic<(grp.conditions || []).length; ic++) {
                var gc = grp.conditions[ic];
                /* Must be service, not this condition, and not the predecessor to this condition (recursive) */
                if ( cond.id !== gc.id && ( gc.after === undefined || gc.after !== cond.id ) ) {
                    var $opt = jQuery( '<option/>' ).val( gc.id );
                    var t = makeConditionDescription( gc );
                    if ( t.length > 40 ) {
                        t = t.substring(0,37) + "...";
                    }
                    $opt.text( t );
                    $preds.append( $opt );
                }
            }
            $container.append('<div id="predopt" class="form-inline"><label>Only after&nbsp;</label></div>');
            jQuery('div#predopt label', $container).append( $preds );
            jQuery('div#predopt', $container).append('&nbsp;<label>within <input type="text" id="predtime" class="form-control form-control-sm narrow" autocomplete="off">&nbsp;seconds (0=no time limit)</label>');
            jQuery('select#pred', $container).val( cond.after );
            jQuery('input#predtime', $container).val( cond.aftertime || 0 );
            /* Duration */
            $container.append('<div id="duropt" class="form-inline"><label>Condition is sustained for&nbsp;<select id="durop" class="form-control form-control-sm"><option value="ge">at least</option><option value="lt">less than</option></select>&nbsp;<input type="text" id="duration" class="form-control form-control-sm narrow" autocomplete="off"> seconds</label></div>');
            /* Repeat */
            $container.append('<div id="repopt" class="form-inline"><label>Condition repeats <input type="text" id="rcount" class="form-control form-control-sm narrow" autocomplete="off"> times within <input type="text" id="rspan" class="form-control form-control-sm narrow" autocomplete="off"> seconds</label></div>');
            $container.append('<div id="latchopt" class="form-inline"><label class="checkbox-inline"><input type="checkbox" id="latchcond" class="form-check">&nbsp;Latch (once met, condition remains true until group resets)<label></div>');
            $container.append('<i class="md-btn material-icons closeopts" title="Close Options">expand_less</i>');
            jQuery('input,select', $container).on( 'change.reactor', handleConditionRowChange );
            jQuery('i.closeopts', $container).on( 'click.reactor', handleCloseOptionsClick );
            if ( ( cond.duration || 0 ) > 0 ) {
                jQuery('input#rcount,input#rspan', $container).prop('disabled', true);
                jQuery('input#duration', $container).val( cond.duration );
                jQuery('select#durop', $container).val( cond.duration_op || "ge" );
            } else {
                var rc = cond.repeatcount || "";
                jQuery('input#duration', $container).prop('disabled', rc != "");
                jQuery('select#durop', $container).prop('disabled', rc != "");
                jQuery('input#rcount', $container).val( rc );
                jQuery('input#rspan', $container).prop('disabled', rc=="").val( rc == "" ? "" : ( cond.repeatwithin || "60" ) );
            }
            jQuery('input#latchcond', $container).prop('checked', ( cond.latch || 0 ) != 0 );

            /* Add the options container (specific immediate child of this row selection) */
            $row.children( 'div.cond-body' ).append( $container );
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
            var row = jQuery( ev.currentTarget ).closest( 'div.conditionrow' );
            updateGeofenceLocations( row, "" );
            handleConditionRowChange( ev );
        }

        /**
         * Handle geofence operator change event.
         */
        function handleGeofenceOperatorChange( ev ) {
            var el = jQuery( ev.currentTarget );
            var row = el.closest( 'div.conditionrow' );
            var val = el.val() || "is";
            if ( "at" === val || "notat" === val ) {
                jQuery( 'select#userid,select#location', row ).show();
                jQuery( 'label,input#opts', row ).hide();
            } else {
                jQuery( 'select#userid,select#location', row ).hide();
                jQuery( 'label,input#opts', row ).show();
            }
            handleConditionRowChange( ev );
        }

        /**
         * Set condition fields and data for type. This also replaces existing
         * data from the passed condition. The condition must have at least
         * id and type keys set (so new conditions may be safely be otherwise
         * empty).
         */
        function setConditionForType( cond, row ) {
            var op, k, v, mm;
            if ( undefined === row ) {
                row = jQuery( 'div.cond-container#' + idSelector( cond.id ) );
            }
            var container = jQuery('div.params', row).empty();
            switch (cond.type) {
                case "":
                    break;

                case 'comment':
                    container.append('<input type="text" class="form-control form-control-sm" autocomplete="off" style="width: 100%">');
                    jQuery('input', container).on( 'change.reactor', handleConditionRowChange ).val( cond.comment || "" );
                    break;

                case 'service':
                    container.append( makeDeviceMenu( cond.device, cond.devicename || "?" ) );
                    /* Fix-up: makeDeviceMenu will display current userdata name
                               for device, but if that's changed from what we've stored,
                               we need to update our store. */
                    var dobj = api.getDeviceObject( cond.device );
                    if ( dobj && dobj.name !== cond.devicename ) {
                        cond.devicename = dobj.name;
                        configModified = true;
                    }
                    container.append( makeVariableMenu( cond.device, cond.service, cond.variable ) );
                    container.append( makeServiceOpMenu( cond.operator || "=" ) );
                    container.append('<input type="text" id="value" class="form-control form-control-sm" autocomplete="off" list="reactorvarlist">');
                    container.append(' ');
                    container.append('<fieldset id="nocaseopt"><label class="checkbox-inline" for="nocase"><input id="nocase" type="checkbox" class="form-check">Ignore&nbsp;case</label></fieldset>');
                    container.append(' ');
                    container.append('<i id="condmore" class="md-btn material-icons" title="Show Options">expand_more</i>');
                    container.append('<div id="currval"/>');

                    op = serviceOpsIndex[cond.operator || "="];
                    jQuery( "input#value", container).val( cond.value || "" )
                        .css( "visibility", ( undefined !== op && 0 === op.args ) ? "hidden" : "visible" )
                        .on( 'change.reactor', handleConditionRowChange );
                    jQuery("select.varmenu", container).on( 'change.reactor', handleConditionVarChange );
                    jQuery("select.opmenu", container).on( 'change.reactor', handleConditionOperatorChange );
                    jQuery('input#nocase', container).prop( 'checked', coalesce( cond.nocase, 1 ) !== 0 )
                        .on( 'change.reactor', handleConditionRowChange );
                    jQuery("select.devicemenu", container).on( 'change.reactor', handleDeviceChange );
                    jQuery("i#condmore", container).on( 'click.reactor', handleExpandOptionsClick );

                    updateCurrentServiceValue( container );
                    break;

                case 'housemode':
                    if ( ( cond.operator || "" ) == "" ) { cond.operator = "is"; }
                    mm = jQuery('<select class="opmenu form-control form-control-sm"></select>');
                    mm.append( '<option value="is">is any of</option>' );
                    mm.append( '<option value="change">changes from</option>' );
                    mm.val( cond.operator || "is" );
                    mm.on( 'change.reactor', handleConditionOperatorChange );
                    container.append( mm );
                    container.append( " " );
                    // Checkboxes in their own div
                    var d = jQuery( '<fieldset id="housemodechecks" class="condfields form-inline"/>' );
                    for ( k=1; k<=4; k++ ) {
                        mm = jQuery( '<input type="checkbox" class="form-check"/>' ).attr( 'value', k ).attr( 'id', 'opts' );
                        v = jQuery( '<label class="checkbox-inline" />' ).text( houseModeName[k] );
                        v.prepend( mm );
                        d.append( v );
                    }
                    container.append( d );
                    jQuery( "input#opts", container ).on( 'change.reactor', handleConditionRowChange );
                    // Menus in a separate div
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
                    v = ( cond.value || "" ).split( /,/ );
                    if ( "change" === cond.operator ) {
                        jQuery( 'fieldset#housemodechecks', container ).hide();
                        jQuery( 'select#frommode', container ).val( v.length > 0 && "" !== v[0] ? v[0] : "" );
                        jQuery( 'select#tomode', container ).val( v.length > 1 && "" !== v[1] ? v[1] : "" );
                    } else {
                        jQuery( 'fieldset#housemodeselects', container ).hide();
                        v.forEach( function( val ) {
                            jQuery('input#opts[value="' + val + '"]', container).prop('checked', true);
                        });
                    }
                    break;

                case 'weekday':
                    container.append(
                        '<select class="wdcond form-control form-control-sm"><option value="">Every</option><option value="1">First</option><option value="2">2nd</option><option value="3">3rd</option><option value="4">4th</option><option value="5">5th</option><option value="last">Last</option></select> ' +
                        '<label class="checkbox-inline"><input type="checkbox" id="opts" value="1">Sun</label>' +
                        '<label class="checkbox-inline"><input type="checkbox" id="opts" value="2">Mon</label>' +
                        '<label class="checkbox-inline"><input type="checkbox" id="opts" value="3">Tue</label>' +
                        '<label class="checkbox-inline"><input type="checkbox" id="opts" value="4">Wed</label>' +
                        '<label class="checkbox-inline"><input type="checkbox" id="opts" value="5">Thu</label>' +
                        '<label class="checkbox-inline"><input type="checkbox" id="opts" value="6">Fri</label>' +
                        '<label class="checkbox-inline"><input type="checkbox" id="opts" value="7">Sat</label>'
                    );
                    jQuery("input", container).on( 'change.reactor', handleConditionRowChange );
                    jQuery("select.wdcond", container).on( 'change.reactor', handleConditionRowChange ).val( cond.operator || "" );
                    (cond.value || "").split(',').forEach( function( val ) {
                        jQuery('input#opts[value="' + val + '"]', container).prop('checked', true);
                    });
                    break;

                case 'sun':
                    container.append( makeDateTimeOpMenu( cond.operator ) );
                    jQuery("select.opmenu", container).append('<option value="before">before</option>');
                    jQuery("select.opmenu", container).append('<option value="after">after</option>');
                    container.append('<div class="start form-inline pull-left">' +
                        '<select id="sunstart"></select> '+
                        ' offset&nbsp;<input type="text" id="startoffset" value="" class="narrow form-control form-control-sm" autocomplete="off">&nbsp;minutes' +
                        '</div>'
                    );
                    container.append('<div class="end form-inline pull-left"> and ' +
                        '<select id="sunend"></select> '+
                        ' offset&nbsp;<input type="text" id="endoffset" value="" class="narrow form-control form-control-sm" autocomplete="off">&nbsp;minutes' +
                        '</div>'
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
                    op = cond.operator || "after";
                    jQuery("select.opmenu", container).on( 'change.reactor', handleConditionRowChange ).val( op );
                    if ( op === "before" || op === "after" ) {
                        jQuery("div.end", container).hide();
                    } else {
                        jQuery("div.end", container).show();
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
                    var months = jQuery('<select class="monthmenu form-control form-control-sm"><option value=""></option></select>');
                    for ( k=1; k<=12; k++ ) {
                        months.append('<option value="' + k + '">' + monthName[k] + ' (' + k + ')</option>');
                    }
                    var days = jQuery('<select class="daymenu datespec form-control form-control-sm"></select>');
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
                    container.append('<div class="start"></div>').append('<div class="end"> and </div>');
                    jQuery("div.start", container).append( months.clone() )
                        .append( days.clone() )
                        .append('<input type="text" placeholder="yyyy or blank" title="Leave blank for any year" class="year narrow datespec form-control form-control-sm" autocomplete="off">')
                        .append( hours.clone() )
                        .append( mins.clone() );
                    jQuery("div.end", container).append( months )
                        .append( days )
                        .append('<input type="text" placeholder="yyyy" class="year narrow datespec form-control form-control-sm" autocomplete="off">')
                        .append( hours )
                        .append( mins );
                    jQuery("div.end select.monthmenu", container).addClass("datespec"); /* ability to disable */
                    jQuery('div.end select.monthmenu option[value=""]', container).remove();
                    /* Default all menus to first option */
                    jQuery("select", container).each( function( ix, obj ) {
                        jQuery(obj).val( jQuery("option:first", obj ).val() );
                    });
                    /* Restore values. */
                    op = cond.operator || "between";
                    jQuery("select.opmenu", container).val( op );
                    if ( op === "before" || op === "after" ) {
                        jQuery("div.end", container).hide();
                    } else {
                        jQuery("div.end", container).show();
                    }
                    var vlist = (cond.value || "").split(',');
                    var flist = [ 'div.start input.year', 'div.start select.monthmenu','div.start select.daymenu',
                                  'div.start select.hourmenu', 'div.start select.minmenu',
                                  'div.end input.year','div.end select.monthmenu', 'div.end select.daymenu',
                                  'div.end select.hourmenu','div.end select.minmenu'
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
                    var el = jQuery( '<label for="days">every </label>' );
                    el.append( '<input id="days" title="Enter an integer >= 0" value="0" class="tiny text-center form-control form-control-sm">' );
                    el.append( ' days ' );
                    container.append( el );
                    container.append( " " );
                    el = jQuery( '<label for="hours"> </label>' );
                    el.append( '<input id="hours" title="Enter an integer >= 0" class="tiny text-center form-control form-control-sm">' );
                    el.append( ' hours ' );
                    container.append( el );
                    container.append( " " );
                    el = jQuery( '<label for="mins"> </label> ');
                    el.append( '<input id="mins" title="Enter an integer >= 0" value="0" class="tiny text-center form-control form-control-sm">' );
                    el.append( ' minutes ');
                    container.append( el );
                    container.append( " " );
                    el = jQuery( '<label/>' ).text( " relative to ");
                    mm = jQuery('<select id="relhour" class="form-control form-control-sm"/>');
                    for ( k=0; k<24; k++ ) {
                        v = ( k < 10 ? "0" : "" ) + String(k);
                        mm.append( jQuery('<option/>').val( v ).text( v ) );
                    }
                    el.append( mm );
                    el.append(" : ");
                    mm = jQuery('<select id="relmin" class="form-control form-control-sm"/>');
                    for ( k=0; k<60; k+=5 ) {
                        v = ( k < 10 ? "0" : "" ) + String(k);
                        mm.append( jQuery('<option/>').val( v ).text( v ) );
                    }
                    el.append(mm);
                    container.append(el);
                    container.append( " " );
                    jQuery( "#days", container ).val( cond.days || 0 );
                    jQuery( "#hours", container ).val( cond.hours===undefined ? 1 : cond.hours );
                    jQuery( "#mins", container ).val( cond.mins || 0 );
                    if ( ! isEmpty( cond.basetime ) ) {
                        mm = cond.basetime.split(/,/);
                        jQuery( '#relhour', container ).val( mm[0] || '00' );
                        jQuery( '#relmin', container ).val( mm[1] || '00' );
                    }
                    jQuery("select,input", container).on( 'change.reactor', handleConditionRowChange );
                    break;

                case 'ishome':
                    container.append(
                        '<select class="geofencecond form-control form-control-sm"><option value="is">Any selected user is home</option><option value="is not">Any selected user is NOT home</option><option value="at">User in geofence</option><option value="notat">User not in geofence</option></select>');
                    mm = jQuery( '<select id="userid" class="form-control form-control-sm"/>' );
                    mm.append( jQuery( '<option/>' ).val("").text('--choose user--') );
                    for ( k in userIx ) {
                        if ( userIx.hasOwnProperty( k ) ) {
                            el = jQuery( '<label class="checkbox-inline"/>' ).text( ( userIx[k] || {} ).name || k );
                            el.append( jQuery( '<input type="checkbox" id="opts" value="' + k + '">' ) );
                            container.append( el );
                            mm.append( jQuery( '<option/>' ).val( k ).text( ( userIx[k] || {} ).name || k ) );
                        }
                    }
                    container.append( mm );
                    container.append( '<select id="location" class="form-control form-control-sm"/>' );
                    jQuery("input#opts", container).on( 'change.reactor', handleConditionRowChange );
                    jQuery("select.geofencecond", container)
                        .on( 'change.reactor', handleGeofenceOperatorChange )
                        .val( cond.operator || "is" );
                    jQuery("select#userid", container).on( 'change.reactor', handleGeofenceUserChange );
                    jQuery("select#location", container).on( 'change.reactor', handleConditionRowChange );
                    if ( cond.operator == "at" || cond.operator == "notat" ) {
                        jQuery( 'label,input#opts', container ).hide();
                        jQuery( 'select#userid,select#location', container ).show();
                        mm = ( cond.value || "" ).split(',');
                        if ( mm.length > 0 ) {
                            jQuery( 'select#userid', container ).val( mm[0] );
                            updateGeofenceLocations( container, mm[1] );
                        }
                    } else {
                        jQuery( 'label,input#opts', container ).show();
                        jQuery( 'select#userid,select#location', container ).hide();
                        (cond.value || "").split(',').forEach( function( val ) {
                            jQuery('input#opts[value="' + val + '"]', container).prop('checked', true);
                        });
                    }
                    break;

                case 'reload':
                    /* no fields */
                    break;

                default:
                    /* nada */
            }
        }

        /**
         * Type menu selection change handler.
         */
        function handleTypeChange( ev ) {
            var $el = jQuery( ev.currentTarget );
            var newType = $el.val();
            var $row = $el.closest('div.cond-container');
            var condId = $row.attr( 'id' );
            var ixCond = getInstanceData().ixCond;
            ixCond[condId].type = newType;
            setConditionForType( ixCond[condId], $row );

            $row.addClass( 'tbmodified' );
            configModified = true;
            updateConditionRow( $row );
        }

        /**
         * Handle click on Add Condition button.
         */
        function handleAddConditionClick( ev ) {
            var $el = jQuery( ev.currentTarget );
            var $parentGroup = $el.closest( 'div.cond-group-container' );
            var parentId = $parentGroup.attr( 'id' );

            /* Create a new condition in data, assign an ID */
            var cond = { id: getUID("cond"), type: "comment", data: {} };

            /* Insert new condition in UI */
            var condel = getConditionTemplate( cond.id );
            jQuery( 'select.condtype', condel ).val( cond.type );
            setConditionForType( cond, condel );
            jQuery( 'div.cond-list:first', $parentGroup ).append( condel );

            /* Add to data */
            var ixCond = getInstanceData().ixCond;
            var grp = ixCond[ parentId ];
            grp.conditions.push( cond );
            cond.__parent = grp;
            ixCond[ cond.id ] = cond;
            reindexConditions( grp );

            condel.addClass( 'tbmodified' );
            configModified = true;
            updateConditionRow( condel );
        }

        function handleTitleChange( ev ) {
            var input = jQuery( ev.currentTarget );
            var grpid = input.closest( 'div.cond-group-container' ).attr( 'id' );
            var newname = (input.val() || "").trim();
            var span = jQuery( 'span', input.parent() );
            var grp = getInstanceData().ixCond[grpid];
            input.removeClass( 'tberror' );
            if ( newname !== grp.name ) {
                /* Group name check */
                if ( newname.length < 2 ) {
                    ev.preventDefault();
                    input.addClass( 'tberror' );
                    input.focus();
                    return;
                }

                /* Update config */
                input.closest( 'div.cond-group-container' ).addClass( 'tbmodified' );
                grp.name = newname;
                configModified = true;
            }

            /* Remove input field and replace text */
            input.remove();
            span.text( newname );
            span.closest( 'div.cond-group-title' ).children().show();
            updateControls();
        }

        function handleTitleClick( ev ) {
            /* N.B. Click can be on span or icon */
            var $el = jQuery( ev.currentTarget );
            var $p = $el.closest( 'div.cond-group-title' );
            $p.children().hide();
            var grpid = $p.closest( 'div.cond-group-container' ).attr( 'id' );
            var grp = getInstanceData().ixCond[grpid];
            if ( grp ) {
                $p.append( jQuery( '<input class="titleedit form-control form-control-sm" title="Enter new group name">' )
                    .val( grp.name ) );
                jQuery( 'input.titleedit', $p ).on( 'change.reactor', handleTitleChange )
                    .on( 'blur.reactor', handleTitleChange );
            }
        }

        /**
         * Handle click on group expand/collapse.
         */
        function handleGroupExpandClick( ev ) {
            var $el = jQuery( ev.currentTarget );
            var $p = $el.closest( 'div.cond-group-container' );
            var $l = jQuery( 'div.cond-list:first', $p );
            if ( "collapse" === $el.attr( 'id' ) ) {
                $l.slideUp();
                $el.attr( 'id', 'expand' ).removeClass( 'glyphicon-collapse-up' ).addClass( 'glyphicon-collapse-down' ).attr( 'title', 'Collapse group' );
            } else {
                $l.slideDown();
                $el.attr( 'id', 'collapse' ).removeClass( 'glyphicon-collapse-down' ).addClass( 'glyphicon-collapse-up' ).attr( 'title', 'Expand group' );
            }
        }

        /**
         * Handle delete group button click
         */
        function handleDeleteGroupClick( ev ) {
            var $el = jQuery( ev.currentTarget );
            if ( $el.prop( 'disabled' ) || "root" === $el.attr( 'id' ) ) { return; }

            var $grpEl = $el.closest( 'div.cond-group-container' );
            var grpId = $grpEl.attr( 'id' );

            var grp = getInstanceData().ixCond[ grpId ];
            /* Confirm deletion only if group is not empty */
            if ( ( grp.conditions || [] ).length > 0 && ! confirm( 'This group has conditions and/or sub-groups, which will all be deleted as well. Really delete this group?' ) ) {
                return;
            }

            var gparent = grp.__parent;
            if ( gparent ) {
                var ix = grp.__index;
                gparent.conditions.splice( ix, 1 );
                $grpEl.remove();
                reindexConditions( gparent );

                configModified = true;
                updateControls();
                return;
            }
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
            var $parentGroup = $el.closest( 'div.cond-group-container' );
            var $container = jQuery( 'div.cond-list:first', $parentGroup );
            var parentId = $parentGroup.attr( 'id' );
            var ixCond = getInstanceData().ixCond;
            var grp = ixCond[ parentId ];
            var newgrp = { id: newId, name: newId, type: "group", conditions: [] };
            grp.conditions.push( newgrp );
            newgrp.__parent = grp;
            newgrp.__index = grp.conditions.length - 1; /* ??? for now */
            ixCond[ newId ] = newgrp;

            /* Append the new condition group to the container */
            $container.append( $condgroup );
            $condgroup.addClass( 'tbmodified' );

            configModified = true;
            updateControls();
        }

        /**
         * Handle click on the condition delete tool
         */
        function handleConditionDelete( ev ) {
            var el = jQuery( ev.currentTarget );
            var row = el.closest( 'div.cond-container' );
            var condId = row.attr('id');
            var grpId = el.closest( 'div.cond-group-container' ).attr("id");

            if ( el.attr( 'disabled' ) ) { return; }

            /* See if the condition is referenced in a sequence */
            var okDelete = false;
            var ixCond = getInstanceData().ixCond;
            for ( var ci in ixCond ) {
                if ( ixCond.hasOwnProperty(ci) && ixCond[ci].after == condId ) {
                    if ( !okDelete ) {
                        if ( ! ( okDelete = confirm('This condition is used in sequence options in another condition. Click OK to delete it and disconnect the sequence, or Cancel to leave everything unchanged.') ) ) {
                            return;
                        }
                    }
                    delete ixCond[ci].after;
                }
            }

            /* Remove condition from parent. */
            var grp = ixCond[ grpId ];
            grp.conditions.splice( ixCond[ condId ].__index, 1 );
            delete ixCond[ condId ];

            /* Remove the condition row from display */
            row.remove();
            reindexConditions( grp );

            el.closest( 'div.cond-group-container' ).addClass( 'tbmodified' );
            configModified = true;
            updateControls();
        }

        /**
         * Receive a node at the end of a drag/drop.
         */
        function handleNodeReceive( ev, ui ) {
            var $el = jQuery( ui.item );
            var $target = jQuery( ev.target ); /* receiving .cond-list */
            var $from = jQuery( ui.sender );
            var ixCond = getInstanceData().ixCond;

            /* Since we cloned the element, replace the clone with the real object */
            /* N.B. We would like ui.item or something to be the clone, but in Jquery
             * 1.10.x (on Vera UI7 7.0.27) it's not, and nothing in either ui or ev
             * gives it to us. So, draggable.start() adds class tb-dragtarget, for us
             * to find and use here. The clone is the one with this class in the new
             * location. Incidentally, the id has also been removed from the clone by
             * jQuery-UI. */
            var $clone = $target.children( 'div:not([id])' ); /* direct descendant with no id */
            $el.detach();
            $clone.replaceWith( $el );

            /* Now, disconnect the data object from its current parent */
            var obj = ixCond[ $el.attr( 'id' ) ];
            obj.__parent.conditions.splice( obj.__index, 1 );

            /* Attach it to new parent. */
            var prid = $target.closest( 'div.cond-group-container' ).attr( 'id' );
            var pr = ixCond[prid];
            obj.__parent = pr;
            /* Don't get fancy, just reindex as it now appears. */
            reindexConditions( pr );

            $el.addClass( 'tbmodified' ); /* ??? Is this really what we want to flag? */
            configModified = true;
            updateControls();
        }

        /**
         * Handle click on group controls (NOT/AND/OR/XOR)
         */
        function handleGroupControlClick( ev ) {
            var $el = jQuery( ev.currentTarget );
            var action = $el.attr( 'id' );
            var grpid = $el.closest( 'div.cond-group-container' ).attr( 'id' );
            var grp = getInstanceData().ixCond[ grpid ];

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

                case 'disable':
                    grp.disabled = $el.hasClass( 'checked' );
                    break;

                default:
                    /* nada */
            }

            $el.closest( 'div.cond-group-container' ).addClass( 'tbmodified' );
            configModified = true;
            updateControls();
        }

        /**
         * Create an empty condition row. Only type selector is pre-populated.
         */
        function getConditionTemplate( id ) {
            var el = jQuery( '\
<div class="cond-container"> \
  <div class="btn-group pull-right cond-actions"> \
    <button id="delcond" type="button" class="btn btn-xs btn-danger"> \
      <i class="glyphicon glyphicon-remove"></i> Delete \
    </button> \
  </div> \
  <div class="cond-body form-inline"> \
    <select class="condtype form-control form-control-sm"><option value="">--choose--</option></select> \
    <div class="params" /> \
  </div> \
</div>' );

            [ "comment", "service", "housemode", "sun", "weekday", "trange", "interval", "ishome", "reload" ].forEach( function( k ) {
                if ( ! ( isOpenLuup && k == "ishome" ) ) {
                    jQuery( "select.condtype", el ).append( jQuery( "<option/>" ).val( k ).text( condTypeName[k] ) );
                }
            });

            el.attr( 'id', id );
            jQuery('select.condtype', el).on( 'change.reactor', handleTypeChange );
            jQuery('button#delcond', el).on( 'click.reactor', handleConditionDelete );
            el.draggable({
                cursorAt: { top: 5, left: 5 },
                helper: "clone",
                connectToSortable: ".tb-sortable",
                start: function( ev, ui ) {
                    jQuery( '.tb-dragtarget' ).removeClass( 'tb-dragtarget' );
                    jQuery( ui.helper ).addClass( 'tb-dragtarget' ).attr('id', 'xyzzy').attr('dragdog','xyzzy');
                },
                stop: function( ev, ui ) {}
            });
            return el;
        }

        function getGroupTemplate( grpid ) {
            var el = jQuery( '\
<div class="cond-group-container"> \
  <div class="cond-group-header"> \
    <div class="btn-group pull-right"> \
      <button id="delgroup" type="button" class="btn btn-xs btn-danger"> \
        <i class="glyphicon glyphicon-remove"></i> Delete \
      </button> \
    </div> \
    <div class="cond-group-conditions"> \
      <div class="btn-group tb-tbn-check"> \
        <button id="not" class="btn btn-xs btn-primary" title="Invert the result of the AND/OR/XOR"> NOT </button> \
      </div> \
      <div class="btn-group tb-btn-radio"> \
        <button id="and" class="btn btn-xs btn-primary" title="AND means group is true only if all conditions/subgroups are true"> AND </button> \
        <button id="or" class="btn btn-xs btn-primary" title="OR means group is true if any child condition/subgroup is true"> OR </button> \
        <button id="xor" class="btn btn-xs btn-primary" title="XOR (exclusive or) means group is true if one and only one condition/subgroup is true"> XOR </button> \
      </div> \
      <div class="btn-group tb-btn-check"> \
        <button id="disable" class="btn btn-xs btn-primary tb-disable" title="Disabled groups are ignored, as if they did not exist"> DISABLE </button> \
      </div> \
      <div class="cond-group-title"> \
        <span id="titletext" /> \
        <i id="edittitle" class="glyphicon glyphicon-wrench"></i> \
        <i id="collapse" class="glyphicon glyphicon-collapse-up" title="Collapse group"></i> \
      </div> \
    </div> \
  </div> \
  <div class="error-container"></div> \
  <div class="cond-group-body"> \
    <div class="cond-list"></div> \
  </div> \
  <div class="cond-group-actions"> \
    <div class="btn-group"> \
      <button id="addcond" type="button" class="btn btn-xs btn-success"> \
        <i class="glyphicon glyphicon-plus"></i> Add Condition \
      </button> \
      <button id="addgroup" type="button" class="btn btn-xs btn-success"> \
        <i class="glyphicon glyphicon-plus-sign"></i> Add Group \
      </button> \
    </div> \
  </div> \
</div>' );
            el.attr('id', grpid);
            jQuery( 'span#titletext', el ).text( grpid );
            jQuery( 'div.cond-group-conditions input[type="radio"]', el ).attr('name', grpid);
            if ( 'root' === grpid ) {
                /* Can't delete root group, but use the space for Save and Revert */
                jQuery( 'button#delgroup', el ).replaceWith(
                    jQuery( '<button id="saveconf" class="btn btn-sm btn-success"> Save </button> <button id="revertconf" class="btn btn-sm btn-danger"> Revert </button>' )
                );
                jQuery( 'button#delgroup', el ).remove(); /* can never delete root group */
            }
            jQuery( 'button#addcond', el ).on( 'click.reactor', handleAddConditionClick );
            jQuery( 'button#addgroup', el ).on( 'click.reactor', handleAddGroupClick );
            jQuery( 'button#delgroup', el ).on( 'click.reactor', handleDeleteGroupClick );
            jQuery( 'span#titletext,i#edittitle', el ).on( 'click.reactor', handleTitleClick );
            jQuery( 'i#collapse', el ).on( 'click.reactor', handleGroupExpandClick );
            jQuery( '.cond-group-conditions button', el ).on( 'click.reactor', handleGroupControlClick );
            jQuery( '.cond-list', el ).addClass("tb-sortable").sortable({
                cursorAt: { top: 5, left: 5 },
                receive: handleNodeReceive
            });
            /* Root group is not draggable. */
            if ( 'root' !== grpid ) {
                el.draggable({
                    cursorAt: { top: 5, left: 5 },
                    //helper: "clone",
                    helper: function() {
                        return jQuery( '<div class="tb-helper"><i class="glyphicon glyphicon-arrow-right" /></div>' );
                    },
                    connectToSortable: ".tb-sortable",
                    start: function( ev, ui ) {
                        jQuery( '.tb-dragtarget' ).removeClass( 'tb-dragtarget' );
                        jQuery( ui.helper ).addClass( 'tb-dragtarget' );
                    }
                });
            }
            return el;
        }

        function redrawGroup( myid, grp, container, depth ) {
            container = container || jQuery( 'div#conditions' );
            depth = depth || 0;
            grp.__depth = depth;

            var ixCond = getInstanceData( myid ).ixCond;

            var el = getGroupTemplate( grp.id );
            container.append( el );

            el.addClass( 'level' + grp.__depth ).addClass( 'levelmod' + (grp.__depth % 4) );
            jQuery( 'span#titletext', el ).text( grp.name || grp.id ).attr( 'title', msgGroupIdChange );
            jQuery( 'div.cond-group-conditions button#' + grp.operator || "and", el ).addClass( "checked" );
            if ( grp.invert ) {
                jQuery( 'div.cond-group-conditions button#not', el ).addClass( "checked" );
            }
            if ( grp.disabled ) {
                jQuery( 'div.cond-group-conditions button#disable', el ).addClass( "checked" );
            }

            container = jQuery( 'div.cond-list', el );

            for ( var ix=0; ix<(grp.conditions || []).length; ix++ ) {
                var cond = grp.conditions[ix];
                ixCond[ cond.id ] = cond;
                cond.__parent = grp;
                cond.__index = ix;
                if ( cond.type && "group" !== cond.type ) {
                    /* Condition */
                    if ( cond.id === undefined ) {
                        cond.id = getUID("cond");
                    }

                    var row = getConditionTemplate( cond.id );
                    container.append( row );

                    var sel = jQuery('select.condtype', row);
                    if ( jQuery('option[value="' + cond.type + '"]', sel).length === 0 ) {
                        /* Condition type not on menu, probably a deprecated form. Insert it. */
                        sel.append('<option value="' + cond.type + '">' +
                            (condTypeName[cond.type] === undefined ? cond.type + ' (deprecated)' : condTypeName[cond.type] ) +
                            '</option>');
                    }
                    jQuery('select.condtype', row).val( cond.type );
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
            setInstanceData( 'ixCond', { root: cdata.conditions.root }, myid );
            redrawGroup( myid, cdata.conditions.root );

            jQuery("button#saveconf").on( 'click.reactor', handleSaveClick );
            jQuery("button#revertconf").on( 'click.reactor', handleRevertClick );

            updateControls();
        }

        /* Public interface */
        console.log("Initializing ConditionBuilder module");
        myModule = {
            init: function( dev ) {
                initModule( dev );
            },
            start: function( dev ) {
                redrawConditions( dev );
            },
            redraw: myModule.start,
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

            CondBuilder.init();

            /* Load material design icons */
            jQuery("head").append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');

            /* Our styles. */
            var html = "<style>";
            html += 'div#tab-conds.reactortab .cond-group-container { position: relative; margin: 4px 0; border-radius: 4px; padding: 5px; border: 1px solid #EEE; background: rgba(255, 255, 255, 0.9); }';
            html += 'div#tab-conds.reactortab .cond-group-container { padding: 10px; padding-bottom: 6px; border: 1px solid #0c6099; background: #bce8f1; }';
            html += 'div#tab-conds.reactortab .cond-group-container.levelmod1 { background-color: #faebcc; }';
            html += 'div#tab-conds.reactortab .cond-group-container.levelmod2 { background-color: #d6e9c6; }';
            html += 'div#tab-conds.reactortab .cond-group-container.levelmod3 { background-color: #ebccd1; }';
            html += 'div#tab-conds.reactortab .cond-container { position: relative; margin: 4px 0; border-radius: 4px; padding: 5px; border: 1px solid #0c6099; background: #fff; }';
            html += 'div#tab-conds.reactortab .cond-group-header { margin-bottom: 10px; }';
            html += 'div#tab-conds.reactortab .cond-list { list-style: none; padding: 0 0 0 15px; margin: 0; }';
            html += 'div#tab-conds.reactortab .error-container { display: none; cursor: help; color: #F00; }';
            html += '.cond-list > *:not(.ui-draggable-dragging)::before, .cond-list > *:not(.ui-draggable-dragging)::after { content: "";  position: absolute; left: -12px; width: 12px; height: calc(50% + 4px); border-color: #333333; border-style: solid; }';
            html += '.cond-list > *:not(.ui-draggable-dragging)::before { top: -4px; border-width: 0 0 2px 2px; }';
            html += '.cond-list > *:not(.ui-draggable-dragging)::after { top: 50%; border-width: 0 0 0 2px; }';
            html += '.cond-list > *:not(.ui-draggable-dragging):first-child::before { top: -12px; height: calc(50% + 14px); }';
            html += '.cond-list > *:not(.ui-draggable-dragging):last-child::before {  border-radius: 0 0 0 4px; }';
            html += '.cond-list > *:not(.ui-draggable-dragging):last-child::after { display: none; }';
            html += 'div#tab-conds.reactortab .cond-group-title { margin-left: 8px; display: inline-block; }';
            html += 'div#tab-conds.reactortab .cond-group-title span#titletext { font-size: 16px; font-weight: bold; color: #036; }';
            html += 'div#tab-conds.reactortab .btn.checked { background-color: #5cb85c; }';
            html += 'div#tab-conds.reactortab .btn.tb-disable.checked { background-color: #d9534f; }';

            html += 'div#tab-conds.reactortab div.cond-group-container.tbmodified:not(.tberror) { }';
            html += 'div#tab-conds.reactortab div.cond-group-container.tberror { border-left: 4px solid red; }';
            html += 'div#tab-conds.reactortab div.cond-container.tbmodified:not(.tberror) { }';
            html += 'div#tab-conds.reactortab div.cond-container.tberror { border-left: 4px solid red; }';

            html += 'div#tab-conds.reactortab {}';

            html += "div#tab-conds.reactortab .tb-about { margin-top: 24px; }";
            html += 'div#tab-conds.reactortab .tberror { border: 1px solid red; }';
            html += 'div#tab-conds.reactortab .tbwarn { border: 1px solid yellow; background-color: yellow; }';
            html += 'div#tab-conds.reactortab label { font-weight: normal; }';
            html += 'div#tab-conds.reactortab fieldset#nocaseopt { display: inline-block; }';
            html += 'div#tab-conds.reactortab div#currval { font-family: "Courier New", Courier, monospace; font-size: 0.9em; }';
            html += 'div#tab-conds.reactortab div.warning { color: red; }';
            html += 'div#tab-conds.reactortab i.md-btn:disabled { color: #999999; cursor: auto; }';
            html += 'div#tab-conds.reactortab i.md-btn[disabled] { color: #999999; cursor: auto; }';
            html += 'div#tab-conds.reactortab i.md-btn { margin-left: 2px; margin-right: 2px; cursor: pointer; }';
            html += 'div#tab-conds.reactortab .md12 { font-size: 12pt; }';
            html += 'div#tab-conds.reactortab .md14 { font-size: 14pt; }';
            html += 'div#tab-conds.reactortab div#conditions { width: 100%; }';
            html += 'div#tab-conds.reactortab fieldset.condfields { display: inline-block; }';
            html += 'div#tab-conds.reactortab input.narrow { max-width: 8em; }';
            html += 'div#tab-conds.reactortab input.tiny { max-width: 3em; }';
            html += 'div#tab-conds.reactortab input.titleedit { font-size: 12px; height: 24px; }';
            html += 'div#tab-conds.reactortab div.conditiongroup.groupdisabled { background-color: #ccc !important; color: #000 !important }';
            html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
            html += 'div#tbbegging { display: block; color: #ff6600; margin-top: 12px; }';
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
        var myid = api.getCpanelDeviceId();
        var cd = iData[myid].cdata;

        jQuery('.tberror', container).removeClass( 'tberror' );
        jQuery('div.varexp', container).each( function( ix, obj ) {
            var row = jQuery(obj);
            var vname = row.attr("id");
            if ( undefined === vname ) return;
            var expr = ( jQuery('textarea.expr', row).val() || "" ).trim();
            if ( isEmpty( expr ) ) {
                jQuery('textarea.expr', row).addClass('tberror');
            }
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
                expr: jQuery( 'textarea.expr', row ).val() || "?"
            },
            dataType: "json",
            timeout: 2000
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
            delete iData[api.getCpanelDeviceId()].cdata.variables[vname];
            row.remove();
            configModified = true;
            updateVariableControls();
        }
    }

    function clearGetStateOptions() {
        var container = jQuery('div#reactorvars');
        var row = jQuery( 'div#opt-state', container );
        row.remove();
        jQuery( 'button#addvar', container ).attr( 'disabled', false );
        jQuery( 'textarea.expr,i.md-btn', container ).attr( 'disabled', false );
    }

    function handleGetStateClear( ev ) {
        clearGetStateOptions();
    }

    function handleGetStateInsert( ev ) {
        var row = jQuery( ev.currentTarget ).closest( 'div.row' );

        var device = jQuery( 'select#gsdev', row ).val() || 0;
        var service = jQuery( 'select#gsvar', row ).val() || "";
        var variable = service.replace( /^[^\/]+\//, "" );
        service = service.replace( /\/.*$/, "" );
        if ( jQuery( 'input#usename', row ).prop( 'checked' ) ) {
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
        var cd = iData[api.getCpanelDeviceId()].cdata;
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
            var device = parseInt( f.val() || "" );
            var s = makeVariableMenu( device, "", "" ).attr( 'id', 'gsvar' );
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

        jQuery( 'button#addvar', container ).attr( 'disabled', true );
        jQuery( 'textarea.expr,i.md-btn', container ).attr( 'disabled', true );

        jQuery( 'textarea.expr', row ).attr( 'disabled', false );

        var el = jQuery( '<div class="col-xs-12 col-md-9 col-md-offset-2 form-inline" />' );
        el.append( makeDeviceMenu( "", "" ).attr( 'id', 'gsdev' ) );
        el.append( makeVariableMenu( parseInt( jQuery( 'select#gsdev', el ).val() ), "", "" )
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
    }

    function getVariableRow() {
        var editrow = jQuery('<div class="row varexp"></div>');
        editrow.append( '<div id="varname" class="col-xs-12 col-sm-12 col-md-2"></div>' );
        editrow.append( '<div class="col-xs-12 col-sm-10 col-md-9"><textarea class="expr form-control form-control-sm" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="off"/></div>' );
        // ??? devices_other is an alternate for insert state variable
        editrow.append( '<div class="col-xs-12 col-sm-2 col-md-1 text-right"><i id="tryexpr" class="material-icons md-btn" title="Try this expression">directions_run</i><i id="getstate" class="material-icons md-btn" title="Insert device state variable value">memory</i><i id="deletevar" class="material-icons md-btn" title="Delete this variable">clear</i></div>' );
        jQuery( 'textarea.expr', editrow ).on( 'change.reactor', handleVariableChange );
        jQuery( 'i#tryexpr', editrow ).attr('disabled', true).on('click.reactor', handleTryExprClick);
        jQuery( 'i#getstate', editrow ).attr('disabled', true).on('click.reactor', handleGetStateClick);
        jQuery( 'i#deletevar', editrow ).attr('disabled', true).on('click.reactor', handleDeleteVariableClick);
        return editrow;
    }

    function handleAddVariableClick() {
        var container = jQuery('div#reactorvars');

        jQuery( 'button#addvar', container ).attr( 'disabled', true );
        jQuery( 'div.varexp textarea.expr,i.md-btn', container ).attr( 'disabled', true );

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
                jQuery( 'div.varexp textarea.expr,i.md-btn', container ).attr('disabled', false);
                jQuery( 'button#addvar', container ).attr( 'disabled', false );
                jQuery( 'textarea.expr', row ).focus();
                /* Do the regular stuff */
                handleVariableChange( null );
            }
        });
        editrow.insertBefore( jQuery( '.buttonrow', container ) );
        jQuery( 'div#varname input', editrow ).focus();
    }

    /**
     * Redraw variables and expressions.
    */
    function redrawVariables() {
        var container = jQuery('div#tab-vars.reactortab div#reactorvars');
        container.empty();
        var gel = jQuery('<div class="vargroup"></div>');
        gel.append('<div class="row"><div class="tblisttitle col-xs-6 col-sm-6"><span class="titletext">Defined Variables</span></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button id="saveconf" class="btn btn-xs btn-success">Save</button> <button id="revertconf" class="btn btn-xs btn-danger">Revert</button></div></div>');
        var cdata = getConfiguration();

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
            if ( vix[ix].index !== ix ) {
                configModified = true; /* flag change we need to save */ /* ??? do where config is read? */
                vix[ix].index = ix;
            }
            var el = getVariableRow();
            el.attr( 'id', vd.name );
            jQuery( 'div#varname', el).text( vd.name );
            jQuery( 'textarea.expr', el ).val( vd.expression );
            jQuery( 'i.md-btn', el ).attr( 'disabled', false );
            gel.append( el );
        }

        /* Add "Add" button */
        gel.append('<div class="row buttonrow">' +
            '<div class="col-xs-12 col-sm-12"><button id="addvar" class="btn btn-sm btn-primary">Add Variable/Expression</button> Need help? Check out the <a href="https://github.com/toggledbits/Reactor/wiki/Expressions-&-Variables" target="_blank">documentation</a> or ask in the <a href="http://forum.micasaverde.com/index.php/board,93.0.html" target="_blank">Vera forums</a>.</div>' +
            '</div>');

        /* Append the group */
        container.append(gel);

        jQuery("button#addvar", container).on( 'click.reactor', handleAddVariableClick );
        jQuery("button#saveconf", container).on( 'click.reactor', handleSaveClick );
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

            initModule();

            /* Load material design icons */
            jQuery("head").append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');

            /* Our styles. */
            var html = "<style>";
            html += "div#tab-vars.reactortab .tb-about { margin-top: 24px; }";
            html += "div#tab-vars.reactortab .color-green { color: #006040; }";
            html += 'div#tab-vars.reactortab .tberror { border: 1px solid red; }';
            html += 'div#tab-vars.reactortab .tbwarn { border: 1px solid yellow; background-color: yellow; }';
            html += 'div#tab-vars.reactortab i.md-btn:disabled { color: #cccccc; cursor: auto; }';
            html += 'div#tab-vars.reactortab i.md-btn[disabled] { color: #cccccc; cursor: auto; }';
            html += 'div#tab-vars.reactortab i.md-btn { color: #006040; font-size: 14pt; cursor: pointer; }';
            html += 'div#tab-vars.reactortab input.tbinvert { min-width: 16px; min-height: 16px; }';
            html += 'div#tab-vars.reactortab div.tblisttitle { background-color: #444444; color: #fff; padding: 8px; min-height: 42px; }';
            html += 'div#tab-vars.reactortab div.tblisttitle span.titletext { font-size: 16px; font-weight: bold; margin-right: 4em; }';
            html += 'div#tab-vars.reactortab input.narrow { max-width: 6em; }';
            html += 'div#tab-vars.reactortab div.vargroup { border-radius: 8px; border: 2px solid #444444; margin-bottom: 8px; }';
            html += 'div#tab-vars.reactortab div.vargroup .row { margin-right: 0px; margin-left: 0px; }';
            html += 'div#tab-vars.reactortab div.vargroup div.var:nth-child(odd) { background-color: #efefef; }';
            html += 'div#tab-vars.reactortab div.varexp,div.buttonrow { padding: 8px; }';
            html += 'div#tab-vars.reactortab div.varexp.tbmodified:not(.tberror) { border-left: 4px solid green; }';
            html += 'div#tab-vars.reactortab div.varexp.tberror { border-left: 4px solid red; }';
            html += 'div#tab-vars.reactortab textarea.expr { font-family: monospace; resize: vertical; width: 100% !important; }';
            html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
            html += 'div#tbbegging { display: block; color: #ff6600; margin-top: 12px; }';
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
            var el;
            for ( i=0; i<scenes.length; i++ ) {
                if ( scenes[i].notification_only || scenes[i].hidden ) {
                    continue;
                }
                var r = scenes[i].room;
                if ( r != lastRoom ) {
                    if ( undefined !== r && undefined !== rid[r] ) {
                        menu.append('<option value="" class="optheading" disabled>' + "--" + String(rid[r].name) + "--</option>");
                        lastRoom = scenes[i].room;
                    } else {
                        console.log( "*** Scene " + String(scenes[i].id) + ": room " + String(scenes[i].room) + " assigned, but non-existent. Scene data follows:" );
                        for ( var k in scenes[i] ) {
                            if ( scenes[i].hasOwnProperty( k ) ) {
                                console.log( "    " + String(k) + " (" + typeof(scenes[i][k]) + ")=" + scenes[i][k] );
                            }
                        }
                    }
                }
                el = jQuery( '<option/>' );
                el.val( scenes[i].id );
                el.text( String(scenes[i].name) + ' (#' + String(scenes[i].id) + ')' );
                menu.append( el );
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
                var dev = jQuery( 'select.devicemenu', row ).val();
                if ( isEmpty( dev ) ) {
                    jQuery( 'select.devicemenu', row ).addClass( 'tberror' );
                } else {
                    var devnum = parseInt( dev );
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
                                    if ( p.optional ) {
                                        continue;
                                    }
                                    /* Not optional, flag error. */
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

            default:
                row.addClass( "tberror" );
        }

        row.has('.tberror').addClass('tberror');
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
            var k, pt, t;

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
                    var dobj = api.getDeviceObject( action.device );
                    action.deviceName = dobj ? dobj.name : '#' + String( action.device ) + '?';
                    t = jQuery( 'select#actionmenu', row ).val() || "";
                    pt = t.split( /\//, 2 );
                    action.service = pt[0]; action.action = pt[1];
                    var ai = actions[ t ];
                    if ( ai && ai.deviceOverride && ai.deviceOverride[action.device] ) {
                        ai = ai.deviceOverride[action.device];
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
                                    console.log("buildActionList: " + action.service + "/" +
                                        action.action + " required parameter " +
                                        ai.parameters[k].name + " has no value");
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
                        timeout: 2000
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
                    if ( "" === lua ) {
                        delete action.encoded_lua;
                        action.lua = "";
                    } else {
                        action.encoded_lua = 1;
                        action.lua = btoa( lua );
                    }
                    break;

                default:
                    console.log("buildActionList: " + actionType + " action unknown");
                    scene = false;
                    return false;
            }

            /* Append action to current group */
            group.actions.push( action );
        });
        return scene;
    }

    function handleActionsSaveClick( ev ) {
        var myid = api.getCpanelDeviceId();
        var cd = iData[myid].cdata;
        var errors = false;
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
            jQuery('div.controls i#action-up', section).attr('disabled', false);
            jQuery('div.actionrow:first div.controls i#action-up', section).attr('disabled', true);
            jQuery('div.controls i#action-down', section).attr('disabled', false);
            jQuery('div.actionrow:last div.controls i#action-down', section).attr('disabled', true);
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
        var cd = iData[ api.getCpanelDeviceId() ].cdata;
        var first = true;
        for ( var vname in ( cd.variables || {} ) ) {
            if ( cd.variables.hasOwnProperty( vname ) ) {
                if ( first ) {
                    menu.append( '<option class="menuspacer" disabled/>' ).append( '<option id="variables" class="optheading" disabled>--Variables--</option>' );
                    first = false;
                }
                menu.append(
                    jQuery( '<option/>' ).val( '{' + vname + '}' ).text( '{' + vname + '}' )
                );
            }
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
                if ( ( parm.direction || "in" ) == "out" ) continue; /* Don't display output params */
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
                                            opt.text( String( parm.values[j][z] ) );
                                        }
                                    }
                                } else {
                                    opt.val( String( parm.values[j] ) );
                                    opt.text( String( parm.values[j] ) );
                                }
                                inp.append( opt );
                            }
                            /* Add variables and append to tab (datalists are global to tab) */
                            appendVariables( inp );
                            jQuery( 'div#tab-actions.reactortab' ).append( inp );
                        }
                        /* Now pass on the input field */
                        inp = jQuery( '<input class="argument form-control form-control-sm" list="' + dlid + '">' );
                        if ( undefined !== parm.default ) {
                            inp.val( parm.default );
                        }
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
                        appendVariables( inp );
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
                    inp = jQuery( '<input class="argument narrow form-control form-control-sm" list="reactorvarlist">' );
                    inp.attr( 'placeholder', action.parameters[k].name );
                    inp.val( undefined==parm.default ? (undefined==parm.min ? (undefined==parm.optional ? 0 : "") : parm.min ) : parm.default );
                } else {
                    console.log("J_ReactorSensor_UI7.js: using default field presentation for type " + String(parm.type));
                    inp = jQuery( '<input class="argument form-control form-control-sm" list="reactorvarlist">' );
                    inp.attr( 'placeholder', action.parameters[k].name );
                    inp.val( undefined===parm.default ? "" : parm.default );
                }
                inp.attr('id', parm.name );
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
        return;
    }

    function handleActionActionChange( ev ) {
        configModified = true;
        var el = jQuery( ev.currentTarget );
        var newVal = el.val() || "";
        var row = el.closest( 'div.actionrow' );
        changeActionAction( row, newVal );
        changeActionRow( row );
    }

    function deepcopy(obj) {
        if ( null == obj || typeof(obj) != "object" ) return obj;
        var ret = obj.constructor();
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) ret[k]=deepcopy(obj[k]);
        }
        return ret;
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
        if ( devobj ) {
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
                        var v;
                        while ( pt.length > 0 ) {
                            var seg = decodeURIComponent( pt.shift() || "" ).trim();
                            if ( "openluup" === seg ) {
                                /* Fail immediately if not running on openLuup */
                                if ( ! isOpenLuup ) {
                                    stack.push( false );
                                    break;
                                }
                            } else if ( "vera" === seg ) {
                                /* Fail immediately if not running on genuine Vera */
                                if ( isOpenLuup ) {
                                    stack.push( false );
                                    break;
                                }
                            } else if ( "parent" === seg ) {
                                /* Does not change stack, but switches reference device to parent */
                                if ( 0 !== devobj.id_parent ) {
                                    refdev = devobj.id_parent;
                                    devobj = api.getDeviceObject( refdev );
                                    if ( !devobj ) { /* no device, immediate failure */
                                        match = false;
                                        break;
                                    }
                                }
                            } else if ( "var" === seg ) {
                                var vname = stack.pop() || "";
                                var vserv = stack.pop() || "";
                                v = api.getDeviceStateVariable( refdev, vserv, vname ) || null;
                                stack.push( v );
                            } else if ( "attr" === seg ) {
                                var aname = stack.pop() || "";
                                v = api.getDeviceAttribute( refdev, aname ) || null;
                                stack.push( v );
                            } else if ( "and" === seg ) {
                                var op2 = stack.pop() || false;
                                var op1 = stack.pop() || false;
                                stack.push( op1 && op2 );
                            } else if ( "or" === seg ) {
                                var op2 = stack.pop() || false;
                                var op1 = stack.pop() || false;
                                stack.push( op1 || op2 );
                            } else if ( "not" === seg ) {
                                v = stack.pop();
                                if ( typeof(v) == "boolean" ) {
                                    stack.push( !v );
                                } else {
                                    console.log("getDeviceOverride: not operand invalid type: (" + typeof(v) +
                                        ")" + String(v));
                                    stack.push( false );
                                }
                            } else if ( "isnull" === seg ) {
                                v = stack.pop() || null;
                                stack.push( v === null );
                            } else if ( "dup" === seg ) {
                                v = stack.pop() || null; /* sloppy peek??? */
                                stack.push( v );
                                stack.push( v );
                            } else if ( seg.match( /^(<|<=|>|>=|=|==|!=|~=)$/ ) ) {
                                /* Binary op, takes two values */
                                var op = seg;
                                var oper2 = stack.pop();
                                var oper1 = stack.pop();
                                var res;
                                if ( op == "==" || op == "=" ) {
                                    res = oper1 == oper2;
                                } else if ( op == "!=" || op == "~=" ) {
                                    res = oper1 != oper2;
                                } else {
                                    res = doNumericComparison( oper1, op, oper2 );
                                }
                                stack.push( res );
                            } else if ( seg.match( /^\// ) ) {
                                /* Regular expression match */
                                var re = new RegExp( seg );
                                v = stack.pop();
                                stack.push( v.match( re ) );
                            } else if ( seg.match( /^["']/ ) ) {
                                v = seg.substring( 1, seg.length-1 );
                                stack.push( v );
                            } else if ( ! isNaN( seg ) ) {
                                stack.push( parseInt( seg ) );
                            } else {
                                console.log("getDeviceOverride: unrecognized op in " + cond[ic] + ": '" + seg + "'");
                            }
                        }
                        /* Done. Test succeeds iff stack has true */
                        if ( stack.length != 1 ) {
                            console.log("getDeviceOverride: eval of " + cond[ic] + " for " + devobj.device_type +
                                " end of conditions stack len expected 1 got " + stack.length );
                        }
                        var result = stack.pop() || null;
                        console.log("getDeviceOverride: eval of " + cond[ic] + " yields (" +
                            typeof(result) + ")" + String(result));
                        if ( ! ( typeof(result)==="boolean" && result ) ) {
                            match = false;
                            break; /* stop testing conds */
                        }
                        if ( match ) {
                            console.log("getDeviceOverride: match condition " + cond[ic] +
                                " succeeded for " + devnum + " (" + devobj.name + ") type " +
                                devobj.device_type);
                            return base.match[im].actions || [];
                        }
                    }
                }
                /* Return default actions for type */
                return deviceInfo.devices[ 'type:' + mytype ].actions || [];
            }
        }
        return false;
    }

    function changeActionDevice( row, newVal, fnext, fargs ) {
        var ct = jQuery( 'div.actiondata', row );
        var actionMenu = jQuery( 'select#actionmenu', ct );

        // Clear the action menu and remove all arguments.
        actionMenu.empty().attr( 'disabled', true );
        jQuery('label,.argument', ct).remove();
        if ( newVal == "" ) { return; }

        /* Use actions/lu_actions to get list of services/actions for this device. We could
           also use lu_device and fetch/parse /luvd/S_...xml to get even more data,
           but let's see how this goes for now. */
        jQuery.ajax({
            url: api.getDataRequestURL(),
            data: {
                id: "actions",
                DeviceNum: newVal,
                output_format: "json"
            },
            dataType: "json",
            timeout: 5000
        }).done( function( data, statusText, jqXHR ) {
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
                        ai = { service: service.serviceId, action: actname, parameters: service.actionList[j].arguments };
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
                    section.append( opt.clone() );

                    hasAction = true;
                }
                if ( jQuery("option", section).length > 0 ) {
                    opt = jQuery("<option/>").val("").text( "---Service " + service.serviceId.replace(/^([^:]+:)+/, "") + "---" );
                    opt.attr( 'disabled', true );
                    opt.addClass("optheading");
                    section.prepend( opt );
                    actionMenu.append( section.children() );
                }
            }
            var over = getDeviceOverride( newVal );
            if ( over ) {
                var known = jQuery("<select/>");
                known.append( "<option class='optheading' value='' disabled><b>---Common Actions---</b></option>" );
                for ( j=0; j<over.length; j++ ) {
                    var devact = over[j];
                    var fake = false;
                    if ( undefined === deviceInfo.services[devact.service] || undefined == deviceInfo.services[devact.service].actions[devact.action] ) {
                        /* Service/action in device exception not "real". Fake it real good. */
                        deviceInfo.services[devact.service] = deviceInfo.services[devact.service] || { actions: {} };
                        deviceInfo.services[devact.service].actions[devact.action] = { name: devact.action, deviceOverride: {} };
                        fake = true;
                    }
                    /* There's a well-known service/action, so copy it, and apply overrides */
                    var act = deepcopy( deviceInfo.services[devact.service].actions[devact.action] );
                    for ( var k in devact ) {
                        if ( devact.hasOwnProperty(k) ) {
                            act[k] = devact[k];
                        }
                    }
                    if ( act.hidden ) continue;
                    key = act.service + "/" + act.action;
                    known.append( jQuery('<option/>').val( key ).text( ( act.description || act.action ) +
                        ( fake ? "??(O)" : "" ) ) );
                    hasAction = true;
                    if ( undefined === actions[key] ) {
                        actions[key] = deviceInfo.services[devact.service].actions[devact.action];
                        actions[key].deviceOverride = {};
                    }
                    actions[key].deviceOverride[newVal] = act;
                }
                known.append("<option disabled/>");
                actionMenu.prepend( known.children() );
            }
            var lopt = jQuery( '<option selected/>' ).val( "" ).text( hasAction ? "--choose action--" : "(invalid device--no actions)" );
            actionMenu.prepend( lopt );
            actionMenu.attr( 'disabled', false );
            jQuery( 'option:first', actionMenu ).prop( 'selected' );
            if ( undefined !== fnext ) {
                fnext.apply( null, fargs );
            }
        }).fail( function( jqXHR, textStatus, errorThrown ) {
            // Bummer.
            // ??? Simple(too) way? foreach service in deviceInfo { if device_supports_service { add actions to menu } }
            if ( 500 === jqXHR.status ) {
                alert("Can't load service data for device. Luup may be reloading. Try again in a moment.");
            } else {
                console.log("changeActionDevice: failed to load service data: " + textStatus + "; " + String(errorThrown));
                console.log(jqXHR.responseText);
            }
            actionMenu.prepend( '<option value="">--choose--</option>' );
            actionMenu.val("");
            actionMenu.attr( 'disabled', false );
            if ( undefined !== fnext ) {
                fnext.apply( null, fargs );
            }
        });
    }

    function handleActionDeviceChange( ev ) {
        configModified = true;
        var el = jQuery( ev.currentTarget );
        var newVal = el.val() || "";
        var row = el.closest( 'div.actionrow' );
        changeActionDevice( row, newVal, changeActionRow, [ row ] );
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

    function changeActionType( row, newVal ) {
        var ct = jQuery('div.actiondata', row);
        var m;
        ct.empty();
        jQuery( 'i#action-try,i#action-import', row ).hide();

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
                jQuery( 'i#action-try', row ).show();
                break;

            case "housemode":
                m = jQuery( '<select id="housemode" class="form-control form-control-sm">')
                    .append( '<option value="1">Home</option>' ).append( '<option value="2">Away</option>' )
                    .append( '<option value="3">Night</option>' ).append( '<option value="4">Vacation</option>' );
                m.on( 'change.reactor', handleActionValueChange );
                ct.append( m );
                break;

            case "delay":
                ct.append('<label for="delay">for <input type="text" id="delay" class="argument narrow form-control form-control-sm" title="Enter delay time as seconds, MM:SS, or HH:MM:SS" placeholder="delay time" list="reactorvarlist"></label>');
                ct.append('<select id="delaytype" class="form-control form-control-sm"><option value="inline">from this point</option><option value="start">from start of actions</option></select>');
                jQuery( 'input', ct ).on( 'change.reactor', handleActionValueChange );
                jQuery( 'select', ct ).on( 'change.reactor', handleActionValueChange );
                break;

            case "runscene":
                m = makeSceneMenu();
                m.prepend('<option value="" selected>--choose--</option>').val("").attr('id', 'scene');
                m.on( 'change.reactor', handleActionValueChange );
                ct.append( m );
                jQuery( 'i#action-import', row ).show();
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

            default:
                ct.append('<div class="tberror">Type ' + newVal + '?</div>');
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
                    var s = jQuery( 'select#actionmenu', row ).val() || "";
                    var pt = s.split( /\//, 2 );
                    var act = (deviceInfo.services[pt[0]] || { actions: {} }).actions[pt[1]];
                    if ( act && act.deviceOverride[d] ) {
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
                                changeActionDevice( newRow, act.device || "", function( row, action ) {
                                    var key = action.service + "/" + action.action;
                                    if ( 0 == jQuery( 'select#actionmenu option[value="' + key + '"]', row ).length ) {
                                        var opt = jQuery( '<option/>' ).val( key ).text( key );
                                        jQuery( 'select#actionmenu', row ).prepend( opt );
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
            '<option value="runlua">Run Lua</option>' +
            '<option value="runscene">Run Scene</option>' +
            '</select></div>' );
        row.append('<div class="actiondata col-xs-12 col-sm-12 col-md-6 col-lg-8 form-inline"></div>');
        var controls = jQuery('<div class="controls col-xs-12 col-sm-12 col-md-2 col-lg-2 text-right"></div>');
        controls.append( '<i id="action-try" class="material-icons md-btn" title="Try this action">directions_run</i>' );
        controls.append( '<i id="action-import" class="material-icons md-btn" title="Import scene to actions">save_alt</i>' );
        controls.append( '<i id="action-up" class="material-icons md-btn" title="Move up">arrow_upward</i>' );
        controls.append( '<i id="action-down" class="material-icons md-btn" title="Move down">arrow_downward</i>' );
        controls.append( '<i id="action-delete" class="material-icons md-btn" title="Remove action">clear</i>' );
        jQuery( 'i.md-btn', controls ).on( 'click.reactor', handleActionControlClick );
        jQuery( 'i#action-try,i#action-import', controls ).hide();
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
                        changeActionDevice( newRow, act.device || "", function( row, action ) {
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

                    default:
                        console.log("loadActions: what's a " + act.type + "? Skipping it!");
                        alert( "Action type " + act.type + " unknown, skipping. Did you downgrade from a higher version of Reactor?" );
                        continue;
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

    /* */
    function getActionListContainer() {
        var el = jQuery( "<div/>" ).addClass( "actionlist" );
        var row = jQuery( '<div class="row"/>' );
        row.append( '\
<div class="tblisttitle col-xs-9 col-sm-9 col-lg-10"> \
  <span class="titletext">?title?</span> \
</div> \
<div class="tblisttitle col-xs-3 col-sm-3 col-lg-2 text-right"> \
  <div class="btn-group"> \
    <button id="saveconf" class="btn btn-xs btn-success">Save</button> \
    <button id="revertconf" class="btn btn-xs btn-danger">Revert</button> \
  </div> \
</div>' );
        el.append( row );
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
        el.append( row );
        return el;
    }

    /* Redraw the activities lists within the existing tab structure. */
    function redrawActivities() {
        var myid = api.getCpanelDeviceId();
        var devobj = api.getDeviceObject( myid );
        var cd = iData[myid].cdata;
        jQuery( 'div#activities' ).empty();

        var el = getActionListContainer();
        el.attr( 'id', 'root.true' );
        jQuery( 'span.titletext', el ).text( 'When ' + devobj.name + ' Trips' );
        jQuery( 'div#activities' ).append( el );
        loadActions( el, cd.activities['root.true'] || {} );

        el = getActionListContainer();
        el.attr( 'id', 'root.false' );
        jQuery( 'span.titletext', el ).text( 'When ' + devobj.name + ' Untrips' );
        jQuery( 'div#activities' ).append( el );
        loadActions( el, cd.activities['root.false'] || {} );

        var ul = jQuery( '<ul />' );
        function orderly( gr ) {
            ul.append( jQuery( '<li />' ).attr( 'id', gr.id + ".true" ).text( ( gr.name || gr.id ) + " True" ) );
            ul.append( jQuery( '<li />' ).attr( 'id', gr.id + ".false" ).text( ( gr.name || gr.id ) + " False" ) );
            if ( "root" !== gr.id ) {
                var scene = gr.id + '.true';
                el = getActionListContainer();
                el.attr( 'id', scene );
                jQuery( 'span.titletext', el ).text( 'When ' +
                    ( gr.name || gr.id ) + ' <' + gr.id + '> = True' );
                jQuery( 'div#activities' ).append( el );
                loadActions( el, cd.activities[scene] || {} );

                scene = gr.id + '.false';
                el = getActionListContainer();
                el.attr( 'id', scene );
                jQuery( 'span.titletext', el ).text( 'When ' +
                    ( gr.name || gr.id ) + ' <' + gr.id + '> = False' );
                jQuery( 'div#activities' ).append( el );
                loadActions( el, cd.activities[scene] || {} );
            }
            for ( var ix=0; ix<(gr.conditions || []).length; ix++ ) {
                var cond = gr.conditions[ix];
                if ( "group" === ( cond.type || "group" ) ) {
                    orderly( cond );
                }
            }
        }
        orderly( ( cd.conditions || {} ).root || [ { id: "root" } ] );

        jQuery("div#tab-actions.reactortab button.addaction").on( 'click.reactor', handleAddActionClick );
        //jQuery("div#tab-actions.reactortab i#global-import").on( 'click.reactor', TBD );
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
            if ( configModified && confirm( msgUnsavedChanges) ) {
                handleSaveClick( undefined );
            }

            var cd = iData[myid].cdata;

            /* Set up a data list with our variables */
            var dl = jQuery('<datalist id="reactorvarlist"></datalist>');
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
                    crossDomain: true
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
        initModule();

        /* Load material design icons */
        jQuery("head").append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');

        /* Our styles. */
        var html = "<style>";
        html += "div#tab-actions datalist { display: none; }";
        html += "div#tab-actions.reactortab div#di-ver-check p { margin: 8px 8px 8px 8px; padding: 8px 8px 8px 8px; border: 2px solid yellow; }";
        html += "div#tab-actions.reactortab .tb-about { margin-top: 24px; }";
        html += "div#tab-actions.reactortab .color-green { color: #428BCA; }";
        html += 'div#tab-actions.reactortab .tberror { border: 1px solid red; }';
        html += 'div#tab-actions.reactortab .tbwarn { border: 2px solid yellow; }';
        html += 'div#tab-actions.reactortab .tberrmsg { padding: 8px 8px 8px 8px; color: red; }';
        html += 'div#tab-actions.reactortab i.md-btn:disabled { color: #cccccc; cursor: auto; }';
        html += 'div#tab-actions.reactortab i.md-btn[disabled] { color: #cccccc; cursor: auto; }';
        html += 'div#tab-actions.reactortab i.md-btn { color: #2d6a9f; font-size: 14pt; cursor: pointer; }';
        html += 'div#tab-actions.reactortab input.tbinvert { min-width: 16px; min-height: 16px; }';
        html += 'div#tab-actions.reactortab input.narrow { max-width: 8em; }';
        html += 'div#tab-actions.reactortab div.actionlist { border-radius: 8px; border: 2px solid #428BCA; margin-bottom: 16px; }';
        html += 'div#tab-actions.reactortab div.actionlist .row { margin-right: 0px; margin-left: 0px; }';
        html += 'div#tab-actions.reactortab div.tblisttitle { background-color: #428BCA; color: #fff; padding: 8px; min-height: 42px; }';
        html += 'div#tab-actions.reactortab div.tblisttitle span.titletext { font-size: 16px; font-weight: bold; margin-right: 4em; }';
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
        html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
        html += 'div#tbbegging { display: block; color: #ff6600; margin-top: 12px; }';
        html += 'div#tab-actions.reactortab div.warning { color: red; }';
        html += 'div#tab-actions.reactortab option.optheading { font-weight: bold; }';
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
                jQuery('div#loading').html('<h1>Hmmm...</h1>Well, that didn\'t go well. Try waiting a few moments, and then switching back to the Control tab and then back to this tab. If that doesn\'t work, please <a href="mailto:reactor@toggledbits.com?subject=Reactor+Activities+Load+Problem">send email to reactor@toggledbits.com</a> with the following text: <pre id="diag"></pre>');
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
            dataType: 'text'
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
            timeout: 5000
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

    function sendDeviceData( device ) {
        /* Fetch the device file */
        jQuery.ajax({
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

                    // https://stackoverflow.com/questions/13651243/how-do-i-chain-a-sequence-of-deferred-functions-in-jquery-1-8-x#24041521
                    var copy = function(a) { return Array.prototype.slice.call(a); };
                    $.sequence = function( chain, continueOnFailure ) {
                        var handleStep, handleResult,
                            steps = copy(chain),
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

                    var typ = $('deviceType', this).first().text();
                    var chain = [];

                    /* Send device data */
                    var dd = { version: 1, timestamp: Date.now(), devicetype: typ, services: {} };
                    dd.manufacturer = $( 'manufacturer', this ).text();
                    dd.modelname = $( 'modelName', this ).text();
                    dd.modelnum = $( 'modelNumber', this ).text();
                    dd.modeldesc = $( 'modelDescription', this ).text();
                    dd.category = $( 'Category_Num', this).text();
                    dd.subcat = $( 'Subcategory_Num', this).text();

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
                            dataType: 'json'
                        }).promise();
                    });

                    $.sequence( chain ).done( function() {
                        alert("Thank you! Your data has been submitted.");
                    }).fail( function() {
                        alert("Something went wrong and the data could not be submitted.");
                    });
                }
            });
        }).fail( function( jqXHR, textStatus, errorThrown ) {
            // Bummer.
            alert("Unable to request data from Vera. Try again in a moment; it may be reloading or busy.");
            console.log("Failed to load lu_device data: " + textStatus + " " + String(errorThrown));
            console.log(jqXHR.responseText);
        });
    }

    function handleSendDeviceDataClick( ev ) {
        var ct = jQuery( ev.currentTarget ).closest( 'div' );
        var device = jQuery( 'select#devices', ct ).val();
        if ( isEmpty( device ) ) {
            alert("Please select a device first.");
            return;
        }
        sendDeviceData( device );
        /* If device has a parent, or has children, send them as well */
        var dobj = api.getDeviceObject( device );
        if ( dobj && dobj.id_parent != 0 ) {
            sendDeviceData( dobj.id_parent ); /* parent */
        }
        var typs = {};
        /* ??? only one level deep */
        var ud = api.getUserData();
        for ( var ix=0; ix<ud.devices.length; ix++ ) {
            if ( ud.devices[ix].id_parent == device && undefined === typs[ ud.devices[ix].device_type ] ) {
                sendDeviceData( ud.devices[ix].id );
                typs[ ud.devices[ix].device_type ] = true;
            }
        }
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
            crossDomain: true
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

        initModule();

        var html = "";

        html = '<style>';
        html += 'div#reactortools.reactortab input.narrow { max-width: 8em; }';
        html += 'div#tbcopyright { display: block; margin: 12px 0 12px 0; }';
        html += 'div#tbbegging { display: block; color: #ff6600; margin-top: 12px; }';
        html += '</style>';
        jQuery('head').append( html );

        html = '<div id="reactortools" class="reactortab">';
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
        html += '<ul><li>Check the documentation in the <a href="https://github.com/toggledbits/Reactor/wiki" target="_blank">Reactor Wiki</a>.</li><li>The <a href="http://forum.micasaverde.com/index.php/board,93.0.html" target="_blank">Reactor Board</a> in the Vera Community Forums is a great way to get support for questions, how-to\'s, etc.</li><li>Generate and examine a <a href="' +
            api.getDataRequestURL() + '?id=lr_Reactor&action=summary&device=' + api.getCpanelDeviceId() + '" target="_blank">Logic&nbsp;Summary</a> report. This text-based report shows your ReactorSensor\'s current state, and its event list, which may tell you a lot about what led up to that state.</li>' +
            '<li>If the logic summary is not helping you, please post it in its entirety, together with a description of what you are trying to accomplish and/or the problem you are having, to a new thread on the Reactor Board (linked above). <strong>Please do not post screenshots</strong> unless you are reporting a UI/appearance bug. Generally speaking, the logic summary is far more useful (and easier to make and post, by design).</li>';
        if ( ! isOpenLuup ) {
            html += '<li>If you are asked for a "debug log snippet", use this procedure (unless given other instructions in the request):<ol><li>Turn on debug by clicking this link: <a href="' +
            api.getDataRequestURL() + '?id=lr_Reactor&action=debug&debug=1" target="_blank">Turn debug ON</a></li><li>Restart this sensor to force a re-evaluation of all conditions: <a href="' +
            api.getDataRequestURL() + '?id=action&output_format=xml&DeviceNum=' + api.getCpanelDeviceId() + '&serviceId=' +
            encodeURIComponent( serviceId ) + '&action=Restart" target="_blank">Restart this ReactorSensor</a></li><li><strong>Wait at least 60 seconds, not less.</strong> This is very important&mdash;proceeding too soon may result in incomplete log data.</li><li>Click this link to <a href="javascript:void();" id="grablog">generate the log snippet</a> (the relevant part the log file). It should magically appear at the bottom of this page&mdash;scroll down!</li><li>Post the log snippet to the forum thread, or email it <em>together with your logic summary report and your forum username</em> to <a href="mailto:reactor-logs@toggledbits.com" target="_blank">reactor-logs@toggledbits.com</a>. Note: this email address is for receiving logs only; do not submit questions or other requests to this address.</li></ol>';
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
        var s = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "TestTime" ) || "";
        jQuery('input#testdateenable', container).prop('checked', false);
        jQuery('select#testyear,select#testmonth,select#testday,input#testtime', container).prop('disabled', true);
        if ( ! isEmpty( s ) ) {
            s = parseInt( s );
            if ( ! isNaN( s ) ) {
                /* Test time spec overrides now */
                now = new Date( s * 1000 );
                jQuery('input#testdateenable', container).prop('checked', true);
                jQuery('select#testyear,select#testmonth,select#testday,input#testtime', container).prop('disabled', false);
            }
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
                dataType: 'json'
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
        initModule: initModule,
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
