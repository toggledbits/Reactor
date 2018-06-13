//# sourceURL=J_ReactorSensor_UI7.js
/**
 * J_ReactorSensor_UI7.js
 * Configuration interface for ReactorSensor
 *
 * Copyright 2016,2017,2018 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 */
/* globals api,jQuery,$,jsonp */

//"use strict"; // fails on UI7, works fine with ALTUI

var ReactorSensor = (function(api) {

    // unique identifier for this plugin...
    var uuid = '21b5725a-6dcd-11e8-8342-74d4351650de';

    var myModule = {};
    var myDevice;

    var serviceId = "urn:toggledbits-com:serviceId:ReactorSensor";
    var deviceType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";
    
    var deviceByNumber = [];
    var ud;
    var udByDevNum = [];
    var cdata;
    var cindex = {};
    var roomsByName = [];
    var devCap = {};
    var configModified = false;
    var lastx = 0;
    
    function enquote( s ) {
        return JSON.stringify( s );
    }
    
    function getUID( prefix ) {
        /* Not good, but enough. */
        var newx = new Date().getTime();
        if ( newx == lastx ) ++newx;
        lastx = newx;
        return ( prefix === undefined ? "" : prefix ) + newx.toString(16);
    }
    
    function onBeforeCpanelClose(args) {
        /* Send a reconfigure */
        if ( configModified ) {
            alert("Notice: a Luup reload will now be requested so that your changes may take effect.");
            var devid = api.getCpanelDeviceId();
            api.performActionOnDevice( devid, "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "Reload", { } );
        }
    }

    function initPlugin() {
        configModified = false;
        myDevice = api.getCpanelDeviceId();
        
        /* Make device-indexed version of userdata devices, which is just an array */
        ud = api.getUserData();
        udByDevNum = [];
        for ( var k=0; k<ud.devices.length; ++k ) {
            udByDevNum[ ud.devices[k].id ] = ud.devices[k];
        }
        
        /* Get the config and parse it */
        var s = api.getDeviceState( myDevice, serviceId, "cdata" ) || "";
        if ( s.length === 0 ) {
            s = '{ "conditions": [] }';
        }
        cdata = JSON.parse( s );
    }

    /* Return true if device implements requested service */
    function deviceImplements( devobj, service ) {
        if ( undefined === devobj ) { return false; }
        for ( var svc in devobj.ControlURLs ) {
            if ( devobj.ControlURLs[svc].service == service ) {
                return true;
            }
        }
        return false;
    }

    function isSensor( devobj ) {
        if ( undefined === devobj ) { return false; }
        if ( deviceType == devobj.device_type ) return true; /* treat ourselves as sensor */
        return ( devobj.category_num == 4 ) || deviceImplements( devobj, "urn:micasaverde-com:serviceId:SecuritySensor1" );
    }
    
    function isDimmer( devobj ) {
        if ( undefined === devobj ) { return false; }
        return devobj.category_num == 2 || deviceImplements( devobj, "urn:upnp-org:serviceId:Dimming1" );
    }

    function isSwitch( devobj ) {
        if ( undefined === devobj ) { return false; }
        return ( devobj.category_num == 3 ) ||
            devobj.device_type == "urn:schemas-upnp-org:device:VSwitch:1" ||
            deviceImplements( devobj, "urn:upnp-org:serviceId:SwitchPower1" ) ||
            isDimmer( devobj )
            ;
    }
    
    function isControllable( devobj ) {
        // just this for now, in future look at devCap
        if ( devobj.device_type == deviceType ) { return true; } /* Treat ourselves as controllable */
        if ( isSwitch( devobj ) ) {
            return true; 
        }
        return false;
    }

    /**
     */
    function makeDeviceSelector( val ) {
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
            if ( opt.length == 0 ) {
                el.append( '<option value="' + val + '" selected>Device #' + val + '???</option>' );
            } else {
                el.val( val );
            }
        }
        return el;
    }
    
    function makeVariableSelector( device, service, variable ) {
        var el = jQuery('<select class="varmenu form-control form-control-sm pull-left"></select>');
        
        var devobj = udByDevNum[parseInt(device)];
        if ( undefined !== devobj ) {
            var mm = {}, ms = [];
            for ( var k=0; k<devobj.states.length; ++k ) {
                if ( mm[devobj.states[k].variable] === undefined ) {
                    /* Just use variable name as menu text, unless multiple with same name (collision) */
                    mm[devobj.states[k].variable] = ms.length;
                    ms[ms.length] = { text: devobj.states[k].variable, service: devobj.states[k].service, 
                        variable: devobj.states[k].variable };
                } else {
                    /* Collision. Modify existing element to include service name. */
                    var n = mm[devobj.states[k].variable];
                    ms[n].text = ms[n].variable + ' (' + 
                        ms[n].service.replace(/^([^:]+:)+/, "") + ')';
                    /* Append new entry (text has both service and spec */
                    n = ms.length;
                    ms[n] = { text: devobj.states[k].variable + ' (' + 
                        devobj.states[k].service.replace(/^([^:]+:)+/, "") + ')', 
                        service: devobj.states[k].service, 
                        variable: devobj.states[k].variable 
                    };
                    mm[ms[n].text] = n;
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
        
        if ( ( cond || "" ) !== "" ) {
            var opt = jQuery( 'option[value="' + cond + '"]', el );
            if ( opt.length == 0 ) {
                el.append( '<option value="' + cond + '" selected>' + cond + '???</option>' );
            } else {
                el.val( cond );
            }
        }
        return el;
    }
    
    /**
     * Handler for row change (generic) 
     */
    function handleRowChange( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest( 'div.row' );
console.log("ROW CHANGE!");
        var condId = row.attr("id");
        var cond = cindex[ condId ];
        var typ = jQuery("div.condtype select", row).val();
        cond.type = typ;
        switch (typ) {
            case 'service':
                cond.device = jQuery("div.params select.devicemenu", row).val();
                cond.service = jQuery("div.params select.varmenu", row).val();
                cond.variable = cond.service.replace( /^[^\/]+\//, "" );
                cond.service = cond.service.replace(/\/.*$/, "");
                cond.condition = jQuery("div.params select.condmenu", row).val();
                cond.value = jQuery("input#value", row).val();
                break;
            case 'housemode':
                cond.value = jQuery("input#housemode", row).val();
                break;
            case 'comment':
                cond.comment = jQuery("div.params input#comment", row).val();
                break;
            case 'time':
                break;
            default:
                break;
        }
        api.setDeviceStatePersistent( myDevice, serviceId, "cdata", JSON.stringify(cdata), 0);
    }
    
    /**
     * Handler for device change
     */
    function handleDeviceChange( ev ) {
        var el = ev.currentTarget;
        var newDev = jQuery(el).val();
        var row = jQuery( el ).closest('div.row');
        var condId = row.attr('id');
        var cond = cindex[condId];
        cond.device = parseInt(newDev);
        
        // Make a new service/variable menu and replace it on the row.
        var newMenu = makeVariableSelector( cond.device, cond.service, cond.variable )
        jQuery("select.varmenu", row).replaceWith( newMenu );
        handleRowChange( ev ); /* pass it on */
    }
    
    /**
     * Set condition for type
     */
    function setConditionForType( cond, row ) {
        if ( undefined === row ) {
            row = jQuery('div.row#' + cond.id);
        }
        jQuery('div.params', row).empty();
        jQuery('div.value', row).empty();
        switch (cond.type) {
            case "":
                break;
            case 'comment':
                jQuery('div.params', row).append('<input class="form-control form-control-sm id="comment" type="text">');
                jQuery('div.params input#comment').val( cond.comment || "" );
                break;
            case 'service':
                var container = jQuery('<div class="form-inline"></div>');
                var pp = makeDeviceSelector( cond.device );
                container.append(pp);
                pp = makeVariableSelector( cond.device, cond.service, cond.variable );
                container.append(pp);
                pp = makeServiceConditionMenu( cond.condition );
                container.append(pp);
                jQuery("div.params", row).append( container );
                jQuery("div.value", row).append('<input type="text" id="value" class="form-control form-control-sm">');
                jQuery("input#value", row).val( cond.value );
                jQuery("select.varmenu", row).off( 'change.reactor' ).on( 'change.reactor', handleRowChange );
                jQuery("select.condmenu", row).on( 'change.reactor', handleRowChange );
                jQuery("input#value", row).on( 'change.reactor', handleRowChange );
                jQuery("select.devicemenu", row).off( 'change.reactor' ).on( 'change.reactor', handleDeviceChange ).change();
                break;
            case 'housemode':
                jQuery("div.value", row).append( '<form class="form-inline">' +
                    '<div class="form-check"><input type="checkbox" class="form-check-input" id="housemode" value="1"><label class="form-check-label">Home</label></div>' +
                    '<div class="form-check"><input type="checkbox" class="form-check-input" id="housemode" value="2"><label class="form-check-label">Away</label></div>' + 
                    '<div class="form-check"><input type="checkbox" class="form-check-input" id="housemode" value="3"><label class="form-check-label">Night<label></div>' +
                    '<div class="form-check"><input type="checkbox" class="form-check-input" id="housemode" value="4"><label class="form-check-label">Vacation</label></div>' +
                    '</form>'
                );
                /* restore house modes ??? */
            default:
                break;
        }
    }
    
    /**
     * Type change handler.
     */
    function handleTypeChange( ev ) {
        var el = ev.currentTarget;
        var newType = jQuery(el).val();
        var row = jQuery( el ).closest('div.row');
        var condId = row.attr('id');
        if ( cindex[condId] === undefined ) {
            cindex[condId] = { id: condId, type: newType };
        } else {
            cindex[condId].type = newType;
        }
        setConditionForType( cindex[condId], row );
        handleRowChange( ev );
    }
    
    function handleAddConditionClick( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.row'); /* button row */
        var grp = jQuery( el ).closest('div.conditiongroup');
        
        /* Disable the add button for now. */
        jQuery(el).attr('disabled', true);
        
        /* Create a new condition row, assign an ID, and insert it before the button */
        var condel = getConditionRow();
        condel.attr("id", getUID("cond"));
        
        condel.insertBefore(row);
    }
    
    function handleAddGroupClick( ev ) {
        var el = ev.currentTarget;
        var row = jQuery( el ).closest('div.row'); /* add group button row */
        jQuery(el).attr('disabled', true); /* disable the (only) add group button for now */
        
        /* Create a new condition group div, assign a group ID */
        var condgroup = jQuery('<div class="conditiongroup"></div>');
        condgroup.attr('id', getUID("grp"));
        
        /* Insert a new divider with "OR" caption */
        jQuery('<div class="row divider"><div class="col-sm-5"><hr></div><div class="col-sm-2"><h5 style="text-align: center">OR</h5></div><div class="col-sm-5"><hr></div></div>')
            .insertBefore(row);
            
        /* Create a condition row for the first condition in the group */
        var cel = getConditionRow();
        cel.attr("id", getUID("cond"));
        condgroup.append(cel); /* Add it to the conditiongroup */
        
        /* Add an "Add Condition" button for the new group */
        cel = jQuery('<div class="row"><div class="col-sm-1"><button class="addcond btn btn-sm btn-primary">Add Condition</button></div></div>');
        jQuery("button", cel).attr('disabled',true); /* Add Cond is disabled to start */
        condgroup.append(cel); /* Add it to the conditiongroup */
        
        condgroup.insertBefore(row); /* Insert new conditiongroup */
    }
    
    /**
     * Create an empty condition row. Only type selector is pre-populated.
     */
    function getConditionRow() {
        var el = jQuery('<div class="row"></div>');
        el.append( '<div class="col-sm-2 condtype"><select class="form-control form-control-sm"><option value="">--choose--</option><option value="comment">Comment</option><option value="service">Service/Variable</option><option value="housemode">House Mode</option><option value="time">Time</option></select></div>' );
        el.append( '<div class="col-sm-7 params"></div>' );
        el.append( '<div class="col-sm-2 value"></div>' );
        el.append( '<div class="col-sm-1 controls"></div>');
        jQuery('div.condtype select', el).on( 'change.reactor', handleTypeChange );
        return el;
    }
    
    function doSettings()
    {
        try {
            initPlugin();

            var i, j, html = "";

            // Make our own list of devices, sorted by room.
            var devices = api.getListOfDevices();
            deviceByNumber = [];
            var rooms = [];
            var noroom = { "id": "0", "name": "No Room", "devices": [] };
            rooms[noroom.id] = noroom;
            var dd = devices.sort( function( a, b ) {
                if ( a.name.toLowerCase() === b.name.toLowerCase() ) {
                    return a.id < b.id ? -1 : 1;
                }
                return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
            });
            for (i=0; i<dd.length; i+=1) {
                var roomid = dd[i].room || "0";
                var roomObj = rooms[roomid];
                if ( roomObj === undefined ) {
                    roomObj = api.cloneObject(api.getRoomObject(roomid));
                    roomObj.devices = [];
                    rooms[roomid] = roomObj;
                }
                dd[i].friendlyName = "#" + dd[i].id + " " + dd[i].name;
                deviceByNumber[devices[i].id] = dd[i];
                roomObj.devices.push(dd[i]);
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

            var scenes = ud.scenes; /* There is no api.getListOfScenes(). Really? */
            var roomScenes = [];
            if ( undefined !== scenes ) {
                for ( i=0; i<scenes.length; i+=1 ) {
                    if ( undefined === roomScenes[scenes[i].room] ) {
                        roomScenes[scenes[i].room] = [];
                    }
                    roomScenes[scenes[i].room].push(scenes[i]);
                }
            }
            
            html += "<style>";
            html += ".tb-about { margin-top: 24px; }";
            html += ".color-green { color: #00a652; }";
            html += '.tberror { border: 1px solid red; }';
            html += '.tbwarn { border: 1px solid yellow; background-color: yellow; }';
            html += 'input.tbinvert { min-width: 16px; min-height: 16px; }';
            html += 'div.params .devicemenu,.varmenu { max-width: 40%; }';
            html += 'div.params .condmenu { max-width: 20% }';
            html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
            html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
            html += "</style>";
            html += '<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">';

            // Timing
            html += '<div class="row"><div class="col-xs-12 col-sm-12 col-md-8 col-lg-6"><h3>Timing</h3>Reactor uses two timers: <i>automatic</i>, for sensor-triggered events, and <i>manual</i> for load-triggered events.</div></div>';
            html += '<div class="row" id="timing">';
            html += '<div class="col-xs-12 col-sm-6 col-md-4 col-lg-3"><label for="timer-auto">Automatic Off Delay:</label><br/><input class="tbnumeric" id="timer-auto"> secs</div>';
            html += '<div class="col-xs-12 col-sm-6 col-md-4 col-lg-3"><label for="timer-auto">Manual Off Delay:</label><br/><input class="tbnumeric" id="timer-man"> secs</div>';
            html += '</div>';
            
            // Sensor
            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Conditions</h3></div></div>';
            html += '<div class="row"><div class="col-cs-12 col-sm-12">Conditions within a group are "AND", and groups are "OR". That is, the sensor will trip when any group succeeds, and for a group to succeed, all conditions in the group must be met.</div>';
            html += '<div id="conditions">';
            html += '</div>'; /* conditions */
            
            html += '<div class="clearfix">';
            
            html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
            html += '<div id="tbcopyright">Reactor ver 1.0dev &copy; 2018 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>, All Rights Reserved. For documentation and license, please see this project\'s <a href="https://github.com/toggledbits/Reactor" target="_blank">GitHub repository</a>.</div>';

            // Push generated HTML to page
            api.setCpanelContent(html);

            // Restore values
            var s, t;

            // Display the conditions.
            for (var ng=0; ng<cdata.conditions.length; ++ng) {
                if ( ng > 0 ) {
                    /* Insert divider */
                    jQuery("div#conditions").append('<div class="row divider"><div class="col-sm-5"><hr></div><div class="col-sm-2"><h5 style="text-align: center">OR</h5></div><div class="col-sm-5"><hr></div></div>');
                }
                    
                var grp = cdata.conditions[ng];
                if ( grp.groupid === undefined )
                    grp.groupid = getUID("group");
                var gel = jQuery('<div></div>').addClass("conditiongroup").attr("id", grp.groupid);
                for (var nc=0; nc<grp.groupconditions.length; ++nc) {
                    var cond = grp.groupconditions[nc];
                    var row = getConditionRow();
                    if ( cond.id === undefined )
                        cond.id = getUID("cond");
                    row.attr("id", cond.id);
                    cindex[cond.id] = cond;
                    jQuery('div.condtype select', row).val( cond.type );
                    setConditionForType( cond, row );
                    gel.append( row );
                }

                /* Append "Add Condition" button */
                gel.append('<div class="row"><div class="col-sm-1"><button class="addcond btn btn-sm btn-primary">Add Condition</button></div></div>');

                /* Append the group */
                jQuery("div#conditions").append(gel);
            }
            
            /* Insert divider */
            jQuery("div#conditions").append('<div class="row divider"><div class="col-sm-5"><hr></div><div class="col-sm-2"><h5 style="text-align: center"><button id="addgroup" class="btn btn-sm btn-primary">Add Group</button></h5></div><div class="col-sm-5"><hr></div></div>');
            jQuery("button#addgroup").on( 'click.reactor', handleAddGroupClick );

            api.registerEventHandler('on_ui_cpanel_before_close', ReactorSensor, 'onBeforeCpanelClose');
        }
        catch (e)
        {
            console.log( 'Error in ReactorSensor.configurePlugin(): ' + e.toString() );
        }
    }
    
    myModule = {
        uuid: uuid,
        initPlugin: initPlugin,
        onBeforeCpanelClose: onBeforeCpanelClose,
        doSettings: doSettings
    };
    return myModule;
})(api);
