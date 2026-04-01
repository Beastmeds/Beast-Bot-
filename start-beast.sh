#!/usr/bin/env bash
# Wrapper to provide a single '1' input to BeastBot.js so PM2 doesn't require interactive input.
# PM2 will execute this script; it pipes '1' into the Node process and replaces the shell with node (exec).
exec printf "a\n" | node "$(dirname "$0")/start.js"
