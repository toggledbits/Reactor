--[[
    L_Reactor.lua - Core module for Reactor
    Copyright 2017,2018,2019 Patrick H. Rigney, All Rights Reserved.
    This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
--]]
--luacheck: std lua51,module,read globals luup,ignore 542 611 612 614 111/_,no max line length

module("L_Reactor", package.seeall)

local debugMode = false

local _PLUGIN_ID = 9086
local _PLUGIN_NAME = "Reactor"
local _PLUGIN_VERSION = "2.4develop"
local _PLUGIN_URL = "https://www.toggledbits.com/reactor"
local _CONFIGVERSION = 00206

local MYSID = "urn:toggledbits-com:serviceId:Reactor"
local MYTYPE = "urn:schemas-toggledbits-com:device:Reactor:1"

local VARSID = "urn:toggledbits-com:serviceId:ReactorValues"

local RSSID = "urn:toggledbits-com:serviceId:ReactorSensor"
local RSTYPE = "urn:schemas-toggledbits-com:device:ReactorSensor:1"

local SENSOR_SID = "urn:micasaverde-com:serviceId:SecuritySensor1"
local SWITCH_SID = "urn:upnp-org:serviceId:SwitchPower1"

local sensorState = {}
local tickTasks = {}
local watchData = {}
local luaFunc = {}
local devicesByName = {}
local sceneData = {}
local sceneWaiting = {}
local sceneState = {}
local hasBattery = true
local geofenceMode = 0
local maxEvents = 50
local luaEnv -- global state for all runLua actions

local runStamp = 0
local pluginDevice = 0
local isALTUI = false
local isOpenLuup = false

local TICKOFFS = 5 -- cond tasks try to run TICKOFFS seconds after top of minute

local TRUESTRINGS = ":y:yes:t:true:on:1:" -- strings that mean true (also numeric ~= 0)

local defaultLogLevel = false -- or a number, which is (uh...) the default log level for messages

local json = require("dkjson")
local luaxp -- will only be loaded if needed

local function dump(t, seen)
    if t == nil then return "nil" end
    if seen == nil then seen = {} end
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
        str = tostring(msg.prefix or _PLUGIN_NAME) .. ": " .. tostring(msg.msg)
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
    luup.log(str, level)
end

local function D(msg, ...)
    if debugMode then
        L( { msg=msg,prefix=(_PLUGIN_NAME .. "(debug)") }, ... )
    end
end

local function checkVersion(dev)
    local ui7Check = luup.variable_get(MYSID, "UI7Check", dev) or ""
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

local function split( str, sep )
    if sep == nil then sep = "," end
    local arr = {}
    if str == nil or #str == 0 then return arr, 0 end
    local rest = string.gsub( str or "", "([^" .. sep .. "]*)" .. sep, function( m ) table.insert( arr, m ) return "" end )
    table.insert( arr, rest )
    return arr, #arr
end

-- Shallow copy
local function shallowCopy( t )
    local r = {}
    for k,v in pairs(t or {}) do
        r[k] = v
    end
    return r
end

-- Initialize a variable if it does not already exist.
local function initVar( name, dflt, dev, sid )
    assert( dev ~= nil )
    assert( sid ~= nil )
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
    local s = luup.variable_get( sid, name, dev ) or ""
    -- D("setVar(%1,%2,%3,%4) old value %5", sid, name, val, dev, s )
    if s ~= val then
        luup.variable_set( sid, name, val, dev )
    end
    return s
end

-- Get numeric variable, or return default value if not set or blank
local function getVarNumeric( name, dflt, dev, sid )
    assert( dev ~= nil )
    assert( name ~= nil )
    sid = sid or RSSID
    local s = luup.variable_get( sid, name, dev )
    if (s == nil or s == "") then return dflt end
    s = tonumber(s, 10)
    if (s == nil) then return dflt end
    return s
end

-- Get var that stores JSON data. Returns data, error flag.
local function getVarJSON( name, dflt, dev, sid )
    assert( dev ~= nil and name ~= nil )
    sid = sid or RSSID
    local s = luup.variable_get( sid, name, dev ) or ""
    if s == "" then return dflt,false end
    local data,pos,err = json.decode( s )
    if err then return dflt,err,pos,s end
    return data,false
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
    local locale_offset = os.difftime( t, os.time( os.date("!*t", t) ) )
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
        if not wid then wid = 0.0144862 end
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
        JE(Jt), 24*w0(rlat,elev,decl)/pi
end

-- Add, if not already set, a watch on a device and service
local function addServiceWatch( dev, svc, var, target )
    -- Don't watch our own variables--we update them in sequence anyway
    if dev == target and svc == VARSID then return end
    target = tostring(target)
    local watchkey = string.format("%d:%s/%s", dev or 0, svc or "X", var or "X")
    if watchData[watchkey] == nil or watchData[watchkey][target] == nil then
        D("addServiceWatch() sensor %1 adding watch for %2", target, watchkey)
        luup.variable_watch( "reactorWatch", svc or "X", var or "X", dev or 0 )
        watchData[watchkey] = watchData[watchkey] or {}
        watchData[watchkey][target] = true
    end
end

-- Add an event to the event list. Prune the list for size.
local function addEvent( t )
    local p = shallowCopy(t)
    if p.dev == nil then L({level=2,msg="addEvent(%1) missing 'dev'"},t) end
    p.when = os.time()
    p.time = os.date("%Y%m%dT%H%M%S")
    local dev = p.dev or pluginDevice
    sensorState[tostring(dev)] = sensorState[tostring(dev)] or { eventList={} }
    table.insert( sensorState[tostring(dev)].eventList, p )
    if #sensorState[tostring(dev)].eventList > maxEvents then table.remove(sensorState[tostring(dev)].eventList, 1) end
end

-- Enabled?
local function isEnabled( dev )
    return getVarNumeric( "Enabled", 1, dev, RSSID ) ~= 0
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
    if ( timeTick or 0 ) == 0 then
        D("scheduleTick() clearing task %1", tinfo)
        tickTasks[tkey] = nil
        return
    elseif tickTasks[tkey] then
        -- timer already set, update
        tickTasks[tkey].func = tinfo.func or tickTasks[tkey].func
        tickTasks[tkey].args = tinfo.args or tickTasks[tkey].args
        tickTasks[tkey].info = tinfo.info or tickTasks[tkey].info
        if tickTasks[tkey].when == nil or timeTick < tickTasks[tkey].when or flags.replace then
            -- Not scheduled, requested sooner than currently scheduled, or forced replacement
            tickTasks[tkey].when = timeTick
        end
        D("scheduleTick() updated %1 to %2", tkey, tickTasks[tkey])
    else
        -- New task
        assert(tinfo.owner ~= nil) -- required for new task
        assert(tinfo.func ~= nil) -- required for new task
        tickTasks[tkey] = { id=tostring(tinfo.id), owner=tinfo.owner,
            when=timeTick, func=tinfo.func, args=tinfo.args or {},
            info=tinfo.info or "" }
        D("scheduleTick() new task %1 at %2", tinfo, timeTick)
    end
    -- If new tick is earlier than next plugin tick, reschedule
    tickTasks._plugin = tickTasks._plugin or {}
    if tickTasks._plugin.when == nil or timeTick < tickTasks._plugin.when then
        tickTasks._plugin.when = timeTick
        local delay = timeTick - os.time()
        if delay < 1 then delay = 1 end
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
    if delay < 1 then delay = 1 end
    return scheduleTick( tinfo, os.time()+delay, flags )
end

-- Set the status message
local function setMessage(s, dev)
    assert( dev ~= nil )
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

-- Return the plugin version string
function getPluginVersion()
    return _PLUGIN_VERSION, _CONFIGVERSION
end

-- runOnce() looks to see if a core state variable exists; if not, a one-time initialization
-- takes place.
local function sensor_runOnce( tdev )
    local s = getVarNumeric("Version", 0, tdev, RSSID)
    if s == _CONFIGVERSION then
        -- Up to date.
        return
    elseif s == 0 then
        L("Sensor %1 (%2) first run, setting up new instance...", tdev, luup.devices[tdev].description)
        initVar( "Enabled", "1", tdev, RSSID )
        initVar( "Invert", "0", tdev, RSSID )
        initVar( "Retrigger", "0", tdev, RSSID )
        initVar( "Message", "", tdev, RSSID )
        initVar( "cdata", "{}", tdev, RSSID )
        initVar( "cstate", "", tdev, RSSID )
        initVar( "Runtime", 0, tdev, RSSID )
        initVar( "TripCount", 0, tdev, RSSID )
        initVar( "RuntimeSince", os.time(), tdev, RSSID )
        initVar( "ContinuousTimer", 0, tdev, RSSID )
        initVar( "MaxUpdateRate", "", tdev, RSSID )
        initVar( "MaxChangeRate", "", tdev, RSSID )
        initVar( "UseReactorScenes", 1, tdev, RSSID )

        initVar( "Armed", 0, tdev, SENSOR_SID )
        initVar( "Tripped", 0, tdev, SENSOR_SID )
        initVar( "ArmedTripped", 0, tdev, SENSOR_SID )
        initVar( "LastTrip", 0, tdev, SENSOR_SID )
        initVar( "AutoUntrip", 0, tdev, SENSOR_SID )

        initVar( "Target", 0, tdev, SWITCH_SID )
        initVar( "Status", 0, tdev, SWITCH_SID )

        -- Force this value.
        luup.variable_set( "urn:micasaverde-com:serviceId:HaDevice1", "ModeSetting", "1:;2:;3:;4:", tdev )

        -- Fix up category and subcategory
        luup.attr_set('category_num', 4, tdev)
        luup.attr_set('subcategory_num', 0, tdev)

        luup.variable_set( RSSID, "Version", _CONFIGVERSION, tdev )
        return
    end

    -- Consider per-version changes.
    if s < 00105 then
        -- Limited scope change. After 1.2 (config 00105), no more changes.
        luup.attr_set('category_num', 4, tdev)
        luup.attr_set('subcategory_num', 0, tdev)
    end

    if s < 00107 then
        initVar( "ContinuousTimer", 0, tdev, RSSID ) -- 106
        initVar( "Runtime", 0, tdev, RSSID )
        initVar( "TripCount", 0, tdev, RSSID )
        initVar( "MaxUpdateRate", "", tdev, RSSID )
        initVar( "MaxChangeRate", "", tdev, RSSID )
        initVar( "AutoUntrip", 0, tdev, SENSOR_SID )
        initVar( "UseReactorScenes", 1, tdev, RSSID ) -- 107
    end

    if s < 00108 then
        -- Add marktime for Runtime and TripCount, for date those vars where introduced.
        initVar( "RuntimeSince", 1533528000, tdev, RSSID ) -- 2018-08-16.00:00:00-0400
    end

    if s < 00109 then
        luup.variable_set( RSSID, "sundata", nil, tdev ) -- moved to master
    end

    if s < 00201 then
        initVar( "ValueChangeHoldTime", 2, tdev, RSSID )
    end

    if s < 00206 then
        local currState = getVarNumeric( "Tripped", 0, tdev, SENSOR_SID )
        initVar( "Target", currState, tdev, SWITCH_SID )
        initVar( "Status", currState, tdev, SWITCH_SID )
    end

    -- Update version last.
    if (s ~= _CONFIGVERSION) then
        luup.variable_set(RSSID, "Version", _CONFIGVERSION, tdev)
    end
end

-- plugin_runOnce() looks to see if a core state variable exists; if not, a one-time initialization
-- takes place.
local function plugin_runOnce( pdev )
    local s = getVarNumeric("Version", 0, pdev, MYSID)
    if s == _CONFIGVERSION then
        -- Up to date.
        return
    elseif s == 0 then
        L("First run, setting up new plugin instance...")
        initVar( "NumChildren", 0, pdev, MYSID )
        initVar( "NumRunning", 0, pdev, MYSID )
        initVar( "Message", "", pdev, MYSID )
        initVar( "HouseMode", luup.attr_get( "Mode", 0 ) or "1", pdev, MYSID )
        initVar( "LastDST", "0", pdev, MYSID )
        initVar( "IsHome", "", pdev, MYSID )
        initVar( "DebugMode", 0, pdev, MYSID )
        initVar( "MaxEvents", "", pdev, MYSID )
        initVar( "StateCacheExpiry", 600, pdev, MYSID )
        initVar( "UseACE", "", pdev, MYSID )
        initVar( "ACEURL", "", pdev, MYSID )

        luup.attr_set('category_num', 1, pdev)

        luup.variable_set( MYSID, "Version", _CONFIGVERSION, pdev )
        return
    end

    -- Consider per-version changes.
    if s < 00102 then
        initVar( "DebugMode", 0, pdev, MYSID )
    end

    if s < 00105 then
        luup.attr_set('category_num', 1, pdev)
        luup.attr_set('subcategory_num', "", pdev)
    end

    if s < 00109 then
        luup.variable_set( RSSID, "runscene", nil, pdev ) -- correct SID/device mismatch
    end

    if s < 00200 then
        initVar( "StateCacheExpiry", 600, pdev, MYSID )
    end

    if s < 00202 then
        initVar( "MaxEvents", "", pdev, MYSID )
    end

    if s < 00204 then
        initVar( "UseACE", "", pdev, MYSID )
        initVar( "ACEURL", "", pdev, MYSID )
    end

    if s < 00205 then
        initVar( "IsHome", "", pdev, MYSID )
    end

    if s < 00204 then
        initVar( "UseACE", "", pdev, MYSID )
        initVar( "ACEURL", "", pdev, MYSID )
    end

    -- Update version last.
    if s ~= _CONFIGVERSION then
        luup.variable_set( MYSID, "Version", _CONFIGVERSION, pdev )
    end
end

-- Return current house mode, or test house mode if set
local function getHouseMode( tdev )
    local mode = getVarNumeric( "TestHouseMode", 0, tdev, RSSID )
    if mode ~= 0 then
        return tostring(mode)
    end
    return luup.variable_get( MYSID, "HouseMode", pluginDevice ) or "1"
end

