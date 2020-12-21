//# sourceURL=J_ReactorSensor_ALTUI.js
/**
 * J_ReactorSensor_ALTUI.js
 * Special presentation for ALTUI for ReactorSensor
 *
 * Copyright 2018,2019 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 */
/* globals window,MultiBox,ALTUI_PluginDisplays,_T */

var ReactorSensor_ALTUI = ( function( window, undefined ) {

	var pluginVersion = "3.9develop-20355.0930";

	var _UIVERSION = 20355;

	function _getStyle() {
		var style = "button.reactor-cpb { padding: .25rem .5rem; min-width: 4rem; }";
		return style;
	}

	function _draw( device ) {
			var html ="";
			var message = MultiBox.getStatus( device, "urn:toggledbits-com:serviceId:ReactorSensor", "Message");
			var enab = MultiBox.getStatus( device, "urn:toggledbits-com:serviceId:ReactorSensor", "Enabled");
			// var armed = MultiBox.getStatus( device, "urn:micasaverde-com:serviceId:SecuritySensor1", "Armed");
			var vv = MultiBox.getStatus( device, "urn:toggledbits-com:serviceId:ReactorSensor", "_UIV");
			if ( vv !== String(_UIVERSION) ) {
				message = "Installation error. Incompatible UI files.";
			}
			html += '<div class="pull-right">';
			html += ALTUI_PluginDisplays.createOnOffButton( enab, "reactor-enabled-" + device.altuiid, _T("Disabled,Enabled"), "pull-right");
			// html += ALTUI_PluginDisplays.createOnOffButton( armed, "reactor-armed-" + device.altuiid, _T("Disarmed,Armed"), "pull-right");
			html += '</div>';
			html += '<div>' + String(message) + '</div>';
			html += '<div class="clearfix"></div>';
			html += '<div>';
			html += ('<button class="btn btn-xs btn-outline-primary reactor-cpb ml-1" id="reactor-reset-{0}">'+_T("Reset")+'</button>').format(device.altuiid);
			html += ('<button class="btn btn-xs btn-outline-primary reactor-cpb ml-1" id="reactor-trip-{0}">'+_T("Trip")+'</button>').format(device.altuiid);
			html += ('<button class="btn btn-xs btn-outline-warning reactor-cpb ml-1" id="reactor-restart-{0}">'+_T("Restart")+'</button>').format(device.altuiid);
			html += '</div>';
			html += '<script type="text/javascript">';
			html += '$("button#reactor-restart-{0}").on("click", function() { ReactorSensor_ALTUI._deviceAction("{0}", "Restart"); } );'.format(device.altuiid);
			html += '$("button#reactor-reset-{0}").on("click", function() { ReactorSensor_ALTUI._deviceAction("{0}", "Reset"); } );'.format(device.altuiid);
			html += '$("button#reactor-trip-{0}").on("click", function() { ReactorSensor_ALTUI._deviceAction("{0}", "Trip"); } );'.format(device.altuiid);
			html += "$('div#reactor-enabled-{0}').on('click', function() { ReactorSensor_ALTUI.toggleEnabled('{0}','div#reactor-enabled-{0}'); } );".format(device.altuiid);
			// html += "$('div#reactor-armed-{0}').on('click', function() { ReactorSensor_ALTUI.toggleArmed('{0}','div#reactor-armed-{0}'); } );".format(device.altuiid);
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
		/*
		toggleArmed: function (altuiid, htmlid) {
			ALTUI_PluginDisplays.toggleButton(altuiid, htmlid, 'urn:micasaverde-com:serviceId:SecuritySensor1', 'Armed', function(id, newval) {
					MultiBox.runActionByAltuiID( altuiid, 'urn:micasaverde-com:serviceId:SecuritySensor1', 'SetArmed', {newArmedValue:newval} );
			});
		},
		*/
		/* true exports */
		deviceDraw: _draw,
		getStyle: _getStyle
	};
})( window );
