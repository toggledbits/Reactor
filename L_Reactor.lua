--[[
    L_Reactor.lua - Core module for Reactor
    Copyright 2017,2018 Patrick H. Rigney, All Rights Reserved.
    This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
--]]
--luacheck: std lua51,module,read globals luup,ignore 542 611 612 614 111/_,no max line length

module("L_Reactor", package.seeall)

local debugMode = false

local _PLUGIN_NAME = "Reactor"
local _PLUGIN_VERSION = "1.3stable+180709"
local _PLUGIN_URL = "https://www.toggledbits.com/reactor"
local _CONFIGVERSION = 00105

local MYSID = "urn:toggledbits-com:serviceId:Reactor"
local MYTYPE = "urn:schemas-toggledbits-com:device:Reactor:1"

local RSSID = "urn:toggledbits-com:serviceId:ReactorSensor"
local RSTYPE = "urn:schemas-toggledbits-com:device:ReactorSensor:1"

local SENSOR_SID  = "urn:micasaverde-com:serviceId:SecuritySensor1"

local sensorState = {}
local tickTasks = {}
local watchData = {}

local runStamp = 0
local pluginDevice = 0
local isALTUI = false
local isOpenLuup = false

local json = require("dkjson")
if json == nil then json = require("json") end
if json == nil then luup.log(_PLUGIN_NAME .. " cannot load JSON library, exiting.", 1) return end

local function dump(t)
    if t == nil then return "nil" end
    local sep = ""
    local str = "{ "
    for k,v in pairs(t) do
        local val
        if type(v) == "table" then
            val = dump(v)
        elseif type(v) == "function" then
            val = "(function)"
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
        L( { msg=msg,prefix=(_PLUGIN_NAME .. "(debug)::") }, ... )
    end
end

local function checkVersion(dev)
    local ui7Check = luup.variable_get(MYSID, "UI7Check", dev) or ""
    if isOpenLuup then return true end
    if (luup.version_branch == 1 and luup.version_major >= 7) then
        if ui7Check == "" then
            -- One-time init for UI7 or better
            luup.variable_set(MYSID, "UI7Check", "true", dev)
        end
        return true
    end
    return false
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
    D("initVar(%1,%2,%3,%4)", name, dflt, dev, sid)
    assert( dev ~= nil )
    assert( sid ~= nil )
    if luup.variable_get( sid, name, dev ) == nil then
        luup.variable_set( sid, name, tostring(dflt), dev )
    end
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

-- A ternary operator
local function iif( cond, trueVal, falseVal )
    if cond then return trueVal
    else return falseVal end
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
    -- D("initRate(%1,%2)", rateTime, rateDiv)
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
    -- D("rateLimit(%1,%2,%3)", rh, rateMax, bump)
    if bump == nil then bump = false end
    if bump then
        rateBump( rh, 1 ) -- bump fills for us
    else
        rateFill( rh )
    end
        
    -- Get rate
    local nb = 0
    local t = 0
    for i in pairs(rh.buckets) do
        t = t + rh.buckets[i]
        nb = nb + 1
    end
    local r60 = iif( nb < 1, 0, t / ( rh.divid * nb ) ) * 60.0 -- 60-sec average
    D("rateLimit() rate is %1 over %4 from %2 buckets, %3/minute avg", t, nb, r60, rh.divid*nb)
    return t > rateMax, t, r60
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
local function scheduleTick( timeTick, repl, tdev )
    D("scheduleTick(%1,%2,%3)", timeTick, repl, tdev)
    local tkey = tostring(tdev)
    if timeTick == 0 or timeTick == nil then
        tickTasks[tkey] = nil
        return
    elseif tickTasks[tkey] then
        -- timer already set, see if new is sooner, or replacing
        if tickTasks[tkey].when == nil or timeTick < tickTasks[tkey].when or repl then
            tickTasks[tkey].when = timeTick
        end
    else
        tickTasks[tkey] = { dev=tdev, when=timeTick }
    end
    -- If new tick is earlier than next master tick, reschedule master
    if timeTick < tickTasks.master.when then
        tickTasks.master.when = timeTick
        local delay = timeTick - os.time()
        if delay < 1 then delay = 1 end
        D("scheduleTick() rescheduling master tick for %1", delay)
        runStamp = runStamp + 1
        luup.call_delay( "reactorTick", delay, runStamp )
    end
end

-- Schedule a timer tick for after a delay (seconds). See scheduleTick above
-- for additional info.
local function scheduleDelay( delay, repl, tdev )
    D("scheduleDelay(%1,%2,%3)", delay, repl, tdev)
    scheduleTick( delay+os.time(), repl, tdev )
end

-- Set the status message
local function setMessage(s, dev)
    assert( dev ~= nil )
    luup.variable_set(RSSID, "Message", s or "", dev)
end

