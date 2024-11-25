# Rumo App Dev

This extension is needed for programming apps in TypeScript. It will upload the compiled JavaScript to the remote server via SFTP.

## Features

- Automatically upload JavaScript files to a remote server via SFTP.
- Watch for changes in the `build/type` directory and upload modified files.
- Manually upload all JavaScript files using a command.

## Commands

- `RumoAppDev:Upload All JavaScript Files`: Upload all JavaScript files in the `build/type` directory to the remote server.

## Configuration

This extension requires the SFTP extension. The configuration from the SFTP extension will be used.

