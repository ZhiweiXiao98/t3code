const { AndroidConfig, withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

module.exports = function withAppLocale(config, { locale } = {}) {
  const appLocale = locale === "zh-CN" ? "zh-CN" : "en";
  config = withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults.T3AppLocale = appLocale;
    return nextConfig;
  });
  return withAndroidManifest(config, (nextConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(nextConfig.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, "T3AppLocale", appLocale);
    return nextConfig;
  });
};