-- Return array of keys for a map (table). Pass array or new is created.
-- N.B. this version may insert duplicate keys if called multiple with r passed in (OK here)
local function getKeys( m, r )
    if r == nil then r = {} end
    local seen = {}
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
    D("sensor_runOnce(%1)", tdev)
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
        initVar( "ContinuousTimer", 0, tdev, RSSID )
        initVar( "MaxUpdateRate", "", tdev, RSSID )
        initVar( "MaxChangeRate", "", tdev, RSSID )

        initVar( "Armed", 0, tdev, SENSOR_SID )
        initVar( "Tripped", 0, tdev, SENSOR_SID )
        initVar( "ArmedTripped", 0, tdev, SENSOR_SID )
        initVar( "LastTrip", 0, tdev, SENSOR_SID )

        -- Force this value.
        luup.variable_set( "urn:micasaverde-com:serviceId:HaDevice1", "ModeSetting", "1:;2:;3:;4:", tdev )

        -- Fix up category and subcategory
        luup.attr_set('category_num', 4, tdev)
        luup.attr_set('subcategory_num', 1, tdev)

        luup.variable_set( RSSID, "Version", _CONFIGVERSION, tdev )
        return
    end

    -- Consider per-version changes.
    if s < 00103 then
        -- Fix up category and subcategory
        luup.attr_set('category_num', 4, tdev)
        luup.attr_set('subcategory_num', 1, tdev)
    end
    
    if s < 00105 then
        initVar( "ContinuousTimer", 0, tdev, RSSID )
        initVar( "Runtime", 0, tdev, RSSID )
        initVar( "MaxUpdateRate", "", tdev, RSSID )
        initVar( "MaxChangeRate", "", tdev, RSSID )
    end

    -- Update version last.
    if (s ~= _CONFIGVERSION) then
        luup.variable_set(RSSID, "Version", _CONFIGVERSION, tdev)
    end
end

-- plugin_runOnce() looks to see if a core state variable exists; if not, a one-time initialization
-- takes place.
local function plugin_runOnce( pdev )
    D("plugin_runOnce(%1)", pdev)
    local s = getVarNumeric("Version", 0, pdev, MYSID)
    if s == _CONFIGVERSION then
        -- Up to date.
        return
    elseif s == 0 then
        L("First run, setting up new plugin instance...")
        initVar( "NumChildren", 0, pdev, MYSID )
        initVar( "NumRunning", 0, pdev, MYSID )
        initVar( "Message", "", pdev, MYSID )
        initVar( "DebugMode", 0, pdev, MYSID )

        luup.attr_set('category_num', 1, pdev)

        luup.variable_set(MYSID, "Version", _CONFIGVERSION, pdev)
        return
    end

    -- Consider per-version changes.
    if s < 00102 then
        initVar( "DebugMode", 0, pdev, MYSID )
    end
    
    if s < 00103 then
        luup.attr_set('category_num', 1, pdev)
        luup.attr_set('subcategory_num', "", pdev)
    end

    -- Update version last.
    if s ~= _CONFIGVERSION then
        luup.variable_set(MYSID, "Version", _CONFIGVERSION, pdev)
    end
end

-- Return current house mode, or test house mode if set
local function getHouseMode( tdev )
    local mode = getVarNumeric( "TestHouseMode", 0, tdev, RSSID )
    if mode == 0 then
        mode = luup.attr_get( "Mode", 0 )
    end
    return mode
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

