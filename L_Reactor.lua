--[[
    L_Reactor.lua - Core module for Reactor
    Copyright 2017,2018 Patrick H. Rigney, All Rights Reserved.
    This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
--]]
--luacheck: std lua51,module,read globals luup,ignore 542 611 612 614 111/_,no max line length

module("L_Reactor", package.seeall)

local debugMode = false

local _PLUGIN_ID = 9086
local _PLUGIN_NAME = "Reactor"
local _PLUGIN_VERSION = "2.0develop"
local _PLUGIN_URL = "https://www.toggledbits.com/reactor"
local _CONFIGVERSION = 00200

local MYSID = "urn:toggledbits-com:serviceId:Reactor"
local MYTYPE = "urn:schemas-toggledbits-com:device:Reactor:1"

local VARSID = "urn:toggledbits-com:servi00ceId:ReactorValues"

local RSSID = "urn:toggledbits-com:serviceId:ReactorSensor"
local RSTYPE = "urn:schemas-toggledbits-com:device:ReactorSensor:1"

local SENSOR_SID  = "urn:micasaverde-com:serviceId:SecuritySensor1"

local sensorState = {}
local tickTasks = {}
local watchData = {}
local devicesByName = {}
local sceneData = {}
local sceneWaiting = {}
local sceneState = {}
local hasBattery = true

local runStamp = 0
local pluginDevice = 0
local isALTUI = false
local isOpenLuup = false

local TICKOFFS = 5 -- cond tasks try to run TICKOFFS seconds after top of minute

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

local function L(msg, ...)
    local str
    local level = 50
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
    if isOpenLuup then return true end
    if (luup.version_branch == 1 and luup.version_major >= 7) then
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

local function urlencode( str )
    str = tostring(str):gsub( "([^A-Za-z0-9_ -])", function( ch ) return string.format("%%%02x", string.byte( ch ) ) end )
    return str:gsub( " ", "+" )
end

local function split( str, sep )
    if sep == nil then sep = "," end
    local arr = {}
    if #str == 0 then return arr, 0 end
    local rest = string.gsub( str or "", "([^" .. sep .. "]*)" .. sep, function( m ) table.insert( arr, m ) return "" end )
    table.insert( arr, rest )
    return arr, #arr
end

-- Shallow copy
local function shallowCopy( t )
    local r = {}
    for k,v in pairs(t) do
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
    local s = luup.variable_get( sid, name, dev )
    if s ~= val then
        luup.variable_set( sid, name, val, dev )
        return val
    end
    return s
end

-- Get numeric variable, or return default value if not set or blank
local function getVarNumeric( name, dflt, dev, sid )
    assert( dev ~= nil )
    assert( name ~= nil )
    if sid == nil then sid = RSSID end
    local s = luup.variable_get( sid, name, dev )
    if (s == nil or s == "") then return dflt end
    s = tonumber(s, 10)
    if (s == nil) then return dflt end
    return s
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
    local n = math.floor( ( t + locale_offset ) / 86400 + 0.5 + 2440587.5 ) - 2451545.0 + 0.0008
    local N = n - rlon / tau
    local M = ( 6.24006 + 0.017202 * N ) % tau
    local C = 0.0334196 * math.sin( M ) + 0.000349066 * 
        math.sin( 2 * M ) + 0.00000523599 * math.sin( 3 * M )
    local lam = ( M + C + pi + 1.79659 ) % tau
    local Jt = 2451545.0 + N + 0.0053 * math.sin( M ) - 
        0.0069 * math.sin( 2 * lam )
    local decl = math.asin( math.sin( lam ) * math.sin( 0.409105 ) )
    local omeg0 = math.acos( 
        ( math.sin( -0.0144862 + 
            ( -0.0362330 * math.sqrt( elev ) ) / 1.0472 ) - 
                math.sin( rlat ) * math.sin( decl ) ) / 
        ( math.cos( rlat ) * math.cos( decl ) ) )
    local tw = 0.104719755 -- 6 deg in rad; each twilight step is 6 deg
    local function JE(j) return math.floor( ( j - 2440587.5 ) * 86400 ) end
    return { sunrise=JE(Jt-omeg0/tau), sunset=JE(Jt+omeg0/tau),
        civdawn=JE(Jt-(omeg0+tw)/tau), civdusk=JE(Jt+(omeg0+tw)/tau),
        nautdawn=JE(Jt-(omeg0+2*tw)/tau), nautdusk=JE(Jt+(omeg0+2*tw)/tau),
        astrodawn=JE(Jt-(omeg0+3*tw)/tau), astrodusk=JE(Jt+(omeg0+3*tw)/tau) },
        JE(Jt), 24*omeg0/pi
end

-- Find device by name
local function findDeviceByName( n )
    n = tostring(n):lower()
    for k,v in pairs( luup.devices ) do
        if tostring(v.description):lower() == n then
            return k,v
        end
    end
    return nil
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
    table.insert( sensorState[tostring(dev)].eventList, p )
    if #sensorState[tostring(dev)].eventList > 50 then table.remove(sensorState[tostring(dev)].eventList, 1) end
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
    local function nulltick(d,p) L({level=1, "nulltick(%1,%2)"},d,p) end
    local tkey = tostring( type(tinfo) == "table" and tinfo.id or tinfo )
    assert(tkey ~= nil)
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
        D("scheduleTick() updated %1", tickTasks[tkey])
    else
        assert(tinfo.owner ~= nil)
        assert(tinfo.func ~= nil)
        tickTasks[tkey] = { id=tostring(tinfo.id), owner=tinfo.owner, when=timeTick, func=tinfo.func or nulltick, args=tinfo.args or {},
            info=tinfo.info or "" } -- new task
        D("scheduleTick() new task %1 at %2", tinfo, timeTick)
    end
    -- If new tick is earlier than next plugin tick, reschedule
    tickTasks._plugin = tickTasks._plugin or {}
    if tickTasks._plugin.when == nil or timeTick < tickTasks._plugin.when then
        tickTasks._plugin.when = timeTick
        local delay = timeTick - os.time()
        if delay < 1 then delay = 1 end
        D("scheduleTick() rescheduling plugin tick for %1", delay)
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
    return scheduleTick( tinfo, delay+os.time(), flags )
end

-- Set the status message
local function setMessage(s, dev)
    assert( dev ~= nil )
    luup.variable_set(RSSID, "Message", s or "", dev)
end

-- Return array of keys for a map (table). Pass array or new is created.
local function getKeys( m, r )
    if r == nil then r = {} end
    local seen = {}
    for k,_ in pairs( r ) do
        seen[k] = true
    end
    for k,_ in pairs( m ) do
        if seen[k] == nil then
            table.insert( r, k )
            seen[k] = true
        end
    end
    return r
end

