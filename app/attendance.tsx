import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
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
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(
    new Date()
  );

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

    const { data: attendance } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("session_date", selectedDate);

    const initialMap = (members || []).map((m: Profile) => {
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
              <Text style={styles.name}>{item.mutarabbi.full_name}</Text>
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
          <Text style={styles.emptyText}>No mutarabbi members found.</Text>
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
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day) => (
                  <Text key={day} style={styles.weekdayText}>
                    {day}
                  </Text>
                )
              )}
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
  name: { fontSize: 16, fontWeight: "600", color: "#2d3748" },
  notesInput: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
    fontSize: 12,
    backgroundColor: "#fff",
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
  emptyText: { textAlign: "center", color: "#888", marginTop: 20 },
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
    marginTop: 16,
    paddingVertical: 10,
    backgroundColor: "#edf2f7",
    borderRadius: 8,
    alignItems: "center",
  },
  closeModalBtnText: { fontWeight: "bold", color: "#4a5568" },
});
