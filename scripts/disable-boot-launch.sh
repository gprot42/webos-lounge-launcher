#!/bin/sh
# Disable Lounge boot-on-start (run as root via hbchannel exec).

INITD="/var/lib/webosbrew/init.d/50-lounge-boot"
rm -f "$INITD"
echo disabled
exit 0
