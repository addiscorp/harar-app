import { Image } from "react-native";

// Temporary mark: the picture on the simienapp org, as simienapp/site uses it.
// Not the final logo.
export function Mark({ size = 24 }: { size?: number }) {
  return <Image source={require("../../assets/icon.png")} style={{ width: size, height: size, borderRadius: 4 }} accessibilityRole="image" accessibilityLabel="Simien" />;
}
