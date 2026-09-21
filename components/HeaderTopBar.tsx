import { useAuth } from "@/context/auth-context";
import { getInitials } from "@/lib/utils";
import { Group } from "@/types/database";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function HeaderTopBar() {
  const { profile, groups, activeGroup, setActiveGroup, createGroup } =
    useAuth();
  const router = useRouter();

  const [groupDropdownVisible, setGroupDropdownVisible] = useState(false);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingLoading, setCreatingLoading] = useState(false);

  const canSwitchGroup =
    profile?.role === "admin" || profile?.role === "murabbi";

  const handleSelectGroup = (group: Group) => {
    setActiveGroup(group);
    setGroupDropdownVisible(false);
    setIsCreatingGroup(false);
    setNewGroupName("");
  };

  const handleCreateGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Please enter a valid Usrah group name.");
      return;
    }

    try {
      setCreatingLoading(true);
      const newGroup = await createGroup(trimmed);
      setCreatingLoading(false);

      if (newGroup) {
        setNewGroupName("");
        setIsCreatingGroup(false);
        setGroupDropdownVisible(false);
        Alert.alert(
          "Usrah Group Created",
          `Created "${newGroup.name}" and switched to this Usrah group.`
        );
      }
    } catch (err: any) {
      setCreatingLoading(false);
      Alert.alert(
        "Error",
        err?.message || "Failed to create new Usrah group. Please try again."
      );
    }
  };

  const handleCloseDropdown = () => {
    setGroupDropdownVisible(false);
    setIsCreatingGroup(false);
    setNewGroupName("");
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.container}>
        {/* Usrah Group Selector */}
        <Pressable
          style={styles.groupSelector}
          onPress={() => {
            if (canSwitchGroup || groups.length > 0) {
              setGroupDropdownVisible(true);
            }
          }}
          disabled={!canSwitchGroup && groups.length === 0}
        >
          <Text style={styles.groupIcon}>👥</Text>
          <View>
            <Text style={styles.groupSubText}>Current Usrah</Text>
            <View style={styles.groupNameRow}>
              <Text style={styles.groupNameText}>
                {activeGroup ? activeGroup.name : "No Usrah Assigned"}
              </Text>
              {(canSwitchGroup || groups.length > 0) && (
                <Text style={styles.dropdownArrow}> ▾</Text>
              )}
            </View>
          </View>
        </Pressable>

        {/* Right Controls: Notifications & Profile */}
        <View style={styles.rightControls}>
          {/* Notification Button */}
          <Pressable
            style={styles.iconButton}
            onPress={() => setNotificationVisible(true)}
          >
            <Text style={styles.iconText}>🔔</Text>
            <View style={styles.notificationBadgeDot} />
          </Pressable>

          {/* Profile Button */}
          <Pressable
            style={styles.profileButton}
            onPress={() => router.push("/profile-editing")}
          >
            {profile?.avatar_url?.trim() ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.profileAvatarImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.profileInitialsBox}>
                <Text style={styles.profileInitialsText}>
                  {getInitials(profile?.full_name)}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Group Selector Dropdown Modal */}
        <Modal
          visible={groupDropdownVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCloseDropdown}
        >
          <Pressable style={styles.modalOverlay} onPress={handleCloseDropdown}>
            <Pressable
              style={styles.dropdownCard}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.dropdownTitle}>
                {isCreatingGroup ? "Create New Usrah" : "Select Usrah Group"}
              </Text>

              {!isCreatingGroup ? (
                <>
                  {groups.length === 0 ? (
                    <Text style={styles.emptyGroupsText}>
                      No Usrah groups available yet.
                    </Text>
                  ) : (
                    groups.map((group) => {
                      const isSelected = activeGroup?.id === group.id;
                      return (
                        <Pressable
                          key={group.id}
                          style={[
                            styles.groupOptionItem,
                            isSelected && styles.selectedGroupItem,
                          ]}
                          onPress={() => handleSelectGroup(group)}
                        >
                          <Text
                            style={[
                              styles.groupOptionText,
                              isSelected && styles.selectedGroupText,
                            ]}
                          >
                            {group.name}
                          </Text>
                          {isSelected && <Text style={styles.checkMark}>✓</Text>}
                        </Pressable>
                      );
                    })
                  )}

                  {canSwitchGroup && (
                    <Pressable
                      style={styles.addGroupBtn}
                      onPress={() => setIsCreatingGroup(true)}
                    >
                      <Text style={styles.addGroupBtnIcon}>＋</Text>
                      <Text style={styles.addGroupBtnText}>
                        Create New Usrah Group
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <View style={styles.createGroupForm}>
                  <Text style={styles.inputLabel}>Usrah Name</Text>
                  <TextInput
                    style={styles.groupInput}
                    placeholder="e.g. Usrah Al-Fatih"
                    placeholderTextColor="#a0aec0"
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                    autoFocus
                  />
                  <View style={styles.createGroupActions}>
                    <Pressable
                      style={styles.cancelCreateBtn}
                      onPress={() => {
                        setIsCreatingGroup(false);
                        setNewGroupName("");
                      }}
                      disabled={creatingLoading}
                    >
                      <Text style={styles.cancelCreateText}>Cancel</Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.submitCreateBtn,
                        creatingLoading && styles.disabledBtn,
                      ]}
                      onPress={handleCreateGroup}
                      disabled={creatingLoading}
                    >
                      {creatingLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitCreateText}>
                          Create & Switch
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Notification Modal */}
        <Modal
          visible={notificationVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setNotificationVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setNotificationVisible(false)}
          >
            <View style={styles.notificationCard}>
              <Text style={styles.notificationTitle}>Notifications</Text>
              <View style={styles.notificationItem}>
                <Text style={styles.notifHeader}>Welcome to Ouserah!</Text>
                <Text style={styles.notifBody}>
                  Track daily mutabaah, check weekly attendance, and complete
                  assignments.
                </Text>
              </View>
              <Pressable
                style={styles.closeNotifBtn}
                onPress={() => setNotificationVisible(false)}
              >
                <Text style={styles.closeNotifText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#edf2f7",
  },
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  groupSelector: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupIcon: { fontSize: 20 },
  groupSubText: {
    fontSize: 10,
    color: "#718096",
    textTransform: "uppercase",
    fontWeight: "700",
  },
  groupNameRow: { flexDirection: "row", alignItems: "center" },
  groupNameText: { fontSize: 16, fontWeight: "bold", color: "#2d3748" },
  dropdownArrow: { fontSize: 14, color: "#2b6cb0", fontWeight: "bold" },
  rightControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f7fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  iconText: { fontSize: 16 },
  notificationBadgeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e53e3e",
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
  },
  profileAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarText: { fontSize: 24, textAlign: "center" },
  profileInitialsBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2b6cb0",
    justifyContent: "center",
    alignItems: "center",
  },
  profileInitialsText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  dropdownCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#2d3748",
  },
  groupOptionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  selectedGroupItem: { backgroundColor: "#ebf8ff" },
  groupOptionText: { fontSize: 15, color: "#2d3748" },
  selectedGroupText: { fontWeight: "bold", color: "#2b6cb0" },
  checkMark: { color: "#2b6cb0", fontWeight: "bold" },
  emptyGroupsText: {
    fontSize: 14,
    color: "#718096",
    marginVertical: 8,
    fontStyle: "italic",
  },
  addGroupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#edf2f7",
  },
  addGroupBtnIcon: { fontSize: 16, color: "#2b6cb0", fontWeight: "bold" },
  addGroupBtnText: { fontSize: 14, color: "#2b6cb0", fontWeight: "600" },
  createGroupForm: { marginTop: 4, gap: 10 },
  inputLabel: { fontSize: 12, fontWeight: "600", color: "#4a5568" },
  groupInput: {
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#2d3748",
  },
  createGroupActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  cancelCreateBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  cancelCreateText: { color: "#718096", fontWeight: "600" },
  submitCreateBtn: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    minWidth: 120,
    alignItems: "center",
  },
  disabledBtn: { opacity: 0.6 },
  submitCreateText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  notificationCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
  },
  notificationTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 14,
    color: "#2d3748",
  },
  notificationItem: {
    backgroundColor: "#f7fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  notifHeader: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#2b6cb0",
    marginBottom: 2,
  },
  notifBody: { fontSize: 13, color: "#4a5568", lineHeight: 18 },
  closeNotifBtn: {
    alignSelf: "flex-end",
    backgroundColor: "#2b6cb0",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  closeNotifText: { color: "#fff", fontWeight: "bold" },
});
