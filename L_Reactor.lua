--[[
    L_Reactor.lua - Core module for Reactor
    Copyright 2017,2018 Patrick H. Rigney, All Rights Reserved.
    This file is part of Reactor. For license information, see LICENSE at https://github.com/toggledbits/Reactor
--]]
--luacheck: std lua51,module,read globals luup,ignore 542 611 612 614 111/_,no max line length

module("L_Reactor", package.seeall)

local debugMode = false

local _PLUGIN_NAME = "Reactor"
local _PLUGIN_VERSION = "1.1dev"
local _PLUGIN_URL = "https://www.toggledbits.com/reactor"
local _CONFIGVERSION = 00100

local MYSID = "urn:toggledbits-com:serviceId:Reactor"
local MYTYPE = "urn:schemas-toggledbits-com:device:Reactor:1"

local RSSID = "urn:toggledbits-com:serviceId:ReactorSensor"
local RSTYPE = "urn:schemas-toggledbits-com:device:ReactorSensor:1"

local SENSOR_SID  = "urn:micasaverde-com:serviceId:SecuritySensor1"
local SWITCH_SID  = "urn:upnp-org:serviceId:SwitchPower1"
local DIMMER_SID  = "urn:upnp-org:serviceId:Dimming1"

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
    if isOpenLuup then 
        local s = luup.variable_get( "openLuup", "Version", 2 ) -- hardcoded device?
        local y,m,d = string.match( s or "0.0.0", "^v(%d+)%.(%d+)%.(%d+)" )
        local y = tonumber(y) * 10000 + tonumber(m)*100 + tonumber(d)
        D("checkVersion() checking openLuup version=%1 (numeric %2)", s, y)
        if y < 180400 or y >= 180611 then return true end -- See Github issue #5
        L({level=1,msg="openLuup version %1 is not supported. Please upgrade openLuup. See Github issue #5."}, y);
        return true 
    end
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

-- Add an event to the event list. Prune the list for size.
local function addEvent( t )
    local p = shallowCopy(t)
    if p.dev == nil then L({level=2,msg="addEvent(%1) missing 'dev'"},t) end
    p.when = os.time()
    p.time = os.date("%Y%m%dT%H%M%S")
    local dev = p.dev or pluginDevice
    table.insert( sensorState[tostring(dev)].eventList, p )
    if #sensorState[tostring(dev)].eventList > 25 then table.remove(sensorState[tostring(dev)].eventList, 1) end
end

-- Enabled?
local function isEnabled( dev )
    return getVarNumeric( "Enabled", 1, dev, RSSID ) ~= 0
end

-- Delete a variable (if we can... read on...)
local function deleteVar( sid, name, devid )
    -- Interestingly, setting a variable to nil with luup.variable_set does nothing interesting; too bad, it
    -- could have been used to delete variables, since a later get would yield nil anyway. But it turns out
    -- that using the variableset Luup request with no value WILL delete the variable.
    local sue = sid:gsub("([^%w])", function( c ) return string.format("%%%02x", string.byte(c)) end)
    local req = "http://127.0.0.1/port_3480/data_request?id=variableset&DeviceNum=" .. tostring(devid) .. "&serviceId=" .. sue .. "&Variable=" .. name .. "&Value="
    local status, result = luup.inet.wget(req)
    D("deleteVar(%1,%2) status=%3, result=%4", name, devid, status, result)
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
local function getKeys( m, r ) 
    if r == nil then r = {} end
    local seen = {}
    for k,_ in m do
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
        luup.variable_set( RSSID, "Enabled", "1", tdev )
        luup.variable_set( RSSID, "Invert", "0", tdev )
        luup.variable_set( RSSID, "Retrigger", "0", tdev )
        luup.variable_set( RSSID, "Message", "", tdev )
        luup.variable_set( RSSID, "cdata", "", tdev )

        luup.variable_set( SENSOR_SID, "Armed", 0, tdev )
        luup.variable_set( SENSOR_SID, "Tripped", 0, tdev )
        luup.variable_set( SENSOR_SID, "ArmedTripped", 0, tdev )
        
        luup.variable_set( "urn:micasaverde-com:serviceId:HaDevice1", "ModeSetting", "1:;2:;3:;4:", tdev )

        luup.variable_set( RSSID, "Version", _CONFIGVERSION, tdev )
        return
    end

    -- Consider per-version changes.

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
        luup.variable_set(MYSID, "NumChildren", 0, pdev)
        luup.variable_set(MYSID, "NumRunning", 0, pdev)
        luup.variable_set(MYSID, "Message", "", pdev)
        luup.variable_set(MYSID, "Version", _CONFIGVERSION, pdev)
        return
    end

    -- Consider per-version changes.

    -- Update version last.
    if (s ~= _CONFIGVERSION) then
        luup.variable_set(MYSID, "Version", _CONFIGVERSION, pdev)
    end
