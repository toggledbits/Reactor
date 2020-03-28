--[[
	L_Reactor.lua - Core module for Reactor
	Copyright 2018,2019 Patrick H. Rigney, All Rights Reserved.
	This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
--]]
--luacheck: std lua51,module,read globals luup,ignore 542 611 612 614 111/_,no max line length

module("L_Reactor", package.seeall)

local debugMode = false

local _PLUGIN_ID = 9086
local _PLUGIN_NAME = "Reactor"
local _PLUGIN_VERSION = "3.6"
local _PLUGIN_URL = "https://www.toggledbits.com/reactor"

local _CONFIGVERSION	= 20070
local _CDATAVERSION		= 20045	-- must coincide with JS
local _UIVERSION		= 20085	-- must coincide with JS
	  _SVCVERSION		= 20045	-- must coincide with impl file (not local)

local MYSID = "urn:toggledbits-com:serviceId:Reactor"
local MYTYPE = "urn:schemas-toggledbits-com:device:Reactor:1"

local RSSID = "urn:toggledbits-com:serviceId:ReactorSensor"
local RSTYPE = "urn:schemas-toggledbits-com:device:ReactorSensor:1"

local VARSID = "urn:toggledbits-com:serviceId:ReactorValues"
local GRPSID = "urn:toggledbits-com:serviceId:ReactorGroup"

local SENSOR_SID = "urn:micasaverde-com:serviceId:SecuritySensor1"
local SWITCH_SID = "urn:upnp-org:serviceId:SwitchPower1"

local systemReady = false
local sensorState = {}
local tickTasks = {}
local watchData = {}
local luaFunc = {}
local devicesByName = {}
local sceneData = {}
local sceneWaiting = {}
local sceneState = {}
local hasBattery = true
local usesHouseMode = false
local geofenceMode = 0
local geofenceEvent = 0
local maxEvents = 100
local dateFormat = false
local timeFormat = false
local luaEnv -- global state for all runLua actions

local runStamp = 0
local pluginDevice = false
local isALTUI = false
local isOpenLuup = false
local unsafeLua = true
local devVeraAlerts = false
local installPath

local TICKOFFS = 5 -- cond tasks try to run TICKOFFS seconds after top of minute

local TRUESTRINGS = ":y:yes:t:true:on:1:" -- strings that mean true (also numeric ~= 0)

local ARRAYMAX = 100 -- maximum size of an unbounded (luaxp) array (override by providing boundary/size)

local defaultLogLevel = false -- or a number, which is (uh...) the default log level for messages

local _,json = pcall( require, "dkjson" )
local _,socket = pcall( require, "socket" )
local _,mime = pcall( require, "mime" )
local luaxp -- will only be loaded if needed

local function dump(t, seen)
	if t == nil then return "nil" end
	seen = seen or {}
	local sep = ""
	local str = "{ "
	for k,v in pairs(t) do
		local val
		if type(v) == "table" then
			if seen[v] then val = "(recursion)"
			else
				seen[v] = true
				val = dump(v, seen)
			end
		elseif type(v) == "string" then
			val = string.format("%q", v)
		elseif type(v) == "number" and (math.abs(v-os.time()) <= 86400) then
			val = tostring(v) .. "(" .. os.date("%x.%X", v) .. ")"
		else
			val = tostring(v)
		end
		str = str .. sep .. k .. "=" .. val
		sep = ", "
	end
	str = str .. " }"
	return str
end

local function L(msg, ...) -- luacheck: ignore 212
	local str
	local level = defaultLogLevel or 50
	if type(msg) == "table" then
		str = tostring(msg.prefix or _PLUGIN_NAME) .. ": " .. tostring(msg.msg or msg[1])
		level = msg.level or level
	else
		str = _PLUGIN_NAME .. ": " .. tostring(msg)
	end
	str = string.gsub(str, "%%(%d+)", function( n )
			n = tonumber(n, 10)
			if n < 1 or n > #arg then return "nil" end
			local val = arg[n]
			if type(val) == "table" then
				return dump(val)
			elseif type(val) == "string" then
				return string.format("%q", val)
			elseif type(val) == "number" and math.abs(val-os.time()) <= 86400 then
				return tostring(val) .. "(" .. os.date("%x.%X", val) .. ")"
			end
			return tostring(val)
		end
	)
	luup.log(str, math.max(1,level))
--[[ ???dev if level <= 2 then local f = io.open( "/etc/cmh-ludl/Reactor.log", "a" ) if f then f:write( str .. "\n" ) f:close() end end --]]
	if level == 0 then if debug and debug.traceback then luup.log( debug.traceback(), 1 ) end error(str, 2) end
end

local function D(msg, ...)
	if debugMode then
		local inf = debug and debug.getinfo(2, "Snl") or {}
		L( { msg=msg,
			prefix=(_PLUGIN_NAME .. "(" ..
				(inf.name or string.format("<func@%s>", tostring(inf.linedefined or "?"))) ..
				 ":" .. tostring(inf.currentline or "?") .. ")") }, ... )
	end
end

-- An assert() that only functions in debug mode
local function DA(cond, m, ...)
	if cond or not debugMode then return end
	L({level=0,msg=m or "Assertion failed!"}, ...)
	error("assertion failed") -- should be unreachable
end

local function getInstallPath()
	if not installPath then
		installPath = "/etc/cmh-ludl/" -- until we know otherwise
		if isOpenLuup then
			local loader = require "openLuup.loader"
			if loader.find_file then
				installPath = loader.find_file( "L_Reactor.lua" ):gsub( "L_Reactor.lua$", "" )
			end
		end
	end
	return installPath
end

local function split( str, sep )
	sep = sep or ","
	local arr = {}
	if str == nil or #str == 0 then return arr, 0 end
	local rest = string.gsub( str or "", "([^" .. sep .. "]*)" .. sep, function( m ) table.insert( arr, m ) return "" end )
	table.insert( arr, rest )
	return arr, #arr
end

local function urlencode( s )
	-- Could add dot per RFC3986; note space becomes %20
	return s:gsub( "([^A-Za-z0-9_-])", function( m )
			return string.format( "%%%02x", string.byte( m ) ) end
		)
end

-- Shallow copy
local function shallowCopy( t )
	local r = {}
	for k,v in pairs(t or {}) do
		r[k] = v
	end
	return r
end

-- Find device by number, name or UDN
local function finddevice( dev, tdev )
	local vn
	if type(dev) == "number" then
		vn = ( dev == -1 ) and tdev or dev
	elseif type(dev) == "string" then
		if dev == "" then return tdev end
		dev = string.lower( dev )
		if devicesByName[ dev ] ~= nil then
			return devicesByName[ dev ]
		end
		if dev:sub(1,5) == "uuid:" then
			for n,d in pairs( luup.devices ) do
				if string.lower( d.udn ) == dev then
					devicesByName[ dev ] = n
					return n
				end
			end
		else
			for n,d in pairs( luup.devices ) do
				if string.lower( d.description ) == dev then
					devicesByName[ dev ] = n
					return n
				end
			end
		end
		vn = tonumber( dev )
	else
		return nil
	end
	return vn
end

local function fdate( t )
	if not dateFormat then
		dateFormat = luup.attr_get( "date_format", 0 ) or "yy-mm-dd"
		dateFormat = dateFormat:gsub( "yy", "%%Y" ):gsub( "mm", "%%m" ):gsub( "dd", "%%d" );
	end
	return os.date( dateFormat, t )
end

local function ftime( t )
	if not timeFormat then
		timeFormat = ( "12hr" == luup.attr_get( "timeFormat", 0 ) ) and "%I:%M:%S%p" or "%H:%M:%S"
	end
	return os.date( timeFormat, t )
end

-- Get iterator for child devices matching passed table of attributes
-- (e.g. { device_type="urn:...", category_num=4 })
local function childDevices( prnt, attr )
	prnt = prnt or pluginDevice
	attr = attr or {}
	local prev = nil
	return function()
		while true do
			local n, d = next( luup.devices, prev )
			prev = n
			if n == nil then return nil end
			local matched = d.device_num_parent == prnt
			if matched then
				for a,v in pairs( attr ) do
					if d[a] ~= v then
						matched = false
						break
					end
				end
			end
			if matched then return n,d end
		end
	end
end

-- Initialize a variable if it does not already exist.
local function initVar( name, dflt, dev, sid )
	assert( dev ~= nil and sid ~= nil)
	local currVal = luup.variable_get( sid, name, dev )
	if currVal == nil then
		luup.variable_set( sid, name, tostring(dflt), dev )
		return tostring(dflt)
	end
	return currVal
end

-- Set variable, only if value has changed.
local function setVar( sid, name, val, dev )
	val = (val == nil) and "" or tostring(val)
	local s = luup.variable_get( sid, name, dev )
	if s ~= val then
		luup.variable_set( sid, name, val, dev )
	end
	return s
end

-- Delete a state variable. Newer versions of firmware do this by setting nil;
-- older versions require a request.
local function deleteVar( sid, name, dev )
	if luup.variable_get( sid, name, dev ) then
		luup.variable_set( sid, name, "", dev )
		-- For firmware > 1036/3917/3918/3919 http://wiki.micasaverde.com/index.php/Luup_Lua_extensions#function:_variable_set
		luup.variable_set( sid, name, nil, dev )
	end
end

-- Get variable with possible default
local function getVar( name, dflt, dev, sid )
	assert ( name ~= nil and dev ~= nil )
	local s,t = luup.variable_get( sid or RSSID, name, dev )
	if s == nil or s == "" then return dflt,0 end
	return s,t
end

-- Get variable on Reactor parent
local function getReactorVar( name, dflt, dev ) return getVar( name, dflt, dev or pluginDevice, MYSID ) end

-- Get numeric variable, or return default value if not set or blank
local function getVarNumeric( name, dflt, dev, sid )
	assert ( name ~= nil and dev ~= nil )
	DA( dflt==nil or type(dflt)=="number", "Supplied default is not numeric or nil" )
	local s = getVar( name, dflt, dev, sid )
	return type(s)=="number" and s or tonumber(s) or dflt
end

local function getVarBool( name, dflt, dev, sid ) DA(type(dflt)=="boolean", "Supplied default is not boolean") return getVarNumeric( name, dflt and 1 or 0, dev, sid ) ~= 0 end

-- Get var that stores JSON data. Returns data, error flag.
local function getVarJSON( name, dflt, dev, sid )
	assert( dev ~= nil and name ~= nil )
	local s = getVar( name, "", dev, sid ) -- blank default
	if s == "" then return dflt,false end
	local data,pos,err = json.decode( s )
	if data == nil then return dflt,err,pos,s end
	return data,false
end

-- SSL param can be string or CSV; return string or array
local function getSSLListParam( s )
	if s:match(",") then return split(s) end
	return s ~= "" and s or nil
end

-- Build SSL params table from settings
local function getSSLParams( prefix, pdev, sid )
	pdev = pdev or pluginDevice
	sid = sid or MYSID
	-- Max flexibility: SSLParams may contain a JSON string for the entire params table
	local params = getVarJSON( prefix.."SSLParams", false, pdev, sid )
	if params ~= false then D("getSSLParams() %1", params) return params end
	-- Old school: individual config vars for various settings
	params = {}
	-- Repititious, but expeditous. If more in future, go table-driven.
	local sslLib = require "ssl"
	sslLib = sslLib or {}
	for _,v in ipairs{ "SSLProtocol", "SSLMode", "SSLVerify", "SSLOptions" } do
		initVar( prefix..v, "", pdev, sid )
	end
	local s = getVar( prefix.."SSLProtocol", ( ( sslLib._VERSION or "0.5" ):match( "^0%.5" ) ) and "tlsv1" or "any", pdev, sid )
	params.protocol = s ~= "" and s or nil
	s = getVar( prefix.."SSLMode", "client", pdev, sid )
	params.mode = s ~= "" and s or nil
	s = getVar( prefix.."SSLVerify", "none", pdev, sid )
	params.verify = getSSLListParam(s)
	s = getVar( prefix.."SSLOptions", "", pdev, sid )
	params.options = getSSLListParam(s)
	D("getSSLParams() %1", params)
	return params
end

-- Check system battery (VeraSecure)
local function checkSystemBattery( pdev )
	local level, source = "", ""
	if isOpenLuup then return end
	local f = io.popen("battery get powersource") -- powersource=DC mode/Battery mode
	if f then
		local s = f:read("*a") or ""
		f:close()
		D("checkSystemBattery() source query returned %1", s)
		if s ~= "" then
			source = string.match(s, "powersource=(.*)") or ""
			if string.find( source:lower(), "battery" ) then source = "battery"
			elseif string.find( source:lower(), "dc mode" ) then source = "utility"
			end
			f = io.popen("battery get level") -- level=%%%
			if f then
				s = f:read("*a") or ""
				D("checkSystemBattery() level query returned %1", s)
				level = string.match( s, "level=(%d+)" ) or ""
				f:close()
			end
		else
			hasBattery = false
		end
	else
		hasBattery = false
	end
	setVar( MYSID, "SystemPowerSource", source, pdev )
	setVar( MYSID, "SystemBatteryLevel", level, pdev )
end

local function rateFill( rh, tt )
	if tt == nil then tt = os.time() end
	local id = math.floor(tt / rh.divid)
	local minid = math.floor(( tt-rh.period ) / rh.divid) + 1
	for i=minid,id do
		if rh.buckets[tostring(i)] == nil then
			rh.buckets[tostring(i)] = 0
		end
	end
	local del = {}
	for i in pairs(rh.buckets) do
		if tonumber(i) < minid then
			table.insert( del, i )
		end
	end
	for i in ipairs(del) do
		rh.buckets[del[i]] = nil
	end
end

-- Initialize a rate-limiting pool and return in. rateTime is the period for
-- rate limiting (default 60 seconds), and rateDiv is the number of buckets
-- in the pool (granularity, default 15 seconds).
local function initRate( rateTime, rateDiv )
	if rateTime == nil then rateTime = 60 end
	if rateDiv == nil then rateDiv = 15 end
	local rateTab = { buckets = { }, period = rateTime, divid = rateDiv }
	rateFill( rateTab )
	return rateTab
end

-- Bump rate-limit bucket (default 1 count)
local function rateBump( rh, count )
	local tt = os.time()
	local id = math.floor(tt / rh.divid)
	if count == nil then count = 1 end
	rateFill( rh, tt )
	rh.buckets[tostring(id)] = rh.buckets[tostring(id)] + count
end

-- Check rate limit. Return true if rate for period (set in init)
-- exceeds rateMax, rate over period, and 60-second average.
local function rateLimit( rh, rateMax, bump)
	if bump == nil then bump = false end
	if bump then
		rateBump( rh, 1 ) -- bump fills for us
	else
		rateFill( rh )
	end

	-- Get rate
	local nb, t = 0, 0
	for i in pairs(rh.buckets) do
		t = t + rh.buckets[i]
		nb = nb + 1
	end
	local r60 = ( nb < 1 ) and 0 or ( ( t / ( rh.divid * nb ) ) * 60.0 ) -- 60-sec average
	return t > rateMax, t, r60
end

-- Set HMT ModeSetting
local function setHMTModeSetting( hmtdev )
	local chm = luup.attr_get( 'Mode', 0 ) or "1"
	local armed = getVarBool( "Armed", false, hmtdev, SENSOR_SID )
	local s = {}
	for ix=1,4 do
		table.insert( s, string.format( "%d:%s", ix, ( tostring(ix) == chm ) and ( armed and "A" or "" ) or ( armed and "" or "A" ) ) )
	end
	s = table.concat( s, ";" )
	D("setHMTModeSetting(%4) HM=%1 armed=%2; new ModeSetting=%3", chm, armed, s, hmtdev)
	luup.variable_set( "urn:micasaverde-com:serviceId:HaDevice1", "ModeSetting", s, hmtdev )
end

--[[
	Compute sunrise/set for given date (t, a timestamp), lat/lon (degrees),
	elevation (elev in meters). Apply optional twilight adjustment (degrees,
	civil=6.0, nautical=12.0, astronomical=18.0). Returns four values: times
	(as *nix timestamps) of sunrise, sunset, and solar noon; and the length of
	the period in hours (length of day).
	Ref: https://en.wikipedia.org/wiki/Sunrise_equation
	Ref: https://www.aa.quae.nl/en/reken/zonpositie.html
--]]
function sun( lon, lat, elev, t )
	if t == nil then t = os.time() end -- t defaults to now
	if elev == nil then elev = 0.0 end -- elev defaults to 0
	local tau = 6.283185307179586 -- tau > pi
	local pi = tau / 2.0
	local rlat = lat * pi / 180.0
	local rlon = lon * pi / 180.0
	-- Apply TZ offset for JD in local TZ not UTC; truncate time and force noon.
	local gmtnow = os.date("!*t", t) -- get GMT as table
	local nownow = os.date("*t", t) -- get local as table
	gmtnow.isdst = nownow.isdst -- make sure dst agrees
	local locale_offset = os.difftime( t, os.time( gmtnow ) )
	local n = math.floor( ( t + locale_offset ) / 86400 + 0.5 + 2440587.5 ) - 2451545.0
	local N = n - rlon / tau
	local M = ( 6.24006 + 0.017202 * N ) % tau
	local C = 0.0334196 * math.sin( M ) + 0.000349066 *
		math.sin( 2 * M ) + 0.00000523599 * math.sin( 3 * M )
	local lam = ( M + C + pi + 1.796593 ) % tau
	local Jt = 2451545.0 + N + 0.0053 * math.sin( M ) -
		0.0069 * math.sin( 2 * lam )
	local decl = math.asin( math.sin( lam ) * math.sin( 0.409105 ) )
	function w0( rl, elvm, dang, wid )
		wid = wid or 0.0144862
		return math.acos( ( math.sin( (-wid) +
			( -0.0362330 * math.sqrt( elvm ) / 1.0472 ) ) -
				math.sin( rl ) * math.sin( dang ) ) /
		( math.cos( rl ) * math.cos( dang ) ) ) end
	local tw = 0.104719755 -- 6 deg in rad; each twilight step is 6 deg
	local function JE(j) return math.floor( ( j - 2440587.5 ) * 86400 ) end
	return { sunrise=JE(Jt-w0(rlat,elev,decl)/tau), sunset=JE(Jt+w0(rlat,elev,decl)/tau),
		civdawn=JE(Jt-w0(rlat,elev,decl,tw)/tau), civdusk=JE(Jt+w0(rlat,elev,decl,tw)/tau),
		nautdawn=JE(Jt-w0(rlat,elev,decl,2*tw)/tau), nautdusk=JE(Jt+w0(rlat,elev,decl,2*tw)/tau),
		astrodawn=JE(Jt-w0(rlat,elev,decl,3*tw)/tau), astrodusk=JE(Jt+w0(rlat,elev,decl,3*tw)/tau) },
		JE(Jt), 24*w0(rlat,elev,decl)/pi -- solar noon and day length
end

-- Add, if not already set, a watch on a device and service.
local function addServiceWatch( dev, svc, var, target )
	-- Don't watch our own variables--we update them in sequence anyway
	if dev == target and svc == VARSID then return end
	target = tostring(target)
	local watchkey = string.format("%d/%s/%s", dev or 0, svc or "X", var or "X")
	if watchData[watchkey] == nil then
		D("addServiceWatch() adding system watch for %1", watchkey)
		luup.variable_watch( "reactorWatch", svc or "X", var or "X", dev or 0 )
		watchData[watchkey] = watchData[watchkey] or {}
	end
	if watchData[watchkey][target] == nil then
		D("addServiceWatch() subscribing %1 to %2", target, watchkey)
		watchData[watchkey][target] = true
	-- else D("addServiceWatch() %1 is already subscribed to %2", target, watchkey)
	end
end

-- Get sensor state; create empty if it doesn't exist.
local function getSensorState( tdev )
	local ts = tostring(tdev)
	if not sensorState[ts] then
		sensorState[ts] = {}
	end
	return sensorState[ts]
end

-- Open event log file
local function openEventLogFile( tdev )
	local sst = getSensorState( tdev )
	if sst.eventLog then
		pcall( function() sst.eventLog:close() end )
		sst.eventLog = nil
	end
	local path = getVar( "EventLogPath", getInstallPath(), tdev, RSSID ) .. "ReactorSensor" .. tostring(tdev) .. "-events.log"
	sst.eventLogName = nil
	if getVarBool( "LogEventsToFile", false, tdev, RSSID ) then
		local err,errno
		D("openEventLogFile() opening event log file %1", path)
		sst.eventLog,err,errno = io.open( path, "a" )
		if not sst.eventLog then
			L("Failed to open event log for %1 (%2): %4 (%5) %3", luup.devices[tdev].description, tdev, path, err, errno)
			sst.eventLog = false -- stop trying
		else
			sst.eventLogName = path
			sst.eventLog:write(string.format("%s Event log opened\n", os.date("%x %X")))
		end
	else
		D("openEventLogFile() event log file disabled for this RS %1", tdev)
		sst.eventLog = false
		sst.eventLogName = nil
		os.remove( path )
	end
end

-- Add an event to the event list. Prune the list for size.
local function addEvent( t )
	local p = t.msg
	if p then
		p = p:gsub( "%%%(([^%)]+)%)(.)", function( name, spec )
			if spec == "q" then
				if type(t[name]) == "string" then return string.format("%q", t[name]) end
				return tostring(t[name]==nil and "(nil)" or t[name])
			elseif spec ~= "s" then
				luup.log("addEvent warning: bad format spec in "..t.msg, 2)
			end
			return tostring(t[name]) or "(nil)"
		end)
	else
		p = dump(t)
	end
	p = os.date("%Y-%m-%d %H:%M:%S") .. ": " .. p
	local dev = t.dev or pluginDevice
	local sst = getSensorState( dev )
	sst.eventList = sst.eventList or {}
	table.insert( sst.eventList, p )
	while #sst.eventList > 0 and #sst.eventList > maxEvents do table.remove( sst.eventList, 1 ) end
	if sst.eventLog ~= false then openEventLogFile( dev ) end
	if sst.eventLog then pcall( function()
		sst.eventLog:write( p )
		sst.eventLog:write( "\n" )
		sst.eventLog:flush()
		if sst.eventLog:seek() >= ( 1024*getVarNumeric( "EventLogMaxKB", 256, dev, RSSID ) ) then
			sst.eventLog:close()
			if isOpenLuup then
				os.execute("mv '" .. sst.eventLogName .. "' '" .. sst.eventLogName .. ".old'")
			else
				os.execute("pluto-lzo c '" .. sst.eventLogName .. "' '" .. sst.eventLogName .. ".lzo'")
				os.remove( sst.eventLogName )
			end
			sst.eventLog = nil
			sst.eventLogName = nil
		end
	end) end
end

-- Enabled?
local function isEnabled( dev )
	if not getVarBool( "Enabled", true, pluginDevice, MYSID ) then return false end
	return getVarBool( "Enabled", true, dev, RSSID )
end

-- Clear a scheduled timer task
local function clearTask( taskid )
	D("clearTask(%1)", taskid)
	tickTasks[tostring(taskid)] = nil
end

-- Clear all tasks for specific device
local function clearOwnerTasks( owner )
	D("clearOwnerTasks(%1)", owner)
	local del = {}
	for tid,t in pairs( tickTasks ) do
		if t.owner == owner then
			table.insert( del, tid )
			t.when = 0
		end
	end
	for _,tid in ipairs( del ) do
		D("clearOwnerTasks() clearing task %1", tickTasks[tid])
		tickTasks[tid] = nil
	end
end

-- Schedule a timer tick for a future (absolute) time. If the time is sooner than
-- any currently scheduled time, the task tick is advanced; otherwise, it is
-- ignored (as the existing task will come sooner), unless repl=true, in which
-- case the existing task will be deferred until the provided time.
local function scheduleTick( tinfo, timeTick, flags )
	D("scheduleTick(%1,%2,%3)", tinfo, timeTick, flags)
	flags = flags or {}
	if type(tinfo) ~= "table" then tinfo = { id=tinfo } end
	local tkey = tostring( tinfo.id or error("task ID or obj required") )
	assert( not tinfo.args or type(tinfo.args)=="table" )
	assert( not tinfo.func or type(tinfo.func)=="function" )
	if tickTasks[tkey] then
		-- timer already set, update
		tickTasks[tkey].func = tinfo.func or tickTasks[tkey].func
		tickTasks[tkey].args = tinfo.args or tickTasks[tkey].args
		tickTasks[tkey].info = tinfo.info or tickTasks[tkey].info
		if timeTick == nil or tickTasks[tkey].when == nil or timeTick < tickTasks[tkey].when or flags.replace then
			-- Not scheduled, requested sooner than currently scheduled, or forced replacement
			tickTasks[tkey].when = timeTick
		end
	else
		-- New task
		assert(tinfo.owner ~= nil) -- required for new task
		assert(tinfo.func ~= nil) -- required for new task
		tickTasks[tkey] = { id=tostring(tinfo.id), owner=tinfo.owner,
			when=timeTick, func=tinfo.func, args=tinfo.args or {},
			info=tinfo.info or "" }
		D("scheduleTick() new task %1 at %2", tinfo, timeTick)
	end
	if timeTick == nil then return end -- no next tick for task
	-- If new tick is earlier than next plugin tick, reschedule
	tickTasks._plugin = tickTasks._plugin or {}
	if tickTasks._plugin.when == nil or timeTick < tickTasks._plugin.when then
		tickTasks._plugin.when = timeTick
		local delay = timeTick - os.time()
		if delay < 0 then delay = 0 end
		D("scheduleTick() rescheduling plugin tick for %1s to %2", delay, timeTick)
		runStamp = runStamp + 1
		luup.call_delay( "reactorTick", delay, runStamp )
	end
	return tkey
end

-- Schedule a timer tick for after a delay (seconds). See scheduleTick above
-- for additional info.
local function scheduleDelay( tinfo, delay, flags )
	D("scheduleDelay(%1,%2,%3)", tinfo, delay, flags )
	return scheduleTick( tinfo, os.time()+delay, flags )
end

-- Set the status message
local function setMessage(s, dev)
	DA( dev ~= nil )
	luup.variable_set(RSSID, "Message", s or "", dev)
end

-- Array to map, where f(elem) returns key[,value]
local function map( arr, f, res )
	res = res or {}
	for ix,x in ipairs( arr ) do
		if f then
			local k,v = f( x, ix )
			res[k] = (v == nil) and x or v
		else
			res[x] = x
		end
	end
	return res
end

-- Return array of keys for a map (table). Pass array or new is created.
local function getKeys( m, r )
	local seen = {}
	if r ~= nil then for k,_ in pairs( r ) do seen[k] = true end else r = {} end
	for k,_ in pairs( m ) do
		if seen[k] == nil then table.insert( r, k ) seen[k] = true end
	end
	return r
end

-- Return whether item is on list (table as array)
local function isOnList( l, e )
	if l == nil or e == nil then return false end
	for n,v in ipairs(l) do if v == e then return true, n end end
	return false
end

-- We could get really fancy here and track which keys we've seen, etc., but
-- the most common use cases will be small arrays where the overhead of preparing
-- for that kind of efficiency exceeds the benefit it might provide.
local function compareTables( a, b )
	for k in pairs( b ) do
		if b[k] ~= a[k] then return false end
	end
	for k in pairs( a ) do
		if a[k] ~= b[k] then return false end
	end
	return true
end

