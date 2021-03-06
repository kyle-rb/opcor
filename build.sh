#!/bin/bash

# pass in the build number as an argument

# notes:
# all of these are 64 bit versions
# I haven't actually tried the Linux one yet
# 1.8.1 is the version of Electron that I'm using, I think
# I'm hoping the .ico image just works for Linux


# MACOS:
electron-packager ./ --platform=darwin --arch=x64 --app-version=$BASH_ARGV --icon=img/opcor-icon.icns --out=builds/ --overwrite --electron-version=1.8.1

# WINDOWS:
electron-packager ./ --platform=win32 --arch=x64 --app-version=$BASH_ARGV --icon=img/opcor-icon.ico --out=builds/ --overwrite --electron-version=1.8.1

# LINUX:
electron-packager ./ --platform=linux --arch-x64 --app-version=$BASH_ARGV --icon=img/opcor-icon.ico --out=builds/ --overwrite --electron-version=1.8.1
