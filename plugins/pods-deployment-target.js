// Xcode 27 builds nothing for iOS older than 15; some pods still declare 12.4
// (react-native-svg's RNSVGFilters). Raise every pod's target to the floor.
const { withPodfile } = require("expo/config-plugins");

const FLOOR = "15.1";
const MARK = "# simien: pods deployment target floor";

module.exports = function withPodsDeploymentTarget(config) {
  return withPodfile(config, (c) => {
    if (c.modResults.contents.includes(MARK)) return c;
    c.modResults.contents = c.modResults.contents.replace(
      /post_install do \|installer\|\n/,
      (m) =>
        `${m}    ${MARK}\n` +
        `    installer.pods_project.targets.each do |t|\n` +
        `      t.build_configurations.each do |bc|\n` +
        `        if bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${FLOOR}\n` +
        `          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${FLOOR}'\n` +
        `        end\n` +
        `      end\n` +
        `    end\n`,
    );
    if (!c.modResults.contents.includes(MARK)) throw new Error("pods-deployment-target: no post_install block in the Podfile");
    return c;
  });
};
