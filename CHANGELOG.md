# Change Log #

NOTE TO OPENLUUP USERS: All current versions of Reactor REQUIRE openLuup 2018.11.21 or higher.

## Version 2.2 (develop branch)

* Enhancement: Allow invert of group state (i.e. return false when all conditions are met); makes some logic simpler for users.
* Enhancement: Groups can now be moved up and down (like conditions), just for organizational purposes (order has no meaning to the logic). It's also possible to delete a group directly (previously you had to delete all of its conditions one-by-one, and that would then delete the group). The enable/disable control was made an icon in the same control group as the foregoing tools for consistency and better appearance.
* Enhancement: When editing variable expressions, a new "insert getstate" tool is available to more easily fetch device state variable values into the expression.
* Enhancement: Reactor will check "Run Lua" fragments by putting them through Lua loadstring(), as an early check for syntax errors.
* Enhancement: Reactor now implements service SwitchPower1, which mirrors the SecuritySensor1 state (i.e. the binary light is on when the ReactorSensor is tripped; off when it is untripped); this allows facilities that don't support SecuritySensor1 but can support SwitchPower1 to sense and manipulate the ReactorSensor.
* Enhancement: New condition type "geofence" lets you react to one or more users being home, or not at home, or in one of the user's configured locations.
* Enhancement: Show current value of state variable when selecting configuring service conditions (conditions that test service state variables). The display value will be truncated to 64 characters. Hovering over the displayed value or "Current value" label will display the entire string.
* Enhancement: RunLua actions can now use Reactor.dump() to display the content of tables (e.g. `print(Reactor.dump(luup.scenes))`).
* Enhancement: attempt to load the ACE editor if it is not loaded, so it can be used to edit RunLua code with syntax highlighting under both UI7 and AltUI (AltUI loads ACE for us). Note: ACE is disabled by default currently on UI7, as there is some issue with Chrome/Mac; it seems to work for other browsers, so if you want to try/use it, set the `UseACE` state variable to "1" on the Reactor master device.
* Enhancement: "change" operator now supports "from" and "to" values, so a condition can test more than just if the value changes at all, but also if it changes from/to specific value (e.g. house mode changes from Away to Home).
* Fix an issue where cache expiry of condition state data may cause trip/untrip manual action buttons to fail to execute Lua fragments in the activities. This does not affect the normal, automatic operation of trip/untrip in response to conditions, only manual.

## Version 2.1 (released)

This is primarily a fix release that corrects a number of UI errors that people have run into.

* Enhancement: Use datalist on browsers that support it for entry of allowed value list (menu) fields, which creates more flexibility for the user in that the defined values are shown (and autocomplete), but other values can be entered (in case they are absent from enhancement data).
* Enhancement: cleaner handling of optional parameters in enhanced services; handle all parameters in un-enhanced services as optional unless a default is known.
* Enhancement: add values to logic summary display for conditions.
* Fix: error checking on RunScene action was affecting rows other than that being edited.
* Fix: import of a scene containing only Lua (no groups) did nothing previously; now imports a single Lua action.
* Fix: test tools not enabling when checked (reported by pukka).
* Fix: notification_only scenes can have null room IDs, which breaks sorting (fixed).
* Fix: Fix problem with "unsaved changes" prompt coming up again on re-entry to cpanel after prior cpanel exit when save is declined.

## Version 2.0 (released) ##