local function evaluateCondition( cond, grp, cdata, tdev )
    D("evaluateCondition(%1,%2,cdata,%3)", cond, grp.groupid, tdev)
    local now = cdata.timebase
    local ndt = cdata.timeparts
    local hasTimer = false
    if cond.type == "service" then
        -- Can't succeed if referenced device doesn't exist.
        if luup.devices[cond.device or 0] == nil then return false end

        -- If we're not watching this variable yet, start watching it.
        local watchkey = string.format("%d:%s/%s", cond.device or 0, cond.service or "X", cond.variable or "X")
        if watchData[watchkey] == nil or watchData[watchkey][tostring(tdev)] == nil then
            D("evaluateCondition() sensor %1 adding watch for %2", tdev, watchkey)
            luup.variable_watch( "reactorWatch", cond.service or "X", cond.variable or "X", cond.device or 0 )
            watchData = watchData or {}
            watchData[watchkey] = watchData[watchkey] or {}
            watchData[watchkey][tostring(tdev)] = true
        end

        -- Get state variable value.
        local vv = luup.variable_get( cond.service or "", cond.variable or "", cond.device or -1 ) or ""
        local vn = tonumber( vv )

        cond.lastvalue = { value=vv, timestamp=now }

        -- Get condition value
        local cv = cond.value or ""
        local cn = tonumber( cv )

        -- If case-insensitive, canonify to lowercase.
        if cond.nocase then
            vv = string.lower( vv )
            cv = string.lower( cv )
        end

        -- Evaluate conditions. Any failure is a bail-out.
        D("evaluateCondition() %1: %2/%3 %4%5%6?", cond.type, cond.service, cond.variable, vv, cond.condition, cv)
        if cond.condition == "=" then
            if vv ~= cv then return false end
        elseif cond.condition == "<>" or cond.condition == "><" then
            if vv == cv then return false end
        elseif cond.condition == ">" then
            if vn == nil or cn == nil or vn <= cn then return false end
        elseif cond.condition == "<" then
            if vn == nil or cn == nil or vn >= cn then return false end
        elseif cond.condition == ">=" then
            if vn == nil or cn == nil or vn < cn then return false end
        elseif cond.condition == "<=" then
            if vn == nil or cn == nil or vn > cn then return false end
        elseif cond.condition == "contains" then
            if not string.find( vv, cv ) then return false end
        elseif cond.condition == "starts" then
            if not string.find( vv, "^" .. cv ) then return false end
        elseif cond.condition == "ends" then
            if not string.find( vv, cv .. "$" ) then return false end
        elseif cond.condition == "in" then
            local lst = split( cv )
            local found = false
            for _,z in ipairs( lst ) do
                if z == vv then
                    found = true
                    break
                end
            end
            if not found then return false end
        else
            L("evaluateCondition() unknown condition %1 in cond %2 of group", cond.condition, cv)
            return false
        end
    elseif cond.type == "housemode" then
        hasTimer = true
        local modes = split( cond.value )
        local mode = tostring( getHouseMode( tdev ) )
        cond.lastvalue = { value=mode, timestamp=now }
        D("evaluateCondition() housemode %1 among %2?", mode, modes)
        if not isOnList( modes, mode ) then return false,true end
    elseif cond.type == "weekday" then
        -- Weekday; Lua 1=Sunday, 2=Monday, ..., 7=Saturday
        hasTimer = true
        local tt = cdata.timeparts
        cond.lastvalue = { value=tt.wday, timestamp=now }
        local wd = split( cond.value )
        D("evaluateCondition() weekday %1 among %2", tt.wday, wd)
        if not isOnList( wd, tostring( tt.wday ) ) then return false,true end
        -- OK, we're on the right day of the week. Which week?
        if ( cond.condition or "" ) ~= "" then -- blank means "every"
            D("evaluateCondition() is today %1 %2-%3 the %4th?", tt.wday, tt.month,
                tt.day, cond.condition)
            if cond.condition == "last" then
                -- Must be last of this day of the week. If we add a week
                -- to current date, the new date should be next month.
                local nt = os.date( "*t", now + ( 7 * 86400 ) )
                D("evaluateCondition() weekday %1 %2? today=%3, nextweek=%4", tt.wday, cond.condition, tt, nt)
                if nt.month == tt.month then return false,true end -- same
            else
                local nth = tonumber( cond.condition )
                -- Move back N-1 weeks; we should still be in same month. Then
                -- move back one more week, should be in prior month.
                local pt, ref
                ref = now
                if nth > 1 then
                    ref = ref - ( (nth-1) * 7 * 86400 )
                    pt = os.date( "*t", ref )
                    if pt.month ~= tt.month then return false,true end
                end
                pt = os.date( "*t", ref - ( 7 * 86400 ) )
                if pt.month == tt.month then return false,true end
            end
            D("evaluateCondition() yes, today %1 %2-%3 IS #%4 in month", tt.wday,
                tt.month, tt.day, cond.condition)
        end
    elseif cond.type == "time" then
        -- Time, with various components specified, or not.
        L({level=2,msg="ReactorSensor %1 (%2) uses the deprecated form of 'time' condition.  This form will cease to function at rev 1.5 (current running %3). Please reconfigure using the new 'trange' (or 'sun') form and delete the old one."}, tdev, luup.devices[tdev].description, _PLUGIN_VERSION)
        hasTimer = true
        cond.lastvalue = { value=now, timestamp=now }
        local dt = cdata.timeparts
        local hm = dt.hour * 60 + dt.min -- msm (minutes since midnight)
        -- Figure out sunrise/sunset. We keep a daily cache, because Vera's times
        -- recalculate to that of the following day once the time has passwed, and
        -- we need stable with a day.
        local stamp = (dt.year % 100) * 10000 + dt.month * 100 + dt.day
        local sun = split( luup.variable_get( RSSID, "sundata", tdev ) or "" )
        if #sun ~= 3 or sun[1] ~= tostring(stamp) then
            D("evaluateCondition() didn't like what I got for sun: %1; expected stamp is %2; storing new.", sun, stamp)
            sun = { stamp, luup.sunrise(), luup.sunset() }
            luup.variable_set( RSSID, "sundata", table.concat( sun, "," ) , tdev )
        end
        D("evaluateCondition() sunrise/sunset %1", sun)
        -- Split, pad, and compare date.
        local tparam = split( cond.value, ',' )
        for ix = #tparam+1, 10 do tparam[ix] = "" end -- pad
        local cp = cond.condition
        -- ??? between or not?
        D("evaluateCondition() time check now %1 vs config %2", dt, tparam)
        if tparam[1] ~= "" and dt.year < tonumber( tparam[1] ) then return false,true end
        if tparam[6] ~= "" and dt.year > tonumber( tparam[6] ) then return false,true end
        if tparam[2] ~= "" and dt.month < tonumber( tparam[2] ) then return false,true end
        if tparam[7] ~= "" and dt.month > tonumber( tparam[7] ) then return false,true end
        if tparam[3] ~= "" and dt.day < tonumber( tparam[3] ) then return false,true end
        if tparam[8] ~= "" and dt.day > tonumber( tparam[8] ) then return false,true end
        -- Date passes. Get start time.
        local shm, ehm
        if tparam[4] == "" then
            -- No hour, just check minute
            if tparam[5] ~= "" and dt.min < tonumber( tparam[5] ) then return false,true end
        else
            if tparam[4] == "sunrise" then
                local xt = os.date("*t", sun[2])
                shm = xt.hour * 60 + xt.min
            elseif tparam[4] == "sunset" then
                local xt = os.date("*t", sun[3])
                shm = xt.hour * 60 + xt.min
            elseif tparam[4] ~= "" then
                shm = tonumber( tparam[4] ) * 60;
                if tparam[5] ~= "" then
                    shm = shm + tonumber( tparam[5] )
                end
            end
        end
        -- Get end time.
        if tparam[9] == "" then
            -- No hour, just check minute
            if tparam[10] ~= "" and dt.min > tonumber( tparam[10] ) then return false,true end
        else
            if tparam[9] == "sunrise" then
                local xt = os.date("*t", sun[2])
                ehm = xt.hour * 60 + xt.min
            elseif tparam[9] == "sunset" then
                local xt = os.date("*t", sun[3])
                ehm = xt.hour * 60 + xt.min
            elseif tparam[9] ~= "" then
                ehm = tonumber( tparam[9] ) * 60;
                if tparam[10] ~= "" then
                    ehm = ehm + tonumber( tparam[10] )
                else
                    -- Since no selection means "any minute", stretch end time for
                    -- comparison to include full hour (e.g. an end time of hour=22,
                    -- minute=any is equivalent to hour=23 minute=0)
                    ehm = ehm + 60
                end
            end
        end
        -- Compare start and end time specs to current time.
        D("evaluateCondition() compare current time %1 between %2 and %3", hm, shm, ehm)
        if shm == nil then
            -- No starting time, consider only end.
            if ehm ~= nil and hm >= ehm then return false, true end
        elseif ehm == nil then
            -- No end time, consider only start.
            if shm ~= nil and hm < shm then return false, true end
        else
            if shm <= ehm then
                if hm < shm or hm >= ehm then return false, true end
            else
                -- Time spec spans midnight (e.g. sunset to sunrise or 2200 to 0600)
                if not ( hm >= shm or hm < ehm ) then return false, true end
            end
        end
    elseif cond.type == "sun" then
        -- Sun condition (sunrise/set)
        hasTimer = true
        cond.lastvalue = { value=now, timestamp=now }
        -- Figure out sunrise/sunset. We keep a daily cache, because Vera's times
        -- recalculate to that of the following day once the time has passwed, and
        -- we need stable with a day.
        local dt = cdata.timeparts
        local nowMSM = dt.hour * 60 + dt.min
        local stamp = (dt.year % 100) * 10000 + dt.month * 100 + dt.day
        local sun = split( luup.variable_get( RSSID, "sundata", tdev ) or "" )
        if #sun ~= 3 or sun[1] ~= tostring(stamp) then
            D("evaluateCondition() didn't like what I got for sun: %1; expected stamp is %2; storing new.", sun, stamp)
            sun = { stamp, luup.sunrise(), luup.sunset() }
            luup.variable_set( RSSID, "sundata", table.concat( sun, "," ) , tdev )
        end
        D("evaluateCondition() sunrise/sunset %1", sun)
        local tparam = split( cond.value or "sunrise+0,sunset+0" )
        local cp,offset = string.match( tparam[1], "^([^%+%-]+)(.*)" )
        offset = tonumber( offset or "0" ) or 0
        local stt = iif( cp == "sunrise", sun[2], sun[3] )
        dt = os.date("*t", stt + offset*60)
        local startMSM = dt.hour * 60 + dt.min
        if cond.condition == "bet" or cond.condition == "nob" then
            local ep,eoffs = string.match( tparam[2] or "sunset+0", "^([^%+%-]+)(.*)" )
            eoffs = tonumber( eoffs or 0 ) or 0
            local ett = iif( ep == "sunrise", sun[2], sun[3] )
            dt = os.date("*t", ett + eoffs*60)
            local endMSM = dt.hour * 60 + dt.min
            D("evaluateCondition() cond %1 check %2 %3 %4 and %5", cond.id, nowMSM, cond.condition, startMSM, endMSM)
            local between
            if endMSM <= startMSM then
                between = nowMSM >= startMSM or nowMSM < endMSM
            else
                between = nowMSM >= startMSM and nowMSM < endMSM
            end
            if ( cond.condition == "bet" and not between ) or
                ( cond.condition == "nob" and between ) then 
                return false, true
            end
        elseif cond.condition == "before" then
            D("evaluateCondition() cond %1 check %2 before %3", cond.id, nowMSM, startMSM)
            if nowMSM >= startMSM then return false, true end
        else
            D("evaluateCondition() cond %1 check %2 after %3", cond.id, nowMSM, startMSM)
            if nowMSM < startMSM then return false, true end -- after
        end
    elseif cond.type == "trange" then
        -- Time, with various components specified, or not.
        hasTimer = true
        cond.lastvalue = { value=now, timestamp=now }
        -- Split, pad, and complete date. Any missing parts are filled in with the 
        -- current date/time's corresponding part.
        local tparam = split( cond.value, ',' )
        for ix = #tparam+1, 10 do tparam[ix] = "" end -- pad
        local tpart = {}
        local dt = cdata.timeparts
        tpart[1] = iif( tparam[1] == "", dt.year, tparam[1] )
        tpart[2] = iif( tparam[2] == "", dt.month, tparam[2] )
        tpart[3] = iif( tparam[3] == "", dt.day, tparam[3] )
        tpart[4] = iif( tparam[4] == "", dt.hour, tparam[4] )
        tpart[5] = iif( tparam[5] == "", dt.min, tparam[5] )
        tpart[6] = iif( tparam[6] == "", tpart[1], tparam[6] )
        tpart[7] = iif( tparam[7] == "", tpart[2], tparam[7] )
        tpart[8] = iif( tparam[8] == "", tpart[3], tparam[8] )
        tpart[9] = iif( tparam[9] == "", tpart[4], tparam[9] )
        tpart[10] = iif( tparam[10] == "", tpart[5], tparam[10] )

        if tparam[2] == "" then
            -- No date specified, only time components. Magnitude comparison.
            D("evaluateCondition() time-only comparison, now is %1, dt is %2", now, dt)
            local nowMSM = dt.hour * 60 + dt.min
            local startMSM = tonumber( tparam[4] ) * 60 + tonumber( tparam[5] )
            if cond.condition == "after" then
                D("evaluateCondition() time-only comparison %1 after %2", nowMSM, startMSM)
                if nowMSM < startMSM then return false, true end
            elseif cond.condition == "before" then
                D("evaluateCondition() time-only comparison %1 before %2", nowMSM, startMSM)
                if nowMSM >= startMSM then return false, true end
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
                    nowMSM, cond.condition, startMSM, endMSM, between)
                if ( cond.condition == "nob" and between ) or
                    ( cond.condition == "bet" and not between ) then 
                    return false, true 
                end
            end
        elseif tparam[1] == "" then
            -- No-year given, just M/D H:M. We can do comparison by magnitude,
            -- which works better for year-spanning ranges.
            local nowz = tonumber( dt.month ) * 100 + tonumber( dt.day )
            local stz = tonumber( tpart[2] ) * 100 + tonumber( tpart[3] )
            nowz = nowz * 3600 + dt.hour * 60 + dt.min
            stz = stz * 3600 + tpart[4] * 60 + tpart[5]
            if cond.condition == "before" then
                D("evaluateCondition() M/D H:M test %1 %2 %3", nowz, cond.condition, stz)
                if nowz >= stz then return false, true end
            elseif cond.condition == "after" then   
                D("evaluateCondition() M/D H:M test %1 %2 %3", nowz, cond.condition, stz)
                if nowz < stz then return false, true end
            else
                local enz = tonumber( tpart[7] ) * 100 + tonumber( tpart[8] )
                enz = enz * 3600 + tpart[9] * 60 + tpart[10]
                D("evaluateCondition() M/D H:M test %1 %2 %3 and %4", nowz, cond.condition, stz, enz)
                local between
                if stz < enz then -- check for year-spanning
                    between = nowz >= stz and nowz < enz
                else
                    between = nowz >= stz or nowz < enz
                end
                if ( cond.condition == "bet" and not between ) or
                    ( cond.condition == "nob" and between ) then
                    return false, true
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
            D("evaluateCondition() compare now %1 %2 %3 and %4", now, cond.condition, stt, ett)
            local cp = cond.condition or "bet"
            if cp == "bet" then
                if now < stt or now >= ett then return false, true end
            elseif cp == "nob" then
                if now >= stt and now < ett then return false, true end
            elseif cp == "before" then
                if now >= stt then return false, true end
            elseif cp == "after" then
                if now < stt then return false, true end
            else
                L({level=1,msg="Unrecognized condition %1 in time spec for cond %2 of %3 (%4)"},
                    cp, cond.id, tdev, luup.devices[tdev].description)
                return false, false
            end
        end
    elseif cond.type == "comment" then
        -- Shortcut. Comments are always true.
        cond.lastvalue = { value=cond.comment, timestamp=now }
        return true, false
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
    D("evaluateGroup(%1,%2)", grp.groupid, tdev)
    if grp.groupconditions == nil or #grp.groupconditions == 0 then return false end -- empty group always false
    local hasTimer = false;
    local passed = true; -- innocent until proven guilty
    local now = cdata.timebase
    local skey = tostring(tdev)
    for _,cond in ipairs( grp.groupconditions ) do
        if cond.type ~= "comment" then
            local state, condTimer = evaluateCondition( cond, grp, cdata, tdev )
            D("evaluateGroup() eval group %1 cond %2 state %3 timer %4", grp.groupid,
                cond.id, state, condTimer)

            hasTimer = condTimer or hasTimer

            -- Preserve the result of the condition eval. We are edge-triggered,
            -- so only save changes, with timestamp.
            if sensorState[skey].condState[cond.id] == nil then
                D("evaluateGroup() new condition state for %1=%2", cond.id, state)
                sensorState[skey].condState[cond.id] = { id=cond.id, laststate=state, statestamp=now }
                addEvent{dev=tdev,event='condchange',cond=cond.id,newState=state}
            elseif state ~= sensorState[skey].condState[cond.id].laststate then
                D("evaluateGroup() condition %1 value state changed from %1 to %2", sensorState[skey].condState[cond.id].laststate, state)
                -- ??? At certain times, Vera gets a time that is in the future, or so it appears. It looks like the TZ offset isn't applied, randomly.
                -- Maybe if call is during ntp update, don't know. Investigating... This log message helps detection and analysis.
                if now < sensorState[skey].condState[cond.id].statestamp then L({level=1,msg="Time moved backwards! Sensor %4 cond %1 last change at %2, but time now %3"}, cond.id, sensorState[skey].condState[cond.id].statestamp, now, tdev) end
                addEvent{dev=tdev,event='condchange',cond=cond.id,oldState=sensorState[skey].condState[cond.id].laststate,newState=state}
                sensorState[skey].condState[cond.id].laststate = state
                sensorState[skey].condState[cond.id].statestamp = now
            end

            -- Save actual value if changed (for status display)
            cond.lastvalue.value = cond.lastvalue.value or ""
            if cond.lastvalue.value ~= sensorState[skey].condState[cond.id].lastvalue then
                sensorState[skey].condState[cond.id].lastvalue = cond.lastvalue.value
                sensorState[skey].condState[cond.id].valuestamp = now
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
                    if predState == nil -- can't find predecessor
                        or ( not predState.evalstate ) -- not true laststate
                        or predState.statestamp >= sensorState[skey].condState[cond.id].statestamp -- explicit for re-evals/restarts
                    then
                        D("evaluateCondition() didn't meet sequence requirement %1 after %2", cond.id, cond.after)
                        state = false
                    end
                end
            end

            -- Now, check to see if duration restriction is in effect.
            if state and ( cond.duration or 0 ) > 0 then
                -- Condition value matched. See if there's a duration restriction.
                hasTimer = true
                -- Age is seconds since last state change.
                local age = now - sensorState[skey].condState[cond.id].statestamp
                if age < cond.duration then
                    D("evaluateGroup() cond %1 suppressed, age %2 has not met duration requirement %3",
                        cond.id, age, cond.duration)
                    state = false
                    local rem = math.max( 2, cond.duration - age )
                    scheduleDelay( rem, false, tdev )
                else
                    D("evaluateGroup() cond %1 age %2 (>=%3) success", cond.id, age, cond.duration)
                end
            end

            -- Save the final determination of state for this condition.
            passed = state and passed
            if state ~= sensorState[skey].condState[cond.id].evalstate then
                sensorState[skey].condState[cond.id].evalstate = state
                sensorState[skey].condState[cond.id].evalstamp = now
                addEvent{dev=tdev,event='evalchange',cond=cond.id,oldState=sensorState[skey].condState[cond.id].evalstate,newState=state}
            end

            D("evaluateGroup() cond %1 %2 final %3, group now %4", cond.id, cond.type, state, passed)
        end
    end

    -- Save group state (create or change only).
    if sensorState[skey].condState[grp.groupid] == nil
        or sensorState[skey].condState[grp.groupid].evalstate ~= passed
    then
        sensorState[skey].condState[grp.groupid] = { evalstate=passed, evalstamp=now }
        addEvent{dev=tdev,event='groupchange',cond=grp.groupid,oldState=sensorState[skey].condState[grp.groupid].evalstate,newState=passed}
    end
    sensorState[skey].condState[grp.groupid].hastimer = hasTimer

    return passed, hasTimer