-- Return whether item is on list (table as array)
local function isOnList( l, e )
    if l == nil or e == nil then return false end
    for n,v in ipairs(l) do
        if v == e then return true, n end
    end
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
        initVar( "cdata", "", tdev, RSSID )
        initVar( "cstate", "", tdev, RSSID )
        initVar( "Runtime", 0, tdev, RSSID )
        initVar( "TripCount", 0, tdev, RSSID )
        initVar( "RuntimeSince", os.time(), tdev, RSSID )
        initVar( "ContinuousTimer", 0, tdev, RSSID )
        initVar( "MaxUpdateRate", "", tdev, RSSID )
        initVar( "MaxChangeRate", "", tdev, RSSID )
        initVar( "UseReactorScenes", 1, tdev, RSSID )
        initVar( "Scenes", "", tdev, RSSID )

        initVar( "Armed", 0, tdev, SENSOR_SID )
        initVar( "Tripped", 0, tdev, SENSOR_SID )
        initVar( "ArmedTripped", 0, tdev, SENSOR_SID )
        initVar( "LastTrip", 0, tdev, SENSOR_SID )
        initVar( "AutoUntrip", 0, tdev, SENSOR_SID )

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
        initVar( "Scenes", "", tdev, RSSID )
    end

    if s < 00108 then
        -- Add marktime for Runtime and TripCount, for date those vars where introduced.
        initVar( "RuntimeSince", 1533528000, tdev, RSSID ) -- 2018-08-16.00:00:00-0400
    end

    if s < 00109 then
        luup.variable_set( RSSID, "sundata", nil, tdev ) -- moved to master
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
        initVar( "DebugMode", 0, pdev, MYSID )

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

    -- Update version last.
    if s ~= _CONFIGVERSION then
        luup.variable_set( MYSID, "sundata", "{}", pdev ) -- wipe for recalc
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
    if data.groups then
        table.sort( data.groups, function( a, b ) return (a.delay or 0) < (b.delay or 0) end )
    end
    D("loadScene() loaded scene %1: %2", sceneId, data)
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

    -- Load persistent scene data to cache if cache empty
    if next(sceneData) == nil then
        sceneData = json.decode( luup.variable_get( MYSID, "scenedata", pluginDevice ) or "{}" ) or {}
    end

    -- Still a valid scene?
    local skey = tostring(sceneId)
    if luup.scenes[sceneId] == nil then
        -- Nope.
        L({level=1,msg="Scene %1 in configuration for %2 (%3) is no longer available!"}, sceneId,
            tdev, (luup.devices[tdev] or {}).description)
        sceneData[skey] = nil
        return nil
    end

    -- See if we can return from cache
    local scd = sceneData[skey]
    if scd ~= nil then
        if tostring(scd.loadtime or 0) ~= luup.attr_get("LoadTime", 0) then
            -- Reload since cached, queue for refresh.
            D("getSceneData() reload since scene last cached, queueing update")
            sceneWaiting[skey] = sceneId
            scheduleDelay( { id="sceneLoader", func=loadWaitingScenes, owner=pluginDevice }, 5 )
        end
        D("getSceneData() returning cached: %1", scd)
        return scd -- return cached
    end

    local data = loadScene( sceneId, pluginDevice )
    if data == nil then
        -- Couldn't get it. Try again later.
        D("getSceneData() queueing later scene load for scene %1", sceneId)
        sceneWaiting[skey] = sceneId
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
            scheduleTick( tid, 0 )
            sceneState[tid] = nil
        end
    end
    luup.variable_set( MYSID, "runscene", json.encode(sceneState), pluginDevice )
end

