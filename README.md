# Reactor #
A plugin for Vera home automation systems to enhance the built-in trigger logic
for scenes and other actions.

* Single-instance plugin that's efficient with system resources;
* Survives reloads/reboots;
* Easy to configure (no Lua or expression syntax to learn);

## Background ##
I developed another plugin called DelayLight to address a common use case that
Vera did not address natively: delay-off (and/or delay-on) of loads in response
to triggers. It quickly became apparent that the trigger capabilities of DelayLight
needed some enhancement, but I didn't want the plugin to become overly complex,
so I decided to implement a more advanced triggering mechanism in a separate
plugin that could be a companion to DelayLight or used standalone (for example, to
trigger standard Vera scenes, Lua, other plugins, etc.).

## Features and Operation ##

Reactor is the parent of a set of a ReactorSensors. Each ReactorSensor contains a set
of logic conditions that when met, cause the sensor to trip (so, a ReactorSensor
implements the SecuritySensor1 semantics). When the conditions are not met, the
sensor is untripped. This basic binary output can be used to trigger scenes and 
other logic.

Reactor itself is a single-instance plugin, meaning all ReactorSensors in the system
run from a single copy of the Reactor code, making it light on system resources even
for large numbers of sensors and logic conditions.

Reactor is currently in its infancy. I've only just released the first version. So
it's functions are basic. It can respond to:

* The change of almost any defined state variable on a device (including other Reactor sensors);
* Changes in house mode (home, away, night, vacation);
* Time/date changes (specific dates, time ranges, date, and day ranges);
* Sequences of events (this must happen before that for the condition to be true).

More conditions are expected as the user community makes its needs clear.

## Installing ##

Reactor can be installed via the Vera Plugin Marketplace (released versions only),
the Alternate App Store (aka AltAppStore under ALTUI, released versions and current
stable development version available), or by installing from Github.

To install from Github, download a branch, or a release ZIP file
from the Github repository "releases" tab and unzip it. Then upload each of the files
files to your Vera or openLuup. Then, use the "Create Device" command (under *Apps > Develop apps* on Vera)
to create the base Reactor device. You only need to provide a device name (use "Reactor"),
the device filename (must be `D_Reactor.xml`) and the implementation filename (must be
`I_Reactor.xml`).

Then, reload Luup (on Vera, I like to enter `luup.reload()` under *Apps > Develop apps > Test Luup code*),
and then hard-refresh your browser (Ctrl-F5 on Windows, whatever similar on Mac).

You should then see the Reactor master device on your devices list (dashboard). 
Refer to the online documentation for instructions on creating your first sensor and
configuring it.

## Using Reactor ##

Documentation for Reactor can be found on my web site at https://www.toggledbits.com/reactor

## License ##

Reactor currently is copyrighted and all rights are reserved. Although the source code is visible for public
review, it is not an open source project at this time and the release of derivative works is not permitted.