end

--
local function evaluateConditions( tdev )
    -- Fetch the condition data.
    local s = luup.variable_get( RSSID, "cdata", tdev ) or ""
    if s == "" then return false end
    local cdata, pos, err = json.decode( s )
    if err then
        L("Unable to parse JSON data at %2, %1 in %3", pos, err, s)
        return nil, nil
    end

    -- Mark a stable base of time
    cdata.timebase = getVarNumeric( "TestTime", 0, tdev, RSSID )
    if cdata.timebase == 0 then
        cdata.timebase = os.time()
    end
    cdata.timeparts = os.date("*t", cdata.timebase)
    D("evaluateConditions() base time is %1 (%2)", cdata.timebase, cdata.timeparts)

    -- Evaluate all groups. Any group match is a pass.
    local hasTimer = false
    local passed = false
    for _,grp in ipairs( cdata.conditions ) do
        local match, t = evaluateGroup( grp, cdata, tdev )
        passed = match or passed
        hasTimer = t or hasTimer
        D("evaluateConditions() group %1 eval %2, timer %3, overall state %4 timer %5, continuing",
            grp.groupid, match, t, passed, hasTimer)
    end

    -- Save the condition state.
    luup.variable_set( RSSID, "cstate", json.encode(sensorState[tostring(tdev)].condState), tdev )

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
    
    -- Check throttling for update rate
    local hasTimer = false
    local maxUpdate = getVarNumeric( "MaxUpdateRate", 30, tdev, RSSID )
    local _, _, rate60 = rateLimit( sensorState[tostring(tdev)].updateRate, maxUpdate, false )
    if maxUpdate == 0 or rate60 <= maxUpdate then
        rateBump( sensorState[tostring(tdev)].updateRate )
        sensorState[tostring(tdev)].updateThrottled = false
        
        -- Update state (if changed)
        local currTrip = getVarNumeric( "Tripped", 0, tdev, SENSOR_SID ) ~= 0
        local retrig = getVarNumeric( "Retrigger", 0, tdev, RSSID ) ~= 0
        local invert = getVarNumeric( "Invert", 0, tdev, RSSID ) ~= 0
        local newTrip
        newTrip, hasTimer = evaluateConditions( tdev )
        if invert then newTrip = not newTrip end
        D("updateSensor() trip %4was %1 now %2, retrig %3", currTrip, newTrip,
            retrig, iif( invert, "(inverted) ", "" ) )
            
        -- Update runtime based on last status
        local now = os.time()
        local lastUpdate = getVarNumeric( "lastacc", now, tdev, RSSID )
        if currTrip then
            -- Update accumulated trip time
            local delta = now - lastUpdate
            luup.variable_set( RSSID, "Runtime", getVarNumeric( "Runtime", 0, tdev, RSSID  ) + delta, tdev )
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
                L("%2 (#%1) tripped state now %3", tdev, luup.devices[tdev].description, newTrip)
                luup.variable_set( SENSOR_SID, "Tripped", iif( newTrip, "1", "0" ), tdev )
                addEvent{dev=tdev,event='sensorstate',state=newTrip}
                if not newTrip then
                    -- Luup keeps (SecuritySensor1/)LastTrip, but we also keep LastReset
                    luup.variable_set( RSSID, "LastReset", now, tdev )
                end
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
            setMessage( iif( newTrip, "Tripped", "Not tripped" ), tdev )
        end

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

    -- ForcePoll??? Not yet implemented.
    local forcePoll = getVarNumeric( "ForcePoll", 0, tdev, RSSID )

    -- No need to reschedule timer if no demand. Demand is created by condition
    -- type (hasTimer), polling enabled, or ContinuousTimer set.
    if hasTimer or forcePoll > 0 or getVarNumeric( "ContinuousTimer", 0, tdev, RSSID ) ~= 0 then
        local v = 10 + ( 60 - ( os.time() % 60 ) ) -- 10 seconds after minute
        scheduleDelay( v, false, tdev )
    end
