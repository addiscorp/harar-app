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
    appleTeamId: "6LV9UQMTRU",
    infoPlist: {
      NSFaceIDUsageDescription: "Simien asks for Face ID before it approves anything for your machines.",
      // Machines are found and spoken to on the local network only.
      NSLocalNetworkUsageDescription: "Simien finds and talks to your machines on this network, never through the internet.",
      NSBonjourServices: ["_simien._tcp"],
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      // The app's only encryption is the OS's (CryptoKit, in the enclave
      // module); its JavaScript signs, verifies and MACs, and never encrypts.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  icon: "./assets/icon.png",
  web: { bundler: "metro", output: "single", name: "Simien", favicon: "./assets/icon.png" },
  plugins: ["expo-router", "expo-font", "expo-secure-store", "./plugins/pods-deployment-target"],
};

export default config;
