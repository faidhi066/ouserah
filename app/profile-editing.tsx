import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { getInitials } from "../lib/utils";
import { Profile, UserRole } from "../types/database";

export default function ProfileScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [updating, setUpdating] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);

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

  const handlePickFromLibrary = async (isForAdminTarget = false) => {
    try {
      setPickingImage(true);
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permission Required",
          "Permission to access camera roll is required to select a profile picture.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imageUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;

        if (isForAdminTarget) {
          setTargetAvatar(imageUri);
        } else {
          setAvatarUrl(imageUri);
        }
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to pick image");
    } finally {
      setPickingImage(false);
    }
  };

  const handleTakePhoto = async (isForAdminTarget = false) => {
    try {
      setPickingImage(true);
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permission Required",
          "Permission to access camera is required to take a profile photo.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imageUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;

        if (isForAdminTarget) {
          setTargetAvatar(imageUri);
        } else {
          setAvatarUrl(imageUri);
        }
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to take photo");
    } finally {
      setPickingImage(false);
    }
  };

  const handleOpenPhotoOptions = (isForAdminTarget = false) => {
    const currentUrl = isForAdminTarget ? targetAvatar : avatarUrl;
    Alert.alert(
      "Profile Photo",
      "Upload a profile picture or remove it to use your initial.",
      [
        {
          text: "Choose from Library",
          onPress: () => handlePickFromLibrary(isForAdminTarget),
        },
        {
          text: "Take Photo",
          onPress: () => handleTakePhoto(isForAdminTarget),
        },
        ...(currentUrl
          ? [
              {
                text: "Remove Photo (Use Initial)",
                style: "destructive" as const,
                onPress: () => {
                  if (isForAdminTarget) {
                    setTargetAvatar("");
                  } else {
                    setAvatarUrl("");
                  }
                },
              },
            ]
          : []),
        {
          text: "Cancel",
          style: "cancel" as const,
        },
      ],
    );
  };

  const handleUpdateOwnProfile = async () => {
    if (!profile) return;
    setUpdating(true);

    const updates: Record<string, any> = {
      id: profile.id,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    };

    if (!isMutarabbi) {
      updates.full_name = fullName;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", profile.id);

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

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: targetName,
        role: targetRole,
        avatar_url: targetAvatar || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedUser.id);

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
          Your Role:{" "}
          <Text style={styles.boldRole}>{profile?.role.toUpperCase()}</Text>
        </Text>

        <View style={styles.section}>
          {/* Avatar / Profile Picture Section */}
          <View style={styles.avatarCard}>
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarInitialBox}>
                  <Text style={styles.avatarInitialText}>
                    {getInitials(fullName)}
                  </Text>
                </View>
              )}
              {pickingImage && (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}
            </View>

            <View style={styles.avatarActions}>
              <Pressable
                style={styles.changePhotoBtn}
                onPress={() => handleOpenPhotoOptions(false)}
                disabled={pickingImage || updating}
              >
                <Text style={styles.changePhotoBtnText}>
                  {avatarUrl ? "📷 Change Photo" : "📷 Upload Photo"}
                </Text>
              </Pressable>

              {avatarUrl ? (
                <Pressable
                  style={styles.removePhotoBtn}
                  onPress={() => setAvatarUrl("")}
                  disabled={pickingImage || updating}
                >
                  <Text style={styles.removePhotoBtnText}>Remove Photo</Text>
                </Pressable>
              ) : (
                <Text style={styles.avatarHintText}>
                  Default: Initial ({getInitials(fullName)})
                </Text>
              )}
            </View>
          </View>

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

          <Pressable
            style={[
              styles.button,
              (updating || pickingImage) && styles.disabledButton,
            ]}
            onPress={handleUpdateOwnProfile}
            disabled={updating || pickingImage}
          >
            {updating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Save Profile</Text>
            )}
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
                <View style={styles.userCardLeft}>
                  {user.avatar_url ? (
                    <Image
                      source={{ uri: user.avatar_url }}
                      style={styles.userCardAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.userCardInitialBox}>
                      <Text style={styles.userCardInitialText}>
                        {getInitials(user.full_name)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.userCardInfo}>
                    <Text style={styles.userName}>{user.full_name}</Text>
                    <Text style={styles.userRole}>Role: {user.role}</Text>
                  </View>
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

              {/* Admin target user avatar preview and change */}
              <View style={styles.modalAvatarCard}>
                <View style={styles.modalAvatarWrapper}>
                  {targetAvatar ? (
                    <Image
                      source={{ uri: targetAvatar }}
                      style={styles.modalAvatarImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.modalAvatarInitialBox}>
                      <Text style={styles.modalAvatarInitialText}>
                        {getInitials(targetName)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.modalAvatarActions}>
                  <Pressable
                    style={styles.modalUploadBtn}
                    onPress={() => handleOpenPhotoOptions(true)}
                  >
                    <Text style={styles.modalUploadBtnText}>
                      {targetAvatar ? "Change Photo" : "Upload Photo"}
                    </Text>
                  </Pressable>
                  {targetAvatar ? (
                    <Pressable
                      style={styles.modalRemoveBtn}
                      onPress={() => setTargetAvatar("")}
                    >
                      <Text style={styles.modalRemoveBtnText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

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

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setEditUserModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.saveBtn}
                  onPress={handleAdminSaveUser}
                >
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

  // Avatar Section
  avatarCard: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "#f7fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
  },
  avatarWrapper: {
    position: "relative",
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: "#edf2f7",
    borderWidth: 3,
    borderColor: "#2b6cb0",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 48,
  },
  avatarInitialBox: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2b6cb0",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitialText: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "bold",
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarActions: {
    alignItems: "center",
    marginTop: 14,
    gap: 8,
  },
  changePhotoBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: "#2b6cb0",
    borderRadius: 20,
  },
  changePhotoBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  removePhotoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  removePhotoBtnText: {
    color: "#e53e3e",
    fontSize: 12,
    fontWeight: "600",
  },
  avatarHintText: {
    fontSize: 12,
    color: "#718096",
    fontStyle: "italic",
  },

  label: { fontSize: 14, fontWeight: "600", marginTop: 12, color: "#2d3748" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginTop: 6,
    backgroundColor: "#fff",
  },
  disabledInput: { backgroundColor: "#edf2f7", color: "#718096" },
  hint: { fontSize: 12, color: "#e53e3e", marginTop: 4 },
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
    marginBottom: 20,
  },
  adminTitle: { fontSize: 18, fontWeight: "bold", color: "#2d3748" },
  adminSubtitle: { fontSize: 12, color: "#718096", marginBottom: 16 },

  // User list cards
  userCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: "#f7fafc",
  },
  userCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  userCardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  userCardInitialBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2b6cb0",
    justifyContent: "center",
    alignItems: "center",
  },
  userCardInitialText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18,
  },
  userCardInfo: {
    justifyContent: "center",
  },
  userName: { fontSize: 15, fontWeight: "600", color: "#2d3748" },
  userRole: { fontSize: 12, color: "#718096", textTransform: "capitalize" },
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

  // Modal styles
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#2d3748",
  },

  modalAvatarCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 12,
    backgroundColor: "#f7fafc",
    borderRadius: 8,
    marginBottom: 12,
  },
  modalAvatarWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
  },
  modalAvatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  modalAvatarInitialBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#2b6cb0",
    justifyContent: "center",
    alignItems: "center",
  },
  modalAvatarInitialText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
  },
  modalAvatarActions: {
    flex: 1,
    gap: 6,
  },
  modalUploadBtn: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  modalUploadBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  modalRemoveBtn: {
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  modalRemoveBtnText: {
    color: "#e53e3e",
    fontSize: 11,
    fontWeight: "600",
  },

  roleRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  roleBtn: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 6,
    alignItems: "center",
  },
  selectedRoleBtn: { backgroundColor: "#2b6cb0", borderColor: "#2b6cb0" },
  roleBtnText: { textTransform: "capitalize", color: "#4a5568" },
  selectedRoleBtnText: { color: "#fff", fontWeight: "bold" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: { padding: 10 },
  cancelBtnText: { color: "#718096" },
  saveBtn: { backgroundColor: "#2b6cb0", padding: 10, borderRadius: 6 },
  saveBtnText: { color: "#fff", fontWeight: "bold" },
});