-- Run the next scene group(s), until we run out of groups or a group delay
-- restriction hasn't been met. Across reloads, scenes will "catch up," running
-- groups that are now past-due (native Luup scenes don't do this).
local function runSceneGroups( tdev, taskid )
    D("runSceneGroups(%1,%2)", tdev, taskid )
    assert(luup.devices[tdev].device_type == MYTYPE or luup.devices[tdev].device_type == RSTYPE)

    -- Get sceneState, make sure it's consistent with request.
    local sst = sceneState[taskid]
    D("scene state %1", sst)
    if sst == nil then return end

    local scd = getSceneData(sst.scene, tdev)
    if scd == nil then
        L({level=1,msg="Previously running scene %1 now not found/loaded. Aborting run."}, sst.scene)
        return stopScene( nil, taskid, tdev )
    end

    -- Run next scene group (and keep running groups until no more or delay needed)
    local nextGroup = sst.lastgroup + 1
    while nextGroup <= #(scd.groups or {}) do
        D("runSceneGroups() now at group %1 of scene %2 (%3)", nextGroup, scd.id, scd.name)
        -- If scene group has a delay, see if we're there yet.
        local now = os.time() -- update time, as scene groups can take a long time to execute
        local tt = sst.starttime + ( scd.groups[nextGroup].delay or 0 )
        if tt > now then
            -- It's not time yet. Schedule task to continue.
            D("runSceneGroups() scene group %1 must delay to %2", nextGroup, tt)
            scheduleTick( { id=sst.taskid, owner=sst.owner, func=runSceneGroups }, tt )
            return taskid
        end

        -- Run this group.
        for _,action in ipairs( scd.groups[nextGroup].actions or {} ) do
            local devnum = tonumber( action.device )
            if devnum == nil or luup.devices[devnum] == nil then
                L({level=2,msg="%5 (%6): invalid device number (%4) in scene %1 (%2) group %3; skipping action."},
                    scd.id, scd.name, nextGroup, action.device, tdev, luup.devices[tdev].description)
            else
                local param = {}
                for k,p in ipairs( action.arguments or {} ) do
                    param[p.name or tostring(k)] = p.value
                end
                D("runSceneGroups() dev %4 (%5) do %1/%2(%3)", action.service,
                    action.action, param, devnum,
                    (luup.devices[devnum] or {}).description)
                luup.call_action( action.service, action.action, param, devnum )
            end
        end

        -- Finished this group. Save position.
        sceneState[taskid].lastgroup = nextGroup
        luup.variable_set( MYSID, "runscene", json.encode(sceneState), pluginDevice )
        nextGroup = nextGroup + 1 -- ...and we're moving on...
    end

    -- We've run out of groups!
    D("runSceneGroups(%3) reached end of scene %1 (%2)", scd.id, scd.name, taskid)
    stopScene( nil, taskid, tdev )
    return nil
end

-- Start a scene. Any running scene is immediately terminated, and this scene
-- replaces it. Scene Lua works for conditional execution.
local function runScene( scene, tdev, options )
    D("runScene(%1,%2,%3)", scene, tdev, options )
    options = options or {}

    -- If using Luup scenes, short-cut
    if getVarNumeric("UseReactorScenes", 1, tdev, RSSID) == 0 and not options.forceReactorScenes then
        D("runScene() handing-off scene run to Luup")
        luup.call_action( "urn:micasaverde-com:serviceId:HomeAutomationGateway1", "RunScene", { SceneNum=scene }, 0 )
        return
    end

    -- We're using Reactor-run scenes
    local now = os.time()
    local scd = getSceneData( scene, tdev )
    if scd == nil then
        L({level=1,msg="%1 (%2) can't run scene %3, not found/loaded."}, tdev,
            luup.devices[tdev].description, scene)
        return
    end

    -- Check if scene running. If so, stop it.
    local ctx = tonumber( options.contextDevice ) or 0
    local taskid = string.format("ctx%dscene%d", ctx, scd.id)
    local sst = sceneState[taskid]
    D("runScene() state is %1", sst)
    if sst ~= nil and options.stopPriorScenes then
        stopScene( ctx, nil, tdev )
    end

    -- If there's scene lua, try to run it.
    if ( scd.lua or "" ) ~= "" then
        D("runScene() handling scene Lua")
        local luafragment
        if ( scd.encoded_lua or 0 ) == 1 then
            local mime = require('mime')
            luafragment = mime.unb64( scd.lua )
            if luafragment == nil then
                L({level=1,msg="Aborting scene %1 (%2) run, unable to decode scene Lua"}, scd.id, scd.name)
                return
            end
        else
            luafragment = scd.lua or ""
        end
        local fname = string.format("_reactor%d_scene%d", tdev, scd.id)
        local extarg = "nil"
        if options.externalArgument then extArg = string.format("%q", tostring(options.externalArgument)) end
        local funcb = string.format("function %s(reactor_device, reactor_ext_arg)\n%s\nend return %s(%d,%s)", fname, luafragment, fname, tdev, extarg) -- note: passes in RS dev#
        D("runScene() running scene Lua as " .. funcb)
        local fnc,err = loadstring(funcb)
        if fnc == nil then
            L({level=1,msg="%1 %(2) scene %3 (%4) Lua failed, %5 in %6"}, tdev, luup.devices[tdev].description,
                scd.id, scd.name, err, luafragment)
            return
        else
            local res = fnc()
            -- Warning if return type isn't what we expect.
            if type(res) ~= "boolean" then
                L({level=2,msg="Scene %1 (%2) Lua returned type %3; your scene Lua should always return boolean true or false."}, scd.id, scd.name, type(res))
            end
            -- Evaluate return value
            if not res then
                D("runScene() scene Lua returned (%1)%2, not running scene groups.", type(res), res)
                return
            end
        end
    end

    -- We are going to run groups. Set up for it.
    D("runScene() setting up to run groups for scene")
    sceneState[taskid] = {
        scene=scd.id,   -- scene ID
        starttime=now,  -- original start time for scene
        lastgroup=0,    -- last group to finish
        taskid=taskid,  -- timer task ID
        context=ctx,    -- context device (device requesting scene run)
        owner=tdev      -- parent device (always Reactor or ReactorSensor)
    }
    luup.variable_set( MYSID, "runscene", json.encode(sceneState), pluginDevice )

    return runSceneGroups( tdev, taskid )
end

-- Continue running scenes on restart.
local function resumeScenes()
    D("resumeScenes()")
    local s = luup.variable_get( MYSID, "runscene", pluginDevice ) or "{}"
    local d,pos,err = json.decode(s)
    if err then
        L({level=1,msg="Can't resume scenes, failed to parse JSON for saved scene state: %1 at %2 in %3"},
            err, pos, s)
        luup.variable_set( MYSID, "runscene", "{}", pluginDevice )
    end
    sceneState = d or {}
    for _,data in pairs( sceneState ) do
        scheduleDelay( { id=data.taskid, owner=data.owner, func=runSceneGroups }, 1 )
    end
end

-- Set tripped state for a ReactorSensor. Runs scenes, if any.
local function trip( state, tdev )
    L("%2 (#%1) tripped state now %3", tdev, luup.devices[tdev].description, state)
    luup.variable_set( SENSOR_SID, "Tripped", state and "1" or "0", tdev )
    addEvent{dev=tdev,event='sensorstate',state=state}
    local sc = split( luup.variable_get( RSSID, "Scenes", tdev ) or "" )
    D("trip() scenes are %1", sc)
    if not state then
        -- Luup keeps (SecuritySensor1/)LastTrip, but we also keep LastReset
        luup.variable_set( RSSID, "LastReset", os.time(), tdev )
        -- Run the reset scene, if we have one.
        if #sc > 1 and sc[2] ~= "" then
            stopScene( tdev, nil, tdev ) -- stop any other running scene for this sensor -- ??? user config
            runScene( tonumber(sc[2]) or -1, tdev, { contextDevice=tdev, stopPriorScenes=true } )
        end
    else
        -- Count a trip.
        luup.variable_set( RSSID, "TripCount", getVarNumeric( "TripCount", 0, tdev, RSSID ) + 1, tdev )
        -- Run the trip scene, if we have one.
        if #sc > 0 and sc[1] ~= "" then
            stopScene( tdev, nil, tdev ) -- stop any other running scene for this sensor -- ??? user config
            runScene( tonumber(sc[1]) or -1, tdev, { contextDevice=tdev, stopPriorScenes=true } )
        end
    end
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
    sensorState[tostring(tdev)].configData = cdata
end

-- Clean cstate
local function loadCleanState( tdev )
    D("loadCleanState(%1)", tdev)

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
    luup.variable_set( RSSID, "cstate", json.encode( cstate ), tdev )
    return cstate
end

local function evaluateVariable( vname, ctx, cdata, tdev )
    D("evaluateVariable(%1,cdata,%2)", vname, tdev)
    local vdef = cdata.variables[vname]
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
    if not ( err or luaxp.isNull(result) ) then
        D("evaluateVariable() %2 (%1) %3 evaluates to %4", tdev, luup.devices[tdev].description,
            vdef.expression, result)
        -- Save on context for other evals
        ctx[vname] = result
        -- Canonify booleans by converting to number for storage as state variable
        if type(result) == "boolean" then result = result and "1" or "0" end
        local oldVal = luup.variable_get( VARSID, vname, tdev )
        if oldVal == nil or oldVal ~= result then
            luup.variable_set( VARSID, vname, tostring(result or ""), tdev )
            luup.variable_set( VARSID, vname .. "_Error", "", tdev )
        end
    else
        L({level=2,msg="%2 (%1) failed evaluation of %3: result=%4, err=%5"}, tdev, luup.devices[tdev].description,
            vdef.expression, result, err)
        ctx[vname] = luaxp.NULL
        local msg = (err or {}).message or "Failed"
        if (err or {}).location ~= nil then msg = msg .. " at " .. tostring(err.location) end
        luup.variable_set( VARSID, vname .. "_Error", msg, tdev )
        return nil, err
    end
    return result, false
end

local function updateVariables( cdata, tdev )
    -- Make a list of variable names to iterate over. This also facilitates a
    -- quick test in case there are no variables, bypassing a bit of work.
    local vars = {}
    for n,_ in pairs(cdata.variables or {}) do table.insert( vars, n ) end
    D("updateVariables() updating vars=%1", vars)
    local ctx = { __functions={}, __lvars={} }
    -- Create evaluation context
    ctx.__functions.finddevice = function( args )
        local selector = unpack( args )
        D("findDevice(%1) selector=%2", args, selector)
        local n = finddevice( selector )
        if n == nil then
            return luaxp.NULL
        end
        return n
    end
    ctx.__functions.getstate = function( args )
        local dev, svc, var = unpack( args )
        local vn = finddevice( dev )
        D("getstate(%1), dev=%2, svc=%3, var=%4, vn=%5", args, dev, svc, var, vn)
        if vn == nil or luup.devices[vn] == nil then
            return luaxp.NULL
        end
        -- Create a watch if we don't have one.
        addServiceWatch( vn, svc, var, tdev )
        -- Get and return value
        return luup.variable_get( svc, var, vn ) or luaxp.NULL
    end
    -- Implement LuaXP extension resolver as recursive evaluation. This allows expressions
    -- to reference other variables, makes working order of evaluation.
    ctx.__functions.__resolve = function( name, c2x )
        D("__resolve(%1,c2x)", name)
        if (c2x.__resolving or {})[name] then
            luaxp.evalerror("Circular reference detected (" .. name .. ")")
            return luaxp.NULL
        end
        if cdata.variables[ name ] == nil then
            -- If we don't recognize it, we can't resolve it.
            return nil
        end
        c2x.__resolving = c2x.__resolving or {}
        c2x.__resolving[name] = true
        local val = evaluateVariable( name, c2x, cdata, tdev )
        c2x.__resolving[name] = nil
        return val
    end
    -- Save context on cdata
    cdata.ctx = ctx
    -- Perform evaluations.
    for _,n in ipairs( vars ) do
        if not ctx[n] then -- not yet evaluated this run?
            evaluateVariable( n, ctx, cdata, tdev )
        end
    end
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

-- Get a value (works as constant or expression (including simple variable ref).
-- Returns result as string and number
local function getValue( val, ctx, tdev )
    val = val or ""
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
            L({level=2,msg="Error evaluating %1: %2"}, mp, err)
            val = ""
        else
            val = result
        end
    end
    return tostring(val), tonumber(val)
end

local function evaluateCondition( cond, grp, cdata, tdev )
    D("evaluateCondition(%1,%2,cdata,%3)", cond, grp.groupid, tdev)
    local now = cdata.timebase
    local ndt = cdata.timeparts
    local hasTimer = false
    if cond.type == "service" then
        -- Can't succeed if referenced device doesn't exist.
        if luup.devices[cond.device or -1] == nil then
            L({level=2,msg="%1 (%2) condition %3 refers to device %4 (%5), does not exist, skipped"},
                luup.devices[tdev].description, tdev, cond.id, cond.device, cond.devicename or "unknown")
            return false,false
        end

        -- Add service watch if we don't have one
        addServiceWatch( cond.device, cond.service, cond.variable, tdev )

        -- Get state variable value.
        local vv = luup.variable_get( cond.service or "", cond.variable or "", cond.device or -1 ) or ""
        local vn = tonumber( vv )

        cond.lastvalue = { value=vv, timestamp=now }

        -- Get condition value
        local cv,cn = getValue( cond.value, cdata.ctx, tdev )

        -- If case-insensitive, canonify to lowercase.
        if cond.nocase then
            vv = string.lower( vv )
            cv = string.lower( cv )
        end

        -- Evaluate conditions. Any failure is a bail-out.'
        local op = cond.operator or cond.condition -- ??? legacy
        D("evaluateCondition() %1: %2/%3 %4%5%6?", cond.type, cond.service, cond.variable, vv, op, cv)
        if op == "=" then
            if vv ~= cv then return false end
        elseif op == "<>" or op == "><" then -- latter from bug pre-1.2 ??? expireme
            if vv == cv then return false end
        elseif op == ">" then
            if vn == nil or cn == nil or vn <= cn then return false end
        elseif op == "<" then
            if vn == nil or cn == nil or vn >= cn then return false end
        elseif op == ">=" then
            if vn == nil or cn == nil or vn < cn then return false end
        elseif op == "<=" then
            if vn == nil or cn == nil or vn > cn then return false end
        elseif op == "contains" then
            if not string.find( vv, cv ) then return false end
        elseif op == "starts" then
            if not string.find( vv, "^" .. cv ) then return false end
        elseif op == "ends" then
            if not string.find( vv, cv .. "$" ) then return false end
        elseif op == "in" then
            local lst = split( cv )
            local found = false
            for _,z in ipairs( lst ) do
                if z == vv then
                    found = true
                    break
                end
            end
            if not found then return false end
        elseif op == "istrue" then
            if vv == 0 then return false end
        elseif op == "isfalse" then
            if vv ~= 0 then return false end
        else
            L({level=1,msg="evaluateCondition() unknown op %1 in cond %2"}, op, cv)
            return false
        end
    elseif cond.type == "housemode" then
        -- Add watch on parent if we don't already have one.
        addServiceWatch( pluginDevice, MYSID, "HouseMode", tdev )
        local modes = split( cond.value )
        local mode = getHouseMode( tdev )
        cond.lastvalue = { value=mode, timestamp=now }
        D("evaluateCondition() housemode %1 among %2?", mode, modes)
        if not isOnList( modes, mode ) then return false,false end
    elseif cond.type == "weekday" then
        -- Weekday; Lua 1=Sunday, 2=Monday, ..., 7=Saturday
        local nextDay = os.time{year=ndt.year,month=ndt.month,day=ndt.day+1,hour=0,['min']=0,sec=0}
        D("evaluateCondition() weekday condition, setting next check for %1", nextDay)
        scheduleTick( { id=tdev, info="weekday "..cond.id }, nextDay )
        cond.lastvalue = { value=ndt.wday, timestamp=now }
        local wd = split( cond.value )
        local op = cond.operator or cond.condition -- ??? legacy
        D("evaluateCondition() weekday %1 among %2", ndt.wday, wd)
        if not isOnList( wd, tostring( ndt.wday ) ) then return false,false end
        -- OK, we're on the right day of the week. Which week?
        if ( op or "" ) ~= "" then -- blank means "every"
            D("evaluateCondition() is today %1 %2-%3 the %4th?", ndt.wday, ndt.month,
                ndt.day, op)
            if op == "last" then
                -- Must be last of this day of the week. If we add a week
                -- to current date, the new date should be next month.
                local nt = os.date( "*t", now + ( 7 * 86400 ) )
                D("evaluateCondition() weekday %1 %2? today=%3, nextweek=%4", ndt.wday, op, ndt, nt)
                if nt.month == ndt.month then return false,false end -- same
            else
                local nth = tonumber( op )
                -- Move back N-1 weeks; we should still be in same month. Then
                -- move back one more week, should be in prior month.
                local pt, ref
                ref = now
                if nth > 1 then
                    ref = ref - ( (nth-1) * 7 * 86400 )
                    pt = os.date( "*t", ref )
                    if pt.month ~= ndt.month then return false,false end
                end
                pt = os.date( "*t", ref - ( 7 * 86400 ) )
                if pt.month == ndt.month then return false,false end
            end
            D("evaluateCondition() yes, today %1 %2-%3 IS #%4 in month", ndt.wday,
                ndt.month, ndt.day, op)
        end
    elseif cond.type == "sun" then
        -- Sun condition (sunrise/set)
        cond.lastvalue = { value=now, timestamp=now }
        -- Figure out sunrise/sunset. Keep cached to reduce load.
        local stamp = ndt.year * 10000 + ndt.month * 100 + ndt.day
        local sundata = json.decode( luup.variable_get( MYSID, "sundata", pluginDevice ) or "{}" ) or {}
        if ( sundata.stamp or 0 ) ~= stamp or getVarNumeric( "TestTime", 0, tdev, RSSID ) ~= 0 then
            if getVarNumeric( "UseLuupSunrise", 0, pluginDevice, MYSID ) ~= 0 then
                L({level=2,msg="Reactor is configured to use Luup's sunrise/sunset calculations; twilight times cannot be correctly evaluated and will evaluate as dawn=sunrise, dusk=sunset"})
                sundata = { sunrise=luup.sunrise(), sunset=luup.sunset() }
            else
                -- Compute sun data
                sundata = sun( luup.longitude, luup.latitude, 
                    getVarNumeric( "Elevation", 0.0, pluginDevice, MYSID ), now )
                D("evaluationCondition() location (%1,%2) computed %3", luup.longitude, luup.latitude, sundata)
            end
            sundata.stamp = stamp
            luup.variable_set( MYSID, "sundata", json.encode(sundata), pluginDevice )
        end
        local nowMSM = ndt.hour * 60 + ndt.min
        local op = cond.operator or cond.condition or "bet" -- legacy ???
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
                return false,false
            end
        elseif cond.operator == "before" then
            D("evaluateCondition() cond %1 check %2 before %3", cond.id, nowMSM, startMSM)
            doNextCondCheck( { id=tdev,info="sun "..cond.id }, nowMSM, startMSM )
            if nowMSM >= startMSM then return false,false end
        else
            D("evaluateCondition() cond %1 check %2 after %3", cond.id, nowMSM, startMSM)
            doNextCondCheck( { id=tdev,info="sun "..cond.id }, nowMSM, startMSM )
            if nowMSM < startMSM then return false,false end -- after
        end
    elseif cond.type == "trange" then
        -- Time, with various components specified, or not.
        cond.lastvalue = { value=now, timestamp=now }
        local op = cond.operator or cond.condition or "bet" -- ??? legacy
        -- Split, pad, and complete date. Any missing parts are filled in with the
        -- current date/time's corresponding part.
        local tparam = split( cond.value, ',' )
        for ix = #tparam+1, 10 do tparam[ix] = "" end -- pad
        local tpart = {}
        tpart[1] = ( tparam[1] == "" ) and ndt.year or tparam[1]
        tpart[2] = ( tparam[2] == "" ) and ndt.month or tparam[2]
        tpart[3] = ( tparam[3] == "" ) and ndt.day or tparam[3]
        tpart[4] = ( tparam[4] == "" ) and ndt.hour or tparam[4]
        tpart[5] = ( tparam[5] == "" ) and ndt.min or tparam[5]
        tpart[6] = ( tparam[6] == "" ) and tpart[1] or tparam[6]
        tpart[7] = ( tparam[7] == "" ) and tpart[2] or tparam[7]
        tpart[8] = ( tparam[8] == "" ) and tpart[3] or tparam[8]
        tpart[9] = ( tparam[9] == "" ) and tpart[4] or tparam[9]
        tpart[10] = ( tparam[10] == "" ) and tpart[5] or tparam[10]
        D("evaluationCondition() clean tpart=%1", tpart)
        if tparam[2] == "" then
            -- No date specified, only time components. Magnitude comparison.
            D("evaluateCondition() time-only comparison, now is %1, ndt is %2", now, ndt)
            local nowMSM = ndt.hour * 60 + ndt.min
            local startMSM = tonumber( tparam[4] ) * 60 + tonumber( tparam[5] )
            if op == "after" then
                D("evaluateCondition() time-only comparison %1 after %2", nowMSM, startMSM)
                doNextCondCheck( { id=tdev,info="trangeHM "..cond.id }, nowMSM, startMSM )
                if nowMSM < startMSM then return false,false end
            elseif op == "before" then
                D("evaluateCondition() time-only comparison %1 before %2", nowMSM, startMSM)
                doNextCondCheck( { id=tdev,info="trangeHM "..cond.id }, nowMSM, startMSM )
                if nowMSM >= startMSM then return false,false end
            else
                -- Between, or not
                local endMSM = tonumber( tparam[9] ) * 60 + tonumber( tparam[10] )
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
                    return false,false
                end
            end
        elseif tparam[1] == "" then
            -- No-year given, just M/D H:M. We can do comparison by magnitude,
            -- which works better for year-spanning ranges.
            local nowz = tonumber( ndt.month ) * 100 + tonumber( ndt.day )
            local stz = tonumber( tpart[2] ) * 100 + tonumber( tpart[3] )
            nowz = nowz * 1440 + ndt.hour * 60 + ndt.min
            stz = stz * 1440 + tpart[4] * 60 + tpart[5]
            if op == "before" then
                D("evaluateCondition() M/D H:M test %1 %2 %3", nowz, op, stz)
                doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440 )
                if nowz >= stz then return false,false end
            elseif op == "after" then
                D("evaluateCondition() M/D H:M test %1 %2 %3", nowz, op, stz)
                doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440 )
                if nowz < stz then return false,false end
            else
                local enz = tonumber( tpart[7] ) * 100 + tonumber( tpart[8] )
                enz = enz * 1440 + tpart[9] * 60 + tpart[10]
                D("evaluateCondition() M/D H:M test %1 %2 %3 and %4", nowz, op, stz, enz)
                doNextCondCheck( { id=tdev,info="trangeMDHM " .. cond.id }, nowz % 1440, stz % 1440, enz % 1440 )
                local between
                if stz < enz then -- check for year-spanning
                    between = nowz >= stz and nowz < enz
                else
                    between = nowz >= stz or nowz < enz
                end
                nextMD( between and enz or stz, nowz, { id=tdev,info="trangeMD "..cond.id } )
                if ( op == "bet" and not between ) or
                    ( op == "nob" and between ) then
                    return false,false
                end
            end
        else
            -- Full spec (Y-M-D H:M). Compare actual times (minute resolution).
            now = math.floor( now / 60 ) * 60
            local stt, ett
            stt = os.time{ year=tpart[1], month=tpart[2], day=tpart[3], hour=tpart[4], min=tpart[5] }
            stt = math.floor( stt / 60 ) * 60
            D("evaluateCondition() time start %1", os.date( "%x.%X", stt ))
            ett = os.time{ year=tpart[6], month=tpart[7], day=tpart[8], hour=tpart[9], min=tpart[10] }
            ett = math.floor( ett / 60 ) * 60
            D("evaluateCondition() time end %1", os.date( "%x.%X", ett ))
            if stt == ett then ett = ett + 60 end -- special case
            D("evaluateCondition() compare now %1 %2 %3 and %4", now, op, stt, ett)
            -- Before doing condition check, schedule next time for condition check
            local edge = ( now < stt ) and stt or ( ( now < ett ) and ett or nil )
            if edge ~= nil then
                scheduleTick( { id=tdev,info="trangeFULL "..cond.id }, edge )
            else
                D("evaluateCondition() cond %1 past end time, not scheduling further checks", cond.id)
            end
            local cp = op
            if cp == "bet" then
                if now < stt or now >= ett then return false,false end
            elseif cp == "nob" then
                if now >= stt and now < ett then return false,false end
            elseif cp == "before" then
                if now >= stt then return false,false end
            elseif cp == "after" then
                if now < stt then return false,false end
            else
                L({level=1,msg="Unrecognized condition %1 in time spec for cond %2 of %3 (%4)"},
                    cp, cond.id, tdev, luup.devices[tdev].description)
                return false,false
            end
        end
    elseif cond.type == "comment" then
        -- Shortcut. Comments are always true.
        cond.lastvalue = { value=cond.comment, timestamp=now }
        return true,false
    elseif cond.type == "reload" then
        -- True when loadtime changes. Self-resetting.
        local loadtime = tonumber( ( luup.attr_get("LoadTime", 0) ) ) or 0
        local lastload = getVarNumeric( "LastLoad", 0, tdev, RSSID )
        local reloaded = loadtime ~= lastload
        D("evaluateCondition() loadtime %1 lastload %2 reloaded %3", loadtime, lastload, reloaded)
        cond.lastvalue = { value=reloaded, timestamp=now }
        luup.variable_set( RSSID, "LastLoad", loadtime, tdev )
        -- Return timer flag true when reloaded is true, so we get a reset shortly after.
        return reloaded,reloaded
    else
        L({level=2,msg="Sensor %1 (%2) unknown condition type %3 for cond %4 in group %5; fails."},
            tdev, luup.devices[tdev].description, cond.type, cond.id, grp.groupid)
        cond.lastvalue = { value="", timestamp=now }
        return false, false
    end

    return true, hasTimer
