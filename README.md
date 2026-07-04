# webOS Lounge Launcher

A fullscreen home screen for rooted LG webOS TVs. Pick an app, switch inputs, and enjoy ambient background music — without the stock launcher clutter.

![Lounge Launcher on an LG TV](docs/screenshots/screengrab1.jpg)

## Features

- App grid with pinned streaming apps
- HDMI and TV input shortcuts with custom labels
- Scenic backgrounds and built-in ambient music
- Clock, volume controls, and settings panel
- Remote-friendly navigation

## Compatibility

Tested and working on the LG OLED55C56LB running webOS 25.

## Install

Requires a rooted LG TV with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) and SSH enabled.

```bash
npm install
./install2tvfrommacos.sh
```

Set your TV's IP if needed:

```bash
TV_IP=192.168.0.79 ./install2tvfrommacos.sh
```

Or build manually:

```bash
npm run pack
ares-install --device webos dist/*.ipk
```

## License

MIT