end

-- Add a child (used as both action and local function)
function addSensor( pdev )
    D("addSensor(%1)", pdev)
    local ptr = luup.chdev.start( pdev )
    local highd = 0
    for _,v in pairs(luup.devices) do
        if v.device_type == RSTYPE and v.device_num_parent == pdev then
            D("addSensor() appending existing device %1 (%2)", v.id, v.description)
            D("----------- v=%1", v)
            if isOpenLuup then D("----------- ptr=%1", ptr) end
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
    if isOpenLuup then D("END ------- ptr=%1", ptr) end
    luup.chdev.sync( pdev, ptr )
    -- Should cause reload immediately.
end

-- Find a good tick delay for next update
local function scaleNextTick( delay )
    local nextTick = delay or 60
    if nextTick > 60 then nextTick = 60
    elseif nextTick > 10 then nextTick = 5
    else nextTick = 1 end
    local remain = delay % nextTick
    if remain > 0 then nextTick = remain end
    return nextTick
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
    if getVarNumeric( "Armed", 0, dev, SENSOR_SID ) ~= 0 then
        luup.variable_set( SENSOR_SID, "ArmedTripped", 1, dev )
    end
    setMessage("Tripped", dev);
end

function actionReset( force, dev )
    L("Sensor %1 (%2) reset action!", dev, luup.devices[dev].description)
    luup.variable_set( SENSOR_SID, "Tripped", 0, dev );
    luup.variable_set( SENSOR_SID, "ArmedTripped", 0, dev );
    setMessage("Not tripped", dev)
end

function actionSetArmed( armedVal, dev )
    L("Sensor %1 (%2) set armed to %4", dev, luup.devices[dev].description, armedVal)
    local armed = ( tonumber( armedVal ) or 0 ) ~= 0
    luup.variable_set( SENSOR_SID, "Armed", iif( armed, 1, 0 ), dev )
    if armed then
        luup.variable_set( SENSOR_SID, "ArmedTripped", getVarNumeric( "Tripped", 0, dev, SENSOR_SID ), dev )
    else
        luup.variable_set( SENSOR_SID, "ArmedTripped", 0, dev )    
    end
end

function masterClear( dev ) 
    -- Remove all child devices.
    local ptr = luup.chdev.start( dev )
    luup.chdev.sync( dev, ptr )
    -- Should cause reload immediately.
end

function setDebug( state, tdev )
    debugMode = state or false
    addEvent{ event="debug", dev=tdev, debugMode=debugMode }
    if debugMode then
        D("Debug enabled")
    end
end