end

-- Evaluate conditions within group. Return overall group state (all conditions met).
local function evaluateGroup( grp, cdata, tdev )
    D("evaluateGroup(%1,cdata,%2)", grp.groupid, tdev)
    if grp.groupconditions == nil or #grp.groupconditions == 0 then return false end -- empty group always false
    local hasTimer = false;
    local passed = true; -- innocent until proven guilty
    local now = cdata.timebase
    local skey = tostring(tdev)
    sensorState[skey].condState[grp.groupid] = sensorState[skey].condState[grp.groupid] or { evalstate=false, evalstamp=0 }
    local gs = sensorState[skey].condState[grp.groupid]
    local latched = {}
    for _,cond in ipairs( grp.groupconditions ) do
        if cond.type ~= "comment" then
            local state, condTimer = evaluateCondition( cond, grp, cdata, tdev )
            D("evaluateGroup() eval group %1 cond %2 result is state %3 timer %4", grp.groupid,
                cond.id, state, condTimer)

            hasTimer = condTimer or hasTimer

            -- Preserve the result of the condition eval. We are edge-triggered,
            -- so only save changes, with timestamp.
            local cs = sensorState[skey].condState[cond.id]
            if cs == nil then
                D("evaluateGroup() new condition state for %1=%2", cond.id, state)
                cs = { id=cond.id, laststate=state, statestamp=now, stateedge={} }
                cs.stateedge[state and 1 or 0] = now
                sensorState[skey].condState[cond.id] = cs
                if state and ( cond.repeatcount or 0 ) > 1 then
                    -- If true, store the first timestamp for repeat counter
                    cs.repeats = { now }
                end
                addEvent{dev=tdev,event='condchange',cond=cond.id,newState=state}
            elseif state ~= cs.laststate then
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
            if cond.lastvalue ~= nil then
                cond.lastvalue.value = cond.lastvalue.value or ""
                if cond.lastvalue.value ~= cs.lastvalue then
                    cs.lastvalue = cond.lastvalue.value
                    cs.valuestamp = now
                end
            else
                cs.lastvalue = nil
                cs.valuestamp = nil
            end

            -- TODO??? Sort conditions by sequence/predecessor, so they are evaluated in the
            -- order needed, and use evalstamp rather than statestamp for all work below.
            -- That sort should also be able to detect loops.

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
                elseif ( now - cs.repeats[1] ) > cond.repeatwithin then
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
    if gs.evalstate == nil or gs.evalstate ~= passed then
        addEvent{dev=tdev,event='groupchange',cond=grp.groupid,oldState=gs.evalstate,newState=passed}
        gs.evalstate = passed
        gs.evalstamp = now
        if not gs.evalstate then
            -- Reset latched conditions when group resets
            for _,l in ipairs(latched) do
                local cs = sensorState[skey].condState[l]
                cs.evalstate = cs.laststate
                cs.evalstamp = now
            end
        end
    end
    gs.hastimer = hasTimer

    return passed, hasTimer
