//# sourceURL=J_Reactor_UI7.js
/**
 * J_Reactor_UI7.js
 * Configuration interface for Reactor master device
 *
 * Copyright 2018 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 *
 */
/* globals api,jQuery,$ */

//"use strict"; // fails on UI7, works fine with ALTUI

var Reactor = (function(api, $) {

    /* unique identifier for this plugin... */
    var uuid = '72acc6ea-f24d-11e8-bd87-74d4351650de';

    var pluginVersion = '3.0dev-19083';

    var UI_VERSION = 19082;     /* must coincide with Lua core */

    var myModule = {};

    var serviceId = "urn:toggledbits-com:serviceId:Reactor";
    // unused: var deviceType = "urn:schemas-toggledbits-com:device:Reactor:1";
    var rsType = "urn:schemas-toggledbits-com:device:ReactorSensor:1";

    // unused: var isOpenLuup = false;
    // unused: var isALTUI = undefined !== MultiBox;
    var backupInfo = false;

    /* Quote string */
    function quot( s ) {
        return JSON.stringify( String(s) );
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
        html += '<div id="tbcopyright">Reactor ver ' + pluginVersion + ' &copy; 2018,2019 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>,' +
            ' All Rights Reserved. Please check out the <a href="https://github.com/toggledbits/Reactor/wiki" target="_blank">online documentation</a>' +
            ' and <a href="http://forum.micasaverde.com/index.php/board,93.0.html" target="_blank">forum board</a> for support. Double-ring spinner by <a href="https://loading.io/spinner/double-ring" target="_blank">loading.io</a>.</div>';
        html += '<div id="supportlinks">Support links: ' +
            ' <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=debug" target="_blank">Toggle&nbsp;Debug</a>' +
            ' &bull; <a href="/cgi-bin/cmh/log.sh?Device=LuaUPnP" target="_blank">Log&nbsp;File</a>' +
            ' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=status" target="_blank">Plugin&nbsp;Status</a>' +
            ' &bull; <a href="' + api.getDataRequestURL() + '?id=lr_Reactor&action=summary&device=' + api.getCpanelDeviceId() + '" target="_blank">Logic&nbsp;Summary</a>' +
            '</div>';
        return html;
    }

    function initModule( myid ) {
        myid = myid || api.getCpanelDeviceId();

        /* Check agreement of plugin core and UI */
        var s = api.getDeviceState( myid, serviceId, "_UIV" ) || "0";
        console.log("initModule() for device " + myid + " requires UI version " + UI_VERSION + ", seeing " + s);
        if ( String(UI_VERSION) != s ) {
            api.setCpanelContent( '<div class="reactorwarning" style="border: 4px solid red; padding: 8px;">' +
                " ERROR! The Reactor plugin core version and UI version do not agree." +
                " This may cause errors or corrupt your ReactorSensor configuration." +
                " Please hard-reload your browser and try again " +
                ' (<a href="https://duckduckgo.com/?q=hard+reload+browser" target="_blank">how?</a>).' +
                " If you have installed hotfix patches, you may not have successfully installed all required files." +
                " Expected " + String(UI_VERSION) + " got " + String(s) +
                ".</div>" );
            return false;
        }

        return true;
    }

    function updateBackupInfo() {
        jQuery( ".reactortab select option[value!='']" ).remove();
        jQuery( ".reactortab select,button#dorestore" ).prop( 'disabled', true );
        jQuery( ".reactortab div#restorestatus" ).empty();

        if ( backupInfo ) {
            var dt = new Date( backupInfo.timestamp * 1000 ).toLocaleString();
            var el = jQuery( ".reactortab #mostrecent" );
            el.empty();
            el.append( '<div class="lastbackup">Last backup date: ' + dt + '</div>' );
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
                    rt.val("");
                }
                rt.prop( 'disabled', ""===sel );
                /* ??? select matching name, disable default selection if matching device not found??? */
            });
        } else {
            jQuery( ".reactortab div#mosrecent" ).empty().text("No backup information available.");
        }
    }

    function reloadBackupInfo() {
        /* Load the backup data */
        jQuery( ".reactortab div#mostrecent" ).empty().html("<b>LOADING...</b>");
        var urlbase = api.getDataRequestURL().replace( /data_request.*$/i, "" );
        console.log("Fetching " + urlbase + "reactor-config-backup.json");
        jQuery.ajax({
            url: urlbase + "reactor-config-backup.json",
            dataType: "json",
            timeout: 5000
        }).done( function( data, statusText, jqXHR ) {
            backupInfo = data;
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
        api.setDeviceStateVariablePersistent( dev.id, "urn:toggledbits-com:serviceId:ReactorSensor",
            "cdata", JSON.stringify( cdata ),
            {
                'onSuccess' : function() {
                    console.log('Success ' + String(item));
                    jQuery( '.reactortab div#restorestatus p#' + idSelector(item) + ' > img' ).replaceWith( "<span> succeeded.</span>" );
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
        jQuery( '.reactortab div#restorestatus' ).empty().append( '<p>Restore started at ' +
            (new Date()).toLocaleString() + '</p>' );
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
                alert( "The backup failed." );
            }
        }).fail( function( jqXHR, textStatus, errThrown ) {
            alert( "The backup request failed. Vera may be busy/reloading. Wait a moment, then try again." );
        });
    }

    function doBackupRestore() {
        if ( ! initModule() ) {
            return;
        }

        try {

            /* Our styles. */
            var html = "<style>";
            html += 'div#tab-backup.reactortab div.lastbackup { font-weight: bold; color: #008040; }';
            html += 'div#tbcopyright { display: block; margin: 12px 0 12px; 0; }';
            html += 'div#tbbegging { display: block; font-size: 1.25em; line-height: 1.4em; color: #ff6600; margin-top: 12px; }';
            html += "</style>";
            jQuery("head").append( html );

            /* Body content */
            html = '<div id="tab-backup" class="reactortab">';

            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h3>Backup and Restore</h3></div></div>';
            html += '<div class="row"><div class="col-xs-12 col-sm-12">You may back up your Reactor configuration here, or restore a previously backed-up configuration.</div></div>';

            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h4>Most Recent Backup</h4>' +
                '<div id="mostrecent"/>' +
                '</div></div>';
            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h4>Back Up Current Configuration</h4>Press this button to back up your current Reactor configuration: <button id="dobackup" class="btn btn-sm btn-success">Back Up Now</button></div></div>';
            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h4>Restore from Backup</h4><div class="form-inline">To restore from the most recent backup (info above), select the item to restore (or ALL to restore everything), and then press the "Begin Restore" button. <b>WARNING:</b> Restoring will overwrite the configuration of any current ReactorSensor having the same name(s). If you want to restore a configuration to a different device, or if you want to restore from another backup file, please refer to the <a href="https://www.toggledbits.com/reactor" target="_blank">documentation</a>.</div><div class="form-inline"><label>Restore: <select id="restoreitem" class="form-control form-control-sm" disabled><option value="">ALL</option></select></label> <label>to device: <select id="restoretarget" class="form-control form-control-sm" disabled><option value="">with matching name</option></select> <button id="dorestore" class="btn btn-sm btn-warning">Begin Restore</button></div><div id="restorestatus"/></div></div>';

            html += '</div>'; // .reactortab

            html += footer();

            api.setCpanelContent( html );

            jQuery( '.reactortab button#dobackup' ).on( 'click.reactor', handleBackupClick );
            jQuery( '.reactortab button#dorestore' ).on( 'click.reactor', handleRestoreClick );

            reloadBackupInfo();
        }
        catch (e)
        {
            console.log( 'Error in Reactor.doBackupRestore(): ' + String( e ) );
            alert( e.stack );
        }
    }

    myModule = {
        uuid: uuid,
        doBackupRestore: doBackupRestore
    };
    return myModule;
})(api, $ || jQuery);