-- Iterator that returns depth-first traversal of condition groups
local function conditionGroups( root )
	local d = {}
	local k = 0
	local function t( g )
		for _,c in ipairs( g.conditions or {}) do
			if ( c.type or "group" ) == "group" then
				t( c )
			end
		end
		table.insert( d, g )
	end
	t( root )
	return function()
		k = k + 1
		return ( k <= #d ) and d[k] or nil
	end
end

-- Traverse all conditions from c down (assuming c is a group)
local function traverse( c, func )
	func( c )
	if ( "group" == ( c.type or "group" ) ) then
		for _,ch in ipairs( c.conditions or {} ) do
			traverse( ch, func )
		end
	end
end

-- Return iterator for variables in eval order
local function variables( cdata )
	local ar = {}
	for _,v in pairs( cdata.variables or {} ) do
		table.insert( ar, v )
	end
	table.sort( ar, function( a, b )
		local i1 = a.index or -1
		local i2 = b.index or -1
		if i1 == i2 then
			return (a.name or ""):lower() < (b.name or ""):lower()
		end
		return i1 < i2
	end )
	local ix = 0
	return function()
		ix = ix + 1
		if ix > #ar then return nil end
		return ix, ar[ix]
	end
end

local function checkVersion(dev)
	-- In debug mode, any version is fine.
	if debugMode then return true end
	local ui7Check = getReactorVar( "UI7Check", "", dev )
	if isOpenLuup then
		return true
	end
	if luup.version_branch == 1 and luup.version_major == 7 then
		if ui7Check == "" then
			-- One-time init for UI7 or better
			luup.variable_set( MYSID, "UI7Check", "true", dev )
		end
		return true
	end
	L({level=1,msg="firmware %1 (%2.%3.%4) not compatible"}, luup.version,
		luup.version_branch, luup.version_major, luup.version_minor)
	return false
end

-- runOnce() looks to see if a core state variable exists; if not, a one-time initialization
-- takes place.
local function sensor_runOnce( tdev )
	local s = getVarNumeric("Version", 0, tdev, RSSID)
	if s == 0 then
		L("Sensor %1 (%2) first run, setting up new instance...", tdev, luup.devices[tdev].description)

		-- Force this value.
		luup.variable_set( "urn:micasaverde-com:serviceId:HaDevice1", "ModeSetting", "1:;2:;3:;4:", tdev )

		-- Fix up category and subcategory
		luup.attr_set('category_num', 4, tdev)
		luup.attr_set('subcategory_num', 0, tdev)

		luup.variable_set( RSSID, "Version", _CONFIGVERSION, tdev )
		return
	end

	initVar( "Enabled", "1", tdev, RSSID )
	initVar( "Retrigger", "", tdev, RSSID )
	initVar( "Message", "", tdev, RSSID )
	initVar( "Trouble", "0", tdev, RSSID )
	initVar( "cdata", "", tdev, RSSID )
	initVar( "cstate", "", tdev, RSSID )
	initVar( "Runtime", 0, tdev, RSSID )
	initVar( "TripCount", 0, tdev, RSSID )
	initVar( "RuntimeSince", os.time(), tdev, RSSID )
	initVar( "lastacc", os.time(), tdev, RSSID )
	initVar( "ContinuousTimer", "", tdev, RSSID )
	initVar( "MaxUpdateRate", "", tdev, RSSID )
	initVar( "MaxChangeRate", "", tdev, RSSID )
	initVar( "UseReactorScenes", "", tdev, RSSID )
	initVar( "FailOnTrouble", "", tdev, RSSID )
	initVar( "WatchResponseHoldOff", "", tdev, RSSID )
	initVar( "LogEventsToFile", "", tdev, RSSID )
	initVar( "EventLogMaxKB", "", tdev, RSSID )

	initVar( "Armed", 0, tdev, SENSOR_SID )
	initVar( "Tripped", 0, tdev, SENSOR_SID )
	initVar( "ArmedTripped", 0, tdev, SENSOR_SID )
	initVar( "LastTrip", 0, tdev, SENSOR_SID )
	initVar( "AutoUntrip", 0, tdev, SENSOR_SID )

	local currState = getVarNumeric( "Tripped", 0, tdev, SENSOR_SID )
	initVar( "Target", currState, tdev, SWITCH_SID )
	initVar( "Status", currState, tdev, SWITCH_SID )

	-- Consider per-version changes.
	if s < 00206 then
		deleteVar( RSSID, "sundata", tdev ) -- moved to master
	end

	-- Remove old and deprecated values
	deleteVar( RSSID, "Invert", tdev )
	deleteVar( RSSID, "ValueChangeHoldTime", tdev )
	deleteVar( RSSID, "ReloadConditionHoldTime", tdev )

	-- Update version last.
	if s < _CONFIGVERSION then
		luup.variable_set(RSSID, "Version", _CONFIGVERSION, tdev)
	end
end

-- plugin_runOnce() looks to see if a core state variable exists; if not, a one-time initialization
-- takes place.
local function plugin_runOnce( pdev )
	local s = getVarNumeric("Version", 0, pdev, MYSID)
	if s == 0 then
		L("First run, setting up new plugin instance...")

		luup.attr_set('category_num', 1, pdev)
	end

	initVar( "Enabled", 1, pdev, MYSID )
	initVar( "DebugMode", 0, pdev, MYSID )
	initVar( "Message", "", pdev, MYSID )
	initVar( "MaxEvents", "", pdev, MYSID )
	initVar( "MaxLogSnippet", "", pdev, MYSID )
	initVar( "StateCacheExpiry", 600, pdev, MYSID )
	initVar( "UseACE", "", pdev, MYSID )
	initVar( "ACEURL", "", pdev, MYSID )
	initVar( "NumChildren", 0, pdev, MYSID )
	initVar( "NumRunning", 0, pdev, MYSID )
	initVar( "HouseMode", luup.attr_get( "Mode", 0 ) or "1", pdev, MYSID )
	initVar( "LastDST", "0", pdev, MYSID )
	initVar( "IsHome", "", pdev, MYSID )
	initVar( "MaxRestartCount", "", pdev, MYSID )
	initVar( "MaxRestartPeriod", "", pdev, MYSID )
	initVar( "RescanDelay", "", pdev, MYSID )
	initVar( "SMTPServer", "", pdev, MYSID )
	initVar( "SMTPSender", "", pdev, MYSID )
	initVar( "SMTPDefaultRecipient", "", pdev, MYSID )
	initVar( "SMTPDefaultSubject", "", pdev, MYSID )
	initVar( "SMTPUsername", "", pdev, MYSID )
	initVar( "SMTPPassword", "", pdev, MYSID )
	initVar( "SMTPPort", "", pdev, MYSID )
	initVar( "ProwlAPIKey", "", pdev, MYSID )
	initVar( "ProwlProvider", "", pdev, MYSID )
	initVar( "DefaultCollapseConditions", "", pdev, MYSID )

	initVar( "rs", "", pdev, MYSID )

	-- Consider per-version changes.
	if s < 00206 then
		deleteVar( RSSID, "runscene", pdev ) -- correct SID/device mismatch
	end
	if s < 20057 and getReactorVar( "UseACE", "", pdev ) == "1" then
		setVar( MYSID, "UseACE", "", pdev )
	end

	-- Remove old/deprecated values
	deleteVar( RSSID, "Scenes", pdev )
	deleteVar( MYSID, "isHome", pdev )
	deleteVar( RSSID, "cstate", pdev )
	deleteVar( RSSID, "cdata", pdev )
	deleteVar( RSSID, "NotifyQueue", pdev )

	-- Update version last.
	if s < _CONFIGVERSION then
		os.remove( "/etc/cmh-ludl/Reactor.log" )
		luup.variable_set( MYSID, "Version", _CONFIGVERSION, pdev )
	end
end

-- Return current house mode, or test house mode if set
local function getHouseMode( tdev )
	local mode = getVarNumeric( "TestHouseMode", 0, tdev, RSSID )
	if mode ~= 0 then
		addEvent{ dev=tdev, msg="Test house mode is %(mode)s", mode=mode }
		return tostring(mode)
	end
	return getReactorVar( "HouseMode", "1" )
end

-- Load sensor config
local function loadSensorConfig( tdev )
	D("loadSensorConfig(%1)", tdev)
	local upgraded = false
	local s = getVar( "cdata", "", tdev )
	local cdata, pos, err
	if "" ~= s then
		-- Unparseable non-empty config is a hard error, so we have a chance to go in and correct.
		cdata, pos, err = json.decode( s )
		if cdata == nil or type(cdata) ~= "table" then
			L("Unable to parse JSON data at %2, %1 in %3", pos, err, s)
			return error("Unable to load configuration")
		end
		D("loadSensorConfig() loaded configuration version %1", cdata.version)
	end
	if cdata == nil then
		L("Initializing new configuration")
		cdata = {
			serial=0,
			version=_CDATAVERSION,
			conditions={
				root={ id="root", name=luup.devices[tdev].description, ['type']="group", operator="and",
					conditions={
						{ id="cond0", ['type']="comment", comment="Welcome to your new ReactorSensor!" }
					}
				}
			},
			variables={},
			activities={}
		}
		upgraded = true
	elseif ( cdata.version or 0 ) < _CDATAVERSION then
		local fn = string.format( "%sreactor-dev%d-config-v%s-backup.json",
			getInstallPath(), tdev, tostring( cdata.version or 0 ) )
		local f = io.open( fn, "r" )
		if f == nil then
			L("Backing up %1 (#%2) pre-upgrade configuration to %3",
				luup.devices[tdev].description, tdev, fn )
			f = io.open( fn, "w" )
			if f then
				-- Write in backup container format
				local d = {}
				d[tostring(tdev)] = { devnum=tdev, name=luup.devices[tdev].description, config=cdata }
				local mt = { __jsontype="object" } -- empty tables render as object
				setmetatable( d, mt )
				f:write( json.encode(d) )
				f:close()
			end
		else
			f:close()
		end
	end
	if not (cdata.conditions or {}).root then
		L("Upgrading conditions in configuration")
		setVar( RSSID, "oldcdata", json.encode( cdata ), tdev )
		local root = { id="root", name=luup.devices[tdev].description, ['type']="group", conditions={}, operator="and" }
		local od = cdata.conditions or {}
		if #od == 0 or ( #od == 1 and #(od[1].groupconditions or {}) == 0 ) then
			-- No group or first/only group has no conditions. Leave empty root.
		elseif #od == 1 then
			-- Exactly one group. Put all of its conditions into root.
			root.name = od[1].name or od[1].groupid or root.name
			root.conditions = od[1].groupconditions or {}
		else
			-- Multiple groups. Add them all.
			root.operator = "or"
			for ix,grp in ipairs( od ) do
				local sub = { id=grp.groupid or grp.id or ix, name=grp.name or grp.id, ['type']="group", operator="and" }
				sub.conditions = grp.groupconditions or {}
				table.insert( root.conditions, sub )
			end
		end
		cdata.conditions = { root=root }
		-- Do variables index upgrade
		cdata.variables = cdata.variables or {}
		local ix = 0
		for _,vv in pairs( cdata.variables ) do
			vv.index = ix
			ix = ix + 1
		end
		upgraded = true
	end

	cdata.variables = cdata.variables or {}

	cdata.activities = cdata.activities or {}
	if cdata.tripactions then
		L("Upgrading activities in configuration")
		cdata.activities['root.true'] = cdata.tripactions
		cdata.activities['root.true'].id = 'root.true'
		cdata.tripactions = nil
		upgraded = true
	end
	if cdata.untripactions then
		L("Upgrading activities in configuration")
		cdata.activities['root.false'] = cdata.untripactions
		cdata.activities['root.false'].id = 'root.false'
		cdata.untripactions = nil
		upgraded = true
	end

	if ( cdata.version or 0 ) < 19080 then
		-- Upgrade condition options
		local function scanconds( grp )
			for _,cond in ipairs( grp.conditions or {} ) do
				if "group" == ( cond.type or "group" ) then
					scanconds( cond )
				else
					for _,k in pairs( { 'duration','duration_op','after','aftertime','repeatcount','repeatwithin','latch' } ) do
						if cond[k] then
							cond.options = cond.options or {}
							cond.options[k] = cond[k]
							cond[k] = nil
							upgraded = true
						end
					end
				end
			end
		end
		scanconds( cdata.conditions.root or {} )
	end

	-- Backport/downgrade attempt from future version?
	if ( cdata.version or 0 ) > _CDATAVERSION then
		L({level=1,msg="Configuration loaded is format v%1, max compatible with this version of Reactor is %2; upgrade Reactor or restore older config from backup."},
			cdata.version, _CDATAVERSION)
		error("Incompatible config format version. Upgrade Reactor or restore older config from backup.")
	end

	-- Special meta to control encode rendering when needed.
	local mt = { __jsontype="object" } -- dkjson (later revs) empty tables render as object
	if debugMode then
		mt.__index = function(t, n) if debugMode then L({level=1,msg="access to %1 in cdata, which is undefined!"},n) end return rawget(t,n) end
		mt.__newindex = function(t, n, v) rawset(t,n,v) if debugMode then L({level=2,msg="setting %1=%2 in cdata"}, n, v) end end
	end
	setmetatable( cdata, mt )

	-- Rewrite if we upgraded.
	if upgraded then
		D("loadSensorConfig() writing updated sensor config")
		cdata.version = _CDATAVERSION -- MUST COINCIDE WITH J_ReactorSensor_UI7.js
		cdata.timestamp = os.time()
		cdata.serial = 1 + ( tonumber(cdata.serial or 0) or 0 )
		-- NOTA BENE: startup=true passed here! Don't fire watch for this rewrite.
		rawConfig,err = json.encode( cdata )
		if rawConfig and #rawConfig > 0 then
			luup.variable_set( RSSID, "cdata", json.encode( cdata ), tdev, false )
		else
			L({level=1,msg="Can't save! The JSON library (%1) can't encode updated config: %2"}, json.version, err)
			L("%1", cdata)
			error("Unable to encode updated config; not saved.")
		end
	end

	-- Save to cache.
	getSensorState( tdev ).configData = cdata

	-- When loading sensor config, dump luaFunc so that any changes to code
	-- in actions or scenes are honored immediately. This empties without
	-- changing metatable (which defines mode).
	local t = next( luaFunc )
	while t do
		luaFunc[t] = nil
		t = next( luaFunc )
	end
	return cdata
end

-- Get sensor configuration; may be cached.
local function getSensorConfig( tdev, force )
	D("getSensorConfig(%1,%2)", tdev, force)
	local sst = getSensorState( tdev )
	if sst.configData and not force then
		return sst.configData
	end
	return loadSensorConfig( tdev )
end

-- Clean cstate
local function loadCleanState( tdev )
	D("loadCleanState(%1)", tdev)

	-- If we have state in memory, it's assumed to be clean.
	local sst = getSensorState( tdev )
	if sst.condState then
		-- Bump time to avoid expiration (cache hit) and return
		sst.condState.lastUsed = os.time()
		D("loadCleanState() returning cached cstate")
		return sst.condState
	end

	-- Fetch cstate. If it's empty, there's nothing to do here.
	local modified = false
	local cstate,err = getVarJSON( "cstate", {}, tdev )
	if err then
		L({level=2,msg="ReactorSensor %1 (%2) corrupted cstate, clearing!"}, tdev, luup.devices[tdev].description)
		modified = true
	end

	cstate.lastUsed = nil -- remove while working

	local cdata = getSensorConfig( tdev )
	if not cdata then
		L({level=0,msg="ReactorSensor %1 (%2) has corrupt configuration data!"}, tdev, luup.devices[tdev].description)
		-- no return
	end

	-- Find all conditions in cdata
	local conds = {}
	traverse( cdata.conditions.root or { id="root" }, function( c ) conds[c.id] = c end )

	-- Make array of conditions in cstate that aren't in cdata
	local dels = {}
	local now = os.time()
	local timewarned = false
	for k,v in pairs( cstate ) do
		if k ~= "vars" and conds[k] == nil then
			table.insert( dels, k ) -- cond state no for cond not in cdata, mark for deletion
		else
			-- "Real" state... check timestamp
			if ( v.evalstamp and v.evalstamp > now ) or ( v.statestamp and v.statestamp > now ) then
				L({level=2,msg="Last state timestamp(s) for %1 are future! System time may have recently changed dramatically, or Test Time was recently used. %2"},
					k, v)
				timewarned = true
			end
		end
	end
	if timewarned then
		L({level=2,msg="The broken timestamps mentioned above can have serious effects on delay timing options, if used. Restarting %1 (#%2) is recommended."},
			luup.devices[tdev].description, tdev)
		addEvent{ dev=tdev, msg="TROUBLE! Some condition state timestamps are in the future. System clock may have changed dramatically, or Test Time used." }
		getSensorState( tdev ).trouble = true
	end

	-- Delete them
	modified = modified or #dels > 0
	for _,k in ipairs( dels ) do
		D("loadCleanState() deleting saved state %1", k)
		cstate[k] = nil
		deleteVar( GRPSID, "GroupStatus_"..k, tdev )
	end

	-- Clean variables no longer in use
	dels = {}
	for n in pairs( cstate.vars or {} ) do
		if (cdata.variables or {})[n] == nil then
			table.insert( dels, n )
		end
	end
	modified = modified or #dels > 0
	for _,k in ipairs( dels ) do
		D("loadCleanState() deleting variable %1, not in cdata.variables", k)
		cstate.vars[k] = nil
		deleteVar( VARSID, k, tdev )
		deleteVar( VARSID, k .. "_Error", tdev )
	end

	-- Save (possibly) updated state
	cstate.lastUsed = os.time()
	sst.condState = cstate
	if modified then
		D("loadCleanState() saving updated cstate")
		luup.variable_set( RSSID, "cstate", json.encode( cstate ), tdev )
	end
	D("loadCleanState() returning restored cstate")
	return cstate
end

local notifyQueue = {}
local function resetSensorNotify( tdev, taskid )
	setVar( RSSID, "_notify", "0", tdev )
	clearTask( taskid )
end

local function runNotifyTask( pdev, taskid )
	D("runNotifyTask(%1,%2)", pdev, taskid)
	local notice = table.remove( notifyQueue, 1 )
	if notice then
		-- Owner still exists and right type?
		if (luup.devices[ notice.owner ] or {}).device_type == RSTYPE then
			if debugMode then
				local ni = ((getSensorConfig( notice.owner ) or {}).notifications or {})[notice.id]
				D("runNotifyTask() sending notice from %1 to %2: %3", notice.owner, ni.users, ni.message)
			end
			setVar( RSSID, "_notify", notice.id, notice.owner )
			scheduleDelay( { id="notifyreset"..notice.owner, owner=notice.owner, func=resetSensorNotify, replace=true }, 4 )
		else
			L({level=2,msg="Abandoning notification %1 for #%2, device no longer exists"}, notice.id, notice.owner)
		end
		scheduleDelay( taskid, 5 )
	else
		-- Nothing to do; don't reschedule (leave suspended).
		D("runNotifyTask() empty queue")
	end
	-- Persist queue.
	setVar( MYSID, "NotifyQueue", json.encode( notifyQueue ), pluginDevice )
end

local function queueNotification( nid, tdev )
	D("queueNotification(%1,%2)", nid, tdev)
	table.insert( notifyQueue, { id=nid, owner=tdev, timestamp=os.time() } )
	local maxqueue = getVarNumeric( "NoticeQueueLimit", 20, pluginDevice, MYSID )
	while #notifyQueue > 0 and #notifyQueue > maxqueue do table.remove( notifyQueue, 1 ) end
	setVar( MYSID, "NotifyQueue", json.encode( notifyQueue ), pluginDevice )
	scheduleDelay( 'notifier', 5 )
end

-- Clear condition state entirely; returns empty cstate
local function clearConditionState( tdev )
	D("clearConditionState(%1)", tdev)
	luup.variable_set( RSSID, "cstate", "", tdev )
	getSensorState( tdev ).condState = nil
	setVar( SENSOR_SID, "Tripped", "0", tdev )
	setVar( SWITCH_SID, "Target", "0", tdev )
	setVar( SWITCH_SID, "Status", "0", tdev )
	return loadCleanState( tdev )
end

-- Find a condition (or group) by ID. Type may also be included (so to find a
-- group, pass findType="group").
local function findCondition( findId, cdata, findType )
	local function tr( grp, condid, typ )
		if grp.id == condid and ( typ==nil or (grp.type or "group") == typ ) then return grp end
		for _,cond in ipairs( grp.conditions or {} ) do
			if ( cond.type or "group" ) == "group" then
				local r = tr( cond, condid, typ )
				if r then return r end
			elseif cond.id == condid and ( typ==nil or (cond.type or "group") == typ ) then
				return cond
			end
		end
		return false
	end
	return tr( cdata.conditions.root or {}, findId, findType )
end

-- Return true if scene has no actions (takes sceneData table). Works on scenes
-- and activities (former is subset of latter, similar structure).
local function isSceneEmpty( scd )
	D("isSceneEmpty(%1)", scd)
	local e =  scd == nil or -- empty
		next(scd.groups or {}) == nil or -- no groups
		( #scd.groups == 1 and -- exactly one group and...
			(
				next(scd.groups[1].actions or {}) == nil or -- no actions
				( #(scd.groups[1].actions) == 1 and scd.groups[1].actions[1].type == "comment" ) -- only action is comment
			)
		)
	D("isSceneEmpty() %1", e)
	return e
end

-- Load scene data from Luup.
local function loadScene( sceneId, pdev )
	D("loadScene(%1,%2)", sceneId, pdev)
	assert(luup.devices[pdev].device_type == MYTYPE)

	-- Fetch from Luup. Horrid that we can't get this structure directly (have to make HTTP request)
	local req = "http://localhost/port_3480/data_request?id=scene&action=list&output_format=json&scene=" .. tostring(sceneId)
	if isOpenLuup then
		req = "http://localhost:3480/data_request?id=scene&action=list&output_format=json&scene=" .. tostring(sceneId)
	end
	local success, body, httpStatus = luup.inet.wget(req)
	if not success then
		D("loadScene() failed scene request %2: %1", httpStatus, req)
		return false
	end
	local data, pos, err = json.decode(body)
	if not data then
		L("Can't decode JSON response for scene %1: %2 at %3 in %4", sceneId, err, pos, body)
		return false
	end
	data.loadtime = luup.attr_get("LoadTime", 0) or "0"
	if data.groups then
		table.sort( data.groups, function( a, b ) return (a.delay or 0) < (b.delay or 0) end )
	end
	D("loadScene() loaded scene %1: %2", sceneId, data)

	-- Clear the startup Lua for this scene from the Lua chunk cache
	local starter = string.format("scene%s_start", tostring(data.id or ""))
	if luaFunc[starter] then luaFunc[starter] = nil end

	-- Force-encode the scene lua. This is an openLuup issue, as it does not do this by default. Doing so prevents potential JSON issues.
	if (data.lua or "") ~= "" and (data.encoded_lua or 0) == 0 and getVarBool("ForceEncodedLua", true, pluginDevice, MYSID) then
		D("loadScene() force-encoding unencoded lua")
		data.lua = mime.b64( data.lua )
		data.encoded_lua = true
	end

	-- Keep cached
	if next(sceneData) == nil then
		sceneData = getVarJSON( "scenedata", {}, pluginDevice, MYSID )
	end
	sceneData[tostring(data.id)] = data
	luup.variable_set( MYSID, "scenedata", json.encode(sceneData), pdev )
	return data
end

-- Process deferred scene load queue
local function loadWaitingScenes( pdev, ptask )
	D("loadWaitingScenes(%1)", pdev)
	local done = {}
	local maxtries = getVarNumeric( "MaxSceneLoadRetries", 10, pluginDevice, MYSID )
	for sk,sw in pairs(sceneWaiting) do
		if luup.scenes[sw.id] then
			sw.tries = (sw.tries or 0) + 1
			local scd = loadScene( sw.id, pdev )
			D("loadWaitingScenes() load #%1 attempt %2 returned %3", sw.id, sw.tries, tostring(scd))
			if scd then
				-- Got it! loadScene() puts it in cache for us.
				table.insert( done, sk )
			elseif sw.tries >= maxtries then
				-- Too many retries, but we know scene exists. Remove from refresh
				-- queue and leave any cached entry intact.
				L({level=2,msg="Failed to load scene %1 in %2 attempts"},
					sw.id, sw.tries)
				table.insert( done, sk )
			-- else -- will retry, so don't mark done
			end
		else
			-- Scene no longer exists. Remove from refresh queue and cache.
			L({level=2,msg="Load scene #%1 failed, scene no longer exists."}, sw.id)
			sceneData[sk] = nil
			luup.variable_set( MYSID, "scenedata", json.encode(sceneData), pdev )
			table.insert( done, sk )
		end
	end
	for _,sk in ipairs( done ) do
		sceneWaiting[sk] = nil
	end
	if next(sceneWaiting) ~= nil then
		-- More to do, schedule it.
		scheduleDelay( ptask, 5 )
	else
		clearTask( ptask )
	end
end

local function refreshScene( sceneId )
	sceneWaiting[tostring(sceneId)] = { id= sceneId, since=os.time(), tries=0 }
	scheduleDelay( { id="sceneloader", owner=pluginDevice, func=loadWaitingScenes }, 1 )
end

-- Get scene data from cache or Luup. Queue fetch/refetch if needed.
local function getSceneData( sceneId, tdev )
	D("getSceneData(%1,%2)", sceneId, tdev )

	-- Check for activity (ReactorScene)
	local skey = tostring(sceneId)
	local cd = getSensorConfig( tdev )
	if ( cd.activities or {} )[skey] then
		return cd.activities[skey]
	end
	-- This is the "old" way of finding trip and untrip actions for the ReactorSensor.
	-- Keep it around for unchanged configs.
	if skey == "root.true" or skey == "root.false" then
		local pt = skey:match("%.true") and "tripactions" or "untripactions"
		local r = cd[pt]
		if r then r.id = skey r.name = skey end
		return r
	end

	-- Vera scene, or just Reactor Activity that doesn't exist?
	local scid = tonumber( sceneId )
	if scid == nil then return nil end -- silent fail non-numeric (Activity)

	-- At this point, we're looking for a Vera scene, so make sure it's valid.
	if luup.scenes[scid] == nil then
		-- Nope.
		L({level=1,msg="Scene %1 in configuration for %3 (%2) is no longer available!"}, sceneId,
			tdev, luup.devices[tdev].description)
		addEvent{ dev=tdev, msg="TROUBLE: Attempt to run scene %(scene)s, %(error)s", event="runscene", scene=tostring(sceneId), sceneName="", ['error']="scene not found" }
		getSensorState( tdev ).trouble = true
		sceneData[skey] = nil
		return nil
	end

	-- Load persistent (Vera) scene data to cache if cache empty
	if next(sceneData) == nil then
		sceneData = getVarJSON( "scenedata", {}, pluginDevice, MYSID )
	end

	-- See if we can return from cache
	local scd = sceneData[skey]
	if scd ~= nil then
		local llt = tostring( luup.attr_get( "LoadTime", 0 ) or 0 )
		if tostring(scd.loadtime or 0) ~= llt then
			-- Reload since cached, queue for refresh.
			D("getSceneData() reload since scene last cached, queueing update")
			refreshScene( scid )
		end
		D("getSceneData() returning cached: %1", scd)
		return scd -- return cached
	end

	-- We've got nothing. We have to fetch it.
	local data = loadScene( scid, pluginDevice )
	if not data then
		-- Couldn't get it. Try again later.
		D("getSceneData() queueing later scene load for scene %1", scid)
		refreshScene( scid )
		return nil
	end
	sceneWaiting[skey] = nil -- remove any fetch queue entry
	return data
end

-- Stop running scene(s).
local function stopScene( ctx, taskid, tdev, scene )
	D("stopScene(%1,%2,%3,%4)", ctx or false, taskid or false, tdev or false, scene or false) -- avoid nil shortcut
	assert(luup.devices[tdev].device_type == MYTYPE or luup.devices[tdev].device_type == RSTYPE)
	for tid,d in pairs(sceneState) do
		if ( ctx == nil or ctx == d.context ) and ( taskid == nil or taskid == tid ) and ( scene == nil or d.scene == scene) then
			D("stopScene() stopping scene task %1", tid)
			clearTask( tid )
			sceneState[tid] = nil
		end
	end
	luup.variable_set( MYSID, "runscene", json.encode(sceneState), pluginDevice )
end

-- Reset latches on group (all groups if group is false/nil)
local function resetLatched( group, tdev )
	D("resetLatched(%1,%2)", group, tdev)
	local changed = false
	local cf = getSensorConfig( tdev )
	local cs = loadCleanState( tdev )
	local function _resetcond( c )
		D("resetLatched() cond %1 latched %2", c.id, (cs[c.id] or {}).latched)
		if ( cs[c.id] or {} ).latched then
			if cs[c.id].evalstate ~= cs[c.id].latchstate then
				addEvent{dev=tdev,
					msg="%(cname)s latch reset, state changes from %(oldState)q to %(newState)q",
					cname=(c.type or "group")=="group" and ("Group "..(c.name or c.id)) or ("Condition "..c.id),
					event='evalchange',cond=c.id,oldState=cs[c.id].evalstate,newState=cs[c.id].latchstate,reason="latchreset"}
				cs[c.id].evalstate = cs[c.id].latchstate
				cs[c.id].evalstamp = os.time()
				cs[c.id].evaledge[ cs[c.id].latchstate and "t" or "f" ] = cs[c.id].evalstamp
			end
			cs[c.id].latched = nil
			cs[c.id].latchstate = nil
			cs[c.id].changed = true
			changed = true
		end
		D("resetLatched() AFTER cond %1 latched %2", c.id, (cs[c.id] or {}).latched)
	end
	if not group then
		traverse( cf.conditions.root, _resetcond )
	else
		local g = findCondition( group, cf, "group" )
		if g then
			-- Traverse down from g, resetting all latched conditions
			for _,c in ipairs( g.conditions or {} ) do
				_resetcond( c )
			end
		end
	end
	return changed
end

local function evaluateVariable( vname, ctx, cdata, tdev )
	D("evaluateVariable(%1,cdata,%2)", vname, tdev)
	local vdef = (cdata.variables or {})[vname]
	if vdef == nil then
		L({level=1,msg="%2 (%1) Invalid variable reference to %3, not configured"},
			tdev, luup.devices[tdev].description, vname)
		return
	end

	-- If expression is not empty, evaluate it and save new value.
	local result, err, errmsg
	if not tostring( vdef.expression or "" ):match( "^%s*$" ) then
		-- Evaluate expression.
		-- if debugMode then luaxp._DEBUG = D end
		result, err = luaxp.evaluate( vdef.expression, ctx )
		D("evaluateVariable() %2 (%1) %3 evaluates to %4(%5)", tdev, luup.devices[tdev].description,
			vdef.expression, result, type(result))
		if err then
			-- Error. Null context value, and build error message for multiple uses.
			result = luaxp.NULL
			if type( err ) == "string" then
				errmsg = "Runtime error: " .. err
			else
				errmsg = (err or {}).message or err or "Failed"
				if (err or {}).location ~= nil then errmsg = errmsg .. " at " .. tostring(err.location) end
			end
			L({level=2,msg="%2 (#%1) failed evaluation of %3: %4"}, tdev, luup.devices[tdev].description,
				vdef.expression, errmsg)
			addEvent{ dev=tdev,
				msg="TROUBLE: Evaluation error in variable %(variable)s: %(error)s",
				event="expression", variable=vname, ['error']=errmsg }
			getSensorState( tdev ).trouble = true
		elseif result == nil then
			result = luaxp.NULL -- map nil to null
		end
		ctx.__lvars[vname] = result -- update context for future evals
	else
		D("evaluateVariable() luaxp.NULL is %1, tostring %2", luaxp.NULL, tostring(luaxp.NULL))
		if ctx.__lvars[vname] == nil then
			result = luaxp.NULL
		else
			result = ctx.__lvars[vname]
		end
		err = nil
		D("evaluateVariable() expressionless %1 = %2", vname, result)
	end

	-- Store in cstate. This will make them persistent (with some help).
	local cstate = loadCleanState( tdev )
	cstate.vars = cstate.vars or {}
	local vs = cstate.vars[vname]
	if not vs then
		D("evaluateVariable() creating new state for expr/var %1", vname)
		vs = { name=vname, lastvalue=result, valuestamp=getSensorState( tdev ).timebase, changed=1 }
		cstate.vars[vname] = vs
		addEvent{ dev=tdev,
			msg="Variable %(variable)s value set to %(newval)q",
			event="variable", variable=vname, newval=result }
	else
		local changed
		-- Make sure lastvalue luaxp.NULL is the true current luaxp.NULL
		if luaxp.isNull( vs.lastvalue ) then vs.lastvalue = luaxp.NULL end
		if luaxp.isNull( result ) and not luaxp.isNull( vs.lastvalue ) then
			changed = true
		elseif type(vs.lastvalue) == "table" and type(result) == "table" then
			changed = not compareTables( vs.lastvalue, result )
			-- Store shallow copy, so later changes don't interfere with comparison,
			-- as tables are stored by reference and not by value (this vs.lastvalue and result
			-- are likely to be references to the same table).
			ctx.__lvars[vname] = shallowCopy( result )
		else
			changed = vs.lastvalue ~= result
		end
		D("evaluateVariable() %4 result=%1; vs.lastvalue=%2; changed=%3", result, vs.lastvalue, changed, vname)
		D("evaluateVariable() %1 result %2 %3 meta %4", vname, tostring(result), result, type(result)=="table" and dump(getmetatable(result)) or "n/a")
		if changed then
			D("evaluateVariable() updating value for %1 from %2 to %3", vname, vs.lastvalue, result)
			addEvent{ dev=tdev,
				msg="Variable %(variable)s value changed from %(oldval)q to %(newval)q",
				event="variable", variable=vname, oldval=tostring(vs.lastvalue), newval=tostring(result) }
			vs.lastvalue = result
			vs.valuestamp = getSensorState( tdev ).timebase
			vs.changed = 1
		else
			vs.changed = nil
		end
	end
	cstate.vars[vname].err = errmsg

	-- Store on state variable if exported
	if ( cdata.variables[vname].export or 1 ) ~= 0 then
		if not ( err or luaxp.isNull(result) ) then
			-- Canonify for storage as state variable
			local sv
			if type(result) == "boolean" then
				sv = result and "1" or "0"
			elseif type(result) == "table" then
				sv = json.encode( result )
			else
				sv = tostring( result )
			end
			setVar( VARSID, vname, sv, tdev ) -- sets (and triggers watches) only if changed
			setVar( VARSID, vname .. "_Error", "", tdev )
		else
			-- Null or error
			setVar( VARSID, vname, "", tdev )
			setVar( VARSID, vname .. "_Error", errmsg or "", tdev )
		end
	else
		-- Delete variables
		deleteVar( VARSID, vname, tdev )
		deleteVar( VARSID, vname .. "_Error", tdev )
	end
	return result, err ~= nil
end

local function getExpressionContext( cdata, tdev )
	local sst = getSensorState( tdev )
	if sst.ctx then return sst.ctx end

	-- Create new state
	ctx = { __functions={}, __lvars={} }
	sst.ctx = ctx

	-- This should be the ONLY place that LuaXP is loaded. It additionally
	-- defines metadata that must exist in all use.
	luaxp = require "L_LuaXP_Reactor"
	D("getExpressionContext(): loaded LuaXP version %1", (luaxp or {})._VERSION)
	-- Make sure LuaXP null renders as "null" in JSON
	local mt = getmetatable( luaxp.NULL ) or {}
	mt.__tojson = function() return "null" end
	mt.__tostring = function() return "null" end
	setmetatable( luaxp.NULL, mt )

	-- Define all-caps NULL as synonym for null
	ctx.__lvars.NULL = luaxp.NULL
	-- Create evaluation context
	ctx.__functions.finddevice = function( args )
		local selector, trouble = unpack( args )
		D("findDevice(%1) selector=%2", args, selector)
		local n
		if luaxp.isNull( selector ) or selector == -1 then
			n = tdev
		else
			n = finddevice( selector, tdev )
			if n == nil then
				-- default behavior for finddevice is return NULL (legacy, diff from getstate)
				if trouble == true then luaxp.evalerror( "Device not found" ) end
				return luaxp.NULL
			end
		end
		return n
	end
	ctx.__functions.getstate = function( args )
		local dev, svc, var, trouble, watch = unpack( args )
		local vn
		if luaxp.isNull( dev ) or dev == -1 then
			vn = tdev
		else
			vn = finddevice( dev, tdev )
			D("getstate(%1), dev=%2, svc=%3, var=%4, vn(dev)=%5", args, dev, svc, var, vn)
			if luaxp.isNull( vn ) or vn == nil or luup.devices[vn] == nil then
				-- default behavior for getstate() is error (legacy, diff from finddevice)
				if trouble == false then return luaxp.NULL end
				return luaxp.evalerror( "Device not found" )
			end
		end
		-- Create a watch if we don't have one. Don't watch our own, unless forced.
		if watch ~= false and ( watch==true or vn ~= tdev ) then
			addServiceWatch( vn, svc, var, tdev )
		end
		-- Get and return value
		return getVar( var, luaxp.NULL, vn, svc )
	end
	ctx.__functions.getstatetime = function( args )
		local dev, svc, var, trouble, watch = unpack( args )
		local vn
		if luaxp.isNull( dev ) or dev == -1 then
			vn = tdev
		else
			vn = finddevice( dev, tdev )
			D("getstate(%1), dev=%2, svc=%3, var=%4, vn(dev)=%5", args, dev, svc, var, vn)
			if luaxp.isNull( vn ) or vn == nil or luup.devices[vn] == nil then
				-- default behavior for getstate() is error (legacy, diff from finddevice)
				if trouble == false then return luaxp.NULL end
				return luaxp.evalerror( "Device not found" )
			end
		end
		-- Create a watch if we don't have one. Don't watch our own, unless forced.
		if watch ~= false and ( watch==true or vn ~= tdev ) then
			addServiceWatch( vn, svc, var, tdev )
		end
		-- Get and return timestamp
		local _,ts = luup.variable_get( svc, var, vn )
		return ts or luaxp.NULL
	end
	ctx.__functions.setstate = function( args )
		local dev, svc, var, val = unpack( args )
		local vn
		if luaxp.isNull( dev ) or dev == -1 then
			vn = tdev
		else
			vn = finddevice( dev, tdev )
			D("setstate(%1), dev=%2, svc=%3, var=%4, val=%5, vn(dev)=%6", args, dev, svc, var, val, vn)
			if vn == luaxp.NULL or vn == nil or luup.devices[vn] == nil then
				return luaxp.evalerror( "Device not found" )
			end
		end
		if svc == nil or var == nil then return luaxp.evalerror("Invalid service or variable name") end
		-- Set value.
		local vv = val
		if vv == nil or luaxp.isNull(vv) then
			vv = ""
		elseif type(vv) == "table" then
			vv = table.concat( vv, "," )
		else
			vv = tostring(vv)
		end
		luup.variable_set( svc, var, vv, vn )
		if val == nil then return luaxp.NULL end
		return val
	end
	ctx.__functions.getattribute = function( args )
		local dev, attr, trouble = unpack( args )
		local vn
		if luaxp.isNull( dev ) or dev == -1 then
			vn = tdev
		else
			vn = finddevice( dev, tdev )
			D("getattribute(%1), dev=%2, attr=%3, vn(dev)=%4", args, dev, attr, vn)
			if vn == luaxp.NULL or vn == nil or ( vn ~= 0 and luup.devices[vn] == nil ) then
				return trouble == false and luaxp.evalerror( "Device not found" ) or luaxp.NULL
			end
		end
		if attr == nil then return luaxp.evalerror("Invalid attribute name") end
		-- Get and return value.
		return luup.attr_get( attr, vn ) or luaxp.NULL
	end
	ctx.__functions.getdevices = function( args )
		local filters = unpack( args )
		filters = split( filters or "", "," )
		local attrs = {}
		for _,x in ipairs( filters ) do
			local attr,val = x:match( "^([^=]+)=(.*)" )
			attr = ({ room="room_num", name="description" })[attr] or attr -- map common names
			if attr then attrs[attr] = val:gsub( "^%s+", "" ):gsub( "%s+$", "" ) end
		end
		if attrs.room_num and not tonumber( attrs.room_num ) then
			local name = tostring(attrs.room_num):lower()
			for k,v in pairs( luup.rooms ) do
				if name == v:lower() then
					attrs.room_num = tostring(k)
					break
				end
			end
		end
		local x = {}
		for k,d in pairs( luup.devices ) do
			local found = true
			for attr,v in pairs( attrs ) do
				local dd
				if attr:match( "/" ) then
					local sid,var = attr:match( "^([^/]+)/(.*)$" )
					dd = luup.variable_get( sid, var, k )
				else
					dd = d[attr] or luup.attr_get( attr, k )
				end
				if type(v)=="string" and v:match( "^/[^/]+/$" ) then -- /pattern/
					found = tostring( dd ):match( v:sub(2,-2) )
				else
					found = dd ~= nil and tostring(dd) == v
				end
				if not found then break end
			end
			if found then table.insert( x, k ) end
		end
		table.sort( x )
		return x
	end
	ctx.__functions.getluup = function( args )
		local key = unpack( args )
		if key == nil then return luaxp.evalerror("Invalid key") end
		if luup[key] == nil then return luaxp.NULL end
		local t = type(luup[key])
		if t == "string" or t == "number" or t == "table" then
			return luup[key]
		end
		return luaxp.NULL
	end
	ctx.__functions.stringify = function( args )
		local val = unpack( args )
		if val == nil or luaxp.isNull( val ) then
			return "null"
		end
		return json.encode( val )
	end
	ctx.__functions.unstringify = function( args )
		local str = unpack( args )
		-- Decode, converting "null" to LuaXP null.
		if type(str) ~= "string" then
			luaxp.evalerror("Invalid argument")
		end
		local val,pos,err = json.decode( str, nil, luaxp.NULL )
		if val == nil then
			luaxp.evalerror("Failed to unstringify at " .. pos .. ": " .. err)
		end
		return val
	end
	ctx.__functions.urlencode = function( args )
		return urlencode( args[1] or "" )
	end
	ctx.__functions.urldecode = function( args )
		local str = string.lower( args[1] or "" ):gsub( "%+", " " )
		return str:gsub( "%%([a-f0-9][a-f0-9])", function( m ) return string.char( tonumber( m, 16 ) or 49 ) end )
	end
	-- Append an element to an array, returns the array.
	ctx.__functions.arraypush = function( args )
		addEvent{ dev=tdev, msg="WARNING: Expression function arraypush() is deprecated; please use push()" }
		local arr, newel, nmax = unpack( args )
		if ( arr == nil ) or luaxp.isNull( arr ) then arr = {} end
		if newel and not luaxp.isNull( newel ) then
			if not nmax and #arr > ARRAYMAX then luaxp.evalerror("Unbounded array growing too large") end
			table.insert( arr, newel )
		end
		if nmax then while #arr > math.max(0,(tonumber(nmax) or 0)) do table.remove( arr, 1 ) end end
		return arr
	end
	-- Remove the last element in the array, returns the modified array.
	ctx.__functions.arraypop = function( args )
		addEvent{ dev=tdev, msg="WARNING: Expression function arraypop() is deprecated; please use pop()" }
		local arr = unpack( args )
		arr = ( arr == nil or luaxp.isNull( arr ) ) and {} or arr
		ctx.__lvars.__element = table.remove( arr ) or luaxp.NULL
		return arr
	end
	-- Push an element to position 1 in the array, returns the modified array.
	ctx.__functions.arrayunshift = function( args )
		addEvent{ dev=tdev, msg="WARNING: Expression function arrayunshift() is deprecated; please use unshift()" }
		local arr, newel, nmax = unpack( args )
		arr = ( arr == nil or luaxp.isNull( arr ) ) and {} or arr
		if newel and not luaxp.isNull( newel ) then
			if not nmax and #arr > ARRAYMAX then luaxp.evalerror("Unbounded array growing too large") end
			table.insert( arr, newel, 1 )
		end
		if nmax then while #arr > math.max(0,(tonumber(nmax) or 0)) do table.remove( arr ) end end
		return arr
	end
	-- Remove the first element from an array, return the array.
	ctx.__functions.arrayshift = function( args )
		addEvent{ dev=tdev, msg="WARNING: Expression function arrayshift() is deprecated; please use shift()" }
		local arr = unpack( args )
		arr = ( arr == nil or luaxp.isNull( arr ) ) and {} or arr
		ctx.__lvars.__element = table.remove( arr, 1 ) or luaxp.NULL
		return arr
	end
	ctx.__functions.trouble = function( args )
		local msg, title = unpack( args )
		addEvent{ dev=tdev,
			msg="TROUBLE: Expression called trouble(): %(message)s",
			event="evaluate", trouble=title or "trouble()", message=msg or "" }
		getSensorState( tdev ).trouble = true
	end

	-- Add previous values to Luaxp context. We use the cstate versions rather
	-- than the state variables to preserve original data type. Every defined
	-- variable must have an entry in ctx.
	local cstate = loadCleanState( tdev )
	D("getExpressionContext() luaxp.NULL is %1 string %2", luaxp.NULL, tostring(luaxp.NULL))
	for n in pairs( cdata.variables or {} ) do
		local lastval = ((cstate.vars or {})[n] or {}).lastvalue
		if lastval == nil or luaxp.isNull( lastval ) then
			ctx.__lvars[n] = luaxp.NULL
		else
			ctx.__lvars[n] = lastval
		end
		D("getExpressionContext() set starting value for %1 to %2 (%3)",
			n, ctx.__lvars[n], tostring(ctx.__lvars[n]))
	end
	return ctx
end

-- Get a value (works as constant or expression (including simple variable ref).
-- Returns result as string, number, raw (unmodified), error message (when non-nil)
local function getValue( val, ctx, tdev )
	D("getValue(%1,%2,%3)", val, ctx, tdev)
	local err
	if type(val) == "number" then
		return tostring(val), val, val
	end
	local result = val
	val = tostring(val or ""):gsub("^%s+", ""):gsub("%s+$", "")
	if #val >= 2 and val:byte(1) == 34 and val:byte(-1) == 34 then
		-- Dequote quoted string and return
		result = val:sub( 2, -2 )
		return result, tonumber(result), result
	end
	if #val >= 2 and val:byte(1) == 123 and val:byte(-1) == 125 then
		-- Expression wrapped in {}
		local mp = val:sub( 2, -2 )
		if mp:match("^%w+:%w+$") then
			D("getValue() fetch condition/subtype %1", mp)
			local cond,subtype = mp:match("%w+:%w+")
			local cs = (getSensorState( tdev ).condState or {})[cond]
			if not cs then
				getSensorState( tdev ).trouble = true
				addEvent{ dev=tdev,
					msg="TROUBLE: Evaluation of reference %{expression}q failed, no state data for condition ${cond}s",
					expression=val, cond=cond }
				return "", nil, nil, "no state for condition"
			elseif subtype == "n" then
				val = cs.matchcount or 0
			elseif subtype == "t" then
				val = cs.evalstamp
			elseif subtype == "v" then
				val = cs.lastvalue
			else
				L({level=2,msg="%1 (#%2) unsupported subtype ref in %3; returning last value"},
					luup.devices[tdev].description, tdev, mp)
				return "", nil, nil, "invalid subtype ref"
			end
			return tostring(val), val, val
		end
		D("getValue() evaluating %1", mp)
		ctx = ctx or getSensorState( tdev ).ctx or getExpressionContext( getSensorConfig( tdev ), tdev )
		result,err = luaxp.evaluate( mp, ctx )
		D("getValue() result is %1, %2", result, err)
		if err then
			L({level=2,msg="%1 (%2) Error evaluating %3: %4"}, luup.devices[tdev].description,
				tdev, mp, err)
			addEvent{ dev=tdev,
				msg="TROUBLE: Evaluation error in %(expression)q: %(error)s",
				event="evaluate", expression=val, ['error']=err }
			getSensorState( tdev ).trouble = true
			val = ""
		elseif result == nil or luaxp.isNull( result ) then
			val = ""
		elseif type(result) == "table" then
			val = json.encode( result ) or ""
		else
			val = tostring(result)
		end
	end
	val = val:gsub( "^%.(%d+)$", "0.%1" ) -- Vera tonumber() brokenness: ".5" => nil
	return val, tonumber(val), result, err
end

local stringify -- fwd decl for execLua

-- Run Lua fragment for scene. Returns result,error
local function execLua( fname, luafragment, extarg, tdev )
	D("execLua(%1,<luafragment>,%2,%3)", fname, extarg, tdev)

	-- See if we've "compiled" it already...
	local fnc = luaFunc[fname]
	if luaFunc[fname] == nil then
		-- "Compile" it
		local err
		fnc,err = loadstring( luafragment, fname )
		if fnc == nil or err then
			L({level=1,msg="%1 %(2) [%3] Lua load failed"},
				luup.devices[tdev].description, tdev, fname)
			addEvent{ dev=tdev,
				msg="TROUBLE: Failed to load Lua (%(name)q): %(error)s",
				event="runlua", name=fname, ['error']=tostring(err) }
			getSensorState( tdev ).trouble = true
			luup.log( "Reactor: " .. err .. "\n" .. luafragment, 1 )
			return false, err -- flag error
		end
		if not getVarBool( "SuppressLuaCaching", false, pluginDevice, MYSID ) then
			luaFunc[fname] = fnc
		end
	end
	-- We use a single sandbox for all Lua scripts, which allows modules loaded
	-- to be shared among them. This, of course, has some inherent dangers, and
	-- people's bad habits with globals may be exposed. Issue warnings to assist.
	if luaEnv == nil then
		D("execLua() creating new Lua environment")
		luaEnv = shallowCopy(_G)
		luaEnv._RG = _G -- The unsandboxed plugin environment. Shhh! Secret!
		luaEnv._G = luaEnv
		-- Clear what we don't want to expose.
		luaEnv.json = nil
		luaEnv.ltn12 = nil
		luaEnv.http = nil
		luaEnv.https = nil
		-- Pre-declare these to keep metamethods from griping later; these are replaced per-run.
		luaEnv.Reactor = {}
		luaEnv.__reactor_getdevice = function() end
		luaEnv.__reactor_getscript = function() end
		luaEnv.print =  function( ... )  -- luacheck: ignore 212
							local dev = luaEnv.__reactor_getdevice() or 0
							local msg = ""
							for _,v in ipairs( arg or {} ) do
								msg = msg .. tostring( v or "(nil)" ) .. " "
							end
							msg = msg:gsub( "/r/n?", "/n" ):gsub( "%s+$", "" )
							luup.log( ((luup.devices[dev] or {}).description or "?") ..
								" (" .. tostring(dev) .. ") [" .. tostring(luaEnv.__reactor_getscript() or "?") ..
								"] " .. msg)
							addEvent{ dev=dev,
								msg="<%(script)s> %(message)",
								event="lua", script=luaEnv.__reactor_getscript(), message=msg }
						end
		-- Override next and pairs specifically so that variables proxy table can iterate.
		-- This version checks for a meta __next function and uses in preference if found.
		-- This is a 5.1-ism. See http://lua-users.org/wiki/GeneralizedPairsAndIpairs
		luaEnv.rawnxt = luaEnv.next
		luaEnv.next =   function( t, k )
							local m = getmetatable(t)
							local n = m and m.__next or luaEnv.rawnxt
							return n( t, k )
						end
		-- Redefining pairs() this way allows metamethod override for iteration.
		luaEnv.pairs =  function( t ) return luaEnv.next, t, nil end
		local mt = { }
		mt.__newindex = function(t, n, v)
			local what = debug.getinfo(2, "S")
			D("luaEnv.mt.__newindex(%1,%2,%3) new index; luaEnv=%4; debuginfo=%5", tostring(t), n, tostring(v), tostring(luaEnv), what)
			local dev = t.__reactor_getdevice()
			local fn = t.__reactor_getscript() or tostring(what.source)
			if type(v) == "function" then
				--[[
					This special handling for functions allows luup callbacks to work.
					The callbacks have to be defined in the plugin environment (outside
					the sandbox) for Luup to find them by name later.
				--]]
				if t._RG[n] and t._RG[n] ~= v then
					addEvent{ dev=dev,
						msg="WARNING: Declaraction of non-local function %(name)s in %(script)s overwrites previous definition.",
						event="lua", script=fn, name=n, warning="Redefinition of non-local function" }
				end
				return rawset(t._RG, n, v)
			end
			if what.what ~= "C" and not getVarBool( "SuppressLuaGlobalWarnings", false, pluginDevice, MYSID ) then
				L({level=2,msg="%1 (%2) runLua action: %3 makes assignment to global %4 (missing 'local' declaration?) at %5"},
					( luup.devices[dev] or {}).description, dev, fn, n, what)
				addEvent{ event="lua",
					msg="WARNING: Assignment to global %(name)s (missing 'local' declaration?)",
					dev=dev, script=fn, name=n, warning="Assignment to global" }
			end
			rawset(t, n, v) -- save in sandbox table
		end
		mt.__index = function(t, n) -- luacheck: ignore 212
			local v = t._RG[n]; if v then return v end -- quickly return something known to parent table.
			local what = debug.getinfo(2, "S")
			D("luaEnv.mt.__index(%1,%2) key miss; luaEnv=%3; debuginfo=%4", tostring(t), n, tostring(luaEnv), what)
			if ( ( ( t.package or {} ).loaded or {} )[n] ) then return t.package.loaded[n] end -- hmmm, Vera Luup
			if what.what ~= "C" and not getVarBool( "SuppressLuaGlobalWarnings", false, pluginDevice, MYSID ) then
				local dev = t.__reactor_getdevice()
				local fn = t.__reactor_getscript() or tostring(what.source)
				L({level=1,msg="%1 (%2) runLua action: %3 accesses undeclared/uninitialized global %4"},
					( luup.devices[dev] or {} ).description, dev, fn, n)
				addEvent{ event="lua",
					msg="ERROR: Using uninitialized global variable %(name)s",
					dev=dev, script=fn, message="Undefined global" }
			end
			return rawget(t, n) -- uhhh... isn't this always nil???
		end
		setmetatable( luaEnv, mt )
	end

	-- Set up Reactor context. This creates three important maps: groups, trip
	-- and untrip. The groups map contains the state and time of each group.
	-- The trip and untrip maps contain those groups that most-recently changed
	-- (i.e. those that would cause an overall state change of the ReactorSensor).
	-- They are maps, rather than just arrays, for quicker access.
	local _R = { id=tdev, groups={}, trip={}, untrip={}, variables={}, conditions={},
		script=fname, version=_PLUGIN_VERSION }
	_R.dump = stringify -- handy
	local condState = loadCleanState( tdev ) or {}
	local cf = getSensorConfig( tdev )
	traverse( cf.conditions.root or { id="root" } , function( cond )
		local gs = condState[cond.id]
		if not gs then
			D("execLua() condition %1 has no state, ignored", cond.id)
		elseif ( cond.type or "group" ) == "group" then
			_R.groups[cond.id] = { id=cond.id, name=cond.name, state=gs.evalstate, since=gs.evalstamp, changed=gs.changed }
			if cond.name then _R.groups[cond.name] = _R.groups[cond.id] end
			if gs.changed then
				if gs.evalstate then _R.trip[cond.id] = _R.groups[cond.id]
				else _R.untrip[cond.id] = _R.groups[cond.id] end
			end
		else
			-- As of 3.5, conditions are also published in Reactors.conditions
			_R.conditions[cond.id] = { id=cond.id, state=gs.evalstate, since=gs.evalstamp,
				changed=gs.changed, currentvalue=gs.lastvalue, priorvalue=gs.priorvalue }
		end
	end)

	-- Special metatable for Reactor.variables table. Uses a proxy table to that
	-- all access pass through __index/__newindex, but in 5.1 this makes the table
	-- "un-iterable" without additional work. That's why next() and pairs() are
	-- overriden above--they provide a way for this metatable to create its own
	-- iterator.
	local rmt = {}
	rmt.__newindex = function(t, n, v) -- luacheck: ignore 212
						 addEvent{ dev=tdev,
							msg="WARNING: Reactor.variables is read-only; attempt to modify %(name)s will be ignored",
							event="lua", script=fname, name=n, message="Can't modify Reactor.variables" }
					 end
	rmt.__index = function(t, n)
						-- Always fetch, because it could be changing dynamically
						local v = rawget(getmetatable(t).__vars, n)
						if v == nil then
							L({level=1,msg="%1 (%2) Run Lua action: your code attempts to access undefined Reactor variable "..tostring(n)},
								luup.devices[tdev].description, tdev, n)
							addEvent{ dev=tdev,
								msg="WARNING: Attempt to access undefined value in Reactor.variables: %(name)s",
								event="lua", script=fname, message="Undefined in Reactor.variables" }
							return nil
						end
						return v.lastvalue
				  end
	-- Define __next meta so env-standard next() accesses proxy table.
	rmt.__next =    function(t, k) local k2,vs = luaEnv.rawnxt( getmetatable(t).__vars, k ) if vs then return k2, vs.lastvalue else return nil end end
	rmt.__vars = condState.vars or {}
	setmetatable( _R.variables, rmt )
	D("execLua() Reactor.variables = %1", rmt.__vars)
	-- Finally. post our device environment and run the code.
	luaEnv.Reactor = _R
	luaEnv.__reactor_getdevice = function() return tdev end
	luaEnv.__reactor_getscript = function() return fname end
	local oldenv = getfenv(fnc)
	setfenv(fnc, luaEnv)
	local success, ret = pcall( fnc ) -- protect from runtime errors within
	setfenv(fnc, oldenv)
	luaEnv.Reactor = {} -- dispose of device context
	D("execLua() lua success=%3 return=(%2)%1", ret, type(ret), success)
	-- Scene return value must be exactly boolean false to stop scene.
	return ret, (not success) and ret or false
end

local runScene -- forward declaration

-- Set variable action (use by scene action and device action)
local function doSetVar( varname, value, tdev, reparse, savestate )
	local cdata = getSensorConfig( tdev )
	if ( cdata.variables or {} )[varname] == nil then
		return false, "variable not defined"
	end
	if not tostring( cdata.variables[ varname ].expression or ""):match( "^%s*$" ) then
		-- Non-empty expression--can't set these variables
		return false, "can't set value on expression-driven variable"
	end
	local cstate = loadCleanState( tdev )
	cstate.vars = cstate.vars or {}
	local vs = cstate.vars[ varname ]
	if vs == nil then
		vs = {}
		cstate.vars[ varname ] = vs
	end

	local ctx = getSensorState( tdev ).ctx or getExpressionContext( getSensorConfig( tdev ), tdev )
	local sv, vv, err
	if reparse == nil or reparse then -- default true
		sv, _, vv, err = getValue( value, ctx, tdev )
	else
		sv = tostring( value )
		vv = tonumber( value ) or sv
	end
	local oldVal = vs.lastvalue
	if oldVal ~= vv then
		vs.lastvalue = vv
		vs.valuestamp = os.time()
		vs.changed = 1

		-- Update LuaXP evaluation context.
		ctx.__lvars[ varname ] = vv

		-- Update state variable if it's exported.
		if ( cdata.variables[ varname ].export or 1 ) ~= 0 then
			setVar( VARSID, varname, sv or "", tdev )
			setVar( VARSID, varname .. "_Error", err or "", tdev )
		end

		-- Save updated state.
		cstate.lastUsed = os.time() -- mark to defer pruning
		if savestate == nil or savestate then -- default true
			luup.variable_set( RSSID, "cstate", json.encode( cstate ), tdev )
		end
	end
	return true, oldVal, vv
end

-- Send Syslog datagram
local function doSyslogDatagram( pack, tdev )
	D("doSyslogDatagram(%1,%2)", pack, tdev)
	local pri = 8 * (tonumber(pack.facility) or 23) + (tonumber(pack.severity) or 5)
	local datagram = string.format( "<%s>1 %s %s %s %s - - %s",
		pri, -- priority
		os.date("!%Y-%m-%dT%H:%M:%SZ"), -- timestamp
		(pack.hostname or string.format("Vera-%s", luup.pk_accesspoint)):gsub("%s+", "_"), -- hostname
		(pack.application or luup.devices[tdev].description):gsub( "%s+", "_" ), -- application
		(pack.procid or "0"):gsub( "%s+", "_" ), -- process id
		pack.message or "" ):sub( 1, 1023 )
	-- local socket = require "socket"
	local udp = socket.udp()
	if udp then
		D("doActionNotify() sending SysLog UDP datagram to %1", pack.hostip)
		udp:setsockname("*", 0)
		local stat,err = udp:sendto( datagram, pack.hostip, 514 )
		udp:close()
		if stat == nil then
			L({level=2,msg="Failed to send SYSLOG message to %1: %2"}, pack.hostip, err)
			error( "Syslog notification to " .. tostring(pack.hostip) .. " failed, " .. tostring(err) )
		end
		return
	end
	L{level=1,msg="Failed to get UDP socket for Syslog datagram"}
	error("Syslog notification to " .. tostring(pack.hostip) .. " failed, can't get UDP socket")
end

-- Send SMTP message
local function doSMTPSend( from, to, subject, body, cc, bcc )
	D("doSMTPSend(%1,%2,%3,%4,%5,%6)", from, to, subject, body, cc, bcc)

	local ok,smtp = pcall( require, "socket.smtp" )
	if not ok or type(smtp) ~= "table" then
		error "socket.smtp is not installed"
	end

	local server = getReactorVar( "SMTPServer", "localhost" )
	local port = getVarNumeric( "SMTPPort", 0, pluginDevice, MYSID )
	local authuser = getReactorVar( "SMTPUsername", "" )
	local authpass = getReactorVar( "SMTPPassword", "" )

	local sendt = { from = "<"..from:gsub( "^[^<]+<([^>]+)>.*$", "%1" )..">", rcpt = {}, server = server }
	local msgt = { headers = { From=from, To={}, Subject=subject or "" }, body=body or "(no message)" }
	to = split( to )
	if #to == 0 then to = { from } end
	for _,rr in ipairs( to ) do
		local rc = rr:gsub( "^[^<]+<([^>]+)>.*$", "%1" ):gsub("^%s+", ""):gsub("%s+$", "") -- remove human readables, if present
		table.insert( sendt.rcpt, "<" .. rc .. ">" )
		table.insert( msgt.headers.To, rr )
	end
	msgt.headers.To = table.concat( msgt.headers.To, ", " )
	cc = split( cc or "" )
	if #cc > 0 then
		msgt.headers.Cc = {}
		for _,rr in ipairs( cc ) do
			local rc = rr:gsub( "^[^<]+<([^>]+)>.*$", "%1" ):gsub("^%s+", ""):gsub("%s+$", "") -- remove human readables, if present
			table.insert( sendt.rcpt, "<" .. rc .. ">" )
			table.insert( msgt.headers.Cc, rr )
		end
		msgt.headers.Cc = table.concat( msgt.headers.Cc, ", " )
	end
	bcc = split( bcc or "" )
	if #bcc > 0 then
		-- Note: no header! don't expose recipient on bcc
		for _,rr in ipairs( bcc ) do
			local rc = rr:gsub( "^[^<]+<([^>]+)>.*$", "%1" ):gsub("^%s+", ""):gsub("%s+$", "") -- remove human readables, if present
			table.insert( sendt.rcpt, "<" .. rc .. ">" )
		end
	end
	D("doSMTPSend() msgt=%1", msgt)
	if port > 0 then
		sendt.port = port
		if port == 465 or getVarNumeric( "SMTPConnectSSLTLS", 0, pluginDevice, MYSID ) ~= 0 then
			sendt.create = function()
				-- local socket = require "socket"
				local sock = socket.tcp()
				return setmetatable({
					connect = function(_, hh, pp)
						local r, e = sock:connect( hh, pp )
						if not r then return r, e end
						local ssl = require "ssl"
						D("doSMTPSend() SMTP send wrapping %1 using SSL version %2", sock, ssl._VERSION)
						local params = getSSLParams( "SMTP" )
						sock = ssl.wrap( sock, params )
						D("doSMTPSend() SMTP after wrapping with %2, sock is %1", sock, params)
						if not sock then
							L({level=2,msg="Failed to wrap socket on %1:%2 for SMTP+SSL; check SSL param configuration %3"},
								server, port, params)
							error "Failed SSL wrap"
						end
						local ret = sock:dohandshake()
						if not ret then
							L({level=2,msg="SSL handshake (for SMTP notification) with %1:%2 failed; check server config and parameters %3"},
								server, port, params)
							error "Failed SSL handshake"
						end
						return ret
					end
				}, {
					__index = function( t, n ) -- luacheck: ignore 212
						return function( _, ... )
							return sock[n](sock, ...)
						end
					end
				})
			end
		end
	end
	if authuser ~= "" then sendt.user = authuser end
	if authpass ~= "" then sendt.password = authpass end
	sendt.source = smtp.message( msgt )
	D("doSMTPSend() sendt=%1", sendt)
	local r,e = smtp.send( sendt )
	D("doSMTPSend() SMTP send returned %1, %2", r, e)
	if r == nil then
		if sendt.user then sendt.user = "****" end
		if sendt.password then sendt.password = "****" end
		L({level=2,msg="SMTP Send failed, %1; package %2; message %3"}, e, sendt, msgt)
		error("SMTP send failed, " .. tostring(e))
	end
	return
end

-- Perform notify action
local function doActionNotify( action, scid, tdev )
	local nid = action.notifyid
	local cf = getSensorConfig( tdev )
	if ( cf.notifications or {} )[nid] then
		local host = "Vera-" .. (luup.pk_accesspoint or "?")
		local msg = getValue( cf.notifications[nid].message or "", nil, tdev )
		if action.method == "VA" then -- VeraAlerts
			if devVeraAlerts then
				luup.call_action( "urn:richardgreen:serviceId:VeraAlert1", "SendAlert",
					{ Message=msg, Recipients=cf.notifications[nid].usernames or "" },
					devVeraAlerts )
			else
				error "VeraAlerts is not available"
			end
		elseif action.method == "SM" then -- SMTP Mail
			local from = getReactorVar( "SMTPSender", "unconfigured@localhost" )
			local to = getValue( action.recipient or getReactorVar( "SMTPDefaultRecipient", "unconfigured@localhost" ), nil, tdev )
			local subj = getValue( action.subject or getReactorVar( "SMTPDefaultSubject", luup.devices[tdev].description .. " Notification" ), nil, tdev )
			doSMTPSend( from, to, subj, msg )
		elseif action.method == "PR" then -- Prowl
			local apikey = getReactorVar( "ProwlAPIKey", "" )
			if apikey == "" or apikey == "X" then
				error "Prowl API Key not set"
			else
				local provider = getReactorVar( "ProwlProvider", "" )
				local subject = getReactorVar( "ProwlSubject", luup.devices[tdev].description )
				local baseurl = getReactorVar( "ProwlURL", "https://api.prowlapp.com/publicapi/add" )
				local st,ht
				-- Prefer request because we need POST, but some firmware doesn't support it,
				-- and prowl servers don't really seem to care.
				if not luup.inet.request then
					baseurl = baseurl .. urlencode( apikey )
					if provider ~= "" then baseurl = baseurl .. urlencode( provider ) end
					baseurl = baseurl .. "&application=" .. urlencode( host )
					if action.priority then baseurl = baseurl .. "&priority=" .. urlencode( action.priority ) end
					baseurl = baseurl .. "&event=" .. urlencode( subject )
					baseurl = baseurl .. "&description=" .. urlencode( msg )
					st,_,ht = luup.inet.wget( baseurl )
					D("doActionNotify() Prowl wget returned %1,%2 [%3]", st, ht, baseurl)
				else
					local data = { apikey=apikey, application=host, event=subject, description=msg }
					if provider ~= "" then data.provider = provider end
					if action.priority then data.priority = action.priority end
					st,_,ht = luup.inet.request{ url=baseurl, data=data, follow=false, timeout=5 }
					D("doActionNotify() Prowl request returned %1,%2", st, ht)
				end
				if st ~= 0 or ht ~= 200 then
					L({level=2,msg="Prowl send returned %1 httpStatus=%2 [%3]"}, st, ht, baseurl)
					error( "Prowl send request failed (" .. tostring(st) .. ", " .. tostring(ht) .. ")" )
				end
			end
		elseif action.method == "SD" then -- Syslog Datagram
			-- See https://tools.ietf.org/html/rfc5424#page-9
			local pack = shallowCopy( action )
			pack.hostname = host
			pack.procid = scid
			pack.message = msg
			doSyslogDatagram( pack, tdev )
		elseif action.method == "AA" then -- AddAlert (Vera action) (undocumented)
			local baseurl = "http://localhost/port_3480/data_request?id=add_alert&device=0&type=3&source=3"
			baseurl = baseurl .. "&users=" .. urlencode( cf.notifications[nid].users )
			baseurl = baseurl .. "&description=" .. urlencode( msg )
			--[[ local st,_,ht = --]]
			local st,_,ht = luup.inet.wget( baseurl )
			D("doActionNotify() AddAlert request returned %1,%2 [%3]", st, ht, baseurl)
		elseif action.method == "UU" then -- User URL
			local baseurl = action.url or ""
			baseurl = baseurl:gsub( "%{message%}", urlencode( msg ):gsub("%%", "%%%%") ) -- special
			baseurl = baseurl:gsub( "%{[^}]+%}", function( ref )
				local vv = getValue( ref, nil, tdev )
				return ( vv ~= nil ) and vv or ref
			end )
			local st,_,ht = luup.inet.wget( baseurl )
			D("doActionNotify() User URL notification returned %1,%2 [%3]", st, ht, baseurl)
			if st ~= 0 or ht ~= 200 then
				L({level=2,msg="User URL notification returned %1 httpStatus=%2 [%3]"}, st, ht, baseurl)
				error("User HTTP notification failed (" .. tostring(st) .. ", " .. tostring(ht) .. ")")
			end
		else
			-- The "standard" Vera way, via hidden scene.
			queueNotification( nid, tdev )
		end
	else
		error( "Unable to find notification config #" .. tostring(nid) )
	end
	return false
end

-- Returns LTN12 filter that stops passing data after limit bytes
local function getCountFilter( rp )
	rp = rp or {}
	rp.limit = rp.limit or 2048
	rp.actual = 0
	local count = 0
	return function( chunk )
		if chunk == nil then
			return nil
		elseif chunk == "" then
			return ""
		else
			rp.actual = rp.actual + #chunk
			local accept = rp.limit - count
			if accept <= 0 then
				-- can't accept any
				return ""
			elseif accept >= #chunk then
				-- accept more than chunk
				count = count + #chunk
				return chunk
			end
			-- accept partial chunk
			count = count + accept
			return chunk:sub(1, accept)
		end
	end
end

local function doActionRequest( action, scid, tdev )
	local http = require "socket.http"
	local ltn12 = require "ltn12"

	local method = action.method or "GET"
	local timeout = action.timeout or getVarNumeric( "RequestActionTimeout", 15, tdev, RSSID )
	local maxResp = getVarNumeric( "RequestActionResponseLimit", 2048, tdev, RSSID )

	-- Perform on-the-fly substitution of request values
	local url = tostring( action.url or "" ):gsub( "%{[^}]+%}", function( ref )
		local vv = getValue( ref, nil, tdev )
		return ( vv ~= nil ) and vv or ref
	end )

	-- Headers
	local tHeaders = {}
	for _,line in ipairs( action.headers or {} ) do
		local key,val = line:match( "^([^:]+):%s*(.*)" )
		if key and val then
			val = (val or ""):gsub( "%{[^}]+%}", function( ref )
				local vv = getValue( ref, nil, tdev )
				return ( vv ~= nil ) and vv or ref
			end )
			tHeaders[key] = val
		end
	end

	local src
	local body = tostring(action.data or "" ):gsub( "%{[^}]+%}", function( ref )
		local vv = getValue( ref, nil, tdev )
		return ( vv ~= nil ) and vv or ref
	end )
	if body == "" then
		src = nil
	else
		src = ltn12.source.string( body )
		tHeaders["Content-Length"] = string.len( body )
		D("doActionRequest() body is %1", body)
	end

	local respBody
	local r = {}
	if action.usecurl or getVarNumeric( "RequestUseCurl", 0, tdev, RSSID ) ~= 0 then
		local req = string.format( "curl -m %d -o -", timeout )
		for k,v in pairs( tHeaders or {} ) do
			req = req .. " -H '" .. k .. ": " .. v:gsub( "'", "''" ) .. "'"
		end
		local s = action.curlopts or luup.variable_get( RSSID, "RequestCurlOptions", tdev ) or ""
		if s ~= "" then req = req .. " " .. s end
		req = req .. " '" .. url .. "'"
		L("%1 (#%2) request action: %3", luup.devices[tdev].description, tdev, req)
		addEvent{ dev=tdev, msg="Request via curl: %(req)s", req=req }
		local count = 0
		local f = io.popen( req )
		if f then
			repeat
				local chunk = f:read(1024)
				if chunk then
					count = count + #chunk
					table.insert( r, chunk )
				end
			until count >= maxResp
			f:close()
			respBody = table.concat( r, "" ):sub(1, maxResp)
			L("%1 (#%2) request completed, response body %3 bytes", luup.devices[tdev].description, tdev,
				#respBody)
			addEvent{ dev=tdev, msg="Request completed, response body %(bodylen)s bytes",
				bodylen=#respBody }
		else
			respBody = "ERROR 599"
			L{level=2,msg="%1 (#%2) request failed!"}
			addEvent{ dev=tdev, msg="TROUBLE: Request failed (curl)" }
			if ( action.trouble or 1 ) ~= 0 then
				getSensorState( tdev ).trouble = true
			end
		end
	else
		local httpStatus
		-- Set up the request table
		local tsink = ltn12.sink.table( r )
		local countParam = { limit=maxResp }

		local req = {
			url = url,
			source = src,
			sink = ltn12.sink.chain( getCountFilter( countParam ), tsink ),
			method = method,
			headers = tHeaders,
			redirect = false
		}

		-- HTTP or HTTPS?
		local requestor
		if url:lower():find("^https:") then
			local https = require "ssl.https"
			requestor = https
			local rp = getSSLParams( "Request" )
			for k,v in pairs( rp ) do
				req[k] = v
			end
		else
			requestor = http
		end

		-- Make the request.
		http.TIMEOUT = timeout -- N.B. http not https, regardless
		L("%1 (#%2) request action: %3 %4", luup.devices[tdev].description, tdev, method, url)
		if next(tHeaders) then L("Request headers: %1", tHeaders) end
		if body and #body then L("Request body: "..body) end
		addEvent{ dev=tdev, msg="Request action: %(method)s %(url)s", url=url, method=method }
		D("doRequest() request %1", req)
		local rh, st
		respBody, httpStatus, rh, st = requestor.request(req)
		if tonumber(httpStatus) and httpStatus >= 200 and httpStatus <= 299 then
			D("doRequest() request returned httpStatus=%1, respBody=%2, respHeaders=%3, status=%4", httpStatus, respBody, rh, st)
			-- Since we're using the table sink, concatenate chunks to single string.
			respBody = table.concat(r, "")
			L("Request succeeded, response body %1 bytes", #respBody)
			addEvent{ dev=tdev, msg="Request response status %(status)s body %(bodylen)s bytes sent",
				status=httpStatus, bodylen=countParam.actual }
			if countParam.actual > maxResp then
				L({level=2,msg="Response was %2 bytes, exceeded the limit of %1 bytes and was truncated"},
					maxResp, countParam.actual)
				addEvent{ dev=tdev, msg="TROUBLE: Response was too long and has been truncated to %(limit)s bytes!",
					limit=maxResp }
				getSensorState( tdev ).trouble = true
			end
		else
			L({level=2,msg="Request %1 %2 returned [%3, %4, %5, %6]"}, respBody, httpStatus, rh, st)
			addEvent{ dev=tdev, msg="TROUBLE: Request failed, response status %(status)s body %(bodylen)s bytes",
				status=httpStatus, bodylen=#respBody }
			if ( action.trouble or 1 ) ~= 0 then
				getSensorState( tdev ).trouble = true
			end
			respBody = "ERROR "..tostring(httpStatus) -- Canonical body for errors
		end
	end
	r = nil -- luacheck: ignore 311

	-- Store response, maybe
	if ( action.target or "" ) ~= "" then
		local st,err = doSetVar( action.target, respBody, tdev, false ) -- no reparse (raw data)
		if not st then
			L({level=2,msg="Can't store request response on %1: %2"}, action.target, err)
			addEvent{ dev=tdev, msg='TROUBLE: Request succeeded but failed to store response on %(variable)q: %(err)s',
				variable=action.target, err=err }
			if ( action.trouble or 1 ) ~= 0 then
				getSensorState( tdev ).trouble = true
			end
		else
			scheduleDelay( tdev, 1 )
		end
	end

	return true
end

-- Run the next scene group(s), until we run out of groups or a group delay
-- restriction hasn't been met. Across reloads, scenes will "catch up," running
-- groups that are now past-due (native Luup scenes don't do this).
-- Return taskid if groups remain to run (delayed), or nil if scene is finished.
local function execSceneGroups( tdev, taskid, scd )
	D("execSceneGroups(%1,%2,%3)", tdev, taskid, type(scd) )
	assert(luup.devices[tdev].device_type == MYTYPE or luup.devices[tdev].device_type == RSTYPE)

	-- Get sceneState, make sure it's consistent with request.
	local sst = sceneState[taskid]
	D("execSceneGroups() scene state %1", sst)
	if sst == nil then
		clearTask( taskid )
		return nil
	end

	-- Sanity-check owner and context.
	if luup.devices[sst.owner] == nil then
		L({level=2,msg="Unable to resume scene %1 because the owner device #%2 no longer exists"},
			sst.scene, sst.owner)
		return stopScene( nil, taskid, tdev )
	elseif not isEnabled( tdev ) then
		L({level=2,msg="Unable to resume scene %1 because the owner %2 (#%3) is disabled"},
			sst.scene, luup.devices[sst.owner].description, sst.owner)
		return stopScene( nil, taskid, tdev )
	elseif sst.context ~= 0 and luup.devices[sst.context] == nil then
		L({level=2,msg="Unable to resume scene %1 because the context device #%2 no longer exists"},
			sst.scene, sst.context)
		return stopScene( nil, taskid, tdev )
	end

	-- If system is not ready, wait. We don't want to run actions until devices
	-- are well and truly ready to respond.
	if not systemReady then
		L("%1 (#%2) attempting to run actions %3 (%4) but system is not yet ready; deferring 5 seconds.",
			luup.devices[tdev].description, tdev, (scd or {}).name or sst.scene, sst.scene)
		addEvent{ dev=tdev,
			msg="Deferring scene execution, system not ready (%(sceneName)s:%(group)s)",
			event="runscene", scene=sst.scene, sceneName=(scd or {}).name or sst.scene, group=sst.lastgroup+1 }
		scheduleDelay( { id=sst.taskid, owner=sst.owner, func=execSceneGroups, args={ scd } }, 5 )
		return taskid
	end

	-- Reload the scene if it wasn't passed to us (from cache)
	if not scd then
		D("execSceneGroups() reloading scene data for %1", sst.scene)
		scd = getSceneData(sst.scene, tdev)
		if scd == nil then
			L({level=1,msg="Previously running scene %1 now not found/loaded. Aborting run."}, sst.scene)
			return stopScene( nil, taskid, tdev )
		end
	end

	-- Run next scene group (and keep running groups until no more or delay needed)
	local nextGroup = sst.lastgroup + 1
	while nextGroup <= #(scd.groups or {}) do
		D("execSceneGroups() now at group %1 of scene %2 (%3)", nextGroup, scd.id, scd.name)
		-- If scene group has a delay, see if we're there yet.
		local now = os.time() -- update time, as scene groups can take a long time to execute
		local delay = scd.groups[nextGroup].delay or 0
		if type(delay) == "string" then _,delay = getValue( delay, nil, tdev ) end
		if type(delay) ~= "number" then
			L({level=1,msg="%1 (%2) delay at group %3 did not resolve to number; no delay!"},
				luup.devices[tdev].description, tdev, nextGroup)
			addEvent{ dev=tdev,
				msg="TROUBLE: Invalid delay in scene group %(group)s of %(sceneName)s: %(delay)q",
				event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, delay=delay or "nil", ['error']="TROUBLE: invalid delay in scene group" }
			getSensorState( tdev ).trouble = true
			delay = 0
		end
		if delay > 0 then
			D("execSceneGroups() delay is %1 %2", delay, scd.groups[nextGroup].delaytype)
			local delaytype = scd.groups[nextGroup].delaytype or "inline"
			local tt
			-- Vera (7.x.x) scenes are always "start" delay type.
			if delaytype == "start" or not scd.isReactorScene then
				tt = sst.starttime + delay
			else
				tt = (sst.lastgrouptime or sst.starttime) + delay
			end
			if tt > now then
				-- It's not time yet. Schedule task to continue.
				D("execSceneGroups() scene group %1 must delay to %2", nextGroup, tt)
				addEvent{ dev=tdev,
					msg="Delaying scene %(sceneName)s group %(group)s actions until %(when)s",
					event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, when=os.date("%X", tt), notice="Scene delay" }
				scheduleTick( { id=sst.taskid, owner=sst.owner, func=execSceneGroups, args={ scd } }, tt )
				return taskid
			end
		end

		-- Run this group.
		addEvent{ dev=tdev, msg="Starting %(sceneName)q group %(group)s",
			event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup }
		for ix,action in ipairs( scd.groups[nextGroup].actions or {} ) do
			if not scd.isReactorScene then
				-- Genuine Vera/Luup scene (just has device actions)
				local devnum = tonumber( action.device )
				if devnum == nil or luup.devices[devnum] == nil then
					addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, warning="TROUBLE: action skipped, device number invalid or does not exist: " .. tostring( action.device ) }
					L({level=2,msg="%5 (%6): invalid device number (%4) in scene %1 (%2) group %3; skipping action."},
						scd.id, scd.name, nextGroup, action.device, tdev, luup.devices[tdev].description)
					getSensorState( tdev ).trouble = true
				else
					local param = {}
					for k,p in ipairs( action.arguments or {} ) do
						param[p.name or tostring(k)] = p.value
					end
					D("execSceneGroups() dev %4 (%5) do %1/%2(%3) for %6 (%7)",
						action.service, action.action, param, devnum,
						(luup.devices[devnum] or {}).description or "?unknown?",
						scd.name or scd.id, scd.id )
					-- If Lua HomeAutomationGateway RunScene action, run in Reactor
					if action.service == "urn:micasaverde-com:serviceId:HomeAutomationGateway1" and
							action.action == "RunScene" and devnum == 0
							and getVarBool( "UseReactorScenes", true, tdev, RSSID ) then
						-- Overriding like this runs the scene as a job (so it doesn't start immediately)
						D("execSceneGroups() overriding Vera RunScene with our own!")
						action.service = RSSID
						devnum = tdev
						param.Options = json.encode( { contextDevice=sst.options.contextDevice, stopPriorScenes=false } )
					end
					luup.call_action( action.service, action.action, param, devnum )
				end
			else
				-- ReactorScene
				D("execSceneGroups() %3 step %1: %2", ix, action, scd.id)
				if action.type == "comment" then
					-- If first char is asterisk, emit comment to log file
					if ( action.comment or ""):byte(1) == 42 then
						L("%2 (%1) %3 [%4:%5]", tdev, luup.devices[tdev].description,
							action.comment, scd.id, ix)
						addEvent{ dev=tdev,
							msg="<%(sceneName)s:%(group)s:%(index)s> %(message)s",
							event="runscene", scene=scd.id, sceneName=scd.name or scd.id,
							group=nextGroup, index=ix, message=action.comment or "" }
					end
				elseif action.type == "device" then
					local devnum = tonumber( action.device )
					if devnum == -1 then devnum = tdev end
					if devnum == nil or luup.devices[devnum] == nil then
						addEvent{ dev=tdev,
							msg="TROUBLE: Device %(xdev)q invalid or does not exist; reference in scene %(sceneName)s group %(group)s step %(step)s",
							event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, step=ix, xdev=action.device, warning="Invalid device" }
						L({level=1,msg="%5 (%6): invalid device (%4) in scene %1 (%2) group %3; skipping action."},
							scd.name or "", scd.id, nextGroup, action.device, tdev, luup.devices[tdev].description)
						getSensorState( tdev ).trouble = true
					else
						local param = {}
						for k,p in ipairs( action.parameters or {} ) do
							-- Reactor behavior: omit if value not defined
							if p.value ~= nil then
								local val = getValue( p.value, nil, tdev )
								if val ~= nil then
									-- Vera action arguments are always strings. Boolean special.
									if type(val) == "boolean" then val = val and 1 or 0 end
									param[p.name or tostring(k)] = tostring(val)
								end
							end
						end
						D("execSceneGroups() dev %4 (%5) do %1/%2(%3) for %6 (%7)",
							action.service, action.action, param, devnum,
							(luup.devices[devnum] or {}).description or "?unknown?",
							scd.name or "", scd.id )
						luup.call_action( action.service, action.action, param, devnum )
					end
				elseif action.type == "housemode" then
					D("execSceneGroups() setting house mode to %1", action.housemode)
					luup.call_action( "urn:micasaverde-com:serviceId:HomeAutomationGateway1",
						"SetHouseMode", { Mode=action.housemode or "1" }, 0 )
				elseif action.type == "runscene" then
					-- Run scene in same context as this one. Whoa... recursion... depth???
					local scene = getValue( action.scene, nil, tdev )
					D("execSceneGroups() launching scene %1 (%2) from scene %3",
						scene, action.scene, scd.id)
					if (action.usevera or 0) ~= 0 or not getVarBool( "UseReactorScenes", true, tdev, RSSID ) then
						luup.call_action( "urn:micasaverde-com:serviceId:HomeAutomationGateway1",
							"RunScene", { SceneNum=scene }, 0 )
					else
						-- Not running as job here because we want in-line execution of scene actions (the Reactor way).
						local options = { contextDevice=sst.options.contextDevice, stopPriorScenes=false }
						runScene( scene, tdev, options )
					end
				elseif action.type == "runlua" then
					local fname = string.format("rs%s_sc%s_gr%d_ac%d",
						tostring(tdev), tostring(scd.id), nextGroup, ix )
					D("execSceneGroups() running Lua for %1 (chunk name %2)", scd.id, fname)
					local lua = action.lua
					if ( action.encoded_lua or 0 ) ~= 0 then
						lua = mime.unb64( lua )
						if lua == nil then
							addEvent{ dev=tdev,
								msg="TROUBLE: Can't decode Lua for activity %(sceneName)s group %(group)s step %(step)s",
								event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, step=ix, ['error']="Can't decode Lua" }
							L({level=1,msg="Aborting scene %1 (%2) run, unable to decode scene Lua"}, scd.id, scd.name)
							getSensorState( tdev ).trouble = true
							stopScene( tdev, nil, tdev ) -- stop all scenes in context.
							return nil
						end
					end
					local more, err = execLua( fname, lua, nil, tdev )
					if err then
						L({level=1,msg="%1 (%2) aborting scene %3 Lua execution at group step %4, Lua run failed: %5"},
							luup.devices[tdev].description, tdev, scd.id, ix, err)
						L{level=2,msg="Lua:\n"..lua} -- concat to avoid formatting
						addEvent{ dev=tdev,
							msg="TROUBLE: Lua error in activity %(sceneName)s group %(group)s step %(step)s: %(error)s",
							event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, step=ix, ['error']=err }
						getSensorState( tdev ).trouble = true
						-- Throw on the brakes! (stop all scenes in context)
						stopScene( tdev, nil, tdev )
						return nil
					elseif more == false then -- N.B. specific test to match exactly boolean type false (but not nil)
						L("%1 (%2) scene %3 Lua at step %4 returned (%5)%6, stopping actions.",
							luup.devices[tdev].description, tdev, scd.id, ix, type(more), more)
						addEvent{ dev=tdev,
							msg="Aborting activity %(sceneName)s; group %(group)s step %(step)s Lua returned %(retval)q",
							event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, step=ix, retval=more }
						stopScene( nil, taskid, tdev ) -- stop just this scene.
						return nil
					end
				elseif action.type == "rungsa" then
					local device = action.device or -1
					if device == -1 then
						device = tdev
					end
					local opts = { contextDevice=device }
					if ( action.stopall or 0 ) ~= 0 then opts.stopPriorScenes = true end
					luup.call_action( RSSID, "RunScene", { SceneNum=action.activity or "error", Options=json.encode(opts) }, device )
				elseif action.type == "stopgsa" then
					local device = action.device or -1
					if device == -1 then
						device = tdev
					end
					luup.call_action( RSSID, "StopScene", { SceneNum=action.activity or "" }, device )
				elseif action.type == "setvar" then
					local success, oldval, newval = doSetVar( action.variable, action.value, tdev )
					if success then
						addEvent{ dev=tdev, msg="Variable %(variable)q set to %(newValue)q; was %(newValue)q",
							variable=action.variable, newValue=newval, oldValue=oldval }
						if (action.reeval or 0) ~= 0 then
							scheduleDelay( tdev, 1 )
						end
					else
						L({level=2,msg="Set Variable action (%1 group %2 action %3) target %4 failed: "..tostring(oldval)},
							scd.id, nextGroup, ix, action.variable)
						addEvent{ dev=tdev,
								msg="%(sceneName)s group %(group)s action %(index)s Set Variable %(varname)q failed: %(err)s",
								event="runscene", scene=scd.id, sceneName=scd.name or scd.id,
								group=nextGroup, index=ix, varname=action.variable, ['err']=oldval }
						getSensorState( tdev ).trouble = true
					end
				elseif action.type == "resetlatch" then
					local device = action.device or -1
					local group = action.group or ""
					if device == -1 or device == tdev then
						if "" == group then group = scd.id:gsub( '%..+', '' ) end
						if "*" == group then group = false end
						local changed = resetLatched( group, tdev )
						if changed then
							scheduleDelay( tostring(tdev), 0 ) -- queue an eval if anything changed
						end
					else
						if "*" == group then group = nil end
						luup.call_action( RSSID, "ClearLatched", { Group=group }, device )
					end
				elseif action.type == "notify" then
					local success,err = pcall( doActionNotify, action, scd.id, tdev )
					if not success then
						L({level=2,msg="Notify action failed: " .. err .. " (%1 group %2 action %3)"},
							scd.id, nextGroup, ix)
						local ev = { dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, index=ix }
						ev.warning = err
						addEvent(ev)
						getSensorState( tdev ).trouble = true
					end
				elseif action.type == "request" then
					local success,err = pcall( doActionRequest, action, scd.id, tdev )
					if not success then
						L({level=2,msg="Request action failed: " .. err .. " (%1 group %2 action %3)"},
							scd.id, nextGroup, ix)
						local ev = { dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup, index=ix }
						ev.warning = err
						addEvent(ev)
						getSensorState( tdev ).trouble = true
					end
				else
					L({level=1,msg="Unhandled action type %1 at %2 in scene %3 for %4 (%5)"},
						action.type, ix, scd.id, tdev, luup.devices[tdev].description)
					addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, group=nextGroup,
						warning="TROUBLE: action #" .. tostring(ix) .. " unrecognized type: " .. tostring(action.type) .. ", ignored." }
					getSensorState( tdev ).trouble = true
				end
			end
		end

		-- Finished this group. Save position.
		sst.lastgroup = nextGroup
		sst.lastgrouptime = os.time()
		luup.variable_set( MYSID, "runscene", json.encode(sceneState), pluginDevice )
		nextGroup = nextGroup + 1 -- ...and we're moving on...
	end

	-- We've run out of groups!
	addEvent{ dev=tdev, msg="Activity %(sceneName)q finished", event="endscene", scene=scd.id, sceneName=scd.name or scd.id }
	D("execSceneGroups(%3) reached end of scene %1 (%2)", scd.id, scd.name, taskid)
	stopScene( nil, taskid, tdev )
	return nil
end

-- Execute a scene from scene data.
local function execScene( scd, tdev, options )
	D("execScene(%1(id),%2,%3)", scd.id, tdev, options )
	options = options or {}

	-- Check if scene running. If so, stop it.
	local ctx = tonumber( options.contextDevice ) or 0
	local taskid = string.format("ctx%s.sc%s", tostring(ctx), tostring(scd.id))
	if options.stopPriorScenes then
		stopScene( ctx, nil, tdev )
	end

	if ( not scd.isReactorScene ) and ( scd.paused or 0 ) ~= 0 then
		addEvent{ dev=tdev, msg="Launch of %(sceneName)s (#%(scene)s) blocked; scene is paused.",
			event="startscene", scene=scd.id, sceneName=scd.name or scd.id}
		return nil
	end

	-- And here ve go...
	addEvent{ dev=tdev,
		msg="Launching scene/activity %(sceneName)s",
		event="startscene", scene=scd.id, sceneName=scd.name or scd.id}

	-- If there's (Luup) scene lua, try to run it.
	if ( scd.lua or "" ) ~= "" then
		D("execScene() handling scene (global) Lua")
		local luafragment
		if ( scd.encoded_lua or 0 ) ~= 0 then
			luafragment = mime.unb64( scd.lua )
			if luafragment == nil then
				addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, ['error']="Aborting; unable to decode scene Lua" }
				L({level=1,msg="Aborting scene %1 (%2) run, unable to decode scene Lua"}, scd.id, scd.name)
				return
			end
		else
			luafragment = scd.lua or ""
		end
		-- Note name is context-free, because all runners of this scene use same
		-- code. Environment will reflect different context at runtime. Of course,
		-- this assumes it's a Luup/Vera scene, not a Reactor scene, but Reactor
		-- scenes don't have startup Lua.
		-- N.B. Scene loader has to reproduce this name, so be careful making changes here.
		local fname = string.format("scene%s_start", tostring(scd.id))
		local more,err = execLua( fname, luafragment, options.externalArgument, tdev )
		if err then
			addEvent{ dev=tdev,
				msg="TROUBLE: Aborting, error in scene Lua: %(error)s",
				event="runscene", scene=scd.id, sceneName=scd.name or scd.id, ['error']=err }
			L({level=1,msg="%1 (%2) scene %3 scene Lua run failed: %4"},
				luup.devices[tdev].description, tdev, scd.id, err)
			L{level=2,msg="Lua:\n"..luafragment} -- concat to avoid formatting
			return
		end
		if more == false then -- N.B. specific test to match exactly boolean type false (but not nil)
			addEvent{ dev=tdev,
				msg="Stopping scene, Lua returned %(return)q",
				event="runscene", scene=scd.id, sceneName=scd.name or scd.id, ['return']=more }
			L("%1 (%2) scene %3 Lua returned (%4)%5, scene run aborted.",
				luup.devices[tdev].description, tdev. scd.id, type(more), more)
			return
		end
	end

	-- We are going to run groups. Set up for it.
	D("execScene() setting up to run groups for scene")
	local now = os.time()
	sceneState[taskid] = {
		scene=scd.id,   -- scene ID
		starttime=now,  -- original start time for scene
		lastgroup=0,    -- last group to finish
		lastgrouptime=now,
		taskid=taskid,  -- timer task ID
		context=ctx,    -- context device (device requesting scene run)
		options=options,    -- options
		owner=tdev      -- parent device (always Reactor or ReactorSensor)
	}
	luup.variable_set( MYSID, "runscene", json.encode(sceneState), pluginDevice )

	-- execSceneGroups returns the taskid if delayed groups are pending, otherwise nil
	return execSceneGroups( tdev, taskid, scd )
end

-- Continue running scenes on restart.
local function resumeScenes()
	D("resumeScenes()")
	local d,err = getVarJSON( "runscene", {}, pluginDevice, MYSID )
	if err then
		L({level=1,msg="Can't resume scenes, failed to parse JSON for saved scene state: %1"},
			err)
		luup.variable_set( MYSID, "runscene", "{}", pluginDevice )
	end
	sceneState = d or {}
	for _,data in pairs( sceneState ) do
		addEvent{ dev=data.owner,
			msg="Resuming run after reload (%(scene)s)",
			event="runscene", scene=data.scene, notice="Queing scene resume after reload" }
		scheduleDelay( { id=data.taskid, owner=data.owner, func=execSceneGroups, args={} }, 1 )
	end
end

-- Start a Vera scene.
runScene = function( scene, tdev, options )
	D("runScene(%1,%2,%3)", scene, tdev, options )
	options = options or {}

	local scd = getSceneData( scene, tdev )
	if scd == nil then
		L({level=1,msg="%1 (%2) can't run scene %3, not found/loaded."}, tdev,
			luup.devices[tdev].description, scene)
		return
	end

	-- If using Luup scenes, short-cut
	if not scd.isReactorScene and
		not ( options.forceReactorScenes or getVarBool("UseReactorScenes", true, tdev, RSSID) ) then
		D("runScene() handing-off scene run to Luup")
		luup.call_action( "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "RunScene", { SceneNum=scene }, 0 )
		return
	end

	execScene( scd, tdev, options )
end

-- Set tripped state for a ReactorSensor. Runs scenes, if any.
local function trip( state, tdev )
	L("%2 (#%1) now %3", tdev, luup.devices[tdev].description, state and "tripped" or "untripped")
	-- We go direct (rather than setVar) to enforce retrigger on manual trip or Retrigger=1
	luup.variable_set( SENSOR_SID, "Tripped", state and "1" or "0", tdev )
	luup.variable_set( SWITCH_SID, "Target", state and "1" or "0", tdev )
	luup.variable_set( SWITCH_SID, "Status", state and "1" or "0", tdev )
	addEvent{dev=tdev,
		msg="Changing RS tripped state to %(state)q", event='sensorstate', state=state}

	-- Make sure condState is loaded/ready (may have been expired by cache)
	loadCleanState( tdev )
	if not state then
		-- Luup keeps (SecuritySensor1/)LastTrip, but we also keep LastReset
		luup.variable_set( RSSID, "LastReset", os.time(), tdev )
		-- Option, reset latched conditions
		if getVarBool( "ResetLatchedOnUntrip", false, tdev, RSSID ) then
			-- Reset latched conditions when group resets
			if resetLatched( false, tdev ) then
				scheduleDelay( tostring(tdev), 0 )
			end
		end
		if getVarBool( "UseLegacyTripBehavior", false, tdev, RSSID ) then
			-- Run the reset scene, if we have one.
			local scd = getSceneData( 'root.false', tdev )
			if not isSceneEmpty( scd ) then
				-- Note we only stop trip actions if there are untrip actions.
				addEvent{ dev=tdev, msg="Launching root.false activity" }
				stopScene( tdev, nil, tdev, 'root.true' ) -- stop contra-activity
				execScene( scd, tdev, { contextDevice=tdev, stopPriorScenes=false } )
			end
		end
	else
		-- Count a trip.
		luup.variable_set( RSSID, "TripCount", getVarNumeric( "TripCount", 0, tdev, RSSID ) + 1, tdev )
		if getVarBool( "UseLegacyTripBehavior", false, tdev, RSSID ) then
			-- Run the trip scene, if we have one.
			local scd = getSceneData( 'root.true', tdev )
			if not isSceneEmpty( scd ) then
				-- Note we only stop untrip actions if there are trip actions.
				addEvent{ dev=tdev, msg="Launching root.true activity" }
				stopScene( tdev, nil, tdev, 'root.false' ) -- stop contra-activity
				execScene( scd, tdev, { contextDevice=tdev, stopPriorScenes=false } )
			end
		end
	end
end

-- Perform evaluations of configured variables/expressions
local function updateVariables( cdata, tdev )
	D("updateVariables(cdata,%1)", tdev)
	local first = true
	local ctx
	local condState = loadCleanState( tdev )
	for _,v in variables( cdata ) do
		if first then
			ctx = getSensorState( tdev ).ctx or getExpressionContext( cdata, tdev )
			first = false
		end
		D("updateVariables() evaluate %1", v)
		if (condState.vars or {})[v.name] then
			condState.vars[v.name].changed = nil
		end
		evaluateVariable( v.name, ctx, cdata, tdev )
	end
end

-- Helper to schedule next condition update. Times are MSM (mins since midnight)
local function doNextCondCheck( taskinfo, nowMSM, startMSM, endMSM, testing )
	D("doNextCondCheck(%1,%2,%3,%4,%5)", taskinfo, nowMSM, startMSM, endMSM, testing)
	if testing then return end -- Do nothing when testing at the moment
	local edge = 1440
	if nowMSM < startMSM then
		edge = startMSM
	end
	if endMSM ~= nil and nowMSM < endMSM then
		edge = math.min( edge, endMSM )
	end
	local delay = (edge - nowMSM) * 60
	-- Round the time to the start of a minute (more definitive)
	local tt = math.floor( ( os.time() + delay ) / 60 ) * 60
	D("doNextCondCheck() edge %3, scheduling next check for %1 (delay %2secs)", tt, delay, edge)
	scheduleTick( taskinfo, tt )
end

-- Compute the next interval after lastTrue that's aligned to baseTime
local function getNextInterval( lastTrue, interval, baseTime)
	D("getNextInterval(%1,%2,%3,%4)", lastTrue, interval, baseTime)
	if baseTime == nil then
		local t = os.date("*t", lastTrue)
		t.hour = 0
		t.min = 0
		t.sec = 9
		baseTime = os.time(t)
	end
	-- Our next true relative to lastTrue considers both interval and baseTime
	-- For example, if interval is 4 hours, and baseTime is 3:00pm, the condition
	-- fires at 3am, 7am, 11am, 3pm, 7pm, 11pm (interval goes through baseTime).
	local offs = lastTrue - baseTime
	local nint = math.floor( offs / interval ) + 1
	local nextTrue = baseTime + nint * interval
	return nextTrue
end

-- Perform comparison between condition value (whatever it may be) and operand.
-- This supports the common/generic operators. Each condition type may separately
-- handle its special cases.
local function doComparison( cond, op, vv, vn, rv, cv, cn, tdev )
	D("doComparison(%1,%2,%3,%4,%5,%6,%7,%8)", cond, op, vv, vn, rv, cv, cn, tdev )
	local now = os.time()
	if op == "=" then
		if vv ~= cv then return vv,false end
	elseif op == "<>" then
		if vv == cv then return vv,false end
	elseif op == ">" then
		if vn == nil or cn == nil or vn <= cn then return vv,false end
	elseif op == "<" then
		if vn == nil or cn == nil or vn >= cn then return vv,false end
	elseif op == ">=" then
		if vn == nil or cn == nil or vn < cn then return vv,false end
	elseif op == "<=" then
		if vn == nil or cn == nil or vn > cn then return vv,false end
	elseif op == "bet" or op == "nob" then
		local vs = split( cv or "", "," )
		local lo = tonumber( #vs > 0 and vs[1] or "?" )
		local hi = tonumber( #vs > 1 and vs[2] or "?" )
		if vn ==  nil or lo == nil or hi == nil then return vv,false end
		if lo > hi then lo,hi = hi,lo end
		local between = vn >= lo and vn <= hi
		if ( op == "bet" and not between ) or ( op == "nob" and between ) then
			return vv,false
		end
	elseif op == "contains" then
		if not string.find( vv, cv ) then return vv,false end
	elseif op == "notcontains" then
		if string.find( vv, cv ) then return vv,false end
	elseif op == "starts" then
		if not string.find( vv, "^" .. cv ) then return vv,false end
	elseif op == "notstarts" then
		if string.find( vv, "^" .. cv ) then return vv,false end
	elseif op == "ends" then
		if not string.find( vv, cv .. "$" ) then return vv,false end
	elseif op == "notends" then
		if string.find( vv, cv .. "$" ) then return vv,false end
	elseif op == "in" or op == "notin" then
		local lst = split( cv ) or {}
		local found = isOnList( lst, vv )
		if op == "notin" and found then return vv,false end
		if op == "in" and not found then return vv,false end
	elseif op == "istrue" then
		if (vn or 0) == 0 and not TRUESTRINGS:find( ":" .. vv:lower() .. ":" ) then return vv,false end
	elseif op == "isfalse" then
		if (vn or 0) ~= 0 or TRUESTRINGS:find( ":" .. vv:lower() .. ":" ) then return vv,false end
	elseif op == "isnull" then
		-- Loading the context ensures that LuaXP is loaded (in case the test is invoked without
		-- first having created variables)
		local _ = getSensorState( tdev ).ctx or getExpressionContext( getSensorConfig( tdev ), tdev )
		return tostring( rv ), luaxp.isNull( rv ) -- the only place we use rv so far
	elseif op == "change" then
		local cs = getSensorState( tdev ).condState[ cond.id ]
		if cv ~= "" and cv ~= "," then
			local ar = split( cv, "," )
			-- With terminal values. If value hasn't changed, consider as
			-- re-eval, go back further in history for prior value.
			local prior = ( cs.lastvalue == vv ) and
				cs.priorvalue or cs.lastvalue
			D("doComparison() service change op with terms, currval=%1, prior=%2, term=%3", vv, prior, ar)
			if #ar > 0 and ar[1] ~= "" then
				cv = getValue( ar[1], nil, tdev )
				if prior ~= cv then return vv,false end
			end
			if #ar > 1 and ar[2] ~= "" then
				cv = getValue( ar[2], nil, tdev )
				if vv ~= cv then return vv,false end
			end
			return vv,true
		end
		D("doComparison() service change op without terms, currval=%1, prior=%2, term=%3",
			vv, cs.lastvalue, cv)
		local hold = getVarNumeric( "ValueChangeHoldTime", 0, tdev, RSSID ) -- DEPRECATED REMOVE AFTER >19296
		if vv == cs.lastvalue then
			-- No change. If we haven't yet met the hold time, continue delay.
			local later = ( cs.valuestamp or 0 ) + hold
			if now >= later then
				return vv,false -- time to reset
			end
			hold = math.min( hold, later - now )
			D("evaluationCondition() no change, but hold time from prior change not yet met, continuing delay for %1 more...", hold)
		end
		-- Changed without terminal values, pulse.
		scheduleDelay( { id=tdev, info="change "..cond.id }, hold )
	else
		L({level=1,msg="doComparison() unknown op %1 in cond %2"}, op, cv)
		addEvent{ dev=tdev, event="condition", condition=cond.id, ['error']="TROUBLE: unrecognized operator "..tostring(op or "nil") }
		getSensorState( tdev ).trouble = true
		return vv,nil
	end
	D("doComparison() default true exit for cond %1, new value=%2", cond.id, vv)
	return vv,true
end

local evaluateGroup -- Forward decl
local function evaluateCondition( cond, grp, cdata, tdev ) -- luacheck: ignore 212
	D("evaluateCondition(%1,%2,cdata,%3)", cond.id, (grp or {}).id, tdev)
	local sst = getSensorState( tdev )
	local now = sst.timebase
	local ndt = sst.timeparts

	-- Fetch prior state/value
	local cs = sst.condState[cond.id]
	D("evaluateCondition() condstate %1", cs)

	if ( cond.type or "group" ) == "group" then
		return evaluateGroup( cond, grp, cdata, tdev )

	elseif cond.type == "service" then
		-- Can't succeed if referenced device doesn't exist.
		local devnum = tonumber( cond.device )
		if devnum == -1 then devnum = tdev end
		if devnum == nil or luup.devices[devnum] == nil then
			L({level=2,msg="%1 (%2) condition %3 refers to device %4 (%5), does not exist, skipped"},
				luup.devices[tdev].description, tdev, cond.id, cond.device or "nil", cond.devicename or "unknown")
			addEvent{ dev=tdev, event="condition", condition=cond.id, device=cond.device,
				devicename=cond.devicename, ['error']='TROUBLE: device used in condition not available' }
			sst.trouble = true -- flag trouble
			return nil,nil
		end

		-- Add service watch if we don't have one.
		addServiceWatch( devnum, cond.service, cond.variable, tdev )

		-- Get state variable value.
		local vv = luup.variable_get( cond.service or "", cond.variable or "", devnum ) or ""
		local vn = tonumber( vv )

		-- Get condition value
		local cv,cn = getValue( cond.value, nil, tdev )

		-- If case-insensitive, canonify to lowercase.
		if ( cond.nocase or 1 ) ~= 0 then
			vv = string.lower( vv )
			cv = string.lower( cv )
		end

		-- Evaluate conditions. Any failure is a bail-out.'
		local op = cond.operator
		D("evaluateCondition() %1: %2/%3 %4%5%6?", cond.type, cond.service, cond.variable, vv, op, cv)
		if op == "update" then
			-- State variable written, possibly same value, watch has been called.
			-- Refetch value to get timestamp
			_,vv = luup.variable_get( cond.service or "", cond.variable or "", devnum )
			D("evaluateCondition() service state update op, timestamp=%1, prior=%2, isRestart=%3",
				vv, cs.lastvalue, sst.isRestart)
			-- Some vars are rewritten by restart. Attempt to ignore this.
			if sst.isRestart and getVarBool( "SuppressLuupRestartUpdate", true, tdev, RSSID ) then
				D("evaluateCondition() ignoring restart-time update")
				return vv,false
			end
			local hold = getVarNumeric( "ValueChangeHoldTime", 0, tdev, RSSID ) -- DEPRECATED REMOVE AFTER >19296
			if vv == cs.lastvalue then
				-- No change. If we haven't yet met the hold time, continue delay.
				local later = ( cs.valuestamp or 0 ) + hold
				if now >= later then
					return vv,false -- time to reset
				end
				hold = math.min( hold, later - now )
				D("evaluationCondition() no change, but hold time from prior change not yet met, continuing delay for %1 more...", hold)
			end
			scheduleDelay( { id=tdev, info="update "..cond.id }, hold )
		else
			return doComparison( cond, op, vv, vn, vv, cv, cn, tdev )
		end
		D("evaluateCondition() default true exit for cond %1, new value=%2", cond.id, vv)
		return vv,true

	elseif cond.type == "grpstate" then
		-- Can't succeed if referenced device doesn't exist.
		local devnum = tonumber( cond.device )
		if devnum == -1 then devnum = tdev end
		if devnum == nil or luup.devices[devnum] == nil then
			L({level=2,msg="%1 (%2) condition %3 refers to device %4 (%5), does not exist, skipped"},
				luup.devices[tdev].description, tdev, cond.id, cond.device or "nil", cond.devicename or "unknown")
			addEvent{ dev=tdev, event="condition", condition=cond.id, device=cond.device,
				devicename=cond.devicename, ['error']='TROUBLE: device used in condition not available' }
			sst.trouble = true -- flag trouble
			return nil,nil
		end

		-- Get group state value; use cstate if local
		local varname = string.format( "GroupStatus_%s", cond.groupid or "?" )
		-- Add service watch if we don't have one.
		addServiceWatch( devnum, GRPSID, varname, tdev )

		local vv
		if devnum == tdev then
			local gs = sst.condState[cond.groupid] or {}
			vv = gs.evalstate or false
		else
			vv = getVarNumeric( varname, -1, devnum, GRPSID )

			-- Boolean should come back 0 or 1; if -1, group does not exist or is not ready/available
			if vv < 0 then
				L({level=2,msg="%1 (%2) condition %3 refers to device %4 (%5) group %6 (%7), not available, skipped"},
					luup.devices[tdev].description, tdev, cond.id, cond.device, cond.devicename or "unknown",
					cond.groupid, cond.groupname)
				addEvent{ dev=tdev, event="condition", condition=cond.id,
					device=cond.device, groupid=cond.groupid, groupname=cond.groupname,
					['error']='TROUBLE: group/state not available' }
				sst.trouble = true -- flag trouble
				return nil,nil
			end
			vv = vv ~= 0 -- boolean!
		end

		if cond.operator == "change" then
			D("evaluateCondition() group state change, curr=%1, prior=%2",
				vv, cs.lastvalue)
			local hold = getVarNumeric( "ValueChangeHoldTime", 0, tdev, RSSID ) -- DEPRECATED REMOVE AFTER >19296
			if vv == cs.lastvalue then
				-- No change. If we haven't yet met the hold time, continue delay.
				local later = ( cs.valuestamp or 0 ) + hold
				if now >= later then
					return vv,false -- time to reset
				end
				hold = math.min( hold, later - now )
				D("evaluationCondition() no change, but hold time from prior change not yet met, continuing delay for %1 more...", hold)
			end
			-- Changed without terminal values, pulse.
			scheduleDelay( { id=tdev, info="change "..cond.id }, hold )
		else
			-- istrue or isfalse
			if cond.operator == "isfalse" then
				return vv,not vv
			end
			return vv,vv
		end
		return vv,true -- default exit always true

	elseif cond.type == "var" then
		D("evaluationCondition() variable %1", cond.var)
		local vv,vn,rv = getValue( "{"..tostring(cond.var or "null").."}", nil, tdev )
		local cv,cn = getValue( cond.value, nil, tdev )
		if ( cond.nocase or 1 ) ~= 0 then
			vv = tostring(vv or ""):lower()
			cv = tostring(cv or ""):lower()
		end
		return doComparison( cond, cond.operator or "=", vv, vn, rv, cv, cn, tdev )

	elseif cond.type == "housemode" then
		-- Add watch on parent if we don't already have one.
		usesHouseMode = true
		addServiceWatch( pluginDevice, MYSID, "HouseMode", tdev )
		local val = cond.value or ""
		local modes = split( val )
		local mode = getHouseMode( tdev )
		if cond.operator == "change" then
			if val ~= "" and val ~= "," then
				-- With terminal values. If value hasn't changed, consider as
				-- re-eval, go back further in history for prior value.
				local prior = ( cs.lastvalue == mode ) and cs.priorvalue or cs.lastvalue
				D("evaluateCondition() housemode change op, currval=%1, prior=%2, term=%3", mode, prior, modes)
				if #modes > 0 and modes[1] ~= "" and prior ~= modes[1] then return mode,false end
				if #modes > 1 and modes[2] ~= "" and mode ~= modes[2] then return mode,false end
				return mode,true
			end
			-- Simple change (any to any).
			D("evaluateCondition() housemode change op, currval=%1, prior=%2 (no term)", mode, cs.lastvalue)
			local hold = getVarNumeric( "ValueChangeHoldTime", 0, tdev, RSSID ) -- DEPRECATED REMOVE AFTER >19296
			if mode == cs.lastvalue then
				-- No change. If we haven't yet met the hold time, continue delay.
				local later = ( cs.valuestamp or 0 ) + hold
				if now >= later then
					return mode,false
				end
				hold = math.min( hold, later - now )
				D("evaluationCondition() no change, but hold time from prior change not yet met, continuing delay for %1 more...", hold)
			end
			-- Changed, pulse.
			scheduleDelay( { id=tdev,info="change "..cond.id }, hold )
		else
			-- Default "is" operator
			D("evaluateCondition() housemode %1 among %2?", mode, modes)
			if not isOnList( modes, mode ) then return mode,false end
		end
		return mode,true

	elseif cond.type == "weekday" then
		local val = ndt.wday
		-- Weekday; Lua 1=Sunday, 2=Monday, ..., 7=Saturday
		local nextDay = os.time{year=ndt.year,month=ndt.month,day=ndt.day+1,hour=0,['min']=0,sec=0}
		D("evaluateCondition() weekday condition, setting next check for %1", nextDay)
		scheduleTick( { id=tdev, info="weekday "..cond.id }, nextDay )
		local wd = split( cond.value )
		local op = cond.operator or ""
		D("evaluateCondition() weekday %1 among %2", val, wd)
		if not isOnList( wd, tostring( ndt.wday ) ) then return val,false end
		-- OK, we're on the right day of the week. Which week?
		if op ~= "" then -- blank means "every"
			D("evaluateCondition() is today %1 %2-%3 the %4th?", val, ndt.month,
				ndt.day, op)
			if op == "last" then
				-- Must be last of this day of the week. If we add a week
				-- to current date, the new date should be next month.
				local nt = os.date( "*t", now + ( 7 * 86400 ) )
				D("evaluateCondition() weekday %1 %2? today=%3, nextweek=%4", val, op, ndt, nt)
				if nt.month == ndt.month then return val,false end -- same
			else
				local nth = tonumber( op )
				if nth == nil then
					L({level=2,msg="Invalid op %1 in weekday condition %2 for %3 (%4)"},
						op, cond.id, (luup.devices[tdev] or {}).description, tdev)
					addEvent{ dev=tdev, event="condition", condition=cond.id,
						operator=op, ['error']="TROUBLE: unrecognized operator" }
					sst.trouble = true
					return val,nil
				end
				-- Move back N-1 weeks; we should still be in same month. Then
				-- move back one more week, should be in prior month.
				local pt, ref
				ref = now
				if nth > 1 then
					ref = ref - ( (nth-1) * 7 * 86400 )
					pt = os.date( "*t", ref )
					if pt.month ~= ndt.month then return val,false end
				end
				pt = os.date( "*t", ref - ( 7 * 86400 ) )
				if pt.month == ndt.month then return val,false end
			end
			D("evaluateCondition() yes, today %1 %2-%3 IS #%4 in month", val,
				ndt.month, ndt.day, op)
		end
		return val, true

	elseif cond.type == "sun" then
		-- Sun condition (sunrise/set)
		-- Figure out sunrise/sunset. Keep cached to reduce load.
		local stamp = ndt.year * 1000 + ndt.yday
		local sundata = getVarJSON( "sundata", {}, pluginDevice, MYSID )
		if ( sundata.stamp or 0 ) ~= stamp or sst.timetest then
			if getVarBool( "UseLuupSunrise", false, pluginDevice, MYSID ) then
				L({level=2,msg="Reactor is configured to use Luup's sunrise/sunset calculations; twilight times cannot be correctly evaluated and will evaluate as dawn=sunrise, dusk=sunset"})
				addEvent{ dev=tdev, event="condition", condition=cond.id,
					['warning']="TROUBLE: configured to use Luup sunrise/sunset; twilights not available" }
				sst.trouble = true
				sundata = { sunrise=luup.sunrise(), sunset=luup.sunset() }
				sundata.civdawn = sundata.sunrise sundata.civdusk=sundata.sunset
				sundata.nautdawn = sundata.sunrise sundata.nautdusk = sundata.sunset
				sundata.astrodawn = sundata.sunrise sundata.astrodusk = sundata.sunset
				sundata.source = "luup"
			else
				-- Compute sun data
				sundata = sun( luup.longitude, luup.latitude,
					getVarNumeric( "Elevation", 0.0, pluginDevice, MYSID ), now )
				sundata.source = "int"
				D("evaluationCondition() location (%1,%2) computed %3", luup.longitude, luup.latitude, sundata)
			end
			sundata.longitude = luup.longitude
			sundata.latitude = luup.latitude
			if not sst.timetest then
				-- Only write if not testing.
				sundata.stamp = stamp
				luup.variable_set( MYSID, "sundata", json.encode(sundata), pluginDevice )
			end
		end
		local nowMSM = ndt.hour * 60 + ndt.min
		local op = cond.operator or "bet"
		local tparam = split( cond.value or "sunrise+0,sunset+0" )
		local cp,boffs = string.match( tparam[1], "^([^%+%-]+)(.*)" )
		boffs = tonumber( boffs or "0" ) or 0
		local stt = ( sundata[cp or "sunrise"] or sundata.sunrise ) + boffs*60
		local sdt = os.date("*t", stt)
		local startMSM = sdt.hour * 60 + sdt.min
		if op == "bet" or op == "nob" then
			local ep,eoffs = string.match( tparam[2] or "sunset+0", "^([^%+%-]+)(.*)" )
			eoffs = tonumber( eoffs or 0 ) or 0
			local ett = ( sundata[ep or "sunset"] or sundata.sunset ) + eoffs*60
			sdt = os.date("*t", ett)
			local endMSM = sdt.hour * 60 + sdt.min
			D("evaluateCondition() cond %1 check %2 %3 %4 and %5", cond.id, nowMSM, op, startMSM, endMSM)
			doNextCondCheck( { id=tdev,info="sun "..cond.id }, nowMSM, startMSM, endMSM, sst.timetest )
			local between
			if endMSM <= startMSM then
				between = nowMSM >= startMSM or nowMSM < endMSM
			else
				between = nowMSM >= startMSM and nowMSM < endMSM
			end
			if ( op == "bet" and not between ) or
				( op == "nob" and between ) then
				return now,false
			end
		elseif cond.operator == "before" then
			D("evaluateCondition() cond %1 check %2 before %3", cond.id, nowMSM, startMSM)
			doNextCondCheck( { id=tdev,info="sun "..cond.id }, nowMSM, startMSM, nil, sst.timetest )
			if nowMSM >= startMSM then return now,false end
		else
			D("evaluateCondition() cond %1 check %2 after %3", cond.id, nowMSM, startMSM)
			doNextCondCheck( { id=tdev,info="sun "..cond.id }, nowMSM, startMSM, nil, sst.timetest )
			if nowMSM < startMSM then return now,false end -- after
		end
		return now,true

	elseif cond.type == "trange" then
		-- Time, with various components specified, or not.
		local op = cond.operator or "bet"
		-- Split, pad, and complete date. Any missing parts are filled in with the
		-- current date/time's corresponding part.
		local tparam = split( cond.value, ',' )
		for ix = #tparam+1, 10 do tparam[ix] = "" end -- pad
		local tpart = {}
		tpart[1] = ( tparam[1] == "" ) and ndt.year or tonumber( tparam[1] )
		tpart[2] = ( tparam[2] == "" ) and ndt.month or tonumber( tparam[2] )
		tpart[3] = ( tparam[3] == "" ) and ndt.day or tonumber( tparam[3] )
		tpart[4] = ( tparam[4] == "" ) and ndt.hour or tonumber( tparam[4] )
		tpart[5] = ( tparam[5] == "" ) and ndt.min or tonumber( tparam[5] )
		tpart[6] = ( tparam[6] == "" ) and tpart[1] or tonumber( tparam[6] )
		tpart[7] = ( tparam[7] == "" ) and tpart[2] or tonumber( tparam[7] )
		tpart[8] = ( tparam[8] == "" ) and tpart[3] or tonumber( tparam[8] )
		tpart[9] = ( tparam[9] == "" ) and tpart[4] or tonumber( tparam[9] )
		tpart[10] = ( tparam[10] == "" ) and tpart[5] or tonumber( tparam[10] )
		-- Sanity check year to avoid nil dates coming from os.time()
		if tpart[1] < 1970 then tpart[1] = 1970 elseif tpart[1] > 2037 then tpart[1] = 2037 end
		if tpart[6] < 1970 then tpart[6] = 1970 elseif tpart[6] > 2037 then tpart[6] = 2037 end
		D("evaluationCondition() clean tpart=%1", tpart)
		if tparam[3] == "" then
			-- No date specified, only time components. Magnitude comparison.
			D("evaluateCondition() time-only comparison, now is %1, ndt is %2", now, ndt)
			local nowMSM = ndt.hour * 60 + ndt.min
			local startMSM = tpart[4] * 60 + tpart[5]
			if op == "after" then
				D("evaluateCondition() time-only comparison %1 after %2", nowMSM, startMSM)
				doNextCondCheck( { id=tdev,info="trangeHM "..cond.id }, nowMSM, startMSM, nil, sst.timetest )
				if nowMSM < startMSM then return now,false end
			elseif op == "before" then
				D("evaluateCondition() time-only comparison %1 before %2", nowMSM, startMSM)
				doNextCondCheck( { id=tdev,info="trangeHM "..cond.id }, nowMSM, startMSM, nil, sst.timetest )
				if nowMSM >= startMSM then return now,false end
			else
				-- Between, or not
				local endMSM = tpart[9] * 60 + tpart[10]
				local between
				if endMSM <= startMSM then
					between = nowMSM >= startMSM or nowMSM < endMSM
				else
					between = nowMSM >= startMSM and nowMSM < endMSM
				end
				D("evaluateCondition() time-only comparison %1 %2 %3 %4 (between=%5)",
					nowMSM, op, startMSM, endMSM, between)
				doNextCondCheck( { id=tdev,info="trangeHM "..cond.id }, nowMSM, startMSM, endMSM, sst.timetest )
				if ( op == "nob" and between ) or
					( op == "bet" and not between ) then
					return now,false
				end
			end
		elseif tparam[1] == "" then
			-- No-year given, just [M/]D H:M. We can do comparison by magnitude,
			-- which works better for year-spanning ranges.
			-- N.B. month defaults to current month by setup of tpart.
			local nowz = ndt.month * 100 + ndt.day
			local stz = tpart[2] * 100 + tpart[3]
			nowz = nowz * 1440 + ndt.hour * 60 + ndt.min
			stz = stz * 1440 + tpart[4] * 60 + tpart[5]
			if op == "before" then
				D("evaluateCondition() M/D H:M test %1 %2 %3", nowz, op, stz)
				doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440, nil, sst.timetest )
				if nowz >= stz then return now,false end
			elseif op == "after" then
				D("evaluateCondition() M/D H:M test %1 %2 %3", nowz, op, stz)
				doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440, nil, sst.timetest )
				if nowz < stz then return now,false end
			else
				local enz = tpart[7] * 100 + tpart[8]
				enz = enz * 1440 + tpart[9] * 60 + tpart[10]
				D("evaluateCondition() M/D H:M test %1 %2 %3 and %4", nowz, op, stz, enz)
				doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440, enz % 1440, sst.timetest )
				local between
				if stz < enz then -- check for year-spanning
					between = nowz >= stz and nowz < enz
				else
					between = nowz >= stz or nowz < enz
				end
				if ( op == "bet" and not between ) or
					( op == "nob" and between ) then
					return now,false
				end
			end
		else
			-- Full spec (Y-M-D H:M). Compare actual times (minute resolution).
			local tmnow = math.floor( now / 60 ) * 60
			local stt, ett
			stt = os.time{ year=tpart[1], month=tpart[2], day=tpart[3], hour=tpart[4], min=tpart[5] }
			stt = math.floor( stt / 60 ) * 60
			D("evaluateCondition() time start %1", os.date( "%x.%X", stt ))
			ett = os.time{ year=tpart[6], month=tpart[7], day=tpart[8], hour=tpart[9], min=tpart[10] }
			ett = math.floor( ett / 60 ) * 60
			D("evaluateCondition() time end %1", os.date( "%x.%X", ett ))
			if stt == ett then ett = ett + 60 end -- special case
			D("evaluateCondition() compare tmnow %1 %2 %3 and %4", tmnow, op, stt, ett)
			-- Before doing condition check, schedule next time for condition check
			local edge = ( tmnow < stt ) and stt or ( ( tmnow < ett ) and ett or nil )
			if edge ~= nil and not sst.timetest then
				scheduleTick( { id=tdev,info="trangeFULL "..cond.id }, edge )
			else
				D("evaluateCondition() cond %1 past end time, not scheduling further checks", cond.id)
			end
			local cp = op
			if cp == "bet" then
				if tmnow < stt or tmnow >= ett then return now,false end
			elseif cp == "nob" then
				if tmnow >= stt and tmnow < ett then return now,false end
			elseif cp == "before" then
				if tmnow >= stt then return now,false end
			elseif cp == "after" then
				if tmnow < stt then return now,false end
			else
				L({level=1,msg="Unrecognized operator %1 in time spec for cond %2 of %3 (%4)"},
					cp, cond.id, tdev, luup.devices[tdev].description)
				addEvent{ dev=tdev, event="condition", condition=cond.id,
					operator=cp, ['error']="TROUBLE: unrecognized operator" }
				sst.trouble = true
				return now,nil
			end
		end
		return now,true

	elseif cond.type == "comment" then
		-- Shortcut. Comments are always null (don't contribute to logic).
		return 0,nil

	elseif cond.type == "reload" then
		-- True when loadtime changes. Self-resetting.
		local loadtime = getVarNumeric( "LoadTime", 0, pluginDevice, MYSID )
		local lastload = getVarNumeric( "LastLoad", 0, tdev, RSSID )
		local reloaded = loadtime ~= lastload
		D("evaluateCondition() loadtime %1 lastload %2 reloaded %3", loadtime, lastload, reloaded)
		local hold = getVarNumeric( "ReloadConditionHoldTime", 0, tdev, RSSID ) -- DEPRECATED REMOVE AFTER >19296
		if not reloaded then
			-- Not reloaded. Hold on until we've satisfied hold time from last TRUE.
			local later = ( ( cs.stateedge or {} ).t or 0 ) + hold
			if now >= later then
				return false,false
			end
			hold = math.min( hold, later - now )
		else
			luup.variable_set( RSSID, "LastLoad", loadtime, tdev )
		end
		scheduleDelay( tdev, hold )
		return true,true

	elseif cond.type == "interval" then
		local _,nmins = getValue( cond.mins, nil, tdev )
		local _,nhours = getValue( cond.hours, nil, tdev )
		local _,ndays = getValue( cond.days, nil, tdev )
		local interval = 60 * ((ndays or 0) * 1440 + (nhours or 0) * 60 + (nmins or 0))
		if interval < 60 then interval = 60 end -- "can never happen" (yeah, hold my beer)
		D("evaluateCondition() interval %1 secs", interval)
		-- Get our base time and make it a real time.
		local lastTrue, expected
		if "condtrue" == ( cond.relto or "" ) then
			local xs = ( sst.condState or {} )[cond.relcond]
			if xs == nil then
				-- Trouble, missing condition or no state.
				L({level=1,msg="Unrecognized condition for %1 in interval cond %2 of %3 (%4)"},
					cond.relcond or "nil", cond.id, tdev, luup.devices[tdev].description)
				addEvent{ dev=tdev, event="condition", condition=cond.id,
					referencing=cond.relcond, ['error']="TROUBLE: relative condition missing" }
				sst.trouble = true
				return now,false
			end
			D("evaluateCondition() relcond state %1", xs)
			-- If condition is not true, interval does not run.
			lastTrue = cs.lastvalue or 0
			if xs.evalstate ~= true then return lastTrue,false end
			expected = getNextInterval( lastTrue, interval, xs.evalstamp )
		else
			if cs.lastvalue == nil then
				-- No prior data, immediate interval.
				scheduleDelay( { id=tdev, info="interval "..cond.id }, 1 )
				return now,true
			end
			lastTrue = cs.lastvalue
			local tpart = os.date("*t", cs.lastvalue)
			tpart.hour = 0
			tpart.min = 0
			tpart.sec = 0
			local pt = split( ( getValue( cond.basetime, nil, tdev ) ) or "" )
			if #pt == 2 then
				tpart.hour = tonumber(pt[1]) or 0
				tpart.min = tonumber(pt[2]) or 0
			end
			local baseTime = os.time(tpart)
			expected = getNextInterval( lastTrue, interval, baseTime )
		end
		-- Find next trigger time.
		if cs.laststate then
			-- We are currently true (in a pulse); end pulse and schedule next interval.
			while expected <= now do expected = expected + interval end
			D("evaluateCondition() resetting, next %1", expected)
			scheduleTick( { id=tdev, info="interval "..cond.id }, expected )
			return lastTrue,false
		end
		-- Not in a pulse. Did we fully miss an interval?
		if ( now - expected ) > 60 then
			local late = now - expected
			addEvent{ dev=tdev,
				msg="Condition %(cond)s inserting missed interval (late %(late)s)",
				event='condition', cond=cond.id, late=late }
			D("evaluationCondition() hitting missed interval, expected %1 late %2", expected, late)
		elseif now < expected then
			-- Still need to wait...
			D("evaluateCondition() too early, delaying %1 seconds until %2", expected-now, expected)
			scheduleTick( { id=tdev,info="interval "..cond.id }, expected )
			return lastTrue,false
		end
		-- Go true.
		D("evaluateCondition() triggering interval condition %1", cond.id)
		-- On time of 1 second (use reset delay to extend)
		scheduleDelay( { id=tdev,info="interval "..cond.id }, 1 )
		return now,true

	elseif cond.type == "ishome" then
		-- Geofence, is user home?
		-- Add watch on parent if we don't already have one.
		addServiceWatch( pluginDevice, MYSID, "IsHome", tdev )
		local op = cond.operator or "is"
		local ishome = getVarJSON( "IsHome", {}, pluginDevice, MYSID )
		if ishome.version ~= 2 then
			geofenceMode = -1 -- force full update
			L{level=2,msg="Geofence data needs update; deferring evaluation until master device updates."}
			return "not-ready",false
		end
		local userlist = split( cond.value or "" )
		D("evaluateCondition() ishome op=%1 %3; ishome=%2", op, ishome, userlist)
		if op == "at" or op == "notat" then
			if geofenceMode ~= -1 then geofenceMode = -1 end
			local userid,location = unpack(userlist)
			if (ishome.users[userid] or {}).tags and ishome.users[userid].tags[location] then
				local val = ishome.users[userid].tags[location].status or ""
				if val == "" then
					val = getVar( "GeofenceDefaultStatus", "", tdev )
				end
				if val ~= "" then
					return val,val==( op=="at" and "in" or "out" )
				end
			end
			-- Don't have data for this location or user.
			addEvent{ dev=tdev, event="condition", userid=userid, condition=cond.id,
				['type']=cond.type, ['error']="TROUBLE: no geofence status in user data" }
			sst.trouble = true
			return "",false
		else
			-- We could just traverse IsHome, but we want to show
			if geofenceMode == 0 then geofenceMode = 1 end -- don't change -1
			if #userlist < 1 or (#userlist == 1 and userlist[1] == "") then
				-- Empty userlist.
				for k,v in pairs( ishome.users ) do
					D("evaluateCondition() any op %1, checking %2 ishome=%3", op, k, v.ishome)
					if v.ishome == 0 and op == "is not" then return k,true end
					if v.ishome == 1 and op == "is" then return k,true end
				end
			else
				-- Check listed users
				for _,v in ipairs( userlist ) do
					-- Note that if we have no data for the user, it counts as "not home".
					local uh = ( ( ishome.users[v] or {} ).ishome or 0 ) ~= 0
					if op == "is not" and not uh then return v,true end
					if op == "is" and uh then return v,true end
				end
			end
			return "",false
		end

	else
		L({level=2,msg="Sensor %1 (%2) unknown condition type %3 for cond %4 in group %5; fails."},
			tdev, luup.devices[tdev].description, cond.type, cond.id, grp.id)
		addEvent{ dev=tdev, event="condition", condition=cond.id,
			['type']=cond.type, ['error']="TROUBLE: unrecognized condition type" }
		sst.trouble = true
		return nil,nil
	end

	-- If we fall through, return last value and state.
	return cs.lastvalue, cs.state -- luacheck: ignore 511
end

local function processCondition( cond, grp, cdata, tdev )
	D("processCondition(%1,%2,cdata,%3)", cond.id, (grp or {}).id, tdev)
	local sst = getSensorState( tdev )
	local now = sst.timebase
	local condopt = cond.options or {}

	-- Fetch prior state/value
	local cs = sst.condState[cond.id]
	if cs == nil then
		-- First time this condition is being evaluated.
		D("processCondition() new condition state for %1", cond.id)
		cs = { id=cond.id, statestamp=0, stateedge={}, valuestamp=0, evaledge={} }
		sst.condState[cond.id] = cs
	end

	-- Evaluate for state and value
	local newvalue, state, condTimer = evaluateCondition( cond, grp, cdata, tdev )
	D("processCondition() group %1 cond %2 result %3 timer %4", (grp or {}).id,
		cond.id, state, condTimer)
	if condTimer then L({level=2,msg="Condition %1 in %2 returns true condition timer!"}, cond, grp.name or grp.id ) end
	if state == nil then return newvalue, nil end -- as if it doesn't exist

	-- Preserve the result of the condition eval. We are edge-triggered,
	-- so only save changes, with timestamp.
	if state ~= cs.laststate then
		D("processCondition() recording %1 state change", cond.id)
		-- ??? At certain times, Vera gets a time that is in the future, or so it appears. It looks like the TZ offset isn't applied, randomly.
		-- Maybe if call is during ntp update, don't know. Investigating... This log message helps detection and analysis.
		if now < ( cs.statestamp or 0 ) then L({level=1,msg="Time moved backwards! Sensor %4 cond %1 last change at %2, but time now %3"}, cond.id, cs.statestamp, now, tdev) end
		addEvent{ dev=tdev,
			msg="%(cname)s test state changed from %(oldState)q to %(newState)q",
			cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
			event='condchange',cond=cond.id,oldState=cs.laststate,newState=state }
		cs.laststate = state
		cs.statestamp = now
		cs.stateedge = cs.stateedge or {}
		cs.stateedge[state and "t" or "f"] = now
		if ( condopt.repeatcount or 0 ) > 1 then
			if state then
				-- If condition now true and counting repeats, append time to list and prune
				cs.repeats = cs.repeats or {}
				table.insert( cs.repeats, now )
				while #cs.repeats > condopt.repeatcount do table.remove( cs.repeats, 1 ) end
			end
		else
			cs.repeats = nil
		end
	end

	-- Save actual current value if changed (for status display), and when it changed.
	if newvalue ~= cs.lastvalue then
		cs.priorvalue = cs.lastvalue
		cs.lastvalue = newvalue
		cs.valuestamp = now
	end

	-- Check for predecessor/sequence
	if state and ( condopt.after or "" ) ~= "" then
		-- Sequence; this condition must become true after named sequence becomes true
		local predCond = findCondition( condopt.after, cdata )
		if predCond == nil then
			L({level=1,msg="%1 (#%2) group %3 condition %4 uses sequence, but predecessor condition %5 not found (deleted?)"},
				luup.devices[tdev].description, tdev, grp.id, cond.id, condopt.after)
			addEvent{ dev=tdev, event="condition", condition=cond.id,
				predecessor=condopt.after, ['error']="TROUBLE: predecessor condition not found" }
			sst.trouble = true
			return newvalue,nil
		else
			local predState = sst.condState[ predCond.id ]
			D("evaluateCondition() testing predecessor %1 state %2", predCond, predState)
			if predState == nil then
				L({level=2,msg="Condition %1 can't meet sequence requirement, condition %2 missing!"}, cond.id, condopt.after)
				addEvent{ dev=tdev, event="condition", condition=cond.id, ['error']="TROUBLE: predecessor condition state not be found" }
				sst.trouble = true
				return newvalue,nil
			else
				local age = cs.statestamp - predState.statestamp
				local window = condopt.aftertime or 0
				local predstate = ( condopt.aftermode or 0 ) ~= 0 or predState.evalstate
				-- To clear, pred must be true, pred's true precedes our true, and if window, age within window
				D("evaluateCondition() pred %1, window %2, age %3", predCond.id, window, age)
				if not ( predstate and age >= 0 and ( window==0 or age <= window ) ) then
					D("evaluateCondition() didn't meet sequence requirement %1 after %2(=%3) mode %6 within %4 (%5 ago)",
						cond.id, predCond.id, predState.evalstate, condopt.aftertime or "any", age,
						condopt.aftermode or 0)
					addEvent{ dev=tdev, msg="%(cname)s predecessor condition restriction not met",
						cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
						cond=cond.id }
					state = false
				end
			end
		end
	end

	if state and ( condopt.repeatcount or 0 ) > 1 then
		-- Repeat count over duration (don't need hasTimer, it's leading-edge-driven)
		-- The repeats array contains the most recent repeatcount (or fewer) timestamps
		-- of when the condition was met. If (a) the array has the required number of
		-- events, and (b) the delta from the first to now is <= the repeat window, we're
		-- true.
		D("processCondition() cond %1 repeat check %2x in %3s from %4", cond.id,
			condopt.repeatcount, condopt.repeatwithin, cs.repeats)
		cs.repeats = cs.repeats or {}
		addEvent{ dev=tdev, msg="%(cname)s repeat restriction %(count)s in %(dur)s; so far %(n)s in %(age)s",
			cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
			cond=cond.id, count=condopt.repeatcount, dur=condopt.repeatwithin,
			n=#cs.repeats, age=#cs.repeats > 0 and now-cs.repeats[1] or "n/a" }
		if #( cs.repeats or {} ) < condopt.repeatcount then
			-- Not enough samples yet
			state = false
		elseif ( now - cs.repeats[1] ) > ( condopt.repeatwithin or 60 ) then
			-- Gap between first sample and now too long
			D("processCondition() cond %1 repeated %2x in %3s--too long!",
				cond.id, #cs.repeats, now - cs.repeats[1])
			state = false
		else
			D("processCondition() cond %1 repeated %2x in %3s (seeking %4 within %5, good!)",
				cond.id, #cs.repeats, now-cs.repeats[1], condopt.repeatcount, condopt.repeatwithin)
		end
	elseif ( condopt.duration or 0 ) > 0 then
		-- Duration restriction?
		-- Age is seconds since last state change.
		local op = condopt.duration_op or "ge"
		if op == "lt" then
			-- If duration < X, then eval is true only if last true interval
			-- lasted less than X seconds, meaning, we act when the condition goes
			-- false, checking the "back interval".
			if not state then
				local age = (cs.stateedge.f or now) - (cs.stateedge.t or 0)
				state = age < condopt.duration
				addEvent{ dev=tdev,
					msg="%(cname)s was true for %(age)s seconds, did%(not)s meet < %(dur)s second restriction",
					cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
					cond=cond.id, age=age, dur=condopt.duration, ['not']=state and "" or " not" }
				D("processCondition() cond %1 was true for %2, limit is %3, state now %4", cond.id,
					age, condopt.duration, state)
			else
				-- Not ready yet.
				addEvent{ dev=tdev, msg="$(cname)s holding evaluation state for check that duration < %(dur)s",
					cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
					cond=cond.id, dur=condopt.duration }
				D("processCondition() cond %1 duration < %2, not ready yet", cond.id, condopt.duration)
				state = false
			end
			cs.waituntil = nil
		elseif state then
			-- Handle "at least" duration. Eval true only when sustained for period
			local age = now - cs.statestamp
			if age < condopt.duration then
				D("processCondition() cond %1 suppressed, age %2, has not yet met duration %3",
					cond.id, age, condopt.duration)
				state = false
				cs.waituntil = cs.statestamp + condopt.duration
				local rem = math.max( 1, condopt.duration - age )
				scheduleDelay( tostring(tdev), rem )
				addEvent{ dev=tdev,
					msg="%(cname)s holding evaluation state for check that duration >= %(dur)s (%(rem)s to go)",
					cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
					cond=cond.id, dur=condopt.duration, rem=rem }
			else
				addEvent{ dev=tdev,
					msg="%(cname)s successfully sustained for at least %(dur)s seconds (actual %(age)s)",
					cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
					cond=cond.id, dur=condopt.duration, age=age }
				D("processCondition() cond %1 age %2 (>=%3) success", cond.id, age, condopt.duration)
				cs.waituntil = nil
			end
		else
			cs.waituntil = nil
		end
	else
		cs.waituntil = nil
	end

	-- Pulsed output (timed reset). Pulse is held even if underlying drops out.
	if ( condopt.pulsetime or 0 ) > 0 then
		D("processCondition() pulse time %1 state %2 evalstate %3", condopt.pulsetime, state, cs.evalstate)
		local pulseend
		if state and not cs.evalstate then
			-- Starting new pulse... or are we...
			pulseend = cs.pulseuntil or ( now + condopt.pulsetime )
			if not cs.pulseuntil then cs.pulsecount = 1 end
		else
			-- Continuing from last true edge (even if state false)
			pulseend = ( (cs.evaledge or {}).t or 0 ) + condopt.pulsetime
		end
		D("processCondition() pulseend is %1 (pulsing %2), cs.pulseuntil is %3", pulseend, now < pulseend, cs.pulseuntil)
		if now < pulseend then
			D("processCondition() continue pulse until %1", pulseend)
			state = true -- hold up unconditionally
			cs.pulseuntil = pulseend
			scheduleDelay( tostring(tdev), pulseend - now )
			addEvent{ dev=tdev,
				msg="%(cname)s timing output pulse, %(delay)s seconds remain",
				cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
				cond=cond.id, delay=pulseend-now }
		else
			-- Passed, but keep pulseuntil around until (real) test state goes false
			D("processCondition() pulse off phase (%1)", state)
			if state then
				addEvent{ dev=tdev,
					msg="%(cname)s end of pulse",
					cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
					cond=cond.id }
				if cs.pulseuntil and (condopt.pulsebreak or 0) > 0 then
					local holdoff = pulseend + condopt.pulsebreak
					D("processCondition() pulse repeat, break until %1", holdoff)
					if now >= holdoff then
						local pulselim = condopt.pulsecount or 0
						if pulselim == 0 or ( cs.pulsecount or 1 ) < pulselim then
							-- Start another pulse cycle
							cs.pulsecount = ( cs.pulsecount or 1 ) + 1
							D("processCondition() pulse repeat starting new on cycle (%1/%2)",
								cs.pulsecount, pulselim)
							cs.pulseuntil = now + condopt.pulsetime
							scheduleDelay( tostring(tdev), condopt.pulsetime )
							state = true -- override
						else
							D("processCondition() pulse count limit reached (%1/%2)", cs.pulsecount, pulselim)
							state = false -- override
						end
					else
						D("processCondition() pulse repeat holding in break")
						-- leave pulseuntil alone
						scheduleDelay( tostring(tdev), holdoff - now )
						state = false -- override
					end
				else
					-- One-shot pulse.
					cs.pulseuntil = state and pulseend or nil
					cs.pulsecount = nil
					state = false -- override
				end
			else
				cs.pulseuntil = nil
				cs.pulsecount = nil
			end
		end
		D("processCondition() pulse state is %1, until %2", state, cs.pulseuntil)
	else
		cs.pulseuntil = nil
		cs.pulsecount = nil
	end

	-- Hold time (delay reset)
	if ( condopt.holdtime or 0 ) > 0 then
		-- If trying to go false, make sure hold time is honored.
		D("processCondition() hold time %1, going %2 to %3", condopt.holdtime, cs.evalstate, state)
		if cs.evalstate and not state then
			-- Hold time extends from false edge, so repeated true-false-true-false extends time
			local lastFalse = cs.stateedge.f or now
			D("processCondition() reset edge last %1 (from %2)", lastFalse, cs.stateedge)
			local holdend = lastFalse + condopt.holdtime
			if holdend > now then
				D("processCondition() continue reset delay until %1", cs.holduntil)
				state = true
				cs.holduntil = holdend
				scheduleDelay( tostring(tdev), holdend - now )
				addEvent{ dev=tdev,
					msg="%(cname)s evaluation state reset delayed %(delay)s more seconds",
					cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
					cond=cond.id, delay=holdend-now }
			else
				-- OK to reset
				D("processCondition() OK to reset, after %1", cs.holduntil)
				addEvent{ dev=tdev,
					msg="%(cname)s reset delay has now expired",
					cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
					cond=cond.id }
				cs.holduntil = nil
			end
		else
			cs.holduntil = nil
		end
	else
		cs.holduntil = nil
	end

	-- Latching option. When latched, a condition that goes true remains true until the
	-- ReactorSensor untrips (another non-latched condition goes false), even if its
	-- other test conditions are no longer met.
	if ( condopt.latch or 0 ) ~= 0 then
		D("processCondition() latching option, evalstate %1, state %2, latched %3", cs.evalstate, state, cs.latched)
		cs.latchstate = state -- save actual last state
		if not state then
			if cs.latched then
				-- Attempting to transition from true to false while latched. Override.
				addEvent{ dev=tdev,
					msg="%(cname)s latched true; no change to evalstate",
					cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
					cond=cond.id }
				state = true
			else
				cs.latched = nil -- false wipes
				cs.latchstate = nil
			end
		else
			cs.latched = true
		end
	else
		cs.latched = nil -- remove flag
	end

	-- Save the final determination of state for this condition.
	cs.evaledge = cs.evaledge or {}
	if state ~= cs.evalstate then
		addEvent{dev=tdev,
			msg="%(cname)s evaluation state changed from %(oldState)q to %(newState)q",
			cname=(cond.type or "group")=="group" and ("Group "..(cond.name or cond.id)) or ("Condition "..cond.id),
			event='evalchange',cond=cond.id,oldState=cs.evalstate,newState=state}
		cs.evalstate = state
		cs.evalstamp = now
		cs.evaledge[ state and "t" or "f" ] = now
		cs.changed = true
		if state then cs.matchcount = (cs.matchcount or 0) + 1 end
	else
		cs.evaledge[ state and "t" or "f" ] = cs.evalstamp -- force
		cs.changed = nil
	end

	return cs.lastvalue, state, condTimer
end

-- Evaluate a condition (which may be a group).
evaluateGroup = function( grp, parentGroup, cdata, tdev )
	D("evaluateGroup(%1,%2,cdata,%3)", grp.id, (parentGroup or {}).id, tdev)
	if (grp.disabled or 0) ~= 0 then return false, nil end -- nil state means no data
	local passed = nil
	local latched = {}
	local hasTimer = false
	local nTrue = 0
	for ix,cond in ipairs( grp.conditions or {} ) do
		D("evaluateGroup() process %3 #%1/%2: %4 %5", ix, #grp.conditions, grp.id, cond.type, cond.id )
		local _, state, condTimer = processCondition( cond, grp, cdata, tdev )
		if condTimer then L({level=2,msg="Condition %1 in %2 returns true condition timer!"}, cond, grp.name or grp.id ) end
		if state ~= nil then
			hasTimer = condTimer or hasTimer

			-- Accumulate latched conditions for this group.
			if ( ( cond.options or {} ).latch or 0 ) ~= 0 then
				table.insert( latched, cond.id )
			end

			-- And apply to ongoing group state
			if grp.operator == "nul" then
				-- ignore
			elseif passed == nil then
				passed = state
			elseif grp.operator == "xor" then
				passed = passed -- irrelevant, see below
			elseif grp.operator == "or" then
				passed = passed or state
			else -- default "and"
				passed = passed and state
			end
			if state then nTrue = nTrue + 1 end
		end
		D("evaluateGroup() result %3 #%1/%2: %4 %5 = %6; passed %7", ix, #grp.conditions, grp.id, cond.type, cond.id, state, passed )
	end
	-- Special handling for XOR, which in our context means "1 and only 1 true"
	if grp.operator == "xor" and passed ~= nil then
		passed = nTrue == 1
	end

	-- Save group state.
	if grp.invert and passed ~= nil then passed = not passed end
	if passed == false and #latched > 0 then -- but not nil
		-- Reset latched conditions when group resets
		resetLatched( grp.id, tdev )
	end

	return passed, passed, hasTimer -- allow pass of nil state for no data
end

-- Clear errors and show disabled state for disabled sensor.
local function showDisabled( tdev )
	assert( tdev ~= nil )
	setVar( RSSID, "Message", "Disabled", tdev )
	setVar( RSSID, "Trouble", "0", tdev )
	luup.set_failure( 0, tdev )
end

local function processSensorUpdate( tdev, sst )
	D("processSensorUpdate(%1)", tdev)
	local t1 = socket.gettime()
	addEvent{dev=tdev,event='update',msg="Sensor update starting"}

	-- Check throttling for update rate
	local hasTimer = false -- luacheck: ignore 311/hasTimer
	local maxUpdate = getVarNumeric( "MaxUpdateRate", 30, tdev, RSSID )
	local _, _, rate60 = rateLimit( sst.updateRate, maxUpdate, false )
	if maxUpdate == 0 or rate60 <= maxUpdate then
		rateBump( sst.updateRate )
		sst.updateThrottled = false

		-- Fetch the condition data.
		local cdata = getSensorConfig( tdev )
		-- if debugMode then luup.log( json.encode( cdata ), 2 ) end

		-- Reload sensor state if cache purged
		loadCleanState( tdev )

		local currTrip = (sst.condState.root or {}).evalstate or false
		local retrig = getVarBool( "Retrigger", false, tdev, RSSID )

		-- Mark a stable base of time
		local tt = getVarNumeric( "TestTime", 0, tdev, RSSID )
		if tt ~= 0 then addEvent{ dev=tdev, msg="Test time %(t)s", t=os.date("%Y-%m-%d %H:%M:%S", tt) } end
		sst.timebase = tt == 0 and os.time() or tt
		sst.timeparts = os.date("*t", sst.timebase)
		sst.timetest = tt > 0
		D("processSensorUpdate() base time is %1 (%2) testing=%3", sst.timebase, sst.timeparts, sst.timetest)

		-- Update state (if changed)
		updateVariables( cdata, tdev )

		local newTrip
		_,newTrip,hasTimer = processCondition( cdata.conditions.root, nil, cdata, tdev )
		if newTrip == nil then
			newTrip = false -- null from root equiv to false here
		end
		D("processSensorUpdate() root was %1 now %2, retrig %3", currTrip, newTrip, retrig)

		-- Save the condition state immediately. This helps the status UI show more
		-- crisply.
		sst.condState.lastUsed = os.time()
		luup.variable_set( RSSID, "cstate", json.encode(sst.condState), tdev )

		-- Update runtime based on last status
		local now = os.time()
		if currTrip then
			-- Update accumulated trip time
			local delta = math.max( 0, now - getVarNumeric( "lastacc", now, tdev, RSSID ) )
			-- If not changing state, require >5s delta before update, to dampen
			-- update cycles for RSs that watch their own Runtime. Always update
			-- when newTrip false and currTrip true (changing tripped state).
			if delta > 5 or not newTrip then
				local rt = delta + getVarNumeric( "Runtime", 0, tdev, RSSID )
				D("processSensorUpdate() currently tripped, adding %1 seconds to runtime, now total %2", delta, rt)
				setVar( RSSID, "Runtime", rt, tdev )
				setVar( RSSID, "lastacc", now, tdev )
			end
		else
			-- Update on each false/untrip result, too.
			setVar( RSSID, "lastacc", now, tdev )
		end

		-- Pass through groups again, and run activities for any changed groups.
		-- "root" group is handled as any other group now, unless UseLegacyTripBehavior is true,
		-- in which case it's handled by trip() below.
		D("processSensorUpdate() checking groups for state changes")
		local gs
		for grp in conditionGroups( cdata.conditions.root ) do
			D("processSensorUpdate() checking group %1 for state change", grp.id)
			gs = sst.condState[ grp.id ] or {}
			if gs.changed and 0 == (grp.disabled or 0) and
					not ( grp.id == "root" and getVarBool( "UseLegacyTripBehavior", false, tdev, RSSID ) ) then
				local activity = grp.id .. ( gs.evalstate and ".true" or ".false" )
				D("processSensorUpdate() group %1 <%2> state changed to %3, looking for activity %4",
					grp.name or grp.id, grp.id, gs.evalstate, activity)
				local scd = getSceneData( activity, tdev )
				if not isSceneEmpty( scd ) then
					-- Note we only stop contra-actions if we have actions to perform.
					D("processSensorUpdate() running %1 activities", activity)
					addEvent{ dev=tdev, msg="Launching " .. tostring(grp.name or grp.id) ..
						( gs.evalstate and ".true" or ".false" ) .. " activity",
						activity=activity }
					local contra = grp.id .. ( gs.evalstate and ".false" or ".true" )
					stopScene( tdev, nil, tdev, contra )
					execScene( scd, tdev, { contextDevice=tdev, stopPriorScenes=false } )
				end
			end
			-- Update GroupState state variables here, after cstate is written.
			setVar( GRPSID, "GroupStatus_" .. tostring( grp.id ), gs.evalstate and "1" or "0", tdev )
		end

		-- Set tripped state based on change in status.
		D("processSensorUpdate() evaluating tripped state")
		gs = sst.condState.root or {}
		if gs.changed or currTrip ~= newTrip or ( newTrip and retrig ) then
			-- Changed, or retriggerable.
			local maxTrip = getVarNumeric( "MaxChangeRate", 10, tdev, RSSID )
			_, _, rate60 = rateLimit( sst.changeRate, maxTrip, false )
			if maxTrip == 0 or rate60 <= maxTrip then
				D("processSensorUpdate() new trippped state %1", newTrip)
				rateBump( sst.changeRate )
				sst.changeThrottled = false
				trip( newTrip, tdev )
			else
				if not sst.changeThrottled then
					L({level=2,msg="%2 (#%1) trip state changing too fast (%4 > %3/min)! Throttling..."},
						tdev, luup.devices[tdev].description, maxTrip, rate60)
					sst.changeThrottled = true
					sst.trouble = true
					addEvent{dev=tdev,event='throttle',['type']='change',rate=rate60,limit=maxTrip}
					setMessage( "Throttled! (high change rate)", tdev )
				end
				hasTimer = true -- force, so sensor gets checked later
			end
		end
		if not sst.changeThrottled then
			setMessage( newTrip and "Tripped" or "Not tripped", tdev )
		end
	else
		if not sst.updateThrottled then
			L({level=2,msg="%2 (#%1) updating too fast (%4 > %3/min)! Throttling..."},
				tdev, luup.devices[tdev].description, maxUpdate, rate60)
			setMessage( "Throttled! (high update rate)", tdev )
			sst.updateThrottled = true
			sst.trouble = true
			addEvent{dev=tdev,event='throttle',['type']='update',rate=rate60,limit=maxUpdate}
		end
		hasTimer = true -- force, so sensor gets checked later.
	end

	-- Trouble?
	D("processSensorUpdate() trouble %1", sst.trouble)
	setVar( RSSID, "Trouble", sst.trouble and "1" or "0", tdev )
	if getVarBool( "FailOnTrouble", false, tdev, RSSID ) then
		luup.set_failure( sst.trouble and 1 or 0, tdev )
	end

	-- No need to reschedule timer if no demand. Condition may have rescheduled
	-- itself (no need to set hasTimer), so at the moment, hasTimer is only used
	-- for throttle recovery.
	if hasTimer or getVarBool( "ContinuousTimer", false, tdev, RSSID ) then
		D("processSensorUpdate() hasTimer or ContinuousTimer, scheduling update")
		local v = ( 60 - ( os.time() % 60 ) ) + TICKOFFS
		scheduleDelay( tdev, v )
	end

	sst.isRestart = nil -- not false, remove it

	local t2 = socket.gettime()
	addEvent{dev=tdev,event='update',msg="Sensor update completed; %(dtime)ss",
		dtime=string.format("%.3f", t2-t1)}

	D("processSensorUpdate() finished")
end

-- Perform update tasks
local function updateSensor( tdev )
	D("updateSensor(%1) %2", tdev, luup.devices[tdev].description)

	-- If not enabled, no work to do.
	if not isEnabled( tdev ) then
		D("updateSensor() disabled; no action")
		return showDisabled( tdev )
	end

	local sst = getSensorState( tdev )

	if sst.updating then
		-- If already updating, schedule deferred update; each attempt extends.
		D("updateSensor() update in progress; queueing deferred update")
		scheduleDelay( tdev, getVarNumeric( "RescanDelay", 0, pluginDevice, MYSID ), { replace=true } )
		return
	end
	sst.updating = true
	sst.trouble = false -- presumption of innocence
	local success,err = pcall( processSensorUpdate, tdev, sst )
	sst.updating = false
	if not success then
		L({level=1,msg="Sensor update failed: %1"}, err)
		addEvent{ dev=tdev, msg="FAILED: %(err)s", err=err }
	end
end

local function sensorTick( tdev)
	D("sensorTick(%1)", tdev)

	-- updateSensor will schedule next tick if needed
	if isEnabled( tdev ) then
		updateSensor( tdev )
	else
		showDisabled( tdev )
	end
end

-- Get the house mode tracker. If it doesn't exist, create it (child device).
-- No HMT on openLuup because it doesn't have native device file to support it,
-- but we can watch the HouseMode state variable on the openLuup device there,
-- which is what Vera should have done in the first place.
local function getHouseModeTracker( createit, pdev )
	if not isOpenLuup then
		for k,v in childDevices( pdev ) do
			if v.id == "hmt" then
				return k, v -- got it
			end
		end
		-- Didn't find it. At this point, we have a list of children.
		if createit then
			-- Didn't find it. Need to create a new child device for it. Sigh.
			L{level=2,msg="Did not find house mode tracker; creating. This will cause a Luup reload."}
			local ptr = luup.chdev.start( pdev )
			luup.variable_set( MYSID, "Message", "Adding house mode tracker, please wait...", pdev )
			for k,v in childDevices( pdev ) do
				D("getHouseModeTracker() appending existing device %1 (%2)", v.id, v.description)
				luup.chdev.append( pdev, ptr, v.id, v.description, v.device_type,
					luup.attr_get( 'device_file', k ) or "",
					luup.attr_get( 'impl_file', k ) or "", "", false )
			end
			D("getHouseModeTracker() creating hmt child; final step before reload.")
			luup.chdev.append( pdev, ptr, "hmt", "Reactor Internal HMT", "", "D_DoorSensor1.xml", "", "", false )
			luup.chdev.sync( pdev, ptr )
			-- Should cause reload immediately. Drop through.
		end
	end
	return false
end

-- Update geofence data. This is long-running, so runs as a job from the master tick.
local function updateGeofences( pdev )
	D("updateGeofences(%1)", pdev)
	local now = os.time()
	-- Geofencing. If flag on, at least one sensor is using geofencing. Fetch
	-- userdata, which can be very large. Shame that it comes back as JSON-
	-- formatted text that we need to decode; I'm sure the action had to encode
	-- it that way, and all we're going to do is decode back.
	local forcedMode = getVarNumeric( "ForceGeofenceMode", 0, pdev, MYSID ) -- N.B. NOT BOOL!
	if forcedMode ~= 0 then
		geofenceMode = forcedMode
	end
	-- Get data.
	local ishome = getVarJSON( "IsHome", {}, pdev, MYSID )
	if type(ishome) ~= "table" then
		D("actionUpdateGeofences() IsHome data type invalid (%1)", type(ishome))
		L{level=2,msg="IsHome data invalid/corrupt; resetting."}
		ishome = { version=2, users={} }
	end
	if ishome.version ~= 2 then
		L({level=2,msg="resetting IsHome data, old version %1"}, ishome.version)
		ishome = { version=2, users={} }
	end
	local rc,rs,ra
	if unsafeLua and getVarBool( "UserDataWget", true, pdev, MYSID ) then
		-- As of 3.4, we wget() with ns=1 to shorten response, faster.
		-- URL with port sub is OK here because geofencing is not on openLuup
		rc,ra,rs = luup.inet.wget( 'http://127.0.0.1/port_3480/data_request?id=user_data&ns=1' )
		if rc ~= 0 or ra == nil then
			L({level=2,msg="Unable to fetch userdata for geofence check! wget rc=%1, rs=%2"}, rc, rs)
			return false
		end
		D("updateGeofences() user_data request (wget) returned %1 bytes", #ra)
	else
		rc,rs,_,ra = luup.call_action( "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "GetUserData", { DataFormat="json" }, 0 ) -- luacheck: ignore 311
		-- D("actionUpdateGeofences() GetUserData action returned rc=%1, rs=%2, ra=%3", rc, rs, ra)
		if rc ~= 0 or (ra or {}).UserData == nil then
			L({level=2,msg="Unable to fetch userdata for geofence check! action rc=%1, ra=%2"}, rc, ra)
			return false
		end
		ra = tostring( ra.UserData )
		D("updateGeofences() action GetUserData returned %1 bytes", #ra)
	end
	local ud
	-- If mode > 0, we're only using home condition, so only need short
	-- decode of that we need, rather than all of user_data, which is
	-- massive even on small installations.
	if geofenceMode >= 0 then
		local mm = ra:match( '("users_settings": *%[[^]]*%])' )
		if mm then
			D("updateGeofences() found element in UserData (%1 bytes); using short decode", #ra)
			ud = json.decode( '{' .. mm .. '}' )
		end
	end
	if ud == nil then
		D("updateGeofences() doing full decode on UserData, %1 bytes", #ra)
		ud = json.decode( ra )
	end
	ra = nil -- luacheck: ignore 311
	if ud then
		-- Save the source data so we have it to look at in Logic Summary.
		local dd = { mode=geofenceMode, ['updated']=now, ['users_settings']=ud.users_settings,
			['users']=ud.users, ['usergeofences']=ud.usergeofences }
		setVar( MYSID, 'raw_udgeo', json.encode( dd ), pluginDevice )
		-- ud.users is array of usergeofence, which is { id, Name, Level, IsGuest }
		-- ud.usergeofences is array of { iduser, geotags } and geotags is
		--     { PK_User (same as id), id (of geotag), accuracy, ishome, notify, radius, address, color (hex6), latitude, longitude, name (of geotag), status, and poss others? }
		-- ud.users_settings contains the "ishome" we care about, though.
		local changed = false
		if geofenceMode < 0 then
			-- Long form geofence check.
			D("updateGeofences() doing long form geofence check with %1", ud.usergeofences)
			for _,v in ipairs( ud.usergeofences or {} ) do
				if not ishome.users[tostring(v.iduser)] then
					-- New user listed
					L("Detected geofence change: new user %1", v.iduser)
					ishome.users[tostring(v.iduser)] = { ishome=0, tags={} }
					changed = true
				end
				local urec = ishome.users[tostring(v.iduser)]
				local inlist = {}
				if urec.tags == nil then urec.tags = {} end
				local oldtags = shallowCopy( urec.tags )
				local newhome, newhomestate
				for _,g in ipairs( v.geotags or {} ) do
					local st = ( { ['enter']='in',['exit']='out' } )[tostring( g.status ):lower()] or g.status or ""
					local tag = urec.tags[tostring(g.id)]
					if tag then
						-- Update known geotag
						if st ~= tag.status then
							L("Detected geofence change: user %1 status %2 for %3 (%4) %5",
								v.iduser, st, g.name, g.id, g.ishome)
							tag.status = st
							tag.since = now
							changed = true
						end
						-- Update remaining fields, but don't mark changed.
						changed = changed or ( tag.name ~= g.name )
						tag.name = g.name
						changed = changed or ( tag.homeloc ~= ( g.ishome or 0 ) )
						tag.homeloc = g.ishome or 0
						oldtags[tostring(g.id)] = nil -- remove from old
					else
						-- New geotag
						urec.tags[tostring(g.id)] = { id=g.id, name=g.name, homeloc=g.ishome or 0, status=st, since=now }
						L("Detected geofence change: user %1 has added %2 (%3) %4 %5",
							v.iduser, g.name, g.id, g.ishome, st)
						changed = true
					end
					if ( g.ishome or 0 ) ~= 0 then
						newhome = g.id
						if st == "in" then newhomestate = 1
						elseif st == "out" then newhomestate = 0
						end
					end
					if st == "in" then table.insert( inlist, g.id ) end
				end
				urec.inlist = inlist
				if newhome ~= urec.homeid then
					urec.homeid = newhome
					changed = true
				end
				if newhomestate ~= urec.ishome then
					urec.ishome = newhomestate
					changed = true
				end
				-- Handle geotags that have been removed
				for k,g in pairs( oldtags ) do
					L("Detected geofence change: user %1 deleted %2 (%3) %4",
						v.iduser, g.name, g.id, g.ishome)
					urec.tags[k] = nil
					changed = true
				end
				if changed then urec.since = now end
			end
		else
			-- If not in long mode, clear minimal data, in case mode switches
			-- back. This can happen if groups temporarily disabled, etc.
			-- This preserves timestamps and data.
			for _,v in pairs( ishome.users or {} ) do
				if v.inlist then
					v.inlist = nil -- not relevant in short mode, safe to clear.
					changed = true
				end
			end

			-- Now do short-form check.
			D("actionUpdateGeofences() user home status=%1", ud.users_settings)
			-- Short form check stands alone or amends long form for home status.
			local ulist = map( getKeys( ishome.users ) )
			for _,v in ipairs( ud.users_settings or {} ) do
				local urec = ishome.users[tostring(v.id)]
				if urec then
					local newhome = v.ishome
					if urec.ishome ~= newhome then
						L("Detected geofence change: user %1 now " ..
							( ( newhome ~= 0 ) and "home" or "not home"), v.id)
						urec.since = now
						changed = true
					end
					urec.ishome = newhome
					ulist[tostring(v.id)] = nil
					if changed then urec.since = now end
				else
					L("Detected geofence change: new user %1 ishome %2", v.id, v.ishome)
					urec = { ishome=v.ishome, tags={}, since=now }
					ishome.users[tostring(v.id)] = urec
					changed = true
				end
			end
			-- Handle users that weren't listed (treat as not home)
			for v,_ in pairs( ulist ) do
				if ishome.users[v].ishome then
					D("actionUpdateGeofences() user %1 not in users_settings, marking not home", v)
					ishome.users[v].ishome = nil
					ishome.users[v].since = now
					changed = true
				end
			end
		end

		-- Force update if geofenceMode has changed since last update.
		changed = changed or ishome.lastmode ~= geofenceMode
		ishome.lastmode = geofenceMode
		ishome.version = 2
		ishome.since = now
		D("updateGeofences() geofence data changed=%1, data=%2", changed, ishome)
		if changed then
			setVar( MYSID, "IsHome", json.encode( ishome ), pdev )
		end
	else
		L{level=2,msg="Failed to decode userdata for geofence check!"}
		return false
	end
	D"updateGeofences() done"
	return true
end

-- Tick handler for master device
local function masterTick(pdev)
	D("masterTick(%1)", pdev)
	assert(pdev == pluginDevice)
	local now = os.time()
	local nextTick = math.floor( now / 60 ) * 60 + 60
	scheduleTick( tostring(pdev), nextTick )

	-- Check and update house mode (by polling, always).
	setVar( MYSID, "HouseMode", luup.attr_get( "Mode", 0 ) or "1", pdev )
	if usesHouseMode and not isOpenLuup then
		-- Find housemode tracking child for Vera. Create it if it doesn't exist.
		local hmt = getHouseModeTracker( true, pdev )
		if hmt then
			addServiceWatch( hmt, SENSOR_SID, "Armed", pdev )
		end
	end

	-- Vera Secure has battery, check it.
	if hasBattery then
		pcall( checkSystemBattery, pdev )
	end

	-- Check DST change. Re-eval all conditions if changed, just to be safe.
	local dot = os.date("*t").isdst and "1" or "0"
	local lastdst = getReactorVar( "LastDST", "", pdev )
	D("masterTick() current DST %1, last %2", dot, lastdst)
	if dot ~= lastdst then
		L({level=2,msg="DST change detected! Re-evaluating children."})
		luup.variable_set( MYSID, "LastDST", dot, pdev )
		for k,v in pairs(luup.devices) do
			if v.device_type == RSTYPE and v.device_num_parent == pdev then
				if isEnabled( k ) then
					-- Use tick rather than Restart action to preserve state. It's just a re-eval.
					scheduleDelay( { id=tostring(k), info="DST_Change" } , 0, { replace=true } )
				end
			end
		end
	end

	-- Geofencing. If flag on, at least one sensor is using geofencing.
	-- N.B. ForceGeofenceMode is NOT BOOL!
	if geofenceMode ~= 0 or getVarNumeric( "ForceGeofenceMode", 0, pdev, MYSID ) ~= 0 then
		-- Getting geofence data can be a long-running task because of handling
		-- userdata, so run as a job, unless using LPeg. LPeg considerably speeds up parsing so
		-- we can do the task inline.
		if json and json.using_lpeg and not getVarBool( "ForceGeofenceJob", false, pdev, MYSID ) == 0 then
			pcall( updateGeofences, pdev )
		else
			D("masterTick() geofence mode %1, launching geofence update as job", geofenceMode)
			geofenceEvent = geofenceEvent + 1
			local rc,rs,rj,ra = luup.call_action( MYSID, "UpdateGeofences", { event=geofenceEvent }, pdev ) -- luacheck: ignore 211
		end
	end

	-- See if any cached state has expired
	local expiry = getVarNumeric( "StateCacheExpiry", 600, pdev, MYSID )
	if expiry > 0 then
		for td,cx in pairs( sensorState or {} ) do
			local exover = getVarNumeric( "StateCacheExpiry", -1, tonumber(td) or -1, RSSID )
			if exover ~= 0 then
				local exp = ( ( cx.condState or {} ).lastUsed or now ) + ( ( exover > 0 ) and exover or expiry )
				-- If save time not there, the cache entry never expires.
				if exp <= now then
					D("masterTick() expiring state cache for %1", td)
					cx.condState = nil
					cx.ctx = nil
				end
			end
		end
	end
end

-- Clean up sensor variables
-- TODO: GetState seems to be faster than the request; test and verify, particularly openLuup
local function cleanSensorState( tdev, taskid )
	D("cleanSensorState(%1,%2)", tdev, taskid)
	local content
	if unsafeLua then
		local sc, httpStatus
		sc,content,httpStatus = luup.inet.wget( 'http://127.0.0.1:3480/data_request?id=status&DeviceNum='..tdev..'&output_format=json' )
		if sc ~= 0 then
			L({level=2,msg="Failed to complete status request for #%1 (%2, %3)"}, tdev, sc, httpStatus)
			content = false
		end
	end
	if not content then
		local rc,rs,_,ra = luup.call_action( "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "GetStatus", { DeviceNum=tdev, DataFormat="json" }, 0 ) -- luacheck: ignore 211
		-- D("cleanSensorState() Status action returned rc=%1, rs=%2, ra=%3", rc, rs, ra)
		if rc ~= 0 or (ra or {}).Status == nil then
			L({level=2,msg="GetStatus action failed for #%1; rc=%2, ra=%3"}, tdev, rc, ra)
		end
		content = (ra or {}).Status
	end
	local data = json.decode( content )
	if data and data['Device_Num_'..tdev] then
		data = data['Device_Num_'..tdev]
		local cf = getSensorConfig( tdev ) or error "Configuration not available"
		cf.variables = cf.variables or {}
		local groups = {}
		for grp in conditionGroups( cf.conditions.root or {} ) do
			groups[grp.id] = grp
		end
		for _,st in pairs( data.states ) do
			if st.service == VARSID then
				-- Expression default is *export*
				if ((cf.variables[st.variable] or {}).export or 1) == 0 then
					D("cleanSensorState() removing orphan expression export %1 from #%2", st.variable, tdev)
					deleteVar( st.service, st.variable, tdev )
					deleteVar( st.service, st.variable .. "_Error", tdev )
				end
			elseif st.service == GRPSID then
				local gid = st.variable:gsub( "^GroupStatus_", "" )
				if not ( groups[gid] and groups[gid].operator ~= "nul" ) then
					D("cleanSensorState() removing orphan group state %1 from #%2", st.variable, tdev)
					deleteVar( st.service, st.variable, tdev )
				end
			end
		end
	else
		L({level=2,msg="cleanSensorState() return data unusable: %1"}, data or content)
	end
	clearTask( taskid )
end

-- Start an instance
local function startSensor( tdev, pdev, isReload )
	D("startSensor(%1,%2) <9c6c9aa0-1060-11ea-b3de-9303e5fab7a5>", tdev, pdev) -- DO NOT modify string--used for log snippet

	-- Open event log if needed
	local sst = getSensorState( tdev )
	local path = getInstallPath() .. "ReactorSensor" .. tostring(tdev) .. "-events.log"
	if getVarBool( "LogEventsToFile", false, tdev, RSSID ) then
		if not sst.eventLog then
			local err,errno
			D("startSensor() opening event log file %1", path)
			sst.eventLog,err,errno = io.open( path, "a" )
			if not sst.eventLog then
				L("Failed to open event log for %1 (%2): %4 (%5) %3", luup.devices[tdev].description, tdev, path, err, errno)
			else
				if sst.eventLog:seek("end") > ( 1024*getVarNumeric( "EventLogMaxKB", 256, tdev, RSSID ) ) then
					L("Rotating event log...")
					sst.eventLog:close()
					os.execute( "pluto-lzo c '" .. path .. "' '" .. path .. ".lzo'" )
					sst.eventLog = io.open( "path", "w" )
				end
				if sst.eventLog:seek() == 0 then
					sst.eventLog:write( os.date("%Y-%m-%d %H:%M:%S") .. ": New log file started\n" )
				else
					sst.eventLog:write( os.date("%Y-%m-%d %H:%M:%S") .. ": Log reopened\n" )
				end
			end
		end
	else
		os.remove( path )
		D("startSensor() event log file disabled for this RS")
	end

	-- Device one-time initialization
	sensor_runOnce( tdev )

	-- Save required UI version for collision detection.
	setVar( RSSID, "_UIV", _UIVERSION, tdev )

	-- Initialize instance data; take care not to scrub eventList
	sst.eventList = sst.eventList or {}
	sst.configData = nil
	sst.condState = nil
	sst.updateRate = initRate( 60, 15 )
	sst.updateThrottled = false
	sst.changeRate = initRate( 60, 15 )
	sst.changeThrottled = false
	sst.isRestart = true -- cleared by processSensorUpdate

	if isEnabled( tdev ) then
		addEvent{ dev=tdev, msg=isReload and "Starting (Luup Startup/Reload)" or "Restarting", event='start' }
		setMessage("Starting...", tdev)

		-- Load the config data.
		getSensorConfig( tdev, true )

		-- Clean and restore our condition state.
		loadCleanState( tdev )

		-- Watch our own cdata; when it changes, re-evaluate.
		-- NOTE: MUST BE *AFTER* INITIAL LOAD OF CDATA
		addServiceWatch( tdev, RSSID, "cdata", tdev )
		addServiceWatch( tdev, RSSID, "TestTime", tdev )
		addServiceWatch( tdev, RSSID, "TestHouseMode", tdev )

		-- Start tick
		scheduleDelay( { id=tostring(tdev), owner=tdev, func=sensorTick }, 1, { replace=true } )
	else
		L({level=2,"%1 (#%2) is disabled"}, luup.devices[tdev].description, tdev)
		addEvent{ dev=tdev, msg="Aborting; disabled", event='disabled at start-up' }
		showDisabled( tdev )
	end
	return true
end

local function startSensors( pdev )
	L("Starting ReactorSensors")
	luup.variable_set( MYSID, "Message", "Starting ReactorSensors...", pdev )

	-- Start the master tick
	local tt = math.floor( os.time() / 60 + 1 ) * 60 -- next minute
	scheduleTick( { id=tostring(pdev), func=masterTick, owner=pdev }, tt, { replace=true } )

	-- Resume any scenes that were running prior to restart
	resumeScenes( pdev )

	local isRecovery = getVarNumeric( "recoverymode", 0, pdev, MYSID ) ~= 0

	-- Ready to go. Start our children.
	local count = 0
	local started = 0
	for k,v in childDevices( pdev ) do
		if v.device_type == RSTYPE then
			count = count + 1
			L("Starting %1 (#%2)", luup.devices[k].description, k)
			setVar( MYSID, "Message", "Starting " .. luup.devices[k].description, pdev )
			if isRecovery then
				-- Recovery mode cleanups.
				setVar( RSSID, "cstate", "{}", k )
			end
			-- Clear notification flag
			setVar( RSSID, "_notify", "0", k )
			-- N.B. start sensor whether enabled or not, as key inits happen regardless.
			local status, err = pcall( startSensor, k, pdev, true )
			if not status then
				L({level=1,msg="%1 (#%2) failed to start: %3"}, luup.devices[k].description, k, err)
				addEvent{ dev=k, event="error", message="Start-up failed", reason=err }
				setMessage( "Failed (see log)", k )
				luup.set_failure( 1, k ) -- error on child device
			else
				luup.set_failure( 0, k )
				started = started + 1
				-- Start a cleanup job on this sensor
				if isEnabled( k ) then
					scheduleDelay( { id="clean"..k, owner=k, func=cleanSensorState }, 25 + 5*started )
				end
			end
		elseif v.id == "hmt" then
			D("startSensors() adding watch for hmt device #%1", k)
			luup.attr_set( "invisible", debugMode and 0 or 1, k )
			luup.attr_set( "hidden", debugMode and 0 or 1, k )
			luup.attr_set( "room", luup.attr_get( "room", pdev ) or "0", k )
			setVar( SENSOR_SID, "Tripped", "0", k )
			setHMTModeSetting( k )
			addServiceWatch( k, SENSOR_SID, "Armed", pdev )
		else
			L({level=2,msg="Child device #%1 (%2) is unrecognized type; ignoring! %3"},
				k, v.description or "nil", v)
		end
	end
	luup.variable_set( MYSID, "NumChildren", count, pdev )
	luup.variable_set( MYSID, "NumRunning", started, pdev )
	if count == 0 then
		luup.variable_set( MYSID, "Message", "Open control panel!", pdev )
	else
		luup.variable_set( MYSID, "Message", string.format("Started %d of %d at %s %s", started, count, fdate(), ftime()), pdev )
	end
end

local function waitSystemReady( pdev, taskid, callback )
	D("waitSystemReady(%1,%2,%3)", pdev, taskid, callback)
	if getVarNumeric( "SuppressSystemReadyCheck", 0, pdev, MYSID ) == 0 then
		for n,d in pairs(luup.devices) do
			if d.device_type == "urn:schemas-micasaverde-com:device:ZWaveNetwork:1" then
				local sysStatus = luup.variable_get( "urn:micasaverde-com:serviceId:ZWaveNetwork1", "NetStatusID", n )
				if sysStatus ~= nil and sysStatus ~= "1" then
					-- Z-Wave not yet ready
					L("Waiting for Z-Wave ready, status %1", sysStatus)
					scheduleDelay( taskid, 5 )
					return
				end
				break
			end
		end
		L("Z-Wave ready detected!")
	end
	systemReady = os.time() -- save when, more useful than just "true"
	if callback then pcall( callback, pdev ) end
	clearTask( taskid )
end

local function markChildrenDown( msg, pdev )
	for k,v in childDevices( pdev ) do
		if v.device_type == RSTYPE then
			luup.variable_set( RSSID, "Message", msg or "Stopped", k )
			luup.variable_set( RSSID, "Trouble", "1", k )
		end
	end
end

-- Start plugin running.
function startPlugin( pdev )
--[[
	local uilang = luup.attr_get('ui_lang', 0) or "en"
	local plang = getReactorVar( "lang", "" )
	if plang ~= "" then uilang = plang end
	i18n.loadFile("T_Reactor_i18n.json") -- Load default language package
	if uilang ~= "en" then
		local f = io.open("T_Reactor_i18n-" .. uilang .. ".json", "r")
		if not f then
			os.execute("curl -s https://raw.githubusercontent.com/toggledbits/Reactor/master/{T_Reactor_i18n-"..uilang..".json} -o '#1'")
		else f:close() end
		local success, err = pcall( i18n.loadFile, "T_Reactor_i18n-" .. uilang .. ".json" )
		if success then
			i18n.setLocale( uilang )
		end
	end
--]]
	if pluginDevice then
		error "This device is already started/running."
	end

	L("Plugin version %1 starting on #%2 (%3)", _PLUGIN_VERSION, pdev, luup.devices[pdev].description)
	luup.variable_set( MYSID, "NumRunning", "0", pdev )

	-- Early inits
	pluginDevice = pdev
	systemReady = false
	isALTUI = false
	isOpenLuup = false
	unsafeLua = true
	devVeraAlerts = false
	sensorState = {}
	watchData = {}
	sceneData = {}
	luaFunc = {}
	if getVarNumeric( "SuppressWeakLuaFunc", 0, pdev, MYSID ) == 0 then
		setmetatable( luaFunc, { __mode="v" } ) -- weak values
	end
	sceneWaiting = {}
	sceneState = {}
	luaEnv = nil
	runStamp = 1
	geofenceMode = getVarNumeric( "ForceGeofenceMode", 0, pdev, MYSID )
	geofenceEvent = 0
	usesHouseMode = false
	maxEvents = getVarNumeric( "MaxEvents", debugMode and 250 or 100, pdev, MYSID )

	math.randomseed( os.time() )

	-- Enabled?
	if getVarNumeric( "Enabled", 1, pdev, MYSID ) == 0 then
		luup.variable_set( MYSID, "Message", "DISABLED", pdev )
		markChildrenDown( "Reactor disabled", pdev )
		setVar( MYSID, "rs", "", pdev ) -- clear restart tracking
		setVar( MYSID, "recoverymode", 1, pdev )
		L{level=2,msg="Reactor has been disabled by configuration; startup aborted."}
		return false, "Disabled by config", _PLUGIN_NAME
	end

	-- Debug?
	if getVarNumeric( "DebugMode", 0, pdev, MYSID ) ~= 0 then
		debugMode = true
		D("startPlugin() debug enabled by state variable DebugMode")
	end

	-- Check required packages
	for _,v in ipairs{ "dkjson", "socket", "mime" } do
		if not package.loaded[v] then
			L({level=1,"Required system module %1 cannot be loaded"}, v)
			luup.variable_set( MYSID, "Message", "Required package missing (see log)", pdev )
			markChildrenDown( "Required package missing (see log)", pdev )
			return false, "Required package missing", _PLUGIN_NAME
		end
	end
	-- These are needed for notifications other actions
	for _,v in ipairs{ "socket.http", "socket.smtp", "ssl", "ssl.https", "ltn12" } do
		local st,p = pcall( require, v )
		if not st or type(p) ~= "table" then
			L({level=2,"Warning: the %1 module cannot be loaded, but is required for some action types."})
		elseif isOpenLuup and v == "ssl" and tostring( package.loaded.ssl or "" )._VERSION:match( "^0%.[1234567]" ) then
			L({level=2,'Warning: the "ssl" module (LuaSec) is out of date and should be upgraded.'})
		end
		package.loaded[v] = nil
	end

	-- Check for hard system restart loop; stand off if it's happening. Not
	-- because we've ever caused problems, but because plugins are always the
	-- first to be blamed.
	local nr = getVarNumeric( "MaxRestartCount", 10, pdev, MYSID )
	local p = getVarNumeric( "MaxRestartPeriod", 900, pdev, MYSID )
	if nr > 1 and p > 0 then
		local s = getReactorVar( "rs", "", pdev )
		s = split( s, ',' )
		while #s >= nr do table.remove(s, 1) end
		D("startPlugin() restart check (limit %1 in %2); previous restarts: %3", nr, p, s)
		table.insert(s, os.time())
		setVar( MYSID, "rs", table.concat( s, "," ), pdev )
		if #s == nr then
			local d = s[nr] - s[1]
			if d <= p then
				-- Too many restarts! Abort. No soup for you!
				L({level=1,msg="Reactor has detected that this system has restarted %1 times in %2 seconds; disabling Reactor just in case."},
					nr, d)
				setVar( MYSID, "recoverymode", 1, pdev )
				setVar( MYSID, "Message", "Safety Lockout!", pdev )
				markChildrenDown( "Safety lockout!", pdev )
				luup.set_failure( 1, pdev )
				return false, "Safety lockout", _PLUGIN_NAME
			end
		end
	else
		D("startPlugin() restart loop check disabled (%1/%2)", nr, p)
		setVar( MYSID, "rs", "", pdev ) -- clear restart tracking
	end

	luup.variable_set( MYSID, "Message", "Initializing...", pdev )
	luup.variable_set( MYSID, "LoadTime", os.time(), pdev )

	-- Save required UI version for collision detection.
	setVar( MYSID, "_UIV", _UIVERSION, pdev )

	-- System type (id 35=Edge, 36=Plus, 37=Secure)
	hasBattery = luup.modelID == nil or luup.modelID == 37

	-- Check for ALTUI and OpenLuup
	local failmsg = false
	for k,v in pairs(luup.devices) do
		if not isALTUI and v.device_type == "urn:schemas-upnp-org:device:altui:1" and v.device_num_parent == 0 then
			L("Detected ALTUI (%1)", k)
			isALTUI = k
			local rc,rs,jj,ra = luup.call_action("urn:upnp-org:serviceId:altui1", "RegisterPlugin",
				{
					newDeviceType=RSTYPE,
					newScriptFile="J_ReactorSensor_ALTUI.js",
					newDeviceDrawFunc="ReactorSensor_ALTUI.deviceDraw",
					-- newControlPanelFunc="ReactorSensor_ALTUI.controlPanelDraw",
					newStyleFunc="ReactorSensor_ALTUI.getStyle"
				}, k )
			D("startPlugin() ALTUI's RegisterPlugin action for %5 returned resultCode=%1, resultString=%2, job=%3, returnArguments=%4", rc,rs,jj,ra, RSTYPE)
			rc,rs,jj,ra = luup.call_action("urn:upnp-org:serviceId:altui1", "RegisterPlugin",
				{
					newDeviceType=MYTYPE,
					newScriptFile="J_Reactor_ALTUI.js",
					newDeviceDrawFunc="Reactor_ALTUI.deviceDraw",
					newStyleFunc="Reactor_ALTUI.getStyle"
				}, k )
			D("startPlugin() ALTUI's RegisterPlugin action for %5 returned resultCode=%1, resultString=%2, job=%3, returnArguments=%4", rc,rs,jj,ra, MYTYPE)
		elseif not isOpenLuup and v.device_type == "openLuup" then
			L("Detected openLuup (%1)", k)
			isOpenLuup = k
			local vv = getVarNumeric( "Vnumber", 0, k, v.device_type )
			if vv < 181121 then
				L({level=1,msg="OpenLuup version must be at least 181121; you have %1. Can't continue."}, vv)
				luup.variable_set( MYSID, "Message", "Unsupported firmware " .. tostring(vv), pdev )
				luup.set_failure( 1, pdev )
				failmsg = "Incompatible openLuup ver " .. tostring(vv)
			end
			vv = (_G or {})._VERSION or ""
			D("startPlugin() Lua interpreter is %1", vv)
			local n = vv:match( "^Lua +(.*)$")
			if type(n) == "string" and not n:match( "^5.1" ) then
				L({level=1,msg="Invalid Lua version: %1"}, vv)
				luup.variable_set( MYSID, "Message", "Unsupported Lua interpreter " .. tostring(vv), pdev )
				luup.set_failure( 1, pdev )
				failmsg = "Incompatible Lua interpreter " .. tostring(vv)
			else
				L({level=2,msg="Can't check Lua interpreter version, returned version string is %1"}, vv)
			end
		elseif v.device_type == "urn:richardgreen:device:VeraAlert:1" and v.device_num_parent == 0 then
			devVeraAlerts = k
			L("Detected VeraAlerts (%1)", k)
		elseif v.device_type == RSTYPE then
			luup.variable_set( RSSID, "Message", "Stopped", k )
			addEvent{ dev=k, msg="Reactor startup (Luup reload)" }
		end
	end
	if failmsg then
		return false, failmsg, _PLUGIN_NAME
	end

	unsafeLua = isOpenLuup or ( tonumber( luup.attr_get( "UnsafeLua", 0 ) or 1 ) ~= 0 )

	-- Check UI version
	if not checkVersion( pdev ) then
		L({level=1,msg="This plugin does not run on this firmware."})
		luup.variable_set( MYSID, "Message", "Unsupported firmware "..tostring(luup.version), pdev )
		luup.set_failure( 1, pdev )
		return false, "Incompatible firmware " .. luup.version, _PLUGIN_NAME
	end

	-- One-time stuff
	plugin_runOnce( pdev )

	-- Check for recovery mode.
	if getVarNumeric( "recoverymode", 0, pdev, MYSID ) ~= 0 then
		-- Recovery mode. Wipe state data.
		setVar( MYSID, "runscene", "{}", pdev )
		setVar( MYSID, "scenedata", "{}", pdev )
		setVar( MYSID, "NotifyQueue", "[]", pdev )
		setVar( MYSID, "recoverymode", "0", pdev )
	end

	-- For openLuup, we watch the openLuup device's HouseMode variable.
	if isOpenLuup then
		addServiceWatch( isOpenLuup, "openLuup", "HouseMode", pdev )
	end

	-- Queue all scenes cached for refresh
	local sd = getReactorVar( "scenedata", "{}", pdev )
	sceneData = json.decode( sd ) or {}
	for _,scd in pairs( sceneData ) do
		refreshScene( scd.id )
	end

	-- Launch the system (Z-Wave) ready check.
	scheduleDelay( { id="sysready", func=waitSystemReady, owner=pdev }, 5 )

	-- Reset and launch the notifier.
	notifyQueue = getVarJSON( "NotifyQueue", {}, pluginDevice, MYSID )
	scheduleDelay( { id="notifier", owner=pluginDevice, func=runNotifyTask }, 60 )

	-- Start sensors
	startSensors( pdev )

	-- Remove recovery mode flag if we can
	deleteVar( MYSID, "recoverymode", pdev )

	-- Return success
	luup.set_failure( 0, pdev )
	return true, "Ready", _PLUGIN_NAME
end

-- Check enabled state for actions
function assertEnabled( dev ) return isEnabled( dev ) or error "Cannot perform this action on a disabled ReactorSensor" end

-- Add a child (used as both action and local function)
function actionAddSensor( pdev, count )
	D("addSensor(%1)", pdev)
	if getVarNumeric( "Enabled", 1, pluginDevice, MYSID ) == 0 then
		error "Cannot perform this operation when Reactor is disabled"
	end
	count = tonumber( count ) or 1
	if count < 1 then count = 1 elseif count > 16 then count = 16 end
	luup.variable_set( MYSID, "Message", "Adding sensor, please hard-refresh your browser.", pdev )

	local ptr = luup.chdev.start( pdev )
	local highd = 0
	for k,v in childDevices( pdev ) do
		D("addSensor() appending existing device %1 (%2)", v.id, v.description)
		if v.device_type == RSTYPE then
			local dd = tonumber( string.match( v.id, "s(%d+)" ) )
			if dd == nil then highd = highd + 1 elseif dd > highd then highd = dd end
		end
		luup.chdev.append( pdev, ptr, v.id, v.description, v.device_type,
			luup.attr_get( 'device_file', k ) or "",
			luup.attr_get( 'impl_file', k ) or "", "", false )
	end
	local vv = string.format( "%s,Enabled=1\n,room=%s", RSSID, luup.attr_get( "room", pdev ) or "0" )
	for k = 1,count do
		highd = highd + 1
		D("addSensor() creating child %3/%4 as r%1s%2", pdev, highd, k, count)
		luup.chdev.append( pdev, ptr, string.format("r%ds%d", pdev, highd),
			"Reactor Sensor " .. highd, "", "D_ReactorSensor.xml", "", vv, false )
	end
	luup.chdev.sync( pdev, ptr )
	-- Should cause reload immediately.
	return true
end

-- Remove all child devices.
function actionMasterClear( dev )
	local ptr = luup.chdev.start( dev )
	luup.chdev.sync( dev, ptr )
	-- Should cause reload immediately.
end

-- Update geofence data. This is long-running, so runs as a job from the master tick.
function actionUpdateGeofences( pdev, event )
	assertEnabled( pdev )
	if isOpenLuup then return 4,0 end -- quietly do nothing
	L("Starting geofence %1 check job (event %2)", geofenceMode >= 0 and "quick" or "long", event)
	if tonumber( event ) ~= geofenceEvent then
		D("actionUpdateGeofences() got event %1 expecting %2, skipping update", event, geofenceEvent)
		L("...overlapping geofence update requests; this request skipped.")
		return
	end
	if updateGeofences( pdev ) then
		return 4,0
	end
	return 2,0
end

-- Enable or disable debug
function actionSetDebug( state, tdev )
	D("actionSetDebug(%1,%2)", state, tdev)
	debugMode = state or false
	if debugMode then
		D("Debug enabled")
	end
end

-- Set enabled state of ReactorSensor
function actionSetEnabled( enabled, tdev )
	D("setEnabled(%1,%2)", enabled, tdev)
	if getVarNumeric( "Enabled", 1, pluginDevice, MYSID ) == 0 then
		setMessage( "Reactor plugin is disabled.", tdev )
		error "Cannot perform this operation when Reactor is disabled"
	end
	if type(enabled) == "string" then
		if enabled:lower() == "false" or enabled:lower() == "disabled" or enabled == "0" then
			enabled = false
		else
			enabled = true
		end
	elseif type(enabled) == "number" then
		enabled = enabled ~= 0
	elseif type(enabled) ~= "boolean" then
		return
	end
	local wasEnabled = getVarBool( "Enabled", true, tdev, RSSID )
	if wasEnabled ~= enabled then
		-- changing
		addEvent{ dev=tdev,
			msg="SetEnabled action invoked, new enabled state is %(state)q",
			event="action", action="SetEnabled", state=enabled }
		luup.variable_set( RSSID, "Enabled", enabled and "1" or "0", tdev )
		-- If disabling, do nothing else, so current actions complete/expire.
		if enabled then
			L("Enabling %1 (#%2)", luup.devices[tdev].description, tdev)
			setMessage( "Enabling...", tdev )
			luup.call_action( RSSID, "Restart", {}, tdev )
		else
			L("Disabling %1 (#%2)", luup.devices[tdev].description, tdev)
			showDisabled( tdev )
		end
	end
end

-- Force trip a ReactorSensor
function actionTrip( dev )
	assertEnabled( dev )
	L("Sensor %1 (%2) trip action!", dev, luup.devices[dev].description)
	addEvent{ dev=dev, msg="Trip action invoked", event="action", action="Trip" }
	trip( true, dev )
	setMessage("Tripped", dev)
end

-- Force reset (untrip) a ReactorSensor
function actionReset( dev )
	assertEnabled( dev )
	L("Sensor %1 (%2) reset action!", dev, luup.devices[dev].description)
	addEvent{ dev=dev, msg="Reset action invoked", event="action", action="Reset" }
	trip( false, dev )
	setMessage("Not tripped", dev)
end

-- Set arming state of ReactorSensor
function actionSetArmed( armedVal, dev )
	L("Sensor %1 (%2) set armed to %3", dev, luup.devices[dev].description, armedVal)
	local armed = ( tonumber( armedVal ) or 0 ) ~= 0
	luup.variable_set( SENSOR_SID, "Armed", armed and "1" or "0", dev )
	addEvent{ dev=dev, msg="SetArmed action invoked, new arming state=%(state)s",
		event="action", action="SetArmed", state=armed }
end

-- Restart a ReactorSensor (clear saved state, reload config and force re-evals)
function actionRestart( dev )
	if (luup.devices[ dev ] or {}).device_type ~= RSTYPE then error("Invalid device type") end
	assertEnabled( dev )
	L("Restarting %2 (#%1)", dev, luup.devices[dev].description)
	addEvent{ dev=dev, msg="Restart action invoked; clearing state and restarting ReactorSensor", event="action", action="Restart" }
	stopScene( dev, nil, dev ) -- stop all scenes in device context
	clearOwnerTasks( dev )
	clearConditionState( dev ) -- clear state
	getSensorConfig( dev, true ) -- force reload config
	local success, err = pcall( startSensor, dev, luup.devices[dev].device_num_parent )
	if not success then
		L({level=2,msg="Failed to start %1 (%2): %3"}, dev, luup.devices[dev].description, err)
		setMessage( "Failed (see log)", dev )
		luup.set_failure( 1, dev ) -- error on timer device
	else
		luup.set_failure( 0, dev )
	end
end

-- Clear latched conditions on a ReactorSensor
function actionClearLatched( dev, group )
	assertEnabled( dev )
	if "" == ( group or "" ) then group = false end
	L("Clearing latched conditions on %1 (#%2) in " ..
		( group and group or "all groups" ), luup.devices[dev].description, dev)
	local grpid = group
	if group then
		local cd = getSensorConfig( dev )
		if not findCondition( group, cd, "group" ) then
			-- Not found. See if group param matches group name
			D("actionClearLatched() no group with id %1, searching by name", group)
			grpid = false
			for d in conditionGroups( (cd.conditions or {}).root or {} ) do
				if ( "group" == ( d.type or "group" ) ) and group:lower() == d.name:lower() then
					grpid = d.id
					break
				end
			end
			if not grpid then
				L({level=1,msg="Can't ClearLatched, group not found: %1 on %2 (#%3)"}, group,
					luup.devices[dev].description, dev)
				return false
			end
			D("actionClearLatched() found group id %1 for name %2", grpid, group)
		end
	end
	addEvent{ dev=dev,
		msg="ResetLatched action invoked for group %(group)s",
		event="action", action="ClearLatched", group=group and group or "any", groupid=grpid and grpid or "any" }
	if resetLatched( grpid, dev ) then
		scheduleDelay( { id=tostring(dev), owner=dev, func=sensorTick }, 0 )
	end
	return true
end

function actionSendSMTP( lul_device, lul_settings )
	D("actionSendSMTP(%1,%2)", lul_device, lul_settings)

	local from = lul_settings.From or "<Vera@localhost>"
	local to = lul_settings.To or error("Missing 'To' parameter")
	local subject = lul_settings.Subject or ""
	local body = lul_settings.Body or error("Missing 'Body' parameter")

	local success, err = pcall( doSMTPSend, from, to, subject, body, lul_settings.Cc, lul_settings.Bcc )
	if success then
		L("SendSMTP action succeeded to %1 subject %2", to, subject)
		return 4,0
	else
		L{level=1,msg=err}
	end
	return 2,0
end

function actionSendSyslog( lul_device, lul_settings )
	D("actionSendSyslog(%1,%2)", lul_device, lul_settings)
	if not ( lul_settings.ServerIP and lul_settings.Application and lul_settings.Message ) then
		L{level=1,msg="Action SendSyslog parameters ServerIP, Application and Message are required"}
		return false
	end
	local pack = {
		facility = lul_settings.Facility or 23,
		severity = lul_settings.Severity or 5,
		message = lul_settings.Message,
		application = lul_settings.Application,
		procid = string.format( "Reactor%d", lul_device ),
		hostip = lul_settings.ServerIP
	}
	local success, err = pcall( doSyslogDatagram, pack, lul_device )
	if success then return true end
	L{level=1,msg=err}
	return false
end

local function findSceneOrActivity( scene, dev )
	D("findSceneOrActivity(%1,%2)", scene, dev)
	if type(scene) == "string" then
		-- See if string contains a number. If so, that's just a Vera scene ID.
		local tn = tonumber( scene )
		if tn then
			scene = tn
		else
			-- Non-numeric. May be RS activity or Vera scene name
			local ln = scene:lower()
			if ln:match( "%.true$" ) or ln:match( "%.false$" ) then
				-- Activity reference.
				if luup.devices[dev].device_type ~= RSTYPE then
					return false, false, "Device must be ReactorSensor to use activity reference: " .. scene
				end
				-- Find it directly?
				local cd = getSensorConfig( dev )
				if not ( cd.activities or {} )[scene] then
					-- No, maybe it uses a group name rather than ID. Find it.
					local name = ln:gsub( ".true$", "" ):gsub( ".false$", "" )
					local state = ln:gsub( name, "" )
					ln = nil
					for grp in conditionGroups( cd.conditions.root or {} ) do
						if (grp.name or ""):lower() == name or (grp.id or ""):lower() == name then
							ln = grp.id .. state;
							break
						end
					end
					if not ln then
						-- Nothing found.
						return false, "error", "Activity not found: " .. scene
					elseif not ( cd.activities or {})[ln] then
						-- Found a group that matches, but it has no activity.
						return true
					end
					D("findSceneOrActivity() remapping scene parameter (activity) %1 to canonical %2", scene, ln)
					scene = ln
				end
			else
				-- Assume Vera scene by name
				for k,v in pairs( luup.scenes ) do
					if v.name:lower() == ln then
						tn = k
						break
					end
				end
				if not tn then
					return false, "error", "Scene name not found: " .. scene
				end
				-- Replace scene passed with number
				D("findSceneOrActivity() remapping scene parameter (name) %1 to Vera scene #%2", scene, tn)
				scene = tn
			end
		end
	end
	D("findSceneOrActivity() returning %1", scene)
	return scene
end

-- Run a Vera scene or ReactorSensor group activity in the context of the
-- passed device.
function actionRunScene( scene, options, dev )
	D("actionRunScene(%1,%2,%3)", scene, options, dev)
	assertEnabled( dev )
	L("RunScene action invoked, scene %1", scene)
	local scid, event, message = findSceneOrActivity( scene, dev )
	if not scid then
		if event then
			addEvent{ dev=dev, event="action", action="RunScene", scene=scene, options=options, [event]=message }
		end
		L({level=2,msg=message})
		return false
	elseif scid == true then
		-- findSceneOrActivity telling us it's an empty activity, nothing to do.
		-- So, we're done!
		addEvent{ dev=dev, event="action", action="RunScene", scene=scene, options=options, warning="Activity contains no actions" }
		L({level=2,msg="Activity %1 contains no actions"}, scene)
		return true
	end

	-- Default our options
	if ( options or "" ) ~= "" then
		local opts,err,pos = json.decode( options )
		if not opts then
			L({level=1,msg="Invalid JSON in Options parameter to RunScene action: %1 at %2 in "..options},
				err, pos)
			return false
		end
		options = opts
	else
		options = { contextDevice=dev }
		D("actionRunScene() supplying default options %1", options)
	end
	options.forceReactorScenes = true -- If we use this action, this is how we do it
	if options.stopPriorScenes == nil then options.stopPriorScenes = false end
	if options.contextDevice == nil then options.contextDevice = dev end
	addEvent{ dev=dev, event="action", action="RunScene", scene=scene, sceneId=scid, options=options }
	runScene( scid, dev, options )
	return true
end

-- Stop running scene.
function actionStopScene( ctx, scene, dev )
	L("StopScene action, scene %1", scene)
	-- Treat blank/empty as nil
	if (ctx or "") ~= "" then ctx = tonumber( ctx ) or nil else ctx = dev end
	local scid = nil
	if (scene or "") ~= "" then
		local event, message
		scid, event, message = findSceneOrActivity( scene, dev )
		if not scid then
			if event then
				addEvent{ dev=dev, event="action", action="StopScene", scene=scene, [event]=message }
			end
			L({level=2,msg=message})
			return false
		end
	end
	addEvent{ dev=dev,
		event="action", action="StopScene", contextDevice=ctx or "(all)", scene=scene or "", sceneId=tostring(scid) }
	stopScene( ctx, nil, dev, scid )
	return true
end

-- Set group enabled state (job).
function actionSetGroupEnabled( grpid, enab, dev )
	D("actionSetGroupEnabled(%1,%2,%3)", grpid, enab, dev)
	assertEnabled( dev )
	-- Load a clean copy of the configuration.
	local cdata = getSensorConfig( dev )
	local grp = findCondition( grpid, cdata, "group" )
	if grp then
		if type(enab) == "string" then
			-- Lean towards enabled; only small set of strings disables.
			enab = string.find( ":no:n:false:f:0:", ":" .. enab:lower() .. ":" ) == nil
		else
			enab = ( tonumber(enab) or 1 ) ~= 0
		end
		grp.disabled = (not enab) and 1 or nil
		grp.enabled = nil
		L("%1 (%2) SetGroupEnabled %3 now %4", luup.devices[dev].description,
			dev, grp.id, grp.disabled and "disabled" or "enabled")
		addEvent{ dev=dev,
			msg="SetGroupEnabled action invoked, %(name)s now %(enabled)sabled",
			event="action", action="SetGroupEnabled", group=grpid, name=grp.name or grp.id,
			enabled=enab and "en" or "dis" }
		-- No need to call updateSensor here, modifying cdata does it
		cdata.timestamp = os.time()
		cdata.serial = 1 + ( tonumber( cdata.serial or 0 ) or 0 )
		local rawConfig,err = json.encode( cdata )
		if rawConfig and #rawConfig > 0 then
			luup.variable_set( RSSID, "cdata", rawConfig, dev )
		else
			L({level=1,msg="Can't save configuration! The JSON library (%1) can't encode it: %2"}, json.version, err)
			L("%1", cdata)
			return 2,0
		end
	end
	L({level=1,msg="%1 (%2) action SetGroupEnabled %3 failed, group not found in config"},
		luup.devices[dev].description, dev, grpid)
	return 2,0,"Invalid group"
end

function actionSetVariable( opt, tdev )
	assertEnabled( tdev )
	local success, oldval, newval = doSetVar( opt.VariableName, opt.NewValue, tdev )
	if success then
		addEvent{ dev=tdev, msg="Variable %(variable)q set to %(newValue)q; was %(newValue)q",
				  variable=opt.VariableName, newValue=newval, oldValue=oldval }
		scheduleDelay( tdev, 1 )
		return true
	end
	L({level=2,msg="%1 (#%2) SetVariable device action on %3 failed: "..tostring(oldval)},
		luup.devices[tdev].description, tdev, opt.VariableName)
	addEvent{ dev=tdev, msg="SetVariable device action on %(varname)q failed: %(err)s",
		varname=opt.VariableName, ['err']=oldval }
	return false
end

-- Return the plugin version string
function getPluginVersion()
	return _PLUGIN_VERSION, _CONFIGVERSION
end

-- Plugin timer tick. Using the tickTasks table, we keep track of
-- tasks that need to be run and when, and try to stay on schedule. This
-- keeps us light on resources: typically one system timer only for any
-- number of devices.
local functions = { [tostring(masterTick)]="masterTick", [tostring(sensorTick)]="sensorTick",
	[tostring(loadWaitingScenes)]="loadWaitingScenes", [tostring(execSceneGroups)]="execSceneGroups" }
function tick(p)
	D("tick(%1) pluginDevice=%2", p, pluginDevice)
	if tonumber(p) ~= runStamp then
		D("tick() stamp mismatch (got %1, expecting %2), newer thread running. Bye!", p, runStamp)
		return
	end

	local now = os.time()
	tickTasks._plugin.when = 0 -- mark executive running

	-- Since the tasks can manipulate the tickTasks table (via calls to
	-- scheduleTick()), the iterator is likely to be disrupted, so make a
	-- separate list of tasks that need service (to-do list).
	local todo = {}
	for t,v in pairs(tickTasks) do
		if t ~= "_plugin" and v.when ~= nil and v.when <= now then
			table.insert( todo, v )
		end
	end
	table.sort( todo, function( a, b ) return (a.when or now) < (b.when or now) end )

	-- Run the to-do list tasks.
	D("tick() to-do list is %1", todo)
	for _,v in ipairs(todo) do
		v.when = nil -- task needs to reschedule itself (also marks running)
		D("tick() running eligible task %1", v.id)
		local success, err = pcall( v.func, v.owner, v.id, unpack(v.args or {}) )
		D("tick() return %2 from task %1, err=%3", v.id, success, err)
		if not success then
			L({level=1,msg="Reactor device %1 (%2) tick failed: %3"}, v.owner, (luup.devices[v.owner] or {}).description, err)
			addEvent{ dev=v.owner, event="error", message="tick failed", reason=err }
		end
	end

	-- Things change while we work. Take another pass to find next task.
	local nextTick = nil
	for t,v in pairs(tickTasks) do
		if t ~= "_plugin" and v.when ~= nil then
			if nextTick == nil or v.when < nextTick then
				nextTick = v.when
			end
		end
	end

	-- Figure out next master tick, or don't resched if no tasks waiting.
	D("tick() finished, next eligible task at %1", nextTick)
	if nextTick ~= nil then
		now = os.time() -- Get the actual time now; above tasks can take a while.
		local delay = math.max( 0, nextTick - now )
		tickTasks._plugin.when = now + delay
		D("tick() scheduling next tick(%3) for %1 (%2)", delay, tickTasks._plugin.when, p)
		luup.call_delay( "reactorTick", delay, p )
	else
		D("tick() finished, not rescheduling, nextTick=%1, stepStamp=%2, runStamp=%3", nextTick, p, runStamp)
		tickTasks._plugin = nil
	end
end

-- Handle the sensor-specific watch (dispatched from the watch callback)
local function sensorWatch( dev, sid, var, oldVal, newVal, tdev, pdev )
	D("sensorWatch(%1,%2,%3,%4,%5,%6,%7)", dev, sid, var, oldVal, newVal, tdev, pdev)
	local enabled = isEnabled( tdev )
	-- Watched variable has changed. Re-evaluate conditons.
	if dev == pdev then
		addEvent{ dev=tdev, event='devicewatch', device=dev,
			name=(luup.devices[dev] or {}).description, var=var }
	elseif sid == RSSID and var == "cdata" then
		L("%1 (#%2) configuration change, updating!", dev, luup.devices[dev].description)
		addEvent{ dev=dev, msg="Configuration changed!", event="configchange" }
		stopScene( dev, nil, dev ) -- Stop all scenes in this device context.
		getSensorConfig( dev, true )
	else
		addEvent{ dev=tdev, event='devicewatch', device=dev,
			msg="Device %(name)s (#%(device)s) %(var)s changed from %(old)s to %(new)s%(act)s",
			name=(luup.devices[dev] or {}).description, var=sid .. "/" .. var,
			old=string.format("%q", tostring(oldVal):sub(1,64)),
			new=string.format("%q", tostring(newVal):sub(1,64)),
			act=enabled and "" or " (ignored/disabled)" }
	end
	if enabled then
		local holdOff = getVarNumeric( "WatchResponseHoldOff", -1, tdev, RSSID )
		if holdOff < 0 then
			-- Immediate update.
			updateSensor( tdev )
			D("sensorWatch() update #%1 finished", tdev)
			return
		end
		D("sensorWatch() scheduling update of #%1 for +%2", tdev, holdOff)
		scheduleDelay( { id=tostring(tdev), owner=tdev, func=sensorTick }, holdOff )
	end
end

-- Watch callback. Dispatches to sensor-specific handling.
function watch( dev, sid, var, oldVal, newVal )
	D("watch(%1,%2,%3,%4,%5)", dev, sid, var, oldVal, newVal)
	assert(var ~= nil) -- nil if service or device watch (can happen on openLuup)

	-- openLuup: as of 191210, openLuup's variable_watch is a little different, in that it places
	-- a service watch when a variable watch is placed for a variable that is NOT declared in the
	-- service file. So filter a bit more here (reduces re-eval chatter that I was hunting for).

	if luup.devices[dev].device_num_parent == pluginDevice and
			luup.devices[dev].id == "hmt" and sid == SENSOR_SID and var == "Armed" then
		-- Arming state changed on HMT, update house mode.
		D("watch() HMT device %1 arming state changed", dev)
		if geofenceMode ~= 0 and getVarNumeric( "SuppressGeofenceHMTUpdate", 0, pluginDevice, MYSID ) == 0 then
			D("watch() forcing geofence update job for house mode change")
			geofenceEvent = geofenceEvent + 1
			luup.call_action( MYSID, "UpdateGeofences", { event=geofenceEvent }, pluginDevice ) -- luacheck: ignore 211
		end
		local mode = luup.attr_get( "Mode", 0 ) or "1"
		D("watch() updating HouseMode to %1", mode)
		setVar( MYSID, "HouseMode", mode, pluginDevice )
		setHMTModeSetting( dev )
	elseif dev == isOpenLuup and sid == "openLuup" and var == "HouseMode" then
		D("watch() openLuup house mode changed to %1", newVal)
		-- No geofencing on openLuup, so we don't need to worry about that here.
		setVar( MYSID, "HouseMode", newVal, pluginDevice )
	else
		-- Dispatch watches for ReactorSensors
		local key = string.format("%d/%s/%s", dev or 0, sid or "X", var or "X")
		if watchData[key] then
			for t in pairs( watchData[key] ) do
				local tdev = tonumber(t) or 0
				if (luup.devices[tdev] or {}).device_type == RSTYPE then
					D("watch() dispatching to %1 (%2)", tdev, luup.devices[tdev].description)
					local success,err = pcall( sensorWatch, dev, sid, var, oldVal, newVal, tdev, pluginDevice )
					if not success then
						L({level=1,msg="watch() device %2 dispatch error: %1"}, err, tdev)
					end
				end
			end
		else
			D("watch() callback for unregistered/unwatched dev/service/state %1", key)
		end
	end
end

local EOL = "\r\n"
local summaryDevices

local function getDevice( dev, pdev, v )
	if v == nil then v = luup.devices[dev] end
	local devinfo = {
		  devNum=dev
		, ['type']=v.device_type
		, description=v.description or ""
		, room=v.room_num or 0
		, udn=v.udn or ""
		, id=v.id
		, parent=v.device_num_parent or pdev
		, ['device_json'] = luup.attr_get( "device_json", dev )
		, ['impl_file'] = luup.attr_get( "impl_file", dev )
		, ['device_file'] = luup.attr_get( "device_file", dev )
		, manufacturer = luup.attr_get( "manufacturer", dev ) or ""
		, model = luup.attr_get( "model", dev ) or ""
		, plugin = luup.attr_get( "plugin", dev )
	}
	local rc,t,httpStatus,uri
	if isOpenLuup then
		uri = "http://localhost:3480/data_request?id=status&DeviceNum=" .. dev .. "&output_format=json"
	else
		uri = "http://localhost/port_3480/data_request?id=status&DeviceNum=" .. dev .. "&output_format=json"
	end
	rc,t,httpStatus = luup.inet.wget(uri, 15)
	if httpStatus ~= 200 or rc ~= 0 then
		devinfo['_comment'] = string.format( 'State info could not be retrieved, rc=%s, http=%s, UnsafeLua=%s', tostring(rc), tostring(httpStatus), tostring(unsafeLua) )
		return devinfo
	end
	local d = json.decode(t)
	local key = "Device_Num_" .. dev
	if d ~= nil and d[key] ~= nil and d[key].states ~= nil then d = d[key].states else d = nil end
	devinfo.states = d or {}
	return devinfo
end

local function getLuaSummary( lua, encoded, fmt )
	if ( encoded or 0 ) ~= 0 then
		lua = mime.unb64( lua )
		if lua == nil then return string.format( fmt, 0, "Can't unb64 lua block" ) .. EOL end
	end
	local r = ""
	lua = lua:gsub( "\r\n", "\n" ):gsub( "\r", "\n" )
	local lines = split( lua, "\n" )
	for ix=1,#lines do
		r = r .. string.format( fmt, ix, lines[ix] ) .. EOL
	end
	return r
end

local function getReactorScene( t, s, tdev, runscenes, cf )
	D("getReactorScene(%1,%2,%3,%4,%5)", t, s, tdev, runscenes, tostring(cf))
	local resp = "    Activity " .. t .. ( s and "" or " (none)" ) .. EOL
	local pfx = "        "
	if s then
		for _,gr in ipairs( s.groups or {}) do
			if (gr.delay or 0) > 0 then
				resp = resp .. pfx .. "Delay " .. gr.delay .. " " .. (gr.delaytype or "inline") .. EOL
			end
			for _,act in ipairs( gr.actions or {} ) do
				D("getReactorScene() action %1", act)
				if act.type == "comment" then
					resp = resp .. pfx .. "Comment: " .. tostring(act.comment) .. EOL
				elseif act.type == "runlua" then
					resp = resp .. pfx .. "Run Lua:" .. EOL
					resp = resp .. getLuaSummary( act.lua, act.encoded_lua, pfx .. "%6d: %s" )
				elseif act.type == "runscene" then
					resp = resp .. pfx .. "Run scene " .. tostring(act.scene) .. " " .. ((luup.scenes[act.scene] or {}).description or (act.sceneName or "").."?") .. EOL
					if not runscenes[tostring(act.scene)] then
						runscenes[tostring(act.scene)] = getSceneData( act.scene, tdev )
					end
				elseif act.type == "device" then
					local p = {}
					for pn,pp in ipairs( act.parameters or {} ) do
						local z = pp.value == nil and "(no value)" or string.format("%q", tostring(pp.value))
						table.insert( p, tostring(pp.name or pn) .. "=" .. z )
					end
					p = table.concat( p, ", " )
					resp = resp .. pfx .. "Device "
					resp = resp .. ( ( act.device or -1 ) == -1 and "(self)" or
						( ( (luup.devices[act.device or -1] or {}).description or ( (act.deviceName or "unknown") .. "?" ) ) ..
						  " (" .. tostring(act.device) .. ")" ) )
					resp = resp .. " action " .. (act.service or "?") .. "/" .. (act.action or "?") .. "( " .. p .. " )"
					resp = resp .. EOL
					if act.device ~= -1 then
						summaryDevices[tostring(act.device)] = true
						if ( ( luup.devices[act.device] or {} ).device_num_parent or 0 ) ~= 0 then
							summaryDevices[tostring(luup.devices[act.device].device_num_parent)] = true
						end
					end
				elseif act.type == "housemode" then
					resp = resp .. pfx .. "Change house mode to " .. tostring(act.housemode) .. EOL
				elseif act.type == "rungsa" or act.type == "stopgsa" then
					resp = resp .. pfx .. ( act.type == "stopgsa" and "Stop" or "Run" )
					resp = resp .. " " .. tostring( act.activity or "all activities" )
					if ( act.device or -1 ) ~= -1 then
						resp = resp .. " on " ..
							( (luup.devices[act.device or -1] or {}).description or ( (act.deviceName or "unknown") .. "?" ) ) ..
							" (" .. tostring(act.device) .. ")"
					end
					if ( act.stopall or 0 ) ~= 0 then resp = resp .. " (after stopping all others)" end
					resp = resp .. EOL
				elseif act.type == "resetlatch" then
					resp = resp .. pfx .. "Reset latched conditions in "
					if act.group == "*" then resp = resp .. "all groups"
					elseif ( act.group or "" ) == "" then resp = resp .. "this group"
					else resp = resp .. tostring(act.group)
					end
					if ( act.device or -1 ) ~= -1 then
						resp = resp .. " on " ..
							( (luup.devices[act.device or -1] or {}).description or ( (act.deviceName or "unknown") .. "?" ) ) ..
							" (" .. tostring(act.device) .. ")"
					end
					resp = resp .. EOL
				elseif act.type == "notify" then
					resp = resp .. pfx .. "Notify method " .. tostring(act.method) .. " nid " .. tostring(act.notifyid) .. ":"
					if cf.notifications and cf.notifications[tostring(act.notifyid)] then
						local nn = cf.notifications[tostring(act.notifyid)]
						if nn.scene then resp = resp .. " sid " .. nn.scene end
						if nn.users then resp = resp .. " users " .. tostring(nn.users) end
						resp = resp .. " message " .. string.format("%q", tostring(nn.message))
					end
					local mv = {
						SM={"SMTPServer","SMTPPort","SMTPSender","SMTPDefaultRecipient","SMTPDefaultSubject","SMTPUsername","*SMTPPassword"},
						PR={"ProwlProvider","ProwlSubject","ProwlURL","*ProwlAPIKey"}
					}
					for _,v in ipairs( mv[tostring(act.method)] or {} ) do
						local m,n = v:match("^(%*)(.*)")
						n = n or v
						local vv = getVar( n, "", pluginDevice, MYSID )
						if m and vv ~= "" then vv = "****" end
						resp = resp .. string.format("; %s=%q", n, tostring(vv))
					end
					if act.method == "SM" then
						resp = resp .. "; SSL opt " .. json.encode( getSSLParams( "SMTP" ) )
					end
					resp = resp .. EOL
				else
					resp = resp .. pfx .. "Action type " .. tostring(act.type) .. "?"
					local arr = {}
					for k,v in pairs(act) do
						if k ~= "type" then
							table.insert( arr, k .. "=" .. tostring(v) )
						end
					end
					if #arr then resp = resp .. " " .. table.concat( arr, ", " ) end
					resp = resp .. EOL
				end
			end
		end
	end
	return resp
end

local function getEvents( deviceNum )
	D("getEvents(%1)", deviceNum)
	if deviceNum == nil or luup.devices[deviceNum] == nil or luup.devices[deviceNum].device_type ~= RSTYPE then
		return "no events: device does not exist or is not ReactorSensor"
	end
	local resp = "    Events" .. EOL
	local sst = getSensorState( deviceNum )
	for _,e in ipairs( sst.eventList or {} ) do
		if type(e) == "string" then
			resp = resp .. "        " .. e .. EOL
		else
			resp = resp .. string.format("        %s ", os.date("%Y-%m-%d %H:%M:%S", e.when or 0) )
			resp = resp .. ( e.event or "event?" ) .. ": "
			local d = {}
			for k,v in pairs(e) do
				if not ( k == "time" or k == "when" or k == "event" or ( k == "dev" and tostring(v)==tostring(deviceNum) ) ) then
					table.insert( d, string.format("%s=%s", tostring(k), tostring(v)) )
				end
			end
			resp = resp .. table.concat( d, ", " ) .. EOL
		end
	end
	return resp
end

-- A "safer" JSON encode for Lua structures that may contain recursive references.
-- This output is intended for display ONLY, it is not to be used for data transfer.
local function alt_json_encode( st, seen )
	seen = seen or {}
	str = "{"
	local comma = false
	for k,v in pairs(st) do
		str = str .. ( comma and "," or "" )
		comma = true
		str = str .. '"' .. k .. '":'
		if type(v) == "table" then
			if seen[v] then str = str .. '"(recursion)"'
			else
				seen[v] = k
				str = str .. alt_json_encode( v, seen )
			end
		else
			str = str .. stringify( v, seen )
		end
	end
	str = str .. "}"
	return str
end

-- Stringify a primitive type
stringify = function( v, seen )
	if v == nil then
		return "(nil)"
	elseif type(v) == "number" or type(v) == "boolean" then
		return tostring(v)
	elseif type(v) == "table" then
		return alt_json_encode( v, seen )
	end
	return string.format( "%q", tostring(v) )
end

local function shortDate( d )
	d = tonumber(d) or 0
	if d == 0 then return "n/a" end
	local delta = math.abs( os.time() - d )
	if delta < 86400 then
		return os.date("%X", d)
	elseif delta < (86400*364) then
		return os.date("%m-%d.%X", d)
	end
	return os.date("%Y-%m-%d.%X", d)
end

local function getLuupSceneSummary( scd )
	local r = EOL
	local pfx = "            "
	if ( scd.lua or "" ) ~= "" then
		r = r .. pfx .. "Scene Lua:" .. EOL
		r = r .. getLuaSummary( scd.lua, scd.encoded_lua, pfx .. "  %6d: %s" )
	end
	for ix,gr in ipairs( scd.groups or {} ) do
		r = r .. string.format( "%sGroup %d", pfx, ix )
		if ( gr.delay or 0 ) > 0 then
			r = r .. string.format( " delay %d", gr.delay )
		end
		r = r .. EOL
		for _,ac in ipairs( gr.actions or {} ) do
			r = r .. string.format( "%s    Device %s (%s) %s/%s ", pfx,
				ac.device,
				(luup.devices[tonumber(ac.device or -1) or -1] or {}).description or "?missing?",
				ac.service, ac.action )
			local pp = {}
			for iz,p in ipairs( ac.arguments or {} ) do
				table.insert( pp, string.format( "%s=%q", p.name or tostring(iz), tostring(p.value) ) )
			end
			if #pp then
				r = r .. "( " .. table.concat( pp, ", " ) .. " )" .. EOL
			end
		end
	end
	return r
end

local function showGeofenceData( r )
	r = r or ""
	local data = getVarJSON( "IsHome", {}, pluginDevice, MYSID )
	r = r .. "  Geofence: running in " .. (geofenceMode < 0 and "long" or "quick") .. " mode" ..
		", last update " .. shortDate( data.since ) ..
		", data version " .. tostring(data.version) ..
		EOL
	for user,udata in pairs( data.users or {} ) do
		r = r .. "            User " .. tostring(user) .. " ishome=" .. tostring(udata.ishome) ..
			" inlist=" .. table.concat( udata.inlist or {} ) .. " since=" .. shortDate( udata.since ) .. EOL
		for _,tdata in pairs( udata.tags or {} ) do
			r = r .. "            " .. string.format("|%5d %q type=%q status=%q since=%s",
				tdata.id, tdata.name or "",
				(tdata.homeloc or 0)~=0 and "home" or "other",
				tdata.status or "",
				tdata.since ~= nil and shortDate( tdata.since ) or "n/a") ..
				EOL
		end
	end
	r = r .. "            Raw: " .. getReactorVar( "raw_udgeo", "" ) .. EOL
	return r
end

function getCondOpt( cond )
	local condopt = cond.options or {}
	local r = ""
	if condopt.after then
		if ( condopt.aftertime or 0 ) > 0 then
			r = r .. " within " .. tostring(condopt.aftertime) .. "s"
		end
		r = r .. " after " .. condopt.after
	end
	if condopt.duration then
		r = r .. " for " .. ( condopt.duration_op or "ge" ) ..
			" " .. condopt.duration .. "s"
	end
	if condopt.repeatcount then
		r = r .. " repeats " .. condopt.repeatcount ..
			" within " .. ( condopt.repeatwithin or 60 ).. "s"
	end
	if (condopt.latch or 0) ~= 0 then
		r = r .. "; output latching"
	elseif (condopt.pulsetime or 0) > 0 then
		r = r .. "; output pulse " .. condopt.pulsetime .. "s on"
		if ( condopt.pulsebreak or 0 ) > 0 then
			r = r .. " " .. condopt.pulsebreak .. "s off and repeat"
			if ( condopt.pulsecount or 0 ) > 0 then
				r = r .. " max " .. condopt.pulsecount .. " times"
			end
		end
	elseif (condopt.holdtime or 0) > 0 then
		r = r .. "; output follow, delay reset for " .. condopt.holdtime .. "s"
	end
	return r
end

function RG( grp, condState, level, r )
	r = r or ""
	level = level or 1
	local gs = condState[ grp.id ] or {}
	r = r .. "\"" .. (grp.name or grp.id) .. "\" (" ..
		( grp.invert and "NOT " or "" ) .. (grp.operator or "and"):upper() .. ") " ..
		getCondOpt( grp ) ..
		( gs.evalstate and " TRUE" or " false" ) .. " as of " .. shortDate( gs.evalstamp ) ..
		( grp.disabled and " DISABLED" or "" ) ..
		( gs.pulsecount and ( " pulses " .. gs.pulsecount ) or "" ) ..
		' <' .. tostring(grp.id) .. '>' ..
		EOL
	local opch = ({ ['and']="&", ['or']="|", xor="^", ['nul']="Z" })[grp.operator or "and"] or "+"
	for _,cond in ipairs( grp.conditions or {} ) do
		local condtype = cond.type or "group"
		local cs = condState[cond.id] or {}
		r = r .. "    " .. string.rep( "  |   ", level-1 ) ..
			"  " .. opch .. "-" .. ( cond.disabled and "X" or ( (cs.evalstate == nil) and "?" or ( cs.evalstate and "T" or "F" ) ) ) ..
			"-" .. condtype .. " "
		if condtype == "group" then
			r = r .. RG( cond, condState, level+1 )
		elseif condtype == "service" then
			r = r .. string.format("%s (%d) ", cond.device == -1 and "(self)" or ( ( luup.devices[cond.device]==nil ) and ( "*** missing " .. ( cond.devicename or "unknown" ) ) or
				luup.devices[cond.device].description ), cond.device )
			r = r .. string.format("%s/%s %s %s", cond.service or "?", cond.variable or "?", cond.operator or "?",
				cond.value or "")
			if cond.nocase == 0 then r = r .. " (match case)" end
			if cond.device ~= -1 then
				summaryDevices[tostring(cond.device)] = true
				if ( ( luup.devices[cond.device] or {} ).device_num_parent or 0 ) ~= 0 then
					summaryDevices[tostring(luup.devices[cond.device].device_num_parent)] = true
				end
			end
		elseif condtype == "grpstate" then
			r = r .. string.format("%s (%d) ", cond.device == -1 and "(self)" or ( ( luup.devices[cond.device]==nil ) and ( "*** missing " .. ( cond.devicename or "unknown" ) ) or
				luup.devices[cond.device].description ), cond.device )
			r = r .. ( cond.groupname or cond.groupid or "?" ) .. " (" .. ( cond.groupid or "?" ) .. ")"
			r = r .. ' ' .. ( cond.operator or "op?" )
		elseif condtype == "comment" then
			r = r .. string.format("%q", cond.comment)
		elseif condtype == "housemode" then
			r = r .. "in " .. ( cond.value or "" )
		elseif condtype == "sun" then
			r = r .. ( cond.operator or "?" ) .. " " .. ( cond.value or "" )
		elseif condtype == "trange" then
			r = r .. ( cond.operator or "?" ) .. " " .. ( cond.value or "" )
		elseif condtype == "ishome" then
			r = r .. ( cond.operator or "is" ) .. " " .. ( cond.value or "" )
		elseif condtype == "reload" then
		elseif condtype == "interval" then
			if (cond.days or 0) > 0 then r = r .. cond.days .. "d" end
			r = r .. string.format("%02dh:%02dm", tonumber(cond.hours) or 0, tonumber(cond.mins) or 0)
			if cond.relto == "condtrue" then
				r = r .. " relative to <" .. (cond.relcond or "?") .. "> true"
			end
		elseif condtype == "var" then
			r = r .. string.format("%s %s %s", tostring(cond.var), tostring(cond.operator),
				tostring(cond.value))
		else
			r = r .. json.encode(cond)
		end
		if condtype ~= "group" then
			r = r .. getCondOpt( cond )
		end
		if not (":comment:group:"):match( condtype ) then
			r = r .. " ["
			if cs.priorvalue then r = r .. tostring(cs.priorvalue) .. " => " end
			r = r .. tostring(cs.lastvalue) .. " at " .. shortDate( cs.valuestamp )
			r = r .. ( cs.laststate and "; T" or "; F" ) .. "/" .. (cs.evalstate and "T" or "F" )
			r = r .. " as of " .. shortDate( cs.statestamp ) .. "/" .. shortDate( cs.evalstamp )
			if cs.pulsecount then
				r = r .. "; pulses " .. cs.pulsecount
			end
			r = r .. "]"
		end
		if condtype ~= "group" then
			r = r .. " <" .. cond.id .. ">"
			r = r .. EOL
		end
	end
	return r
end

function requestSummary( lul_request, lul_parameters, lul_outputformat, deviceNum ) -- luacheck: ignore 212
	local r = ([[
INSTRUCTIONS FOR POSTING TO VERA COMMUNITY FORUMS:
	* COPY/PASTE ALL lines AFTER the ===== separator below, INCLUDING the ``` lines.
	* DO NOT omit the ``` lines! They must be included to preserve report formatting!
	* DO NOT edit or redact this report. If you have privacy concerns about posting it to the forums, send via email, below.

INSTRUCTIONS FOR EMAILING (BETTER PRIVACY):
	> Use this method if you have concerns about posting the report contents publicly.
	* Right-click in this pane and choose "Save as..." to save this entire report to a file.
	* ATTACH the file in an email to: reactor@toggledbits.com
	* DO NOT copy/paste the report text into the email body! Attachments only please.
	* Include your forum name in the body of the email, so I know who you are.
	* Please let me know via the community forums that you've emailed a report.
	* Please DO NOT use this email address for any other communication. It's for report attachments only.

THANK YOU IN ADVANCE FOR READING AND FOLLOWING THESE INSTRUCTIONS! ALTHOUGH MY TIME IS FREE, I DON'T ALWAYS HAVE A LOT OF IT,
SO YOUR DILIGENCE REALLY HELPS ME WORK AS QUICKLY AND EFFICIENTLY AS POSSIBLE.

=====

]]):gsub("\t","  ")
	r = r .. "```" .. EOL
	r = r .. string.rep("*", 51) .. " REACTOR LOGIC SUMMARY REPORT " .. string.rep("*", 51) .. EOL
	r = r .. "   Version: " .. tostring(_PLUGIN_VERSION) ..
		" config " .. tostring(_CONFIGVERSION) ..
		" cdata " .. tostring(_CDATAVERSION) ..
		" ui " .. tostring(_UIVERSION) ..
		" pluginDevice " .. pluginDevice ..
		" LuaXP " .. tostring(luaxp and luaxp._VERSION or "not loaded") ..
		EOL
	r = r .. "    System: "
	if isOpenLuup then
		local v = getVarNumeric( "Vnumber", 0, isOpenLuup, "openLuup" )
		r = r .. "openLuup version " .. tostring(v)
		local p = io.popen( "uname -a" )
		if p then
			v = p:read("*l")
			p:close()
			r = r .. " on " .. tostring(v)
		end
	else
		r = r .. "Vera version " .. tostring(luup.version) .. " (" ..
			(luup.short_version or "pre-7.30") ..
			") on ".. tostring(luup.attr_get("model",0) or "") ..
			" ID " .. tostring(luup.modelID) ..
			" (" .. ( ({["35"]="Vera Edge", ["36"]="Vera Plus", ["37"]="Vera Secure"})[tostring(luup.modelID or "X")] or "unknown" ) .. ")"
	end
	r = r .. "; loadtime " .. tostring( luup.attr_get('LoadTime',0) or "" )
	r = r .. "; systemReady " .. tostring( systemReady )
	if isALTUI then
		r = r .. "; ALTUI"
		local v = luup.variable_get( "urn:upnp-org:serviceId:altui1", "Version", isALTUI )
		r = r .. " " .. tostring(v)
	end
	r = r .. "; " .. tostring((_G or {})._VERSION)
	pcall( function()
		if json then r = r .. "; JSON " .. (json.version or "unknown") .. (json.using_lpeg and "+LPeg" or "" ) end
	end )
	r = r .. "; UnsafeLua=" .. tostring(luup.attr_get( "UnsafeLua", 0 ) or "nil")
	r = r .. EOL
	r = r .. "Local time: " .. os.date("%Y-%m-%dT%H:%M:%S%z") ..
		"; DST=" .. getReactorVar( "LastDST", "?" ) ..
		"; " .. tostring(luup.attr_get("City_description",0) or "") ..
		", " .. tostring(luup.attr_get("Region_description",0) or "") ..
		" " .. tostring(luup.attr_get("Country_description",0) or "") ..
		"; formats " .. tostring(dateFormat) .. " " .. tostring(timeFormat) ..
		EOL
	r = r .. "House mode: plugin " .. getReactorVar( "HouseMode", "?") ..
		"; system " .. tostring( luup.attr_get('Mode',0) or "" ) ..
		"; tracking " .. ( usesHouseMode and "on" or "off" ) .. EOL
	r = r .. "  Sun data: " .. getReactorVar( "sundata", "" ) .. EOL
	if geofenceMode ~= 0 then
		local status, p = pcall( showGeofenceData )
		if status then
			r = r .. p
		else
			r = r .. "  Geofence: parse error, " .. tostring(p) .. EOL
		end
	else
		r = r .. "  Geofence: not running" .. EOL
	end
	if hasBattery then
		r = r .. "     Power: " .. getReactorVar( "SystemPowerSource", "?")
		r = r .. ", battery level " .. getReactorVar( "SystemBatteryLevel", "?") .. EOL
	end
	for n,d in pairs( luup.devices ) do
		local scenesUsed = {}
		summaryDevices = {}
		if d.device_type == RSTYPE and ( deviceNum==nil or n==deviceNum ) then
			D("requestSummary() handling device %1 %2", n, d.description)
			local status = ( ( getVarNumeric( "Armed", 0, n, SENSOR_SID ) ~= 0 ) and " armed" or "" )
			status = status .. ( ( getVarNumeric("Tripped", 0, n, SENSOR_SID ) ~= 0 ) and " tripped" or "" )
			status = status .. ( ( getVarNumeric("Trouble", 0, n, RSSID ) ~= 0 ) and " TROUBLE" or "" )
			r = r .. string.rep( "*", 132 ) .. EOL
			r = r .. string.format("%s (#%d)%s", tostring(d.description), n, status) .. EOL
			local cdata = getSensorConfig( n )
			if not cdata then
				r = r .. "    **** UNPARSEABLE CONFIGURATION ****" .. EOL
			else
				r = r .. string.format("    Version %s.%s %s", cdata.version or 0, cdata.serial or 0, os.date("%x %X", cdata.timestamp or 0)) .. EOL
				r = r .. string.format("    Message/status: %s", getVar( "Message", "", n ) ) .. EOL
				local s = getVarNumeric( "TestTime", 0, n, RSSID )
				if s ~= 0 then
					r = r .. string.format("    Test time set: %s", os.date("%Y-%m-%d %H:%M", s)) .. EOL
				end
				s = getVarNumeric( "TestHouseMode", 0, n, RSSID )
				if s ~= 0 then
					r = r .. string.format("    Test house mode set: %d", s) .. EOL
				end
				local condState = loadCleanState( n )
				local first = true
				for _,vv in variables( cdata ) do
					if first then
						r = r .. "    Variable/expressions" .. EOL
						first = false
					end
					local vs = (condState.vars or {})[vv.name] or {}
					local lv = vs.lastvalue
					local vt = type(lv)
					if vt == "table" and lv.__type == "null" then lv = "null" vt = "luaxp.null"
					elseif vt == "string" or vt == "table" then lv = json.encode( lv )
					elseif lv == nil then lv = "(no value)"
					else lv = tostring( lv ) end
					r = r .. string.format("     %3d: %-24s %s [last %s(%s)]", vv.index or 0, vv.name or "?", vv.expression or "?", lv, vt) ..
						( (vv.export or 1) ~= 0 and " (exported)" or "" ) ..
						EOL
					if vs.err then r = r .. "          *** Error: " .. tostring(vs.err) .. EOL end
				end
				r = r .. "    Condition group " .. RG( cdata.conditions.root or {}, condState )

				for k,v in pairs( cdata.activities or {} ) do
					r = r .. getReactorScene( k, v, n, scenesUsed, cdata )
				end

				r = r .. getEvents( n )
			end

			D("requestSummary() summaryDevices")
			if next( summaryDevices ) then
				r = r .. "    Devices" .. EOL
				for kd in pairs( summaryDevices ) do
					local nd = tonumber( kd ) or -1
					local sd = luup.devices[nd]
					if sd == nil then
						r = r .. string.format( "        *** UNKNOWN DEVICE #%s%s", kd, EOL )
					else
						local pn = luup.attr_get( 'plugin', nd ) or ""
						r = r .. string.format( "        %s (%d) %s (%s/%s); parent %d; plugin %s; mfg %s model %s; dev %s impl %s%s",
							sd.description or "?", nd,
							sd.device_type or "?",
							sd.category_num or "?", sd.subcategory_num or "?",
							sd.device_num_parent or -1,
							(pn == "") and "-" or pn,
							luup.attr_get( 'manufacturer', nd ) or "-",
							luup.attr_get( 'model', nd ) or "-",
							luup.attr_get( 'device_file', nd ) or "-",
							luup.attr_get( 'impl_file', nd ) or "-",
							EOL )
					end
				end
			end
			summaryDevices = nil

			D("requestSummary() watchData")
			if next(watchData) then
				r = r .. "    Watches" .. EOL
				for key,devs in pairs( watchData or {} ) do
					for dev in pairs( devs or {} ) do
						if tonumber(dev) == deviceNum then
							if not pcall(
								function( kk )
									local dd = split( kk, '/' )
									r = r .. string.format("        Device #%s %s service %s variable %s%s",
										dd[1] or "nil",
										( luup.devices[tonumber(dd[1]) or -1] or {} ).description or "(deleted/unknown",
										dd[2] or "nil", dd[3] or nil,
										EOL )
								end, key )
							then
								r = r .. "        Error formatting " .. tostring(key) .. "=" ..
									tostring(dev) .. EOL
							end
							break
						end
					end
				end
			end

			D("requestSummary() special config")
			local first = true
			for _,v in ipairs( { "UseReactorScenes", "LogEventsToFile", "EventLogMaxKB", "Retrigger", "AutoUntrip", "MaxUpdateRate", "MaxChangeRate", "FailOnTrouble", "ContinuousTimer", "ForceGeofenceMode", "StateCacheExpiry", "SuppressLuupRestartUpdate", "UseLegacyTripBehavior", "RequestActionResponseLimit", "RequestActionTimeout", "RequestUseCurl", "RequestCurlOptions" } ) do
				local val = luup.variable_get( RSSID, v, deviceNum ) or ""
				if val ~= "" then
					if first then first=false r = r .. "    Special Configuration" .. EOL end
					r = r .. "        " .. v .. " = " .. val .. EOL
				end
			end

			D("requestSummary() scenesUsed")
			if next( scenesUsed ) then
				r = r .. "    Scenes" .. EOL
				for scid, scd in pairs( scenesUsed ) do
					r = r .. '        Scene #' .. scid .. " " .. tostring(scd.name)
					local success, t = pcall( getLuupSceneSummary, scd )
					if success and t then
						r = r .. t
					else
						r = r .. " - summary not available: " .. tostring(t) .. EOL
					end
				end
			end
		end
	end
	r = r .. "```" .. EOL
	D("requestSummary() done")
	return r
end

function request( lul_request, lul_parameters, lul_outputformat )
	D("request(%1,%2,%3) luup.device=%4", lul_request, lul_parameters, lul_outputformat, luup.device)
	local action = lul_parameters['action'] or lul_parameters['command'] or ""
	local deviceNum = tonumber( lul_parameters['device'] )
	if action == "debug" then
		if lul_parameters.debug ~= nil then
			debugMode = TRUESTRINGS:match( lul_parameters.debug )
		else
			debugMode = not debugMode
		end
		D("debug set %1 by request", debugMode)
		if debugMode then maxEvents = math.max( 250, maxEvents ) end
		return "Debug is now " .. ( debugMode and "on" or "off" ) .. ", maxEvents=" .. maxEvents, "text/plain"

	elseif action == "preloadscene" then
		-- Preload scene used by a ReactorSensor. Call by UI during edit.
		if ( lul_parameters.flush or 0 ) ~= 0 then
			-- On demand, flush all scene data.
			sceneData = {}
			luup.variable_set( MYSID, "scenedata", "{}", pluginDevice )
		end
		local status, msg = pcall( loadScene, tonumber(lul_parameters.scene or 0), pluginDevice )
		return json.encode( { status=status,message=msg } ), "application/json"

	elseif action == "purge" then
		-- Purge scene data
		luup.variable_set( MYSID, "scenedata", "{}", pluginDevice )
		scheduleDelay( { id="reload", func=luup.reload, owner=pluginDevice }, 2 )
		return  "Purged; reloading Luup.", "text/plain"

	elseif action == "clearconditionstate" then
		if luup.devices[deviceNum] and luup.devices[deviceNum].device_type == RSTYPE then
			clearConditionState( deviceNum )
			return json.encode( { status=true } ), "application/json"
		end
		L({level=2,msg="Invalid clearconditionstate action device %1"}, deviceNum)
		return "ERROR\nInvalid device in request", "text/plain"

	elseif action == "clearpluginstate" then
		L({level=2,msg="Request to clear plugin state... here we go..."})
		local children = {}
		for n,d in pairs( luup.devices ) do
			if d.device_num_parent == pluginDevice and d.device_type == RSTYPE then
				table.insert( children, n )
				setVar( RSSID, "Message", "Stopped", n )
				stopScene( nil, nil, n ) -- stop all scenes for this device
				clearOwnerTasks( n )
				clearConditionState( n )
			end
		end
		sceneState = {}
		luup.variable_set( MYSID, "runscene", "{}", pluginDevice )
		sceneData = {}
		luup.variable_set( MYSID, "scenedata", "{}", pluginDevice )
		luup.variable_set( MYSID, "IsHome", "{}", pluginDevice )
		luaFunc = {}
		L"Plugin state cleared; restarting sensors."
		for _,n in ipairs( children ) do
			pcall( actionRestart, n )
		end
		return '{"status":true,"message":"Plugin state cleared"}', "application/json"

	elseif action == "summary" then
		D("request() generating summary for %1", deviceNum )
		local ok, r = pcall( requestSummary, lul_request, lul_parameters, lul_outputformat, deviceNum )
		if not ok then return "ERROR\nHandler error: "..tostring(r), "text/plain" end
		return r, "text/plain"

	elseif action == "tryexpression" then
		if luup.devices[deviceNum] == nil or luup.devices[deviceNum].device_type ~= RSTYPE then
			return json.encode{ status=false, message="Invalid device number" }, "application/json"
		end
		local expr = lul_parameters['expr'] or ""
		local sst = getSensorState( deviceNum )
		local cdata = getSensorConfig( deviceNum )
		local ctx = sst.ctx or getExpressionContext( cdata, deviceNum )
		-- if debugMode then luaxp._DEBUG = D end
		D("request() tryexpression expr=%1", expr)
		if expr:match( "^%s*$" ) then
			return json.encode( { status=true, resultValue="", err={ message="no expression" }, expression=expr } ), "application/json"
		end
		local result, err = luaxp.evaluate( expr, ctx )
		return json.encode( { status=true, resultValue=result, err=err or false, expression=expr } ), "application/json"

	elseif action == "testlua" then
		local _,err = loadstring( lul_parameters.lua or "" )
		if err then
			return json.encode{ status=false, message=err }, "application/json"
		end
		return json.encode{ status=true, message="Lua OK" }, "application/json"

	elseif action == "infoupdate" then
		-- Fetch and install updated deviceinfo file; these will change more frequently than the plugin.
		-- Updates are user-driven from the UI, and the user is advised that the version of firmware is
		-- sent to my server to ensure that the correct file is received (if per-version exceptions are
		-- needed). The version info and any other data collected by the process are not stored except
		-- in temporary logs that are periodically purged, and not for any analytical purpose.
		local targetPath = getInstallPath() .. "D_ReactorDeviceInfo.json"
		local tmpPath = "/tmp/D_ReactorDeviceInfo.tmp"
		if isOpenLuup then
			tmpPath = targetPath:gsub( "%.json.*$", ".tmp" )
		end
		local http = require("socket.http")
		local ssl = require "ssl"
		local https = require("ssl.https")
		local ltn12 = require("ltn12")
		local f = io.open( tmpPath , "w" )
		if not f then return json.encode{ status=false, message="A temporary file could not be opened", path=tmpPath }, "application/json" end
		local body = "action=fetch&fv=" .. luup.version .. "&pv=" .. _PLUGIN_VERSION
		local req =  {
			method = "POST",
			url = "https://www.toggledbits.com/deviceinfo/latest.php",
			redirect = false,
			headers = { ['Content-Length']=string.len( body ), ['Content-Type']="application/x-www-form-urlencoded" },
			source = ltn12.source.string( body ),
			sink = ltn12.sink.file( f ),
			verify = getReactorVar( "SSLVerify", "none" ),
			protocol = getReactorVar( "SSLProtocol", (ssl._VERSION or "0.5"):match( "^0%.[45]") and "tlsv1" or "any" ),
			options = getReactorVar( "SSLOptions", "all" )
		}
		http.TIMEOUT = 30
		https.TIMEOUT = 30
		local cond, httpStatus, httpHeaders = https.request( req )
		D("doMatchQuery() returned from request(), cond=%1, httpStatus=%2, httpHeaders=%3", cond, httpStatus, httpHeaders)
		-- No need to close f, the sink does it for us.
		-- Handle special errors from socket library
		if tonumber(httpStatus) == nil then
			respBody = httpStatus
			httpStatus = 500
		end
		if httpStatus == 200 then
			local es
			if isOpenLuup then
				-- openLuup just copies file, no compression.
				es = os.execute( "mv -f '" .. tmpPath .. "' '" .. targetPath .. "'" )
			else
				-- Save to compressed (LZO) file on Vera Luup.
				os.remove( targetPath ) -- remove uncompressed if present
				es = os.execute( string.format( "pluto-lzo c '%s' '%s.lzo'", tmpPath, targetPath ) )
			end
			if es ~= 0 then
				return json.encode{ status=false, exitStatus=es,
					message="The download was successful but the updated file could not be installed;" ..
					" please move " .. tmpPath .. " to " .. targetPath },
					"application/json"
			end
			os.remove( tmpPath )
			return json.encode{ status=true, message="Device info updated" }, "application/json"
		end
		os.remove( tmpPath )
		return json.encode{ status=false, message="Download failed (" .. tostring(httpStatus) .. ")" }, "application/json"

	elseif action == "submitdevice" then

		D("request() submitdevice with data %1", lul_parameters.data)
		local http = require("socket.http")
		local https = require("ssl.https")
		local ltn12 = require("ltn12")
		local body = lul_parameters.data
		local resp = {}
		local req =  {
			method = "POST",
			url = "https://www.toggledbits.com/deviceinfo/submitdevice.php",
			redirect = false,
			headers = { ['Content-Length']=string.len( body ), ['Content-Type']="application/json" },
			source = ltn12.source.string( body ),
			sink = ltn12.sink.table(resp),
			verify = getReactorVar( "SSLVerify", "none" ),
			protocol = getReactorVar( "SSLProtocol", "tlsv1_2" ),
			options = getReactorVar( "SSLOptions", "all" )
		}
		http.TIMEOUT = 30
		https.TIMEOUT = 30
		local cond, httpStatus, httpHeaders = https.request( req )
		D("doMatchQuery() returned from request(), cond=%1, httpStatus=%2, httpHeaders=%3", cond, httpStatus, httpHeaders)
		-- Handle special errors from socket library
		if tonumber(httpStatus) == nil then
			respBody = httpStatus
			httpStatus = 500
		end
		if httpStatus == 200 then
			return json.encode( { status=true, message="OK" } ), "application/json"
		end
		return json.encode( { status=false, message="Can't send device info, status " .. httpStatus } ), "application/json"

	elseif action == "config" or action == "backup" then
		local st = { _comment="Reactor configuration " .. os.date("%x %X"), timestamp=os.time(), version=_PLUGIN_VERSION, sensors={} }
		for k,v in pairs( luup.devices ) do
			if v.device_type == RSTYPE then
				st.sensors[tostring(k)] = { name=v.description, devnum=k }
				local c,err = getVarJSON( "cdata", {}, k, RSSID )
				if not c or err then
					st.sensors[tostring(k)]._comment = "Unable to parse configuration: " .. tostring(err)
				else
					st.sensors[tostring(k)].config = c
				end
			end
		end
		local bdata = json.encode( st )
		if action == "backup" then
			local bfile = getInstallPath() .. "reactor-config-backup.tmp"
			local f = io.open( bfile, "w" )
			if f then
				f:write( bdata )
				f:close()
				if not isOpenLuup then
					os.execute( "pluto-lzo c '" .. getInstallPath() .. "reactor-config-backup.tmp' '" ..
						getInstallPath() .. "reactor-config-backup.json.lzo'" )
					-- Remove uncompressed file, which would now rot and interfere with download of new
					os.remove( getInstallPath() .. "reactor-config-backup.json" )
				else
					os.execute( "mv -f '" .. bfile .. "' '" .. getInstallPath() .. "reactor-config-backup.json'" )
				end
			else
				error("ERROR can't write " .. bfile)
			end
			return json.encode( { status=true, message="Done!", file=bfile } ), "application/json"
		end
		return bdata, "application/json"

	elseif action == "getcurrentbackup" then
		local bfile = getInstallPath() .. "reactor-config-backup.json"
		local tfile = getInstallPath() .. "reactor-config-backup.tmp"
		local f = io.open( bfile .. ".lzo", "r" )
		if f then
			f:close()
			os.execute( "pluto-lzo d '" .. bfile .. ".lzo' '" .. tfile .. "'" )
			bfile = tfile
			f = false
		end
		if not f then f = io.open( bfile, "r" ) end
		if not f then
			return '{"backupstatus":false}', "application/json"
		else
			local r = f:read( "*a" )
			f:close()
			os.remove( tfile )
			return r, "application/json"
		end

	elseif action == "status" then
		local st = {
			name=_PLUGIN_NAME,
			plugin=_PLUGIN_ID,
			version=_PLUGIN_VERSION,
			configversion=_CONFIGVERSION,
			cdataversion=_CDATAVERSION,
			uiversion=_UIVERSION,
			svcversion=_SVCVERSION,
			author="Patrick H. Rigney (rigpapa)",
			url=_PLUGIN_URL,
			['type']=MYTYPE,
			responder=luup.device,
			timestamp=os.time(),
			system = {
				version=luup.version,
				isOpenLuup=isOpenLuup,
				isALTUI=isALTUI,
				hardware=luup.attr_get("model",0),
				lua=tostring((_G or {})._VERSION)
			},
			devices={}
		}
		for k,v in pairs( luup.devices ) do
			if v.device_type == MYTYPE or v.device_type == RSTYPE then
				local devinfo = getDevice( k, pluginDevice, v ) or {}
				if v.device_type == RSTYPE then
					devinfo.sensorState = sensorState[tostring(k)]
				elseif k == pluginDevice then
					devinfo.watchData = watchData
					devinfo.tickTasks = tickTasks
					devinfo.sceneData = sceneData
					devinfo.sceneState = sceneState
					devinfo.sceneWaiting = sceneWaiting
				end
				table.insert( st.devices, devinfo )
			end
		end
		return alt_json_encode( st ), "application/json"

	elseif action == "files" then
		local path = getInstallPath()
		local inf = { timestamp=os.time(), files={}, pluginVersion=_PLUGIN_VERSION, serviceVersion=_SVCVERSION, installpath=path }
		for _,fn in ipairs( { "D_ReactorDeviceInfo.json", "D_ReactorSensor_UI7.json", "D_ReactorSensor.xml", "D_Reactor_UI7.json",
			"D_Reactor.xml", "I_Reactor.xml", "J_Reactor_ALTUI.js", "J_ReactorSensor_ALTUI.js", "J_ReactorSensor_UI7.js",
			"J_Reactor_UI7.js", "L_LuaXP_Reactor.lua", "L_Reactor.lua", "S_ReactorSensor.xml", "S_Reactor.xml" } ) do
			local ff = path .. fn
			local f = io.open( ff, "r" )
			local usesCompressed = f == nil
			if usesCompressed then
				os.execute( "pluto-lzo d "..ff..".lzo /tmp/reactorfile.tmp" )
				ff = "/tmp/reactorfile.tmp"
			else
				f:close()
			end
			local p = io.popen( "md5sum "..ff )
			if p then
				local sum = p:read("*a")
				sum = tostring(sum or ""):gsub( "%s+.*$", "" )
				p:close()
				inf.files[fn] = { compressed=usesCompressed or nil, check=sum }
			else
				inf.files[fn] = { notice="No data" }
			end
			os.remove( "/tmp/reactorfile.tmp" )
		end
		return alt_json_encode( inf ), "application/json"

	elseif action == "alive" then
		local loadtime = getVarNumeric( "LoadTime", 0, pluginDevice, MYSID )
		return alt_json_encode( { status=true, loadtime=loadtime } ), "application/json"

	elseif action == "serviceinfo" then
		error("not yet implemented")

	else
		error("Not implemented: " .. action)
	end
end
