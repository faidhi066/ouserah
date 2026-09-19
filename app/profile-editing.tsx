import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/auth-context";
import { supabase } from "../lib/supabase";
import { Profile, UserRole } from "../types/database";

export default function ProfileScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [updating, setUpdating] = useState(false);

  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [editUserModal, setEditUserModal] = useState(false);
  const [targetName, setTargetName] = useState("");
  const [targetRole, setTargetRole] = useState<UserRole>("mutarabbi");
  const [targetAvatar, setTargetAvatar] = useState("");

  const isAdmin = profile?.role === "admin";
  const isMutarabbi = profile?.role === "mutarabbi";

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setAvatarUrl(profile.avatar_url || "");
    }
    if (isAdmin) {
      loadAllProfiles();
    }
  }, [profile]);

  const loadAllProfiles = async () => {
    const { data, error } = await supabase.from("profiles").select("*");
    if (error) {
      console.error("Error loading profiles:", error.message);
    } else {
      setAllProfiles(data || []);
    }
  };

  const handleUpdateOwnProfile = async () => {
    if (!profile) return;
    setUpdating(true);

    const updates: Record<string, any> = {
      id: profile.id,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    };

    if (!isMutarabbi) {
      updates.full_name = fullName;
    }

    const { error } = await supabase.from("profiles").upsert(updates);

    setUpdating(false);

    if (error) {
      Alert.alert("Update Failed", error.message);
    } else {
      Alert.alert("Success", "Profile updated successfully.");
      await refreshProfile();
    }
  };

  const openAdminEditUser = (user: Profile) => {
    setSelectedUser(user);
    setTargetName(user.full_name);
    setTargetRole(user.role);
    setTargetAvatar(user.avatar_url || "");
    setEditUserModal(true);
  };

  const handleAdminSaveUser = async () => {
    if (!selectedUser) return;
    setUpdating(true);

    const { error } = await supabase.from("profiles").update({
      full_name: targetName,
      role: targetRole,
      avatar_url: targetAvatar,
      updated_at: new Date().toISOString(),
    }).eq("id", selectedUser.id);

    setUpdating(false);

    if (error) {
      Alert.alert("Error updating user", error.message);
    } else {
      Alert.alert("Success", `Updated profile for ${targetName}`);
      setEditUserModal(false);
      loadAllProfiles();
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.header}>Profile Settings</Text>
        <Text style={styles.roleTag}>
          Your Role: <Text style={styles.boldRole}>{profile?.role.toUpperCase()}</Text>
        </Text>

        <View style={styles.section}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            editable={!isMutarabbi}
            style={[styles.input, isMutarabbi && styles.disabledInput]}
          />
          {isMutarabbi && (
            <Text style={styles.hint}>
              Students are not permitted to edit their registered name.
            </Text>
          )}

          <Text style={styles.label}>Avatar URL</Text>
          <TextInput
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://..."
            style={styles.input}
          />

          <Pressable
            style={[styles.button, updating && styles.disabledButton]}
            onPress={handleUpdateOwnProfile}
            disabled={updating}
          >
            <Text style={styles.buttonText}>
              {updating ? "Saving..." : "Save Profile"}
            </Text>
          </Pressable>
        </View>

        {isAdmin && (
          <View style={styles.adminSection}>
            <Text style={styles.adminTitle}>Admin Panel: Manage Users</Text>
            <Text style={styles.adminSubtitle}>
              As an admin, you can edit other users' profiles and roles.
            </Text>

            {allProfiles.map((user) => (
              <Pressable
                key={user.id}
                style={styles.userCard}
                onPress={() => openAdminEditUser(user)}
              >
                <View>
                  <Text style={styles.userName}>{user.full_name}</Text>
                  <Text style={styles.userRole}>Role: {user.role}</Text>
                </View>
                <Text style={styles.editAction}>Edit →</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <Modal visible={editUserModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit User Profile</Text>

              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={targetName}
                onChangeText={setTargetName}
              />

              <Text style={styles.label}>Role</Text>
              <View style={styles.roleRow}>
                {(["mutarabbi", "murabbi", "admin"] as UserRole[]).map((r) => (
                  <Pressable
                    key={r}
                    style={[
                      styles.roleBtn,
                      targetRole === r && styles.selectedRoleBtn,
                    ]}
                    onPress={() => setTargetRole(r)}
                  >
                    <Text
                      style={[
                        styles.roleBtnText,
                        targetRole === r && styles.selectedRoleBtnText,
                      ]}
                    >
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Avatar URL</Text>
              <TextInput
                style={styles.input}
                value={targetAvatar}
                onChangeText={setTargetAvatar}
              />

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setEditUserModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveBtn} onPress={handleAdminSaveUser}>
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollView: { flex: 1, padding: 20 },
  header: { fontSize: 24, fontWeight: "bold", color: "#2d3748" },
  roleTag: { fontSize: 14, color: "#666", marginBottom: 20, marginTop: 4 },
  boldRole: { fontWeight: "bold", color: "#2b6cb0" },
  section: { marginBottom: 30 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12, color: "#2d3748" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    marginTop: 4,
    fontSize: 15,
  },
  disabledInput: { backgroundColor: "#f5f5f5", color: "#777" },
  hint: { fontSize: 12, color: "#d9534f", marginTop: 4 },
  button: {
    backgroundColor: "#2b6cb0",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  adminSection: {
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    paddingTop: 20,
    marginBottom: 30,
  },
  adminTitle: { fontSize: 18, fontWeight: "bold", color: "#2d3748" },
  adminSubtitle: { fontSize: 12, color: "#718096", marginBottom: 16 },
  userCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: "#f7fafc",
  },
  userName: { fontSize: 16, fontWeight: "600" },
  userRole: { fontSize: 12, color: "#4a5568" },
  editAction: { color: "#2b6cb0", fontWeight: "bold" },
  signOutButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e53e3e",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 40,
  },
  signOutText: { color: "#e53e3e", fontWeight: "bold", fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 12 },
  roleRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  roleBtn: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 6,
    alignItems: "center",
  },
  selectedRoleBtn: { backgroundColor: "#2b6cb0", borderColor: "#2b6cb0" },
  roleBtnText: { fontSize: 12, color: "#4a5568" },
  selectedRoleBtnText: { color: "#fff", fontWeight: "bold" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelBtnText: { color: "#718096", fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  saveBtnText: { color: "#fff", fontWeight: "bold" },
});
