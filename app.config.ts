import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Simien",
  slug: "simien",
  version: "0.1.0",
  scheme: "simien",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "gg.addis.simien",
    infoPlist: {
      NSFaceIDUsageDescription: "Simien asks for Face ID before it approves anything for your machines.",
      // Machines are found and spoken to on the local network only.
      NSLocalNetworkUsageDescription: "Simien finds and talks to your machines on this network, never through the internet.",
      NSBonjourServices: ["_simien._tcp"],
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  icon: "./assets/favicon.png",
  web: { bundler: "metro", output: "single", name: "Simien", favicon: "./assets/favicon.png" },
  plugins: ["expo-router", "expo-font", "expo-secure-store", "./plugins/pods-deployment-target"],
};

export default config;
