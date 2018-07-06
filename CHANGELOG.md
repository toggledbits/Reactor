# Change Log #

## Version 1.2 (develop branch)

* Deprecate current time condition and create new replacement with more definitive logic. First, the handling of sunrise/sunset are moved to their own condition, with offsets for each, and the possibility to test *after*, *before*, *between* and *not between*. The new date/time condition (internally 'trange' for time range) allows M/D/Y H:M, M/D H:M, or just H:M. The UI enforces these combinations. This reduces the number of combinations, many of which are difficult to make sense of explain in the old, unrestricted model. See documentation for detailed explanation.
* Clean up the humam-readable form of the (now deprecated) old-style time condition (issue #2).
* Show a disabled icon when a ReactorSensor is disabled.
* Add UI to arm/disarm on dashboard and control panel.
* Make sure category and subcategory are correctly set.

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
