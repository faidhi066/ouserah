import { useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { UserRole } from "../../types/database";

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("mutarabbi");
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in both email and password.");
      return;
    }

    setLoading(true);
    if (isSignUp) {
      if (!fullName) {
        Alert.alert("Error", "Please enter your full name.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          },
        },
      });

      setLoading(false);
      if (error) {
        Alert.alert("Sign Up Error", error.message);
      } else {
        Alert.alert(
          "Success",
          "Account created! If email confirmation is enabled, please check your inbox.",
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      setLoading(false);
      if (error) {
        Alert.alert("Login Error", error.message);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Ouserah</Text>
        <Text style={styles.subtitle}>
          {isSignUp ? "Create a new account" : "Sign in to continue"}
        </Text>

        {isSignUp && (
          <>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Ahmad Bin Ali"
              value={fullName}
              onChangeText={setFullName}
            />

            <Text style={styles.label}>Role</Text>
            <View style={styles.roleContainer}>
              {(["mutarabbi", "murabbi", "admin"] as UserRole[]).map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.roleChip,
                    role === r && styles.selectedRoleChip,
                  ]}
                  onPress={() => setRole(r)}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      role === r && styles.selectedRoleChipText,
                    ]}
                  >
                    {r.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={[styles.button, loading && styles.disabledButton]}
          onPress={handleAuth}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Sign In"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.toggleContainer}
          onPress={() => setIsSignUp(!isSignUp)}
        >
          <Text style={styles.toggleText}>
            {isSignUp
              ? "Already have an account? Sign In"
              : "Don't have an account? Sign Up"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1a365d",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#718096",
    textAlign: "center",
    marginBottom: 28,
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2d3748",
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  roleContainer: { flexDirection: "row", gap: 8, marginTop: 4 },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#edf2f7",
  },
  selectedRoleChip: { backgroundColor: "#2b6cb0", borderColor: "#2b6cb0" },
  roleChipText: { fontSize: 12, fontWeight: "700", color: "#4a5568" },
  selectedRoleChipText: { color: "#fff" },
  button: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
  },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  toggleContainer: { marginTop: 16, alignItems: "center" },
  toggleText: { color: "#2b6cb0", fontSize: 14, fontWeight: "600" },
});
