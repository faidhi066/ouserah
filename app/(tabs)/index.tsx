import { useAuth } from "@/context/auth-context";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  const { profile } = useAuth();

  const roleTitle = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : "User";

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.headerCard}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.nameText}>{profile?.full_name || "Student"}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{roleTitle}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick Access</Text>

        <View style={styles.gridContainer}>
          <Link href="/(tabs)/daily-tracker" asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardIcon}>📋</Text>
              <Text style={styles.cardTitle}>Daily Tracker</Text>
              <Text style={styles.cardDesc}>
                {profile?.role === "mutarabbi"
                  ? "Check off daily mutabaah"
                  : "Manage daily activity list"}
              </Text>
            </Pressable>
          </Link>

          <Link href="/(tabs)/attendance" asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardIcon}>📅</Text>
              <Text style={styles.cardTitle}>Attendance</Text>
              <Text style={styles.cardDesc}>
                {profile?.role === "mutarabbi"
                  ? "View attendance history"
                  : "Key in weekly attendance"}
              </Text>
            </Pressable>
          </Link>

          <Link href="/(tabs)/assignments" asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardIcon}>📝</Text>
              <Text style={styles.cardTitle}>Assignments</Text>
              <Text style={styles.cardDesc}>
                {profile?.role === "mutarabbi"
                  ? "Submit pending tasks"
                  : "Create & view assignments"}
              </Text>
            </Pressable>
          </Link>

          <Link href="/(tabs)/profile" asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardIcon}>👤</Text>
              <Text style={styles.cardTitle}>Profile Settings</Text>
              <Text style={styles.cardDesc}>
                {profile?.role === "admin"
                  ? "Edit user profiles & roles"
                  : "Update profile information"}
              </Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>About Ouserah</Text>
          <Text style={styles.infoText}>
            Ouserah caters for student mutabaah tracking, attendance management,
            and assignment submissions across Admin, Murabbi, and Mutarabbi
            roles.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  scrollView: { flex: 1, padding: 16 },
  headerCard: {
    backgroundColor: "#2b6cb0",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  welcomeText: { color: "#e2e8f0", fontSize: 14 },
  nameText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginVertical: 4,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  roleText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2d3748",
    marginBottom: 12,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  card: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardIcon: { fontSize: 28, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#2d3748" },
  cardDesc: { fontSize: 12, color: "#718096", marginTop: 4 },
  infoBox: {
    backgroundColor: "#ebf8ff",
    borderWidth: 1,
    borderColor: "#bee3f8",
    borderRadius: 10,
    padding: 16,
    marginBottom: 30,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2b6cb0",
    marginBottom: 4,
  },
  infoText: { fontSize: 13, color: "#2c5282", lineHeight: 18 },
});
