# DelayLight #
A plugin for Vera home automation to provide off- and on-delay of controlled loads.

* Single-instance plugin that's efficient with system resources;
* Timing survives reloads/reboots;
* Easy to configure (no Lua or expression syntax to learn);
* Operates switches/dimmers directly, or runs scenes;
* Controllable via scenes, Lua, and PLEG.

## Background ##
When I had to completely rebuild my Vera installation a couple of months ago, one of
the choices I made was to not use PLEG if I could avoid it, for various reasons, not the
least of which was the considerable load it can place on a Vera if one is not careful.

My most common use scenario was simple: turning off a light that has been on for a while, 
sometimes with
a motion sensor to help detect presence, and sometimes not. I have kids. They leave lights on. I have stairways that get dark and are
often traversed with full hands. Automating on and off for lights was 99.99% of my PLEG usage, and from day one I was always mystified
that Vera didn't support it natively. There have been plugins other than PLEG available to do that job, 
such as the old SmartSwitch plugin. But they all seem to have lost their maintainers and fallen into various stages of disrepair.

So, I decided that it was a simple enough problem to solve that I'd just write my own, and keep it as simple and lightweight
as possible. My requirements were basic, so it
was pretty straightforward, and DelayLight was born in a couple of hours of work. Over the weeks and months that followed,
it picked up a few features, and (like its author over the years) drifted a bit from being credibly called "lightweight," 
but never got a UI. 
Everything was done by modifying state variables directly, which was fine for me.

Recently, though, there has been a spate of conversation around the SmartSwitch plugin on the Vera forums, with people trying to
use it and having mixed success. New users, in particular, were struggling with the learning curve of Vera's particulars at the
same time that SmartSwitch was throwing them curves by having a partially-functioning UI and a series of out-of-band source
changes to find and upload to get a working installation. Vera community, we can do better. So, I decided to put a UI on DelayLight,
and roll it out.

## Features and Operation ##

DelayLight is a simple single-instance plugin that does load (switch, light) on and off delay timing. In its default configuration, it will
react to a sensor device and turn on one or more configured devices for a selected *automatic* timing period. At the end of the period,
"off" commands is sent to a list of devices. A re-trip of the sensor during the automatic timing period restarts the timer. So,
when used in conjunction with a motion sensor, it will, for example, turn on one or more lights, keep them on when subsequent trips
of the sensor indicate ongoing occupancy of the room, and then sometime later, when no motion has been detected, turn them off.

A separate manual timing delay is initiated by activating one of the controlled lights manually. If DelayLight is not already in a timing
cycle, it starts a *manual* timing cycle, but does *not* turn on the "on" list devices.
During manual timing, a trip of a configured sensor or a change to another controlled light will cause the timing
to be extended (the event indicates ongoing presence). At the end of timing, all devices on the "off" list are turned off.

Why separate "on" and "off" lists? Many of the rooms I control are presence-supervised with motion sensors. Many of
these rooms have a lot of lights,
and when I enter them at night, I often only need one light to come on. The "on" list acts like a simple scene for that purpose: when
a configured sensor trips, only the "on" list devices are turned on. The "off" list, then, allows me to specify all of the lights in the
room, so that when the room is later determined to be unoccupied, I'm assured that *all* of the room's lights are turned off, 
not just the light that came on with motion. That also means that if *any* light on either the "on" list or the "off" list
is turned on manually, a *manual* timing cycle is started.

As a single-instance plugin, DelayLight is intended to be light on system resources (no pun intended). A single copy of the plugin runs
all of the configured timers in the system. In fact, a single Vera timer/delay task is used to manage timing for all of the configured
timer sub-devices as well, so even with a large number of rooms, some with more than one timer, the in-memory footprint of the plugin
is relatively small. In my own home, I currently have 16 timer devices across 9 rooms.

### Reboot/Reload Survivability ###

DelayLight's most important feature, arguably, is that its timing survives restarts of Luup or the Vera itself. If a reload occurs during
a timing cycle, DelayLight will attempt to pick up where it left off and turn the lights off at the expected scheduled time. If DelayLight
was idle prior to the reload, and controlled lights or sensors had a detectable state change during the reload (i.e. a light was turned
on manually while the Vera was down), DelayLight will start a timing cycle when it starts up.

### Supported Devices ###

For sensors, DelayLight will allow any device that implements the `urn:micasaverde-com:serviceId:SecuritySensor1` service, which includes
typical motion and door sensors, many multi-sensors, and various plugins that emulate sensor behavior. DelayLight can be triggered by a 
scene, if the user's needs extend beyond the native device handling (e.g. trigger based on thermostat setpoint).

