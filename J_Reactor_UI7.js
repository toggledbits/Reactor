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

    var myModule = {};

    var serviceId = "urn:toggledbits-com:serviceId:Reactor";
    // unused: var deviceType = "urn:schemas-toggledbits-com:device:Reactor:1";

    // unused: var isOpenLuup = false;
    // unused: var isALTUI = undefined !== MultiBox;
    var backupInfo = false;

    /* Return footer */
    function footer() {
        var html = '';
        html += '<div class="clearfix">';
        html += '<div id="tbbegging"><em>Find Reactor useful?</em> Please consider a small one-time donation to support this and my other plugins on <a href="https://www.toggledbits.com/donate" target="_blank">my web site</a>. I am grateful for any support you choose to give!</div>';
        html += '<div id="tbcopyright">Reactor ver 2.0patch-190112 &copy; 2018 <a href="https://www.toggledbits.com/" target="_blank">Patrick H. Rigney</a>,' +
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
    
    function updateBackupInfo() {
        jQuery( ".reactortab select#restoreitem option[value!='']" ).remove();
        jQuery( ".reactortab select#restoreitem,button#dorestore" ).prop( 'disabled', true );
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
        
        /* Stop all running scenes on this ReactorSensor */
        api.performActionOnDevice( dev.id,  "urn:toggledbits-com:serviceId:ReactorSensor", 
            "StopScene", { actionArguments: { SceneNum: 0, contextDevice: dev.id } } );

        /* Erase its condition state */
        api.setDeviceStateVariablePersistent( dev.id, "urn:toggledbits-com:serviceId:ReactorSensor", "cstate", "{}" );
        
        /* Write new (old/restored) config */
        /* Writing cdata restarts the sensor, so no explicit action call needed after. */
        api.setDeviceStateVariablePersistent( dev.id, serviceId, 
            "cdata", JSON.stringify( backupInfo.sensors[item].config || {} ),
            {
                'onSuccess' : function() {
                    jQuery( '.reactortab div#restorestatus p#' + String(item) ).append( " config restored, restarting" );
                    api.performActionOnDevice( dev.id,  "urn:toggledbits-com:serviceId:ReactorSensor", 
                        "Restart", { actionArguments: { SceneNum: 0, contextDevice: dev.id },
                            onSuccess: function() {
                                jQuery( '.reactortab div#restorestatus p#' + String(item) ).append(", done!");
                            },
                            onFailure: function() {
                                jQuery( '.reactortab div#restorestatus p#' + String(item) ).append("--failed, restart sensor manually.");
                            } 
                        } );
                    
                },
                'onFailure' : function() {
                    if ( tries < 12 ) {
                        jQuery( '.reactortab div#restorestatus p#' + String(item) ).append(".");
                        setTimeout( function() { restore( item, dev, tries ); }, 5000 );
                    } else {
                        jQuery( '.reactortab div#restorestatus p#' + String(item) ).text( backupInfo.sensors[item].name + ' restore failed!' );
                    }
                }
            });
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
                var dev = findDevice( backupInfo.sensors[item].name );
                if ( ! dev ) {
                    jQuery( '.reactortab div#restorestatus' ).append( '<p id="' + dev.id + '">Cannot restore ' +
                        backupInfo.sensors[item].name + ' -- no device with matching name found.</p>' );
                } else if ( dev.device_type != "urn:schemas-toggledbits-com:device:ReactorSensor:1" ) {
                    jQuery( '.reactortab div#restorestatus' ).append( '<p id="' + dev.id + '">Cannot restore ' +
                        backupInfo.sensors[item].name + ' to device #' + dev.id + 
                        ' -- device is not a ReactorSensor.</p>' );
                } else {
                    /* Writing cdata restarts the sensor, so no explicit action call needed */
                    jQuery( '.reactortab div#restorestatus' ).append( '<p id="' + dev.id + '">Restoring ' +
                        backupInfo.sensors[item].name + ' to device #' + String(dev.id) + '...</p>' );
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
        // initModule();
        
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
            html += '<div class="row"><div class="col-xs-12 col-sm-12"><h4>Restore from Backup</h4><div class="form-inline">To restore from the most recent backup (info above), select the item to restore (or ALL to restore everything), and then press the "Begin Restore" button. <b>WARNING:</b> Restoring will overwrite the configuration of any current ReactorSensor having the same name(s). If you want to restore a configuration to a different device, or if you want to restore from another backup file, please refer to the <a href="https://www.toggledbits.com/reactor" target="_blank">documentation</a>.</div><div class="form-inline"><label>Restore: <select id="restoreitem"><option value="">ALL</option></select></label> <button id="dorestore" class="btn btn-sm btn-warning">Begin Restore</button></div><div id="restorestatus"/></div></div>';

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
