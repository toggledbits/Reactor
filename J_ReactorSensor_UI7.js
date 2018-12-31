//# sourceURL=J_ReactorSensor_UI7.js
/**
 * J_ReactorSensor_UI7.js
 * Configuration interface for ReactorSensor
 *
 * Copyright 2018 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 */
/* globals api,jQuery,$,unescape,MultiBox,ace */

//"use strict"; // fails on UI7, works fine with ALTUI

var ReactorSensor = (function(api, $) {

    /* unique identifier for this plugin... */
    var uuid = '21b5725a-6dcd-11e8-8342-74d4351650de';

    var DEVINFO_MINSERIAL = 2.88;

    var myModule = {};

    var serviceId = "urn:toggledbits-com:serviceId:ReactorSensor";
    // var deviceType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

    var iData = [];
    var roomsByName = [];
    var actions = {};
    var deviceInfo = {};
    var configModified = false;
    var inStatusPanel = false;
    var isOpenLuup = false;
    // unused: isALTUI = undefined !== MultiBox;
    var lastx = 0;
    var condTypeName = { "service": "Service/Variable", "housemode": "House Mode", "comment": "Comment", "weekday": "Weekday",
        "sun": "Sunrise/Sunset", "trange": "Date/Time", "interval": "Interval", "reload": "Luup Reloaded" };
    var weekDayName = [ '?', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
    var monthName = [ '?', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
    var opName = { "bet": "between", "nob": "not between", "after": "after", "before": "before" };
    var houseModeName = [ '?', 'Home', 'Away', 'Night', 'Vacation' ];
    var inttypes = { "ui1": { min: 0, max: 255 }, "i1": { min: -128, max: 127 },
        "ui2": { min: 0, max: 65535 }, "i2": { min: -32768, max: 32767 },
        "ui4": { min: 0, max: 4294967295 }, "i4": { min: -2147483648, max:2147483647 } };
    var serviceOps = [ { op: '=', desc: 'equals', args: 1 }, { op: '<>', desc: 'not equals', args: 1 },
        { op: '<', desc: '<', args: 1 }, { op: '<=', desc: '<=', args: 1 },
        { op: '>', desc: '>', args: 1 }, { op: '>=', desc: '>=', args: 1 },
        { op: 'starts', desc: 'starts with', args: 1 }, { op: 'ends', desc: 'ends with', args: 1 },
        { op: 'contains', desc: 'contains', args: 1 }, { op: 'in', desc: 'in', args: 1 },
        { op: 'istrue', desc: 'is TRUE', args: 0 }, { op: 'isfalse', desc: 'is FALSE', args: 0 },
        { op: 'change', desc: 'changes', args: 0 } ];
    var serviceOpsIndex = {};

    /* Return footer */
    function footer() {
        var html = '';
        html += '<div class="clearfix">';
        html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
        html += '<div id="tbcopyright">Reactor ver 2.0stable-181231 &copy; 2018 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>,' +
            ' All Rights Reserved. Please check out the <a href="https://www.toggledbits.com/reactor" target="_blank">online documentation</a>' +
            ' and <a href="http://forum.micasaverde.com/index.php/board,93.0.html" target="_blank">forum board</a> for support.</div>';
        html += '<div id="supportlinks">Support links: ' +
            ' <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=debug" target="_blank">Toggle&nbsp;Debug</a>' +
            ' &bull; <a href="/cgi-bin/cmh/log.sh?Device=LuaUPnP" target="_blank">Log&nbsp;File</a>' +
            ' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=status" target="_blank">Plugin&nbsp;Status</a>' +
            ' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=summary&device=' + api.getCpanelDeviceId() + '" target="_blank">Logic&nbsp;Summary</a>' +
            '</div>';
        return html;
    }

    /* Create an ID that's functionally unique for our purposes. */
    function getUID( prefix ) {
        /* Not good, but enough. */
        var newx = Date.now();
        if ( newx == lastx ) ++newx;
        lastx = newx;
        return ( prefix === undefined ? "" : prefix ) + newx.toString(16);
    }

    /* Evaluate input string as integer, strict (no non-numeric chars allowed other than leading/trailing whitespace, empty string fails). */
    function getInteger( s ) {
        s = String(s).replace( /^\s+|\s+$/gm, '' );
        s = s.replace( /^\+/, '' ); /* leading + is fine, ignore */
        if ( s.match( /^-?[0-9]+$/ ) ) {
            return parseInt( s );
        }
        return NaN;
    }

    /* Like getInteger(), but returns dflt if no value provided (blank/all whitespace) */
    function getOptionalInteger( s, dflt ) {
        if ( String(s).match( /^\s*$/ ) ) {
            return dflt;
        }
        return getInteger( s );
    }

    /* Get device object from userdata by device number */
    function getDeviceObject( devnum ) {
        if ( undefined === devnum || false === devnum || isNaN( devnum ) ) {
            return false;
        }
        var ix = api.getDeviceIndex( parseInt( devnum ) );
        if ( ix < 0 ) {
            console.log( "getDeviceObject() API returned < 0, ix=" + String(ix) );
            return false;
        }
        var ud = api.getUserData();
        return ud.devices[ ix ];
    }

    function getDeviceFriendlyName( dev ) {
        var devobj = getDeviceObject( dev );
        if ( undefined === devobj || false === devobj ) {
            console.log( "getDeviceFriendlyName() dev=(" + typeof(dev) + ")" + String(dev) + ", devobj=(" + typeof(devobj) + ")" + String(devobj) + ", returning false" );
            return false;
        }
        return String(devobj.name) + " (#" + String(devobj.id) + ")";
    }

    /* Load configuration data. */
    function loadConfigData( myid ) {
        var s = api.getDeviceState( myid, serviceId, "cdata" ) || "";
        var cdata;
        if ( s.length !== 0 ) {
            try {
                cdata = JSON.parse( s );
            } catch (e) {
                console.log("Unable to parse cdata: " + String(e));
            }
        }
        if ( cdata === undefined || typeof cdata !== "object" ||
                cdata.conditions === undefined || typeof cdata.conditions !== "object" ) {
            cdata = { version: 2, variables: {}, conditions: [
                { groupid: getUID('grp'), groupconditions: [
                    { id: getUID('cond'), type: "comment", comment: "Enter your AND conditions here" }
                    ]
                }
            ]};
        }
        var upgraded = false;
        if ( undefined === cdata.variables ) {
            /* Fixup v2 */
            cdata.variables = {};
            upgraded = true;
        }
        /* Set up our indices. */
        var ixGroup = {};
        var ixCond = {};
        for ( var ig=0; ig<(cdata.conditions || []).length; ig++ ) {
            var grp = cdata.conditions[ig];
            ixGroup[ grp.groupid ] = grp;
            for ( var ic=0; ic<(grp.groupconditions || []).length; ic++ ) {
                ixCond[ grp.groupconditions[ic].id ] = grp.groupconditions[ic];
            }
        }

        cdata.version = 2;
        cdata.device = myid;
        if ( upgraded ) {
            /* Write updated config. We don't care if it fails, as nothing we can't redo would be lost. */
            api.setDeviceStateVariablePersistent( myid, serviceId, "cdata", JSON.stringify( cdata ) );
        }

        iData[ myid ] = { cdata: cdata, ixCond: ixCond, ixGroup: ixGroup };

        configModified = false;
        return cdata;
    }

    /* Initialize the module */
    function initModule() {
        var myid = api.getCpanelDeviceId();
        console.log("initModule() for device " + myid);

        actions = {};

        /* Instance data */
        iData[myid] = { cdata: {}, ixCond: {}, ixGroup: {} };

        /* Force this false every time, and make the status panel change it. */
        inStatusPanel = false;

        /* Get the config and parse it */
        loadConfigData( myid );

        /* Make our own list of devices, sorted by room, and alpha within room. */
        var devices = api.cloneObject( api.getListOfDevices() );
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
    }

    /* Get parent state */
    function getParentState( varName ) {
        var me = getDeviceObject( api.getCpanelDeviceId() );
        return api.getDeviceState( me.id_parent || me.id, "urn:toggledbits-com:serviceId:Reactor", varName );
    }

    /**
     * Find cdata group
     */
    function findCdataGroupIndex( grpid ) {
        var cdata = iData[ api.getCpanelDeviceId() ].cdata;
        for ( var ix=0; ix<(cdata.conditions || []).length; ++ix ) {
            if ( cdata.conditions[ix].groupid === grpid ) {
                return ix;
            }
        }
        return undefined;
    }

    /**
     * Find cdata condition in group.
     */
    function findCdataConditionIndex( condid, grpid ) {
        var grp = iData[api.getCpanelDeviceId()].ixGroup[ grpid ];
        if ( undefined !== grp ) {
            for ( var ix=0; ix<(grp.groupconditions || []).length; ++ix ) {
                if ( grp.groupconditions[ix].id === condid ) {
                    return ix;
                }
            }
        }
        return undefined;
    }

    function isEmpty( s ) {
        return s === undefined || s === "";
    }

    function quot( s ) {
        if ( typeof(s) != "string" ) s = String(s);
        return '"' + s.replace( /"/g, "\\\"" ) + '"';
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

    function makeConditionDescription( cond ) {
        if ( cond === undefined ) {
            return "(undefined)";
        }

        var str = "", t, k;
        switch ( cond.type ) {
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
                        str += ' ' + cond.value;
                    }
                }
                break;

            case 'comment':
                str = cond.comment;
                break;

            case 'housemode':
                if ( ( cond.value || "" ) === "" ) {
                    str += "Any";
                } else {
                    t = ( cond.value || "" ).split(/,/);
                    for ( k=0; k<t.length; ++k ) {
                        t[k] = houseModeName[t[k]] || t[k];
                    }
                    str += t.join(' or ');
                }
                break;

            case 'weekday':
                var wmap = { "1": "first", "2": "second", "3": "third", "4": "fourth", "5": "fifth", "last": "last" };
                if ( ( cond.operator || "" ) === "" ) {
                    str = "every";
                } else if ( wmap[cond.operator] ) {
                    str = 'on the ' + wmap[cond.operator];
                } else {
                    str = cond.operator;
                }
                if ( ( cond.value || "" ) === "" ) {
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
                    str += cond.operator + '???';
                }
                function sunrange( spec ) {
                    var names = { 'sunrise': 'sunrise', 'sunset': 'sunset',
                            'civdawn': 'civil dawn', 'civdusk': 'civil dusk',
                            'nautdawn': 'nautical dawn', 'nautdusk': 'nautical dusk',
                            'astrodawn': 'astronomical dawn', 'astrodusk': 'astronomical dusk'
                        };
                    k = spec.match( /^([^+-]+)(.*)/ );
                    if ( k === null || k.length !== 3 ) {
                        return spec + '???';
                    } else {
                        t = parseInt( k[2] );
                        var str = ' ';
                        if ( t < 0 ) {
                            str = str + String(-t) + " mins before ";
                        } else if ( t > 0 ) {
                            str = str + String(t) + " mins after ";
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
                    str += cond.operator + '???';
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
                if ( "" != (cond.basetime || "") ) {
                    t = cond.basetime.split(/,/);
                    str += " (relative to ";
                    str += t[0] + ":" + t[1];
                    str += ")";
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
     * Make a service/variable menu of all state defined for the device. Be
     * brief, using only the variable name in the menu, unless that name is
     * used by multiple services, in which case the last component of the
     * serviceId is added parenthetically to draw the distinction.
     */
    function makeVariableMenu( device, service, variable ) {
        var el = jQuery('<select class="varmenu form-control form-control-sm"></select>');
        var myid = api.getCpanelDeviceId();
        var devobj = getDeviceObject( device );
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
                /* ??? <=> */
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

        if ( ( service || "" ) !== "" && ( variable || "" ) !== "" ) {
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
     * Update save/revert buttons (separate, because we use in two diff tabs
     */
    function updateSaveControls() {
        var errors = jQuery('.tberror');
        jQuery('button#saveconf').prop('disabled', ! ( configModified && errors.length === 0 ) );
        jQuery('button#revertconf').prop('disabled', !configModified);
    }

    /**
     * Update controls for current conditions.
     */
    function updateControls() {
        /* Disable all "Add Condition" buttons if any condition type menu
           has no selection. */
        var nset = jQuery('div.condtype select option[value=""]:selected').length !== 0;
        jQuery('button.addcond').prop('disabled', nset );

        /* Disable "Add Group" button with same conditions. */
        jQuery('button#addgroup').prop('disabled', nset );

        /* Up/down tools for conditions enabled except up for first and down
           for last in each group. */
        jQuery('div.controls i.action-up').attr('disabled', false);
        jQuery('div.controls i.action-down').attr('disabled', false);
        jQuery('div.conditiongroup').each( function( ix, grpEl ) {
            jQuery( 'div.conditionrow:first div.controls i.action-up', grpEl ).attr('disabled', true);
            jQuery( 'div.conditionrow:last div.controls i.action-down', grpEl ).attr('disabled', true);
        });

        /* Delete button of single condition in first condition group is
           disabled/hidden. Must keep one condition, hopefully set. */
        jQuery('div.conditionrow div.controls i.action-delete').prop('disabled', false).show();
        var lastMo = jQuery('div.conditiongroup:first div.conditionrow div.controls');
        if ( lastMo.length == 1 ) {
            jQuery('i.action-delete', lastMo).prop('disabled', true ).hide();
        }

        updateSaveControls();
    }

    /**
     * Update row structure from current display data.
     */
    function updateConditionRow( row, target ) {
        var condId = row.attr("id");
        var cond = iData[api.getCpanelDeviceId()].ixCond[ condId ];
        var typ = jQuery("div.condtype select", row).val() || "";
        cond.type = typ;
        jQuery('.tberror', row).removeClass('tberror');
        row.removeClass('tberror');
        switch (typ) {
            case 'comment':
                cond.comment = jQuery("div.params input", row).val();
                break;

            case 'service':
                cond.device = parseInt( jQuery("div.params select.devicemenu", row).val() );
                cond.service = jQuery("div.params select.varmenu", row).val() || "";
                cond.variable = cond.service.replace( /^[^\/]+\//, "" );
                cond.service = cond.service.replace( /\/.*$/, "" );
                cond.operator = jQuery("div.params select.opmenu", row).val() || "=";
                var op = serviceOpsIndex[cond.operator || ""];
                jQuery( "input#value", row ).css( "visibility", ( undefined !== op && 0 === op.args ) ? "hidden" : "visible" );
                cond.value = jQuery("input#value", row).val() || "";
                break;

            case 'weekday':
                cond.operator = jQuery("div.params select.wdcond", row).val() || "";
                /* fall through */

            case 'housemode':
                var res = [];
                jQuery("input#opts:checked", row).each( function( ix, control ) {
                    res.push( control.value /* DOM element */ );
                });
                cond.value = res.join(',');
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
                            losOtros = jQuery('div.end input.year', row);
                        } else {
                            losOtros = jQuery('div.start input.year', row);
                        }
                        if ( newval === "" && losOtros.val() !== "" ) {
                            losOtros.val("");
                        } else if ( newval !== "" && losOtros.val() === "" ) {
                            losOtros.val(newval);
                        }
                    }
                }
                /* Fetch and load */
                cond.operator = jQuery("div.params select.opmenu", row).val() || "bet";
                res = [];
                var mon = jQuery("div.start select.monthmenu", row).val() || "";
                if ( mon !== "" ) {
                    res.push( jQuery("div.start input.year", row).val() || "" );
                    res.push( jQuery("div.start select.monthmenu", row).val() || "" );
                    res.push( jQuery("div.start select.daymenu", row).val() || "1" );
                } else {
                    Array.prototype.push.apply( res, ["","",""] );
                }
                res.push( jQuery("div.start select.hourmenu", row).val() || "0" );
                res.push( jQuery("div.start select.minmenu", row).val() || "0" );
                if ( cond.operator === "before" || cond.operator === "after" ) {
                    Array.prototype.push.apply( res, ["","","","",""] );
                } else {
                    jQuery('div.end', row).show();
                    if ( mon !== "" ) {
                        res.push( jQuery("div.end input.year", row).val() || "" );
                        res.push( jQuery("div.end select.monthmenu", row).val() || "" );
                        res.push( jQuery("div.end select.daymenu", row).val() || "1" );
                    } else {
                        Array.prototype.push.apply( res, ["","",""] );
                    }
                    res.push( jQuery("div.end select.hourmenu", row).val() || "0" );
                    res.push( jQuery("div.end select.minmenu", row).val() || "0" );
                }
                cond.value = res.join(',');
                if ( typ === "trange" ) {
                    jQuery('.datespec', row).prop('disabled', res[1]==="");
                    if ( cond.operator !== "bet" && cond.operator !== "nob" ) {
                        jQuery('div.end', row).hide();
                    } else {
                        jQuery('div.end', row).show();
                    }
                }
                break;

            case 'sun':
                cond.operator = jQuery('div.params select.opmenu', row).val() || "after";
                res = [];
                var whence = jQuery('div.params select#sunstart', row).val() || "sunrise";
                var offset = getInteger( jQuery('div.params input#startoffset', row).val() || "0" );
                if ( isNaN( offset ) ) {
                    /* Validation error, flag and treat as 0 */
                    offset = 0;
                    jQuery('div.params input#startoffset', row).addClass('tberror');
                }
                res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
                if ( cond.operator == "bet" || cond.operator == "nob" ) {
                    jQuery( 'div.end', row ).show();
                    whence = jQuery('select#sunend', row).val() || "sunset";
                    offset = getInteger( jQuery('input#endoffset', row).val() || "0" );
                    if ( isNaN( offset ) ) {
                        offset = 0;
                        jQuery('div.params input#endoffset', row).addClass('tberror');
                    }
                    res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
                } else {
                    jQuery( 'div.end', row ).hide();
                    res.push("");
                }
                cond.value = res.join(',');
                break;

            case 'interval':
                var v = getOptionalInteger( jQuery('div.params #days', row).val(), 0 );
                if ( isNaN(v) || v < 0 ) {
                    jQuery( 'div.params #days', row ).addClass( 'tberror' );
                } else {
                    cond.days = v;
                }
                v = getOptionalInteger( jQuery('div.params #hours', row).val(), 0 );
                if ( isNaN(v) || v < 0 ) {
                    jQuery( 'div.params #hours', row ).addClass( 'tberror' );
                } else {
                    cond.hours = v;
                }
                v = getOptionalInteger( jQuery('div.params #mins', row).val(), 0 );
                if ( isNaN(v) || v < 0 ) {
                    jQuery( 'div.params #mins', row ).addClass( 'tberror' );
                } else {
                    cond.mins = v;
                }
                var t = cond.days * 1440 + cond.hours * 60 + cond.mins;
                if ( 0 == t ) {
                    jQuery( 'div.params select', row ).addClass( 'tberror' );
                }
                var rh = jQuery( 'div.params select#relhour' ).val() || "00";
                var rm = jQuery( 'div.params select#relmin' ).val() || "00";
                if ( rh == "00" && rm == "00" ) {
                    cond.basetime = "";
                } else {
                    cond.basetime = rh + "," + rm;
                }
                break;

            case 'reload':
                /* No parameters */
                break;

            default:
                break;
        }

        row.has('.tberror').addClass('tberror');

        updateControls();
    }

    /**
     * Handler for row change (generic)
     */
    function handleConditionRowChange( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.conditionrow');
        configModified = true;
        updateConditionRow( row, jQuery( el ) );
    }

    /**
     * Handler for device change
     */
    function handleDeviceChange( ev ) {
        var el = ev.currentTarget;
        var newDev = jQuery(el).val();
        var row = jQuery( el ).closest('div.conditionrow');
        var condId = row.attr('id');
        var cond = iData[api.getCpanelDeviceId()].ixCond[condId];
        if ( undefined !== cond.device ) {
            cond.device = parseInt(newDev);
            var dobj = getDeviceObject( cond.device );
            cond.devicename = dobj ? dobj.name : ("#"+String(cond.device)+"?");
            configModified = true;
        }

        /* Make a new service/variable menu and replace it on the row. */
        var newMenu = makeVariableMenu( cond.device, cond.service, cond.variable );
        jQuery("select.varmenu", row).replaceWith( newMenu );
        updateConditionRow( row ); /* pass it on */
    }

    function handleOptionChange( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.conditionrow');
        var cond = iData[api.getCpanelDeviceId()].ixCond[ row.attr("id") ];

        var pred = jQuery('select.pred', row);
        if ( "" === pred.val() ) {
            if ( undefined !== cond.after ) {
                delete cond.after;
                delete cond.aftertime;
                configModified = true;
            }
        } else {
            var pt = parseInt( jQuery('input.predtime', row).val() );
            if ( isNaN( pt ) || pt < 0 ) {
                pt = 0;
                jQuery('input.predtime', row).val(pt);
            }
            if ( cond.after !== pred.val() || cond.aftertime !== pt ) {
                cond.after = pred.val();
                cond.aftertime = pt;
                configModified = true;
            }
        }

        var rc = jQuery('input.rcount', row);
        if ( "" === rc.val() || rc.prop('disabled') ) {
            jQuery('input.duration', row).prop('disabled', false);
            jQuery('select.durop', row).prop('disabled', false);
            jQuery('input.rspan', row).val("").prop('disabled', true);
            if ( undefined !== cond.repeatcount ) {
                delete cond.repeatcount;
                delete cond.repeatwithin;
                configModified = true;
            }
        } else {
            var n = getInteger( rc.val() );
            if ( isNaN( n ) || n < 2 ) {
                rc.addClass( 'tberror' );
            } else if ( n > 1 ) {
                rc.removeClass( 'tberror' );
                if ( n != cond.repeatcount ) {
                    cond.repeatcount = n;
                    delete cond.duration;
                    delete cond.duration_op;
                    configModified = true;
                }
                jQuery('input.duration', row).val("").prop('disabled', true);
                jQuery('select.durop', row).val("ge").prop('disabled', true);
                jQuery('input.rspan', row).prop('disabled', false);
                if ( jQuery('input.rspan', row).val() === "" ) {
                    jQuery('input.rspan', row).val("60");
                    cond.repeatwithin = 60;
                    configModified = true;
                }
            }
        }

        var latchval = jQuery('input.latchcond', row).prop('checked') ? 1 : 0;
        if ( latchval != ( cond.latch || 0 ) ) {
            cond.latch = latchval;
            configModified = true;
        }

        var rs = jQuery('input.rspan', row);
        if ( ! rs.prop('disabled') ) {
            var rspan = getInteger( rs.val() );
            if ( isNaN( rspan ) || rspan < 1 ) {
                rs.addClass( 'tberror' );
            } else {
                rs.removeClass( 'tberror' );
                if ( rspan !== ( cond.repeatwithin || 0 ) ) {
                    cond.repeatwithin = rspan;
                    configModified = true;
                }
            }
        }

        var dd = jQuery('input.duration', row);
        if ( "" === dd.val() || dd.prop('disabled') ) {
            jQuery('input.rcount', row).prop('disabled', false);
            // jQuery('input.rspan', row).prop('disabled', false);
            if ( undefined !== cond.duration ) {
                delete cond.duration;
                delete cond.duration_op;
                configModified = true;
            }
        } else {
            var dur = getInteger( dd.val() );
            if ( isNaN( dur ) || dur < 0 ) {
                dd.addClass('tberror');
            } else {
                dd.removeClass('tberror');
                jQuery('input.rcount', row).val("").prop('disabled', true);
                // jQuery('input.rspan', row).val("").prop('disabled', true);
                delete cond.repeatwithin;
                delete cond.repeatcount;
                if ( (cond.duration||0) !== dur ) {
                    /* Changed */
                    if ( dur === 0 ) {
                        delete cond.duration;
                        delete cond.duration_op;
                        jQuery('input.rcount', row).prop('disabled', false);
                        // jQuery('input.rspan', row).prop('disabled', false);
                    } else {
                        cond.duration = dur;
                        cond.duration_op = jQuery('select.durop', row).val();
                    }
                    configModified = true;
                }
            }
        }

        updateControls();
    }

    function handleCloseOptionsClick( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.conditionrow');

        /* Remove the options block */
        jQuery('div.params div.condopts', row).remove();

        /* Put the open tool back */
        jQuery('div.params i.condmore').show();
    }

    function handleExpandOptionsClick( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.conditionrow');
        var myid = api.getCpanelDeviceId();
        var cond = iData[myid].ixCond[ row.attr("id") ];
        var grp = iData[myid].ixGroup[ row.closest('div.conditiongroup').attr('id') ];

        /* Remove the open tool */
        jQuery( el ).hide();

        /* Create the options container and add options */
        var container = jQuery('<div class="condopts"></div>');
        /* Predecessor */
        var preds = jQuery('<select class="pred form-control form-control-sm"><option value="">(any time/no sequence)</option></select>');
        for ( var ic=0; ic<(grp.groupconditions || []).length; ic++) {
            var gc = grp.groupconditions[ic];
            /* Must be service, not this condition, and not the predecessor to this condition (recursive) */
            if ( cond.id !== gc.id && ( gc.after === undefined || gc.after !== cond.id ) ) {
                var opt = jQuery('<option/>').val( gc.id );
                var t = makeConditionDescription( gc );
                if ( t.length > 40 ) {
                    t = t.substr(0,36) + "...";
                }
                opt.text( t );
                preds.append( opt );
            }
        }
        container.append('<div class="predopt form-inline"><label>Only after&nbsp;</label></div>');
        jQuery('div.predopt label', container).append(preds);
        jQuery('div.predopt', container).append('&nbsp;<label>within <input type="text" class="predtime form-control form-control-sm narrow">&nbsp;seconds (0=no time limit)</label>');
        jQuery('select.pred', container).val( cond.after );
        jQuery('input.predtime', container).val( cond.aftertime || 0 );
        /* Duration */
        container.append('<div class="duropt form-inline"><label>State is sustained for&nbsp;<select class="durop form-control form-control-sm"><option value="ge">at least</option><option value="lt">less than</option></select>&nbsp;<input type="text" class="duration form-control form-control-sm narrow"> seconds</label></div>');
        /* Repeat */
        container.append('<div class="duropt form-inline"><label>State repeats <input type="text" class="rcount form-control form-control-sm narrow"> times within <input type="text" class="rspan form-control form-control-sm narrow"> seconds</label></div>');
        container.append('<div class="latchopt form-inline"><label><input type="checkbox" class="latchcond form-control form-control-sm">&nbsp;Latch (once met, condition remains true until group resets)<label></div>');
        container.append('<i class="material-icons closeopts" title="Close Options">expand_less</i>');
        jQuery('input,select', container).on( 'change.reactor', handleOptionChange );
        jQuery('i.closeopts', container).on( 'click.reactor', handleCloseOptionsClick );
        if ( ( cond.duration || 0 ) > 0 ) {
            jQuery('input.rcount,input.rspan', container).prop('disabled', true);
            jQuery('input.duration', container).val( cond.duration );
            jQuery('select.durop', container).val( cond.duration_op || "ge" );
        } else {
            var rc = cond.repeatcount || "";
            jQuery('input.duration', container).prop('disabled', rc != "");
            jQuery('select.durop', container).prop('disabled', rc != "");
            jQuery('input.rcount', container).val( rc );
            jQuery('input.rspan', container).val( rc == "" ? "" : ( cond.repeatwithin || "60" ) );
        }
        jQuery('input.latchcond', container).prop('checked', ( cond.latch || 0 ) != 0 );

        /* Add it to the params */
        jQuery('div.params', row).append( container );
    }

    /**
     * Set condition for type
     */
    function setConditionForType( cond, row ) {
        var op, k, v, mm;
        if ( undefined === row ) {
            row = jQuery('div.row#' + cond.id);
        }
        jQuery('div.params', row).empty();
        var container = jQuery('<div class="form-inline"></div>');
        switch (cond.type) {
            case "":
                break;

            case 'comment':
                container.append('<input class="form-control form-control-sm type="text" style="width: 100%">');
                jQuery('input', container).on( 'change.reactor', handleConditionRowChange ).val( cond.comment || "" );
                break;

            case 'service':
                container.append( makeDeviceMenu( cond.device, cond.devicename || "?" ) );
                /* Fix-up: makeDeviceMenu will display current userdata name
                           for device, but if that's changed from what we've stored,
                           we need to update our store. */
                var dobj = getDeviceObject( cond.device );
                if ( dobj && dobj.name !== cond.devicename ) {
                    cond.devicename = dobj.name;
                    configModified = true;
                }
                container.append( makeVariableMenu( cond.device, cond.service, cond.variable ) );
                container.append( makeServiceOpMenu( cond.operator ) );
                container.append('<input type="text" id="value" class="form-control form-control-sm">');
                container.append('<i class="material-icons condmore" title="Show Options">expand_more</i>');
                op = serviceOpsIndex[cond.operator || ""];
                jQuery( "input#value", container).val( cond.value || "" )
                    .css( "visibility", ( undefined !== op && 0 === op.args ) ? "hidden" : "visible" )
                    .on( 'change.reactor', handleConditionRowChange );
                jQuery("select.varmenu", container).on( 'change.reactor', handleConditionRowChange );
                jQuery("select.opmenu", container).on( 'change.reactor', handleConditionRowChange );
                jQuery("select.devicemenu", container).on( 'change.reactor', handleDeviceChange );
                jQuery("i.condmore", container).on( 'click.reactor', handleExpandOptionsClick );
                break;

            case 'housemode':
                container.append(
                    '<label class="checkbox-inline"><input type="checkbox" id="opts" value="1">Home</label>' +
                    '<label class="checkbox-inline"><input type="checkbox" id="opts" value="2">Away</label>' +
                    '<label class="checkbox-inline"><input type="checkbox" id="opts" value="3">Night</label>' +
                    '<label class="checkbox-inline"><input type="checkbox" id="opts" value="4">Vacation</label>'
                );
                jQuery("input", container).on( 'change.reactor', handleConditionRowChange );
                (cond.value || "").split(',').forEach( function( val ) {
                    jQuery('input#opts[value="' + val + '"]', container).prop('checked', true);
                });
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
                    ' offset&nbsp;<input type="text" id="startoffset" value="" class="narrow form-control form-control-sm">&nbsp;minutes' +
                    '</div>'
                );
                container.append('<div class="end form-inline pull-left"> and ' +
                    '<select id="sunend"></select> '+
                    ' offset&nbsp;<input type="text" id="endoffset" value="" class="narrow form-control form-control-sm">&nbsp;minutes' +
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
                    .append('<input type="text" placeholder="yyyy or blank" title="Leave blank for any year" class="year narrow datespec form-control form-control-sm">')
                    .append( hours.clone() )
                    .append( mins.clone() );
                jQuery("div.end", container).append( months )
                    .append( days )
                    .append('<input type="text" placeholder="yyyy" class="year narrow datespec form-control form-control-sm">')
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
                if ( "" != ( cond.basetime || "" ) ) {
                    mm = cond.basetime.split(/,/);
                    jQuery( '#relhour', container ).val( mm[0] || '00' );
                    jQuery( '#relmin', container ).val( mm[1] || '00' );
                }
                jQuery("select,input", container).on( 'change.reactor', handleConditionRowChange );
                break;

            case 'reload':
                /* no fields */
                break;

            default:
                /* nada */
        }

        /* Append the new container */
        jQuery("div.params", row).append( container );
    }

    /**
     * Type menu selection change handler.
     */
    function handleTypeChange( ev ) {
        var el = ev.currentTarget;
        var newType = jQuery(el).val();
        var row = jQuery( el ).closest('div.conditionrow');
        var condId = row.attr('id');
        var myid = api.getCpanelDeviceId();
        if ( iData[myid].ixCond[condId] === undefined ) {
            iData[myid].ixCond[condId] = { id: condId, type: newType };
        } else {
            iData[myid].ixCond[condId].type = newType;
        }
        configModified = true;
        setConditionForType( iData[myid].ixCond[condId], row );
        updateConditionRow( row );
    }

    /**
     * Handle click on Add Condition button.
     */
    function handleAddConditionClick( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.row'); /* button row */
        var grp = jQuery( el ).closest('div.conditiongroup');

        /* Disable the add button for now. */
        jQuery(el).prop('disabled', true);

        /* Create a new condition row, assign an ID, and insert it before the button */
        var newId = getUID("cond");
        var condel = getConditionRow();
        condel.attr("id", newId);
        condel.insertBefore(row);

        /* Add condition to cond store and index */
        var myid = api.getCpanelDeviceId();
        var grpId = grp.attr("id");
        iData[myid].ixCond[ newId ] = { id: newId }; /* nearly empty */
        iData[myid].ixGroup[grpId].groupconditions.push( iData[myid].ixCond[newId] );

        configModified = true;
        updateConditionRow( condel );
    }

    function handleTitleChange( ev ) {
        var input = jQuery( ev.currentTarget );
        var newid = (input.val() || "").trim();
        var span = input.closest( 'span' );
        var grpid = span.closest( 'div.conditiongroup' ).attr( 'id' );
        input.removeClass( 'tberror' );
        if ( newid == grpid ) {
            /* No change */
            span.empty().text( 'Group: ' + grpid ).on( 'click.reactor', handleTitleClick )
                .addClass( 'titletext' );
            return;
        }
        /* Group name check */
        if ( ! newid.match( /^[a-z][a-z0-9_]+$/i ) ) {
            input.addClass( 'tberror' );
            input.focus();
            return;

        }
        /* Don't allow duplicate group Id */
        var myid = api.getCpanelDeviceId();
        for ( var v in iData[myid].ixGroup ) {
            if ( iData[myid].ixGroup.hasOwnProperty( v ) ) {
                if ( v != grpid && v == newid ) {
                    input.addClass( 'tberror' );
                    input.focus();
                    return;
                }
            }
        }
        /* Update config */
        iData[myid].ixGroup[newid] = iData[myid].ixGroup[grpid];
        iData[myid].ixGroup[newid].groupid = newid;
        delete iData[myid].ixGroup[grpid];
        configModified = true;
        /* Remove input field and replace text */
        span.closest( 'div.conditiongroup' ).attr( 'id', newid );
        span.empty().text( 'Group: ' + newid ).on( 'click.reactor', handleTitleClick )
            .addClass( 'titletext' );
        updateSaveControls();
    }

    function handleTitleClick( ev ) {
        var span = jQuery( ev.currentTarget );
        span.off( 'click.reactor' ).removeClass( 'titletext' );
        var grpid = span.closest( 'div.conditiongroup' ).attr( 'id' );
        span.empty().append( jQuery( '<input class="titleedit form-control form-control-sm" title="Enter new group ID">' ).val( grpid ) );
        jQuery( 'input', span ).on( 'change.reactor', handleTitleChange )
            .on( 'blur.reactor', handleTitleChange );
    }

    /**
     * Handle click on Add Group button.
     */
    function handleAddGroupClick( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.row'); /* add group button row */
        jQuery(el).prop('disabled', true); /* disable the (only) add group button for now */

        /* Create a new condition group div, assign a group ID */
        var newId = getUID("grp");
        var condgroup = jQuery('<div class="conditiongroup"/>').attr('id', newId);
        condgroup.append('<div class="row"><div class="tblisttitle col-xs-6 col-sm-6"><span class="titletext"></span></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button id="saveconf" class="btn btn-xs btn-success">Save</button> <button id="revertconf" class="btn btn-xs btn-danger">Revert</button></div></div>');
        jQuery( 'span.titletext', condgroup ).text( "Group: " + newId ).on( 'click.reactor', handleTitleClick );
        jQuery("button#addgroup", condgroup).on( 'click.reactor', handleAddGroupClick );
        jQuery("button#saveconf", condgroup).on( 'click.reactor', handleSaveClick );

        /* Insert a new divider with "OR" caption */
        jQuery('<div class="row divider"><div class="col-sm-5"><hr></div><div class="col-sm-2 text-center"><h5>OR</h5></div><div class="col-sm-5"><hr></div></div>')
            .insertBefore(row);

        /* Create a condition row for the first condition in the group */
        var condId = getUID("cond");
        var cel = getConditionRow();
        cel.attr("id", condId);
        condgroup.append(cel); /* Add it to the conditiongroup */

        /* Add an "Add Condition" button for the new group */
        var b = jQuery('<div class="row buttonrow"><div class="col-xs-12 col-sm-12"><button class="addcond btn btn-sm btn-primary">Add Condition</button></div></div>');
        jQuery("button.addcond", b).prop('disabled',true); /* Add Cond is disabled to start */
        jQuery("button.addcond", b).on( 'click.reactor', handleAddConditionClick );
        condgroup.append(b); /* Add it to the conditiongroup */

        condgroup.insertBefore(row); /* Insert new conditiongroup */

        /* Add to group store and index */
        var newcond = { id: condId };
        var myid = api.getCpanelDeviceId();
        iData[myid].ixCond[condId] = newcond;
        iData[myid].ixGroup[newId] = { groupid: newId, groupconditions: [ newcond ] };
        iData[myid].cdata.conditions.push( iData[myid].ixGroup[newId] );

        configModified = true;
        updateConditionRow( cel );
    }

    /**
     * Handle click of sort (up/down) button on condition row.
     */
    function handleConditionSort( ev ) {
        var el = ev.currentTarget;
        if ( jQuery( el ).prop('disabled') ) {
            return;
        }
        var row = jQuery(el).closest('div.row');
        var up = jQuery(el).hasClass('action-up');
        var grpId = row.closest('div.conditiongroup').attr('id');
        var grp = iData[api.getCpanelDeviceId()].ixGroup[grpId];
        var condix = findCdataConditionIndex( row.attr('id'), grpId );
        var cond;
        if ( up ) {
            /* Move up. */
            if ( condix > 0 ) {
                /* Move up in data structure */
                cond = grp.groupconditions.splice( condix, 1 );
                grp.groupconditions.splice( condix-1, 0, cond[0] );

                /* Move up in display */
                var prior = row.prev(); /* find prior row */
                row.detach();
                row.insertBefore( prior );

                configModified = true;

                updateConditionRow( row ); /* pass it on */
            }
        } else {
            /* Move down */
            if ( condix < ( grp.groupconditions.length-1 ) ) {
                /* Move down is data structure */
                cond = grp.groupconditions.splice( condix, 1 );
                grp.groupconditions.splice( condix+1, 0, cond[0] );

                /* Move down in display */
                var next = row.next(); /* find next row */
                row.detach();
                row.insertAfter( next );

                configModified = true;

                updateConditionRow( row ); /* pass it on */
            }
        }
    }

    /**
     * Handle click on the condition delete tool
     */
    function handleConditionDelete( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest( 'div.row' );
        var condId = row.attr('id');
        var grpId = jQuery( el ).closest( 'div.conditiongroup' ).attr("id");
        var myid = api.getCpanelDeviceId();

        /* See if the condition is referenced in a sequence */
        var okDelete = false;
        var ixCond = iData[myid].ixCond;
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

        /* Find the index of the condition in its groupconditions */
        var grp = iData[myid].ixGroup[ grpId ];
        if ( undefined !== grp ) {
            for ( var ix=0; ix<grp.groupconditions.length; ++ix ) {
                if ( grp.groupconditions[ix].id == condId ) {
                    /* Remove the element from structures */
                    delete ixCond[ condId ];
                    grp.groupconditions.splice( ix, 1 );
                    if ( 0 === grp.groupconditions.length ) {
                        /* No more conditions. Delete the entire group from structures.
                           Note that this should never happen to the first group,
                           because the last condition in the first group is restricted
                           from deletion. */
                        var grpix = findCdataGroupIndex( grpId );
                        delete iData[myid].ixGroup[ grpId ];
                        iData[myid].cdata.conditions.splice( grpix, 1 );
                        /* Remove the entire conditiongroup from display. */
                        var grpEl = jQuery( el ).closest( 'div.conditiongroup' );
                        grpEl.prev().remove(); /* remove the OR divider above the group */
                        grpEl.remove(); /* remove the group */
                    } else {
                        /* Remove the condition row from display */
                        row.remove();
                    }
                    configModified = true;
                    updateControls();
                    return; /* fast exit */
                }
            }
        }
    }

    /**
     * Create an empty condition row. Only type selector is pre-populated.
     */
    function getConditionRow() {
        var el = jQuery('<div class="row conditionrow"></div>');
        el.append( '<div class="col-sm-2 condtype"><select class="form-control form-control-sm"><option value="">--choose--</option></select></div>' );
        el.append( '<div class="col-sm-9 params"></div>' );
        el.append( '<div class="col-sm-1 controls text-right"></div>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-up">arrow_upward</i>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-down">arrow_downward</i>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-delete">clear</i>');

        [ "comment", "service", "housemode", "sun", "weekday", "trange", "interval", "reload" ].forEach( function( k ) {
            jQuery( "div.condtype select", el ).append( jQuery( "<option/>" ).val( k ).text( condTypeName[k] ) );
        });

        jQuery('div.condtype select', el).on( 'change.reactor', handleTypeChange );
        jQuery('div.controls i.action-up', el).on( 'click.reactor', handleConditionSort );
        jQuery('div.controls i.action-down', el).on( 'click.reactor', handleConditionSort );
        jQuery('div.controls i.action-delete', el).on( 'click.reactor', handleConditionDelete );
        return el;
    }

    /**
     * Redraw the conditions from the current cdata
    */
    function redrawConditions() {
        jQuery('div#conditions').empty();

        var myid = api.getCpanelDeviceId();
        for (var ng=0; ng<(iData[myid].cdata.conditions || []).length; ++ng) {
            if ( ng > 0 ) {
                /* Insert divider */
                jQuery("div#conditions").append('<div class="row divider"><div class="col-sm-5"><hr></div><div class="col-sm-2 text-center"><h5>OR</h5></div><div class="col-sm-5"><hr></div></div>');
            }

            var grp = iData[myid].cdata.conditions[ng];
            if ( grp.groupid === undefined )
                grp.groupid = getUID("group");
            iData[myid].ixGroup[grp.groupid] = grp;

            /* Create div.conditiongroup and add conditions */
            var gel = jQuery('<div class="conditiongroup"></div>').attr("id", grp.groupid);
            gel.append('<div class="row"><div class="tblisttitle col-xs-6 col-sm-6 form-inline"><span class="titletext"></span> <label for="grpdisable"><input id="grpdisable" type="checkbox" class="form-check">&nbsp;Disabled</form></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button id="saveconf" class="btn btn-xs btn-success">Save</button> <button id="revertconf" class="btn btn-xs btn-danger">Revert</button></div></div>');
            jQuery( 'span.titletext', gel ).text( "Group: " + grp.groupid ).on( 'click.reactor', handleTitleClick );
            jQuery( 'input#grpdisable', gel ).prop( 'checked', grp.disabled )
                .on( 'change.reactor', function( ev ) {
                    var el = jQuery( ev.currentTarget );
                    var grpel = el.closest( 'div.conditiongroup' );
                    var grpid = grpel.attr( 'id' );
                    var grpconfig = iData[api.getCpanelDeviceId()].ixGroup[grpid];
                    if ( el.prop( 'checked' ) ) {
                        grpconfig.disabled = 1;
                        grpel.addClass( 'groupdisabled' );
                    } else {
                        delete grpconfig.disabled;
                        grpel.removeClass( 'groupdisabled' );
                    }
                    configModified = true;
                    updateSaveControls();
                });
            if ( grp.disabled ) {
                gel.addClass('groupdisabled');
            } else {
                gel.removeClass('groupdisabled');
            }
            for (var nc=0; nc<(grp.groupconditions || []).length; ++nc) {
                var cond = grp.groupconditions[nc];
                var row = getConditionRow();
                if ( cond.id === undefined )
                    cond.id = getUID("cond");
                row.attr("id", cond.id);
                iData[myid].ixCond[cond.id] = cond;
                var sel = jQuery('div.condtype select', row);
                if ( jQuery('option[value="' + cond.type + '"]', sel).length === 0 ) {
                    /* Condition type not on menu, probably a deprecated form. Insert it. */
                    sel.append('<option value="' + cond.type + '">' +
                        (condTypeName[cond.type] === undefined ? cond.type + ' (deprecated)' : condTypeName[cond.type] ) +
                        '</option>');
                }
                jQuery('div.condtype select', row).val( cond.type );
                setConditionForType( cond, row );
                gel.append( row );
            }

            /* Append "Add Condition" button */
            gel.append('<div class="row buttonrow"><div class="col-xs-12 col-sm-12"><button class="addcond btn btn-sm btn-primary">Add Condition</button></div></div>');

            /* Append the group */
            jQuery("div#conditions").append(gel);

            /* Activate the "Add Condition" button */
            jQuery("button.addcond", gel).on( 'click.reactor', handleAddConditionClick );
        }

        /* Insert add group button row (not a divider but looks similar) */
        jQuery("div#tab-conds.reactortab").append('<div class="row"><div class="col-sm-5"><hr></div>' +
            '<div class="col-sm-2 text-center"><button id="addgroup" class="btn btn-sm btn-primary">Add Group</button></div>' +
            '<div class="col-sm-5"><hr></div>' +
            '</div>');
        jQuery("button#addgroup").on( 'click.reactor', handleAddGroupClick );
        jQuery("button#saveconf").on( 'click.reactor', handleSaveClick );
        jQuery("button#revertconf").on( 'click.reactor', handleRevertClick );

        updateControls();
    }

    /**
     * Handle revert button click: restore setting to last saved and redisplay.
     */
    function handleRevertClick( ev ) {
        if ( ! confirm( "Discard changes and revert to last saved configuration?" ) ) {
            return;
        }
        
        loadConfigData( api.getCpanelDeviceId() );
        configModified = false;

        /* Be careful about which tab we're on here. */
        var ctx = jQuery( ev.currentTarget ).closest('div.reactortab').attr('id');
        if ( ctx === "tab-vars" ) {
            redrawVariables();
        } else if ( ctx === "tab-conds" ) {
            redrawConditions();
        } else if ( ctx === "tab-actions" ) {
            redrawActivities();
        } else {
            alert("OK, I did the revert, but now I'm lost. Go to the Status tab, and then come back to this tab.");
        }
    }

    /**
     * Remove all properies on condition except those in the exclusion list.
     */
    function removeConditionProperties( cond, excl ) {
        var elist = (excl || "").split(/,/);
        var emap = { id: true, type: true };
        for ( var ix=0; ix<elist.length; ++ix ) {
            emap[elist[ix]] = true;
        }
        for ( var prop in cond ) {
            if ( cond.hasOwnProperty( prop ) && emap[prop] === undefined ) {
                delete cond[prop];
            }
        }
    }

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

        /* Rip through conditions and clean up before saving */
        var ixCond = iData[myid].ixCond;
        for ( var condid in ixCond ) {
            if ( ixCond.hasOwnProperty( condid ) ) {
                var cond = ixCond[condid];
                switch ( cond.type ) {
                    case 'comment':
                        removeConditionProperties( cond, 'comment' );
                        break;
                    case 'service':
                        delete cond.comment;
                        cond.device = parseInt( cond.device );
                        break;
                    case 'housemode':
                        removeConditionProperties( cond, 'value' );
                        break;
                    case 'weekday':
                        removeConditionProperties( cond, 'operator,value' );
                        break;
                    case 'sun':
                        removeConditionProperties( cond, 'operator,value' );
                        break;
                    case 'trange':
                        removeConditionProperties( cond, 'operator,value' );
                        break;
                    case 'interval':
                        removeConditionProperties( cond, 'days,hours,mins,basetime,duty' );
                        break;
                    case 'reload':
                        removeConditionProperties( cond, "" );
                        break;
                    default:
                        /* Don't do anything */
                }
            }
        }

        /* Save to persistent state */
        iData[myid].cdata.timestamp = Math.floor( Date.now() / 1000 );
        api.setDeviceStateVariablePersistent( myid, serviceId, "cdata", JSON.stringify( iData[myid].cdata ),
        {
            'onSuccess' : function() {
                configModified = false;
                if ( undefined !== fnext ) {
                    fnext.apply( null, fargs );
                }
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
        });
    }

    /* Closing the control panel. */
    function onBeforeCpanelClose(args) {
        console.log( 'onBeforeCpanelClose args: ' + JSON.stringify(args) );
        if ( configModified && confirm( "You have unsaved changes! Press OK to save them, or Cancel to discard them." ) ) {
            handleSaveClick( undefined );
        }
        configModified = false;
    }

    function relativeTime( dt ) {
        if ( 0 === dt || undefined === dt ) {
            return "";
        }
        var dtms = dt * 1000;
        var ago = Math.floor( ( Date.now() - dtms ) / 1000 );
        if ( ago < 86400 ) {
            return new Date(dtms).toLocaleTimeString();
        }
        return new Date(dtms).toLocaleString();
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
        var device = jQuery( 'select#devices', ct ).val() || "";
        if ( "" === device ) {
            alert("Please select a device first.");
            return;
        }
        sendDeviceData( device );
        /* If device has a parent, or has children, send them as well */
        var dobj = getDeviceObject( device );
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

    function doTools()
    {
        console.log("doTools()");

        if ( configModified && confirm( "You have unsaved changes. Press OK to save them, or Cancel to discard them." ) ) {
            handleSaveClick( undefined );
        }

        initModule();

        var html = "";

        html = '<style>';
        html += 'div#reactortools.reactortab input.narrow { max-width: 8em; }';
        html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
        html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
        html += '</style>';
        jQuery('head').append( html );

        html = '<div id="reactortools" class="reactortab">';
        html += '<h3>Test Tools</h3>';

        html += '<div class="row">';
        html += '<div class="col-sm-2 col-md-4 col-lg-3 col-xl-2"><label for="testdateenable"><input type="checkbox" value="1" id="testdateenable">&nbsp;Test&nbsp;Date:</label></div>';
        html += '<div class="col-sm-10 col-md-8 col-lg-9 col-xl-10 form-inline"><select id="testyear" class="form-control form-control-sm"></select><select id="testmonth" class="form-control form-control-sm"></select><select class="form-control form-control-sm" id="testday"></select><input class="narrow form-control form-control-sm" id="testtime"></div>';
        html += '</div>'; /* row */

        html += '<div class="row">';
        html += '<div class="col-sm-2 col-md-4 col-lg-3 col-xl-2"><label for="testhousemode"><input type="checkbox" value="1" id="testhousemode">&nbsp;Test&nbsp;House&nbsp;Mode</label></div>';
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

        try {
            html += '<div id="sundata">';
            html += "Today's sun timing is: ";
            var sd = getParentState( "sundata" );
            var sundata = JSON.parse( sd );
            html += " sunrise/sunset=" + ( new Date(sundata.sunrise*1000) ).toLocaleTimeString() + "/" + ( new Date(sundata.sunset*1000) ).toLocaleTimeString();
            html += ", civil dawn/dusk=" + ( new Date(sundata.civdawn*1000) ).toLocaleTimeString() + "/" + ( new Date(sundata.civdusk*1000) ).toLocaleTimeString();
            html += ", nautical dawn/dusk=" + ( new Date(sundata.nautdawn*1000) ).toLocaleTimeString() + "/" + ( new Date(sundata.nautdusk*1000) ).toLocaleTimeString();
            html += ", astronomical dawn/dusk=" + ( new Date(sundata.astrodawn*1000) ).toLocaleTimeString() + "/" + ( new Date(sundata.astrodusk*1000) ).toLocaleTimeString();
            html += '.';
            html += '</div>';
        } catch (exc) {
            html += "<div>Can't display sun data: " + exc.toString() + "</div>";
        }

        html += '<div><h3>Update Device Information Database</h3>The device information database contains information to help smooth out the user interface for device actions. It is recommended that you keep this database up to date by updating it periodically. The "Activities" tab will notify you when your database is out of date. You update by clicking the button below. Updates apply to all ReactorSensors, so you only need to do them on one. This process sends information about the versions of your Vera firmware, this plugin, and the current database, but no personally-identifying information. This information is used to select the correct database for your configuration only; it is not used for other analysis or any tracking. <p><button id="updateinfo" class="btn btn-sm btn-success">Update Device Info</button> <span id="status"/></p>';

        /* This features doesn't work on openLuup -- old form of lu_device request isn't implemented */
        if ( !isOpenLuup ) {
            html += '<div id="enhancement" class="form-inline"><h3>Submit Device Data</h3>If you have a device that is missing "Common Actions" or warns you about missing enhancement data in the Activities tab (actions in <i>italics</i>), you can submit the device data to rigpapa for evaluation. This process sends the relevant data about the device. It does not send any identifying information about you or your Vera, and the data is used only for enhancement of the device information database. <p><select id="devices"></select> <button id="submitdata" class="btn btn-sm btn-info">Submit Device Data</button></p></div>';
        }

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
        var s = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "TestTime" );
        jQuery('input#testdateenable', container).prop('checked', false);
        jQuery('select#testyear,select#testmonth,select#testday,input#testtime', container).prop('disabled', true);
        if ( s !== "" ) {
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
        var mode = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "TestHouseMode" );
        jQuery('input#testhousemode', container).prop('checked', false);
        jQuery('select#mode', container).prop('disabled', true);
        if ( mode !== "" ) {
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
            }).fail( function( x, y, z ) {
                msg.text( "The update failed; Vera busy/restarting. Try again in a moment." );
            });
        });
    }

    function updateStatus( pdev ) {
        var el;
        console.log("**** updateStatus() ****");
        var stel = jQuery('div#reactorstatus');
        if ( stel.length === 0 || !inStatusPanel ) {
            /* If not displayed, do nothing. */
            return;
        }
        stel.empty();

        var cdata = loadConfigData( pdev );
        if ( undefined === cdata ) {
            console.log("cdata unavailable");
            return;
        }

        var s = api.getDeviceState( pdev, serviceId, "cstate" ) || "";
        var cstate = {};
        if ( "" !== s ) {
            try {
                cstate = JSON.parse( s );
            } catch (e) {
                console.log("cstate cannot be parsed: " + String(e));
            }
        } else {
            console.log("cstate unavailable");
        }

        var hasVariables = false;
        var grpel;
        for ( var nn in cdata.variables ) {
            if ( cdata.variables.hasOwnProperty( nn ) ) {
                if ( ! hasVariables ) {
                    grpel = jQuery('<div class="reactorgroup" id="variables">');
                    hasVariables = true;
                }
                var vd = cdata.variables[nn];
                el = jQuery( '<div class="row var" id="' + vd.name + '"></div>' );
                var vv = api.getDeviceState( pdev, "urn:toggledbits-com:serviceId:ReactorValues", vd.name ) || "(undefined)";
                var ve = api.getDeviceState( pdev, "urn:toggledbits-com:serviceId:ReactorValues", vd.name + "_Error" ) || "";
                el.append( jQuery('<div class="col-sm-6 col-md-2"></div>').text(vd.name) );
                el.append( jQuery('<div class="col-sm-12 col-md-7 tb-sm"></div>').text(vd.expression) );
                el.append( jQuery('<div class="col-sm-6 col-md-3"></div>').text(ve !== "" ? ve : vv) );
                grpel.append( el );
            }
        }
        if ( hasVariables ) {
            stel.append( grpel );
        }

        for ( var i=0; i<(cdata.conditions || []).length; i++ ) {
            var grp = cdata.conditions[i];

            if ( i > 0 ) {
                /* Insert a divider */
                stel.append('<div class="row divider"><div class="col-sm-5 col-md-5"><hr></div><div class="col-sm-2 col-md-2" style="text-align: center;"><h5>OR</h5></div><div class="col-sm-5 col-md-5"><hr></div></div>');
            }

            grpel = jQuery('<div class="reactorgroup" id="' + grp.groupid + '">');
            if ( grp.disabled ) {
                grpel.addClass( 'groupdisabled' );
            } else {
                grpel.removeClass( 'groupdisabled' );
            }
            stel.append( grpel );
            var groupstate = true;
            for ( var j=0; j<(grp.groupconditions || []).length; j++ ) {
                var cond = grp.groupconditions[j];
                el = jQuery('<div class="row cond" id="' + cond.id + '"></div>');
                var currentValue = ( cstate[cond.id] || {} ).lastvalue;

                el.append('<div class="col-sm-6 col-md-2">' +
                    ( condTypeName[ cond.type ] !== undefined ? condTypeName[ cond.type ] : cond.type ) +
                    '</div>');

                var condDesc = makeConditionDescription( cond );
                switch ( cond.type ) {
                    case 'service':
                        if ( ( cond.repeatcount || 0 ) > 1 ) {
                            condDesc += " repeats " + cond.repeatcount + " times within " + cond.repeatwithin + " secs";
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
                            currentValue = new Date( currentValue * 1000 ).toLocaleString();
                        }
                        break;

                    case 'interval':
                        currentValue = new Date( currentValue * 1000 ).toLocaleString();
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
                el.append( jQuery('<div class="col-sm-6 col-md-6"></div>').text( condDesc ) );

                /* Append current value and condition state */
                if ( cond.type !== "comment" ) {
                    if ( currentValue !== undefined ) {
                        var cs = cstate[cond.id];
                        el.append('<div class="currentvalue col-sm-6 col-md-4">(' +
                            currentValue + ') ' +
                            ( cs.laststate ? "true" : "false" ) +
                            ' as of ' + relativeTime( cs.statestamp ) +
                            ( ( cond.latch || false ) && cs.evalstate && !cs.laststate ? " (latched true)" : "" ) +
                            '</div>' );
                        if ( "service" === cond.type && ( cond.repeatcount || 0 ) > 1 ) {
                            if ( cs.repeats !== undefined && cs.repeats.length > 1 ) {
                                var dtime = cs.repeats[ cs.repeats.length - 1 ] - cs.repeats[0];
                                jQuery("div.currentvalue", el).append( " (last " + cs.repeats.length + " span " + dtime + " secs)" );
                            }
                        }
                        if ( cs.evalstate ) {
                            el.addClass( "truecond" ).removeClass("falsecond");
                        } else {
                            el.addClass( "falsecond" ).removeClass("truecond");
                        }
                        groupstate = groupstate && cs.evalstate;
                    } else {
                        el.append( '<div class="col-sm-6 col-md-4">(unknown)</div>' );
                        groupstate = false;
                    }
                }

                grpel.append( el );
            }

            if (groupstate) {
                grpel.addClass("truestate");
            }
        }
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
                updateStatus( pdev );
            }
        }
    }

    function doStatusPanel()
    {
        console.log("doStatusPanel()");
        /* Make sure changes are saved. */
        if ( configModified && confirm( "You have unsaved changes! Press OK to save them, or Cancel to discard them." ) ) {
            handleSaveClick( undefined );
        }

        initModule();

        /* Our styles. */
        var html = "<style>";
        html += 'div.reactorgroup { border-radius: 8px; border: 2px solid #006040; padding: 8px; }';
        html += 'div.reactorgroup.groupdisabled { background-color: #ccc !important; color: #000 !important }';
        html += '.truestate { background-color: #ccffcc; }';
        html += '.row.cond { min-height: 2em; }';
        html += '.row.var { min-height: 2em; color: #003399; }';
        html += '.tb-sm { font-family: Courier,Courier New,monospace; font-size: 0.9em; }';
        html += 'div.truecond { color: #00aa00; font-weight: bold; }';
        html += 'div.falsecond { color: #000000; }';
        html += "</style>";
        jQuery("head").append( html );

        api.setCpanelContent( '<div id="reactorstatus" class="reactortab"></div>' );

        api.registerEventHandler('on_ui_deviceStatusChanged', ReactorSensor, 'onUIDeviceStatusChanged');
        inStatusPanel = true; /* Tell the event handler it's OK */

        updateStatus( api.getCpanelDeviceId() );
    }

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
        /* JSON may save and restore an empty object as an array; fix type. */
        if ( Array.isArray( cd.variables ) ) {
            cd.variables = {};
        }

        jQuery('.tberror', container).removeClass( 'tberror' );
        jQuery('div.varexp', container).each( function( ix, obj ) {
            var row = jQuery(obj);
            var vname = row.attr("id");
            if ( undefined === vname ) return;
            var expr = jQuery('textarea.expr', row).val();
            if ( expr === "" ) {
                jQuery('textarea.expr', row).addClass('tberror');
            }
            if ( cd.variables[vname] === undefined ) {
                cd.variables[vname] = { name: vname, expression: expr };
                configModified = true;
            } else if ( cd.variables[vname].expression !== expr ) {
                cd.variables[vname].expression = expr;
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

    function getVariableRow() {
        var editrow = jQuery('<div class="row varexp"></div>');
        editrow.append( '<div id="varname" class="col-xs-12 col-sm-12 col-md-2"></div>' );
        editrow.append( '<div class="col-xs-11 col-sm-11 col-md-9"><textarea class="expr form-control form-control-sm" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="off"/></div>' );
        editrow.append( '<div class="col-xs-1 col-sm-1 col-md-1 text-right"><i id="tryexpr" class="material-icons md-btn" title="Try this expression">directions_run</i><i id="deletevar" class="material-icons md-btn">clear</i></div>' );
        jQuery( 'textarea.expr', editrow ).on( 'change.reactor', handleVariableChange );
        jQuery( 'i#tryexpr', editrow ).prop('disabled', true).on('click.reactor', handleTryExprClick);
        jQuery( 'i#deletevar', editrow ).prop('disabled', true).on('click.reactor', handleDeleteVariableClick);
        return editrow;
    }

    function handleAddVariableClick() {
        var container = jQuery('div#reactorvars');

        var editrow = getVariableRow();
        jQuery( 'div.varexp textarea.expr,i.md-btn', container ).prop( 'disabled', true );
        jQuery( 'button#addvar', container ).prop( 'disabled', true );
        jQuery( 'textarea.expr', editrow ).prop('disabled', true);
        jQuery( 'div#varname', editrow ).empty().append( '<input class="form-control form-control-sm" title="Enter a variable name and then TAB out of the field.">' );
        jQuery( 'div#varname input', editrow ).on('change.reactor', function( ev ) {
            /* Convert to regular row */
            var f = jQuery( ev.currentTarget );
            var vname = f.val() || "";
            if ( vname === "" || jQuery( 'div.varexp#' + vname ).length > 0 || !vname.match( /^[A-Z][A-Z0-9_]*$/i ) ) {
                f.addClass('tberror');
                f.closest('.row').addClass( 'tberror' );
                f.focus();
            } else {
                var row = f.closest( 'div.varexp' ).attr('id', vname).removeClass('editrow').removeClass('tberror');
                jQuery( '.tberror', row ).removeClass('editrow');
                /* Remove the name input field and swap in the name (text) */
                f.parent().empty().text(vname);
                /* Re-enable fields and add button */
                jQuery( 'div.varexp textarea.expr,i.md-btn', container ).prop('disabled', false);
                jQuery( 'button#addvar', container ).prop( 'disabled', false );
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
        var cdata = iData[api.getCpanelDeviceId()].cdata;
        for ( var vn in cdata.variables ) {
            if ( cdata.variables.hasOwnProperty( vn ) ) {
                var vd = cdata.variables[vn];
                var el = getVariableRow();
                el.attr('id', vn);
                jQuery( 'div#varname', el).text( vn );
                jQuery( 'textarea.expr', el ).val( vd.expression );
                gel.append( el );
            }
        }

        /* Add "Add" button */
        gel.append('<div class="row buttonrow">' +
            '<div class="col-xs-12 col-sm-12"><button id="addvar" class="btn btn-sm btn-primary">Add Variable/Expression</button> Need help? Check out the <a href="https://www.toggledbits.com/reactor" target="_blank">documentation</a> or ask in the <a href="http://forum.micasaverde.com/index.php/board,93.0.html" target="_blank">Vera forums</a>.</div>' +
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
            if ( configModified && confirm( "You have unsaved changes. Press OK to save them, or Cancel to discard them." ) ) {
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
            html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
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

    function doConditions()
    {
        console.log("doConditions()");
        try {
            if ( configModified && confirm( "You have unsaved changes. Press OK to save them, or Cancel to discard them." ) ) {
                handleSaveClick( undefined );
            }

            initModule();

            /* Load material design icons */
            jQuery("head").append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');

            /* Our styles. */
            var html = "<style>";
            html += "div#tab-conds.reactortab .tb-about { margin-top: 24px; }";
            html += "div#tab-conds.reactortab .color-green { color: #006040; }";
            html += 'div#tab-conds.reactortab .tberror { border: 1px solid red; }';
            html += 'div#tab-conds.reactortab .tbwarn { border: 1px solid yellow; background-color: yellow; }';
            html += 'div#tab-conds.reactortab div.warning { color: red; }';
            html += 'div#tab-conds.reactortab i.md-btn:disabled { color: #cccccc; cursor: auto; }';
            html += 'div#tab-conds.reactortab i.md-btn[disabled] { color: #cccccc; cursor: auto; }';
            html += 'div#tab-conds.reactortab i.md-btn { color: #004020; font-size: 14pt; cursor: pointer; }';
            html += 'div#tab-conds.reactortab input.tbinvert { min-width: 16px; min-height: 16px; }';
            html += 'div#tab-conds.reactortab div.conditions { width: 100%; }';
            html += 'div#tab-conds.reactortab div.tblisttitle { background-color: #006040; color: #fff; padding: 8px; min-height: 42px; }';
            html += 'div#tab-conds.reactortab div.tblisttitle span.titletext { font-size: 16px; font-weight: bold; margin-right: 4em; }';
            html += 'div#tab-conds.reactortab input.narrow { max-width: 8em; }';
            html += 'div#tab-conds.reactortab input.tiny { max-width: 3em; }';
            html += 'div#tab-conds.reactortab input.titleedit { font-size: 12px; height: 24px; }';
            html += 'div#tab-conds.reactortab div.conditiongroup { border-radius: 8px; border: 2px solid #006040; margin-bottom: 8px; }';
            html += 'div#tab-conds.reactortab div.conditiongroup.groupdisabled { background-color: #ccc !important; color: #000 !important }';
            html += 'div#tab-conds.reactortab label[for="grpdisable"] { font-size: 0.9em; }';
            html += 'div#tab-conds.reactortab div.conditiongroup .row { margin-right: 0px; margin-left: 0px; }';
            html += 'div#tab-conds.reactortab div.conditiongroup div.conditionrow:nth-child(odd) { background-color: #e6ffe6; }';
            html += 'div#tab-conds.reactortab div.conditionrow,div.buttonrow { padding: 8px; }';
            html += 'div#tab-conds.reactortab div.conditionrow.tbmodified:not(.tberror) { border-left: 4px solid green; }';
            html += 'div#tab-conds.reactortab div.conditionrow.tberror { border-left: 4px solid red; }';
            html += 'div#tab-conds.reactortab div.divider h5 { font-size: 24px; font-weight: bold; }';
            html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
            html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
            html += "</style>";
            jQuery("head").append( html );

            /* Body content */
            html = '<div id="tab-conds" class="reactortab">';
            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Conditions</h3></div></div>';
            html += '<div class="row"><div class="col-xs-12 col-sm-12">Conditions within a group are "AND", and groups are "OR". That is, the sensor will trip when any group succeeds, and for a group to succeed, all conditions in the group must be met.</div></div>';

            var rr = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "Retrigger" ) || "0";
            if ( rr !== "0" ) {
                html += '<div class="row"><div class="warning col-xs-12 col-sm-12">WARNING! Retrigger is on! You should avoid using time-related conditions in this ReactorSensor, as they may cause retriggers frequent retriggers!</div></div>';
            }

            html += '<div id="conditions"/>';

            html += '</div>'; /* #tab-conds */

            html += footer();

            api.setCpanelContent(html);

            redrawConditions();

            api.registerEventHandler('on_ui_cpanel_before_close', ReactorSensor, 'onBeforeCpanelClose');
        }
        catch (e)
        {
            console.log( 'Error in ReactorSensor.doConditions(): ' + String( e ) );
            alert( e.stack );
        }
    }

    function doSettings() {}

    function makeSceneMenu() {
        var ud = api.getUserData();
        var scenes = api.cloneObject( ud.scenes );
        var menu = jQuery( '<select class="form-control form-control-sm" />' );
        /* If lots of scenes, sort by room; otherwise, use straight as-is */
        var i;
        if ( scenes.length > 10 ) {
            var rooms = api.cloneObject( ud.rooms );
            var rid = {};
            for ( i=0; i<rooms.length; ++i ) {
                rid[rooms[i].id] = rooms[i];
            }
            rid[0] = { id: 0, name: "(no room)" };
            scenes.sort( function( a, b ) {
                if ( rid[a.room].name == rid[b.room].name ) {
                    /* Same room */
                    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
                }
                return rid[a.room].name.toLowerCase() < rid[b.room].name.toLowerCase() ? -1 : 1;
            });
            var lastRoom = -1;
            var el;
            for ( i=0; i<scenes.length; i++ ) {
                if ( scenes[i].room != lastRoom ) {
                    menu.append('<option value="" class="optheading" disabled>' + "--" + rid[scenes[i].room].name + "--</option>");
                    lastRoom = scenes[i].room;
                }
                el = jQuery( '<option/>' );
                el.val( scenes[i].id );
                el.text( scenes[i].name + ' (#' + scenes[i].id + ')' );
                menu.append( el );
            }
        } else {
            /* Simple alpha list */
            scenes.sort( function(a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; } );
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
        row.removeClass( 'tberror' );

        switch ( actionType ) {
            case "comment":
                break;

            case "delay":
                var delay = jQuery( 'input#delay', row ).val() || "";
                if ( delay.match( /\{[^}]+\}/i ) ) {
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
                var dev = jQuery( 'select.devicemenu', row ).val() || "";
                if ( "" === dev ) {
                    jQuery( 'select.devicemenu', row ).addClass( 'tberror' );
                } else {
                    var devnum = parseInt( dev );
                    var sact = jQuery('select#actionmenu', row).val() || "";
                    if ( "" === sact ) {
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
                            console.log('validateActionRow: no info for ' + sact + ' device ' + devnum);
                            jQuery( 'select.devicemenu', row ).addClass('tberror');
                            ai = {};
                        }
                        for ( var k=0; k < (ai.parameters || [] ).length; k++ ) {
                            var p = ai.parameters[k];
                            if ( undefined === p.value ) { /* ignore fixed value */
                                /* Fetch value */
                                var field = jQuery( '#' + p.name, row );
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
                                    field.addClass( 'tberror' );
                                } else if ( v.match( /\{[^}]+\}/ ) ) {
                                    /* Variable reference, do nothing, can't check */
                                } else {
                                    // check value type, range?
                                    // ??? subtypes? like RGB
                                    var typ = p.type || p.dataType || "string";
                                    if ( typ.match( /^u?i[124]$/i ) ) {
                                        /* Integer. Watch for RGB spec of form #xxx or #xxxxxx */
                                        v = v.replace( /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "0x\\1\\1\\2\\2\\3\\3" );
                                        v = v.replace( /^#[0-9a-f]{6,8}$/, "0x" );
                                        v = parseInt( v );
                                        if ( undefined === inttypes[typ] ) {
                                            console.log( "validateActionRow: no type data for " + typ );
                                        } else if ( isNaN(v) || ( v < inttypes[typ].min ) || ( v > inttypes[typ].max ) ||
                                            ( undefined !== p.min && v < p.min ) || ( undefined != p.max && v > p.max ) ) {
                                            field.addClass( 'tberror' ); // ???explain why?
                                        }
                                    } else if ( "r4" === typ ) {
                                        /* Float */
                                        v = parseFloat( v );
                                        if ( isNaN( v ) || ( undefined !== p.min && v < p.min ) || ( undefined !== p.max && v > p.max ) ) {
                                            field.addClass( 'tberror' );
                                        }
                                    } else if ( "string" !== typ ) {
                                        /* Hmmm */
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
                var sc = jQuery( 'select#scene', row ).val() || "";
                if ( "" === sc ) {
                    jQuery( 'select#scene' ).addClass( "tberror" );
                }
                break;

            case "runlua":
                var lua = jQuery( 'textarea.luacode', row ).val() || "";
                // check Lua?
                if ( lua.match( /^[\r\n\s]*$/ ) ) {
                    jQuery( 'textarea.luacode', row ).addClass( "tberror" );
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
        var scene = { isReactorScene: true, name: root.attr('id'), groups: [] };
        var group = { actions: [] };
        scene.groups.push( group );
        var firstScene = true;
        jQuery( 'div.actionrow', root ).each( function( ix ) {
            var row = $( this );
            var actionType = jQuery( 'select#actiontype', row ).val();
            var action = { type: actionType, index: ix+1 };
            var k, pt, t;

            switch ( actionType ) {
                case "comment":
                    action.comment = jQuery( 'input.argument', row ).val() || "";
                    break;

                case "delay":
                    t = jQuery( 'input#delay', row ).val() || "0";
                    if ( t.match( /^\{[^}]+\}$/ ) ) {
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
                    var dobj = getDeviceObject( action.device );
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
                                // Fixed value
                                pt.value = ai.parameters[k].value;
                            } else {
                                /* Ignore default here, it's assumed to be valid when needed */
                                t = jQuery( '#' + ai.parameters[k].name, row ).val() || "";
                                if ( "" === t ) {
                                    if ( ai.parameters[k].optional ) {
                                        continue; /* skip it, not even on the list */
                                    }
                                    console.log("buildActionList: " + action.service + "/" +
                                        action.action + " required parameter " +
                                        ai.parameters[k].name + " has no value");
                                    scene = false;
                                    return false;
                                }
                                pt.value = t;
                            }
                            action.parameters.push( pt );
                        }
                    } else {
                        /* No action info; build using fields directly */
                        console.log( "Can't find actioninfo for " + t );
                        jQuery( '.argument', row ).each( function() {
                            var val = jQuery( this ).val() || "";
                            if ( val !== "" ) {
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
                        action.encoded_lua = true;
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
        var tcf = buildActionList( jQuery( 'div#tripactions') );
        var ucf = buildActionList( jQuery( 'div#untripactions') );
        if ( tcf && ucf ) {
            var myid = api.getCpanelDeviceId();
            /* If either "scene" has no actions, just delete the config */
            if ( tcf.groups.length == 1 && tcf.groups[0].actions.length == 0 ) {
                delete iData[myid].cdata.tripactions;
            } else {
                iData[myid].cdata.tripactions = tcf;
            }
            if ( ucf.groups.length == 1 && ucf.groups[0].actions.length == 0 ) {
                delete iData[myid].cdata.untripactions;
            } else {
                iData[myid].cdata.untripactions = ucf;
            }
            /* Save has async action, so use callback to complete. */
            handleSaveClick( ev, function() {
                if ( !configModified ) { /* successful save? */
                    jQuery( 'div.actionlist.tbmodified' ).removeClass( "tbmodified" );
                    jQuery( 'div.actionlist .tbmodified' ).removeClass( "tbmodified" );
                    /* Scene refs are upgraded to actions, so delete old on save */
                    api.setDeviceStateVariablePersistent( api.getCpanelDeviceId(), serviceId, "Scenes", "" );
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

    function changeActionRow( row ) {
        console.log("changeActionRow: updating cached config");
        configModified = true;
        row.addClass( "tbmodified" );
        jQuery( 'div.actionlist' ).addClass( "tbmodified" ); // all lists, because save saves all.
        validateActionRow( row );
        var section = row.closest( 'div.actionlist' );
        var scene = buildActionList( section );
        if ( scene ) {
            var sn = section.attr('id');
            var myid = api.getCpanelDeviceId();
            iData[myid].cdata[sn] = scene;
        }

        updateActionControls();
    }

    function handleActionValueChange( ev ) {
        var row = jQuery( ev.currentTarget ).closest( 'div.actionrow' );
        changeActionRow( row );
    }

    function appendVariables( menu ) {
        var cd = iData[ api.getCpanelDeviceId() ].cdata;
        var first = true;
        for ( var vname in (cd.variables||{}) ) {
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
        if ( ( newVal || "" ) === "" ) {
            return;
        }
        var action = actions[newVal];
        /* Check for device override to service/action */
        var devNum = parseInt( jQuery( 'select.devicemenu', ct ).val() );
        if ( !isNaN(devNum) && action && action.deviceOverride && action.deviceOverride[devNum] ) {
            console.log("changeActionAction: using device override for " + String(devNum));
            action = action.deviceOverride[devNum];
        }
        if ( undefined !== action ) {
            /* Info assist from our enhancement data */
            for ( var k=0; k<( action.parameters || [] ).length; ++k ) {
                var opt, j;
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
                        var dlid = (action.service + '-' + action.name + '-' + parm.name).replace( /[^a-z0-9-]/ig, "-" );
                        if ( 0 == jQuery( 'datalist#'+dlid ).length ) {
                            /* Datalist doesn't exist yet, create it */
                            inp = jQuery('<datalist class="argdata" id="' + dlid + '"/>');
                            for ( j=0; j<parm.values.length; j++ ) {
                                opt = jQuery( '<option/>' );
                                if ( "object" === typeof(parm.values[j]) ) {
                                    for ( var z in parm.values[j] ) {
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
                                for ( var z in parm.values[j] ) {
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
        var devobj = getDeviceObject( devnum );
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
                                    devobj = getDeviceObject( refdev );
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
                                v = stack.pop() || null; /* peek??? */
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
                        jQuery( 'div.supportlinks p#noenh' ).show();
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

                    opt = jQuery('<option></option>').val( key ).text( actname );
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
                    if ( undefined === deviceInfo.services[devact.service] || undefined == deviceInfo.services[devact.service].actions[devact.action] ) {
                        /* Service/action in device exception not "real". Fake it real good. */
                        deviceInfo.services[devact.service] = deviceInfo.services[devact.service] || { actions: {} };
                        deviceInfo.services[devact.service].actions[devact.action] = { name: devact.action, deviceOverride: {} };
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
                    known.append( jQuery('<option/>').val( key ).text( act.description || act.action ) );
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
        if ( "" == exopts ) {
            exopts = getParentState( "AceOptions" ) || "";
        }
        if ( exopts !== "" ) {
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
                ct.append('<input type="text" id="comment" class="argument form-control form-control-sm" placeholder="Enter comment text">');
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
                ct.append('<label for="delay">for <input id="delay" type="text" class="argument narrow form-control form-control-sm" title="Enter delay time as seconds, MM:SS, or HH:MM:SS" placeholder="delay time" list="reactorvarlist"></label>');
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
                if ( typeof(ace) != "undefined" ) {
                    doEditor( jQuery( 'textarea.luacode', ct ) );
                } else {
                    jQuery( 'textarea.luacode', ct ).on( 'change.reactor', handleActionValueChange );
                }
                ct.append('<div class="tbhint">Your Lua code must return boolean <em>true</em> or <em>false</em>. Action execution will stop if anything other than boolean true, or nothing, is returned by your code (this is a feature). It is also recommended that the first line of your Lua be a comment with text to help you identify the code--if there\'s an error logged, the first line of the script is almost always shown. Also, you can use the <tt>print()</tt> function to write to Reactor\'s event log, which is shown in the Logic Summary and easier/quicker to get at than the Vera logs.</div>');
                break;
                
            default:
                ct.append('<div class="tberror">Type ' + newVal + '???</div>');
        }
    }

    function handleActionChange( ev ) {
        configModified = true;
        var row = jQuery( ev.currentTarget ).closest( '.actionrow' );
        var newVal = jQuery( 'select#actiontype', row ).val();
        changeActionType( row, newVal );
        changeActionRow( row );
    }

    function handleControlClick( ev ) {
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
                row.remove();
                changeActionRow( row );
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
                                actionText += "{"+p.name+"="+String(p.value)+"}, ";
                            } else {
                                var v = jQuery( '#' + p.name, row ).val() || "";
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
                        /* Sort groups by delay ascending */
                        data.groups = data.groups || [];
                        data.groups.sort( function( a, b ) { return (a.delay||0) - (b.delay||0); });
                        for ( var ig=0; ig<(data.groups || []).length; ig++ ) {
                            var newRow;
                            var gr = data.groups[ig];
                            if ( 0 === ig && "" !== (data.lua || "") ) {
                                /* First action in first group is scene Lua if it's there */
                                var lua = (data.encoded_lua || 0) != 0 ? atob(data.lua) : data.lua;
                                newRow = getActionRow();
                                jQuery( "select#actiontype", newRow).val( "runlua" );
                                changeActionType( newRow, "runlua" );
                                jQuery( "textarea.luacode", newRow ).val( lua ).trigger( "reactorinit" );
                                pred = newRow.addClass( "tbmodified" ).insertAfter( pred );
                            }
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
                                        if ( 0 === jQuery( '#' + a.name, row ).length ) {
                                            var inp = jQuery( '<input class="argument form-control form-control-sm">' ).attr('id', a.name);
                                            var lbl = jQuery( '<label/>' ).attr('for', a.name).text(a.name).addClass('tbrequired').append(inp);
                                            jQuery( 'div.actiondata', row ).append( lbl );
                                        }
                                        jQuery( '#' + a.name, row ).val( a.value || "" );
                                    }
                                }, [ newRow, act ]);
                            }

                            /* All actions inserted. Remove original row. */
                            row.remove();
                            configModified = true;
                            changeActionRow( row );
                        }
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
        jQuery( 'i.md-btn', controls ).on( 'click.reactor', handleControlClick );
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

    function loadActions( setName, scene ) {
        var section = jQuery( 'div#' + setName );
        var newRow;
        for ( var i=0; i < (scene.groups || []).length; i++ ) {
            var gr = scene.groups[i];
            if ( 0 !== (gr.delay || 0) ) {
                newRow = getActionRow();
                jQuery( "select#actiontype", newRow ).val( "delay" );
                changeActionType( newRow, "delay" );
                jQuery( "input#delay", newRow ).val( gr.delay );
                jQuery( "select#delaytype", newRow ).val( gr.delayType || "inline" );
                newRow.insertBefore( jQuery( '.buttonrow', section ) );
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
                                if ( false && 0 === jQuery( '#' + action.parameters[j].name, row ).length ) {
                                    var inp = jQuery( '<input class="argument form-control form-control-sm">' ).attr('id', action.parameters[j].name);
                                    var lbl = jQuery( '<label/>' ).attr('for', action.parameters[j].name).text(action.parameters[j].name).addClass('tbrequired').append(inp);
                                    jQuery( 'div.actiondata', row ).append( lbl );
                                }
                                jQuery( '#' + action.parameters[j].name, row ).val( action.parameters[j].value || "" );
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
                            lua = act.encoded_lua ? atob( act.lua ) : act.lua;
                        }
                        jQuery( 'textarea.luacode', newRow ).val( lua ).trigger( 'reactorinit' );
                        break;
                        
                    default:
                        console.log("loadActions: what's a " + act.type + "? Skipping it!");
                        alert( "Action type " + act.type + " unknown, skipping. Did you downgrade from a higher version of Reactor?" );
                        continue;
                }

                newRow.insertBefore( jQuery( '.buttonrow', section ) );
            }
        }
    }

    /* Redraw the activities lists within the existing tab structure. */
    function redrawActivities() {
        var cd = iData[api.getCpanelDeviceId()].cdata;
        jQuery( 'div#tripactions div.actionrow' ).remove();
        loadActions( 'tripactions', cd.tripactions || {} );
        jQuery( 'div#untripactions div.actionrow' ).remove();
        loadActions( 'untripactions', cd.untripactions || {} );
        updateActionControls();
    }

    /* Set up the Activities tab */
    function doActivities()
    {
        console.log("doActivities()");
        var myid = api.getCpanelDeviceId();

        try {
            if ( configModified && confirm( "You have unsaved changes. Press OK to save them, or Cancel to discard them." ) ) {
                handleSaveClick( undefined );
            }

            jQuery( 'div#tbcopyright' ).append( ' <span id="deviceinfoinfo">Device Info serial ' + deviceInfo.serial + '</span>' );
            jQuery( 'div.supportlinks' ).append( '<p id="noenh">[1] This device/action does not have enhancement data available. Please report this device in the Reactor forum thread for device reports.</p>' );
            jQuery( 'div.supportlinks p#noenh' ).hide();

            var cd = iData[myid].cdata;

            /* Restore old-style selected scenes */
            var rr = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "Scenes" ) || "";
            if ( rr !== "" ) {
                var selected = rr.split( /,/ );
                var ts = parseInt( selected.shift() );
                var us = selected.length > 0 ? parseInt( selected.shift() ) : NaN;
                if ( !isNaN(ts) ) {
                    if ( undefined === cd.tripactions )
                        cd.tripactions = { isReactorScene: true, groups: [ { actions:[] } ] };
                    if ( 0 === (cd.tripactions.groups || []).length )
                        cd.tripactions.groups = [ { actions: [] } ];
                    cd.tripactions.groups[0].actions.unshift( { type: "runscene", scene: ts } );
                }
                if ( !isNaN(us) ) {
                    if ( undefined === cd.untripactions )
                        cd.untripactions = { isReactorScene: true, groups: [ { actions:[] } ] };
                    if ( 0 === (cd.untripactions.groups || []).length )
                        cd.untripactions.groups = [ { actions: [] } ];
                    cd.untripactions.groups[0].actions.unshift( { type: "runscene", scene: us } );
                }
                if ( "" !== ( ts + us ) ) {
                    alert( "Your specified trip and untrip scenes have been moved to new-style actions. Please save. " );
                    configModified = true;
                }
            }

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

            jQuery("div#tab-actions.reactortab button.addaction").on( 'click.reactor', handleAddActionClick );
            jQuery("div#tab-actions.reactortab button#saveconf").on( 'click.reactor', handleActionsSaveClick ).prop( "disabled", true );
            jQuery("div#tab-actions.reactortab button#revertconf").on( 'click.reactor', handleRevertClick ).prop( "disabled", true );
            
            if ( undefined !== deviceInfo ) {
                var uc = jQuery( '<iframe sandbox src="https://www.toggledbits.com/deviceinfo/checkupdate.php?v=' + deviceInfo.serial + '" style="border: 0; height: 24px; width: 100%" />' );
                uc.insertBefore( jQuery( 'div#tripactions' ) );
            }

            api.registerEventHandler('on_ui_cpanel_before_close', ReactorSensor, 'onBeforeCpanelClose');
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
        html += "div#tab-actions.reactortab .tb-about { margin-top: 24px; }";
        html += "div#tab-actions.reactortab .color-green { color: #428BCA; }";
        html += 'div#tab-actions.reactortab .tberror { border: 1px solid red; }';
        html += 'div#tab-actions.reactortab .tbwarn { border: 1px solid yellow; background-color: yellow; }';
        html += 'div#tab-actions.reactortab i.md-btn:disabled { color: #cccccc; cursor: auto; }';
        html += 'div#tab-actions.reactortab i.md-btn[disabled] { color: #cccccc; cursor: auto; }';
        html += 'div#tab-actions.reactortab i.md-btn { color: #2d6a9f; font-size: 14pt; cursor: pointer; }';
        html += "div#tab-actions.reactortab p#noenh { font-weight: bold; color: #996600; }";
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
        html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
        html += 'div#tab-actions.reactortab div.warning { color: red; }';
        html += 'div#tab-actions.reactortab option.optheading { font-weight: bold; }';
        html += 'div#tab-actions.reactortab option.nodata { font-style: italic; }';
        html += 'div#tab-actions.reactortab option.nodata:after { content: "[1] see footer"; }';
        html += 'div#tab-actions.reactortab .tbslider { display: inline-block; width: 200px; height: 1em; border-radius: 8px; }';
        html += 'div#tab-actions.reactortab .tbslider .ui-slider-handle { background: url("/cmh/skins/default/img/other/slider_horizontal_cursor_24.png?") no-repeat scroll left center rgba(0,0,0,0); cursor: pointer !important; height: 24px !important; width: 24px !important; margin-top: 6px; font-size: 12px; text-align: center; padding-top: 4px; text-decoration: none; }';
        html += 'div#tab-actions.reactortab .tbslider .ui-slider-range-min { background-color: #12805b !important; }';
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
                jQuery("div#loading").empty().append( '<h3>Update Required</h3>Your D_ReactorDeviceInfo.json file needs to be at least serial 0.323. Please <a href="/port_3480/data_request?id=lr_Reactor&action=infoupdate" target="_blank">click here to update the file</a>, then go back to the Status tab and then come back here.<p><em>PRIVACY NOTICE:</em> Clicking this link will send the firmware version information and plugin version to the server. This information is used to select the correct file for your configuration, and is not used for tracking, authentication, or access control.</p>' );
                return;
            }

            deviceInfo = data;

            /* Body content */
            html += '<div id="tab-actions" class="reactortab">';

            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Activities</h3></div></div>';
            html += '<div class="row"><div class="col-xs-12 col-sm-12">Activities are actions that Reactor will perform on its own when tripped or untripped.</div></div>';


            html += '<div id="tripactions" class="actionlist">';
            html += '<div class="row"><div class="tblisttitle col-xs-6 col-sm-6"><span class="titletext">Trip Actions</span></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button id="saveconf" class="btn btn-xs btn-success">Save</button> <button id="revertconf" class="btn btn-xs btn-danger">Revert</button></div></div>';
            html += '<div class="row buttonrow"><div class="col-sm-1"><button id="addtripaction" class="addaction btn btn-sm btn-primary">Add Trip Action</button></div></div>';
            html += '</div>'; // #tripactions
            html += '<div id="untripactions" class="actionlist">';
            html += '<div class="row"><div class="tblisttitle col-xs-6 col-sm-6"><span class="titletext">Untrip Actions</span></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button id="saveconf" class="btn btn-xs btn-success">Save</button> <button id="revertconf" class="btn btn-xs btn-danger">Revert</button></div></div>';
            html += '<div class="row buttonrow"><div class="col-sm-1"><button id="adduntripaction" class="addaction btn btn-sm btn-primary">Add Untrip Action</button></div></div>';
            html += '</div>'; // untripactions

            html += '</div>'; // tab-actions

            html += footer();

            jQuery('div#loading').replaceWith( jQuery( html ) );

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

    console.log("Initializing ReactorSensor module");

    myModule = {
        uuid: uuid,
        initModule: initModule,
        onBeforeCpanelClose: onBeforeCpanelClose,
        onUIDeviceStatusChanged: onUIDeviceStatusChanged,
        doTools: doTools,
        doSettings: doSettings,
        doActivities: preloadActivities,
        doConditions: doConditions,
        doVariables: doVariables,
        doStatusPanel: doStatusPanel
    };
    return myModule;
})(api, $ || jQuery);
