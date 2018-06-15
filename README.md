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
* Time/date changes (specific dates, time ranges, date, and day ranges).

More conditions are expected as the user community makes its needs clear.

## Installing ##

Currently, Reactor is not in the Vera store. To install it, download a release ZIP file
from the Github repository "releases" tab, and unzip it. Then upload each of the unzipped
files to your Vera or openLuup. Then, use the "Create Device" command (under Apps > Develop apps on Vera)
to create a base Reactor device. You only need to provide a device name (use "Reactor"),
a device filename (must be `D_Reactor.xml`) and an implementation filename (must be
`I_Reactor.xml`).

Then, reload Luup (on Vera, I like to enter `luup.reload()` under Apps > Develop apps > Test Luup code),
and then hard-refresh your browser (Ctrl-F5 on Windows, whatever similar on Mac).

You should then see the Reactor master device on your devices list (dashboard). Continue to
"Adding Sensors" below to create and configure your first ReactorSensor.

## Using Reactor ##

### Adding Sensors ###

When Reactor is first installed, only the master plugin (Reactor) device is visible, usually with the text "Open control panel!"
displayed on its dashboard card. This is your call to action, to open the plugin's control panel (click the arrow on the device card in the Vera dashboard).
On the control panel, you'll see an "Add Sensor" button. This creates a new child timer device. Child timers, while they appear as
separate devices, run entirely within the plugin device's environment. However, you can still give them a descriptive name, and assign them
to separate rooms, to help you keep them organized.

The process of creating a child device takes a moment, as it is necessary to reload Luup. As usual, your UI will go unresponsive for a few
moments during this reload. You should use that time to do a full browser refresh/cache flush reload (Ctrl-F5 typically on Chrome and Firefox for Windows).

To configure your new sensor, click on its control panel access button (right-pointing arrow on the dashboard card), and then click "Settings" below
the operating controls.

There is no programmed limit to the number of child sensors you can create.

### Adding and Editing Conditions ###

TBD

### Configuration Options/Settings ###

TBD

### Cautions ###

Currently, there is no loop detection. So, if you create a series of ReactorSensors and they end up triggering each other in a loop,
you will overwhelm system resources and have one heck of a time. Hint: disable (on the Vera dashboard) any of the sensors in the
circuit and the looping should stop.

## Actions and Triggers ##

A ReactorSensor implements the basic interface of `urn:micasaverde-com:serviceId:SecuritySensor1`, so to 
other devices in your system, it looks like a door or motion sensor, and has the triggers and actions
associated with that service.

Reactor's own service ID `urn:toggledbits.com:serviceId:ReactorSensor` provides the following 
additional triggers and actions:

### Triggers ###

#### Enabled State ####

The Enabled State trigger signals that a ReactorSensor has been enabled or disabled.

### Actions ###

#### Trip ####

The Trip action, which takes no parameters, immediately trips the sensor. The sensor may be untripped
at any time by a change in its condition results. This action is intended for debugging of your overall
system behavior (i.e. you can trip the sensor to see what it triggers, without having all of its conditions
otherwise met, which sometimes can be difficult).

<code>
    luup.call_action( "urn:toggledbits.com:serviceId:ReactorSensor", "Trip", { }, deviceNum )
</code>

Note that tripping a ReactorSensor that is enabled may be temporary. If any of the devices or conditions
associated with the sensor's logic changes, the tripped state will be set to whatever is appropriate for
the conditions at that time. If you want the tripped state to stick until you reset, you must first
disable the ReactorSensor.

#### Reset ####

The Reset action, which takes no parameters, untrips the ReactorSensor on which it is called.

<code>
    luup.call_action( "urn:toggledbits.com:serviceId:ReactorSensor", "Reset", { }, deviceNum )
</code>

Note that resetting a ReactorSensor that is enabled may be temporary. If any of the devices or conditions
associated with the sensor's logic changes, the tripped state will be set to whatever is appropriate for
the conditions at that time. If you want the untripped state to stick, you must first
disable the ReactorSensor.

#### SetEnabled ####

The SetEnabled action takes a single parameter, `newEnabledValue`, and enables or disables the ReactorSensor. The value must be 0 or 1 only.
When disabled, the sensor will complete any in-progress condition cycle and go to idle state. It will not automatically trip or untrip
until re-enabled, although manual tripping/untripping with the `Trip` and `Reset` actions is still possible.

<code>
    luup.call_action( "urn:toggledbits.com:serviceId:ReactorSensor", "SetEnabled", { newEnabledValue="1" }, deviceNum )
</code>

## License ##

Reactor currently is copyrighted and all rights are reserved. It is not an open source project at this time.