-- Clean cstate
local function loadCleanState( tdev )
    D("loadCleanState(%1)", tdev)

    -- If we have state in memory, it's assumed to be clean.
    if sensorState[tostring(tdev)].condState then
        -- Bump time to avoid expiration (cache hit) and return
        sensorState[tostring(tdev)].condState.lastSaved = os.time()
        return sensorState[tostring(tdev)].condState
    end

    -- Fetch cstate. If it's empty, there's nothing to do here.
    local cstate = {} -- guilty until proven innocent
    local s = luup.variable_get( RSSID, "cstate", tdev ) or ""
    if s ~= "" then
        local err
        cstate,_,err = json.decode( s )
        if err then
            L({level=2,msg="ReactorSensor %1 (%2) corrupted cstate, clearing!"}, tdev, luup.devices[tdev].description)
            cstate = {}
        end

        local cdata = sensorState[tostring(tdev)].configData
        if not cdata then
            L({level=1,msg="ReactorSensor %1 (%2) has corrupt configuration data!"}, tdev, luup.devices[tdev].description)
            error("ReactorSensor " .. tdev .. " has invalid configuration data")
            -- no return
        end

        -- Find all conditions in cdata
        local conds = {}
        for _,grp in ipairs( cdata.conditions or {} ) do
            table.insert( conds, grp.groupid )
            for _,cond in ipairs( grp.groupconditions or {} ) do
                table.insert( conds, cond.id )
            end
        end
        D("loadCleanState() cdata has %1 conditions: %2", #conds, conds)

        -- Get all conditions in cstate. Remove from that list all cdata conditions.
        local states = getKeys( cstate )
        D("loadCleanState() cstate has %1 states: %2", #states, states)
        local dels = {} -- map
        for _,k in ipairs( states ) do dels[k] = true end
        for _,k in ipairs( conds ) do dels[k] = nil end

        -- Delete whatever is left
        D("loadCleanState() deleting %1", dels)
        for k,_ in pairs( dels ) do cstate[ k ] = nil end
    end

    -- Save updated state
    D("loadCleanState() saving state %1", cstate)
    cstate.lastSaved = os.time()
    luup.variable_set( RSSID, "cstate", json.encode( cstate ), tdev )
    return cstate
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
        return nil
    end
    local data, pos, err = json.decode(body)
    if err then
        L("Can't decode JSON response for scene %1: %2 at %3 in %4", sceneId, err, pos, body)
        return nil
    end
    data.loadtime = luup.attr_get("LoadTime", 0)
    if data.groups and not data.isReactorScene then
        table.sort( data.groups, function( a, b ) return (a.delay or 0) < (b.delay or 0) end )
    end
    D("loadScene() loaded scene %1: %2", sceneId, data)

    -- Clear the startup Lua for this scene from the Lua chunk cache
    local starter = string.format("scene%s_start", tostring(data.id or ""))
    if luaFunc[starter] then luaFunc[starter] = nil end

    -- Keep cached
    if next(sceneData) == nil then
        sceneData = json.decode( luup.variable_get( MYSID, "scenedata", pluginDevice ) or "{}" ) or {}
    end
    sceneData[tostring(data.id)] = data
    luup.variable_set( MYSID, "scenedata", json.encode(sceneData), pdev )
    return data
end

-- Process deferred scene load queue
local function loadWaitingScenes( pdev, ptask )
    D("loadWaitingScenes(%1)", pdev)
    local done = {}
    for sk,sceneId in pairs(sceneWaiting) do
        if loadScene( sceneId, pdev ) ~= nil then
            table.insert( done, sk )
        end
    end
    for _,sk in ipairs( done ) do
        sceneWaiting[sk] = nil
    end
    if next(sceneWaiting) ~= nil then
        -- More to do, schedule it.
        scheduleDelay( ptask, 60 )
    end
end

-- Get scene data from cache or Luup. Queue fetch/refetch if needed.
local function getSceneData( sceneId, tdev )
    D("getSceneData(%1,%2)", sceneId, tdev )

    -- Special scene?
    local skey = tostring(sceneId)
    if skey:match( "^__[un]*trip") then -- patterns not very sophisticaed in Lua, so (overly) simple test
        -- For these special scenes, they're already in config ready to go.
        local pt = skey:match("^__un") and "untripactions" or "tripactions"
        local r = sensorState[tostring(tdev)].configData[pt]
        if r then r.id = skey r.name = skey end
        return r
    end

    -- Load persistent scene data to cache if cache empty
    if next(sceneData) == nil then
        sceneData = getVarJSON( "scenedata", {}, pluginDevice, MYSID )
    end

    -- Still a valid Vera scene?
    local scid = tonumber( sceneId ) or -1
    if luup.scenes[scid] == nil then
        -- Nope.
        L({level=1,msg="Scene %1 in configuration for %3 (%2) is no longer available!"}, sceneId,
            tdev, luup.devices[tdev].description)
        sceneData[skey] = nil
        return nil
    end

    -- See if we can return from cache
    local scd = sceneData[skey]
    if scd ~= nil then
        if tostring(scd.loadtime or 0) ~= luup.attr_get("LoadTime", 0) then
            -- Reload since cached, queue for refresh.
            D("getSceneData() reload since scene last cached, queueing update")
            sceneWaiting[skey] = scid
            scheduleDelay( { id="sceneLoader", func=loadWaitingScenes, owner=pluginDevice }, 5 )
        end
        D("getSceneData() returning cached: %1", scd)
        return scd -- return cached
    end

    local data = loadScene( scid, pluginDevice )
    if data == nil then
        -- Couldn't get it. Try again later.
        D("getSceneData() queueing later scene load for scene %1", scid)
        sceneWaiting[skey] = scid
        scheduleDelay( { id="sceneLoader", func=loadWaitingScenes, owner=pluginDevice }, 5 )
        return nil
    end
    sceneWaiting[skey] = nil -- remove any fetch queue entry
    return data
end

-- Stop running scenes
local function stopScene( ctx, taskid, tdev )
    D("stopScene(%1,%2,%3)", ctx, taskid, tdev)
    assert(luup.devices[tdev].device_type == MYTYPE or luup.devices[tdev].device_type == RSTYPE)
    for tid,d in pairs(sceneState) do
        if ( ctx == nil or ctx == d.context ) and ( taskid == nil or taskid == tid ) then
            D("stopScene() stopping scene run task %1", tid)
            scheduleTick( tid, 0 )
            sceneState[tid] = nil
        end
    end
    luup.variable_set( MYSID, "runscene", json.encode(sceneState), pluginDevice )
end

-- Get a value (works as constant or expression (including simple variable ref).
-- Returns result as string and number
local function getValue( val, ctx, tdev )
    D("getValue(%1,%2,%3)", val, ctx, tdev)
    ctx = ctx or sensorState[tostring(tdev)].ctx
    if type(val) == "number" then return tostring(val), val end
    val = tostring(val) or ""
    if #val >=2 and val:byte(1) == 34 and val:byte(-1) == 34 then
        -- Dequote quoted string and return
        return val:sub( 2, -2 ), nil
    end
    if #val >= 2 and val:byte(1) == 123 and val:byte(-1) == 125 then
        -- Expression wrapped in {}
        local mp = val:sub( 2, -2 )
        if luaxp == nil then
            luaxp = require("L_LuaXP_Reactor")
        end
        local result,err = luaxp.evaluate( mp, ctx )
        if err then
            L({level=2,msg="%1 (%2) Error evaluating %3: %4"}, luup.devices[tdev].description,
                tdev, mp, err)
            val = ""
        else
            val = result
        end
    end
    return tostring(val), tonumber(val)
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
            luup.log( "Reactor: " .. err .. "\n" .. luafragment, 1 )
            return false, err -- flag error
        end
        if getVarNumeric( "SuppressLuaCaching", 0, pluginDevice, MYSID ) == 0 then
            luaFunc[fname] = fnc
        end
    end
    -- We use a single environment for all Lua scripts, which allows modules loaded
    -- to be shared among them. This, of course, has some inherent dangers, and
    -- people's bad habits with globals may be exposed. Issue warnings to assist.
    if luaEnv == nil then
        D("execLua() creating new Lua environment")
        luaEnv = shallowCopy(_G)
        -- Clear what we don't need
        luaEnv.json = nil
        luaEnv.ltn12 = nil
        luaEnv.http = nil
        luaEnv.https = nil
        luaEnv.luaxp = nil
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
                            addEvent{ dev=dev, event="lua", script=luaEnv.__reactor_getscript(), message=msg }
                        end
        -- Override next and pairs specifically so that variables proxy table can
        -- iterate. This is a 5.1-ism. See http://lua-users.org/wiki/GeneralizedPairsAndIpairs
        luaEnv.rawnxt = luaEnv.next
        luaEnv.next =   function( t, k )
                            local m = getmetatable(t)
                            local n = m and m.__next or luaEnv.rawnxt
                            return n( t, k )
                        end
        -- Redefining pairs() this way allows metamethod override for iteration.
        luaEnv.pairs =  function( t ) return luaEnv.next, t, nil end
        local mt = { }
        mt.__newindex = function (t, n, v)
            if rawget(t, n) == nil and debug.getinfo(2, "S").what ~= "C" then
                local dev = t.__reactor_getdevice()
                local fn = t.__reactor_getscript()
                L({level=2,msg="%1 (%2) runLua action: %3 makes assignment to global %4 (missing 'local' declaration?)"},
                    ( luup.devices[dev] or {}).description, dev, fn, n)
                addEvent{ event="lua", dev=dev, script=fn, message="WARNING: Assignment to global "..n.." (missing 'local' declaration?)" }
            end
            rawset(t, n, v)
        end
        mt.__index = function(t, n) -- luacheck: ignore 212
            if ( ( ( t.package or {} ).loaded or {} )[n] ) then return t.package.loaded[n] end -- hmmm
            local v = rawget(t, n)
            if v == nil and debug.getinfo(2, "S").what ~= "C" then
                local dev = t.__reactor_getdevice()
                local fn = t.__reactor_getscript()
                L({level=1,msg="%1 (%2) runLua action: %3 accesses undeclared/uninitialized global %4"},
                    ( luup.devices[dev] or {} ).description, dev, fn, n)
                addEvent{ event="lua", dev=dev, script=fn, message="ERROR: Using uninitialized global variable "..n }
            end
            return v
        end
        mt.__metatable = false -- prevent client tampering
        setmetatable( luaEnv, mt )
    end
    -- Set up reactor context. This creates three important maps: groups, trip
    -- and untrip. The groups map contains the state and time of each group.
    -- The trip and untrip maps contain those groups that most-recently changed
    -- (i.e. those that would cause an overall state change of the ReactorSensor).
    -- They are maps, rather than just arrays, for quicker access.
    local _R = { id=tdev, groups={}, trip={}, untrip={}, variables={},
        script=fname, version=_PLUGIN_VERSION }
    _R.dump = stringify -- handy
    for _,grp in ipairs( sensorState[tostring(tdev)].configData.conditions or {} ) do
        local gs = sensorState[tostring(tdev)].condState[grp.groupid] or {}
        _R.groups[grp.groupid] = { state=gs.evalstate, since=gs.evalstamp }
        if gs.changed then
            if gs.evalstate then _R.trip[grp.groupid] = _R.groups[grp.groupid]
            else _R.untrip[grp.groupid] = _R.groups[grp.groupid] end
        end
    end
    local vars = {}
    for n,_ in pairs( sensorState[tostring(tdev)].configData.variables or {} ) do
        D("execLua() presetting variable %1", n)
        vars[n] = luup.variable_get( VARSID, n, tdev )
    end
    -- Special metatable for Reactor.variables table. Uses a proxy table to that
    -- all access pass through __index/__newindex, but in 5.1 this makes the table
    -- "un-iterable" without additional work. That's why next() and pairs() are
    -- overriden above--they provide a way for this metatable to create its own
    -- iterator.
    local rmt = {}
    rmt.__newindex =    function(t, n, v) -- luacheck: ignore 212
                            addEvent{ dev=tdev, event="lua", script=fname, message="WARNING: Reactor.variables is read-only and cannot be modified! The attempt to modify key "..
                                n.." will be ignored!" }
                        end
    rmt.__index =   function(t, n)
                        -- Always fetch, because it could be changing dynamically
                        local v = luup.variable_get( VARSID, n, tdev )
                        if v == nil then
                            L({level=1,msg="%1 (%2) runLua action: your code accesses undeclared Reactor variable 'Reactor.variables."..n.."'"},
                                luup.devices[tdev].description, tdev, n)
                            addEvent{ dev=tdev, event="lua", script=fname, message="WARNING: Attempt to access undefined Reactor variable "..n }
                        else
                            rawset(getmetatable(t).__vars, n, v) -- store locally
                        end
                        return v
                    end
    rmt.__next =    function(t, k) return luaEnv.rawnxt( getmetatable(t).__vars, k ) end
    rmt.__vars = vars
    setmetatable( _R.variables, rmt )
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

-- Resolve variable references. Recursion is allowed.
-- ??? Deprecate this resolver.
local function resolveVarRef( v, tdev, depth )
    if getVarNumeric( "RevertOldResolver", 0, pluginDevice, MYSID ) == 0 then
        return getValue( v, nil, tdev )
    end
    depth = depth or 1
    if type(v) ~= "string" then return v end
    local var = v:match( "%{([^}]+)%}" )
    if var == nil then return v end
    if depth > 8 then
        L({level=1,msg="%1 (%2) nesting too deep resolving variable references, stopped at %3"},
            luup.devices[tdev].description, tdev, v)
        return v
    end
    return resolveVarRef( luup.variable_get( VARSID, var, tdev ), tdev, depth+1 )
end

-- Run the next scene group(s), until we run out of groups or a group delay
-- restriction hasn't been met. Across reloads, scenes will "catch up," running
-- groups that are now past-due (native Luup scenes don't do this).
local function execSceneGroups( tdev, taskid, scd )
    D("execSceneGroups(%1,%2,%3)", tdev, taskid, type(scd) )
    assert(luup.devices[tdev].device_type == MYTYPE or luup.devices[tdev].device_type == RSTYPE)

    -- Get sceneState, make sure it's consistent with request.
    local sst = sceneState[taskid]
    D("scene state %1", sst)
    if sst == nil then return end

    -- Reload the scene if it wasn't passed to us (from cache)
    if not scd then
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
        if type(delay) == "string" then delay = resolveVarRef( delay, tdev ) end
        if type(delay) ~= "number" then
            L({level=1,msg="%1 (%2) delay at group %3 did not resolve to number; no delay!"},
                luup.devices[tdev].description, tdev, nextGroup)
            delay = 0
        end
        D("execSceneGroups() delay is %1 %2", delay, scd.groups[nextGroup].delaytype)
        if delay > 0 then
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
                addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, notice="Scene delay until "..os.date("%X", tt) }
                scheduleTick( { id=sst.taskid, owner=sst.owner, func=execSceneGroups, args={} }, tt )
                return taskid
            end
        end

        -- Run this group.
        addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, notice="Starting scene group "..nextGroup }
        for ix,action in ipairs( scd.groups[nextGroup].actions or {} ) do
            if not scd.isReactorScene then
                -- Genuine Vera/Luup scene (just has device actions)
                local devnum = tonumber( action.device )
                if devnum == nil or luup.devices[devnum] == nil then
                    addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, warning="Action skipped, device number invalid or does not exist: " .. tostring( action.device ) }
                    L({level=2,msg="%5 (%6): invalid device number (%4) in scene %1 (%2) group %3; skipping action."},
                        scd.id, scd.name, nextGroup, action.device, tdev, luup.devices[tdev].description)
                    D("execSceneGroups() action=%1, all group %2 actions=%3", action, nextGroup, scd.groups[nextGroup].actions)
                else
                    local param = {}
                    for k,p in ipairs( action.arguments or {} ) do
                        param[p.name or tostring(k)] = p.value
                    end
                    D("execSceneGroups() dev %4 (%5) do %1/%2(%3) for %6 (%7)", action.service,
                        action.action, param, devnum,
                        (luup.devices[devnum] or {}).description or "?unknown?",
                        scd.name or "", scd.id )
                    -- If Lua HomeAutomationGateway RunScene action, run in Reactor
                    if action.service == "urn:micasaverde-com:serviceId:HomeAutomationGateway1" and
                            action.action == "RunScene" and devnum == 0 then
                        -- Overriding like this runs the scene as a job (so it doesn't start immediately)
                        D("execSceneGroups() overriding Vera RunScene with our own!")
                        action.service = RSSID
                        devnum = tdev
                        param.Options = { contextDevice=sst.options.contextDevice, stopPriorScenes=false }
                    end
                    luup.call_action( action.service, action.action, param, devnum )
                end
            else
                -- ReactorScene
                D("execSceneGroups() %3 step %1: %2", ix, action, scd.id)
                if action.type == "comment" then
                    -- If first char is asterisk, emit comment to log file
                    if ( action.comment or ""):sub(1,1) == "*" then
                        L("%2 (%1) %3 [%4:%5]", tdev, luup.devices[tdev].description,
                            action.comment, scd.id, ix)
                    end
                elseif action.type == "device" then
                    local devnum = tonumber( action.device )
                    if devnum == nil or luup.devices[devnum] == nil then
                        addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, warning="Action skipped, device number invalid or does not exist: " .. tostring( action.device ) }
                        L({level=1,msg="%5 (%6): invalid device (%4) in scene %1 (%2) group %3; skipping action."},
                            scd.name or "", scd.id, nextGroup, action.device, tdev, luup.devices[tdev].description)
                    else
                        local param = {}
                        for k,p in ipairs( action.parameters or {} ) do
                            -- Reactor behavior: omit if value not defined
                            if p.value ~= nil then
                                local val = resolveVarRef( p.value, tdev )
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
                    local scene = resolveVarRef( action.scene, tdev )
                    D("execSceneGroups() launching scene %1 (%2) from scene %3",
                        scene, action.scene, scd.id)
                    -- Not running as job here because we want in-line execution of scene actions (the Reactor way).
                    runScene( scene, tdev, { contextDevice=sst.options.contextDevice, stopPriorScenes=false } )
                elseif action.type == "runlua" then
                    local fname = string.format("scene%s_group%d_action%d", tostring(scd.id), nextGroup, ix )
                    D("execSceneGroups() running Lua for %1 (chunk name %2)", scd.id, fname)
                    local lua = action.lua
                    if ( action.encoded_lua or 0 ) ~= 0 then
                        local mime = require('mime')
                        lua = mime.unb64( lua )
                        if lua == nil then
                            addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, ['error']="Aborting; unable to decode Lua for action #" .. tostring(ix) }
                            L({level=1,msg="Aborting scene %1 (%2) run, unable to decode scene Lua"}, scd.id, scd.name)
                            return
                        end
                    end
                    local more, err = execLua( fname, lua, nil, tdev )
                    D("execSceneGroups() execLua returned %1,%2", more, err)
                    if err then
                        addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, ['error']="Aborting; Lua error in action #" .. tostring(ix) .. ": " .. tostring(err) }
                        L({level=1,msg="%1 (%2) aborting scene %3 Lua execution at group step %4, Lua run failed: %5"},
                            luup.devices[tdev].description, tdev, scd.id, ix, err)
                        L{level=2,msg="Lua:\n"..lua} -- concat to avoid formatting
                        -- Throw on the brakes! (stop all scenes in context)
                        stopScene( tdev, nil, tdev )
                        return nil
                    elseif more == false then -- N.B. specific test to match exactly boolean type false (but not nil)
                        addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, notice="Stopping; Run Lua action #" .. tostring(ix) .. " returned (" .. type(more) .. ")" .. tostring(more) }
                        L("%1 (%2) scene %3 Lua at step %4 returned (%5)%6, stopping actions.",
                            luup.devices[tdev].description, tdev, scd.id, ix, type(more), more)
                        stopScene( nil, taskid, tdev ) -- stop just this scene.
                        return nil
                    --[[
                    else
                        addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, notice="Run Lua action #" .. tostring(ix) .. " OK, return value (" .. type(more) .. ")" .. tostring(more) }
                    --]]
                    end
                else
                    addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, warning="Action #" .. tostring(ix) .. " unrecognized type: " .. tostring(action.type) .. ", ignored." }
                    L({level=1,msg="Unhandled action type %1 at %2 in scene %3 for %4 (%5)"},
                        action.type, ix, scd.id, tdev, luup.devices[tdev].description)
                end
            end
        end

        -- Finished this group. Save position.
        sceneState[taskid].lastgroup = nextGroup
        sceneState[taskid].lastgrouptime = os.time()
        luup.variable_set( MYSID, "runscene", json.encode(sceneState), pluginDevice )
        nextGroup = nextGroup + 1 -- ...and we're moving on...
    end

    -- We've run out of groups!
    addEvent{ dev=tdev, event="endscene", scene=scd.id, sceneName=scd.name or scd.id }
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
    local taskid = string.format("ctx%s-sc%s", tostring(ctx), tostring(scd.id))
    local sst = sceneState[taskid]
    D("execScene() scene taskid %2 state is %1", sst, taskid)
    if options.stopPriorScenes then
        stopScene( ctx, nil, tdev )
    end

    -- Mark
    addEvent{ dev=tdev, event="startscene", scene=scd.id, sceneName=scd.name or scd.id}

    -- If there's scene lua, try to run it.
    if ( scd.lua or "" ) ~= "" then
        D("execScene() handling scene (global) Lua")
        local luafragment
        if ( scd.encoded_lua or 0 ) ~= 0 then
            local mime = require('mime')
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
        -- code. Environment will reflect different context at runtime.
        local fname = string.format("scene%s_start", tostring(scd.id))
        local more,err = execLua( fname, luafragment, options.externalArgument, tdev )
        if err then
            addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, ['error']="Aborting; Lua error in scene Lua: " .. tostring(err) }
            L({level=1,msg="%1 (%2) scene %3 scene Lua run failed: %4"},
                luup.devices[tdev].description, tdev, scd.id, err)
            L{level=2,msg="Lua:\n"..luafragment} -- concat to avoid formatting
            return
        end
        if more == false then -- N.B. specific test to match exactly boolean type false (but not nil)
            addEvent{ dev=tdev, event="runscene", scene=scd.id, sceneName=scd.name or scd.id, notice="Stopping; scene Lua returned (" .. type(more) .. ")" .. tostring(more) }
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
    sceneState = d
    for _,data in pairs( sceneState ) do
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
    if getVarNumeric("UseReactorScenes", 1, tdev, RSSID) == 0 and not options.forceReactorScenes
        and not scd.isReactorScene then
        D("runScene() handing-off scene run to Luup")
        luup.call_action( "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "RunScene", { SceneNum=scene }, 0 )
        return
    end

    execScene( scd, tdev, options )
end

-- Set tripped state for a ReactorSensor. Runs scenes, if any.
local function trip( state, tdev )
    L("%2 (#%1) now %3", tdev, luup.devices[tdev].description, state and "tripped" or "untripped")
    luup.variable_set( SENSOR_SID, "Tripped", state and "1" or "0", tdev )
    luup.variable_set( SWITCH_SID, "Target", state and "1" or "0", tdev )
    luup.variable_set( SWITCH_SID, "Status", state and "1" or "0", tdev )
    addEvent{dev=tdev,event='sensorstate',state=state}
    -- Make sure condState is loaded/ready (may have been expired by cache)
    sensorState[tostring(tdev)].condState = loadCleanState( tdev )
    if not state then
        -- Luup keeps (SecuritySensor1/)LastTrip, but we also keep LastReset
        luup.variable_set( RSSID, "LastReset", os.time(), tdev )
        -- Run the reset scene, if we have one. Scene ID must be unique across sensors!
        local scd = getSceneData( '__untrip' .. tostring(tdev), tdev )
        if scd then execScene( scd, tdev, { contextDevice=tdev, stopPriorScenes=true } ) end
    else
        -- Count a trip.
        luup.variable_set( RSSID, "TripCount", getVarNumeric( "TripCount", 0, tdev, RSSID ) + 1, tdev )
        -- Run the trip scene, if we have one. Scene ID must be unique across sensors!
        local scd = getSceneData( '__trip' .. tostring(tdev), tdev )
        if scd then execScene( scd, tdev, { contextDevice=tdev, stopPriorScenes=true } ) end
    end
end

-- Find a group in array
local function findConditionGroup( grpid, cdata )
    for ix,g in ipairs( cdata.conditions or {} ) do
        if g.groupid == grpid then return g,ix end
    end
    return nil
end

-- Find a condition hiding in a group (or is it?)
local function findCondition( condid, cdata )
    for _,g in ipairs( cdata.conditions or {} ) do
        for _,c in ipairs( g.groupconditions or {} ) do
            if c.id == condid then return c end
        end
    end
    return nil
end

-- Find device type name or UDN
local function finddevice( dev )
    local vn
    if type(dev) == "number" then
        return dev
    elseif type(dev) == "string" then
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
    end
    return vn
end

-- Load sensor config
local function loadSensorConfig( tdev )
    local s = luup.variable_get( RSSID, "cdata", tdev ) or "{}"
    local cdata, pos, err = json.decode( s )
    if err then
        L("Unable to parse JSON data at %2, %1 in %3", pos, err, s)
        return error("Unable to load configuration")
    end
    -- Special meta to control encode rendering when needed.
    local mt = { __jsontype="object" } -- empty tables render as object
    mt.__index = function(t, n) if debugMode then L({level=1,msg="access to %1 in cdata, which is undefined!"},n) end return rawget(t,n) end
    mt.__newindex = function(t, n, v) rawset(t,n,v) if debugMode then L({level=2,msg="setting %1=%2 in cdata"}, n, v) end end
    setmetatable( cdata, mt )
    -- Check old-style scene runners, fix.
    s = luup.variable_get( RSSID, "Scenes", tdev ) or ""
    if s ~= "" then
        L({level=2,msg="%3 (%2) Upgrading old-style scene pair %1 to actions (one-time upgrade)"},
            s, tdev, luup.devices[tdev].description)

        local st = split( s, "," )
        if st[1] ~= "" then
            cdata.tripactions = { isReactorScene=true, groups={ { delay=0, actions={ { ['type']="runscene", scene=st[1] } } } } }
        end
        if #st > 1 and st[2] ~= "" then
            cdata.untripactions = { isReactorScene=true, groups={ { delay=0, actions={ { ['type']="runscene", scene=st[2] } } } } }
        end
        cdata.timestamp = os.time()
        luup.variable_set( RSSID, "cdata", json.encode( cdata ), tdev )
        luup.variable_set( RSSID, "Scenes", "", tdev )
    end
    -- Save to cache.
    sensorState[tostring(tdev)].configData = cdata
    -- When loading sensor config, dump luaFunc so that any changes to code
    -- in actions or scenes are honored immediately.
    luaFunc = {}
    return cdata
end

local function evaluateVariable( vname, ctx, cdata, tdev )
    D("evaluateVariable(%1,cdata,%2)", vname, tdev)
    local vdef = (cdata.variables or {})[vname]
    if vdef == nil then
        L({level=1,msg="%2 (%1) Invalid variable reference to %3, not configured"},
            tdev, luup.devices[tdev].description, vname)
        return
    end
    if luaxp == nil then
        -- Don't load luaxp unless/until needed.
        luaxp = require("L_LuaXP_Reactor")
    end
    -- if debugMode then luaxp._DEBUG = D end
    ctx.NULL = luaxp.NULL
    local result, err = luaxp.evaluate( vdef.expression or "?", ctx )
    if not ( err or luaxp.isNull(result) or string.find( ":number:string:boolean:", type(result) ) ) then
        -- Type we can't store in state variable.
        err = { message="Invalid result type for state variable storage (" .. type(result) .. ")" }
    end
    if not ( err or luaxp.isNull(result) ) then
        D("evaluateVariable() %2 (%1) %3 evaluates to %4", tdev, luup.devices[tdev].description,
            vdef.expression, result)
        -- Save on context for other evals
        ctx[vname] = result
        -- Canonify booleans by converting to number for storage as state variable
        if type(result) == "boolean" then result = result and "1" or "0" end
        if type(result) == "table" then
            for ix,v in ipairs( result ) do
                if type(v) ~= "number" then
                    result[ix] = string.format( "%q", tostring(v) )
                end
            end
            result = 'list(' .. table.concat( result, "," ) .. ')'
        end
        local oldVal = luup.variable_get( VARSID, vname, tdev )
        if oldVal == nil or oldVal ~= tostring(result or "") then
            addEvent{ dev=tdev, event="variable", variable=vname, oldval=oldVal, newval=result }
            luup.variable_set( VARSID, vname, tostring(result or ""), tdev )
            luup.variable_set( VARSID, vname .. "_Error", "", tdev )
        end
    else
        L({level=2,msg="%2 (%1) failed evaluation of %3: result=%4, err=%5"}, tdev, luup.devices[tdev].description,
            vdef.expression, result, err)
        ctx[vname] = luaxp.NULL
        local msg = (err or {}).message or "Failed"
        if (err or {}).location ~= nil then msg = msg .. " at " .. tostring(err.location) end
        addEvent{ dev=tdev, event="expression", variable=vname, ['error']=msg }
        luup.variable_set( VARSID, vname, "", tdev )
        luup.variable_set( VARSID, vname .. "_Error", msg, tdev )
        return nil, err
    end
    return result, false
end

local function getExpressionContext( cdata, tdev )
    local ctx = { __functions={}, __lvars={} }
    -- Create evaluation context
    ctx.__functions.finddevice = function( args )
        local selector = unpack( args )
        D("findDevice(%1) selector=%2", args, selector)
        local n = finddevice( selector )
        if n == nil then return luaxp.NULL end
        return n
    end
    ctx.__functions.random = function( args ) return math.random( unpack( args ) ) end
    ctx.__functions.getstate = function( args )
        local dev, svc, var = unpack( args )
        local vn = finddevice( dev )
        D("getstate(%1), dev=%2, svc=%3, var=%4, vn(dev)=%5", args, dev, svc, var, vn)
        if vn == luaxp.NULL or vn == nil or luup.devices[vn] == nil then
            addEvent{ dev=tdev, event="expression", context="getstate", ['error']="Device not found: " .. tostring(dev) }
            return luaxp.NULL
        end
        -- Create a watch if we don't have one.
        addServiceWatch( vn, svc, var, tdev )
        -- Get and return value
        return luup.variable_get( svc, var, vn ) or luaxp.NULL
    end
    ctx.__functions.setstate = function( args )
        local dev, svc, var, val = unpack( args )
        local vn = finddevice( dev )
        D("setstate(%1), dev=%2, svc=%3, var=%4, val=%5, vn(dev)=%6", args, dev, svc, var, val, vn)
        if vn == luaxp.NULL or vn == nil or luup.devices[vn] == nil then
            addEvent{ dev=tdev, event="expression", context="setstate", ['error']="Device not found: " .. tostring(dev) }
            return luaxp.NULL
        end
        -- Set value.
        local vv = val
        if vv == nil or luaxp.isNull(vv) then
            vv = ""
        elseif type(vv) == "table" then
            vv = table.concat( vv, "," )
        else
            vv = tostring(vv)
        end
        luup.variable_set( svc or "urn:upnp-org:serviceId:DefaultService", var or "Unnamed", vv, vn )
        if val == nil then return luaxp.NULL end
        return val
    end
    ctx.__functions.getattribute = function( args )
        local dev, attr = unpack( args )
        local vn = finddevice( dev )
        D("getattribute(%1), dev=%2, attr=%3, vn(dev)=%4", args, dev, attr, vn)
        if vn == luaxp.NULL or vn == nil or luup.devices[vn] == nil then
            addEvent{ dev=tdev, event="expression", context="getattribute", ['error']="Device not found: " .. tostring(dev) }
            return luaxp.NULL
        end
        -- Get and return value.
        return luup.attr_get( attr, vn ) or luaxp.NULL
    end
    ctx.__functions.getluup = function( args )
        local key = unpack( args )
        if key == nil or luup[key] == nil then return luaxp.NULL end
        local t = type(luup[key])
        if t == "string" or t == "number" then
            return luup[key]
        end
        return luaxp.NULL
    end
    ctx.__functions.stringify = function( args )
        local val = unpack( args )
        return json.encode( val )
    end
    ctx.__functions.unstringify = function( args )
        local str = unpack( args )
        local val,pos,err = json.decode( str )
        if err then
            luaxp.evalerror("Failed to unstringify at " .. pos .. ": " .. err)
        end
        return val
    end
    -- Implement LuaXP extension resolver as recursive evaluation. This allows expressions
    -- to reference other variables, makes working order of evaluation.
    ctx.__functions.__resolve = function( name, c2x )
        D("__resolve(%1,c2x)", name)
        if (c2x.__resolving or {})[name] then
            luaxp.evalerror("Circular reference detected (" .. name .. ")")
            return luaxp.NULL
        end
        if (cdata.variables or {})[ name ] == nil then
            -- If we don't recognize it, we can't resolve it.
            return nil
        end
        c2x.__resolving = c2x.__resolving or {}
        c2x.__resolving[name] = true
        local val = evaluateVariable( name, c2x, cdata, tdev )
        c2x.__resolving[name] = nil
        return val
    end
    return ctx
end

local function updateVariables( cdata, tdev )
    -- Make a list of variable names to iterate over. This also facilitates a
    -- quick test in case there are no variables, bypassing a bit of work.
    local vars = {}
    for n,_ in pairs(cdata.variables or {}) do table.insert( vars, n ) end
    D("updateVariables() updating vars=%1", vars)
    local ctx = getExpressionContext( cdata, tdev )
    -- Perform evaluations.
    for _,n in ipairs( vars ) do
        if not ctx[n] then -- not yet evaluated this run?
            evaluateVariable( n, ctx, cdata, tdev )
        end
    end
    -- Save the expression context for other uses.
    sensorState[tostring(tdev)].ctx = ctx
end

-- Helper to schedule next condition update. Times are MSM (mins since midnight)
local function doNextCondCheck( taskinfo, nowMSM, startMSM, endMSM )
    D("doNextCondCheck(%1,%2,%3)", nowMSM, startMSM, endMSM)
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

local function evaluateCondition( cond, grp, tdev )
    D("evaluateCondition(%1,%2,%3)", cond, grp.groupid, tdev)
    local now = sensorState[tostring(tdev)].timebase
    local ndt = sensorState[tostring(tdev)].timeparts

    assert( cond.laststate )

    if cond.type == "service" then
        -- Can't succeed if referenced device doesn't exist.
        if luup.devices[cond.device or -1] == nil then
            L({level=2,msg="%1 (%2) condition %3 refers to device %4 (%5), does not exist, skipped"},
                luup.devices[tdev].description, tdev, cond.id, cond.device, cond.devicename or "unknown")
            return nil,false,false
        end

        -- Add service watch if we don't have one
        addServiceWatch( cond.device, cond.service, cond.variable, tdev )

        -- Get state variable value.
        local vv = luup.variable_get( cond.service or "", cond.variable or "", cond.device or -1 ) or ""
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
            local lst = split( cv )
            local found = false
            for _,z in ipairs( lst ) do
                if z == vv then
                    found = true
                    break
                end
            end
            if op == "notin" and found then return vv,false end
            if op == "in" and not found then return vv,false end
        elseif op == "istrue" then
            if (vn or 0) == 0 and not TRUESTRINGS:find( ":" .. vv:lower() .. ":" ) then return vv,false end
        elseif op == "isfalse" then
            if (vn or 0) ~= 0 or TRUESTRINGS:find( ":" .. vv:lower() .. ":" ) then return vv,false end
        elseif op == "change" then
            if cv ~= "" and cv ~= "," then
                local ar = split( cv, "," )
                -- With terminal values. If value hasn't changed, consider as
                -- re-eval, go back further in history for prior value.
                local prior = ( cond.laststate.lastvalue == vv ) and
                    cond.laststate.priorvalue or cond.laststate.lastvalue
                D("evaluateCondition() service change op with terms, currval=%1, prior=%2, term=%3", vv, prior, ar)
                if #ar > 0 and ar[1] ~= "" and prior ~= ar[1] then return vv,false end
                if #ar > 1 and ar[2] ~= "" and vv ~= ar[2] then return vv,false end
                return vv,true
            end
            D("evaluateCondition() service change op without terms, currval=%1, prior=%2, term=%3",
                vv, cond.laststate.lastvalue, cv)
            if vv == cond.laststate.lastvalue then return vv,false end
            -- Changed without terminal values, pulse.
            scheduleDelay( { id=tdev, info="change "..cond.id },
                getVarNumeric( "ValueChangeHoldTime", 2, tdev, RSSID ) )
        else
            L({level=1,msg="evaluateCondition() unknown op %1 in cond %2"}, op, cv)
            return vv,false
        end
        D("evaluateCondition() default true exit for cond %1, new value=%2", cond.id, vv)
        return vv,true
    elseif cond.type == "housemode" then
        -- Add watch on parent if we don't already have one.
        addServiceWatch( pluginDevice, MYSID, "HouseMode", tdev )
        local val = cond.value or ""
        local modes = split( val )
        local mode = getHouseMode( tdev )
        if cond.operator == "change" then
            if val ~= "" and val ~= "," then
                -- With terminal values. If value hasn't changed, consider as
                -- re-eval, go back further in history for prior value.
                local prior = ( cond.laststate.lastvalue == mode ) and cond.laststate.priorvalue or cond.laststate.lastvalue
                D("evaluateCondition() housemode change op, currval=%1, prior=%2, term=%3", mode, prior, modes)
                if #modes > 0 and modes[1] ~= "" and prior ~= modes[1] then return mode,false end
                if #modes > 1 and modes[2] ~= "" and mode ~= modes[2] then return mode,false end
                return mode,true
            end
            -- Simple change (any to any).
            D("evaluateCondition() housemode change op, currval=%1, prior=%2 (no term)", mode, cond.laststate.lastvalue)
            if mode == cond.laststate.lastvalue then return mode,false end
            -- Changed without terminal values, pulse.
            scheduleDelay( { id=tdev,info="change "..cond.id },
                getVarNumeric( "ValueChangeHoldTime", 2, tdev, RSSID ) )
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
                    return val,false -- never met
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
        local usingTestTime = getVarNumeric( "TestTime", 0, tdev, RSSID ) ~= 0
        local stamp = ndt.year * 1000 + ndt.yday
        local sundata = getVarJSON( "sundata", {}, pluginDevice, MYSID )
        if ( sundata.stamp or 0 ) ~= stamp or usingTestTime then
            if getVarNumeric( "UseLuupSunrise", 0, pluginDevice, MYSID ) ~= 0 then
                L({level=2,msg="Reactor is configured to use Luup's sunrise/sunset calculations; twilight times cannot be correctly evaluated and will evaluate as dawn=sunrise, dusk=sunset"})
                sundata = { sunrise=luup.sunrise(), sunset=luup.sunset() }
            else
                -- Compute sun data
                sundata = sun( luup.longitude, luup.latitude,
                    getVarNumeric( "Elevation", 0.0, pluginDevice, MYSID ), now )
                D("evaluationCondition() location (%1,%2) computed %3", luup.longitude, luup.latitude, sundata)
            end
            sundata.longitude = luup.longitude
            sundata.latitude = luup.latitude
            if not usingTestTime then
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
            doNextCondCheck( { id=tdev,info="sun "..cond.id }, nowMSM, startMSM, endMSM )
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
            doNextCondCheck( { id=tdev,info="sun "..cond.id }, nowMSM, startMSM )
            if nowMSM >= startMSM then return now,false end
        else
            D("evaluateCondition() cond %1 check %2 after %3", cond.id, nowMSM, startMSM)
            doNextCondCheck( { id=tdev,info="sun "..cond.id }, nowMSM, startMSM )
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
        tpart[10] = ( tparam[10] == "" ) and tpart[5] or tparam[10]
        -- Sanity check year to avoid nil dates coming from os.time()
        if tpart[1] < 1970 then tpart[1] = 1970 elseif tpart[1] > 2037 then tpart[1] = 2037 end
        if tpart[6] < 1970 then tpart[6] = 1970 elseif tpart[6] > 2037 then tpart[6] = 2037 end
        D("evaluationCondition() clean tpart=%1", tpart)
        if tparam[2] == "" then
            -- No date specified, only time components. Magnitude comparison.
            D("evaluateCondition() time-only comparison, now is %1, ndt is %2", now, ndt)
            local nowMSM = ndt.hour * 60 + ndt.min
            local startMSM = tpart[4] * 60 + tpart[5]
            if op == "after" then
                D("evaluateCondition() time-only comparison %1 after %2", nowMSM, startMSM)
                doNextCondCheck( { id=tdev,info="trangeHM "..cond.id }, nowMSM, startMSM )
                if nowMSM < startMSM then return now,false end
            elseif op == "before" then
                D("evaluateCondition() time-only comparison %1 before %2", nowMSM, startMSM)
                doNextCondCheck( { id=tdev,info="trangeHM "..cond.id }, nowMSM, startMSM )
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
                doNextCondCheck( { id=tdev,info="trangeHM "..cond.id }, nowMSM, startMSM, endMSM )
                if ( op == "nob" and between ) or
                    ( op == "bet" and not between ) then
                    return now,false
                end
            end
        elseif tparam[1] == "" then
            -- No-year given, just M/D H:M. We can do comparison by magnitude,
            -- which works better for year-spanning ranges.
            local nowz = ndt.month * 100 + ndt.day
            local stz = tpart[2] * 100 + tpart[3]
            nowz = nowz * 1440 + ndt.hour * 60 + ndt.min
            stz = stz * 1440 + tpart[4] * 60 + tpart[5]
            if op == "before" then
                D("evaluateCondition() M/D H:M test %1 %2 %3", nowz, op, stz)
                doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440 )
                if nowz >= stz then return now,false end
            elseif op == "after" then
                D("evaluateCondition() M/D H:M test %1 %2 %3", nowz, op, stz)
                doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440 )
                if nowz < stz then return now,false end
            else
                local enz = tpart[7] * 100 + tpart[8]
                enz = enz * 1440 + tpart[9] * 60 + tpart[10]
                D("evaluateCondition() M/D H:M test %1 %2 %3 and %4", nowz, op, stz, enz)
                doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440, enz % 1440 )
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
            if edge ~= nil then
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
                L({level=1,msg="Unrecognized condition %1 in time spec for cond %2 of %3 (%4)"},
                    cp, cond.id, tdev, luup.devices[tdev].description)
                return now,false
            end
        end
        return now,true
    elseif cond.type == "comment" then
        -- Shortcut. Comments are always true.
        return cond.comment,true
    elseif cond.type == "reload" then
        -- True when loadtime changes. Self-resetting.
        local loadtime = tonumber( ( luup.attr_get("LoadTime", 0) ) ) or 0
        local lastload = getVarNumeric( "LastLoad", 0, tdev, RSSID )
        local reloaded = loadtime ~= lastload
        D("evaluateCondition() loadtime %1 lastload %2 reloaded %3", loadtime, lastload, reloaded)
        luup.variable_set( RSSID, "LastLoad", loadtime, tdev )
        -- Return timer flag true when reloaded is true, so we get a reset shortly after.
        return reloaded,reloaded,reloaded
    elseif cond.type == "interval" then
        local interval = 60 * (cond.days * 1440 + cond.hours * 60 + cond.mins)
        if interval < 60 then interval = 60 end -- "can never happen" (yeah, hold my beer)
        -- Get our base time and make it a real time
        local pt = split( cond.basetime or "" )
        if #pt == 2 then
            ndt.hour = tonumber(pt[1]) or 0
            ndt.min = tonumber(pt[2]) or 0
        else
            ndt.hour = 0
            ndt.min = 0
        end
        ndt.sec = 0
        local baseTime = os.time( ndt )
        D("evaluateCondition() interval %1 secs baseTime %2", interval, baseTime)
        local cs = sensorState[tostring(tdev)].condState[cond.id]
        D("evaluateCondition() condstate %1", cs)
        if cs ~= nil then
            -- Not the very first run...
            local lastTrue = cs.lastvalue or 0
            -- Our next true relative to lastTrue considers both interval and baseTime
            -- For example, if interval is 4 hours, and baseTime is 3:00pm, the condition
            -- fires at 3am, 7am, 11am, 3pm, 7pm, 11pm (interval goes through baseTime).
            local offs = lastTrue - baseTime
            local nint = math.floor( offs / interval ) + 1
            local nextTrue = baseTime + nint * interval
            -- An interval is considered missed if we're a minute or more late.
            local missed = now >= ( nextTrue + 60 )
            D("evaluateCondition() current state is %1 as of %2, next %3, missed %4", cs.laststate, lastTrue, nextTrue, missed)
            if cs.laststate then
                -- We are currently true (in a pulse); schedule next interval.
                while nextTrue <= now do nextTrue = nextTrue + interval end -- ??? use maths
                D("evaluateCondition() resetting, next %1", nextTrue)
                scheduleTick( { id=tdev, info="interval "..cond.id }, nextTrue )
                return lastTrue,false
            end
            -- Not in a pulse. Announce a missed interval if that happened.
            if missed then
                local late = now - nextTrue
                D("evaluateCondition() missed interval %2 by %1!", late, nextTrue)
                addEvent{ dev=tdev, event="notify", cond=cond.id, delay=late,
                    message="Detected missed interval " .. os.date("%c", nextTrue ) ..
                    ( cond.skipmissed and " (skipped)" or "" )
                }
                -- If we skip missed interval, just reschedule.
                if cond.skipmissed then
                    scheduleTick( { id=tdev, info="interval "..cond.id }, nextTrue )
                    return lastTrue,false
                end
            end
            -- Is it time yet?
            if now < nextTrue then
                -- No...
                local delay = nextTrue - now
                D("evaluateCondition() too early, delaying %1 seconds", delay)
                scheduleDelay( { id=tdev,info="interval "..cond.id }, delay )
                return lastTrue,false
            end
        else
            -- First run. Delay until the first interval.
        end
        -- Go true.
        D("evaluateConditions() triggering interval condition %1", cond.id)
        -- On time greater of 15 seconds or duty cycle as % of interval, but never more than interval-5 seconds.
        scheduleDelay( { id=tdev,info="interval "..cond.id }, math.min( math.max( 15, interval * (cond.duty or 0) / 100 ), interval-5 ) )
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
                return val,val==( op=="at" and "in" or "out" )
            end
            -- Don't have data for this location or user.
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
            tdev, luup.devices[tdev].description, cond.type, cond.id, grp.groupid)
        return "",false
    end

    return cond.laststate.lastvalue, cond.laststate.state -- luacheck: ignore 511