end

--
local function evaluateConditions( cdata, tdev )
    -- Evaluate all groups. Any group match is a pass.
    local hasTimer = false
    local passed = false
    for _,grp in ipairs( cdata.conditions ) do
        local match, t = evaluateGroup( grp, cdata, tdev )
        passed = match or passed
        hasTimer = t or hasTimer
        D("evaluateConditions() group %1 eval %2, timer %3, overall state %4 timer %5, continuing",
            grp.groupid, match, t, passed, hasTimer)
        -- can't shortcut until we've gotten rid of hasTimer -- if pass then break end
    end

    D("evaluateConditions() sensor %1 overall state now %1, hasTimer %2", passed, hasTimer)
    return passed, hasTimer
end

-- Perform update tasks
local function updateSensor( tdev )
    D("updateSensor(%1) %2", tdev, luup.devices[tdev].description)

    -- If not enabled, no work to do.
    if not isEnabled( tdev ) then
        D("updateSensor() disabled; no action")
        return
    end
    
    -- Reload sensor state if cache purged
    if sensorState[tostring(tdev)].condState == nil then
        sensorState[tostring(tdev)].condState = loadCleanState( tdev )
        sensorState[tostring(tdev)].condState.lastSaved = nil -- flag no expiry during use
    end

    -- Check throttling for update rate
    local hasTimer = false
    local maxUpdate = getVarNumeric( "MaxUpdateRate", 30, tdev, RSSID )
    local _, _, rate60 = rateLimit( sensorState[tostring(tdev)].updateRate, maxUpdate, false )
    if maxUpdate == 0 or rate60 <= maxUpdate then
        rateBump( sensorState[tostring(tdev)].updateRate )
        sensorState[tostring(tdev)].updateThrottled = false

        -- Fetch the condition data.
        local cdata = sensorState[tostring(tdev)].configData

        -- Mark a stable base of time
        cdata.timebase = getVarNumeric( "TestTime", 0, tdev, RSSID )
        if cdata.timebase == 0 then
            cdata.timebase = os.time()
        end
        cdata.timeparts = os.date("*t", cdata.timebase)
        D("updateSensor() base time is %1 (%2)", cdata.timebase, cdata.timeparts)

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
            _, _, rate60 = rateLimit( sensorState[tostring(tdev)].changeRate, maxTrip, false )
            if maxTrip == 0 or rate60 <= maxTrip then
                rateBump( sensorState[tostring(tdev)].changeRate )
                sensorState[tostring(tdev)].changeThrottled = false
                trip( newTrip, tdev )
            else
                if not sensorState[tostring(tdev)].changeThrottled then
                    L({level=2,msg="%2 (#%1) trip state changing too fast (%4 > %3/min)! Throttling..."},
                        tdev, luup.devices[tdev].description, maxTrip, rate60)
                    sensorState[tostring(tdev)].changeThrottled = true
                    addEvent{dev=tdev,event='throttle',['type']='change',rate=rate60,limit=maxTrip}
                    setMessage( "Throttled! (high change rate)", tdev )
                end
                hasTimer = true -- force, so sensor gets checked later
            end
        end
        if not sensorState[tostring(tdev)].changeThrottled then
            setMessage( newTrip and "Tripped" or "Not tripped", tdev )
        end

        -- Save the condition state.
        sensorState[tostring(tdev)].condState.lastSaved = os.time()
        luup.variable_set( RSSID, "cstate", json.encode(sensorState[tostring(tdev)].condState), tdev )
    else
        if not sensorState[tostring(tdev)].updateThrottled then
            L({level=2,msg="%2 (#%1) updating too fast (%4 > %3/min)! Throttling..."},
                tdev, luup.devices[tdev].description, maxUpdate, rate60)
            setMessage( "Throttled! (high update rate)", tdev )
            sensorState[tostring(tdev)].updateThrottled = true
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
        scheduleDelay( {id=tostring(tdev),info="hasTimer"}, v )
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
    local nextTick = math.floor( os.time() / 60 + 1 ) * 60

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
    
    -- See if any cached state has expired
    local expiry = getVarNumeric( "StateCacheExpiry", 600, pdev, MYSID )
    if expiry > 0 then
        local now = os.time()
        for td,cx in pairs( sensorState or {} ) do
            -- If save time not there, the cache entry never expires.
            if ( ( cx.condState or {} ).lastSaved or now ) + expiry <= now then
                D("masterTick() expiring state cache for %1", td)
                cx.condState = nil
            end
        end
    end
    
    scheduleTick( tostring(pdev), nextTick )