local function evaluateCondition( cond, grp, cdata, tdev )
    D("evaluateCondition(%1,%2,cdata,%3)", cond, grp.groupid, tdev)
    local now = cdata.timebase
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
            watchData[watchkey] = watchData[watchKey] or {}
            watchData[watchkey][tostring(tdev)] = true
        end

        -- Get state variable value.
        local vv,ts = luup.variable_get( cond.service or "", cond.variable or "", cond.device or -1 ) or ""
        local vn = tonumber( vv )
        
        cond.lastvalue = { value=vv, timestamp=now }
        
        -- Get condition value
        local cv = cond.value or ""
        -- ??? parse date? time? MSSQL style? #yyyy-mm-dd hh:mm:ss#
        if string.match( cv, "^%#[^#]+%#$" ) then
            -- Parse date/time string. Result is either a Unix timestamp, or a value <= 86400,
            -- which is time only and will be matched only to the time component of the variable's
            -- value. 
            -- ?? if time only, adjust both values to time-range.
        end
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
        elseif cond.condition == "<>" then
            if vv == cv then return false end
        elseif cond.condition == ">" then
            if vn <= vc then return false end
        elseif cond.condition == "<" then
            if vn >= vc then return false end
        elseif cond.condition == ">=" then
            if vn < vc then return false end
        elseif cond.condition == "<=" then
            if vn > vc then return false end
        elseif cond.condition == "contains" then
            if not string.find( vv, cv ) then return false end
        elseif cond.condition == "starts" then
            if not string.find( "^" .. vv, cv ) then return false end
        elseif cond.condition == "ends" then
            if not string.find( vv .. "$", cv ) then return false end
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
            L("evaluateCondition() unknown condition %1 in cond %2 of group", cond.condition, vc)
            return false
        end
    elseif cond.type == "housemode" then
        hasTimer = true
        local modes = split( cond.value )
        local mode = tostring( luup.attr_get( "Mode", 0 ) )
        cond.lastvalue = { value=mode, timestamp=now }
        D("evaluateCondition() housemode %1 among %2?", mode, modes)
        if not isOnList( modes, mode ) then return false,true end
    elseif cond.type == "weekday" then
        -- Weekday; Lua 1=Sunday, 2=Monday, ..., 7=Saturday
        hasTimer = true
        local tt = os.date("*t", now)
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
        hasTimer = true
        cond.lastvalue = { value=now, timestamp=now }
        local dt = os.date("*t", now)
        local xt = os.date("*t", luup.sunrise())
        local sunrise = xt.hour * 60 + xt.min
        xt = os.date("*t", luup.sunset())
        local sunset = xt.hour * 60 + xt.min
        local hm = dt.hour * 60 + dt.min
        local tparam = split( cond.value, ',' )
        for ix = #tparam+1,10 do tparam[ix] = "" end -- pad
        local cp = cond.condition
        D("evaluateCondition() time check now %1 vs config %2", dt, tparam)
        if tparam[1] ~= "" and dt.year < tonumber( tparam[1] ) then return false,true end
        if tparam[6] ~= "" and dt.year > tonumber( tparam[6] ) then return false,true end
        if tparam[2] ~= "" and dt.month < tonumber( tparam[2] ) then return false,true end
        if tparam[7] ~= "" and dt.month > tonumber( tparam[7] ) then return false,true end
        if tparam[3] ~= "" and dt.day < tonumber( tparam[3] ) then return false,true end
        if tparam[8] ~= "" and dt.day > tonumber( tparam[8] ) then return false,true end
        if tparam[4] == "sunrise" then
            if hm < sunrise then return false,true end
        elseif tparam[4] == "sunset" then
            if hm < sunset then return false,true end 
        elseif tparam[4] ~= "" then
            local shm = tonumber( tparam[4] ) * 60;
            if tparam[5] ~= "" then shm = shm + tonumber( tparam[5] ) end
            if hm < shm then return false,true end
        elseif tparam[5] ~= "" and dt.min < tonumber( tparam[5] ) then return false,true
        end
        if tparam[9] == "sunrise" then 
            if hm > sunrise then return false,true end
        elseif tparam[9] == "sunset" then
            if hm > sunset then return false,true end
        elseif tparam[9] ~= "" then
            local ehm = tonumber( tparam[9] ) * 60;
            if tparam[10] ~= "" then ehm = ehm + tonumber( tparam[10] ) else ehm = ehm + 59 end
            if hm > ehm then return false,true end
        elseif tparam[10] ~= "" and dt.min > tonumber( tparam[10] ) then return false,true
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