end

-- Clean cstate
local function loadCleanState( tdev )
    D("loadCleanState(%1)", tdev)

    -- Fetch cstate. If it's empty, there's nothing to do here.
    local cstate = {} -- guilty until proven innocent
    local s = luup.variable_get( RSSID, "cstate", tdev ) or ""
    if s ~= "" then
        local pos, err
        cstate,pos,err = json.decode( s )
        if err then
            L({level=2,msg="ReactorSensor %1 (%2) corrupted cstate, clearing!"}, tdev, luup.devices[tdev].description)
            cstate = {}
        end

        -- Fetch cdata
        s = luup.variable_get( RSSID, "cdata", tdev ) or ""
        if s == "" then
            luup.variable_set( RSSID, "cstate", "", tdev )
            return
        end
        local cdata
        cdata,pos,err = json.decode( s )
        if err then
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


-- Start an instance
local function startSensor( tdev, pdev )
    D("startSensor(%1,%2)", tdev, pdev)

    -- Device one-time initialization
    sensor_runOnce( tdev )

    -- Initialize instance data
    sensorState[tostring(tdev)] = { eventList={}, condState={} }
    sensorState[tostring(tdev)].updateRate = initRate( 60, 15 )
    sensorState[tostring(tdev)].updateThrottled = false
    sensorState[tostring(tdev)].changeRate = initRate( 60, 15 )
    sensorState[tostring(tdev)].changeThrottled = false
    
    -- Clean and restore our condition state.
    sensorState[tostring(tdev)].condState = loadCleanState( tdev )

    addEvent{dev=tdev,event='start'}
    
    -- Watch our own cdata; when it changes, re-evaluate.
    luup.variable_watch( "reactorWatch", RSSID, "cdata", tdev )

    setMessage("Starting...", tdev)

    -- Use a tick task for initial evaluation.
    scheduleDelay( 5, true, tdev )

    luup.set_failure( 0, tdev )