end

-- Start an instance
local function startSensor( tdev, pdev )
    D("startSensor(%1,%2)", tdev, pdev)

    -- Device one-time initialization
    sensor_runOnce( tdev )

    -- Initialize instance data
    sensorState[tostring(tdev)] = { eventList={}, condState={}, configData={} }
    sensorState[tostring(tdev)].updateRate = initRate( 60, 15 )
    sensorState[tostring(tdev)].updateThrottled = false
    sensorState[tostring(tdev)].changeRate = initRate( 60, 15 )
    sensorState[tostring(tdev)].changeThrottled = false

    -- Load the config data.
    loadSensorConfig( tdev )

    -- Clean and restore our condition state.
    sensorState[tostring(tdev)].condState = loadCleanState( tdev )

    addEvent{dev=tdev,event='start'}

    -- Watch our own cdata; when it changes, re-evaluate.
    luup.variable_watch( "reactorWatch", RSSID, "cdata", tdev )

    setMessage("Starting...", tdev)

    -- Start the sensor's tick.
    scheduleDelay( { id=tostring(tdev), func=sensorTick, owner=tdev }, 5 )

    -- If this sensor uses scenes (and we run them), try to load them.
    if getVarNumeric( "UseReactorScenes", 1, tdev, RSSID ) ~= 0 then
        local sc = split( luup.variable_get( RSSID, "Scenes", tdev ) or "" )
        for _,k in ipairs(sc) do
            getSceneData( tonumber(k), tdev )
        end
    end

    luup.set_failure( false, tdev )
    return true
