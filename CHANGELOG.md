# Change Log #

## Version 2.0develop (development) ##

betayymmdd01:
* (feature) Add ability to enable or disable a condition group in the UI. A disabled condition group is not evaluated, and cannot contribute to the "tripped" state of its ReactorSensor. It is treated as if it didn't exist. The new ReactorSensor action SetGroupEnabled allows groups to be enabled and disabled by action.
* (internal) The runLua action now uses a shared environment across all scripts, for the benefit of sharing loaded modules and being economical with memory. Make the ReactorSensor's variables more useful by allowing them to be set, which updates their persistent state. The environment also logs (luup log and device event log) creation of global variables (which should be avoided) and accesses to undeclared variables.

beta18112001:
* (feature) Add service condition operators "is TRUE" and "is FALSE", which test a more general set of values to determine boolean state (some devices use 1/0, some the words true/false, etc.).
* (feature) Add service condition operator "changes" to pulse true for a short period when the value changes (regardless of value--pulse if it's different from the prior value). The default pulse length is 2 seconds, but is configurable per ReactorSensor via ValueChangeHoldTime (seconds). The 2-second default generally changes faster than the Vera UI7 dashboard display updates, so the rapid change may not be visible on the dashboard card, but the ReactorSensor "Status" tab updates more quickly and exposes/confirms the activity.
* (bug) Fix a Y2K38 issue (!) where a user can enter a year for a date/time condition that would produce an out-of-range value for Vera's 32-bit OS; restrict year values to a compliant subset (1970-2037).
* (internal) Enhance exception syntax in deviceinfo with reach into state variables and attributes.
* (internal) Improve validation of device fields by checking type, value range, etc. against definition.
* (internal) Improve default selection on initial display of new rows.

beta18111801:
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
