//# sourceURL=J_ReactorSensor_UI7.js
/**
 * J_ReactorSensor_UI7.js
 * Configuration interface for ReactorSensor
 *
 * Copyright 2018 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 */
/* globals api,jQuery,$ */

//"use strict"; // fails on UI7, works fine with ALTUI

var ReactorSensor = (function(api, $) {

    /* unique identifier for this plugin... */
    var uuid = '21b5725a-6dcd-11e8-8342-74d4351650de';

    var myModule = {};

    var serviceId = "urn:toggledbits-com:serviceId:ReactorSensor";
    // var deviceType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

    var deviceByNumber;
    var udByDevNum;
    var iData = [];
    var roomsByName = [];
    var actions = {};
    var deviceInfo = {};
    var configModified = false;
    var inStatusPanel = false;
    var lastx = 0;
    var condTypeName = { "service": "Service/Variable", "housemode": "House Mode", "comment": "Comment", "weekday": "Weekday",
        "sun": "Sunrise/Sunset", "trange": "Date/Time", "reload": "Luup Reloaded" };
    var weekDayName = [ '?', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
    var monthName = [ '?', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
    var opName = { "bet": "between", "nob": "not between", "after": "after", "before": "before" };
    var houseModeName = [ '?', 'Home', 'Away', 'Night', 'Vacation' ];

    /* Return footer */
    function footer() {
        var html = '';
        html += '<div class="clearfix">';
        html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
        html += '<div id="tbcopyright">Reactor ver 2.0develop &copy; 2018 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>,' +
            ' All Rights Reserved. Please check out the <a href="https://www.toggledbits.com/reactor" target="_blank">online documentation</a>' +
            ' and <a href="http://forum.micasaverde.com/index.php/board,93.0.html" target="_blank">forum board</a> for support.</div>';
        html += '<div id="supportlinks">Support links: ' +
            ' <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=debug" target="_blank">Toggle&nbsp;Debug</a>' +
            ' &bull; <a href="/cgi-bin/cmh/log.sh?Device=LuaUPnP" target="_blank">Log&nbsp;File</a>' +
            ' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=status" target="_blank">Plugin&nbsp;Status</a>' +
            ' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=summary" target="_blank">Logic&nbsp;Summary</a>' +
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
        for ( var ig=0; ig<(cdata.conditions || {}).length; ig++ ) {
            var grp = cdata.conditions[ig];
            ixGroup[ grp.groupid ] = grp;
            for ( var ic=0; ic<(grp.groupconditions || {}).length; ic++ ) {
                if ( grp.groupconditions[ic].operator === undefined && grp.groupconditions[ic].condition !== undefined ) {
                    /* Fixup v2 */
                    grp.groupconditions[ic].operator = grp.groupconditions[ic].condition;
                    delete grp.groupconditions[ic].condition;
                    upgraded = true;
                }
                ixCond[ grp.groupconditions[ic].id ] = grp.groupconditions[ic];
            }
        }

        cdata.version = 2;
        cdata.device = myid;
        if ( upgraded ) {
            /* Write updated config. We don't care if it fails, as nothing we can't redo would be lost. */
            api.setDeviceStatePersistent( myid, serviceId, "cdata", JSON.stringify( cdata ) );
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

        /* Make device-indexed version of userdata devices, which is just an array */
        var ud = api.getUserData();
        udByDevNum = [];
        for ( var k=0; k<ud.devices.length; ++k ) {
            udByDevNum[ ud.devices[k].id ] = ud.devices[k];
        }

        /* Get the config and parse it */
        loadConfigData( myid );

        /* Make our own list of devices, sorted by room. */
        var devices = api.cloneObject( api.getListOfDevices() );
        deviceByNumber = [];
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
            var devobj = api.cloneObject( dd[i] );
            if ( devobj.id === myid ) {
                devobj.friendlyName = "(self)";
            } else {
                devobj.friendlyName = "#" + devobj.id + " " + devobj.name;
            }
            deviceByNumber[devobj.id] = devobj;

            var roomid = devobj.room || 0;
            var roomObj = rooms[roomid];
            if ( roomObj === undefined ) {
                roomObj = api.cloneObject( api.getRoomObject(roomid) );
                roomObj.devices = [];
                rooms[roomid] = roomObj;
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
    }

    /* Get parent state */
    function getParentState( varName ) {
        var me = udByDevNum[ api.getCpanelDeviceId() ];
        return api.getDeviceState( me.id_parent || me.id, "urn:toggledbits-com:serviceId:Reactor", varName );
    }

    /**
     * Find cdata group
     */
    function findCdataGroupIndex( grpid ) {
        var cdata = iData[ api.getCpanelDeviceId() ];
        for ( var ix=0; ix<cdata.conditions.length; ++ix ) {
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
            for ( var ix=0; ix<grp.groupconditions.length; ++ix ) {
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

    function textDate( y, m, d, isEnd ) {
        if ( isEmpty( y ) ) {
            if ( isEmpty( m ) ) {
                if ( isEmpty( d ) ) {
                    return undefined;
                } else {
                    return "day " + d + " each month";
                }
            } else {
                return monthName[ parseInt( m ) ] + ( isEmpty( d ) ? "" : " " + d );
            }
        } else {
            if ( isEmpty( m ) ) {
                if ( isEmpty( d ) ) {
                    return y;
                } else {
                    return "day " + d + " each month of " + y;
                }
            } else {
                return monthName[ parseInt( m ) ] + ( isEmpty( d ) ? "" : " " + d ) + " " + y;
            }
        }
    }

    function makeConditionDescription( cond ) {
        if ( cond === undefined ) {
            return "(undefined)";
        }

        var str = "";
        switch ( cond.type ) {
            case 'service':
                str += ( undefined !== deviceByNumber[cond.device] ?
                        deviceByNumber[cond.device].friendlyName :
                        '#' + cond.device + ' ' + ( cond.devicename === undefined ? "name unknown" : cond.devicename ) + ' (missing)' );
                str += ' ' + cond.variable + ' ' + cond.operator + ' ' + cond.value;
                break;

            case 'comment':
                str = cond.comment;
                break;

            case 'housemode':
                if ( ( cond.value || "" ) === "" ) {
                    str += "Any";
                } else {
                    var t = ( cond.value || "" ).split(/,/);
                    for ( var k=0; k<t.length; ++k ) {
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
                    var t = ( cond.value || "" ).split(/,/);
                    for ( var k=0; k<t.length; ++k ) {
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
                    var k = spec.match( /^([^+-]+)(.*)/ );
                    if ( k === null || k.length !== 3 ) {
                        return spec + '???';
                    } else {
                        var n = parseInt( k[2] );
                        var str = ' ';
                        if ( n < 0 ) {
                            str = str + String(-n) + " mins before ";
                        } else if ( n > 0 ) {
                            str = str + String(n) + " mins after ";
                        }
                        str = str + ( names[k[1]] || k[1] );
                        return str;
                    }
                }
                var vals = ( cond.value || "sunrise+0,sunset+0" ).split(/,/);
                str += sunrange( vals[0] || "sunrise+0" );
                if ( cond.operator == "bet" || cond.operator == "nob" ) {
                    str += " and ";
                    str += sunrange( vals[1] || "sunset+0" );
                }
                break;

            case 'trange':
                if ( opName[ cond.operator ] !== undefined ) {
                    str += opName[ cond.operator ];
                } else {
                    str += cond.operator + '???';
                }
                var t = ( cond.value || "" ).split(/,/);
                str += ' ' + textDateTime( t[0], t[1], t[2], t[3], t[4], false );
                if ( cond.operator !== "before" && cond.operator !== "after" ) {
                    str += ' and ' + textDateTime( t[5], t[6], t[7], t[8], t[9], true );
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
        var el = jQuery('<select class="devicemenu form-control form-control-sm"></select>');
        roomsByName.forEach( function( roomObj ) {
            if ( roomObj.devices && roomObj.devices.length ) {
                var first = true; /* per-room first */
                for (var j=0; j<roomObj.devices.length; ++j) {
                    var devid = roomObj.devices[j].id;
                    if (first)
                        el.append( "<option disabled>--" + roomObj.name + "--</option>" );
                    first = false;
                    el.append( '<option value="' + devid + '">' + roomObj.devices[j].friendlyName + '</option>' );
                }
            }
        });

        if ( ( val || "" ) !== "" ) {
            var opt = jQuery( 'option[value="' + val + '"]', el );
            if ( 0 === opt.length ) {
                el.append( '<option value="' + val + '" selected>(missing) #' + val + ' ' + name + '</option>' );
            } else {
                el.val( val );
            }
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
        var devobj = udByDevNum[parseInt(device)];
        if ( undefined !== devobj ) {
            var mm = {}, ms = [];
            for ( var k=0; k<devobj.states.length; ++k ) {
                /* For self-reference, only allow variables created from configured expressions */
                if ( device == myid && devobj.states[k].service != "urn:toggledbits-com:serviceId:ReactorValues" ) {
                    continue;
                }
                if ( mm[devobj.states[k].variable.toLowerCase()] === undefined ) {
                    /* Just use variable name as menu text, unless multiple with same name (collision) */
                    mm[devobj.states[k].variable.toLowerCase()] = ms.length;
                    ms[ms.length] = { text: devobj.states[k].variable, service: devobj.states[k].service,
                        variable: devobj.states[k].variable };
                } else {
                    /* Collision. Modify existing element to include service name. */
                    var n = mm[devobj.states[k].variable.toLowerCase()];
                    ms[n].text = ms[n].variable + ' (' +
                        ms[n].service.replace(/^([^:]+:)+/, "") + ')';
                    /* Append new entry (text includes service name) */
                    n = ms.length;
                    ms[n] = { text: devobj.states[k].variable + ' (' +
                        devobj.states[k].service.replace(/^([^:]+:)+/, "") + ')',
                        service: devobj.states[k].service,
                        variable: devobj.states[k].variable
                    };
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
        el.append('<option value="=">equals</option>');
        el.append( '<option value="&lt;&gt;">not equals</option>' );
        el.append( '<option value="&lt;">&lt;</option>' );
        el.append( '<option value="&lt;=">&lt;=</option>' );
        el.append( '<option value="&gt;">&gt;</option>' );
        el.append( '<option value="&gt;=">&gt;=</option>' );
        el.append( '<option value="starts">Starts with</option>' );
        el.append( '<option value="ends">Ends with</option>' );
        el.append( '<option value="contains">Contains</option>' );
        el.append( '<option value="in">in</option>' );

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
           for last. */
        jQuery('div.controls i.action-up').prop('disabled', false);
        jQuery('div.conditionrow:first-child div.controls i.action-up').prop('disabled', true);
        /* Down is more complicated because the "Add Condition" button row is
           the last child in each group. Select only the conditionrows in each
           group, then apply to the last in each of those. */
        jQuery('div.controls i.action-down').prop('disabled', false);
        jQuery('div.conditiongroup').each( function( ix, grpEl ) {
            jQuery( 'div.conditionrow:last div.controls i.action-down', grpEl )
                .prop('disabled', true);
        });

        /* Delete button of single condition in first condition group is
           disabled/hidden. Must keep one condition, hopefully set. */
        jQuery('div.conditionrow div.controls i.action-delete').prop('disabled', false).show();
        var lastMo = jQuery('div.conditiongroup:first-child div.conditionrow div.controls');
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
        var typ = jQuery("div.condtype select", row).val();
        cond.type = typ;
        jQuery('.tberror', row).removeClass('tberror');
        switch (typ) {
            case 'comment':
                cond.comment = jQuery("div.params input", row).val();
                break;

            case 'service':
                cond.device = parseInt( jQuery("div.params select.devicemenu", row).val() );
                cond.service = jQuery("div.params select.varmenu", row).val();
                cond.variable = cond.service.replace( /^[^\/]+\//, "" );
                cond.service = cond.service.replace(/\/.*$/, "");
                cond.operator = jQuery("div.params select.opmenu", row).val();
                cond.value = jQuery("input#value", row).val();
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
                    var newval = target.val();
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
                /* Fetch and load */
                cond.operator = jQuery("div.params select.opmenu", row).val();
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
                if ( res[5] === "" && res[0] !== "" ) {
                    res[5] = res[0];
                    jQuery("div.end input.year", row).val( res[0] );
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

            case 'reload':
                /* No parameters */
                break;

            default:
                break;
        }

        updateControls();
    }

    /**
     * Handler for row change (generic)
     */
    function handleRowChange( ev ) {
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
            cond.devicename = udByDevNum[cond.device].name;
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
            var n = getInteger( rs.val() );
            if ( isNaN(n) || n < 1 ) {
                rs.addClass( 'tberror' );
            } else {
                rs.removeClass( 'tberror' );
                if ( n !== ( cond.repeatwithin || 0 ) ) {
                    cond.repeatwithin = n;
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
            var n = getInteger( dd.val() );
            if ( isNaN( n ) || n < 0 ) {
                dd.addClass('tberror');
            } else {
                dd.removeClass('tberror');
                jQuery('input.rcount', row).val("").prop('disabled', true);
                // jQuery('input.rspan', row).val("").prop('disabled', true);
                delete cond.repeatwithin;
                delete cond.repeatcount;
                if ( (cond.duration||0) !== n ) {
                    /* Changed */
                    if ( n === 0 ) {
                        delete cond.duration;
                        delete cond.duration_op;
                        jQuery('input.rcount', row).prop('disabled', false);
                        // jQuery('input.rspan', row).prop('disabled', false);
                    } else {
                        cond.duration = n;
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
        for ( var ic=0; ic<grp.groupconditions.length; ic++) {
            var gc = grp.groupconditions[ic];
            /* Must be service, not this condition, and not the predecessor to this condition (recursive) */
            if ( cond.id !== gc.id && ( gc.after === undefined || gc.after !== cond.id ) ) {
                var opt = jQuery('<option></option>');
                opt.val( gc.id );
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
                jQuery('input', container).on( 'change.reactor', handleRowChange ).val( cond.comment || "" );
                break;

            case 'service':
                var pp = makeDeviceMenu( cond.device, cond.devicename || "?" );
                container.append(pp);
                /* Fix-up: makeDeviceMenu will display current userdata name
                           for device, but if that's changed from what we've stored,
                           we need to update our store. */
                if ( cond.device !== undefined && udByDevNum[ cond.device ] !== undefined &&
                    udByDevNum[ cond.device ].name !== cond.devicename ) {
                        cond.devicename = udByDevNum[ cond.device ].name;
                        configModified = true;
                }
                pp = makeVariableMenu( cond.device, cond.service, cond.variable );
                container.append(pp);
                pp = makeServiceOpMenu( cond.operator );
                container.append(pp);
                container.append('<input type="text" id="value" class="form-control form-control-sm">');
                container.append('<i class="material-icons condmore" title="Show Options">expand_more</i>');
                jQuery("input#value", container).val( cond.value );
                jQuery("select.varmenu", container).on( 'change.reactor', handleRowChange );
                jQuery("select.opmenu", container).on( 'change.reactor', handleRowChange );
                jQuery("input#value", container).on( 'change.reactor', handleRowChange );
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
                jQuery("input", container).on( 'change.reactor', handleRowChange );
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
                jQuery("input", container).on( 'change.reactor', handleRowChange );
                jQuery("select.wdcond", container).on( 'change.reactor', handleRowChange ).val( cond.operator || "" );
                (cond.value || "").split(',').forEach( function( val ) {
                    jQuery('input#opts[value="' + val + '"]', container).prop('checked', true);
                });
                break;

            case 'sun':
                var pp = makeDateTimeOpMenu( cond.operator );
                container.append(pp);
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
                var mm = jQuery('<select class="form-control form-control-sm">' +
                    '<option value="sunrise">Sunrise</option><option value="sunset">Sunset</option>' +
                    '<option value="civdawn">Civil dawn</option><option value="civdusk">Civil dusk</option>' +
                    '<option value="nautdawn">Nautical dawn</option><option value="nautdusk">Nautical dusk</option>' +
                    '<option value="astrodawn">Astronomical dawn</option><option value="astrodusk">Astronomical dusk</option></select>'
                    );
                jQuery('select#sunend', container).replaceWith( mm.clone().attr( 'id', 'sunend' ) );
                jQuery('select#sunstart', container).replaceWith( mm.attr( 'id', 'sunstart' ) );
                /* Restore. Condition first... */
                var cp = cond.operator || "after";
                jQuery("select.opmenu", container).on( 'change.reactor', handleRowChange ).val( cp );
                if ( cp === "before" || cp === "after" ) {
                    jQuery("div.end", container).hide();
                } else {
                    jQuery("div.end", container).show();
                }
                /* Start */
                var vals = ( cond.value || "sunrise+0,sunset+0" ).split(/,/);
                var k = vals[0].match( /^([^+-]+)(.*)/ );
                if ( k === null || k.length !== 3 ) {
                    k = [ "", "sunrise", "0" ];
                    configModified = true;
                }
                jQuery("select#sunstart", container).on( 'change.reactor', handleRowChange ).val( k[1] );
                jQuery("input#startoffset", container).on( 'change.reactor', handleRowChange ).val( k[2] );
                /* End */
                k = ( vals[1] || "sunset+0" ).match( /^([^+-]+)(.*)/ );
                if ( k === null || k.length !== 3 ) {
                    k = [ "", "sunset", "0" ];
                    configModified = true;
                }
                jQuery("select#sunend", container).on( 'change.reactor', handleRowChange ).val( k[1] );
                jQuery("input#endoffset", container).on( 'change.reactor', handleRowChange ).val( k[2] );
                break;

            case 'trange':
                var pp = makeDateTimeOpMenu( cond.operator );
                container.append(pp);
                jQuery("select.opmenu", container).append('<option value="before">before</option>');
                jQuery("select.opmenu", container).append('<option value="after">after</option>');
                var months = jQuery('<select class="monthmenu form-control form-control-sm"><option value=""></option></select>');
                for ( var mon=1; mon<=12; mon++ ) {
                    months.append('<option value="' + mon + '">' + monthName[mon] + ' (' + mon + ')</option>');
                }
                var days = jQuery('<select class="daymenu datespec form-control form-control-sm"></select>');
                for ( var day=1; day<=31; day++ ) {
                    days.append('<option value="' + day + '">' + day + '</option>');
                }
                var hours = jQuery('<select class="hourmenu form-control form-control-sm"></select>');
                for ( var hr = 0; hr<24; hr++ ) {
                    var hh = hr % 12;
                    if ( hh === 0 ) {
                        hh = 12;
                    }
                    hours.append('<option value="' + hr + '">' + hr + ' (' + hh + ( hr < 12 ? "am" : "pm" ) + ')</option>');
                }
                var mins = jQuery('<select class="minmenu form-control form-control-sm"></select>');
                for ( var mn=0; mn<60; mn+=5 ) {
                    mins.append('<option value="' + mn + '">:' + (mn < 10 ? '0' : '') + mn + '</option>');
                }
                container.append('<div class="start"></div>').append('<div class="end"> and </div>');
                jQuery("div.start", container).append( months.clone() )
                    .append( days.clone() )
                    .append('<input type="text" placeholder="yyyy" class="year narrow datespec form-control form-control-sm">')
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
                var cp = cond.operator || "between";
                jQuery("select.opmenu", container).val( cp );
                if ( cp === "before" || cp === "after" ) {
                    jQuery("div.end", container).hide();
                } else {
                    jQuery("div.end", container).show();
                }
                var vals = (cond.value || "").split(',');
                var flist = [ 'div.start input.year', 'div.start select.monthmenu','div.start select.daymenu',
                              'div.start select.hourmenu', 'div.start select.minmenu',
                              'div.end input.year','div.end select.monthmenu', 'div.end select.daymenu',
                              'div.end select.hourmenu','div.end select.minmenu'
                ];
                for ( var fx=0; fx<flist.length; fx++ ) {
                    if ( fx >= vals.length ) {
                        vals[fx] = "";
                    }
                    if ( vals[fx] !== "" ) {
                        jQuery( flist[fx], container ).val( vals[fx] );
                    }
                }
                /* Enable date fields if month spec present */
                jQuery('.datespec', container).prop('disabled', vals[1]==="");
                jQuery("select", container).on( 'change.reactor', handleRowChange );
                jQuery("input", container).on( 'change.reactor', handleRowChange );
                break;

            case 'reload':
                /* falls through */
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

    /**
     * Handle click on Add Group button.
     */
    function handleAddGroupClick( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.row'); /* add group button row */
        jQuery(el).prop('disabled', true); /* disable the (only) add group button for now */

        /* Create a new condition group div, assign a group ID */
        var newId = getUID("grp");
        var condgroup = jQuery('<div class="conditiongroup"></div>');
        condgroup.attr('id', newId);

        /* Insert a new divider with "OR" caption */
        jQuery('<div class="row divider"><div class="col-sm-5"><hr></div><div class="col-sm-2"><h5 style="text-align: center">OR</h5></div><div class="col-sm-5"><hr></div></div>')
            .insertBefore(row);

        /* Create a condition row for the first condition in the group */
        var condId = getUID("cond");
        var cel = getConditionRow();
        cel.attr("id", condId);
        condgroup.append(cel); /* Add it to the conditiongroup */

        /* Add an "Add Condition" button for the new group */
        cel = jQuery('<div class="row"><div class="col-sm-1"><button class="addcond btn btn-sm btn-primary">Add Condition</button></div></div>');
        jQuery("button.addcond", cel).prop('disabled',true); /* Add Cond is disabled to start */
        jQuery("button.addcond", cel).on( 'click.reactor', handleAddConditionClick );

        condgroup.append(cel); /* Add it to the conditiongroup */

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
        if ( up ) {
            /* Move up. */
            if ( condix > 0 ) {
                /* Move up in data structure */
                var cond = grp.groupconditions.splice( condix, 1 );
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
                var cond = grp.groupconditions.splice( condix, 1 );
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
        el.append( '<div class="col-sm-1 controls"></div>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-up">arrow_upward</i>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-down">arrow_downward</i>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-delete">clear</i>');

        [ "comment", "service", "housemode", "sun", "weekday", "trange", "reload" ].forEach( function( k ) {
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
        for (var ng=0; ng<iData[myid].cdata.conditions.length; ++ng) {
            if ( ng > 0 ) {
                /* Insert divider */
                jQuery("div#conditions").append('<div class="row divider"><div class="col-sm-5"><hr></div><div class="col-sm-2"><h5 style="text-align: center">OR</h5></div><div class="col-sm-5"><hr></div></div>');
            }

            var grp = iData[myid].cdata.conditions[ng];
            if ( grp.groupid === undefined )
                grp.groupid = getUID("group");
            iData[myid].ixGroup[grp.groupid] = grp;

            /* Create div.conditiongroup and add conditions */
            var gel = jQuery('<div class="conditiongroup"></div>').attr("id", grp.groupid);
            for (var nc=0; nc<grp.groupconditions.length; ++nc) {
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
            gel.append('<div class="row"><div class="col-sm-1"><button class="addcond btn btn-sm btn-primary">Add Condition</button></div></div>');

            /* Append the group */
            jQuery("div#conditions").append(gel);

            /* Activate the "Add Condition" button */
            jQuery("button.addcond", gel).on( 'click.reactor', handleAddConditionClick );
        }

        /* Insert add group button row (not a divider) */
        jQuery("div#conditions").append('<div class="row"><div class="col-sm-2"><hr></div>' +
            '<div class="col-sm-2"><button id="addgroup" class="btn btn-sm btn-primary">Add Group</button></div>' +
            '<div class="col-sm-4"><hr></div>' +
            '<div class="col-sm-4"><button id="saveconf" class="btn btn-sm btn-success">Save</button><button id="revertconf" class="btn btn-sm btn-danger">Revert</button></div>' +
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
        loadConfigData( api.getCpanelDeviceId() );
        configModified = false;

        /* Be careful about which tab we're on here. */
        var ctx = jQuery( ev.currentTarget ).closest('div.row').parent().attr('id');
        if ( ctx === "variables" ) {
            redrawVariables();
        } else if ( ctx === "conditions" ) {
            redrawConditions();
        } else {
            alert("OK, I did the revert, but now I'm lost. Go back to the dashboard and come back in.");
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

    /**
     * Handle save click: save the current configuration.
     */
    function handleSaveClick( ev, fnext, fargs ) {
        /* Rip through conditions and clean up before saving */
        var ixCond = iData[api.getCpanelDeviceId()].ixCond;
        for ( var condid in ixCond ) {
            if ( ixCond.hasOwnProperty( condid ) ) {
                var cond = ixCond[condid];
                switch ( cond.type ) {
                    case 'comment':
                        removeConditionProperties( cond, 'comment' );
                        break;
                    case 'service':
                        if ( cond.operator !== undefined && cond.condition !== undefined ) {
                            delete cond.condition;
                        }
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
                    case 'reload':
                        removeConditionProperties( cond, "" );
                        break;
                    default:
                        /* Don't do anything */
                }
            }
        }
        /* Save to persistent state */
        var myid = api.getCpanelDeviceId();
        iData[myid].cdata.timestamp = Math.floor( Date.now() / 1000 );
        api.setDeviceStatePersistent( myid, serviceId, "cdata", JSON.stringify( iData[myid].cdata ),
        {
            'onSuccess' : function() {
                configModified = false;
                if ( undefined !== fnext ) {
                    fnext.apply( null, fargs );
                }
                updateSaveControls();
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
        var container = jQuery('div.testfields');
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
        api.setDeviceStatePersistent( api.getCpanelDeviceId(), serviceId, "TestTime", vv );

        el = jQuery('input#testhousemode', container);
        if ( el.prop('checked') ) {
            jQuery('select', el.closest('div.row')).prop('disabled', false);
            vv = jQuery('select#mode').val();
        } else {
            jQuery('select', el.closest('div.row')).prop('disabled', true);
            vv = "";
        }
        api.setDeviceStatePersistent( api.getCpanelDeviceId(), serviceId, "TestHouseMode", vv );
    }

    function doTest()
    {
        if ( configModified && confirm( "You have unsaved changes. Press OK to save them, or Cancel to discard them." ) ) {
            handleSaveClick( undefined );
        }

        initModule();

        var html = "";

        html = '<style>';
        html += 'input.narrow { max-width: 8em; }';
        html += '</style>';
        jQuery('head').append( html );

        html = '<div class="testfields">';
        html += '<div class="row">';
        html += '<div class="col-sm-2 col-md-2"><label for="testdateenable"><input type="checkbox" value="1" id="testdateenable">&nbsp;Test&nbsp;Date:</label></div>';
        html += '<div class="col-sm-10 col-md-10 form-inline"><select id="testyear" class="form-control form-control-sm"></select><select id="testmonth" class="form-control form-control-sm"></select><select class="form-control form-control-sm" id="testday"></select><input class="narrow form-control form-control-sm" id="testtime"></div>';
        html += '</div>'; /* row */
        html += '<div class="row">';
        html += '<div class="col-sm-2 col-md-2"><label for="testhousemode"><input type="checkbox" value="1" id="testhousemode">&nbsp;Test&nbsp;House&nbsp;Mode</label></div>';
        html += '<div class="col-sm-10 col-md-10 form-inline"><select class="form-control form-control-sm" id="mode"><option value="1">Home</option><option value="2">Away</option><option value="3">Night</option><option value="4">Vacation</option></select></div>';
        html += '</div>'; /* row */
        html += '<div class="row"><div class="col-sm-12 col-md-12">';
        html += 'These settings do not change system configuration.' +
            ' They override the system values when your ReactorSensor requests them, allowing you to more easily test your conditions.' +
            ' For example, turn on the "Test Date" checkbox above' +
            ' and use the controls to set a date, then go back to the "Control" tab and press the "Restart" button to force a re-evaluation of the sensor state' +
            ' using your selected date/time. <b>Remember to turn these settings off when you have finished testing!</b>';
        html += '</div></div>';
        html += '</div>'; /* .testfields */
        
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

        html += footer();

        api.setCpanelContent( html );

        var container = jQuery('div.testfields');
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

if (false) {
        jQuery.ajax({
            url: api.getDataRequestURL(),
            data: {
                id: "lu_device",
                output_format: "xml"
            },
            dataType: "xml",
            timeout: 15000
        }).done( function( data, statusText, jqXHR ) {
            var seen = {};
            var services = jQuery( data ).find( "service" );
            services.each( function( ix, obj ) {
                var tb = jQuery( obj );
                var svc = jQuery("serviceId", tb).text() || "";
                var url = jQuery("SCPDURL", tb).text() || "";
                if ( undefined === seen[ svc ] ) {
                    console.log( svc + " => " + url );
                }
                seen[ svc ] = url;
            });
        }).fail( function( jqXHR, textStatus, errorThrown ) {
            // Bummer.
            console.log("Failed to load lu_device data: " + textStatus + " " + String(errorThrown));
            console.log(jqXHR.responseText);
        });
}
    }

    function updateStatus( pdev ) {
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
                var el = jQuery( '<div class="row var" id="' + vd.name + '"></div>' );
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

        for ( var i=0; i<cdata.conditions.length; i++ ) {
            var grp = cdata.conditions[i];

            if ( i > 0 ) {
                /* Insert a divider */
                stel.append('<div class="row divider"><div class="col-sm-5 col-md-5"><hr></div><div class="col-sm-2 col-md-2" style="text-align: center;"><h5>OR</h5></div><div class="col-sm-5 col-md-5"><hr></div></div>');
            }

            grpel = jQuery('<div class="reactorgroup" id="' + grp.groupid + '">');
            stel.append( grpel );
            var groupstate = true;
            for ( var j=0; j<grp.groupconditions.length; j++ ) {
                var cond = grp.groupconditions[j];
                var el = jQuery('<div class="row cond" id="' + cond.id + '"></div>');
                var currentValue = cstate[cond.id] === undefined ? cstate[cond.id] : cstate[cond.id].lastvalue;

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
                        el.append('<div class="currentvalue col-sm-6 col-md-4">(' + currentValue + ') ' +
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
            for ( var k=0; k<args.states.length; ++k ) {
                if ( args.states[k].variable.match( /^(cdata|cstate|Tripped|Armed)$/ ) ||
                        args.states[k].service == "urn:toggledbits-com:serviceId:ReactorValues" ) {
                    doUpdate = true;
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
        /* Make sure changes are saved. */
        if ( configModified && confirm( "You have unsaved changes! Press OK to save them, or Cancel to discard them." ) ) {
            handleSaveClick( undefined );
        }

        initModule();

        /* Our styles. */
        var html = "<style>";
        html += 'div.reactorgroup { border-radius: 8px; border: 2px solid #006040; padding: 8px; }';
        html += '.truestate { background-color: #ccffcc; }';
        html += '.row.cond { min-height: 2em; }';
        html += '.row.var { min-height: 2em; color: #003399; }';
        html += '.tb-sm { font-family: Courier,Courier New,monospace; font-size: 0.9em; }';
        html += 'div.truecond { color: #00aa00; font-weight: bold; }';
        html += 'div.falsecond { color: #000000; }';
        html += "</style>";
        jQuery("head").append( html );

        api.setCpanelContent( '<div id="reactorstatus"></div>' );

        api.registerEventHandler('on_ui_deviceStatusChanged', ReactorSensor, 'onUIDeviceStatusChanged');
        inStatusPanel = true; /* Tell the event handler it's OK */

        updateStatus( api.getCpanelDeviceId() );
    }

    function updateVariableControls() {
        var container = jQuery('div#variables');
        var errors = jQuery('.tberror', container);
        jQuery("button#saveconf", container).prop('disabled', ! ( configModified && errors.length === 0 ) );
        jQuery("button#revertconf", container).prop('disabled', !configModified);
    }

    function handleVariableChange() {
        var container = jQuery('div#variables');
        var myid = api.getCpanelDeviceId();

        jQuery('.tberror', container).removeClass( 'tberror' );
        jQuery('div.row.var', container).each( function( ix, obj ) {
            var row = jQuery(obj);
            var vname = row.attr("id");
            var expr = jQuery('input.expr', row).val();
            if ( expr === "" ) {
                jQuery('input.expr', row).addClass('tberror');
            }
            if ( iData[myid].cdata.variables[vname] === undefined ) {
                iData[myid].cdata.variables[vname] = { name: vname, expression: expr };
                configModified = true;
            } else if ( iData[myid].cdata.variables[vname].expression !== expr ) {
                iData[myid].cdata.variables[vname].expression = expr;
                configModified = true;
            }
        });

        updateVariableControls();
    }

    function handleDeleteVariableClick( ev ) {
        var row = jQuery( ev.currentTarget ).closest( 'div.row.var' );
        var vname = row.attr('id');
        if ( confirm( 'Deleting "' + vname + '" will break any conditions that refer to it.' ) ) {
            delete iData[api.getCpanelDeviceId()].cdata.variables[vname];
            row.remove();
            configModified = true;
            updateVariableControls();
        }
    }

    function handleAddVariableClick() {
        var container = jQuery('div#variables');

        var editrow = jQuery('<div class="row editrow"></div>');
        editrow.append( '<div class="col-sm-6 col-md-2 col-lg-1"><input class="varname form-control form-control-sm"></div>' );
        editrow.append( '<div class="col-sm-12 col-md-9 col-lg-10"><input type="text" class="expr form-control form-control-sm"></div>' );
        editrow.append( '<div class="col-sm-6 col-md-1"><i class="material-icons md-btn deletevar">clear</i></div>' );
        jQuery( 'div.row.var input,i', container ).prop( 'disabled', true );
        jQuery( 'button#addvar', container ).prop( 'disabled', true );
        jQuery( 'input.expr', editrow ).prop('disabled', true).on('change.reactor',handleVariableChange);
        jQuery( 'i.deletevar', editrow ).on('click.reactor',handleDeleteVariableClick);
        jQuery( 'input.varname', editrow ).on('change.reactor', function( ev ) {
            /* Convert to regular row */
            var f = jQuery( ev.currentTarget );
            var vname = f.val();
            if ( vname === "" || jQuery( 'div.row.var#' + vname ).length > 0 || !vname.match( /^[A-Z][A-Z0-9_]*$/i ) ) {
                f.addClass('tberror');
                f.focus();
            } else {
                /* Set the row ID to the name */
                var row = f.closest('div.row');
                row.removeClass('editrow').addClass('var').attr('id', vname);
                /* Remove the name input field and swap in the name (text) */
                f.parent().empty().text(vname);
                /* Re-enable fields and add button */
                jQuery('div.row.var input,i', container).prop('disabled', false);
                jQuery( 'button#addvar', container ).prop( 'disabled', false );
                /* Do the regular stuff */
                handleVariableChange();
            }
        });
        jQuery( 'div.reactorgroup', container ).append( editrow );
        jQuery( 'input.varname', editrow ).focus();
    }

    /**
     * Redraw variables and expressions.
    */
    function redrawVariables() {
        var container = jQuery('div#variables');
        container.empty();
        var gel = jQuery('<div class="reactorgroup"></div>');
        var cdata = iData[api.getCpanelDeviceId()].cdata;
        for ( var vn in cdata.variables ) {
            if ( cdata.variables.hasOwnProperty( vn ) ) {
                var vd = cdata.variables[vn];
                var el = jQuery('<div class="row var" id="' + vn + '"></div>');
                el.append( jQuery( '<div class="col-sm-6 col-md-2 col-lg-1"></div>' ).text( vn ) );
                el.append( '<div class="col-sm-12 col-md-9 col-lg-10"><input type="text" class="expr form-control form-control-sm"></div>' );
                el.append( '<div class="col-sm-6 col-md-1"><i class="material-icons md-btn deletevar">clear</i></div>' );
                gel.append( el );
                jQuery( 'input.expr', el ).val( vd.expression );
            }
        }

        /* Append the group */
        container.append(gel);

        container.append('<div class="row">' +
            '<div class="col-sm-2"><button id="addvar" class="btn btn-sm btn-primary">Add Variable/Expression</button></div>' +
            '<div class="col-sm-4"><hr></div>' +
            '<div class="col-sm-6"><button id="saveconf" class="btn btn-sm btn-success">Save</button><button id="revertconf" class="btn btn-sm btn-danger">Revert</button></div>' +
            '</div>');
        jQuery("button#addvar", container).on( 'click.reactor', handleAddVariableClick );
        jQuery("input.expr", container).on( 'change.reactor', handleVariableChange );
        jQuery('i.deletevar', container).on('click.reactor', handleDeleteVariableClick);
        jQuery("button#saveconf", container).on( 'click.reactor', handleSaveClick );
        jQuery("button#revertconf", container).on( 'click.reactor', handleRevertClick );

        updateVariableControls();
    }

    function doVariables()
    {
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
            html += ".tb-about { margin-top: 24px; }";
            html += ".color-green { color: #006040; }";
            html += '.tberror { border: 1px solid red; }';
            html += '.tbwarn { border: 1px solid yellow; background-color: yellow; }';
            html += 'i.md-btn:disabled { color: #cccccc; cursor: auto; }';
            html += 'i.md-btn[disabled] { color: #cccccc; cursor: auto; }';
            html += 'i.md-btn { color: #006040; font-size: 13pt; cursor: pointer; }';
            html += 'input.tbinvert { min-width: 16px; min-height: 16px; }';
            html += 'div.conditions { width: 100%; }';
            html += 'input.narrow { max-width: 6em; }';
            html += 'div.conditiongroup { border-radius: 8px; border: 2px solid #006040; padding: 8px; }';
            html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
            html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
            html += "</style>";
            jQuery("head").append( html );

            /* Body content */
            html = '';
            html += '<div class="row"><div class="col-cs-12 col-sm-12">Expressions allow you to do complex arithmetic, string, and other operations that otherwise cannot be done in the Conditions editor. When you create an expression, you specify a variable name into which its result is stored. You can then use that variable name in your conditions.</div></div>';
            html += '<div id="variables"></div>';

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
        try {
            if ( configModified && confirm( "You have unsaved changes. Press OK to save them, or Cancel to discard them." ) ) {
                handleSaveClick( undefined );
            }

            initModule();

            /* Load material design icons */
            jQuery("head").append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');

            /* Our styles. */
            var html = "<style>";
            html += ".tb-about { margin-top: 24px; }";
            html += ".color-green { color: #006040; }";
            html += '.tberror { border: 1px solid red; }';
            html += '.tbwarn { border: 1px solid yellow; background-color: yellow; }';
            html += 'i.md-btn:disabled { color: #cccccc; cursor: auto; }';
            html += 'i.md-btn[disabled] { color: #cccccc; cursor: auto; }';
            html += 'i.md-btn { color: #006040; font-size: 12pt; cursor: pointer; }';
            html += 'input.tbinvert { min-width: 16px; min-height: 16px; }';
            html += 'div.conditions { width: 100%; }';
            html += 'input.narrow { max-width: 6em; }';
            html += 'div.conditiongroup { border-radius: 8px; border: 2px solid #006040; padding: 8px; }';
            html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
            html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
            html += 'div.warning { color: red; }';
            html += "</style>";
            jQuery("head").append( html );

            /* Body content */
            html = '';
            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Conditions</h3></div></div>';
            html += '<div class="row"><div class="col-xs-12 col-sm-12">Conditions within a group are "AND", and groups are "OR". That is, the sensor will trip when any group succeeds, and for a group to succeed, all conditions in the group must be met.</div></div>';

            var rr = api.getDeviceState( api.getCpanelDeviceId(), serviceId, "Retrigger" ) || "0";
            if ( rr !== "0" ) {
                html += '<div class="row"><div class="warning col-cs-12 col-sm-12">WARNING! Retrigger is on! You should avoid using time-related conditions in this ReactorSensor, as they may cause retriggers frequent retriggers!</div></div>';
            }

            html += '<div id="conditions"></div>';

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
        /* If lots of scenes, sort by room; otherwise, use straight as-is */ // ???
        if ( true || scenes.length > 10 ) {
            var rooms = api.cloneObject( ud.rooms );
            var rid = {};
            for ( var i=0; i<rooms.length; ++i ) {
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
            for ( var i=0; i<scenes.length; i++ ) {
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
            for (var i=0; i<scenes.length; ++i) {
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
        if ( actionType == "comment" ) {
            // nada
        } else if ( actionType == "delay" ) {
            var delay = jQuery( 'input#delay', row ).val() || "";
            if ( delay.match( /{[^}]+}/i ) ) {
                // Variable reference. ??? check it?
            } else if ( delay.match( /^([0-9][0-9]?)(:[0-9][0-9]?){1,2}$/ ) ) {
                // MM:SS or HH:MM:SS
            } else {
                var n = parseInt( delay );
                if ( isNaN( n ) || n < 1 ) {
                    jQuery( 'input#delay', row ).addClass( "tberror" );
                    row.addClass( "tberror" );
                }
            }
        } else if ( actionType == "device" ) {
            var act = jQuery('select#actionmenu', row).val() || "";
            if ( "" === act ) {
                jQuery( 'select#actionmenu', row ).addClass( "tberror" );
                row.addClass( "tberror" );
            }
            // check parameters, with value/type check when available?
            // type, valueSet/value list, min/max
        } else if ( actionType == "runscene" ) {
            var sc = jQuery( 'select#scene', row ).val() || "";
            if ( "" === sc ) {
                jQuery( 'select#scene' ).addClass( "tberror" );
                row.addClass( "tberror" );
            }
        } else {
            row.addClass( "tberror" );
        }
    }
    
    function buildActionList( root ) {
        if ( jQuery('.tberror', root ).length > 0 ) {
            return false;
        }
        /* Set up scene framework and first group with no delay */
        var scene = { isReactorScene: true, name: root.attr('id'), groups: [] };
        var group = { actions: [] };
        scene.groups.push( group );
        jQuery( 'div.actionrow', root ).each( function( ix ) {
            var row = $( this );
            var actionType = jQuery( 'select#actiontype', row ).val();
            var action = { type: actionType, index: ix+1 };
            if ( actionType == "comment" ) {
                action.comment = jQuery( 'input.argument', row ).val() || "";
            } else if ( actionType == "delay" ) {
                var t = jQuery( 'input#delay', row ).val() || "0";
                if ( t.indexOf( ':' ) >= 0 ) {
                    var pt = t.split( /:/ );
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
                /* Create a new group, marked with the delay, for all subsequent actions */
                if ( group.actions.length > 0 ) {
                    group = { actions: [], delay: t, delaytype: jQuery( 'select#delaytype', row ).val() || "inline" };
                    scene.groups.push( group );
                } else {
                    /* There are no actions in the current group; just modify the delay in this group. */
                    group.delay = t;
                    group.delaytype = jQuery( 'select#delaytype', row ).val() || "inline";
                }
                return true;
            } else if ( actionType == "device" ) {
                action.device = parseInt( jQuery( 'select.devicemenu', row ).val() );
                action.deviceName = deviceByNumber[ action.device ].name;
                var s = jQuery( 'select#actionmenu', row ).val() || "";
                var p = s.split( /\//, 2 );
                action.service = p[0]; action.action = p[1];
                var ai = actions[ s ];
                if ( ! ai ) {
                    console.log( "Can't find actioninfo for " + s );
                    scene = false;
                    return false;
                }
                action.parameters = [];
                for ( var k=0; k < (ai.parameters || [] ).length; k++ ) {
                    var p = { name: ai.parameters[k].name };
                    if ( undefined !== ai.parameters[k].value ) {
                        // Fixed value
                        p.value = ai.parameters[k].value;
                    } else {
                        var v = jQuery( '#' + p.name + '.argument', row ).val() || "";
                        if ( "" === v ) {
                            if ( ai.parameters[k].optional ) {
                                continue; /* skip it, not even on the list */
                            }
                            console.log("buildActionList: " + s + " required parameter " + p.name + " has no value");
                            scene = false;
                            return false;
                        } else {
                            p.value = v;
                        }
                    }
                    action.parameters.push( p );
                }
            } else if ( actionType == "runscene" ) {
                action.scene = parseInt( jQuery( "select#scene", row ).val() || "0" );
                if ( isNaN( action.scene ) || 0 === action.scene ) {
                    console.log("buildActionList: invalid scene selected");
                    scene = false;
                    return false;
                }
                // action.sceneName = sceneByNumber[ action.scene ].name
            } else {
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
            iData[myid].cdata.tripactions = tcf;
            iData[myid].cdata.untripactions = ucf;
            /* Save has async action, so use callback to complete. */
            handleSaveClick( ev, function() {
                if ( !configModified ) { /* successful save? */
                    jQuery( 'div.actionlist.tbmodified' ).removeClass( "tbmodified" );
                    jQuery( 'div.actionlist .tbmodified' ).removeClass( "tbmodified" );
                    /* Scene refs are upgraded to actions, so delete old on save */
                    api.setDeviceStatePersistent( api.getCpanelDeviceId(), serviceId, "Scenes", "" );
                }
            }, [] ); /* pass up */
            return;
        }
        alert( "Configuration not saved. Please correct the indicated errors, then try again." );
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
        
        /* Update row controls */
        jQuery('div.controls i.action-up', section).prop('disabled', false);
        jQuery('div.actionrow:first-child div.controls i.action-up', section).prop('disabled', true);
        /* Down is more complicated because the "Add" button row is
           the last child in each group. Select only the conditionrows in each
           group, then apply to the last in each of those. */
        jQuery('div.controls i.action-down', section).prop('disabled', false);
        jQuery('div.actionrow:last-child div.controls i.action-down', section).prop('disabled', true);
        /*
        jQuery('div.conditiongroup').each( function( ix, grpEl ) {
            jQuery( 'div.conditionrow:last div.controls i.action-down', grpEl )
                .prop('disabled', true);
        });
        */
        /* Save and revert buttons */
        updateSaveControls();
    }
    
    function handleActionValueChange( ev ) {
        var row = jQuery( ev.currentTarget ).closest( 'div.actionrow' );
        changeActionRow( row );
    }

    function changeActionAction( row, newVal ) {
        var ct = jQuery( 'div.actiondata', row );
        jQuery( '.argument', ct ).remove();
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
                var parm = action.parameters[k];
                if ( ( parm.direction || "in" ) == "out" ) continue; /* Don't display output params */
                var inp;
                if ( parm.valueSet && deviceInfo.valuesets[parm.valueSet] ) {
                    parm.values = deviceInfo.valuesets[parm.valueSet];
                }
                if ( undefined !== parm.values ) {
                    /* Menu, can be array or object (key/value map) */
                    inp = jQuery('<select class="argument form-control form-control-sm"/>');
                    if ( Array.isArray( parm.values ) ) {
                        for ( var j = 0; j<parm.values.length; j++ ) {
                            var opt = jQuery("<option/>");
                            opt.val( parm.values[j] );
                            opt.text( parm.values[j] );
                            inp.append( opt );
                        }
                    } else {
                        for ( var key in parm.values ) {
                            if ( parm.values.hasOwnProperty( key ) ) {
                                var opt = jQuery("<option/>");
                                opt.val( key );
                                opt.text( parm.values[key] );
                                inp.append( opt );
                            }
                        }
                    }
                } else if ( parm.type == "scene" ) {
                    inp = makeSceneMenu();
                    inp.prepend( '<option value="">--choose--</option>' );
                    if ( undefined !== parm.extraValues ) {
                        if ( Array.isArray( parm.extraValues ) ) {
                            for ( var j=0; j<parm.extraValues.length; j++ ) {
                                var opt = jQuery( '<option/>' ).val( parm.extraValues[j] ).text( parm.extraValues[j] );
                                //inp.append( opt );
                                opt.insertAfter( jQuery( 'option[value=""]:first-child', inp ) );
                            }
                        } else {
                            for ( var key in parm.extraValues ) {
                                if ( parm.extraValues.hasOwnProperty( key ) ) {
                                    var opt = jQuery( '<option/>' ).val( key ).text( parm.extraValues[key] );
                                    opt.insertAfter( jQuery( 'option[value=""]:first-child', inp ) );
                                    //inp.append( opt );
                                }
                            }
                        }
                    }
                    inp.addClass( "argument" ).val("");
                } else if ( parm.type == "boolean" ) {
                    /* Menu */
                    inp = jQuery('<select class="argument form-control form-control-sm"/>');
                    inp.append('<option value="0">0/off/false</option>');
                    inp.append('<option value="1">1/on/true</option>');
                } else if ( parm.type == "ui1" && parm.min !== undefined && parm.max !== undefined ) {
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
                    inp.slider("option", "value", parm.default || parm.min);
                } else if ( parm.type.match(/^(r|u?i)[124]$/i ) ) {
                    inp = jQuery( '<input class="argument narrow form-control form-control-sm">' );
                    inp.attr( 'placeholder', action.parameters[k].name );
                } else {
                    console.log("J_ReactorSensor_UI7.js: using default field presentation for type " + String(parm.type));
                    inp = jQuery( '<input class="argument form-control form-control-sm">' );
                    inp.attr( 'placeholder', action.parameters[k].name );
                }
                inp.attr('id', parm.name );
                inp.on( 'change.reactor', handleActionValueChange );
                /* If there are more than one parameters, wrap each in a label. */
                if ( action.parameters.length > 1 ) {
                    var label = jQuery("<label class='argument'/>");
                    label.attr("for", parm.name );
                    label.text( ( parm.label || parm.name ) + ": " );
                    if ( parm.optional ) label.addClass("optarg");
                    label.append( inp );
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
    
    function merge( dest, src ) {
        if ( typeof(dest) != typeof(src) || typeof(src) != "object") {
            return src;
        }
        for ( var m in src ) {
            if ( src.hasOwnProperty(m) ) {
                if ( dest.hasOwnProperty(m) ) {
                    dest[m] = merge( dest[m], src[m] );
                } else {
                    dest[m] = src[m];
                }
            }
        }
        return dest;
    }

    function getServiceInfo( svc ) {
        if ( typeof( deviceInfo ) !== "undefined" ) {
            if ( typeof( deviceInfo.services ) !== "undefined" ) {
                if ( typeof( deviceInfo.services[svc] ) !== "undefined" ) {
                    return deviceInfo.services[svc];
                }
            }
        }
        return false;
    }
    
    function changeActionDevice( row, newVal, fnext, fargs ) {
        var ct = jQuery( 'div.actiondata', row );
        var actionMenu = jQuery( 'select#actionmenu', ct );

        // Clear the action menu and remove all arguments.
        actionMenu.empty().attr( 'disabled', true );
        jQuery('.argument', ct).remove();
        if ( newVal == "" ) { return; }

        /* Use lu_actions to get list of services/actions for this device. We could
           also use lu_device and fetch/parse /luvd/S_...xml to get even more data,
           but let's see how this goes for now. */
        jQuery.ajax({
            url: api.getDataRequestURL(),
            data: {
                id: "lu_actions",
                DeviceNum: newVal,
                output_format: "json"
            },
            dataType: "json",
            timeout: 5000
        }).done( function( data, statusText, jqXHR ) {
            var mytype = (deviceByNumber[newVal] || {}).device_type || "";
            for ( var i=0; i<data.serviceList.length; i++ ) {
                var section = jQuery( "<select/>" );
                var service = data.serviceList[i];
                var serviceInfo = getServiceInfo( service.serviceId );
                for ( var j=0; j<service.actionList.length; j++ ) {
                    var actname = service.actionList[j].name;
                    var ai;
                    if ( serviceInfo && serviceInfo.actions && serviceInfo.actions[actname] ) {
                        /* Have extended data */
                        ai = serviceInfo.actions[actname];
                    } else {
                        /* No extended data; copy what we got from lu_action */
                        ai = { service: service.serviceId, action: actname, parameters: [] };
                        for ( var ip=0; ip < (service.actionList[j].arguments || []).length; ++ip ) {
                            var p = service.actionList[j].arguments[ip];
                            ai.parameters.push( { name: p.name, type: p.dataType } );
                        }
                    }
                    var key = service.serviceId + "/" + actname;
                    if ( actions[key] === undefined ) {
                        // Save action data as we use it.
                        ai.deviceOverride = {};
                        actions[key] = ai;
                    }
                    if ( ai.hidden ) {
                        continue;
                    }
                    
                    var opt = jQuery('<option></option>');
                    opt.val( key );
                    opt.text( actname );
                    section.append( opt.clone() );
                }
                if ( jQuery("option", section).length > 0 ) {
                    var opt = jQuery("<option/>");
                    opt.val("");
                    opt.text( "---Service " + service.serviceId.replace(/^([^:]+:)+/, "") + "---" );
                    opt.attr( 'disabled', true );
                    opt.addClass("optheading");
                    section.prepend( opt );
                    actionMenu.append( section.children() );
                }
            }
            if ( deviceInfo.devices && deviceInfo.devices['type:'+mytype] ) {
                var known = jQuery("<select/>");
                known.append( "<option class='optheading' value='' disabled><b>---Common Actions---</b></option>" );
                for ( var j=0; j<deviceInfo.devices['type:'+mytype].length; j++ ) {
                    var devact = deviceInfo.devices['type:'+mytype][j];
                    var act = deepcopy( deviceInfo.services[devact.service].actions[devact.action] );
                    for ( var k in devact ) {
                        if ( devact.hasOwnProperty(k) ) {
                            act[k] = devact[k];
                        }
                    }
                    var opt = jQuery('<option/>');
                    var key = devact.service + "/" + devact.action;
                    opt.val( key );
                    opt.text( act.description || devact.action );
                    known.append( opt );
                    if ( undefined === actions[key] ) {
                        act.deviceOverride = {};
                        act.deviceOverride[newVal] = act;
                        actions[key] = act;
                    } else {
                        actions[key].deviceOverride[newVal] = act;
                    }
                }
                known.append("<option disabled/>");
                actionMenu.prepend( known.children() );
            }
            actionMenu.prepend( '<option value="">--choose--</option>' );
            actionMenu.val("");
            actionMenu.attr( 'disabled', false );
            if ( undefined !== fnext ) {
                fnext.apply( null, fargs );
            }
        }).fail( function( jqXHR, textStatus, errorThrown ) {
            // Bummer.
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
    
    function changeActionType( row, newVal ) {
        var ct = jQuery('div.actiondata', row);
        ct.empty();
        jQuery( 'i#action-try,i#action-import', row ).hide();
        if ( newVal == 'device' ) {
            ct.append( makeDeviceMenu( "", "" ) );
            ct.append('<select id="actionmenu" class="form-control form-control-sm"></select>');
            jQuery( 'select.devicemenu', ct ).on( 'change.reactor', handleActionDeviceChange );
            jQuery( 'select#actionmenu', ct ).on( 'change.reactor', handleActionActionChange );
            jQuery( 'i#action-try', row ).show();
        } else if ( newVal == 'comment' ) {
            ct.append('<input type="text" class="argument form-control form-control-sm" placeholder="Enter comment text">');
            jQuery( 'input', ct ).on( 'change.reactor', handleActionValueChange );
        } else if ( newVal == "delay" ) {
            ct.append('<label for="delay">for <input id="delay" type="text" class="argument form-control form-control-sm" placeholder="SS or MM:SS or HH:MM:SS"></label>');
            ct.append('<select id="delaytype" class="form-control form-control-sm"><option value="inline">from this point</option><option value="start">from start of actions</option></select>');
            jQuery( 'input', ct ).on( 'change.reactor', handleActionValueChange );
            jQuery( 'select', ct ).on( 'change.reactor', handleActionValueChange );
        } else if ( newVal == "runscene" ) {
            var m = makeSceneMenu();
            m.prepend('<option value="">--choose--</option>');
            m.val("");
            m.attr('id', 'scene');
            m.on( 'change.reactor', handleActionValueChange );
            ct.append( m );
            jQuery( 'i#action-import', row ).show();
        } else {
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
        if ( "action-up" === op ) {
            /* Move up. */

            /* Move up in display */
            var prior = row.prev(); /* find prior row */
            if ( prior.length > 0 ) {
                row.detach();
                row.insertBefore( prior );
                configModified = true;
                changeActionRow( row ); /* pass it on */
            }
        } else if ( "action-down" === op ) {
            /* Move down */

            /* Move down in display */
            var next = row.next();
            if ( next.length > 0 ) {
                row.detach();
                row.insertAfter( next );
                configModified = true;
                changeActionRow( row );
            }
        } else if ( "action-delete" === op ) {
            row.remove();
            configModified = true;
            changeActionRow( row ); // ???
        } else if ( "action-try" === op ) {
            if ( jQuery( '.tberror', row ).length > 0 ) {
                alert( 'Please fix errors before attempting to run this action.' );
                return;
            }
            var typ = jQuery( 'select#actiontype', row ).val() || "comment";
            if ( "device" === typ ) {
                var d = parseInt( jQuery( 'select.devicemenu', row ).val() );
                var s = jQuery( 'select#actionmenu', row ).val() || "";
                var pt = s.split( /\//, 2 );
                var param = {};
                $( '.argument', row ).each( function( ix ) {
                    var f = jQuery( this );
                    param[ f.attr('id') || "" ] = f.val();
                });
                api.performActionOnDevice( d, pt[0], pt[1], {
                    actionArguments: param,
                    onSuccess: function() {
                        alert( "The action completed successfully!" );
                    },
                    onFailure: function() {
                        //??? are there undocumented parameters here?
                        alert( "The action caused an error. It's a shame Vera doesn't expose any detail information in its API. You're going to have to go look at the log to see what went wrong." );
                    } 
                } );
            } else {
                alert( "Can't perform selected action. You should not be seeing this message." );
            }
        } else if ( "action-import" == op ) {
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
                    for ( var ig=0; ig<(data.groups || []).length; ig++ ) {
                        var newRow;
                        var gr = data.groups[ig];
                        if ( 0 !== (gr.delay || 0) ) {
                            newRow = getActionRow();
                            jQuery( "select#actiontype", newRow).val( "delay" );
                            changeActionType( newRow, "delay" );
                            jQuery( "input#delay", newRow ).val( gr.delay );
                            jQuery( "select#delaytype", newRow ).val( "inline" );
                            pred = newRow.addClass( "tbmodified" ).insertAfter( pred );
                        }
                        for ( var k=0; k < (gr.actions || []).length; k++ ) {
                            var act = gr.actions[k];
                            newRow = getActionRow();
                            jQuery( 'select#actiontype', newRow).val( "device" );
                            changeActionType( newRow, "device" );
                            if ( 0 == jQuery( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
                                var opt = jQuery( '<option/>' ).val( act.device ).text( '#' + act.device + ' ' + ( act.deviceName || 'name?' ) + ' (missing)' );
                                // opt.insertAfter( jQuery( 'select.devicemenu option[value=""]:first-child', newRow ) );
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
        }
    }

    function getActionRow() {
        var row = jQuery('<div class="row actionrow form-inline"></div>');
        row.append('<div class="col-xs-12 col-sm-12 col-md-4 col-lg-2"><select id="actiontype" class="form-control form-control-sm"><option value="comment">Comment</option><option value="runscene">Run Scene</option><option value="device">Device Action</option><option value="delay">Delay</option></select></div>');
        row.append('<div class="actiondata col-xs-12 col-sm-12 col-md-6 col-lg-8"></div>');
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
                if ( "comment" === act.type ) {
                    jQuery( 'input', newRow ).val( act.comment || "" );
                } else if ( "runscene" === act.type ) {
                    if ( 0 === jQuery( 'select#scene option[value="' + act.scene + '"]', newRow ).length ) {
                        /* Insert missing value (ref to non-existent scene) */
                        var el = jQuery( '<option/>' ).val( act.scene ).text( ( act.sceneName || "name?" ) + ' (#' + act.scene + ') (missing)' );
                        jQuery( 'select#scene', newRow ).prepend( el ).addClass( "tberror" );
                    }
                    jQuery( 'select#scene', newRow).val( act.scene );
                } else if ( "device" === act.type ) {
                    if ( 0 == jQuery( 'select.devicemenu option[value="' + act.device + '"]', newRow ).length ) {
                        var opt = jQuery( '<option/>' ).val( act.device ).text( '#' + act.device + ' ' + ( act.deviceName || 'name?' ) + ' (missing)' );
                        // opt.insertAfter( jQuery( 'select.devicemenu option[value=""]:first-child', newRow ) );
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
                            if ( 0 === jQuery( '#' + action.parameters[j].name, row ).length ) {
                                var inp = jQuery( '<input class="argument form-control form-control-sm">' ).attr('id', action.parameters[j].name);
                                var lbl = jQuery( '<label/>' ).attr('for', action.parameters[j].name).text(action.parameters[j].name).addClass('tbrequired').append(inp);
                                jQuery( 'div.actiondata', row ).append( lbl );
                            }
                            jQuery( '#' + action.parameters[j].name, row ).val( action.parameters[j].value || "" );
                        }
                    }, [ newRow, act ]);
                } else {
                    console.log("loadActions: what's a " + act.type + "? Skipping it!");
                    alert( "BUG: type " + act.type + " unknown, skipping." );
                    continue;
                }

                newRow.insertBefore( jQuery( '.buttonrow', section ) );
            }
        }
    }
    
    function handleActionsRevertClick( ev ) {
        alert("not yet implemented");
    }

    function doActivities()
    {
        var myid = api.getCpanelDeviceId();

        try {
            if ( configModified && confirm( "You have unsaved changes. Press OK to save them, or Cancel to discard them." ) ) {
                handleSaveClick( undefined );
            }

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
                    if ( 0 === cd.tripactions.groups.length ) 
                        cd.tripactions.groups = [ { actions: [] } ];
                    cd.tripactions.groups[0].actions.unshift( { type: "runscene", scene: ts } );
                }
                if ( !isNaN(us) ) {
                    if ( undefined === cd.untripactions ) 
                        cd.untripactions = { isReactorScene: true, groups: [ { actions:[] } ] };
                    if ( 0 === cd.untripactions.groups.length ) 
                        cd.untripactions.groups = [ { actions: [] } ];
                    cd.untripactions.groups[0].actions.unshift( { type: "runscene", scene: us } );
                }
                if ( "" !== ( ts + us ) ) {
                    alert( "Your specified trip and untrip scenes have been moved to new-style actions. Please save. " );
                    configModified = true;
                }
            }

            /* Load existing configuration (if any) */
            loadActions( 'tripactions', cd.tripactions || {} );
            loadActions( 'untripactions', cd.untripactions || {} );
            
            jQuery("button.addaction").on( 'click.reactor', handleAddActionClick );
            jQuery("button#saveconf").on( 'click.reactor', handleActionsSaveClick ).attr( "disabled", true );
            jQuery("button#revertconf").on( 'click.reactor', handleActionsRevertClick ).attr( "disabled", true );

            api.registerEventHandler('on_ui_cpanel_before_close', ReactorSensor, 'onBeforeCpanelClose');
        }
        catch (e)
        {
            console.log( 'Error in ReactorSensor.doConditions(): ' + String( e ) );
            alert( e.stack );
        }
    }
    
    function preloadActivities() {
        initModule();

        /* Load material design icons */
        jQuery("head").append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');

        /* Our styles. */
        var html = "<style>";
        html += ".tb-about { margin-top: 24px; }";
        html += ".color-green { color: #428BCA; }";
        html += '.tberror { border: 1px solid red; }';
        html += '.tbwarn { border: 1px solid yellow; background-color: yellow; }';
        html += 'i.md-btn:disabled { color: #cccccc; cursor: auto; }';
        html += 'i.md-btn[disabled] { color: #cccccc; cursor: auto; }';
        html += 'i.md-btn { color: #428BCA; font-size: 14pt; cursor: pointer; }';
        html += 'input.tbinvert { min-width: 16px; min-height: 16px; }';
        html += 'div.fullwidth { width: 100%; }';
        html += 'input.narrow { max-width: 6em; }';
        html += 'div.actionlist { border-radius: 8px; border: 2px solid #428BCA; margin-bottom: 16px; }';
        html += 'div.actionlist .row { margin-right: 0px; margin-left: 0px; }';
        html += 'div.tblisttitle { background-color: #428BCA; color: #fff; font-size: 16px; font-weight: bold; padding: 8px; min-height: 42px; }';
        html += 'div.actionlist label:not(.required) { font-weight: normal; }';
        html += 'div.actionlist label.required { font-weight: bold; }';
        html += 'div.actionlist.tbmodified div.tblisttitle span#titletext:after { content: " (unsaved)" }';
        html += 'div.actionrow,div.buttonrow { padding: 8px; }';
        html += 'div.actionlist div.actionrow:nth-child(odd) { background-color: #EFF6FF; }';
        html += 'div.actionrow.tbmodified:not(.tberror) { border-left: 4px solid green; }';
        html += 'div.actionrow.tberror { border-left: 4px solid red; }';
        html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
        html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
        html += 'div.warning { color: red; }';
        html += 'option.optheading { font-weight: bold; }';
        html += '.tbslider { display: inline-block; width: 200px; height: 1em; border-radius: 8px; }';
        html += '.tbslider .ui-slider-handle { background: url("/cmh/skins/default/img/other/slider_horizontal_cursor_24.png?") no-repeat scroll left center rgba(0,0,0,0); cursor: pointer !important; height: 24px !important; width: 24px !important; margin-top: 6px; font-size: 12px; text-align: center; padding-top: 4px; text-decoration: none; }';
        html += '.tbslider .ui-slider-range-min { background-color: #12805b !important; }';
        html += "</style>";
        jQuery("head").append( html );
        
        api.setCpanelContent( '<div id="loading">Please wait... loading device and activity data, which may take a few seconds.</div>' );

        /* Load the device data */
        var start = Date.now();
        console.log("Loading D_ReactorDeviceInfo.json");
        jQuery.ajax({
            url: api.getSendCommandURL() + "/D_ReactorDeviceInfo.json",
            dataType: "json",
            timeout: 15000
        }).done( function( data, statusText, jqXHR ) {
            console.log("D_ReactorDeviceInfo loaded, " + String(Date.now()-start) + "ms");
            
            deviceInfo = data;
            
            /* Body content */
            html += '<div class="reactoractions fullwidth">';

            html += '<div id="tripactions" class="actionlist">';
            html += '<div class="row"><div class="tblisttitle col-xs-6 col-sm-6"><span id="titletext">Trip Actions</span></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button id="saveconf" class="btn btn-xs btn-success">Save</button> <button id="revertconf" class="btn btn-xs btn-danger">Revert</button></div></div>';
            html += '<div class="row buttonrow"><div class="col-sm-1"><button id="addtripaction" class="addaction btn btn-sm btn-primary">Add Trip Action</button></div></div>';            
            html += '</div>'; // #tripactions
            html += '<div id="untripactions" class="actionlist">';
            html += '<div class="row"><div class="tblisttitle col-xs-6 col-sm-6"><span id="titletext">Untrip Actions</span></div><div class="tblisttitle col-xs-6 col-sm-6 text-right"><button id="saveconf" class="btn btn-xs btn-success">Save</button> <button id="revertconf" class="btn btn-xs btn-danger">Revert</button></div></div>';
            html += '<div class="row buttonrow"><div class="col-sm-1"><button id="adduntripaction" class="addaction btn btn-sm btn-primary">Add Untrip Action</button></div></div>';            
            html += '</div>'; // untripactions

            html += '</div>'; // reactoractions
            
            html += "<p>Test buttons? Each action? Each set?</p>";

            html += footer();
            
            jQuery('div#loading').replaceWith( jQuery( html ) );

            doActivities();
        }).fail( function( jqXHR, textStatus, errorThrown ) {
            // Bummer.
            console.log("Failed to load D_ReactorDeviceInfo.json: " + textStatus + " " + String(errorThrown));
            console.log(jqXHR.responseText);
            deviceInfo = { services: {}, devices: {} };
            if ( jqXHR.status == 500 ) {
                jQuery('div#loading').html("<b>Sorry, not able to load data at this moment!</b> Vera may be busy or reloading. Don't panic! Wait a moment, switch back to the Control tab, and then back here to try again.");
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

    myModule = {
        uuid: uuid,
        initModule: initModule,
        onBeforeCpanelClose: onBeforeCpanelClose,
        onUIDeviceStatusChanged: onUIDeviceStatusChanged,
        doTest: doTest,
        doSettings: doSettings,
        doActivities: preloadActivities,
        doConditions: doConditions,
        doVariables: doVariables,
        doStatusPanel: doStatusPanel
    };
    return myModule;
})(api, $ || jQuery);