end

local function waitSystemReady( pdev )
    D("waitSystemReady(%1)", pdev)
    for n,d in pairs(luup.devices) do
        if d.device_type == "urn:schemas-micasaverde-com:device:ZWaveNetwork:1" then
            local sysStatus = luup.variable_get( "urn:micasaverde-com:serviceId:ZWaveNetwork1", "NetStatusID", n )
            if sysStatus ~= nil and sysStatus ~= "1" then
                -- Z-wave not yet ready
                D("Waiting for Z-wave ready, status %1", sysStatus)
                luup.variable_set( MYSID, "Message", "Waiting for Z-wave ready", pdev )
                scheduleDelay( { id=tostring(pdev), func=waitSystemReady, owner=pluginDevice }, 5 )
                return
            end
            break
        end
    end

    -- System is now ready. Finish initialization and start timers.
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
    sceneWaiting = {}
    sceneState = {}

    -- Debug?
    if getVarNumeric( "DebugMode", 0, pdev, MYSID ) ~= 0 then
        debugMode = true
        D("startPlugin() debug enabled by state variable DebugMode")
    end

    -- Check for ALTUI and OpenLuup
    for k,v in pairs(luup.devices) do
        if v.device_type == "urn:schemas-upnp-org:device:altui:1" then
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
        end
    end

    -- Check UI version
    if not checkVersion( pdev ) then
        L({level=1,msg="This plugin does not run on this firmware."})
        luup.set_failure( 1, pdev )
        return false, "Incompatible firmware " .. luup.version, _PLUGIN_NAME
    end

    -- One-time stuff
    plugin_runOnce( pdev )

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
        addEvent{ event="enable", dev=tdev, enabled=enabled }
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

function actionTrip( dev )
    L("Sensor %1 (%2) trip action!", dev, luup.devices[dev].description)
    trip( true, dev )
    setMessage("Tripped", dev);
end

function actionReset( dev )
    L("Sensor %1 (%2) reset action!", dev, luup.devices[dev].description)
    trip( false, dev )
    setMessage("Not tripped", dev)
end

function actionSetArmed( armedVal, dev )
    L("Sensor %1 (%2) set armed to %4", dev, luup.devices[dev].description, armedVal)
    local armed = ( tonumber( armedVal ) or 0 ) ~= 0
    luup.variable_set( SENSOR_SID, "Armed", armed and "1" or "0", dev )
end

function actionRestart( dev )
    dev = tonumber( dev )
    assert( dev ~= nil )
    assert( luup.devices[dev] ~= nil and luup.devices[dev].device_type == RSTYPE )
    L("Restarting sensor %1 (%2)", dev, luup.devices[dev].description)
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
    stopScene( ctx, taskid, dev )
end

function actionMasterClear( dev )
    -- Remove all child devices.
    local ptr = luup.chdev.start( dev )
    luup.chdev.sync( dev, ptr )
    -- Should cause reload immediately.
end

function actionSetDebug( state, tdev )
    debugMode = state or false
    addEvent{ event="debug", dev=tdev, debugMode=debugMode }
    if debugMode then
        D("Debug enabled")
    end
end

-- Plugin timer tick. Using the tickTasks table, we keep track of
-- tasks that need to be run and when, and try to stay on schedule. This
-- keeps us light on resources: typically one system timer only for any
-- number of devices.
local functions = { [tostring(masterTick)]="masterTick", [tostring(sensorTick)]="sensorTick" }
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
    local nextTick = now + 60 -- Try to start minute to minute at least
    tickTasks._plugin.when = 0

    -- Since the tasks can manipulate the tickTasks table, the iterator
    -- is likely to be disrupted, so make a separate list of tasks that
    -- need service, and service them using that list.
    local todo = {}
    for t,v in pairs(tickTasks) do
        if t ~= "_plugin" and v.when ~= nil and v.when <= now then
            -- Task is due or past due
            D("tick() inserting eligible task %1 when %2 now %3", v.id, v.when, now)
            v.when = nil -- clear time; timer function will need to reschedule
            table.insert( todo, v )
        end
    end

    -- Run the to-do list.
    D("tick() to-do list is %1", todo)
    for _,v in ipairs(todo) do
        D("tick() calling task function %3(%4,%5) for %1 (%2)", v.owner, (luup.devices[v.owner] or {}).description, functions[tostring(v.func)] or tostring(v.func),
            v.owner,v.id)
        local success, err = pcall( v.func, v.owner, v.id, v.args )
        if not success then
            L({level=1,msg="Reactor device %1 (%2) tick failed: %3"}, v.owner, (luup.devices[v.owner] or {}).description, err)
        else
            D("tick() successful return from %2(%1)", v.owner, functions[tostring(v.func)] or tostring(v.func))
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
    addEvent{ dev=tdev, event='devicewatch', device=dev, name=(luup.devices[dev] or {}).descriptions,
        var=sid .. "/" .. var, old=oldVal, new=newVal }
    updateSensor( tdev )
end

-- Watch callback. Dispatches to sensor-specific handling.
function watch( dev, sid, var, oldVal, newVal )
    D("watch(%1,%2,%3,%4,%5)", dev, sid, var, oldVal, newVal)
    assert(var ~= nil) -- nil if service or device watch (can happen on openLuup)

    if sid == RSSID and var == "cdata" then
        -- Sensor configuration change. Immediate update.
        L("Child %1 (%2) configuration change, updating!", dev, luup.devices[dev].description)
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

local function getEvents( deviceNum )
    if deviceNum == nil or luup.devices[deviceNum] == nil or luup.devices[deviceNum].device_type ~= RSTYPE then
        return "no events: device does not exist or is not ReactorSensor"
    end
    local resp = "    Events\r\n"
    for _,e in ipairs( ( sensorState[tostring(deviceNum)] or {}).eventList or {} ) do
        resp = resp .. string.format("        %15s ", e.time or os.date("%x.%X", e.when or 0) )
        resp = resp .. ( e.event or "event?" ) .. ":"
        for k,v in pairs(e) do
            if not ( k == "time" or k == "when" or k == "event" or ( k == "dev" and tostring(v)==tostring(deviceNum) ) ) then
                resp = resp .. string.format(" %s=%s,", tostring(k), tostring(v))
            end
        end
        resp = resp .. "\r\n"
    end
    return resp
end

local function alt_json_encode( st )
    str = "{"
    local comma = false
    for k,v in pairs(st) do
        str = str .. ( comma and "," or "" )
        comma = true
        str = str .. '"' .. k .. '":'
        if type(v) == "table" then
            str = str .. alt_json_encode( v )
        elseif type(v) == "number" then
            str = str .. tostring(v)
        elseif type(v) == "boolean" then
            str = str .. ( v and "true" or "false" )
        else
            str = str .. string.format("%q", tostring(v))
        end
    end
    str = str .. "}"
    return str
end

