# Reactor #
A programmable logic plugin for Vera home automation systems to enhance the built-in trigger logic
for scenes and other actions.

* Single-instance plugin that's efficient with system resources;
* Survives reloads/reboots;
* Easy to configure (no Lua or expression syntax to learn);
* Powerful features for testing conditions and performing actions.

## Background ##
I developed another plugin called DelayLight to address a common use case that
Vera did not address natively: delay-off (and/or delay-on) of loads in response
to triggers. It quickly became apparent that the trigger capabilities of DelayLight
needed some enhancement, but I didn't want the plugin to become overly complex,
so I decided to implement a more advanced triggering mechanism in a separate
plugin that could be a companion to DelayLight or used standalone (for example, to
trigger standard Vera scenes, Lua, other plugins, etc.).

## Features and Operation ##

Reactor is the parent of a set of a ReactorSensors. Each ReactorSensor contains 
one or more condition groups, which cause the sensor to trip when all of the 
conditions in any group are met. So conditions within a group are "AND", and
groups are "OR". When no group's conditions are met, the
sensor is untripped. This basic binary output can be used to trigger actions
internally (Reactor has a robust set of actions it can perform), or trigger
external scenes, notifications, and other logic.

Reactor itself is a single-instance plugin, meaning all ReactorSensors in the system
run from a single copy of the Reactor code, making it light on system resources even
for large numbers of sensors and logic conditions.

## Installation, Configuration, etc. ##

Documentation for Reactor can be found in the wiki for the project: https://github.com/toggledbits/Reactor/wiki

## Revision History ##

Please see the CHANGELOG.md file for release notes.

## License ##

Reactor currently is copyrighted and all rights are reserved. Although the source code is visible for public
review, it is not an open source project at this time and the release of derivative works is not permitted.