end

-- Start plugin running.
function startPlugin( pdev )
    L("Plugin version %2, device %1 (%3)", pdev, _PLUGIN_VERSION, luup.devices[pdev].description)

    luup.variable_set( MYSID, "Message", "Starting...", pdev )

    -- Early inits
    pluginDevice = pdev
    isALTUI = false
    isOpenLuup = false
    sensorState = {}
    watchData = {}

    -- Debug?
    if getVarNumeric( "DebugMode", 0, pdev, MYSID ) ~= 0 then
        debugMode = true
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
        return false, "Incompatible firmware", _PLUGIN_NAME
    end

    -- One-time stuff
    plugin_runOnce( pdev )

    -- Initialize and start the master timer tick
    runStamp = 1
    tickTasks = { master={ when=os.time()+10, dev=pdev } }
    luup.call_delay( "reactorTick", 10, runStamp )

    -- Ready to go. Start our children.
    local count = 0
    local started = 0
    for k,v in pairs(luup.devices) do
        if v.device_type == RSTYPE and v.device_num_parent == pdev then
            count = count + 1
            L("Starting sensor %1 (%2)", k, luup.devices[k].description)
            local success, err = pcall( startSensor, k, pdev )
            if not success then
                L({level=2,msg="Failed to start %1 (%2): %3"}, k, luup.devices[k].description, err)
                setMessage( "Failed (see log)", k )
                luup.set_failure( 1, k ) -- error on timer device
            else
                started = started + 1
            end
        end
    end
    if count == 0 then
        luup.variable_set( MYSID, "Message", "Open control panel!", pdev )
    else
        luup.variable_set( MYSID, "Message", string.format("Started %d/%d at %s", started, count, os.date("%x %X")), pdev )
    end

    -- Return success
    luup.set_failure( 0, pdev )
    return true, "Ready", _PLUGIN_NAME