For devices, DelayLight will directly control any standard switch or dimmer (that is, devices that implement the `urn:upnp-org:serviceId:SwitchPower1`
or `urn:upnp-org:serviceId:Dimming1` services). DelayLight will also allow the use of a scene as the "on" list or "off" list (or both), 
making it possible for DelayLight to control devices that do not implement these services or have other features (such as color
or color temperature) that the user may want to control. See cautions, below.

> **IMPORTANT** Proper operation of the manual triggering and timing functions of DelayLight require that the switches and dimmers
> configured offer some flavor of "instant status," that is, that they immediately notify Vera if they are operated manually. An easy
> way to test this is to operate the switch manually while watching the Vera UI. If the UI updates to show the correct state of the 
> switch within two seconds, the device is pushing status to the Vera. There is no reliable workaround for switches and dimmers that
> do not offer this feature.

### Adding Timers ###

When DelayLight is first installed, only the master plugin device is visible, usually with the text "Open control panel!"
displayed on its dashboard card. This is your call to action, to open the plugin's control panel (click the arrow on the device card in the Vera dashboard).
On the control panel, you'll see an "Add Timer" button. This creates a new child timer device. Child timers, while they appear as
separate devices, run entirely within the plugin device's environment. However, you can still give them a descriptive name, and assign them
to separate rooms, to help you keep them organized.

The process of creating a child device takes a moment, as it is necessary to reload Luup. As usual, your UI will go unresponsive for a few
moments during this reload. You should use that time to do a full browser refresh/cache flush reload (Ctrl-F5 typically on Chrome and Firefox for Windows).

To configure your new timer, click on its control panel access button (right-pointing arrow on the dashboard card), and then click "Settings" below
the operating controls.

There is no programmed limit to the number of child timers you can create.

### Configuration Options/Settings ###

#### Automatic Off Delay ####

This is the length (in seconds) of the *automatic* timing cycle. The automatic timing cycle is started when
a "Trigger" device (below) is tripped. If 0, there is no automatic timing.

#### Manual Off Delay ####

This is the length (in seconds) of a *manual* timing cycle. A manual timing cycle is started when an "On" or "Off" device
is turned on manually (not by the action of automatic triggering).

#### Triggers ####

The "Triggers" are the devices that will initiate (or extend) an automatic timing cycle when tripped. When used, these are
typically motion or door sensors. Use of triggers is not required; if no trigger devices are specified, the timer will operating
with manual timing only.

To use more than one device as a trigger, use the green-circled plus icon to add additional device selectors.

The "invert" checkbox inverts the sense of DelayLight's test. That is, for the corresponding device, timing will start when the
tripped state of the sensor resets.

DelayLight timers can use another timer as a sensor (so your timers will appear on the list of trigger devices as you add more of them).
This is useful for tandem-triggering (following) of one timer after another. One can also start a timer based on the reset of another
(using the invert checkbox).

#### On Devices ####

The "On" list devices are those devices that will be turned on when automatic timing is initiated. You may add multiple devices,
and for each dimmer, set its dimming level. Alternately, you may select a single scene to control whatever devices you wish.

When setting the "on" dimming level, if you leave the level field blank, the dimming level will not be changed from the device's previous stored level, and will simply be turned on using a binary on command (note that some dimming devices may still interpret this as turning on to 100%, so be sure to test your device).

#### Off Devices ####

The "Off" list devices are those devices that are turned off when either manual or automatic timing finishes.

In a room with a motion sensor and multiple lights, a common use scenario is to select the motion sensor as the trigger, one
of the lights in the room as the "On" device, and all of the lights in the room as the "Off" devices. This causes the single
"On" list device to come on in response to the motion sensor tripping, but when timing finishes, all lights in the room (including
any that were turned on manually after motion started timing) are turned off.

For dimmable devices, the dimming level can be set to any value, so in theory, one could configure a light that goes bright (on = 100) for motion, and then reduces to 50% (off = 50) when the auto timer expires. If the dimming level is left blank, the current dimming level of the device is not changed, and a binary off command is send instead.

#### Hold-over ####

By default, when timing finishes, all "off" list devices are turned off immediately. Alternately, the timer can be configured
to hold the lights on past the end of the timing cycle until all trigger devices have reset.

