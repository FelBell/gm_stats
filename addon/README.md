# TTT Stats Addon

A Garry's Mod Lua addon that collects TTT round statistics and sends them to a REST API.

## Installation

1. Copy the contents of this folder (`lua/`) to your server's `garrysmod/addons/ttt_stats/` directory.

## Configuration

Add the following lines to your `server.cfg`:

```cfg
ttt_stats_api_url "http://<YOUR_API_IP>:5000/api/collect"
ttt_stats_api_key "your_secret_key"
ttt_stats_server_id "my_ttt_server_1"
```

## Features

- Tracks Round Winner, Duration, Map.
- Tracks Kills (Attacker, Victim, Roles, Weapon, Headshot).
- Sends data via HTTP POST at end of round.
