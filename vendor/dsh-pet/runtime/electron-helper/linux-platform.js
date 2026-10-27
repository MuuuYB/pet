// The companion moves its transparent windows continuously. Native Wayland does
// not offer the positioning/always-on-top APIs needed by this window model.
function configureLinuxWindowing(app, platform = process.platform) {
  if (platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');
}
module.exports = { configureLinuxWindowing };