end

-- Evaluate conditions within group. Return overall group state (all conditions met).
local function evaluateGroup( grp, cdata, tdev )
    D("evaluateGroup(%1,cdata,%2)", grp.groupid, tdev)
    if grp.groupconditions == nil or #grp.groupconditions == 0 then return false end -- empty group always false
    local hasTimer = false;
    local passed = true; -- innocent until proven guilty
    local skey = tostring(tdev)
    local now = sensorState[skey].timebase
    sensorState[skey].condState[grp.groupid] = sensorState[skey].condState[grp.groupid] or {}
    local gs = sensorState[skey].condState[grp.groupid]
    local latched = {}
    for _,cond in ipairs( grp.groupconditions or {} ) do
        if cond.type ~= "comment" then
            -- Fetch prior state/value
            local cs = sensorState[skey].condState[cond.id]
            if cs == nil then
                -- First time this condition is being evaluated.
                D("evaluateGroup() new condition state for %1", cond.id)
                cs = { id=cond.id, statestamp=0, stateedge={}, valuestamp=0 }
                sensorState[skey].condState[cond.id] = cs
            end
            cond.laststate = cs

            -- Evaluate for state and value
            local newvalue, state, condTimer = evaluateCondition( cond, grp, tdev )
            D("evaluateGroup() eval group %1 cond %2 result is state %3 timer %4", grp.groupid,
                cond.id, state, condTimer)

            hasTimer = condTimer or hasTimer

            -- Preserve the result of the condition eval. We are edge-triggered,
            -- so only save changes, with timestamp.
            if state ~= cs.laststate then
                D("evaluateGroup() condition %1 value state changed from %1 to %2", cs.laststate, state)
                -- ??? At certain times, Vera gets a time that is in the future, or so it appears. It looks like the TZ offset isn't applied, randomly.
                -- Maybe if call is during ntp update, don't know. Investigating... This log message helps detection and analysis.
                if now < cs.statestamp then L({level=1,msg="Time moved backwards! Sensor %4 cond %1 last change at %2, but time now %3"}, cond.id, cs.statestamp, now, tdev) end
                addEvent{dev=tdev,event='condchange',cond=cond.id,oldState=cs.laststate,newState=state}
                cs.laststate = state
                cs.statestamp = now
                cs.stateedge = cs.stateedge or {}
                cs.stateedge[state and 1 or 0] = now
                if state and ( cond.repeatcount or 0 ) > 1 then
                    -- If condition now true and counting repeats, append time to list and prune
                    cs.repeats = cs.repeats or {}
                    table.insert( cs.repeats, now )
                    while #cs.repeats > cond.repeatcount do table.remove( cs.repeats, 1 ) end
                end
            end

            -- Save actual current value if changed (for status display), and when it changed.
            if newvalue ~= cs.lastvalue then
                cs.priorvalue = cs.lastvalue
                cs.lastvalue = newvalue
                cs.valuestamp = now
            end

            -- Check for predecessor/sequence
            if state and ( cond.after or "" ) ~= "" then
                -- Sequence; this condition must become true after named sequence becomes true
                local predCond = findCondition( cond.after, cdata )
                D("evaluateCondition() sequence predecessor %1=%2", cond.after, predCond)
                if predCond == nil then
                    state = false
                else
                    local predState = sensorState[skey].condState[ predCond.id ]
                    D("evaluateCondition() testing predecessor %1 state %2", predCond, predState)
                    if predState == nil then
                        state = false
                        L({level=2,msg="Condition %1 can't meet sequence requirement, condition %2 missing!"}, cond.id, cond.after);
                    else
                        local age = cs.statestamp - predState.statestamp
                        local window = cond.aftertime or 0
                        -- To clear, pred must be true, pred's true precedes our true, and if window, age within window
                        D("evaluateCondition() pred %1, window %2, age %3", predCond.id, window, age)
                        if not ( predState.evalstate and age >= 0 and ( window==0 or age <= window ) ) then
                            D("evaluateCondition() didn't meet sequence requirement %1 after %2(=%3) within %4 (%5 ago)",
                                cond.id, predCond.id, predState.evalstate, cond.aftertime or "any", age)
                            state = false
                        end
                    end
                end
            end

            if state and ( cond.repeatcount or 0 ) > 1 then
                -- Repeat count over duration (don't need hasTimer, it's leading-edge-driven)
                -- The repeats array contains the most recent repeatcount (or fewer) timestamps
                -- of when the condition was met. If (a) the array has the required number of
                -- events, and (b) the delta from the first to now is <= the repeat window, we're
                -- true.
                D("evaluateGroup() cond %1 repeat check %2x in %3s from %4", cond.id,
                    cond.repeatcount, cond.repeatwithin, cond.repeats)
                if #( cs.repeats or {} ) < cond.repeatcount then
                    -- Not enough samples yet
                    state = false
                elseif ( now - cs.repeats[1] ) > ( cond.repeatwithin or 60 ) then
                    -- Gap between first sample and now too long
                    D("evaluateGroup() cond %1 repeated %2x in %3s--too long!",
                        cond.id, #cs.repeats, now - cs.repeats[1])
                    state = false
                else
                    D("evaluateGroup() cond %1 repeated %2x in %3s (seeking %4 within %5, good!)",
                        cond.id, #cs.repeats, now-cs.repeats[1], cond.repeatcount, cond.repeatwithin)
                end
            elseif ( cond.duration or 0 ) > 0 then
                -- Duration restriction?
                -- Age is seconds since last state change.
                local op = cond.duration_op or "ge"
                if op == "lt" then
                    -- If duration < X, then eval is true only if last true interval
                    -- lasted less than X seconds, meaning, we act when the condition goes
                    -- false, checking the "back interval".
                    if not state then
                        local age = (cs.stateedge[0] or now) - (cs.stateedge[1] or 0)
                        state = age < cond.duration
                        D("evaluateGroup() cond %1 was true for %2, limit is %3, state now %4", cond.id,
                            age, cond.duration, state)
                    else
                        -- Not ready yet.
                        D("evaluateGroup() cond %1 duration < %2, not ready yet", cond.id, cond.duration)
                        state = false
                    end
                elseif state then
                    -- Handle "at least" duration. Eval true only when sustained for period
                    local age = now - cs.statestamp
                    if age < cond.duration then
                        D("evaluateGroup() cond %1 suppressed, age %2, has not yet met duration %3",
                            cond.id, age, cond.duration)
                        state = false
                        local rem = math.max( 1, cond.duration - age )
                        scheduleDelay( tostring(tdev), rem )
                    else
                        D("evaluateGroup() cond %1 age %2 (>=%3) success", cond.id, age, cond.duration)
                    end
                end
            end

            -- Latching option. When latched, a condition that goes true remains true until the
            -- ReactorSensor untrips (another non-latched condition goes false), even if its
            -- other test conditions are no longer met.
            if ( cond.latch or 0 ) ~= 0 and cs.evalstate and not state then
                -- Attempting to transition from true to false with latch option set. Check ReactorSensor.
                if ( gs.evalstate or false ) then
                    -- Group is tripped, so this condition is forced to remain true.
                    D("evaluateGroup() cond %1 state %2 overriding to true, latched condition!",
                        cond.id, state)
                    state = true
                    table.insert( latched, cond.id )
                end
            end

            -- Save the final determination of state for this condition.
            passed = state and passed
            if state ~= cs.evalstate then
                addEvent{dev=tdev,event='evalchange',cond=cond.id,oldState=cs.evalstate,newState=state}
                cs.evalstate = state
                cs.evalstamp = now
            end

            D("evaluateGroup() cond %1 %2 final %3, group now %4", cond.id, cond.type, state, passed)
        end
    end

    -- Save group state (create or change only).
    if grp.invert then passed = not passed end
    D("evaluateGroup() grp %1 conditions invert %3; new group state %2, previous %4",
        grp.groupid, passed, grp.invert and "yes" or "no", gs.evalstate)
    if gs.evalstate == nil or gs.evalstate ~= passed then
        addEvent{dev=tdev,event='groupchange',cond=grp.groupid,oldState=gs.evalstate,newState=passed}
        gs.evalstate = passed
        gs.evalstamp = now
        gs.changed = true
        if not gs.evalstate then
            -- Reset latched conditions when group resets
            for _,l in ipairs(latched) do
                local cs = sensorState[skey].condState[l]
                cs.evalstate = cs.laststate
                cs.evalstamp = now
            end
        end
    else
        gs.changed = false
    end
    gs.hastimer = hasTimer

    return passed, hasTimer
end

-- Loop through condition groups and evaluate, determine overall state.
local function evaluateConditions( cdata, tdev )
    -- Evaluate all groups. Any group match is a pass.
    local hasTimer = false
    local passed = false
    local changed = {}
    for _,grp in ipairs( cdata.conditions or {}) do
        if not grp.disabled then
            local match, t = evaluateGroup( grp, cdata, tdev )
            passed = match or passed
            hasTimer = t or hasTimer
            D("evaluateConditions() group %1 eval %2, timer %3, overall state %4 timer %5, continuing",
                grp.groupid, match, t, passed, hasTimer)
            -- can't shortcut until we've gotten rid of hasTimer -- if pass then break end
        else
            D("evaluateConditions() group %1 disabled, skipped", grp.groupid)
        end
    end

    D("evaluateConditions() sensor %1 overall state now %1, hasTimer %2", passed, hasTimer)
    return passed, hasTimer, changed
end

-- Perform update tasks
local function updateSensor( tdev )
    D("updateSensor(%1) %2", tdev, luup.devices[tdev].description)
    local skey = tostring(tdev)

    -- If not enabled, no work to do.
    if not isEnabled( tdev ) then
        D("updateSensor() disabled; no action")
        return
    end

    -- Reload sensor state if cache purged
    sensorState[skey].condState = loadCleanState( tdev )

    -- Check throttling for update rate
    local hasTimer = false -- luacheck: ignore 311/hasTimer
    local maxUpdate = getVarNumeric( "MaxUpdateRate", 30, tdev, RSSID )
    local _, _, rate60 = rateLimit( sensorState[skey].updateRate, maxUpdate, false )
    if maxUpdate == 0 or rate60 <= maxUpdate then
        rateBump( sensorState[skey].updateRate )
        sensorState[skey].updateThrottled = false

        -- Fetch the condition data.
        local cdata = sensorState[skey].configData

        -- Mark a stable base of time
        local tt = getVarNumeric( "TestTime", 0, tdev, RSSID )
        sensorState[skey].timebase = tt == 0 and os.time() or tt
        sensorState[skey].timeparts = os.date("*t", sensorState[skey].timebase)
        D("updateSensor() base time is %1 (%2)", sensorState[skey].timebase,
            sensorState[skey].timeparts)

        -- Update state (if changed)
        updateVariables( cdata, tdev )
        local currTrip = getVarNumeric( "Tripped", 0, tdev, SENSOR_SID ) ~= 0
        local retrig = getVarNumeric( "Retrigger", 0, tdev, RSSID ) ~= 0
        local invert = getVarNumeric( "Invert", 0, tdev, RSSID ) ~= 0
        local newTrip
        newTrip, hasTimer = evaluateConditions( cdata, tdev )
        if invert then newTrip = not newTrip end
        D("updateSensor() trip %4was %1 now %2, retrig %3", currTrip, newTrip,
            retrig, invert and "(inverted) " or "" )

        -- Update runtime based on last status
        local now = os.time()
        if currTrip then
            -- Update accumulated trip time
            local delta = now - getVarNumeric( "lastacc", now, tdev, RSSID )
            luup.variable_set( RSSID, "Runtime", getVarNumeric( "Runtime", 0, tdev, RSSID ) + delta, tdev )
        end
        luup.variable_set( RSSID, "lastacc", now, tdev )

        -- Set tripped state based on change in status.
        if currTrip ~= newTrip or ( newTrip and retrig ) then
            -- Changed, or retriggerable.
            local maxTrip = getVarNumeric( "MaxChangeRate", 5, tdev, RSSID )
            _, _, rate60 = rateLimit( sensorState[skey].changeRate, maxTrip, false )
            if maxTrip == 0 or rate60 <= maxTrip then
                rateBump( sensorState[skey].changeRate )
                sensorState[skey].changeThrottled = false
                trip( newTrip, tdev )
            else
                if not sensorState[skey].changeThrottled then
                    L({level=2,msg="%2 (#%1) trip state changing too fast (%4 > %3/min)! Throttling..."},
                        tdev, luup.devices[tdev].description, maxTrip, rate60)
                    sensorState[skey].changeThrottled = true
                    addEvent{dev=tdev,event='throttle',['type']='change',rate=rate60,limit=maxTrip}
                    setMessage( "Throttled! (high change rate)", tdev )
                end
                hasTimer = true -- force, so sensor gets checked later
            end
        end
        if not sensorState[skey].changeThrottled then
            setMessage( newTrip and "Tripped" or "Not tripped", tdev )
        end

        -- Save the condition state.
        sensorState[skey].condState.lastSaved = os.time()
        luup.variable_set( RSSID, "cstate", json.encode(sensorState[skey].condState), tdev )
    else
        if not sensorState[skey].updateThrottled then
            L({level=2,msg="%2 (#%1) updating too fast (%4 > %3/min)! Throttling..."},
                tdev, luup.devices[tdev].description, maxUpdate, rate60)
            setMessage( "Throttled! (high update rate)", tdev )
            sensorState[skey].updateThrottled = true
            addEvent{dev=tdev,event='throttle',['type']='update',rate=rate60,limit=maxUpdate}
        end
        hasTimer = true -- force, so sensor gets checked later.
    end

    -- No need to reschedule timer if no demand. Condition may have rescheduled
    -- itself (no need to set hasTimer), so at the moment, hasTimer is only used
    -- for throttle recovery.
    if hasTimer or getVarNumeric( "ContinuousTimer", 0, tdev, RSSID ) ~= 0 then
        D("updateSensor() hasTimer or ContinuousTimer, scheduling update")
        local v = ( 60 - ( os.time() % 60 ) ) + TICKOFFS
        scheduleDelay( {id=skey,info="hasTimer"}, v )
    end
end

local function sensorTick(tdev)
    D("sensorTick(%1)", tdev)

    -- updateSensor will schedule next tick if needed
    if isEnabled( tdev ) then
        updateSensor( tdev )
    else
        setMessage("Disabled", tdev)
    end
end

-- Tick handler for master device
local function masterTick(pdev)
    D("masterTick(%1)", pdev)
    assert(pdev == pluginDevice)
    local now = os.time()
    local nextTick = math.floor( now / 60 + 1 ) * 60
    scheduleTick( tostring(pdev), nextTick )

    -- Check and update house mode.
    setVar( MYSID, "HouseMode", luup.attr_get( "Mode", 0 ) or "1", pdev )

    -- Vera Secure has battery, check it.
    if hasBattery then
        pcall( checkSystemBattery, pdev )
    end

    -- Check DST change. Re-eval all conditions if changed, just to be safe.
    local dot = os.date("*t").isdst and "1" or "0"
    local lastdst = initVar( "LastDST", dot, pdev, MYSID )
    D("masterTick() current DST %1, last %2", dot, lastdst)
    if dot ~= lastdst then
        L({level=2,msg="DST change detected! Re-evaluating all children."})
        luup.variable_set( MYSID, "LastDST", dot, pdev )
        for k,v in pairs(luup.devices) do
            if v.device_type == RSTYPE then
                luup.call_action( RSSID, "Restart", {}, k ) -- runs as job
            end
        end
    end

    -- Geofencing. If flag on, at least one sensor is using geofencing.
    if geofenceMode ~= 0 then
        -- Getting geofence data can be a long-running task because of handling
        -- userdata, so run as a job.
        D("masterTick() geofence mode %1, launching geofence update job", geofenceMode)
        local rc,rs,rj,ra = luup.call_action( MYSID, "UpdateGeofences", {}, pdev ) -- luacheck: ignore 211
    end

    -- See if any cached state has expired
    local expiry = getVarNumeric( "StateCacheExpiry", 600, pdev, MYSID )
    if expiry > 0 then
        for td,cx in pairs( sensorState or {} ) do
            -- If save time not there, the cache entry never expires.
            if ( ( cx.condState or {} ).lastSaved or now ) + expiry <= now then
                D("masterTick() expiring state cache for %1", td)
                cx.condState = nil
            end
        end
    end
end

-- Start an instance
local function startSensor( tdev, pdev )
    D("startSensor(%1,%2)", tdev, pdev)

    -- Device one-time initialization
    sensor_runOnce( tdev )

    -- Initialize instance data; take care not to scrub eventList
    local skey = tostring( tdev )
    sensorState[skey] = sensorState[skey] or {}
    sensorState[skey].eventList = sensorState[skey].eventList or {}
    sensorState[skey].configData = {}
    sensorState[skey].condState = {}
    sensorState[skey].updateRate = initRate( 60, 15 )
    sensorState[skey].updateThrottled = false
    sensorState[skey].changeRate = initRate( 60, 15 )
    sensorState[skey].changeThrottled = false

    math.randomseed( os.time() )

    -- Load the config data.
    loadSensorConfig( tdev )

    -- Clean and restore our condition state.
    sensorState[tostring(tdev)].condState = nil
    sensorState[tostring(tdev)].condState = loadCleanState( tdev )

    addEvent{ dev=tdev, event='start' }

    -- Watch our own cdata; when it changes, re-evaluate.
    -- NOTE: MUST BE *AFTER* INITIAL LOAD OF CDATA
    luup.variable_watch( "reactorWatch", RSSID, "cdata", tdev )

    setMessage("Starting...", tdev)

    -- Start the sensor's tick.
    scheduleDelay( { id=tostring(tdev), func=sensorTick, owner=tdev }, 5 )

    luup.set_failure( false, tdev )
    return true
end

local function waitSystemReady( pdev )
    D("waitSystemReady(%1)", pdev)
    for n,d in pairs(luup.devices) do
        if d.device_type == "urn:schemas-micasaverde-com:device:ZWaveNetwork:1" then
            local sysStatus = luup.variable_get( "urn:micasaverde-com:serviceId:ZWaveNetwork1", "NetStatusID", n )
            if sysStatus ~= nil and sysStatus ~= "1" then
                -- Z-Wave not yet ready
                L("Waiting for Z-Wave ready, status %1", sysStatus)
                luup.variable_set( MYSID, "Message", "Waiting for Z-Wave ready", pdev )
                scheduleDelay( { id=tostring(pdev), func=waitSystemReady, owner=pluginDevice }, 5 )
                return
            end
            break
        end
    end

    -- System is now ready. Finish initialization and start timers.
    L("Z-Wave ready, starting ReactorSensors.")
    luup.variable_set( MYSID, "Message", "Starting ReactorSensors...", pdev )

    -- Start the master tick
    local tt = math.floor( os.time() / 60 + 1 ) * 60 -- next minute
    scheduleTick( { id=tostring(pdev), func=masterTick, owner=pdev }, tt, { replace=true } )

    -- Resume any scenes that were running prior to restart
    resumeScenes( pdev )

    -- Ready to go. Start our children.
    local count = 0
    local started = 0
    for k,v in pairs(luup.devices) do
        if v.device_type == RSTYPE and v.device_num_parent == pdev then
            count = count + 1
            L("Starting sensor %1 (%2)", k, luup.devices[k].description)
            local status, err = pcall( startSensor, k, pdev )
            if not status then
                L({level=2,msg="Failed to start %1 (%2): %3"}, k, luup.devices[k].description, err)
                addEvent{ dev=k, event="error", message="Startup failed", reason=err }
                setMessage( "Failed (see log)", k )
                luup.set_failure( 1, k ) -- error on timer device
            else
                started = started + 1
            end
        end
    end
    luup.variable_set( MYSID, "NumChildren", count, pdev )
    luup.variable_set( MYSID, "NumRunning", started, pdev )
    if count == 0 then
        luup.variable_set( MYSID, "Message", "Open control panel!", pdev )
    else
        luup.variable_set( MYSID, "Message", string.format("Started %d of %d at %s", started, count, os.date("%x %X")), pdev )
    end
end

-- Start plugin running.
function startPlugin( pdev )
--[[
    local uilang = luup.attr_get('ui_lang', 0) or "en"
    local plang = luup.variable_get( MYSID, "lang", pdev ) or ""
    if plang ~= "" then uilang = plang end
    i18n.loadFile("T_Reactor_i18n.json") -- Load default language package
    if uilang ~= "en" then
        local f = io.open("T_Reactor_i18n-" .. uilang .. ".json", "r")
        if not f then
            os.execute("curl -s https://raw.githubusercontent.com/toggledbits/Reactor/master/{T_Reactor_i18n-"..uilang..".json} -o '#1'");
        else f:close() end
        local success, err = pcall( i18n.loadFile, "T_Reactor_i18n-" .. uilang .. ".json" )
        if success then
            i18n.setLocale( uilang )
        end
    end
--]]

    L("Plugin version %2, device %1 (%3)", pdev, _PLUGIN_VERSION, luup.devices[pdev].description)

    luup.variable_set( MYSID, "Message", "Initializing...", pdev )
    luup.variable_set( MYSID, "NumRunning", "0", pdev )

    -- Early inits
    pluginDevice = pdev
    isALTUI = false
    isOpenLuup = false
    sensorState = {}
    watchData = {}
    sceneData = {}
    luaFunc = {}
    sceneWaiting = {}
    sceneState = {}
    luaEnv = nil

    -- Debug?
    if getVarNumeric( "DebugMode", 0, pdev, MYSID ) ~= 0 then
        debugMode = true
        D("startPlugin() debug enabled by state variable DebugMode")
    end

    -- Check for ALTUI and OpenLuup
    local failmsg = false
    for k,v in pairs(luup.devices) do
        if v.device_type == "urn:schemas-upnp-org:device:altui:1" and v.device_num_parent == 0 then
            D("start() detected ALTUI at %1", k)
            isALTUI = true
            local rc,rs,jj,ra = luup.call_action("urn:upnp-org:serviceId:altui1", "RegisterPlugin",
                {
                    newDeviceType=RSTYPE,
                    newScriptFile="J_ReactorSensor_ALTUI.js",
                    newDeviceDrawFunc="ReactorSensor_ALTUI.deviceDraw",
                    -- newControlPanelFunc="ReactorSensor_ALTUI.controlPanelDraw",
                    newStyleFunc="ReactorSensor_ALTUI.getStyle"
                }, k )
            D("startSensor() ALTUI's RegisterPlugin action for %5 returned resultCode=%1, resultString=%2, job=%3, returnArguments=%4", rc,rs,jj,ra, RSTYPE)
            rc,rs,jj,ra = luup.call_action("urn:upnp-org:serviceId:altui1", "RegisterPlugin",
                {
                    newDeviceType=MYTYPE,
                    newScriptFile="J_Reactor_ALTUI.js",
                    newDeviceDrawFunc="Reactor_ALTUI.deviceDraw",
                    newStyleFunc="Reactor_ALTUI.getStyle"
                }, k )
            D("startSensor() ALTUI's RegisterPlugin action for %5 returned resultCode=%1, resultString=%2, job=%3, returnArguments=%4", rc,rs,jj,ra, MYTYPE)
        elseif v.device_type == "openLuup" then
            D("start() detected openLuup")
            isOpenLuup = true
            local vv = getVarNumeric( "Vnumber", 0, k, v.device_type )
            if vv < 181121 then
                L({level=1,msg="OpenLuup version must be at least 181121; you have %1. Can't continue."}, vv)
                luup.variable_set( MYSID, "Message", "Unsupported firmware " .. tostring(vv), pdev )
                luup.set_failure( 1, pdev )
                failmsg = "Incompatible openLuup ver " .. tostring(vv)
            end
        elseif v.device_type == RSTYPE then
            luup.variable_set( RSSID, "Message", "Stopped", k )
        end
    end
    if failmsg then
        return false, failmsg, _PLUGIN_NAME
    end

    -- Check UI version
    if not checkVersion( pdev ) then
        L({level=1,msg="This plugin does not run on this firmware."})
        luup.variable_set( MYSID, "Message", "Unsupported firmware "..tostring(luup.version), pdev )
        luup.set_failure( 1, pdev )
        return false, "Incompatible firmware " .. luup.version, _PLUGIN_NAME
    end

    -- One-time stuff
    plugin_runOnce( pdev )

    -- More inits
    maxEvents = getVarNumeric( "MaxEvents", 50, pdev, MYSID )

    -- Initialize and start the plugin timer and master tick
    runStamp = 1
    scheduleDelay( { id=tostring(pdev), func=waitSystemReady, owner=pdev }, 5 )

    -- Return success
    luup.set_failure( 0, pdev )
    return true, "Ready", _PLUGIN_NAME
end

-- Add a child (used as both action and local function)
function actionAddSensor( pdev )
    D("addSensor(%1)", pdev)
    local ptr = luup.chdev.start( pdev )
    local highd = 0
    luup.variable_set( MYSID, "Message", "Adding sensor, please hard-refresh your browser.", pdev )
    for _,v in pairs(luup.devices) do
        if v.device_type == RSTYPE and v.device_num_parent == pdev then
            D("addSensor() appending existing device %1 (%2)", v.id, v.description)
            local dd = tonumber( string.match( v.id, "s(%d+)" ) )
            if dd == nil then highd = highd + 1 elseif dd > highd then highd = dd end
            luup.chdev.append( pdev, ptr, v.id, v.description, "",
                "D_ReactorSensor.xml", "", "", false )
        end
    end
    highd = highd + 1
    D("addSensor() creating child r%1s%2", pdev, highd)
    luup.chdev.append( pdev, ptr, string.format("r%ds%d", pdev, highd),
        "Reactor Sensor " .. highd, "", "D_ReactorSensor.xml", "", "", false )
    luup.chdev.sync( pdev, ptr )
    -- Should cause reload immediately.
end

-- Remove all child devices.
function actionMasterClear( dev )
    local ptr = luup.chdev.start( dev )
    luup.chdev.sync( dev, ptr )
    -- Should cause reload immediately.
end

-- Update geofence data. This is long-running, so runs as a job from the master tick.
function actionUpdateGeofences( pdev )
    local now = os.time()
    -- Geofencing. If flag on, at least one sensor is using geofencing. Fetch
    -- userdata, which can be very large. Shame that it comes back as JSON-
    -- formatted text that we need to decode; I'm sure the action had to encode
    -- it that way, and all we're going to do is decode back.
    local forcedMode = getVarNumeric( "ForceGeofenceMode", 0, pdev, MYSID )
    if forcedMode ~= 0 then
        geofenceMode = forcedMode
    end
    L("Checking geofences (%1)...", geofenceMode >= 0 and "quick" or "long")
    local ishome = getVarJSON( "IsHome", {}, pdev, MYSID )
    if type(ishome) ~= "table" then
        D("actionUpdateGeofences() IsHome data type invalid (%1)", type(ishome))
        L{level=2,msg="IsHome data invalid/corrupt; resetting."}
        ishome = {}
    end
    -- ??? pre-release data upgrade, remove at/after 2.5
    if not ishome.users then
        ishome.users = {}
        for k,v in pairs(ishome) do
            if tonumber(k) ~= nil then -- user IDs are always numeric
                ishome.users[tostring(k)] = v
            end
        end
        -- Separate pass, because modifying subject of iterator goes poorly.
        for k,_ in pairs(ishome.users) do
            ishome[k] = nil
        end
        ishome.version = 2
    end
    if ishome.version ~= 2 then
        L({level=2,msg="resetting IsHome data, old version %1"}, ishome.version)
        ishome = { users={} }
    end
    local rc,rs,rj,ra = luup.call_action( "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "GetUserData", { DataFormat="json" }, 0 ) -- luacheck: ignore 211
    -- D("actionUpdateGeofences() GetUserData action returned rc=%1, rs=%2, rj=%3, ra=%4", rc, rs, rj, ra)
    if rc ~= 0 or (ra or {}).UserData == nil then
        L({level=2,msg="Unable to fetch userdata for geofence check! rc=%1, ra=%2"}, rc, ra)
        return 2,0
    else
        local ud
        -- If mode > 0, we're only using home condition, so only need short
        -- decode of that we need, rather than all of user_data, which is
        -- massive even on small installations.
        ra = tostring( ra.UserData )
        if geofenceMode >= 0 then
            local mm = ra:match( '("users_settings": *%[[^]]*%])' )
            if mm then
                D("actionUpdateGeofences() found element in UserData (%1 bytes); using short decode", #ra)
                ud = json.decode( '{' .. mm .. '}' )
            end
        end
        if ud == nil then
            D("actionUpdateGeofences() doing full decode on UserData, %1 bytes", #ra)
            ud = json.decode( ra )
        end
        ra = nil -- luacheck: ignore 311
        if ud then
            -- For now, we keep it simple: just a list of users (ids) that are home.
            -- ud.users is array of usergeofence, which is { id, Name, Level, IsGuest }
            -- ud.usergeofences is array of { iduser, geotags } and geotags is
            --     { PK_User (same as id), id (of geotag), accuracy, ishome, notify, radius, address, color (hex6), latitude, longitude, name (of geotag), status, and poss others? }
            -- ud.user_settings contains the "ishome" we care about, though.
            local changed = false
            if geofenceMode < 0 then
                -- Long form geofence check.
                D("actionUpdateGeofences() doing long form geofence check with %1", ud.usergeofences)
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
                    urec.homeid = nil -- clear it every time
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
                            tag.name = g.name
                            tag.homeloc = g.ishome
                            oldtags[tostring(g.id)] = nil -- remove from old
                        else
                            -- New geotag
                            urec.tags[tostring(g.id)] = { id=g.id, name=g.name, homeloc=g.ishome, status=st, since=now }
                            L("Detected geofence change: user %1 has added %2 (%3) %4 %5",
                                v.iduser, g.name, g.id, g.ishome, st)
                            changed = true
                        end
                        if g.ishome then urec.homeid = g.id end
                        if st == "in" then table.insert( inlist, g.id ) end
                    end
                    urec.inlist = inlist
                    -- Handle geotags that have been removed
                    for k,g in pairs( oldtags ) do
                        L("Detected geofence change: user %1 deleted %2 (%3) %4",
                            v.iduser, g.name, g.id, g.ishome)
                        urec.tags[k] = nil
                        changed = true
                    end
                    urec.since = now
                end
            else
                -- If not in long mode, clear minimal data, in case mode switches
                -- back. This can happen if groups temporarily disabled, etc. Since
                -- This preserves timestamps and data.
                for _,v in pairs( ishome.users or {} ) do
                    v.inlist = nil -- not relevant in short mode, safe to clear.
                end
            end
            D("actionUpdateGeofences() user home status=%1", ud.users_settings)
            -- Short form check stands alone or amends long form for home status.
            local ulist = map( getKeys( ishome.users ) )
            for _,v in ipairs( ud.users_settings or {} ) do
                local urec = ishome.users[tostring(v.id)]
                if urec then
                    local newhome = v.ishome or 0
                    if urec.ishome ~= newhome then
                        L("Detected geofence change: user %1 now " ..
                            ( ( newhome ~= 0 ) and "home" or "not home"), v.id)
                        urec.since = now
                        changed = true
                    end
                    urec.ishome = newhome
                    ulist[tostring(v.id)] = nil
                else
                    L("Detected geofence change: new user %1 ishome %2", v.id, v.ishome)
                    urec = { ishome=v.ishome, tags={}, since=now }
                    ishome.users[tostring(v.id)] = urec
                    changed = true
                end
            end
            -- Handle users that weren't listed (treat as not home)
            for v,_ in pairs( ulist ) do
                if ishome.users[v].ishome ~= 0 then
                    D("actionUpdateGeofences() user %1 not in users_settings, marking not home", v)
                    ishome.users[v].ishome = 0
                    ishome.users[v].since = now
                    changed = true
                end
            end
            -- Force update if geofenceMode has changed since last update.
            changed = changed or ishome.lastmode ~= geofenceMode
            ishome.lastmode = geofenceMode
            ishome.version = 2
            ishome.since = now
            D("actionUpdateGeofences() geofence data changed=%1, data=%2", changed, ishome)
            if changed then
                setVar( MYSID, "IsHome", json.encode( ishome ), pdev )
            end
        else
            L({level=2,msg="Failed to decode userdata for geofence check!"})
            return 2,0
        end
    end
    return 4,0
end

-- Enable or disable debug
function actionSetDebug( state, tdev ) -- luacheck: ignore 212
    debugMode = state or false
    if debugMode then
        D("Debug enabled")
    end
end

-- Set enabled state of ReactorSensor
function actionSetEnabled( enabled, tdev )
    D("setEnabled(%1,%2)", enabled, tdev)
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
    local wasEnabled = isEnabled( tdev )
    if wasEnabled ~= enabled then
        -- changing
        addEvent{ dev=tdev, event="action", action="SetEnabled", state=enabled and 1 or 0 }
        luup.variable_set( RSSID, "Enabled", enabled and "1" or "0", tdev )
        -- If disabling, do nothing else, so current actions complete/expire.
        if enabled then
            -- Kick off a new timer thread, which will also re-eval.
            scheduleDelay( { id=tostring(tdev), func=sensorTick, owner=tdev }, 2 )
            setMessage( "Enabling...", tdev )
        else
            setMessage( "Disabled", tdev )
        end
    end
end

-- Force trip a ReactorSensor
function actionTrip( dev )
    L("Sensor %1 (%2) trip action!", dev, luup.devices[dev].description)
    addEvent{ dev=dev, event="action", action="Trip" }
    trip( true, dev )
    setMessage("Tripped", dev);
end

-- Force reset (untrip) a ReactorSensor
function actionReset( dev )
    L("Sensor %1 (%2) reset action!", dev, luup.devices[dev].description)
    addEvent{ dev=dev, event="action", action="Reset" }
    trip( false, dev )
    setMessage("Not tripped", dev)
end

-- Set arming state of ReactorSensor
function actionSetArmed( armedVal, dev )
    L("Sensor %1 (%2) set armed to %4", dev, luup.devices[dev].description, armedVal)
    local armed = ( tonumber( armedVal ) or 0 ) ~= 0
    luup.variable_set( SENSOR_SID, "Armed", armed and "1" or "0", dev )
    addEvent{ dev=dev, event="action", action="SetArmed", state=armed and 1 or 0 }
end

-- Restart a ReactorSensor (reload config and force re-evals)
function actionRestart( dev )
    dev = tonumber( dev )
    assert( dev ~= nil )
    assert( luup.devices[dev] ~= nil and luup.devices[dev].device_type == RSTYPE )
    L("Restarting sensor %1 (%2)", dev, luup.devices[dev].description)
    addEvent{ dev=dev, event="action", action="Restart" }
    local success, err = pcall( startSensor, dev, luup.devices[dev].device_num_parent )
    if not success then
        L({level=2,msg="Failed to start %1 (%2): %3"}, dev, luup.devices[dev].description, err)
        setMessage( "Failed (see log)", dev )
        luup.set_failure( 1, dev ) -- error on timer device
    else
        luup.set_failure( 0, dev )
    end
end

-- Run a scene. By default, it's assumed this action is being called from outside
-- Reactor, so starting a scene does not stop prior started scenes, and ReactorScenes
-- are forced (if you don't want ReactorScenes, call the HomeAutomationGateway1
-- service action on device 0).
function actionRunScene( scene, options, dev )
    L("RunScene action request, scene %1", scene)
    if luup.devices[dev].device_type == RSTYPE then dev = luup.devices[dev].device_num_parent end
    if type(scene) == "string" then
        local ln = scene:lower()
        for k,v in pairs( luup.scenes ) do
            if v.name:lower() == ln then
                scene = k
                break
            end
        end
    end
    scene = tonumber( scene or "-1" ) or -1
    if scene <= 0 then
        L({level=1,msg="RunScene action failed, scene %1 not found."}, scene)
        return false
    end
    options = options or {}
    options.forceReactorScenes = true -- If we use this action, this is how we do it
    if options.stopPriorScenes == nil then options.stopPriorScenes = false end
    if options.contextDevice == nil then options.contextDevice = 0 end
    addEvent{ dev=dev, event="action", action="RunScene", scene=scene, options=options }
    runScene( scene, dev, options )
    return true
end

-- Stop running scene. If scene is not provided or 0, all scenes are stopped.
-- ctx is the context device, or 0 (global context) if not specified.
function actionStopScene( ctx, scene, dev )
    L("StopScene action, scene %1", scene)
    local taskid = nil
    if luup.devices[dev].device_type == RSTYPE then dev = luup.devices[dev].device_num_parent end
    ctx = tonumber( ctx ) or 0
    if scene ~= nil and tostring(scene) ~= "0" then
        taskid = string.format("ctx%dscene%s", ctx, tostring(scene))
    end
    addEvent{ dev=dev, event="action", action="StopScene", contextDevice=ctx, scene=scene }
    stopScene( ctx, taskid, dev )
end

-- Set group enabled state (job).
function actionSetGroupEnabled( grpid, enab, dev )
    D("actionSetGroupEnabled(%1,%2,%3)", grpid, enab, dev)
    -- Load a clean copy of the configuration.
    local cdata = loadSensorConfig( dev )
    local grp = findConditionGroup( grpid, cdata )
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
            dev, grp.groupid, grp.disabled and "disabled" or "enabled")
        addEvent{ dev=dev, event="action", action="SetGroupEnabled", group=grpid, enabled=enab and 1 or 0 }
        -- No need to call updateSensor here, modifying cdata does it
        luup.variable_set( RSSID, "cdata", json.encode( cdata ), dev )
        return 4,0
    end
    L({level=1,msg="%1 (%2) action SetGroupEnabled %3 failed, group not found in config"},
        luup.devices[dev].description, dev, grpid)
    return 2,0,"Invalid group"
end

-- Plugin timer tick. Using the tickTasks table, we keep track of
-- tasks that need to be run and when, and try to stay on schedule. This
-- keeps us light on resources: typically one system timer only for any
-- number of devices.
local functions = { [tostring(masterTick)]="masterTick", [tostring(sensorTick)]="sensorTick",
    [tostring(loadWaitingScenes)]="loadWaitingScenes", [tostring(execSceneGroups)]="execSceneGroups" }
function tick(p)
    D("tick(%1) pluginDevice=%2", p, pluginDevice)
    local stepStamp = tonumber(p,10)
    assert(stepStamp ~= nil)
    if stepStamp ~= runStamp then
        D( "tick() stamp mismatch (got %1, expecting %2), newer thread running. Bye!",
            stepStamp, runStamp )
        return
    end

    local now = os.time()
    local nextTick = nil
    tickTasks._plugin.when = 0 -- marker

    -- Since the tasks can manipulate the tickTasks table (via calls to
    -- scheduleTick()), the iterator is likely to be disrupted, so make a
    -- separate list of tasks that need service (to-do list).
    local todo = {}
    for t,v in pairs(tickTasks) do
        if t ~= "_plugin" and v.when ~= nil and v.when <= now then
            -- Task is due or past due
            D("tick() inserting eligible task %1 when %2 now %3", v.id, v.when, now)
            v.when = nil -- clear time; timer function will need to reschedule
            table.insert( todo, v )
        end
    end

    -- Run the to-do list tasks.
    D("tick() to-do list is %1", todo)
    for _,v in ipairs(todo) do
        local fname = functions[tostring(v.func)] or tostring(v.func)
        D("tick() calling %3(%4,%5) for %1 (task %2 %3)", v.owner,
            (luup.devices[v.owner] or {}).description, fname, v.owner, v.id,
            v.info)
        -- Call timer function with arguments ownerdevicenum,taskid[,args]
        -- The extra arguments are set up when the task is set/updated.
        local success, err = pcall( v.func, v.owner, v.id, unpack(v.args or {}) )
        if not success then
            L({level=1,msg="Reactor device %1 (%2) tick failed: %3"}, v.owner, (luup.devices[v.owner] or {}).description, err)
            addEvent{ dev=v.owner, event="error", message="tick failed", reason=err }
        else
            D("tick() successful return from %2(%1)", v.owner, fname)
        end
    end

    -- Things change while we work. Take another pass to find next task.
    for t,v in pairs(tickTasks) do
        if t ~= "_plugin" and v.when ~= nil then
            if nextTick == nil or v.when < nextTick then
                nextTick = v.when
            end
        end
    end

    -- Figure out next master tick, or don't resched if no tasks waiting.
    if nextTick ~= nil then
        D("tick() next eligible task scheduled for %1", os.date("%x %X", nextTick))
        now = os.time() -- Get the actual time now; above tasks can take a while.
        local delay = nextTick - now
        if delay < 1 then delay = 1 end
        tickTasks._plugin.when = now + delay
        D("tick() scheduling next tick(%3) for %1 (%2)", delay, tickTasks._plugin.when,p)
        luup.call_delay( "reactorTick", delay, p )
    else
        D("tick() not rescheduling, nextTick=%1, stepStamp=%2, runStamp=%3", nextTick, stepStamp, runStamp)
        tickTasks._plugin = nil
    end
end

-- Handle the sensor-specific watch (dispatched from the watch callback)
local function sensorWatch( dev, sid, var, oldVal, newVal, tdev, pdev )
    D("sensorWatch(%1,%2,%3,%4,%5,%6,%7)", dev, sid, var, oldVal, newVal, tdev, pdev)
    -- Watched variable has changed. Re-evaluate conditons.
    if dev == pdev then
        addEvent{ dev=tdev, event='devicewatch', device=dev,
            name=(luup.devices[dev] or {}).description, var=var }
    else
        addEvent{ dev=tdev, event='devicewatch', device=dev,
            name=(luup.devices[dev] or {}).description, var=sid .. "/" .. var,
            old=string.format("%q", tostring(oldVal):sub(1,64)),
            new=string.format("%q", tostring(newVal):sub(1,64)) }
    end
    updateSensor( tdev )
end

-- Watch callback. Dispatches to sensor-specific handling.
function watch( dev, sid, var, oldVal, newVal )
    D("watch(%1,%2,%3,%4,%5)", dev, sid, var, oldVal, newVal)
    assert(var ~= nil) -- nil if service or device watch (can happen on openLuup)

    if sid == RSSID and var == "cdata" then
        -- Sensor configuration change. Immediate update.
        L("Child %1 (%2) configuration change, updating!", dev, luup.devices[dev].description)
        addEvent{ dev=dev, event="configchange" }
        loadSensorConfig( dev )
        updateSensor( dev )
    else
        local key = string.format("%d:%s/%s", dev, sid, var)
        if watchData[key] then
            for t in pairs(watchData[key]) do
                local tdev = tonumber(t, 10)
                if tdev ~= nil then
                    D("watch() dispatching to %1 (%2)", tdev, luup.devices[tdev].description)
                    local success,err = pcall( sensorWatch, dev, sid, var, oldVal, newVal, tdev, pluginDevice )
                    if not success then
                        L({level=1,msg="watch() dispatch error: %1"}, err)
                    end
                end
            end
        else
            L("Watch callback for unregistered key %1", key)
        end
    end
end

local EOL = "\r\n"

local function getDevice( dev, pdev, v )
    if v == nil then v = luup.devices[dev] end
    if json == nil then json = require("dkjson") end
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
    }
    local rc,t,httpStatus,uri
    if isOpenLuup then
        uri = "http://localhost:3480/data_request?id=status&DeviceNum=" .. dev .. "&output_format=json"
    else
        uri = "http://localhost/port_3480/data_request?id=status&DeviceNum=" .. dev .. "&output_format=json"
    end
    rc,t,httpStatus = luup.inet.wget(uri, 15)
    if httpStatus ~= 200 or rc ~= 0 then
        devinfo['_comment'] = string.format( 'State info could not be retrieved, rc=%s, http=%s', tostring(rc), tostring(httpStatus) )
        return devinfo
    end
    local d = json.decode(t)
    local key = "Device_Num_" .. dev
    if d ~= nil and d[key] ~= nil and d[key].states ~= nil then d = d[key].states else d = nil end
    devinfo.states = d or {}
    return devinfo
end

local function getReactorScene( t, s )
    local resp = "    " .. t .. ( s and "" or " (none)" ) .. EOL
    local pfx = "        "
    if s then
        for _,gr in ipairs( s.groups or {}) do
            if (gr.delay or 0) > 0 then
                resp = resp .. pfx .. "Delay " .. gr.delay .. " " .. (gr.delaytype or "inline") .. EOL
            end
            for _,act in ipairs( gr.actions or {} ) do
                if act.type == "comment" then
                    resp = resp .. pfx .. "Comment: " .. tostring(act.comment)
                elseif act.type == "runlua" then
                    local mime = require('mime')
                    local lua = (act.encoded_lua or 0) and mime.unb64( act.lua ) or act.lua
                    lua = (lua or ""):gsub( "\r\n", "\n" )
                    lua = lua:gsub( "\r", "\n" )
                    lua = lua:gsub( "\n", EOL .. pfx .. "    " )
                    resp = resp .. pfx .. "Run Lua:" .. EOL .. pfx .."    " .. tostring(lua)
                elseif act.type == "runscene" then
                    resp = resp .. pfx .. "Run scene " .. tostring(act.scene) .. " " .. ((luup.scenes[act.scene] or {}).description or (act.sceneName or "").."?")
                elseif act.type == "device" then
                    local p = {}
                    for _,pp in ipairs( act.parameters or {} ) do
                        table.insert( p, pp.name .. "=" .. tostring(pp.value) )
                    end
                    p = table.concat( p, ", " )
                    resp = resp .. pfx .. "Device " .. (act.device or "?") .. " (" ..
                        ((luup.devices[act.device or 0] or {}).description or (act.deviceName or "").."?") ..
                        ") action " .. (act.service or "?") .. "/" ..
                        (act.action or "?") .. "( " .. p .. " )"
                elseif act.type == "housemode" then
                    resp = resp .. pfx .. "Change house mode to " .. tostring(act.housemode)
                else
                    resp = resp .. pfx .. "Action type " .. act.type .. "?"
                    local arr = {}
                    for k,v in pairs(act) do
                        if k ~= "type" then
                            table.insert( arr, k + "=" + tostring(v) )
                        end
                    end
                    if #arr then resp = resp .. " " .. table.concat( arr, ", " ) end
                end
                resp = resp .. EOL
            end
        end
    end
    return resp
end

local function getEvents( deviceNum )
    if deviceNum == nil or luup.devices[deviceNum] == nil or luup.devices[deviceNum].device_type ~= RSTYPE then
        return "no events: device does not exist or is not ReactorSensor"
    end
    local resp = "    Events" .. EOL
    for _,e in ipairs( ( sensorState[tostring(deviceNum)] or {}).eventList or {} ) do
        resp = resp .. string.format("        %15s ", os.date("%x %X", e.when or 0) )
        resp = resp .. ( e.event or "event?" ) .. ": "
        local d = {}
        for k,v in pairs(e) do
            if not ( k == "time" or k == "when" or k == "event" or ( k == "dev" and tostring(v)==tostring(deviceNum) ) ) then
                table.insert( d, string.format("%s=%s", tostring(k), tostring(v)) )
            end
        end
        resp = resp .. table.concat( d, ", " ) .. EOL
    end
    return resp
end

-- A "safer" JSON encode for Lua structures that may contain recursive refereance.
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
    return r
end

function request( lul_request, lul_parameters, lul_outputformat )
    D("request(%1,%2,%3) luup.device=%4", lul_request, lul_parameters, lul_outputformat, luup.device)
    local action = lul_parameters['action'] or lul_parameters['command'] or ""
    local deviceNum = tonumber( lul_parameters['device'], 10 )
    if action == "debug" then
        if lul_parameters.debug ~= nil then
            debugMode = TRUESTRINGS:match( lul_parameters.debug )
        else
            debugMode = not debugMode
        end
        D("debug set %1 by request", debugMode)
        return "Debug is now " .. ( debugMode and "on" or "off" ), "text/plain"

    elseif action == "preloadscene" then
        -- Preload scene used by a ReactorSensor. Call by UI during edit.
        if ( lul_parameters.flush or 0 ) ~= 0 then
            -- On demand, flush all scene data.
            sceneData = {}
            luup.variable_set( MYSID, "scenedata", "{}", pluginDevice )
        end
        local status, msg = pcall( loadScene, tonumber(lul_parameters.scene or 0), pluginDevice )
        return json.encode( { status=status,message=msg } ), "application/json"

    elseif action == "summary" then
        local r = ""
        r = r .. string.rep("*", 51) .. " REACTOR LOGIC SUMMARY REPORT " .. string.rep("*", 51) .. EOL
        r = r .. "   Version: " .. tostring(_PLUGIN_VERSION) .. " config " .. tostring(_CONFIGVERSION) .. " pluginDevice " .. pluginDevice .. EOL
        r = r .. "Local time: " .. os.date("%Y-%m-%dT%H:%M:%S%z") .. ", DST=" .. tostring(luup.variable_get( MYSID, "LastDST", pluginDevice ) or "") .. EOL
        r = r .. "House mode: " .. tostring(luup.variable_get( MYSID, "HouseMode", pluginDevice ) or "") .. EOL
        r = r .. "  Sun data: " .. tostring(luup.variable_get( MYSID, "sundata", pluginDevice ) or "") .. EOL
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
            r = r .. "     Power: " .. tostring(luup.variable_get( MYSID, "SystemPowerSource", pluginDevice ) or "")
            r = r .. ", battery level " .. tostring(luup.variable_get( MYSID, "SystemBatteryLevel", pluginDevice ) or "") .. EOL
        end
        for n,d in pairs( luup.devices ) do
            if d.device_type == RSTYPE and ( deviceNum==nil or n==deviceNum ) then
                sensorState[tostring(n)].condState = loadCleanState( n )
                local status = ( ( getVarNumeric( "Armed", 0, n, SENSOR_SID ) ~= 0 ) and " armed" or "" )
                status = status .. ( ( getVarNumeric("Tripped", 0, n, SENSOR_SID ) ~= 0 ) and " tripped" or "" )
                r = r .. string.rep( "=", 132 ) .. EOL
                r = r .. string.format("%s (#%d)%s", tostring(d.description), n, status) .. EOL
                local cdata,err = getVarJSON( "cdata", {}, n, RSSID )
                if err then
                    r = r .. "**** UNPARSEABLE CONFIGURATION: " .. err .. EOL
                    cdata = {}
                end
                r = r .. string.format("    Version %d.%d %s", cdata.version or 0, cdata.timestamp or 0, os.date("%x %X", cdata.timestamp or 0)) .. EOL
                r = r .. string.format("    Message/status: %s", luup.variable_get( RSSID, "Message", n ) or "" ) .. EOL
                local s = getVarNumeric( "TestTime", 0, n, RSSID )
                if s ~= 0 then
                    r = r .. string.format("    Test time set: %s", os.date("%Y-%m-%d %H:%M", s)) .. EOL
                end
                s = getVarNumeric( "TestHouseMode", 0, n, RSSID )
                if s ~= 0 then
                    r = r .. string.format("    Test house mode set: %d", s) .. EOL
                end
                local first = true
                for _,vv in pairs( cdata.variables or {} ) do
                    if first then
                        r = r .. "    Variable/expressions" .. EOL
                        first = false
                    end
                    local lv = luup.variable_get( VARSID, vv.name, n ) or "(no value)"
                    local le = luup.variable_get( VARSID, vv.name .. "_Error", n ) or ""
                    r = r .. string.format("        %s=%s (last %q)", vv.name or "?", vv.expression or "?", lv) .. EOL
                    if le ~= "" then r = r .. "        ******** Error: " .. le .. EOL end
                end
                local ng=0
                for _,gc in ipairs( cdata.conditions or {} ) do
                    local gs = (sensorState[tostring(n)].condState or {})[gc.groupid] or {}
                    ng = ng + 1
                    r = r .. "    Group #" .. ng .. " <" .. gc.groupid .. "> " ..
                        ( gs.evalstate and "true" or "false" ) .. " as of " .. shortDate( gs.evalstamp ) ..
                        ( gc.invert and " INVERTED" or "" ) ..
                        ( gc.disabled and " DISABLED" or "" ) ..
                        EOL
                    for _,cond in ipairs( gc.groupconditions or {} ) do
                        local cs = (sensorState[tostring(n)].condState or {})[cond.id] or {}
                        r = r .. "        =" .. ( cs.evalstate and "T" or "f" )
                        r = r .. " (" .. ( cond.type or "?type?" ) .. ") "
                        if cond.type == "service" then
                            r = r .. string.format("%s (%d) ", ( luup.devices[cond.device]==nil ) and ( "*** missing " .. ( cond.devicename or "unknown" ) ) or
                                luup.devices[cond.device].description, cond.device )
                            r = r .. string.format("%s/%s %s %s", cond.service or "?", cond.variable or "?", cond.operator or cond.condition or "?",
                                cond.value or "")
                            if cond.nocase == 0 then r = r .. " (match case)" end
                            if cond.duration then
                                r = r .. " for " .. ( cond.duration_op or "ge" ) ..
                                    " " .. cond.duration .. "s"
                            end
                            if cond.after then
                                if ( cond.aftertime or 0 ) > 0 then
                                    r = r .. " within " .. tostring(cond.aftertime) .. "s"
                                end
                                r = r .. " after " .. cond.after
                            end
                            if cond.repeatcount then
                                r = r .. " repeat " .. cond.repeatcount ..
                                    " within " .. ( cond.repeatwithin or 60 ).. "s"
                            end
                            if (cond.latch or 0) ~= 0 then
                                r = r .. " (latching)"
                            end
                        elseif cond.type == "comment" then
                            r = r .. string.format("%q", cond.comment)
                        elseif cond.type == "housemode" then
                            r = r .. "in " .. ( cond.value or "" )
                        elseif cond.type == "sun" then
                            r = r .. ( cond.operator or cond.condition or "?" ) .. " " .. ( cond.value or "" )
                        elseif cond.type == "trange" then
                            r = r .. ( cond.operator or cond.condition or "?" ) .. " " .. ( cond.value or "" )
                        elseif cond.type == "ishome" then
                            r = r .. ( cond.operator or "is" ) .. " " .. ( cond.value or "" )
                        elseif cond.type == "reload" then
                        else
                            r = r .. json.encode(cond)
                        end
                        r = r .. " ["
                        r = r .. ( cs.laststate and "true" or "false" ) .. "/" .. (cs.evalstate and "true" or "false" )
                        r = r .. " as of " .. shortDate( cs.statestamp ) .. "/" .. shortDate( cs.evalstamp ) .. "; "
                        if cs.priorvalue then r = r .. tostring(cs.priorvalue) .. " => " end
                        r = r .. tostring(cs.lastvalue) .. " at " .. shortDate( cs.valuestamp ) .. "]"
                        r = r .. " <" .. cond.id .. ">"
                        r = r .. EOL
                    end
                end
                r = r .. getReactorScene( "Trip Actions", cdata.tripactions );
                r = r .. getReactorScene( "Untrip Actions", cdata.untripactions );
                r = r .. getEvents( n )
            end
        end
        return r, "text/plain"

    elseif action == "tryexpression" then
        if luup.devices[deviceNum] == nil or luup.devices[deviceNum].device_type ~= RSTYPE then
            return json.encode{ status=false, message="Invalid device number" }, "application/json"
        end
        local expr = lul_parameters['expr'] or "?"
        local ctx = getExpressionContext( sensorState[tostring(deviceNum)].configData, deviceNum )
        if luaxp == nil then luaxp = require("L_LuaXP_Reactor") end
        -- if debugMode then luaxp._DEBUG = D end
        ctx.NULL = luaxp.NULL
        local result, err = luaxp.evaluate( expr, ctx )
        local ret = { status=true, resultValue=result, err=err or false, expression=expr }
        return json.encode( ret ), "application/json"

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
        local targetPath = "/etc/cmh-ludl/D_ReactorDeviceInfo.json"
        local tmpPath = "/tmp/D_ReactorDeviceInfo.tmp"
        if isOpenLuup then
            local loader = require "openLuup.loader"
            if loader.find_file == nil then return json.encode{ status=false, message="Your openLuup is out of update; please update." } end
            targetPath = loader.find_file( "D_ReactorDeviceInfo.json" )
            tmpPath = targetPath:gsub( ".json.*$", ".tmp" )
        end
        local http = require("socket.http")
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
            verify = luup.variable_get( MYSID, "SSLVerify", pluginDevice ) or "none",
            protocol = luup.variable_get( MYSID, "SSLProtocol", pluginDevice ) or 'tlsv1',
            options = luup.variable_get( MYSID, "SSLOptions", pluginDevice ) or 'all'
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
            os.execute( "rm -f -- " .. targetPath .. ".lzo" )
            local es = os.execute( "mv -f " .. tmpPath .. " " .. targetPath )
            if es ~= 0 then
                return json.encode{ status=false, exitStatus=es,
                    message="The download was successful but the updated file could not be installed;" ..
                    " please move " .. tmpPath .. " to " .. targetPath },
                    "application/json"
            end
            return json.encode{ status=true, message="Device info updated" }, "application/json"
        end
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
            verify = luup.variable_get( MYSID, "SSLVerify", pluginDevice ) or "none",
            protocol = luup.variable_get( MYSID, "SSLProtocol", pluginDevice ) or 'tlsv1',
            options = luup.variable_get( MYSID, "SSLOptions", pluginDevice ) or 'all'
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
            local bfile
            if isOpenLuup then
                local loader = require "openLuup.loader"
                if loader.find_file == nil then return json.encode{ status=false, message="Your openLuup is out of date; please update to 2018.11.21 or higher." } end
                bfile = loader.find_file( "L_Reactor.lua" ):gsub( "L_Reactor.lua$", "" ) .. "reactor-config-backup.json"
            else
                bfile = "/etc/cmh-ludl/reactor-config-backup.json"
            end
            local f = io.open( bfile, "w" )
            if f then
                f:write( bdata )
                f:close()
            else
                error("ERROR can't write " .. bfile)
            end
            return json.encode( { status=true, message="Done!", file=bfile } ), "application/json"
        end
        return bdata, "application/json"

    elseif action == "purge" then
        luup.variable_set( MYSID, "scenedata", "{}", pluginDevice )
        scheduleDelay( { id="reload", func=luup.reload, owner=pluginDevice }, 2 )
        return  "Purged; reloading Luup.", "text/plain"

    elseif action == "status" then
        local st = {
            name=_PLUGIN_NAME,
            plugin=_PLUGIN_ID,
            version=_PLUGIN_VERSION,
            configversion=_CONFIGVERSION,
            author="Patrick H. Rigney (rigpapa)",
            url=_PLUGIN_URL,
            ['type']=MYTYPE,
            responder=luup.device,
            timestamp=os.time(),
            system = {
                version=luup.version,
                isOpenLuup=isOpenLuup,
                isALTUI=isALTUI
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

    elseif action == "serviceinfo" then
        error("not yet implemented")

    else
        error("Not implemented: " .. action)
    end
end