--[[
    PHR??? Eventually I think this should be done in two phases, first one where
    all evaluations are performed and boiled down to a true/false for each cond-
    ition, and then second which evaluates the overall tripped state based on 
    that. This would facilitate showing last value and condition result on the
    UI, which I think would be helpful, at the expense of some CPU cycles.
--]]    
local function evaluateGroup( grp, cdata, tdev )
    D("evaluateGroup(%1,%2)", grp.groupid, tdev)
    if grp.groupconditions == nil or #grp.groupconditions == 0 then return false end -- empty group always false
    local hasTimer = false;
    local passed = true; -- innocent until proven guilty
    local now = cdata.timebase
    local skey = tostring(tdev)
    for nc,cond in ipairs( grp.groupconditions ) do
        if cond.type ~= "comment" then
            local state, condTimer = evaluateCondition( cond, grp, cdata, tdev )
            D("evaluateGroup() eval group %1 cond %2 state %3 timer %4", grp.groupid,
                cond.id, state, condTimer)
            
            hasTimer = condTimer or hasTimer
            
            -- Preserve the result of the condition eval. We are edge-triggered,
            -- so only save changes, with timestamp.
            if sensorState[skey].condState[cond.id] == nil then
                sensorState[skey].condState[cond.id] = { id=cond.id }
            end
            -- State change?
            if state ~= sensorState[skey].condState[cond.id].laststate then
                sensorState[skey].condState[cond.id].laststate = state
                sensorState[skey].condState[cond.id].statestamp = now
            end
            cond.lastvalue.value = cond.lastvalue.value or ""
            if cond.lastvalue.value ~= sensorState[skey].condState[cond.id].lastvalue then
                sensorState[skey].condState[cond.id].lastvalue = cond.lastvalue.value
                sensorState[skey].condState[cond.id].valuestamp = now
            end

            -- Now, check to see if duration restriction is in effect.
            if not state then 
                passed = false
            elseif ( cond.duration or 0 ) > 0 then
                -- Condition value matched. See if there's a duration restriction.
                hasTimer = true
                -- Age is seconds since last state change.
                local age = now - sensorState[skey].condState[cond.id].statestamp
                if age < cond.duration then
                    D("evaluateGroup() cond %1 suppressed, age %2 has not met duration requirement %3",
                        cond.id, age, cond.duration)
                    state = false
                    passed = false
                    local rem = math.max( 2, cond.duration - age )
                    scheduleDelay( rem, false, tdev )
                else
                    D("evaluateGroup() cond %1 age %2 (>=%3) success", cond.id, age, cond.duration)
                end
            end
            
            -- Save the final determination of state.
            sensorState[skey].condState[cond.id].evalstate = state
            
            D("evaluateGroup() cond %1 %2 final match %3", cond.id, cond.type, passed)
        end
    end
    
    -- If we've run the gauntlet, we're good!
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
    cdata.timebase = os.time()
    
    -- Evaluate all groups. Any group match is a pass.
    local hasTimer = false
    local passed = false
    for ng,grp in ipairs( cdata.conditions ) do
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

