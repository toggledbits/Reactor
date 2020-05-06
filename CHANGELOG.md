# Change Log #

NOTE TO OPENLUUP USERS: All current versions of Reactor REQUIRE openLuup 2020.04.14b or higher.

**DEPRECATION NOTICE:** The expression functions `arraypush()`, `arraypop()`, `arrayunshift()` and `arrayshift()` have been made first-class functions in the LuaXP module under the names `push()`, `pop()`, `unshift()` and `shift()` respectively. The `array...()` versions are now deprecated, and will be removed from a future release. Please convert to the new functions, which for all practical purposes are identical (so you just need to change the names in your expressions and it's done).

## Version 3.6 (RC 20126)

* Enhancement: **IMPORTANT! PLEASE READ!** As of 3.6, Reactor attempts to check the validity of the system clock at startup and during operation. Clock problems are relatively rare, but can be quite severe in their effect on the system's and Reactor's behavior. There are two specific cases now handled as follows:

   1. **Clock Invalid at Startup:** Since current Vera hardware does not have a battery-backed hardware real time clock, they rely on the Network Time Protocol (NTP) and Internet-based servers to set and maintain synchronization of the current time. If a system starts up at a time when Internet access is unavailable (which is not terribly rare when recovering from a power failure, for example), the system time will be wildly off (technically, this also applies to openLuup systems running on hardware that doesn't have a real time clock). This invalid clock with then cause all kinds of problems, as Reactor may think that it's midnight on January 1, 2000 when it's actually 2pm at a much later date. At startup, Reactor now does a simple check of the system's clock, and if the check fails, Reactor marks the clock invalid and shows a message to that effect on the Reactor master device. The Reactor master state variable `ClockValid` will be set to 0 (this can be tested from a ReactorSensor; it is normally 1 when the clock is valid). See the "Reactor says CLOCK INVALID" topic in the [Reactor documentation's FAQ](https://www.toggledbits.com/static/reactor/docs/FAQ/) for important additional details.
   2. **Clock Adjustments During Operation:** In normal operation, the system clock is adjusted using the Network Time Protocol (NTP), and these are normally very small, frequent adjustments. Large adjustments of the clock, say more than 60 seconds in either direction, can have deliterious effects on condition delays, sequences, and activity or scene delayed actions. If Reactor detects a large adjustment of the system clock while running, it will mark the system clock "unstable" and issue messages to that effect in the "Events" log of your ReactorSensors when they are re-evaluated. An "unstable" clock *causes notifications only*; Reactor does not otherwise change or disable any behaviors, and the system time is used as presented even if that results in errors in the flow of logic (e.g. a large adjustment forward may cause delays to be severely shortened or skipped altogether). See the "RS says CLOCK UNSTABLE" topic in the [Reactor documentation's FAQ](https://www.toggledbits.com/static/reactor/docs/FAQ/) for important additional details.
* Enhancement: Reactor now checks that Internet access is operating by periodic checks (default: every five minutes). Once a check fails, two additional checks at one minute intervals are performed. If three consecutive checks fail, Internet is marked down. The current network status is available by checking the `NetworkStatus` state variable on the Reactor master device, and it may be used in *Device State* conditions (or `getstate()` expressions) to test and react to changes in network status.
* Enhancement: The *Request* action has been added to activities to make an HTTP GET or POST request to a remove service as an action. The URL, headers, and (for POST) body data may be specified, and variable substitutions using the usual `{expr}` syntax work. When using POST, it is highly recommended that a correct "Content-Type" header be included.
* Enhancement: The status display shows missing devices more clearly;
* Enhancement: The Conditions editor more clearly shows missing devices on the initial presentation;
* Enhancement: The Activity editor now works much harder to preserve data when (a) a missing device is fixed to a new device, (b) the device is changed to another that supports the same action. This addresses the issue where having a missing device in an action would cause the action and parameters to be lost when you try to fix it--they are now preserved.
* Enhancement: All actions run by activities are not logged individually before they are performed, so that messages in the LuaUPnP log can be more closely correlated to each individual step. The log entries use the form `"Alarm Demo" (#84) Performing "Device Action" ("root.true" group 1 index 1)`.
* Enhancement: Notify action fields now allow variable references in more places: SMTP recipient and subject, UserURL URL parameters.
* Enhancement: functions `urlencode(string)` and `urldecode(string)` added to expressions.
* Enhancement: Turnaround rescans, the rescans of conditions and expressions that are requested while a scan is already in progress (usually caused by a watched device being modified by an activity), are now scheduled more aggressively. Huh? Reactor is even faster.
* Enhancement: Some users have asked that all conditions start collapsed in the Conditions editor; I view this as a behavior for advanced users, so it's now available by setting `DefaultCollapseConditions` on the Reactor master device to 1 (default 0).
* Enhancement: Add "is NULL" operator for Expression Variable condition to test specifically for null; this improves over the prior recommendation (test for empty string, which meant you could not differntiate between empty string and null).
* Enhancement: Conditions with running timing (delay reset, sustained, etc.) will show green pulsing animated highlight, to draw attention.
* Enhancement: Upgraded LuaXP to 1.0.2, which adds the missing `replace()` string function, and provides `indexof()` and the new `push()`, `pop()`, `unshift()`, and `shift()` functions. The Reactor-specific `arrayPush()`, `arrayPop()`, `arrayUnshift()` and `arrayShift()` functions are now deprecated.
* Enhancement: Warning icons are now displayed in the Activities tab if any activity/action has an error or warning highlight.
* Enhancement: The Reactor (master device/service) action `SendSMTP` has been added (thank sebby). This allows facilities outside Reactor to use Reactor's SMTP messaging capabilities. Parameters: `To`, `Subject`, `Body`, and optionally `From`, `Cc` and `Bcc`. If `From` is not given, the system default "from" address is used. The `To`, `Cc` and `Bcc` fields all accept comma-separated lists of email addresses, which can be given in the simply `test@example.com` form, or the more nominative `Patrick Rigney <test@example.com>`.
* Enhancement: The Reactor (master device/service) action `SendSyslog` has been added to allow other system facilities to easily log Syslog datagrams to a Syslog server. Parameters `ServerIP`, `Application` and `Message` are required. The optional `Facility` parameter allows the setting of the Syslog facility (0-23, default 23=local7); the optional `Severity` parameter allows the setting of the severity (0-7, default 5=notice). Ref: https://en.wikipedia.org/wiki/Syslog
* Fix: api.performActionOnDevice() has some kind of inconsistent URL-encoding discipline, and rather than spend a bunch of time reverse engineering it, bypass it and just make the Ajax action request directly myself.
* Fix: The "Stop Group Activity" action was failing to correctly reselect the "(all activities)" option when loading an existing action; fixed.
* Fix: Work around Vera Lua's broken `tonumber()` that returns `nil` for `tonumber(".5")`.
* Fix: UI issue where "Expression Variable" condition would not insert a "missing" option for a non-existent variable.
* Fix: UI doesn't throw exception when "Run Group Activity" or "Stop Group Activity" action with non-existent RS is encountered.
* Fix: Fixed a minor error in the list of severities in the Notify action method for syslog (7=debug was missing).
* Fix: Downloading of updated device information databases for Vera3/Lite works again (TLS issue).
* Fix: Formatting improvements and doc links on master's "Backup and Restore" tab.
* Fix: Make DST change "softer" by using scheduled sensor tick rather than Refresh action.
* Fix: Make sure non-existent scene is removed from scene cache, so we don't try to refetch it on subsequent reloads.
* Fix: Update LuaXP to 1.0.2 for access to `indexof()` function; also fixes `pow()` with negative base (first argument).
* Fix: Fix "leak" of LuaXP null atom structure on Status display.
* Hotfix 20103-01: Prevent odd jump to Dashboard from event list (Conditions tab, Device State condition) on older UI7 (at least 1040 and below).
* Hotfix 20080-01: Allow device 0 in expression `getattribute()` function, so you can fetch system attributes.
* Hotfix 20078-01: Fix a missing selector constraint that may affect conditions when pulse mode is used.
* Hotfix 20072-01: openLuup only: Suppress "unsafe lua" warnings correctly on openLuup.
* Hotfix 20070-02: Deviceinfo updates now stored as compressed, and remove any uncompressed file found, to remove ambiguity as to which file may be loaded.
* Hotfix 20070-01: Fix display of floating point values in condition descriptions on Status tab.
* Hotfix 20069-01: openLuup only: do not attempt compression of backup files on openLuup (L_Reactor.lua)
* Hotfix 20051-01: Make sure "action try" button re-enables after save.
* Hotfix 20049-02: Address incompatibility in APIs between Vera UI and ALTUI causing "Save" to abort post-save cleanup.
* Hotfix 20049-01: Improve test for certain older version of LuaSec in fetching SSL param defaults for SMTP notifications.
* Hotfix 20048-01: Make sure group focus button stays hidden while experimental.
* Hotfix 20048-02: Fix broken links to Vera community forum.

## Version 3.5 (released) [20045]

* POTENTIAL BREAKING: ReactorSensors no longer support the "Invert" state variable to reverse the sense of logic output to the Tripped state of the ReactorSensor. The better (and now required) choice is to apply "NOT" to the "root" group if needed. I doubt anybody has used the "Invert" flag, though.
* POTENTIAL BREAKING: Until 3.5, tripping the ReactorSensor "manually" (e.g. with the UI buttons, or calling the "Trip" or "Reset" actions on the ReactorSensor, would run the root group's corresponding activity. This is a legacy behavior from before Reactor had groups. As of 3.5, "Tripped" state is just a flag, and will no longer run any activity when changed. However, changes in the root group's logic state will still drive the "Tripped" value ("root" true == Tripped, "root" false == Not Tripped/Reset), and the root group's activities will run in response to logic changes as they would for any other group. The reverse path, however, is no longer true--forcing the ReactorSensor to trip or untrip doesn't run the root's activities. I doubt anybody actually relies on this behavior, and it actually creates more problems than it solves, which is why I'm removing it. If you must have the behavior, you should redo your logic, but while you're figuring out how, you can set `UseLegacyTripBehavior` = 1 on any ReactorSensor that requires it. This flag and the ability to use the legacy behavior will be removed for 4.0. Also note that this change only affects Reactor activities; it does not change the behavior of Vera scenes using a ReactorSensor as a device trigger.
* Enhancement: Added a "Stop Group Activity" to stop a specific activity, or all activities, running on the current ReactorSensor or another.
* Enhancement: The "Run Group Activity" action now allows you to force-stop all other running activities before launching the selected activity. This is a short-cut for using a separate "Stop Group Activity" before.
* Enhancement: "Pulse" output mode for conditions now allows repeat pulses with a configurable *off/false* period between and a limit on the number of pulses.
* Enhancement: The new *Expression Variable* condition type allows direct condition testing of an expression's most recent result value without using a self-referencing *Device State* condition.
* Enhancement: The new *Set Variable* activity allows direct setting of a variable without using a self-directed *Device State* activity with a *SetVariable* service action. The target variable must be "expression-less" (that is, its configured expression is blank/empty).
* Enhancement: New "Run Activity" button on each activity allows the entire activity to be tested. This does not stop other running activities, including contra-activities (i.e. if you run the "is TRUE" activity for a group it does not stop the group's "is FALSE" activity if it is currently running).
* Enhancement: Make event log entries more human-readable.
* Enhancement: `Reactor` table in "Run Lua" actions now publishes state for all conditions (in table `Reactor.conditions`; keys are condition IDs). This makes the current condition states and values accessible directly in Lua without additional "gets".
* Enhancement: `Reactor` table in "Run Lua" actions now publishes group states (in `Reactor.groups`) by name as well as by ID. Previously the keys were group IDs. Now you can use either in "Run Lua" actions.
* Enhancement: Do not check firmware version in debug mode, specifically for allowing testing on any firmware, including alpha/unblessed.
* Enhancement: The Activities tab now can filter the display by "true" and "false" activities (suggestion by tunnus).
* Enhancement: Update LuaXP to latest version (1.0.1); adds `date()` and `map()` functions, more trig; see https://github.com/toggledbits/luaxp
* Enhancement: The new `getstatetime()` expression function is now available to return Luup's last-modified timestamp for a state variable.
* Enhancement: In places where variable substitution is allowed (i.e. where you can use `{variablename}`), you can now use an expression (same syntax as Expressions tab, just surround the expression in curly braces).
* Enhancement: The "Device Spy" on the Tools tab reports changes in state variables (dynamically) on a selected device. This is intended to help users find state variables that change as the device is used/updated.
* Enhancement: Add option for sequence ("after") condition restriction to ignore current state of predecessor (so timing is based only on last true edge of predecessor).
* Enhancement: When a ReactorSensor is disabled, its Status view will show all gray (as if all groups were disabled, which they effectively are).
* Enhancement: Features that require the "Allow Unsafe Lua" flag now generate an alert if the flag is not enabled.
* Internal: Clean up mechanism for determining SSL parameters for SMTP connections.
* Internal: Upgrade of configuration is only done by core now; no duplication of effort on the JS side.
* Fix: Improve the list contents for the "relative to" conditions on Interval conditions.
* Fix: Fix color of text for ALTUI users using dark themes.
* Fix: Fix reinitialization issue when switching between tabs without saving and user elects to abandon changes.
* Fix: Do not clear operands when changing operators.
* Fix: Condition value field IDs "unique-ified" similar to hotfix 19318-01 for some Mac browsers.
* Fix: Delay input fields need same unique ID treatment, similar to hotfix 19318-01, for some Mac browsers.
* Fix: "try" action operating in Activity editor was not substituting variables correctly; partly a limitation introduced by the evolation of variable, and partly bug, but in any case, fixed.
* Fix: After clearing condition state, make sure initial update/restart runs all activities eligible (esp. root).
* Fix: Try to reduce complexity of the interaction with VeraAlerts for notifications; fixes some issues in scene handling that create odd side-effects for users, and allows editing of recipients in the Activities tab. Messages on VA-controlled notifications are still required to be edited in VA. Recipient changes still require user to enter VA's "Edit" tab to get those changes to take effect. It is what it is.
* Fix: Cosmetic bug in the appearance of scene list for Run Scene activity.
* Fix: Cosmetic bug--"updates" action does not need "ignore case" checkbox.
* 19240-01: SMTP notifications to Google/Gmail fail with `555 5.5.2 Syntax error` (L_Reactor.lua)
* 19273-01: Using a variable reference in a delay doesn’t work properly. (L_Reactor.lua)
* 19288-01: It appears certain Unicode characters can make the ancient JSON library that is standard in current Vera firmware hiccup and produce empty results, erasing a ReactorSensor’s configuration. Several different approaches to preventing damage to the config are implemented in this hotfix. (J_ReactorSensor_UI7.js, L_Reactor.lua)
* 19317-01: Fix variable substitution in "Try" action operation in Activity editor (J_ReactorSensor_UI7.js)
* 19317-02: Fix action editor incorrectly reselecting currently configured value (J_ReactorSensor_UI7.js)
* 19318-01: Work around issue with Chrome getting confused when multiple data-list fields have same ID (minor but apparently really annoying)
* 19337-01: Attempt to deal with inconsistencies in variable handling in Vera's JS API
* 19354-01: Fixes for VeraAlerts notifications mentioned above were backported to 3.4.

## Version 3.4 (released)

* Enhancement: new *Notify* action will send a notification to the selected users with a custom message. See [the Wiki](https://github.com/toggledbits/Reactor/wiki/Notify-Action).
* Enhancement: Add new device condition operators "between" and "not between", an additional numeric comparison. Seems obvious, yet I never thought to add it, and somebody finally asked.
* Enhancement: The *Run Scene* action, which runs a Vera scene, now has the option to run the scene in Reactor (default), or hand the scene off to Vera/Luup. Previously, all Vera scenes run by a *Run Scene* action could be handed off to Vera only if the `UseReactorScenes` state variable was set to 0; now it is explicitly controllable on a per-scene basis. The `UseReactorScenes` state variable still serves to override the default (i.e. if you have an RS with `UseReactorScenes=0` its behavior is not changed by this enhancement). Technically, this means `UseReactorScenes` is actually of minimal use going forward, and so is now deprecated, and will be removed from a future release. The setting on the *Run Scene* action should be used instead.
* Enhancement: The new *Run Group Activity* action in group state activities can be used to run another activity from the current or another ReactorSensor.
* Enhancement: The `RunScene` service action has been extended to allow running of group state activities (specify the activity ID in `SceneNum`).
* Enhancement: When exporting a variable, the underlying device state variables are created on save; previously, it would take an update of the expression result to get the state variable created (and thus was not immediately available in the Conditions editor, for example).
* Enhancement: The transition of a sensor from *disabled* to *enabled* state clears all prior condition state data; this starts with a clean slate, in case the sensor has been disabled for some time. There was also no easy way to clear the state, and doing it on plain "Restart" proved a little aggressive in testing.
* Enhancement: Add "Reset Latched" action for activites to reset latched conditions in a specific group or for the entire RS (adding new way to reset latched conditions).
* Enhancement: Condition and group logic output is now distinctly settable in three modes: follow (maintains *true* output while underlying condition is true), pulse (pulse of configurable length starting when underlying condition goes true), and latch (go true when underlying condition goes true and holds until reset). The default is follow, which is also the legacy behavior. The output type is settable in the options pane for the condition.
* Fix: The default device selected for *Group State* conditions is now the "(this device)" virtual device.
* Fix: more attractive checkboxes, and fix a number of appearance issues under ALTUI.
* Fix (hotfix 19217-01): When interval was longer than a day, condition was triggering daily anyway.
* Fix (hotfix 19178-01): Address boundary condition where isEmpty() may be passed null/non-string (treat as non-empty).
* Misc: trying various things to improve the performance of geofence data parsing (dkjson is naturally slow).

## Version 3.3 (released)

* Enhancement: Condition options can now be applied to groups.
* Enhancement: New "updates" device state operator pulses true when the state variable is rewritten. Note that this is only valid/correct for use in Luup variables where the Luup watch mechanism calls the callback on a same-value rewrite (i.e. when setting a variable to "1" when its value is already "1")--Luup does not do this for most variables, but notably does for a handful that begin with `sl_`; for example, `sl_SceneActivated` (scene controllers), `sl_UserCode` (locks), `sl_TamperAlarm` (security sensors), etc.
* Enhancement: Condition transitions delayed by "sustained for" and "delay reset" options now show timers on the status display when timing is in effect.
* Enhancement: Device menus now have "self" selection to refer to current ReactorSensor.
* Enhancement: Make timing of watch-driven updates configurable, and make new default immediate evaluation to mitigate race condition in fast-changing states (like RFXtrx switches).
* Enhancement: Allow user control of export of variable/expression results; exported values (default, for backward compatibility) are written to state variables.
* Enhancement: Allow the getluup() expression function to return tables (such as luup.devices).
* Enhancement: House mode changes will now force re-eval of geofence state as well, to speed coordinated response to conditions involving both house mode and geofences.
* Enhancement: Most trouble messages in the event log are now prefixed with "TROUBLE" to make them easy to find (exception: throttling messages).
* Enhancement: SetVariable now forces an additional evaluation of the RS to ensure that any conditions that reference it display correctly.
* Fix: When editing a condition, selecting an item from the scene/events dropdown menu was causing a scroll to top; this is idiopathic, and seems to only occur on Bootstrap dropdown elements, and is reactive with the setting of the enabled state of the "Save" and "Revert" buttons; work around by saving scroll position and restoring after update.
* Fix: Make sure all condition types display options data in Logic Summary, not just device state.
* Fix: Unrecognized services (not in device data base) were not always handled with full parameters.
* Fix: Do a full RS restart on enable, which fixes problem of config changes not detected on a sensor that was disabled at plugin startup time.
* Fix: Faster response to name change of geofence location (geotag)--previously only updated when in/out state changed.
* Fix: When using ResetRuntime, make sure reference point is moved to reset time as well (only affects measurement if RS is tripped at time ResetRuntime is called).
* Fix: Use Vera-defined date/time format in display (reported by sm2117).
* Fix: Timing issue on delay reset hold time across reloads due to poor round-trip through dkjson (stringifying keys in array--ouch).
* Fix: LuaXP updated to latest (0.9.9); fixes excessive strictness of parser not allowing whitespace between function name and arg list.

## Version 3.2 (released)

* Enhancement: Allow interval condition's base time to be true-edge time of another condition (Github issue #35).
* Fix (attempt): Add CSS for optgroup tag in attempt to address dJOS' valid complaint of poor default browser presentation on Chrome/Mac Mini. Browser support for CSS on this element and "select" elements in general is poor currently, but we can try.
* Enhancement: Allow user option to rename device on restore to match restored configuration (when restoring a single config to a targeted device; Github issue #33).
* Enhancement: The Reactor master device's Backup/Restore tab now facilitates the simulantaneous creation of up to 16 ReactorSensors (Github issue #34).
* Enhancement: On the "after" sequence option menu, if the condition description is truncated to length, use a tooltip to display the full description on hover.
* Enhancement: The "after" sequence option menu now allows non-ancestor groups of the current condition.
* Fix: The "Ignore Case" checkbox was sometimes presented when not needed (e.g. <= and >= operators).
* Fix: Variable with no expression isn't created as state variable until non-blank/non-null value assigned; it is now created regardless.
* Hotfix 19140-01: Fix expression field (Expressions tab) not enabled on draw.

## Version 3.1 (released)

* Fix: Interval condition stomping on needed value, disrupting any subsequent time-related conditions.
* Fix: New Variable/Expression is created in the wrong container so it wasn't immediately sortable.
* Enhancement: The `getstate()` expression function now accepts an empty string for the device argument, which means the current ReactorSensor (self-reference).
* Fix: Ensure activities for group are removed when group deleted.
* Fix: When the root group is NUL, every eval looks like a change to the throttling algorithm and erroneously change-throttles the RS too soon. Logically, an RS with a NUL root group should never change-throttle, it can only update-throttle.
* Hotfix-19127-01: Fix condition/group drag/drop within same parent group not saving (inter-group is OK).

## Version 3.0 (released)

* Enhancement: The device-defined conditions normally seen in the Vera scene editor are now offered as shortcuts for creating conditions;
* Enhancement: Loading of action data from Vera now retries automatically--improves remote user experience.
* Fix: an issue allowing multiple system watches for a single variable; benign, but not perfectly efficient, and causes repetitious (and therefore confusing) event log messages [issue #26].
* Enhancement: New "Delay reset" option allows false state of condition to be delayed by the specified number of seconds (this can be used to debounce device states, or as an "off" delay for motion sensing, for example) [issue #16];
* Fix: Apply timezone fix from LuaXP distribution (applies to parsing dates/times with embedded TZ spec only).
* Enhancement: Activities are now collapsable, and since the number of activities is equal to the number of groups plus two, it's possible to hide unused groups as well (this is a persistent state/choice that operates plugin-wide) [issue#24];
* Enhancement: New "Group State" condition allows the user to condition upon the state of another group in the same or another ReactorSensor.
* Enhancement: Reporting of errors (such as reference to a device or scene that no longer exists) in conditions and activities is improved through the use of the (notification-capable) `Trouble` state variable. Related diagnostic information is written to the Logic Summary events list. A new icon with a yellow warning triangle superimposed calls attention to ReactorSensors reporting trouble.
* Enhancement: The new expression function `trouble( msg [, title] )` has been added to allow expressions to signal trouble for any purpose. The *msg* argument is written to the Logic Summary event list, along with the optional *title*. The default title is simply "trouble()".
* Enhancement: The `finddevice()` expression function now takes an optional second boolean argument that determines if an error is thrown (and thus trouble is reported) if the referenced device is not found. If not provided or *false*, `null` is returned (the legacy behavior); if *true*, an eval error is thrown and trouble is signalled.
* Enhancement: The `getstate()` expression function now takes an option fourth boolean argument that determines if an error is thrown (and trouble is reported) if the referenced device is not found. If not provided or *true*, an error is thrown and trouble is signalled (the legacy behavior); if *false*, `null` is returned.
  > Note: The default *legacy* behaviors (i.e. when the new optional argument is not provided) described above for `getstate()` and `finddevice()` are different; this is intentional and consistent with their operation prior to this enhancement (so the behavior of existing expressions does not change). The new argument is, however, consistent, in that when a device cannot be found and *true* has been explicitly passed, an error will be thrown and trouble signalled by both functions, or if *false* is passed, `null` will be returned by both functions.
* Enhancement: The status display now highlights errors and changed values.
* Enhancement: The expressions editor now shows the most recent sensor evaluation result for each expression.
* Enhancement: **POSSIBLE BREAKING CHANGE** As of this version, the evaluation order of expressions is explicitly sequential. Previously, the order was system-determined. By going to sequential evaluation, it is possible for variable to store the previous value of another (e.g. by the expression "OldVal=Val" preceding the expression/calculation of Val). In addition, the values stored in state variables are no longer the primary values used in evaluations. Now, the actual returned values from LuaXP are stored on the ReactorSensor state and saved between sensor updates, and across restarts and reboots (that is, they are now persistent).
* Enhancement: Condition groups are now a hierarchical construct, and group logic is user-settable (AND/OR/XOR + NOT). This adds considerable flexibility to the condition logic for users, at the expense of some complexity in the UI (implementation/operation is not significantly different).
* Enhancement: Users may now create Activities for each condition group, not just the over trip/untrip of the sensor.
* Enhancement: It is now possible to copy the contents of one activity to another.

## Version 2.5 (released)

* Hotfix-19094-01: Fix validation crash in interval condition parameter check, loses hour and minute data on edit.
* Fix: an issue allowing multiple system watches for a single variable; benign, but not perfectly efficient, and causes repetitious (and therefore confusing) event log messages [issue #26].

## Version 2.4 (released)

* Change: Embedded URLs to Vera community forums updated to new Discourse-based community.
* Fix: fix an issue with Safari 12 user not being able to edit "sustained for" time on service conditions.
* Enhancement: The response time for house mode changes has been dramatically improved (without increased polling).
* Enhancement: Reactor now uses a weak table to cache compiled Lua. This allows the system to purge the compiled fragments if the memory is needed elsewhere. This can be disabled by setting SuppressWeakLuaFunc to 1 in the Reactor master device (+reload).
* Enhancement: The restore facility can now restore a configuration to a selected ReactorSensor, rather than only to an RS with the same name; this makes it possible to copy Reactor configuration between devices. Incorporates hotfix-19044-01.
* Fix hotfix-19044-01: Restore of configuration not being written to device correctly, so restore appears to succeed, but device is unchanged.
* Fix hotfix-19040-01: Fix missing pre-init of context variable that causes later spurious error (reported on openLuup).
* Change: Remove deprecated execLua context values "reactor_device" and "reactor_ext_arg"

## Version 2.3 (released)

* Fix (hotfix19032-02): a problem where the delay type is not restoring to the UI properly when editing existing action (reported by Vpow).
* Fix (hotfix19032-01): an initial "inline" delay can lose it's time reference and go into a loop, never executing the actions (only when the delay starts the activity; also reported by Vpow).
* Fix (hotfix19029-03): Revert eventList2 back to prior order until we can properly sort out how to handle making the scene trigger list more user-friendly without disrupting existing scene triggers (which I did; reported by dJOS).
* Fix (hotfix19029-02): if the usergeofences array contained a reference to a user not in the users array of user_data, the UI would crash attempting to load (reported by Fanan).
* Fix (hotfix19029-01): fix to geofence condition so that first-time users don't have sensor crash before master device has properly populated the initial data (reported by connormacleod).

## Version 2.3 (released)

* Fix (hotfix19032-02): a problem where the delay type is not restoring to the UI properly when editing existing action (reported by Vpow).
* Fix (hotfix19032-01): an initial "inline" delay can lose it's time reference and go into a loop, never executing the actions (only when the delay starts the activity; also reported by Vpow).
* Fix (hotfix19029-03): Revert eventList2 back to prior order until we can properly sort out how to handle making the scene trigger list more user-friendly without disrupting existing scene triggers (which I did; reported by dJOS).
* Fix (hotfix19029-02): if the usergeofences array contained a reference to a user not in the users array of user_data, the UI would crash attempting to load (reported by Fanan).
* Fix (hotfix19029-01): fix to geofence condition so that first-time users don't have sensor crash before master device has properly populated the initial data (reported by connormacleod).

## Version 2.2 (released)

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
