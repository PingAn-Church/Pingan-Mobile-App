const { withAndroidManifest } = require("expo/config-plugins");

const WRITE_EXTERNAL_STORAGE = "android.permission.WRITE_EXTERNAL_STORAGE";

/**
 * Keeps legacy gallery writes available only where Android still requires the
 * runtime permission. Media selection itself uses the permissionless system
 * Photo Picker and does not depend on this permission.
 */
module.exports = function withAndroidMediaPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const permissions = manifest["uses-permission"] ?? [];
    let writePermission = permissions.find(
      (permission) => permission?.$?.["android:name"] === WRITE_EXTERNAL_STORAGE
    );

    if (!writePermission) {
      writePermission = { $: { "android:name": WRITE_EXTERNAL_STORAGE } };
      permissions.push(writePermission);
    }

    writePermission.$["android:maxSdkVersion"] = "29";
    writePermission.$["tools:replace"] = "android:maxSdkVersion";
    manifest["uses-permission"] = permissions;

    return cfg;
  });
};
