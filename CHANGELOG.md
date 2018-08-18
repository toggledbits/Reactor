# Change Log #

## Version 1.5 (develop branch) ##

* Master device now checks power source and battery level for Vera Secure, and stores the values for access via expressions. Reacting to power loss (Vera on battery power) and battery level should now be possible, on VeraSecure only. These values will be blank on all other platforms.
* The deprecated form of time test (from 1.1) has been removed; if a user config still contains a reference to this condition type, it will throw an error.
* Considerable optimization of time handling, to further reduce CPU load when time-related conditions (including weekday and sun) are used.
* Incorporate my scene runner from SceneSlayer (another plugin of mine, as yet unpublished). This improves on Vera's native scenes by (a) making delayed scene groups resilient against Luup restarts and reboots, and (b) providing the ability to stop a running scene (i.e. delayed groups that have not yet executed can be abandoned at any time).

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
