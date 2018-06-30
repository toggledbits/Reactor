# Change Log #

## Version 1.1 (development) ##

* Support "sequences light"--restrict the success of a condition to the prior success of another;
* Improve date/time matching and handling, make it more deterministic and forgiving of unspecified date/time components;
* Improve stability of sunrise/sunset tests by caching daily values (Luup's move around as they pass);
* Support restart of a sensor without Luup reload, with UI button, ReactorSensor action, and request action;
* Improve error handling in UI for corrupt/empty configuration and state data;
* Add real time state display with current values and color highlighting;
* Go to some length to not let users lose changes to configuration if they forget to save;
* Fix a bug that scrambled Vera UI's brains and made "Advanced" tab show incorrect device data.

## Version 1.0 (released) ##

* Initial public release.