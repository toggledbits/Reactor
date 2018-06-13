//# sourceURL=J_ReactorSensor_ALTUI.js
/** 
 * J_ReactorSensor_ALTUI.js
 * Special presentation for ALTUI for ReactorSensor
 *
 * Copyright 2016,2017 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 */
/* globals MultiBox,ALTUI_PluginDisplays,_T */

"use strict";

var ReactorSensor_ALTUI = ( function( window, undefined ) {

    function _getStyle() {
        var style = "";
        style += ".dXelaylight-cpbutton { height: 24px; }";
        return style;
    }
    
    function _draw( device ) {
            var html ="";
            var message = MultiBox.getStatus( device, "urn:toggledbits-com:serviceId:ReactorSensor", "Message");
            var enab = MultiBox.getStatus( device, "urn:toggledbits-com:serviceId:ReactorSensor", "Enabled");
            html += '<div>' + message + '</div>';
            html += ALTUI_PluginDisplays.createOnOffButton( enab, "reactor-enabled-" + device.altuiid, _T("Disabled,Enabled"), "pull-right");
            html += ('<div><button class=".btn-sm .btn-default reactor-cpbutton" id="reactor-reset-{0}">'+_T("Reset")+'</button>').format(device.altuiid);
            html += ('<button class=".btn-sm .btn-warning reactor-cpbutton" id="reactor-trigger-{0}">'+_T("Trigger")+'</button></div>').format(device.altuiid);
            html += '<script type="text/javascript">';
            html += '$("button#reactor-reset-{0}").on("click", function() { ReactorSensor_ALTUI._deviceAction("{0}", "Reset"); } );'.format(device.altuiid);
            html += '$("button#reactor-trigger-{0}").on("click", function() { ReactorSensor_ALTUI._deviceAction("{0}", "Trigger"); } );'.format(device.altuiid);
            html += "$('div#reactor-enabled-{0}').on('click', function() { ReactorSensor_ALTUI.toggleEnabled('{0}','div#reactor-enabled-{0}'); } );".format(device.altuiid);
            html += '</script>';
            return html;
    }
    
    function _deviceAction( altuiid, action ) {
        MultiBox.runActionByAltuiID( altuiid, "urn:toggledbits-com:serviceId:ReactorSensor", action, {} );
    }
    
    return {
        /* convenience exports */
        _deviceAction: _deviceAction,
        toggleEnabled: function (altuiid, htmlid) {
            ALTUI_PluginDisplays.toggleButton(altuiid, htmlid, 'urn:toggledbits-com:serviceId:ReactorSensor', 'Enabled', function(id, newval) {
                    MultiBox.runActionByAltuiID( altuiid, 'urn:toggledbits-com:serviceId:ReactorSensor', 'SetEnabled', {newEnabledValue:newval} );
            });
        },
        /* true exports */
        deviceDraw: _draw,
        getStyle: _getStyle
    };
})( window );
