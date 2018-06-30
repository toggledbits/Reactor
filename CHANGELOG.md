# Change Log #

## Version 1.1 (release candidate) ##

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
