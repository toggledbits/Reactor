//# sourceURL=J_Reactor_ALTUI.js
/**
 * J_Reactor_ALTUI.js
 * Special presentation for ALTUI for Reactor
 *
 * Copyright 2018-2022 Patrick H. Rigney, All Rights Reserved.
 * This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
 */
/* globals window,MultiBox,ALTUI_PluginDisplays,_T */

"use strict";

var Reactor_ALTUI = ( function( window, undefined ) {

	function _getStyle() {
		var style = "";
		return style;
	}

	function _draw( device ) {
			var html ="";
			var message = MultiBox.getStatus( device, "urn:toggledbits-com:serviceId:Reactor", "Message" );
			html += '<div>' + String(message) + '</div>';
			return html;
	}

	return {
		/* true exports */
		deviceDraw: _draw,
		getStyle: _getStyle
	};
})( window );
