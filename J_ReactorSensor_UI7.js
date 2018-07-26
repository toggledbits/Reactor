//# sourceURL=J_ReactorSensor_UI7.js
/**
 * J_ReactorSensor_UI7.js
 * Configuration interface for ReactorSensor
 *
 * Copyright 2018 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 */
/* globals api,jQuery */

//"use strict"; // fails on UI7, works fine with ALTUI

var ReactorSensor = (function(api) {

    /* unique identifier for this plugin... */
    var uuid = '21b5725a-6dcd-11e8-8342-74d4351650de';

    var myModule = {};

    var serviceId = "urn:toggledbits-com:serviceId:ReactorSensor";
    // var deviceType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

    var deviceByNumber;
    var udByDevNum;
    var cdata;
    var ixCond, ixGroup;
    var roomsByName = [];
    var configModified = false;
    var lastx = 0;
    var condTypeName = { "service": "Service/Variable", "housemode": "House Mode", "comment": "Comment", "weekday": "Weekday", 'time': "Date (deprecated)",
        "sun": "Sunrise/Sunset", "trange": "Date/Time" };
    var weekDayName = [ '?', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
    var monthName = [ '?', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
    var opName = { "bet": "between", "nob": "not between", "after": "after", "before": "before" };
    var houseModeName = [ '?', 'Home', 'Away', 'Night', 'Vacation' ];

    /* Create an ID that's functionally unique for our purposes. */
    function getUID( prefix ) {
        /* Not good, but enough. */
        var newx = new Date().getTime();
        if ( newx == lastx ) ++newx;
        lastx = newx;
        return ( prefix === undefined ? "" : prefix ) + newx.toString(16);
    }
    
    /* Evaluate input string as integer, strict (no non-numeric chars allowed other than leading/trailing whitespace, empty string fails). */
    function getInteger( s ) {
        s = String(s).replace( /^\s+|\s+$/gm, '' );
        if ( s.match( /^[0-9]+$/ ) ) {
            return parseInt( s );
        }
        return NaN;
    }

    /* Load configuration data */
    function loadConfigData( myid ) {
        var s = api.getDeviceState( myid, serviceId, "cdata" ) || "";
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
        if ( undefined === cdata.variables ) {
            /* Fixup v2 */
            cdata.variables = {};
        }
        ixGroup = {}; ixCond = {};
        for ( var ig=0; ig<(cdata.conditions || {}).length; ig++ ) {
            var grp = cdata.conditions[ig];
            ixGroup[ grp.groupid ] = grp;
            for ( var ic=0; ic<(grp.groupconditions || {}).length; ic++ ) {
                if ( grp.groupconditions[ic].operator === undefined && grp.groupconditions[ic].condition !== undefined ) {
                    /* Fixup v2 */
                    grp.groupconditions[ic].operator = grp.groupconditions[ic].condition;
                }
                ixCond[ grp.groupconditions[ic].id ] = grp.groupconditions[ic];
            }
        }

        return cdata;
    }

    /* Initialize the module */
    function initModule() {
        configModified = false;
        var myid = api.getCpanelDeviceId();

        /* Make device-indexed version of userdata devices, which is just an array */
        var ud = api.getUserData();
        udByDevNum = [];
        for ( var k=0; k<ud.devices.length; ++k ) {
            udByDevNum[ ud.devices[k].id ] = ud.devices[k];
        }

        /* Get the config and parse it */
        cdata = loadConfigData( myid );

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

    /**
     * Find cdata group
     */
    function findCdataGroupIndex( grpid ) {
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
        var grp = ixGroup[ grpid ];
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
                        '#' + cond.device + ( cond.devicename === undefined ? "name unknown" : cond.devicename ) + ' (missing)' );
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
                var vals = ( cond.value || "sunrise+0,sunset+0" ).split(/,/);
                var k = vals[0].match( /^([^+-]+)(.*)/ );
                if ( k === null || k.length !== 3 ) {
                    str += cond.value + '???';
                } else {
                    str += ' ' + k[1];
                    str += ' ' + k[2] + " minutes";
                }
                if ( cond.operator == "bet" || cond.operator == "nob" ) {
                    str += " and ";
                    k = ( vals[1] || "sunset+0" ).match( /^([^+-]+)(.*)/ );
                    if ( k === null || k.length !== 3 ) {
                        str += cond.value + '???';
                    } else {
                        str += ' ' + k[1];
                        str += ' ' + k[2] + " minutes";
                    }
                }
                break;

            case 'time':
                var t = ( cond.value || "" ).split(/,/);
                var ds = textDate( t[0], t[1], t[2], false ) || "";
                var de = textDate( t[5], t[6], t[7], true ) || "";
                str += (cond.operator != "bet" ? "nob " : "") + 'between ' +
                    ds +
                    ' ' +
                    ( isEmpty( t[3] ) ? "*" : t[3] ) + ':' + ( isEmpty( t[4] ) ? "*" : t[4] ) +
                    ' and ' +
                    de +
                    ' ' +
                    ( isEmpty( t[8] ) ? "*" : t[8] ) + ':' + ( isEmpty( t[9] ) ? "*" : t[9] );
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
        var el = jQuery('<select class="devicemenu form-control form-control-sm pull-left"></select>');
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
        var el = jQuery('<select class="varmenu form-control form-control-sm pull-left"></select>');
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
        var el = jQuery('<select class="opmenu form-control form-control-sm pull-left"></select>');
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
        el.append('<option value="bet">between</option>');
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
        var nset = jQuery('div.condtype select option[value=""]:selected').length !== 0;
        jQuery('button.addcond').attr('disabled', nset );

        /* Disable "Add Group" button with same conditions. */
        jQuery('button#addgroup').attr('disabled', nset );
        
        var errors = jQuery('.tberror');
        jQuery('button#saveconf').attr('disabled', ! ( configModified && errors.length === 0 ) );
        jQuery('button#revertconf').attr('disabled', !configModified);

        /* Up/down tools for conditions enabled except up for first and down
           for last. */
        jQuery('div.controls i.action-up').attr('disabled', false);
        jQuery('div.conditionrow:first-child div.controls i.action-up').attr('disabled', true);
        /* Down is more complicated because the "Add Condition" button row is
           the last child in each group. Select only the conditionrows in each
           group, then apply to the last in each of those. */
        jQuery('div.controls i.action-down').attr('disabled', false);
        jQuery('div.conditiongroup').each( function( ix, grpEl ) {
            jQuery( 'div.conditionrow:last div.controls i.action-down', grpEl )
                .attr('disabled', true);
        });

        /* Delete button of single condition in first condition group is
           disabled/hidden. Must keep one condition, hopefully set. */
        jQuery('div.conditionrow div.controls i.action-delete').attr('disabled', false).show();
        var lastMo = jQuery('div.conditiongroup:first-child div.conditionrow div.controls');
        if ( lastMo.length == 1 ) {
            jQuery('i.action-delete', lastMo).attr('disabled', true ).hide();
        }
    }

    /**
     * Update row structure from current display data.
     */
    function updateConditionRow( row, target ) {
        var condId = row.attr("id");
        var cond = ixCond[ condId ];
        var typ = jQuery("div.condtype select", row).val();
        cond.type = typ;
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

            case 'time':
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
                var offset = jQuery('div.params input#startoffset', row).val() || "0";
                offset = getInteger( offset );
                if ( isNaN( offset ) ) {
                    /* Validation error, flag and treat as 0 */
                    offset = 0;
                }
                res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
                if ( cond.operator == "bet" || cond.operator == "nob" ) {
                    jQuery( 'div.end', row ).show();
                    whence = jQuery('select#sunend', row).val() || "sunset";
                    offset = getInteger( jQuery('input#endoffset', row).val() || "0" );
                    if ( isNaN( offset ) ) {
                        offset = 0;
                    }
                    res.push( whence + ( offset < 0 ? '' : '+' ) + String(offset) );
                } else {
                    jQuery( 'div.end', row ).hide();
                    res.push("");
                }
                cond.value = res.join(',');
                break;

            default:
                break;
        }

        updateControls();

        console.log( JSON.stringify( cdata, null, 4 ) );
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
        var cond = ixCond[condId];
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
        var cond = ixCond[ row.attr("id") ];

        var pred = jQuery('select.pred', row);
        if ( "" === pred.val() ) {
            if ( undefined !== cond.after ) {
                delete cond.after;
                configModified = true;
            }
        } else {
            if ( cond.after !== pred.val() ) {
                cond.after = pred.val();
                configModified = true;
            }
        }
        
        var rc = jQuery('input.rcount', row);
        if ( "" === rc.val() || rc.prop('disabled') ) {
            jQuery('input.duration', row).prop('disabled', false);
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
                    configModified = true;
                }
                jQuery('input.duration', row).val("").prop('disabled', true);
                jQuery('input.rspan', row).prop('disabled', false);
                if ( jQuery('input.rspan', row).val() === "" ) {
                    jQuery('input.rspan', row).val("60");
                    cond.repeatwithin = 60;
                    configModified = true;
                }
            }
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
                        jQuery('input.rcount', row).prop('disabled', false);
                        // jQuery('input.rspan', row).prop('disabled', false);
                    } else {
                        cond.duration = n;
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
        var cond = ixCond[ row.attr("id") ];
        var grp = ixGroup[ row.closest('div.conditiongroup').attr('id') ];

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
                opt.text( makeConditionDescription( gc ) );
                preds.append( opt );
            }
        }
        container.append('<div class="predopt form-inline"><label>Only after: </label></div>');
        jQuery('div.predopt label', container).append(preds);
        jQuery('select.pred', container).on( 'change.reactor', handleOptionChange ).val( cond.after );
        /* Duration */
        container.append('<div class="duropt form-inline"><label>State is sustained for <input type="text" class="duration form-control form-control-sm narrow"> seconds</label></div>');
        /* Repeat */
        container.append('<div class="duropt form-inline"><label>State repeats <input type="text" class="rcount form-control form-control-sm narrow"> times within <input type="text" class="rspan form-control form-control-sm narrow"> seconds</label></div>');
        container.append('<i class="material-icons closeopts" title="Close Options">expand_less</i>');
        jQuery('input', container).on( 'change.reactor', handleOptionChange );
        jQuery('i.closeopts', container).on( 'click.reactor', handleCloseOptionsClick );
        if ( ( cond.duration || 0 ) > 0 ) {
            jQuery('input.rcount,input.rspan', container).prop('disabled', true);
            jQuery('input.duration', container).val( cond.duration );
        } else {
            jQuery('input.duration', container).prop('disabled', true);
            jQuery('input.rcount', container).val( cond.repeatcount || "2" );
            jQuery('input.rspan', container).val( cond.repeatwithin || "60" );
        }

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
                container.append('<div class="start form-inline">' +
                    '<select id="sunstart" class="form-control form-control-sm"><option value="sunrise">sunrise</option><option value="sunset">sunset</option></select> '+
                    ' offset&nbsp;<input type="text" id="startoffset" value="" class="narrow form-control form-control-sm">&nbsp;minutes' +
                    '</div>'
                );
                container.append('<div class="end form-inline"> and ' +
                    '<select id="sunend" class="form-control form-control-sm" id="value"><option value="sunrise">sunrise</option><option value="sunset">sunset</option></select> '+
                    ' offset&nbsp;<input type="text" id="endoffset" value="" class="narrow form-control form-control-sm">&nbsp;minutes' +
                    '</div>'
                );
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

            case 'time':
                var pp = makeDateTimeOpMenu( cond.operator );
                container.append(pp);
                var months = jQuery('<select class="monthmenu form-control form-control-sm"><option value=""></option></select>');
                for ( var mon=1; mon<=12; mon++ ) {
                    months.append('<option value="' + mon + '">' + monthName[mon] + ' (' + mon + ')</option>');
                }
                var days = jQuery('<select class="daymenu form-control form-control-sm"></select>');
                for ( var day=1; day<=31; day++ ) {
                    days.append('<option value="' + day + '">' + day + '</option>');
                }
                var hours = jQuery('<select class="hourmenu form-control form-control-sm"><option value="">(every hour)</option></select>');
                hours.append('<option value="sunrise">Sunrise</option><option value="sunset">Sunset</option>');
                for ( var hr = 0; hr<24; hr++ ) {
                    var hh = hr % 12;
                    if ( hh === 0 ) {
                        hh = 12;
                    }
                    hours.append('<option value="' + hr + '">' + hr + ' (' + hh + ( hr < 12 ? "am" : "pm" ) + ')</option>');
                }
                var mins = jQuery('<select class="minmenu form-control form-control-sm"><option value="">(any min)</option></select>');
                for ( var mn=0; mn<60; mn+=5 ) {
                    mins.append('<option value="' + mn + '">:' + (mn < 10 ? '0' : '') + mn + '</option>');
                }
                container.append('<div class="start"></div> and ').append('<div class="end"></div>');
                jQuery("div.start", container).append( months.clone() )
                    .append( days.clone() )
                    .append('<input type="text" placeholder="yyyy" class="year narrow form-control form-control-sm">')
                    .append( hours.clone() )
                    .append( mins.clone() );
                jQuery("div.end", container).append( months )
                    .append( days )
                    .append('<input type="text" placeholder="yyyy" class="year narrow form-control form-control-sm">')
                    .append( hours )
                    .append( mins );
                /* Restore values */
                var vals = (cond.value || "").split(',');
                var flist = [ 'div.start input.year', 'div.start select.monthmenu','div.start select.daymenu',
                              'div.start select.hourmenu', 'div.start select.minmenu',
                              'div.end input.year','div.end select.monthmenu', 'div.end select.daymenu',
                              'div.end select.hourmenu','div.end select.minmenu'
                ];
                for ( var fx=0; fx<flist.length; fx++ ) {
                    jQuery( flist[fx], container ).val( fx < vals.length ? vals[fx] : '' );
                }
                jQuery("select", container).on( 'change.reactor', handleRowChange );
                jQuery("input", container).on( 'change.reactor', handleRowChange );
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
        if ( ixCond[condId] === undefined ) {
            ixCond[condId] = { id: condId, type: newType };
        } else {
            ixCond[condId].type = newType;
        }
        configModified = true;
        setConditionForType( ixCond[condId], row );
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
        jQuery(el).attr('disabled', true);

        /* Create a new condition row, assign an ID, and insert it before the button */
        var newId = getUID("cond");
        var condel = getConditionRow();
        condel.attr("id", newId);
        condel.insertBefore(row);

        /* Add condition to cond store and index */
        var grpId = grp.attr("id");
        ixCond[ newId ] = { id: newId }; /* nearly empty */
        ixGroup[grpId].groupconditions.push( ixCond[newId] );

        configModified = true;
        updateConditionRow( condel );
    }

    /**
     * Handle click on Add Group button.
     */
    function handleAddGroupClick( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.row'); /* add group button row */
        jQuery(el).attr('disabled', true); /* disable the (only) add group button for now */

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
        jQuery("button.addcond", cel).attr('disabled',true); /* Add Cond is disabled to start */
        jQuery("button.addcond", cel).on( 'click.reactor', handleAddConditionClick );

        condgroup.append(cel); /* Add it to the conditiongroup */

        condgroup.insertBefore(row); /* Insert new conditiongroup */

        /* Add to group store and index */
        var newcond = { id: condId };
        ixCond[condId] = newcond;
        ixGroup[newId] = { groupid: newId, groupconditions: [ newcond ] };
        cdata.conditions.push( ixGroup[newId] );

        configModified = true;
        updateConditionRow( cel );
    }

    /**
     * Handle click of sort (up/down) button on condition row.
     */
    function handleConditionSort( ev ) {
        var el = ev.currentTarget;
        if ( jQuery( el ).attr('disabled') ) {
            return;
        }
        var row = jQuery(el).closest('div.row');
        var up = jQuery(el).hasClass('action-up');
        var grpId = row.closest('div.conditiongroup').attr('id');
        var grp = ixGroup[grpId];
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

        /* See if the condition is referenced in a sequence */
        var okDelete = false;
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
        var grp = ixGroup[ grpId ];
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
                        delete ixGroup[ grpId ];
                        cdata.conditions.splice( grpix, 1 );
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

        [ "comment", "service", "housemode", "sun", "weekday", "trange" ].forEach( function( k ) {
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

        for (var ng=0; ng<cdata.conditions.length; ++ng) {
            if ( ng > 0 ) {
                /* Insert divider */
                jQuery("div#conditions").append('<div class="row divider"><div class="col-sm-5"><hr></div><div class="col-sm-2"><h5 style="text-align: center">OR</h5></div><div class="col-sm-5"><hr></div></div>');
            }

            var grp = cdata.conditions[ng];
            if ( grp.groupid === undefined )
                grp.groupid = getUID("group");
            ixGroup[grp.groupid] = grp;

            /* Create div.conditiongroup and add conditions */
            var gel = jQuery('<div class="conditiongroup"></div>').attr("id", grp.groupid);
            for (var nc=0; nc<grp.groupconditions.length; ++nc) {
                var cond = grp.groupconditions[nc];
                var row = getConditionRow();
                if ( cond.id === undefined )
                    cond.id = getUID("cond");
                row.attr("id", cond.id);
                ixCond[cond.id] = cond;
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
            '<div class="col-sm-4"><button id="saveconf" class="btn btn-sm btn-success">Save</button><button id="revertconf" class="btn btn-sm btn-danger">Revert</button></div>');
        jQuery("button#addgroup").on( 'click.reactor', handleAddGroupClick );
        jQuery("button#saveconf").on( 'click.reactor', handleSaveClick );
        jQuery("button#revertconf").on( 'click.reactor', handleRevertClick );

        updateControls();
    }

    /**
     * Handle revert button click: restore setting to last saved and redisplay.
     */
    function handleRevertClick( ev ) {
        initModule();
        redrawConditions();
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
    function handleSaveClick( ev ) {
        /* Rip through conditions and clean up before saving */
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
                    case 'time':
                        removeConditionProperties( cond, 'operator,value' );
                        break;
                    case 'sun':
                        removeConditionProperties( cond, 'operator,value' );
                        break;
                    case 'trange':
                        removeConditionProperties( cond, 'operator,value' );
                        break;
                    default:
                        /* Don't do anything */
                }
            }
        }
        /* Save to persistent state */
        api.setDeviceStatePersistent( api.getCpanelDeviceId(), serviceId, "cdata", JSON.stringify( cdata ),
        {
            'onSuccess' : function() {
                configModified = false;
                updateControls();
            },
            'onFailure' : function() {
                alert('There was a problem saving the configuration. Vera/Luup may have been restarting. Please try hitting the "Save" button again.');
                configModified = true;
                updateControls();
            }
        });
    }

    /* Closing the control panel. */
    function onBeforeCpanelClose(args) {
        console.log( 'onBeforeCpanelClose args: ' + JSON.stringify(args) );
        if ( configModified && confirm( "You have unsaved changes! Press OK to save your changes, or Cancel to discard them." ) ) {
            handleSaveClick( undefined );
        }
    }

    function relativeTime( dt ) {
        if ( 0 === dt || undefined === dt ) {
            return "";
        }
        var dtms = dt * 1000;
        var ago = ( new Date().getTime() - dtms ) / 1000;
        if ( ago < 86400 ) {
            return new Date(dtms).toLocaleTimeString();
        }
        return new Date(dtms).toLocaleString();
    }

    function doSettings()
    {
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
        html += 'These setting do not change system configuration.' +
            ' They override the system values when your ReactorSensor requests them, allowing you to more easily test your conditions.' +
            ' For example, turn on the "Test Date" checkbox above' +
            ' and use the controls to set a date, then go back to the "Control" tab and press the "Restart" button to force a re-evaluation of the sensor state' +
            ' using your selected date/time. <b>Remember to turn these settings off when you have finished testing!</b>' +
            '<p>&nbsp;</p>' +
            '<p>Support links: <a href="https://www.toggledbits.com/reactor" target="_blank">Documentation</a> &bull; <a href="http://forum.micasaverde.com/index.php/topic,87484.0.html" target="_blank">Forum Thread</a> &bull; <a href="/port_3480/data_request?id=lr_Reactor&action=debug" target="_blank">Toggle Debug</a> &bull; <a href="/cgi-bin/cmh/log.sh?Device=LuaUPnP" target="_blank">Log File</a> &bull; <a href="/port_3480/data_request?id=lr_Reactor&action=status" target="_blank">Device Status</a></p>';
        html += '</div></div>';
        html += '</div>'; /* .testfields */

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
    }

    function updateStatus( pdev ) {
        var stel = jQuery('div#reactorstatus');
        if ( stel.length === 0 ) {
            /* If not displayed, do nothing. */
            return;
        }
        stel.empty();

        if ( undefined === ( cdata = loadConfigData( pdev ) ) ) {
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
                            condDesc += " for " + cond.duration + " secs";
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

                    case 'time':
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
                    condDesc += ' (after ' + makeConditionDescription( ixCond[cond.after] ) + ')';
                }
                el.append( jQuery('<div class="col-sm-6 col-md-6"></div>').text( condDesc ) );

                /* Append current value and condition state */
                if ( cond.type !== "comment" ) {
                    if ( currentValue !== undefined ) {
                        var cs = cstate[cond.id];
                        el.append('<div class="currentvalue col-sm-6 col-md-4">(' + currentValue + ') ' +
                            ( cs.laststate ? "true" : "false" ) +
                            ' as of ' + relativeTime( cs.statestamp ) +
                            '</div>' );
                        if ( "service" === cond.type && ( cond.repeatcount || 0 ) > 1 ) {
                            if ( cs.repeats !== undefined && cs.repeats.length > 0 ) {
                                var dtime = Math.floor((new Date()).getTime()/1000) - cs.repeats[0];
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
        var pdev = api.getCpanelDeviceId();
        var doUpdate = false;
        if ( args.id == pdev ) {
            for ( var k=0; k<args.states.length; ++k ) {
                if ( args.states[k].variable.match( /^(cdata|cstate|Tripped|Armed)$/ ) ||
                        args.states[k].service == "urn:toggledbits-com:serviceId:ReactorValues" ) {
                    doUpdate = true;
                    console.log( args.states[k].service + '/' + args.states[k].variable + " updated!");
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
        if ( configModified && confirm( "You have unsaved changes! Press OK to save your changes, or Cancel to discard them." ) ) {
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

        updateStatus( api.getCpanelDeviceId() );

        api.registerEventHandler('on_ui_deviceStatusChanged', ReactorSensor, 'onUIDeviceStatusChanged');
    }

    function doConditions()
    {
        try {
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
            html += "</style>";
            jQuery("head").append( html );

            /* Body content */
            html = '';
            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Conditions</h3></div></div>';
            html += '<div class="row"><div class="col-cs-12 col-sm-12">Conditions within a group are "AND", and groups are "OR". That is, the sensor will trip when any group succeeds, and for a group to succeed, all conditions in the group must be met.</div></div>';
            html += '<div id="conditions"></div>';

            html += '<div class="clearfix">';

            html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
            html += '<div id="tbcopyright">Reactor ver 1.3develop &copy; 2018 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>, All Rights Reserved. Please check out the <a href="https://www.toggledbits.com/reactor" target="_blank">online documentation</a> and <a href="http://forum.micasaverde.com/index.php/topic,87484.0.html" target="_blank">forum thread</a> for support.</div>';

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

    myModule = {
        uuid: uuid,
        initModule: initModule,
        onBeforeCpanelClose: onBeforeCpanelClose,
        onUIDeviceStatusChanged: onUIDeviceStatusChanged,
        doTest: doTest,
        doSettings: doSettings,
        doConditions: doConditions,
        doStatusPanel: doStatusPanel
    };
    return myModule;
})(api);
