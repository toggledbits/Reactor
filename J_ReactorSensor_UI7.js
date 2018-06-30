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

    // unique identifier for this plugin...
    var uuid = '21b5725a-6dcd-11e8-8342-74d4351650de';

    var myModule = {};
    var myDevice;

    var serviceId = "urn:toggledbits-com:serviceId:ReactorSensor";
    // var deviceType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

    var deviceByNumber;
    var udByDevNum;
    var cdata;
    var ixCond, ixGroup;
    var roomsByName = [];
    var configModified = false;
    var lastx = 0;
    var condTypeName = { "service": "Service/Variable", "housemode": "House Mode", "comment": "Comment", "weekday": "Weekday", "time": "Date/Time" };
    var weekDayName = [ '?', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
    
    /* Create an ID that's functionally unique for our purposes. */
    function getUID( prefix ) {
        /* Not good, but enough. */
        var newx = new Date().getTime();
        if ( newx == lastx ) ++newx;
        lastx = newx;
        return ( prefix === undefined ? "" : prefix ) + newx.toString(16);
    }

    /* Initialize the module */
    function initModule() {
        configModified = false;
        myDevice = api.getCpanelDeviceId();

        /* Make device-indexed version of userdata devices, which is just an array */
        var ud = api.getUserData();
        udByDevNum = [];
        for ( var k=0; k<ud.devices.length; ++k ) {
            udByDevNum[ ud.devices[k].id ] = ud.devices[k];
        }

        /* Get the config and parse it */
        var s = api.getDeviceState( myDevice, serviceId, "cdata" ) || "";
        if ( s.length !== 0 ) {
            try {
                cdata = JSON.parse( s );
            } catch (e) {
                console.log("Unable to parse cdata: " + String(e));
            }
        }
        if ( cdata === undefined || typeof cdata !== "object" || 
                cdata.conditions === undefined || typeof cdata.conditions !== "object" ) {
            cdata = { version: 1, conditions: [
                { groupid: getUID('grp'), groupconditions: [
                    { id: getUID('cond'), type: "comment", comment: "Enter your AND conditions here" }
                    ]
                }
            ]};
        }
        ixGroup = {}; ixCond = {};
        for ( var ig=0; ig<(cdata.conditions || {}).length; ig++ ) {
            var grp = cdata.conditions[ig];
            ixGroup[ grp.groupid ] = grp;
            for ( var ic=0; ic<(grp.groupconditions || {}).length; ic++ ) {
                ixCond[ grp.groupconditions[ic].id ] = grp.groupconditions[ic];
            }
        }

        // Make our own list of devices, sorted by room.
        var devices = api.cloneObject( api.getListOfDevices() );
        deviceByNumber = [];
        var rooms = [];
        var noroom = { "id": 0, "name": "No Room", "devices": [] };
        rooms[noroom.id] = noroom;
        var dd = devices.sort( function( a, b ) {
            if ( a.name.toLowerCase() === b.name.toLowerCase() ) {
                return a.id < b.id ? -1 : 1;
            }
            return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
        });
        for (var i=0; i<dd.length; i+=1) {
            var devobj = api.cloneObject( dd[i] );
            devobj.friendlyName = "#" + devobj.id + " " + devobj.name;
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
            // Special sort for room name -- sorts "No Room" last
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
                str += ' ' + cond.variable + cond.condition + cond.value;
                break;

            case 'comment':
                str = cond.comment;
                break;

            case 'housemode':
                var hmap = [ '?', 'Home','Away','Night','Vacation' ];
                if ( ( cond.value || "" ) === "" ) {
                    str += "Any";
                } else {
                    var t = ( cond.value || "" ).split(/,/);
                    for ( var k=0; k<t.length; ++k ) {
                        t[k] = hmap[t[k]];
                    }
                    str += t.join(' or ');
                }
                break;

            case 'weekday':
                var wmap = { "1": "first", "2": "second", "3": "third", "4": "fourth", "5": "fifth", "last": "last" };
                if ( ( cond.condition || "" ) === "" ) {
                    str = "every";
                } else if ( wmap[cond.condition] ) {
                    str = 'on the ' + wmap[cond.condition];
                } else {
                    str = cond.condition;
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

            case 'time':
                /* fall through */

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
                    if ( devid == myDevice ) {
                        continue;
                    }
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

        var devobj = udByDevNum[parseInt(device)];
        if ( undefined !== devobj ) {
            var mm = {}, ms = [];
            for ( var k=0; k<devobj.states.length; ++k ) {
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
                    // mm[ms[n].text.toLowerCase()] = n;
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

    function makeServiceConditionMenu( cond ) {
        var el = jQuery('<select class="condmenu form-control form-control-sm pull-left"></select>');
        el.append('<option value="=">equals</option>');
        el.append( '<option value="&gt;&lt;">not equals</option>' );
        el.append( '<option value="&lt;">&lt;</option>' );
        el.append( '<option value="&lt;=">&lt;=</option>' );
        el.append( '<option value="&gt;">&gt;</option>' );
        el.append( '<option value="&gt;=">&gt;=</option>' );
        el.append( '<option value="starts">Starts with</option>' );
        el.append( '<option value="ends">Ends with</option>' );
        el.append( '<option value="contains">Contains</option>' );
        el.append( '<option value="in">in</option>' );

        if ( undefined !== cond ) {
            el.val( cond );
        }
        return el;
    }

    function makeDateTimeConditionMenu( cond ) {
        var el = jQuery('<select class="condmenu form-control form-control-sm pull-left"></select>');
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

        jQuery('button#saveconf').attr('disabled', !configModified);
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
     * Update row structure from current display data
     */
    function updateConditionRow( row ) {
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
                cond.condition = jQuery("div.params select.condmenu", row).val();
                cond.value = jQuery("input#value", row).val();
                break;
            case 'weekday':
                cond.condition = jQuery("div.params select.wdcond", row).val() || "";
                /* fall through */
            case 'housemode':
                var res = [];
                jQuery("input#opts:checked", row).each( function( ix, control ) {
                    res.push( control.value /* DOM element */ );
                });
                cond.value = res.join(',');
                break;
            case 'time':
                cond.condition = jQuery("div.params select.condmenu", row).val();
                res = [];
                res.push( jQuery("div.start input.year", row).val() || "" );
                res.push( jQuery("div.start select.monthmenu", row).val() || "" );
                res.push( jQuery("div.start select.daymenu", row).val() || "" );
                res.push( jQuery("div.start select.hourmenu", row).val() || "" );
                res.push( jQuery("div.start select.minmenu", row).val() || "" );
                res.push( jQuery("div.end input.year", row).val() || "" );
                res.push( jQuery("div.end select.monthmenu", row).val() || "" );
                res.push( jQuery("div.end select.daymenu", row).val() || "" );
                res.push( jQuery("div.end select.hourmenu", row).val() || "" );
                res.push( jQuery("div.end select.minmenu", row).val() || "" );
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
        updateConditionRow( row );
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

        // Make a new service/variable menu and replace it on the row.
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

        var dd = jQuery('input.duration', row);
        if ( "" === dd.val() ) {
            if ( undefined !== cond.duration ) {
                delete cond.duration;
                configModified = true;
            }
        } else {
            var n = parseInt( dd.val() );
            if ( isNaN( n ) || n < 0 ) {
                dd.addClass('tberror');
            } else {
                dd.removeClass('tberror');
                if ( (cond.duration||0) !== n ) {
                    /* Changed */
                    if ( n === 0 ) {
                        delete cond.duration;
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
        container.append('<div class="duropt form-inline"><label>Condition is sustained for <input type="text" class="duration form-control form-control-sm narrow"> seconds</label></div>');
        container.append('<i class="material-icons closeopts" title="Close Options">expand_less</i>');
        jQuery('input', container).on( 'change.reactor', handleOptionChange );
        jQuery('i.closeopts', container).on( 'click.reactor', handleCloseOptionsClick );
        jQuery('input.duration', container).val( cond.duration || "0" );

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
                container.append('<input class="form-control form-control-sm type="text">');
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
                pp = makeServiceConditionMenu( cond.condition );
                container.append(pp);
                container.append('<input type="text" id="value" class="form-control form-control-sm">');
                container.append('<i class="material-icons condmore" title="Show Options">expand_more</i>');
                jQuery("input#value", container).val( cond.value );
                jQuery("select.varmenu", container).on( 'change.reactor', handleRowChange );
                jQuery("select.condmenu", container).on( 'change.reactor', handleRowChange );
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
                // ??? first, 2nd, 3rd, 4th, 5th, last ???
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
                jQuery("select.wdcond", container).on( 'change.reactor', handleRowChange ).val( cond.condition || "" );
                (cond.value || "").split(',').forEach( function( val ) {
                    jQuery('input#opts[value="' + val + '"]', container).prop('checked', true);
                });
                break;
            case 'time':
                var pp = makeDateTimeConditionMenu( cond.condition );
                container.append(pp);
                var mname =  [ 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec' ];
                var months = jQuery('<select class="monthmenu form-control form-control-sm"><option value="">(any month)</option></select>');
                for ( var mon=0; mon<12; mon++ ) {
                    months.append('<option value="' + mon + '">' + mname[mon] + ' (' + (mon+1) + ')</option>');
                }
                var days = jQuery('<select class="daymenu form-control form-control-sm"><option value="">(any day)</option></select>');
                for ( var day=1; day<=31; day++ ) {
                    days.append('<option value="' + day + '">' + day + '</option>');
                }
                var hours = jQuery('<select class="hourmenu form-control form-control-sm"><option value="">(any hour)</option></select>');
                hours.append('<option value="sunrise">Sunrise</option><option value="sunset">Sunset</option>');
                for ( var hr = 0; hr<24; hr++ ) {
                    var hh = hr % 12;
                    if ( hh === 0 ) {
                        hh = 12;
                    }
                    hours.append('<option value="' + hr + '">' + hr + ' (' + hh + ( hr < 12 ? "am" : "pm" ) + ')</option>');
                }
                var mins = jQuery('<select class="minmenu form-control form-control-sm"><option value="">(any min)</option></select>');
                for ( var mn=0; mn<=59; mn+=5 ) {
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
                var flist = [ 'div.start select.monthmenu','div.start select.daymenu',
                              'div.start input.year', 'div.start select.hourmenu',
                              'div.start select.minmenu', 'div.end select.monthmenu',
                              'div.end select.daymenu','div.end input.year',
                              'div.end select.hourmenu','div.end select.minmenu'
                ];
                for ( var fx=0; fx<flist.length; fx++ ) {
                    jQuery( flist[fx], container ).val( fx < vals.length ? vals[fx] : '' );
                }
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
        el.append( '<div class="col-sm-2 condtype"><select class="form-control form-control-sm"><option value="">--choose--</option><option value="comment">Comment</option><option value="service">Service/Variable</option><option value="housemode">House Mode</option><option value="weekday">Day of Week</option><option value="time">Date/Time</option></select></div>' );
        el.append( '<div class="col-sm-9 params"></div>' );
        el.append( '<div class="col-sm-1 controls"></div>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-up">arrow_upward</i>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-down">arrow_downward</i>');
        jQuery("div.controls", el).append('<i class="material-icons md-btn action-delete">clear</i>');

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
                        cond.device = parseInt( cond.device );
                        delete cond.comment;
                        break;
                    case 'housemode':
                        removeConditionProperties( cond, 'value' );
                        break;
                    case 'weekday':
                        removeConditionProperties( cond, 'condition,value' );
                        break;
                    case 'time':
                        removeConditionProperties( cond, 'condition,value' );
                        break;
                    default:
                        /* Don't do anything */
                }
            }
        }
        /* Save to persistent state */
        api.setDeviceStatePersistent( myDevice, serviceId, "cdata", JSON.stringify( cdata ), 0);
        configModified = false;
        updateControls();
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

    function updateStatus() {
        var stel = jQuery('div#reactorstatus');
        if ( stel.length === 0 ) {
            // If not displayed, do nothing.
            return;
        }
        stel.empty();

        var cdata, cstate;
        var s = api.getDeviceState( myDevice, serviceId, "cdata" ) || "";
        if ( "" !== s ) {
            try {
                cdata = JSON.parse( s );
            } catch (e) {
                console.log("Unable to parse cdata: " + String(e))
                return;
            }
        } else {
            console.log("cdata unavailable");
            return;
        }

        s = api.getDeviceState( myDevice, serviceId, "cstate" ) || "";
        cstate = {};
        if ( "" !== s ) {
            try {
                cstate = JSON.parse( s );
            } catch (e) {
                console.log("cstate cannot be parsed: " + String(e));
            }
        } else {
            console.log("cstate unavailable");
        }

        for ( var i=0; i<cdata.conditions.length; i++ ) {
            var grp = cdata.conditions[i];

            if ( i > 0 ) {
                /* Insert a divider */
                stel.append('<div class="row divider"><div class="col-sm-5 col-md-5"><hr></div><div class="col-sm-2 col-md-2" style="text-align: center;"><h5>OR</h5></div><div class="col-sm-5 col-md-5"><hr></div></div>');
            }
            
            var grpel = jQuery('<div class="reactorgroup" id="' + grp.groupid + '">');
            stel.append( grpel );
            var groupstate = true;
            for ( var j=0; j<grp.groupconditions.length; j++ ) {
                var cond = grp.groupconditions[j];
                var el = jQuery('<div class="row cond" id="' + cond.id + '">');
                var currentValue = cstate[cond.id] === undefined ? cstate[cond.id] : cstate[cond.id].lastvalue;

                el.append('<div class="col-sm-6 col-md-2">' + 
                    ( condTypeName[ cond.type ] !== undefined ? condTypeName[ cond.type ] : cond.type ) +
                    '</div>');
                    
                var condDesc = makeConditionDescription( cond );
                switch ( cond.type ) {
                    case 'service':
                        condDesc += ( ( cond.duration || 0 ) > 0 ? " for " + cond.duration + " secs" : "" );
                        break;
                        
                    case 'weekday':
                        if ( currentValue !== undefined && weekDayName[ currentValue ] !== undefined ) {
                            currentValue = weekDayName[ currentValue ];
                        }
                        break;
                        
                    case 'time':
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
                        el.append('<div class="col-sm-6 col-md-4">(' + currentValue + ') ' +
                            ( cs.laststate ? "true" : "false" ) +
                            ' as of ' + relativeTime( cs.statestamp ) +
                            '</div>' );
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
        if ( args.id == myDevice ) {
            for ( var k=0; k<args.states.length; ++k ) {
                if ( args.states[k].variable.match( /(cdata|cstate|Tripped|Armed)/ ) ) {
                    console.log( args.states[k].variable + " updated!");
                    updateStatus();
                    return;
                }
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

        api.setCpanelContent( '<div id="reactorstatus"></div>' );

        jQuery('head').append('<style>.reactorgroup { border-radius: 8px; border: 2px solid #006040; padding: 8px; } .truestate { background-color: #ccffcc; }</style>');

        updateStatus();

        api.registerEventHandler('on_ui_deviceStatusChanged', ReactorSensor, 'onUIDeviceStatusChanged');
    }

    function doConditions()
    {
        try {
            initModule();

            // Load material design icons
            jQuery("head").append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');

            // Our styles.
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
            //html += 'div.params .devicemenu,.varmenu { max-width: 30%; }';
            //html += 'div.params .condmenu { max-width: 20%; }';
            //html += 'div.params input#value { max-width: 20%; }';
            html += 'input.narrow { max-width: 6em; }';
            html += 'div.conditiongroup { border-radius: 8px; border: 2px solid #006040; padding: 8px; }';
            html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
            html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
            html += "</style>";
            jQuery("head").append( html );

            // Body content
            html = '';
            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Conditions</h3></div></div>';
            html += '<div class="row"><div class="col-cs-12 col-sm-12">Conditions within a group are "AND", and groups are "OR". That is, the sensor will trip when any group succeeds, and for a group to succeed, all conditions in the group must be met.</div></div>';
            html += '<div id="conditions"></div>';

            html += '<div class="clearfix">';

            html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
            html += '<div id="tbcopyright">Reactor ver 1.1 &copy; 2018 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>, All Rights Reserved. For documentation, please see this project\'s <a href="https://github.com/toggledbits/Reactor" target="_blank">GitHub repository</a>. For support, please post in the <a href="http://forum.micasaverde.com/index.php/topic,87484.0.html" target="_blank">forum thread</a>.</div>';

            // Push generated HTML to page
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
        doSettings: doSettings,
        doConditions: doConditions,
        doStatusPanel: doStatusPanel
    };
    return myModule;
})(api);