end

-- Add a child (used as both action and local function)
function addSensor( pdev )
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

function setEnabled( enabled, tdev )
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
        luup.variable_set( RSSID, "Enabled", iif( enabled, "1", "0" ), tdev )
        -- If disabling, do nothing else, so current actions complete/expire.
        if enabled then
            -- Kick off a new timer thread, which will also re-eval.
            scheduleDelay( 2, false, tdev )
            setMessage( "Enabling...", tdev )
        else
            setMessage( "Disabled", tdev )
        end
    end
end

function actionTrip( force, dev )
    L("Sensor %1 (%2) trigger action!", dev, luup.devices[dev].description)
    luup.variable_set( SENSOR_SID, "Tripped", 1, dev );
    setMessage("Tripped", dev);
end

function actionReset( force, dev )
    L("Sensor %1 (%2) reset action!", dev, luup.devices[dev].description)
    luup.variable_set( SENSOR_SID, "Tripped", 0, dev );
    setMessage("Not tripped", dev)
end

function actionSetArmed( armedVal, dev )
    L("Sensor %1 (%2) set armed to %4", dev, luup.devices[dev].description, armedVal)
    local armed = ( tonumber( armedVal ) or 0 ) ~= 0
    luup.variable_set( SENSOR_SID, "Armed", iif( armed, 1, 0 ), dev )