A use case for this could be a room with both a motion sensor and a door sensor (such as a garage). With the two sensors configured
as triggers, the lights can come on automatically, and with hold-over enabled, as long as the door sensor sees the door open, the
lights are held on, even if there's no motion detected and the timer expires.

#### On Delay ####

By default, when triggered, the "on" list devices are turned on immediately. Setting a non-zero "on" delay delays that action
by the specified number of seconds. Off-delay timing does not begin until lights are turned on (i.e. after the on delay ends).

#### House Modes ####

To limit automatic triggering to certain house modes, select those modes. If no modes are selected, triggering occurs in all modes.

### Cautions for Use of Scenes ###

The use of Vera scenes complicates functionality a bit and simplifies it a bit. By using scenes, DelayLight can control devices it might
otherwise not know how to control--that's the upside. But scenes introduce a level of indirection that isolate DelayLight from what may actually be going
on with the devices that the scene controls. DelayLight goes to considerable effort to find and track these devices, but it is less certain
than managing them directly, so direct device control should be used if at all possible.

DelayLight also uses its own interpretation of whether a scene is active or not.
As a result, DelayLight still only detects manual triggering for devices that it natively supports (switches and dimmers). 
It can indirectly *control* many other devices through
the use of a scene, but it cannot *detect state changes* for those devices. For example, you can have a scene to turn your thermostat to Economy mode,
and DelayLight will run that scene to start automatic timing and cause the energy mode change to occur, 
but spontaneously switching the thermostat to Economy outside of
DelayLight will not trigger a manual timing cycle, as a standard switch or dimmer would if it were switched on manually.

## Actions and Triggers ##

DelayLight's service ID `urn:toggledbits.com:serviceId:DelayLightTimer` provides the following triggers and actions:

### Triggers ###

#### Timing Change ####

The Timing Change trigger signals the start or end of a timing cycle. 

#### Mode Change ####

The Mode Change trigger is a more detailed version of the Timing Change trigger, providing notification of automatic or manual timing, or reset to idle.

#### Enabled State ####

The Enabled State trigger signals that a DelayLight device has been enabled or disabled.

### Actions ###

#### Trigger ####

The Trigger action, which takes no parameters, starts an automatic timing cycle. Devices on the "on" list are turned on.

<code>
    luup.call_action( "urn:toggledbits.com:serviceId:DelayLightTimer", "Trigger", { }, deviceNum )
</code>

#### Reset ####

The Reset action, which takes no parameters, terminates a timing cycle. All devices on the "off" list are turned off.

<code>
    luup.call_action( "urn:toggledbits.com:serviceId:DelayLightTimer", "Reset", { }, deviceNum )
</code>

#### SetEnabled ####

The SetEnabled action takes a single parameter, `newEnabledValue`, and enables or disables the DelayLight device. The value must be 0 or 1 only.
When disabled, the DelayLight device will complete any in-progress timing cycle and go to idle state. It cannot be triggered until re-enabled.

<code>
    luup.call_action( "urn:toggledbits.com:serviceId:DelayLightTimer", "SetEnabled", { newEnabledValue="1" }, deviceNum )
</code>

## Future Thoughts ##

Although I'm trying to keep this plugin in the realm of the simple, I can see that some extensions are necessary. If you have a suggestion,
feel free to make it. Here's what I'm thinking about at the moment:

* Rather than being limited to the SecuritySensor1 service for triggers, allow any event-driven state for any device to be a trigger. This would allow, for example, my theater to inhibit reset while the AV system is on (i.e. lights don't change while we're watching a movie).
* The natural extension of the above is more direct control/tracking for all devices, or as many as possible. I've already made two passes at this, and backed off. Both worked, but I didn't feel I had enough knowledge about how *other people* would use this plugin to have a good feel for the extent I needed to take this. In the first implementation, I used Vera's static JSON data to provide clues about the behavior and capabilities of devices, but I was concerned that I didn't have a good enough understanding and sampling of all of the various interpretations out there for what static data could contain (it has evolved over the years, and varies widely between plugin authors), so the handling of unexpected or missing values needs to be extensive. The second implementation uses a custom device description file (web-updateable) to address the consistency issue. This also would let me quickly add or fix functionality by revising the file rather than the plugin, but I'm also hesitant because I don't yet feel I've thought through all of the scenarios for changes, especially changes that could potentially break running configurations (e.g. renaming a state or condition due to error, conflict, or just spelling). All code is preserved, and I'm continuing to self-debate the merits and weaknesses of these approaches.

## License ##

For license information, please see the LICENSE file in the GitHub repository for the project.
