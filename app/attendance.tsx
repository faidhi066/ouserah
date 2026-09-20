import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/auth-context";
import { supabase } from "../lib/supabase";
import { AttendanceRecord, Profile } from "../types/database";

interface AttendanceItem {
  mutarabbi: Profile;
  isPresent: boolean;
  notes?: string;
}

export default function AttendanceScreen() {
  const { profile, activeGroup } = useAuth();
  const [students, setStudents] = useState<AttendanceItem[]>([]);
  const [myHistory, setMyHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());

  // Add Mutarabbi Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [unassignedMutarabbis, setUnassignedMutarabbis] = useState<Profile[]>([]);
  const [newMutarabbiName, setNewMutarabbiName] = useState("");
  const [newMutarabbiJoinDate, setNewMutarabbiJoinDate] = useState(todayStr);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);

  const isMurabbiOrAdmin =
    profile?.role === "murabbi" || profile?.role === "admin";

  useEffect(() => {
    if (isMurabbiOrAdmin) {
      loadGroupMembers();
    } else if (profile?.role === "mutarabbi") {
      loadMutarabbiHistory();
    }
  }, [profile, activeGroup, selectedDate]);

  const loadGroupMembers = async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").eq("role", "mutarabbi");

    const targetGroupId = activeGroup?.id || profile?.group_id;
    if (targetGroupId) {
      query = query.eq("group_id", targetGroupId);
    }

    const { data: members, error } = await query;

    if (error) {
      Alert.alert("Error fetching members", error.message);
      setLoading(false);
      return;
    }

    // Filter members by join date (created_at): hide mutarabbi if session date is prior to their join date
    const validMembers = (members || []).filter((m: Profile) => {
      if (!m.created_at) return true;
      const joinDate = m.created_at.split("T")[0];
      return joinDate <= selectedDate;
    });

    const { data: attendance } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("session_date", selectedDate);

    const initialMap = validMembers.map((m: Profile) => {
      const record = attendance?.find((a) => a.mutarabbi_id === m.id);
      return {
        mutarabbi: m,
        isPresent: record ? record.is_present : false,
        notes: record ? record.notes || "" : "",
      };
    });

    setStudents(initialMap);
    setLoading(false);
  };

  const loadMutarabbiHistory = async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("mutarabbi_id", profile.id)
      .order("session_date", { ascending: false });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setMyHistory(data || []);
    }
    setLoading(false);
  };

  const openAddMutarabbiModal = async () => {
    // Fetch unassigned or other group Mutarabbi profiles to add
    const targetGroupId = activeGroup?.id || profile?.group_id;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "mutarabbi");

    if (data) {
      const unassigned = data.filter((p: Profile) => p.group_id !== targetGroupId);
      setUnassignedMutarabbis(unassigned);
    }
    setNewMutarabbiName("");
    setNewMutarabbiJoinDate(selectedDate);
    setSelectedExistingId(null);
    setShowAddModal(true);
  };

  const handleAddExistingMutarabbi = async (mutarabbiId: string) => {
    const targetGroupId = activeGroup?.id || profile?.group_id;
    if (!targetGroupId) {
      Alert.alert("Error", "No active group selected.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ group_id: targetGroupId, updated_at: new Date().toISOString() })
      .eq("id", mutarabbiId);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", "Mutarabbi added to group.");
      setShowAddModal(false);
      loadGroupMembers();
    }
  };

  const handleCreateNewMutarabbi = async () => {
    if (!newMutarabbiName.trim()) {
      Alert.alert("Validation", "Please enter Mutarabbi full name.");
      return;
    }
    const targetGroupId = activeGroup?.id || profile?.group_id;

    const generateUUID = () => {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    // Create a new Mutarabbi profile entry
    const newId = generateUUID();
    const joinIso = new Date(newMutarabbiJoinDate).toISOString();

    const { error } = await supabase.from("profiles").insert({
      id: newId,
      full_name: newMutarabbiName.trim(),
      role: "mutarabbi",
      group_id: targetGroupId,
      created_at: joinIso,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", `Created and added ${newMutarabbiName.trim()} to group.`);
      setShowAddModal(false);
      loadGroupMembers();
    }
  };

  const toggleAttendance = (index: number) => {
    const updated = [...students];
    updated[index].isPresent = !updated[index].isPresent;
    setStudents(updated);
  };

  const updateNotes = (index: number, text: string) => {
    const updated = [...students];
    updated[index].notes = text;
    setStudents(updated);
  };

  const saveAttendance = async () => {
    if (!profile) return;
    if (students.length === 0) {
      Alert.alert("Info", "No students to record attendance for.");
      return;
    }
    setLoading(true);

    const payload = students.map((item) => ({
      mutarabbi_id: item.mutarabbi.id,
      group_id: activeGroup?.id || item.mutarabbi.group_id || profile.group_id,
      marked_by: profile.id,
      session_date: selectedDate,
      is_present: item.isPresent,
      notes: item.notes || null,
    }));

    const { error } = await supabase
      .from("attendance_records")
      .upsert(payload, { onConflict: "mutarabbi_id,session_date" });

    setLoading(false);
    if (error) {
      Alert.alert("Save Failed", error.message);
    } else {
      Alert.alert("Success", `Attendance recorded for ${selectedDate}`);
    }
  };

  const changeWeek = (daysOffset: number) => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + daysOffset);
    setSelectedDate(cur.toISOString().split("T")[0]);
  };

  const renderCalendarDays = () => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`blank-${i}`} style={styles.calendarDayEmpty} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, "0");
      const dayStr = String(d).padStart(2, "0");
      const fullDate = `${year}-${monthStr}-${dayStr}`;
      const isSelected = fullDate === selectedDate;
      const isToday = fullDate === todayStr;

      days.push(
        <Pressable
          key={fullDate}
          style={[
            styles.calendarDay,
            isSelected && styles.calendarDaySelected,
            isToday && !isSelected && styles.calendarDayToday,
          ]}
          onPress={() => {
            setSelectedDate(fullDate);
            setShowCalendarModal(false);
          }}
        >
          <Text
            style={[
              styles.calendarDayText,
              isSelected && styles.calendarDayTextSelected,
              isToday && !isSelected && styles.calendarDayTextToday,
            ]}
          >
            {d}
          </Text>
        </Pressable>
      );
    }

    return days;
  };

  const changeCalendarMonth = (offset: number) => {
    const next = new Date(
      currentCalendarMonth.getFullYear(),
      currentCalendarMonth.getMonth() + offset,
      1
    );
    setCurrentCalendarMonth(next);
  };

  if (!isMurabbiOrAdmin) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>My Attendance History</Text>
        <FlatList
          data={myHistory}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={loadMutarabbiHistory}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View>
                <Text style={styles.name}>{item.session_date}</Text>
                {item.notes && (
                  <Text style={styles.notesText}>{item.notes}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.statusBadge,
                  item.is_present ? styles.presentBadge : styles.absentBadge,
                ]}
              >
                {item.is_present ? "PRESENT" : "ABSENT"}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No attendance records found.</Text>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Mark Attendance</Text>

      <View style={styles.dateBannerCard}>
        <Text style={styles.dateLabel}>Session Date:</Text>
        
        <Pressable
          style={styles.calendarPickerBtn}
          onPress={() => setShowCalendarModal(true)}
        >
          <Text style={styles.calendarPickerIcon}>📅</Text>
          <Text style={styles.calendarPickerText}>{selectedDate}</Text>
          <Text style={styles.calendarPickerHint}>Tap to change</Text>
        </Pressable>

        <View style={styles.quickNavRow}>
          <Pressable
            style={styles.quickNavBtn}
            onPress={() => changeWeek(-7)}
          >
            <Text style={styles.quickNavText}>‹ Prev Week</Text>
          </Pressable>
          <Pressable
            style={styles.quickNavBtnToday}
            onPress={() => setSelectedDate(todayStr)}
          >
            <Text style={styles.quickNavTextToday}>Today</Text>
          </Pressable>
          <Pressable
            style={styles.quickNavBtn}
            onPress={() => changeWeek(7)}
          >
            <Text style={styles.quickNavText}>Next Week ›</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={students}
        keyExtractor={(item) => item.mutarabbi.id}
        refreshing={loading}
        onRefresh={loadGroupMembers}
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{item.mutarabbi.full_name}</Text>
                {item.mutarabbi.created_at && (
                  <Text style={styles.joinDateSubText}>
                    Joined: {item.mutarabbi.created_at.split("T")[0]}
                  </Text>
                )}
              </View>
              <Switch
                value={item.isPresent}
                onValueChange={() => toggleAttendance(index)}
              />
            </View>
            <TextInput
              style={styles.notesInput}
              placeholder="Add optional notes..."
              value={item.notes}
              onChangeText={(text) => updateNotes(index, text)}
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No mutarabbi members found for {selectedDate}.
          </Text>
        }
        ListFooterComponent={
          <Pressable
            style={styles.addMutarabbiBtn}
            onPress={openAddMutarabbiModal}
          >
            <Text style={styles.addMutarabbiBtnText}>+ Add Mutarabbi to Group</Text>
          </Pressable>
        }
      />

      <Pressable
        style={[styles.button, loading && styles.disabledButton]}
        onPress={saveAttendance}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Saving..." : "Submit Attendance"}
        </Text>
      </Pressable>

      {/* Calendar Modal */}
      <Modal
        visible={showCalendarModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalContent}>
            <Text style={styles.modalHeaderTitle}>Select Session Date</Text>

            <View style={styles.monthNavRow}>
              <Pressable
                style={styles.monthNavArrow}
                onPress={() => changeCalendarMonth(-1)}
              >
                <Text style={styles.monthNavArrowText}>‹</Text>
              </Pressable>

              <Text style={styles.monthTitleText}>
                {currentCalendarMonth.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>

              <Pressable
                style={styles.monthNavArrow}
                onPress={() => changeCalendarMonth(1)}
              >
                <Text style={styles.monthNavArrowText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <Text key={day} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>{renderCalendarDays()}</View>

            <Pressable
              style={styles.closeModalBtn}
              onPress={() => setShowCalendarModal(false)}
            >
              <Text style={styles.closeModalBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Add Mutarabbi Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContent}>
            <Text style={styles.modalHeaderTitle}>Add Mutarabbi to Group</Text>

            <ScrollView style={styles.addModalScrollView}>
              {/* Option A: Select Unassigned Mutarabbi */}
              <Text style={styles.fieldLabel}>Option 1: Add Existing Mutarabbi</Text>
              {unassignedMutarabbis.length > 0 ? (
                unassignedMutarabbis.map((unm) => (
                  <Pressable
                    key={unm.id}
                    style={[
                      styles.unassignedRow,
                      selectedExistingId === unm.id && styles.unassignedRowSelected,
                    ]}
                    onPress={() => handleAddExistingMutarabbi(unm.id)}
                  >
                    <Text style={styles.unassignedName}>{unm.full_name}</Text>
                    <Text style={styles.addSelectBtnText}>+ Select</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.noUnassignedText}>
                  No unassigned mutarabbi found in system.
                </Text>
              )}

              {/* Option B: Create New Mutarabbi */}
              <View style={styles.divider} />
              <Text style={styles.fieldLabel}>Option 2: Register New Mutarabbi</Text>
              
              <Text style={styles.subFieldLabel}>Full Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter Mutarabbi full name"
                value={newMutarabbiName}
                onChangeText={setNewMutarabbiName}
              />

              <Text style={styles.subFieldLabel}>Join Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="YYYY-MM-DD"
                value={newMutarabbiJoinDate}
                onChangeText={setNewMutarabbiJoinDate}
              />

              <Pressable
                style={styles.createMutarabbiBtn}
                onPress={handleCreateNewMutarabbi}
              >
                <Text style={styles.createMutarabbiBtnText}>
                  Create & Add Mutarabbi
                </Text>
              </Pressable>
            </ScrollView>

            <Pressable
              style={styles.closeModalBtn}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={styles.closeModalBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  header: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#2d3748",
  },
  dateBannerCard: {
    backgroundColor: "#ebf8ff",
    borderWidth: 1,
    borderColor: "#bee3f8",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  dateLabel: { fontSize: 12, fontWeight: "600", color: "#2b6cb0", marginBottom: 4 },
  calendarPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  calendarPickerIcon: { fontSize: 18 },
  calendarPickerText: { fontSize: 16, fontWeight: "bold", color: "#2d3748", flex: 1 },
  calendarPickerHint: { fontSize: 12, color: "#2b6cb0", fontWeight: "600" },
  quickNavRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  quickNavBtn: {
    flex: 1,
    backgroundColor: "#edf2f7",
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
  },
  quickNavText: { fontSize: 12, fontWeight: "600", color: "#4a5568" },
  quickNavBtnToday: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: "center",
  },
  quickNavTextToday: { fontSize: 12, fontWeight: "bold", color: "#fff" },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fafafa",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nameRow: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600", color: "#2d3748" },
  joinDateSubText: { fontSize: 11, color: "#718096", marginTop: 2 },
  notesInput: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
    fontSize: 12,
    backgroundColor: "#fff",
  },
  addMutarabbiBtn: {
    marginVertical: 12,
    paddingVertical: 12,
    backgroundColor: "#ebf8ff",
    borderWidth: 1,
    borderColor: "#3182ce",
    borderRadius: 8,
    borderStyle: "dashed",
    alignItems: "center",
  },
  addMutarabbiBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2b6cb0",
  },
  button: {
    backgroundColor: "#2b6cb0",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
  },
  presentBadge: { backgroundColor: "#38a169" },
  absentBadge: { backgroundColor: "#e53e3e" },
  notesText: { fontSize: 12, color: "#666", marginTop: 2 },
  emptyText: { textAlign: "center", color: "#888", marginVertical: 20 },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  calendarModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  addModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "85%",
  },
  addModalScrollView: { marginVertical: 10 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2b6cb0",
    marginBottom: 8,
  },
  subFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4a5568",
    marginTop: 8,
    marginBottom: 4,
  },
  unassignedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: "#f7fafc",
  },
  unassignedRowSelected: {
    borderColor: "#2b6cb0",
    backgroundColor: "#ebf8ff",
  },
  unassignedName: { fontSize: 14, color: "#2d3748" },
  addSelectBtnText: { fontSize: 12, fontWeight: "bold", color: "#2b6cb0" },
  noUnassignedText: { fontSize: 12, color: "#a0aec0", fontStyle: "italic", marginBottom: 10 },
  divider: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  createMutarabbiBtn: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 14,
  },
  createMutarabbiBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 14,
    color: "#2d3748",
  },
  monthNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  monthNavArrow: { paddingHorizontal: 14, paddingVertical: 4 },
  monthNavArrowText: { fontSize: 24, fontWeight: "bold", color: "#2b6cb0" },
  monthTitleText: { fontSize: 16, fontWeight: "bold", color: "#2d3748" },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 8,
  },
  weekdayText: {
    width: 36,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#718096",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  calendarDayEmpty: { width: "14.28%", height: 38 },
  calendarDay: {
    width: "14.28%",
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 2,
    borderRadius: 8,
  },
  calendarDaySelected: { backgroundColor: "#2b6cb0" },
  calendarDayToday: { backgroundColor: "#e2e8f0" },
  calendarDayText: { fontSize: 14, color: "#2d3748" },
  calendarDayTextSelected: { color: "#fff", fontWeight: "bold" },
  calendarDayTextToday: { color: "#2b6cb0", fontWeight: "bold" },
  closeModalBtn: {
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: "#edf2f7",
    borderRadius: 8,
    alignItems: "center",
  },
  closeModalBtnText: { fontWeight: "bold", color: "#4a5568" },
});
