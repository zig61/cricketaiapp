import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { APP_NAME, TAGLINE } from "../src/lib/constants";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.tagline}>{TAGLINE}</Text>
      <Text style={styles.note}>The app is in development.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
    paddingHorizontal: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
  },
  tagline: {
    fontSize: 16,
    color: "#52525b",
    textAlign: "center",
  },
  note: {
    fontSize: 13,
    color: "#a1a1aa",
    marginTop: 16,
  },
});