* Move all documentation to the project wiki; lots of doc improvements (and still work to do, particularly on the Activities page). Contributers are welcome. Wiki: https://github.com/toggledbits/Reactor/wiki
* Allow renaming of condition groups, so you can give them functional names rather than the unique IDs automatically assigned. Valid group names must start with a letter with alphanumeric (and underscore) allowed to follow.
* Make sure each action logs a message to ReactorSensor's event log, and preserve the log across sensor restarts. Also add a new MaxEvents start variable on the master device to override the default of 50 events (per sensor, applies to all).
* Add ability to enable or disable a condition group in the UI. A disabled condition group is not evaluated, and cannot contribute to the "tripped" state of its ReactorSensor. It is treated as if it didn't exist. The new ReactorSensor action SetGroupEnabled allows groups to be enabled and disabled by action.
* Add service condition operators "is TRUE" and "is FALSE", which test a more general set of values to determine boolean state (some devices use 1/0, some the words true/false, etc.).
* Add service condition operator "changes" to pulse true for a short period when the value changes (regardless of value--pulse if it's different from the prior value). The default pulse length is 2 seconds, but is configurable per ReactorSensor via ValueChangeHoldTime (seconds). The 2-second default generally changes faster than the Vera UI7 dashboard display updates, so the rapid change may not be visible on the dashboard card, but the ReactorSensor "Status" tab updates more quickly and exposes/confirms the activity.
* Fix a Y2K38 issue (!) where a user can enter a year for a date/time condition that would produce an out-of-range value for Vera's 32-bit OS; restrict year values to a compliant subset (1970-2037).
* Reactor now supports its own activities, and no longer requires that the user create scenes separately outside of Reactor. You asked for a "scene builder," so here's my first attempt (well, the first one that you seeing :) ).
* New condition type "Interval" is true for a brief period at the specified interval (days, hours, minutes). A "relative to" time specification allows adjustment of the reference time for the cycle; for example, a 4 hour interval with a relative time of 15:00 (3pm) will fire at 03:00, 07:00, 11:00, 15:00, 19:00, and 23:00.
* Expire cached state for conditions; use is only upon update, and between updates, which may be a large span of time, the memory used is held by the reference; expiring the entry after a short period balances memory use with performance. The expiry is tunable via the master device's StateCacheExpiry parameter (0 disables expiry).
* ReactorSensors now implement RunScene and StopScene; scenes run by a ReactorSensor run in the context of the sensor, rather than the Reactor master device (which can still run scenes in its own context). The global (Vera-wide) scene context (assigned by context device 0) is also supported. This means that scenes can now be run (or stopped) in three different types of non-overlapping context, to avoid multiple sensor actions from stepping on each other.
* The SetVariable action is now implemented for ReactorSensors; it sets the value of a Reactor variable (or creates it with the given value). This allows activities a shortcut to manipulate values.

## Version 1.8 (released) ##

* Add civil, nautical, and astronomical dawn/dusk timing to sunrise/sunset conditions. This is by request from several users at relatively extreme latitudes, for whom the offsets to sunrise/sunset are insufficient to accurately represent light/dark conditions throughout the year with continuous tweaking.
* Declare LastDST in service file for Reactor (main).
* Fix cdata watch action to correctly restart sensor automatically (so user doesn't have to do manually).

## Version 1.7 (released) ##

* Address issue with rescheduling condition check when span and crossing midnight (cond doing right thing, rescheduler not following).
* Provide additional information in "Summary" request for more comprehensive diagnostics.
* Improve rescheduling of M/D H:M format time conditions.
* "After" sequencing condition now allows an interval in which sequence must be met (e.g. A must follow B within X seconds).

## Version 1.6 (released) ##

* Add service/variable condition option to "latch" a condition: if the condition is met, it is true and remains true until its parent group goes false (i.e. another non-latched condition in the same group goes false), even if the tested condition becomes false first.
* "Sustained for" option on service/variable conditions now allows testing for "less than" a specified duration, so one can write a condition that detects, for example, when a switch is on for less than 5 seconds. The default op is "at least" (i.e. the prior behavior is the default behavior).
* Hidden and "system" scenes are no longer shown on the Activities tab scene menus.
* Backup and restore of configuration now has a UI on the master device.
* Fix issue #8: crash on startup when attempting to resume scene with no actions (scene.groups is non-existent/nil)
* Clarify the implementation of "scene context". These are more fully described on my web site, and outside of Reactor, are only relevant to other apps/plugins using Reactor's scene runner in lieu of Vera's to run scenes.

## Version 1.5 (released) ##

* Reactor now has the ability to trigger scenes itself, rather than requiring the user to implement a native scene device trigger.
* Reactor now can run scenes internally, and tracks the progress of a scene, so that Luup reload or Vera restart does not interrupt the completion of the scene (the scene resumes execution upon restart of the plugin). An "RunScene" action in the Reactor service also allows Lua users to use Reactor's scene runner rather than the Vera native one (and thus also be protected from restarts/reloads). A "StopScene" action allows any or all scenes to be stopped.
* Master device now checks power source and battery level for Vera Secure, and stores the values for access via expressions. Reacting to power loss (Vera on battery power) and battery level should now be possible, on VeraSecure only. These values will be blank on all other platforms.
* Considerable optimization of time handling, to further reduce CPU load when time-related conditions (including weekday and sun) are used.
* The deprecated form of time test (from 1.1) has been removed; if a user config still contains a reference to this condition type, it will throw an error.

## Version 1.4 (released) ##

* Fix a bug in the initialization of house mode that causes a startup error.
* Fix initialization of servce options in UI so that repeat count isn't default.
* Skip self-watches of expression variables (optimizes evaluation count).

## Version 1.3 (released) ##

* Repeats over time. It is now possible to create a condition matching a number of repeats of a state over time, for example, a sensor that trips 3 or more times within a 5 minute period. This is configured in the condition options for service/variable conditions.
* Implement variables and expression parsing. Users may configure variables whose value is the result of a complex expression. This uses LuaXP (like SiteSensor), with some added functions for locating devices and retrieving state variable values. Additional functions to be added as need becomes evident. These variables are stored in state on the ReactorSensor, and so are available systemwide, as well as within the ReactorDevice for condition matching.
* Implement "Luup Reloaded" condition, which is true the first time it is evaluated after a Luup restart.
* Implement "TripCount" variable to complement "Runtime"; counts the number of times the ReactorSensor has tripped; reset by ResetRuntime action.
* Move housemode check to master tick on parent device; ReactorSensors no longer poll for house mode changes (the parent notifies them via watch callback);
* Fixed a typo in the conditions UI that causes an erroneous condition expression to be generated for "not equals" service values (issue #4). This fix was released to "stable" on 2018-07-09.
* Fix the name of the "Trip" button in the ALTUI dashboard card.
* Initialize (if needed) SecuritySensor1's AutoUntrip variable (default 0). When non-zero, Luup automatically untrips the sensor after the configured number of seconds. This is a Luup function, not a Reactor function, but is not currently implemented in openLuup (I've asked akbooer to consider it).

## Version 1.2 (released) ##

* Deprecate current time condition and create new replacement with more definitive logic. First, the handling of sunrise/sunset is moved to its own condition, with offsets, and the possibility to test *after*, *before*, *between* and *not between*. The new date/time condition (internally 'trange' for time range) allows M/D/Y H:M, M/D H:M, or just H:M. The UI enforces these combinations. This reduces the number of combinations, many of which are difficult to make sense of explain in the old, unrestricted model. See documentation for detailed explanation.
* Add "Runtime" state variable accumulating the total number of seconds a ReactorSensor has been in tripped state. Reset it using the ResetRuntime action or writing 0 to the state variable directly.
* Implement "Test" tab with ability to set a fixed date and house mode, to help users test conditions (and help me test as well).
* Implement rate-limiting for both updates and tripped state changes. The default is 30 updates or 5 tripped state changed per minute (configurable via service variables). Exceeding these rates throttles the sensor (it ignores input for a while). This is primarily to prevent an unwitting user from creating a sensor loop that overwhelmes the processor.
* Add UI to arm/disarm on dashboard and control panel.
* Clean up the humam-readable form of the (now deprecated) old-style time condition (issue #2).
* Show a disabled icon when a ReactorSensor is disabled.
* Make sure category and subcategory are correctly set on new sensors.

## Version 1.1 (released) ##

* Support "sequences light"--restrict the success of a condition to the prior success of another.
* Ability to restart a sensor without doing a Luup reload, via UI button, ReactorSensor action, and request action.
* Add real-time status display with current values and color highlighting of state.
* Improve date/time matching and handling, make it more deterministic and forgiving of unspecified date/time components;
* Improve stability of sunrise/sunset comparisons by caching daily values (Luup's move around as they pass).
* Improve error handling in UI for unparseable/empty configuration and state data (supports fast reset of sensor config and/or state by direct manipulation/erasure of state variables, e.g. via Advanced tab of Vera UI).
* Try to not let users lose changes to configuration if they forget to hit "Save" before leaving the configuration panel.
* Add support for DebugMode state variable to enable debug, fix debug request handler.
* Fix a bug that scrambled Vera UI's brains when a ReactorSensor's status display was opened, making "Advanced" tab show incorrect device data thereafter (until browser refreshed).

## Version 1.0 (released) ##

* Initial public release.