--
local function updateSensor( tdev )
    D("updateSensor(%1) %2", tdev, luup.devices[tdev].description)
    
    -- If not enabled, no work to do.
    if not isEnabled( tdev ) then
        D("updateSensor() disabled; no action")
        return
    end
    
    -- Update state (if changed)
    local currTrip = getVarNumeric( "Tripped", 0, tdev, SENSOR_SID ) ~= 0
    local newTrip, hasTimer = evaluateConditions( tdev )
    local retrig = getVarNumeric( "Retrigger", 0, tdev, RSSID ) ~= 0
    local invert = getVarNumeric( "Invert", 0, tdev, RSSID ) ~= 0
    D("updateSensor() trip %4was %1 now %2, retrig %3", currTrip, newTrip,
        retrig, iif( invert, "(inverted) ", "" ) )
    if currTrip ~= newTrip or ( newTrip and retrig ) then
        -- Changed, or retriggerable.
        luup.variable_set( SENSOR_SID, "Tripped", iif( newTrip, 1, 0 ), tdev )
        if not newTrip then
            -- If not tripped, reset ArmedTripped, but only if it doesn't agree.
            if getVarNumeric( "ArmedTripped", -1, tdev, SENSOR_SID ) ~= 0 then
                luup.variable_set( SENSOR_SID, "ArmedTripped", 0, tdev )
            end
        else
            -- Now tripped; if armed, make sure ArmedTripped follows
            if getVarNumeric( "Armed", 0, tdev, SENSOR_SID ) ~= 0 then
                luup.variable_set( SENSOR_SID, "ArmedTripped", 1, tdev )
            end
        end
    end
    setMessage( iif( newTrip, "Tripped", "Not tripped" ), tdev )
    
    -- ForcePoll??? Not yet implemented.
    local forcePoll = getVarNumeric( "ForcePoll", 0, tdev, RSSID )
    
    -- No need to reschedule timer if no demand. Demand is created by condition 
    -- type (hasTimer), polling enabled, or ContinuousTimer set.
    if hasTimer or forcePoll or getVarNumeric( "ContinuousTimer", 0, tdev, RSSID ) then
        local v = 60 - ( os.time() % 60 )
        scheduleDelay( v, false, tdev )
    end
end

-- Start an instance
local function startSensor( tdev, pdev )
    D("startSensor(%1,%2)", tdev, pdev)
    
    -- Device one-time initialization
    sensor_runOnce( tdev )
    
    -- Initialize instance data
    sensorState[tostring(tdev)] = { eventList={}, condState={} }

    -- Restore our condition state
    local s = luup.variable_get( RSSID, "cstate", tdev ) or ""
    if s ~= "" then
        local cstate, pos, err = json.decode( s )
        if err then
            L("Unable to parse cstate at %2, %1 in %3", pos, err, s)
        else
            sensorState[tostring(tdev)].condState = cstate
        end
    end

    -- Watch our own cdata; when it changes, re-evaluate.
    luup.variable_watch( "reactorWatch", RSSID, "cdata", tdev )
    
    setMessage("Starting...", tdev)

    -- Use a tick task for initial evaluation.
    scheduleDelay( 5, true, tdev )
end

-- Start plugin running.
function startPlugin( pdev )
    L("Plugin version %2, device %1 (%3)", pdev, _PLUGIN_VERSION, luup.devices[pdev].description)
    assert( ( luup.devices[pdev].device_num_parent or 0 ) == 0 )

    if luup.variable_get( MYSID, "Converted", pdev ) == "1" then
        L("This instance %1 (%2) has been converted to child; stopping.", pdev, luup.devices[pdev].description)
        luup.variable_set( MYSID, "Message", "Device upgraded. Delete this one!", pdev)
        return true, "Upgraded", _PLUGIN_NAME
    else
        luup.variable_set( MYSID, "Message", "Starting...", pdev )
    end

    -- Early inits
    pluginDevice = pdev
    isALTUI = false
    isOpenLuup = false
    sensorState = {}
    watchData = {}

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

local function sensorTick(tdev)
    D("sensorTick(%1)", tdev)

    -- updateSensor will schedule next tick if needed
    if isEnabled( tdev ) then
        updateSensor( tdev )
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
            L("Sensor %1 (%2) tick failed: %3", t, luup.devices[t].description, err)
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
    D("tick() scheduling next master tick for %2 delay %3", tickTasks.master.when, delay)
    luup.call_delay( "reactorTick", delay, p )
end

-- Handle the sensor-specific watch (dispatched from the watch callback)
local function sensorWatch( dev, sid, var, oldVal, newVal, tdev, pdev )
    D("sensorWatch(%1,%2,%3,%4,%5,%6)", dev, sid, var, oldVal, newVal, tdev)
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
    --local deviceNum = tonumber( lul_parameters['device'], 10 ) or luup.device
    if action == "debug" then
        debugMode = true
    end

    if action == "status" then
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
            devices={}
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