function request( lul_request, lul_parameters, lul_outputformat )
    D("request(%1,%2,%3) luup.device=%4", lul_request, lul_parameters, lul_outputformat, luup.device)
    local action = lul_parameters['action'] or lul_parameters['command'] or ""
    local deviceNum = tonumber( lul_parameters['device'], 10 )
    if action == "debug" then
        debugMode = not debugMode
        D("debug set %1 by request", debugMode)
        return "Debug is now " .. ( debugMode and "on" or "off" ), "text/plain"
    end

    if action == "restart" then
        if deviceNum ~= nil and luup.devices[deviceNum] ~= nil and luup.devices[deviceNum].device_type == RSTYPE then
            actionRestart( deviceNum )
            return "OK, restarting #" .. deviceNum .. " " .. luup.devices[deviceNum].description, "text/plain"
        else
            return "ERROR, device number invalid or is not a ReactorSensor", "text/plain"
        end
    elseif action == "loadscenes" then
        -- Preload scenes used by a ReactorSensor. Call by UI during edit.
        -- ??? Put on waiting scenes list instead?
        local v = luup.variable_get( RSSID, "Scenes", deviceNum or -1 ) or ""
        local r = split(v, ",")
        local res = { scenes={} }
        for _,s in ipairs(r) do
            if s ~= "" then
                status, msg = pcall( loadScene, tonumber(s), pluginDevice )
                table.insert( res.scenes, { scene=s, status=status } )
            end
        end
        return json.encode( res ), "application/json"
    elseif action == "summary" then
        local r, EOL = "", "\r\n"
        r = r .. "LOGIC SUMMARY REPORT" .. EOL
        r = r .. "   Version: " .. tostring(_PLUGIN_VERSION) .. " config " .. tostring(_CONFIGVERSION) .. EOL
        r = r .. "Local time: " .. os.date("%Y-%m-%d %H:%M:%S") .. ", DST=" .. tostring(luup.variable_get( MYSID, "LastDST", pluginDevice )) .. EOL
        r = r .. "House mode: " .. tostring(luup.variable_get( MYSID, "HouseMode", pluginDevice )) .. EOL
        r = r .. "  Sun data: " .. tostring(luup.variable_get( MYSID, "sundata", pluginDevice )) .. EOL
        for n,d in pairs( luup.devices ) do
            if d.device_type == RSTYPE and ( deviceNum==nil or n==deviceNum ) then
                r = r .. string.rep( "=", 132 ) .. EOL
                r = r .. string.format("%s (#%d)", tostring(d.description), n) .. EOL
                r = r .. string.format("    Message/status: %s", luup.variable_get( RSSID, "Message", n ) or "" ) .. EOL
                local s = luup.variable_get( RSSID, "cdata", n ) or ""
                local cdata,_,err = json.decode( s )
                if err then
                    r = r .. "**** UNPARSEABLE CONFIGURATION: " .. err .. EOL .. " in " .. s
                    cdata = {}
                end
                s = getVarNumeric( "TestTime", 0, n, RSSID )
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
                    ng = ng + 1
                    r = r .. "    Group #" .. ng .. " <" .. gc.groupid .. ">" .. EOL
                    for _,cond in ipairs( gc.groupconditions or {} ) do
                        -- ??? TO DO: Add cstate
                        r = r .. "        (" .. ( cond.type or "?type?" ) .. ") "
                        if cond.type == "service" then
                            r = r .. string.format("%s (%d) ", ( luup.devices[cond.device]==nil ) and ( "*** missing " .. ( cond.devicename or "unknown" ) ) or
                                luup.devices[cond.device].description, cond.device )
                            r = r .. string.format("%s/%s %s %s", cond.service or "?", cond.variable or "?", cond.operator or cond.condition or "?",
                                cond.value or "")
                            if cond.duration then
                                r = r .. " for " .. cond.duration .. "s"
                            end
                            if cond.after then
                                if ( cond.aftertime or 0 ) > 0 then
                                    r = r .. " within " .. tostring(cond.aftertime) .. "s"
                                end
                                r = r .. " after " .. cond.after
                            end
                            if cond.repeatcount then
                                r = r .. " repeat " .. cond.repeatcount .. " within " .. cond.repeatwithin .. "s"
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
                        elseif cond.type == "reload" then
                        else
                            r = r .. json.encode(cond)
                        end
                        r = r .. " <" .. cond.id .. ">"
                        r = r .. EOL
                    end
                end
                r = r .. getEvents( n )
            end
        end
        return r, "text/plain"
    elseif action == "config" or action == "backup" then
        local st = { _comment="Reactor configuration " .. os.date("%x %X"), timestamp=os.time(), version=_PLUGIN_VERSION, sensors={} }
        for k,v in pairs( luup.devices ) do
            if v.device_type == RSTYPE then
                st.sensors[tostring(k)] = { name=v.description, devnum=k }
                local x = luup.variable_get( RSSID, "cdata", k ) or "{}"
                local c = json.decode( x )
                if not c then
                    st.sensors[tostring(k)]._comment = "Unable to parse configuration"
                else
                    st.sensors[tostring(k)].config = c
                end
            end
        end
        local bdata = json.encode( st )
        if action == "backup" then
            local bfile = lul_parameters.path or ( ( isOpenLuup and "." or "/etc/cmh-ludl" ) .. "/reactor-config-backup.json" )
            local f = io.open( bfile, "w" )
            if f then
                f:write( bdata )
                f:close()
            else
                return "ERROR can't write " .. bfile, "text/plain"
            end
        end
        return bdata, "application/json"
    elseif action == "restore" then
        local bfile =  lul_parameters.path or ( ( isOpenLuup and "." or "/etc/cmh-ludl" ) .. "/reactor-config-backup.json" )
        return "<h1>WARNING</h1>Restoring will WIPE OUT the configuration of any existing ReactorSensor with a name matching that in the configuration backup! Close this tab/window to abort the restore, or <a href=\"/port_3480/data_request?id=lr_Reactor&action=restoreconfirmed&path="
            .. urlencode( bfile ) .. "\">Click here to restore configuration over the existing</a>.", "text/html"
    elseif action == "restoreconfirmed" then
        -- Default file path or user-provided override
        local bfile = lul_parameters.path
        if (bfile or "") == "" then return "ERROR missing path", "text/plain" end
        local f = io.open( bfile, "r" )
        if not f then return "ERROR can't open restore file " .. bfile, "text/plain" end
        local bdata = f:read("*a")
        f:close()
        local data = json.decode( bdata )
        if not data then return "ERROR can't decode restore file " .. bfile, "text/plain" end
        local html = "<h1>Restoring</h1>Backup data from " .. os.date("%x %X", data.timestamp or 0)
        local good = 0
        local found = 0
        for _,c in pairs( data.sensors or {} ) do
            found = found + 1
            local k,v = findDeviceByName( c.name )
            if k ~= nil then
                if v.device_type ~= RSTYPE then
                    html = html .. "<br>" .. c.name .. " SKIPPED; current device with that name is not a ReactorSensor"
                elseif c.config ~= nil then
                    luup.variable_set( RSSID, "cdata", json.encode( c.config ), k )
                    luup.variable_set( RSSID, "cstate", "{}", k )
                    html = html .. "<br>" .. c.name .. " restored!"
                    good = good + 1
                end
            else
                html = html .. "<br>" .. c.name .. " SKIPPED; device not found"
            end
        end
        if good > 0 then
            luup.variable_set( MYSID, "scenedata", "{}", pluginDevice )
            luup.variable_set( MYSID, "runscene", "{}", pluginDevice )
            html = html .. "<br>&nbsp;<br><b>DONE!</b> Restored " .. good .. " of " .. found .. " in backup. You must <a href=\"/port_3480/data_request?id=reload\">reload Luup</a> now."
        else
            html = html .. "<br>&nbsp;<br><b>DONE!</b> Restored NONE of " .. found .. " in backup."
        end
        return html, "text/html"
    elseif action == "purge" then
        luup.variable_set( MYSID, "scenedata", "{}", pluginDevice )
        luup.variable_set( MYSID, "runscene", "{}", pluginDevice )
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
