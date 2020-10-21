#!/bin/sh
# Copyright (C) 2020 Patrick H. Rigney, All Rights Reserved

LOGFILE=/proc/self/fd/1
CONF=
DEFAULT_SERVERS=8.8.8.8,8.8.4.4,1.1.1.1,www.facebook.com,www.google.com,www.amazon.com

while getopts "c:L:" opt; do
	case "${opt}" in
		c) CONF=${OPTARG}
		   ;;
		L) LOGFILE=${OPTARG}
		   ;;
		:) echo "Error: ${opt} requires an argument"
		   exit 255
		   ;;
		*) echo "Error: invalid option -${opt}"
		   exit 255
		   ;;
	esac
done

sleep=60
newstate=""
lastn=1

check_target() {
	echo "Check #${n}: $1..."
	if ping -q -c 3 -W 3 $1; then
		newstate=1
	else
		newstate=0
	fi
}

attempt() {
	n=0
	while [ $n -lt 3 ]; do
		target=$(echo $SERVERS | cut -d ',' -f $lastn)
		if [ -z "$target" ]; then
			lastn=1
		else
			n=$((n+1))
			lastn=$((lastn+1))
			check_target $target
			if [ "$newstate" -eq "1" ]; then
				return
			fi
		fi
	done
	echo "$n targets failed"
	newstate=0
}

check() {
	echo "Checking Internet at $(date)..."
	echo "Server list is ${SERVERS}; next is ${lastn}"
	sleep=60
	attempt
	echo "Updating Reactor state to $newstate"
	if curl -s -o /dev/null -m 15 'http://127.0.0.1:3480/data_request?id=lr_Reactor&action=internet&state='$newstate ; then
		[ "$newstate" == "1" ] && sleep=$INTERVAL # longer sleep
		echo "Successfully updated Reactor; next attempt in ${sleep}s"
	else
		echo "Reactor update failed; luup busy? (will retry) in ${sleep}s"
	fi
}

while [ ! -f /var/run/reactor_internet_check.stop ]; do
	[ -f "${CONF:=/etc/cmh-ludl/reactor_internet_check.conf}" ] && source "$CONF"
	SERVERS="${SERVERS:-$DEFAULT_SERVERS}"
	INTERVAL=${INTERVAL:-300}
	check 2>&1 >$LOGFILE
	sleep $sleep
done
exit 0