end

function masterClear( dev )
    -- Remove all child devices.
    local ptr = luup.chdev.start( dev )
    luup.chdev.sync( dev, ptr )
    -- Should cause reload immediately.
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

function setDebug( state, tdev )
    debugMode = state or false
    addEvent{ event="debug", dev=tdev, debugMode=debugMode }
    if debugMode then
        D("Debug enabled")
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

-- Master (plugin) timer tick. Using the tickTasks table, we keep track of
-- tasks that need to be run and when, and try to stay on schedule. This
-- keeps us light on resources: typically one system timer only for any
-- number of devices.
function tick(p)
    D("tick(%1) pluginDevice=%2, luup.device=%3", p, pluginDevice, luup.device)
    local now = os.time()

    local stepStamp = tonumber(p,10)
    assert(stepStamp ~= nil)
    if stepStamp ~= runStamp then
        D( "tick() stamp mismatch (got %1, expecting %2), newer thread running. Bye!",
            stepStamp, runStamp )
        return
    end

    -- Since the tasks can manipulate the tickTasks table, the iterator
    -- is likely to be disrupted, so make a separate list of tasks that
    -- need service, and service them using that list.
    local todo = {}
    for t,v in pairs(tickTasks) do
        if t ~= "master" and v.when ~= nil and v.when <= now then
            -- Task is due or past due
            v.when = nil -- clear time; sensorTick() will need to reschedule
            table.insert( todo, v.dev )
        end
    end
    for _,t in ipairs(todo) do
        local success, err = pcall( sensorTick, t )
        if not success then
            L({level=1,msg="Sensor %1 (%2) tick failed: %3"}, t, luup.devices[t].description, err)
        else
            D("tick() successful return from sensorTick(%1)", t)
        end
    end

    -- Things change while we work. Take another pass to find next task.
    local nextTick = nil
    for t,v in pairs(tickTasks) do
        if v.when ~= nil and t ~= "master" then
            if nextTick == nil or v.when < nextTick then
                nextTick = v.when
            end
        end
    end

    -- Figure out next master tick: soonest timer task tick, or 60 seconds
    local delay = 60
    if nextTick ~= nil then
        delay = nextTick - now
        if delay < 1 then delay = 1 elseif delay > 60 then delay = 60 end
    end
    tickTasks.master.when = now + delay
    D("tick() scheduling next master tick for %1 delay %2", tickTasks.master.when, delay)
    luup.call_delay( "reactorTick", delay, p )
end

-- Handle the sensor-specific watch (dispatched from the watch callback)
local function sensorWatch( dev, sid, var, oldVal, newVal, tdev, pdev )
    D("sensorWatch(%1,%2,%3,%4,%5,%6,%7)", dev, sid, var, oldVal, newVal, tdev, pdev)
    -- Watched variable has changed. Re-evaluate conditons.
    updateSensor( tdev )
end

-- Watch callback. Dispatches to sensor-specific handling.
function watch( dev, sid, var, oldVal, newVal )
    D("watch(%1,%2,%3,%4,%5) luup.device(tdev)=%6", dev, sid, var, oldVal, newVal, luup.device)
    assert(var ~= nil) -- nil if service or device watch (can happen on openLuup)

    if sid == RSSID and var == "cdata" then
        -- Sensor configuration change. Immediate update.
        L("Child %1 (%2) config change, re-evaluating!", dev, luup.devices[dev].description)
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
        , parent=v.device_num_parent
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

function request( lul_request, lul_parameters, lul_outputformat )
    D("request(%1,%2,%3) luup.device=%4", lul_request, lul_parameters, lul_outputformat, luup.device)
    local action = lul_parameters['action'] or lul_parameters['command'] or ""
    local deviceNum = tonumber( lul_parameters['device'], 10 )
    if action == "debug" then
        debugMode = not debugMode
        D("debug set %1 by request", debugMode)
        return "Debug is now " .. iif( debugMode, "on", "off" ), "text/plain"
    end

    if action == "restart" then
        if deviceNum ~= nil and luup.devices[deviceNum] ~= nil and luup.devices[deviceNum].device_type == RSTYPE then
            actionRestart( deviceNum )
            return "OK, restarting #" .. deviceNum .. " " .. luup.devices[deviceNum].description, "text/plain"
        else
            return "ERROR, device number invalid or is not a ReactorSensor", "text/plain"
        end
    elseif action == "status" then
        local st = {
            name=_PLUGIN_NAME,
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
            devices={},
            watchData=watchData,
            tickTasks=tickTasks
        }
        for k,v in pairs( luup.devices ) do
            if v.device_type == MYTYPE or v.device_type == RSTYPE then
                local devinfo = getDevice( k, pluginDevice, v ) or {}
                if v.device_type == RSTYPE then
                    devinfo.sensorState = sensorState[tostring(k)]
                end
                table.insert( st.devices, devinfo )
            end
        end
        return json.encode( st ), "application/json"
    else
        return "Not implemented: " .. action, "text/plain"
    end
end
