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
import { Profile, TrackerItem, TrackerLog } from "../types/database";

interface StudentProgress {
  student: Profile;
  completedLogs: Record<string, boolean>; // item_id -> boolean
  completedCount: number;
}

export default function DailyTrackerScreen() {
  const { profile, activeGroup } = useAuth();
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [myLogs, setMyLogs] = useState<Record<string, boolean>>({});
  const [studentProgressList, setStudentProgressList] = useState<StudentProgress[]>([]);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"student" | "item">("student");

  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());

  const isMurabbiOrAdmin =
    profile?.role === "murabbi" || profile?.role === "admin";

  useEffect(() => {
    fetchData();
  }, [profile, activeGroup, selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    const targetGroupId = activeGroup?.id || profile?.group_id;

    // 1. Fetch tracker items for active group (or global items where group_id IS NULL)
    let itemQuery = supabase
      .from("tracker_items")
      .select("*")
      .order("created_at", { ascending: true });

    if (targetGroupId) {
      itemQuery = itemQuery.or(`group_id.eq.${targetGroupId},group_id.is.null`);
    }

    const { data: trackerData, error: trackerErr } = await itemQuery;

    if (trackerErr) {
      console.error("Error loading tracker items:", trackerErr.message);
      setLoading(false);
      return;
    }
    const currentItems: TrackerItem[] = trackerData || [];
    setItems(currentItems);

    if (isMurabbiOrAdmin) {
      // 2. Murabbi/Admin View: Fetch group members and their logs for selectedDate
      let query = supabase.from("profiles").select("*").eq("role", "mutarabbi");
      if (targetGroupId) {
        query = query.eq("group_id", targetGroupId);
      }

      const { data: members, error: membersErr } = await query;

      if (membersErr) {
        Alert.alert("Error fetching members", membersErr.message);
        setLoading(false);
        return;
      }

      // Filter members by join date: hide student if selectedDate is prior to their join date
      const memberList: Profile[] = (members || []).filter((m: Profile) => {
        if (!m.created_at) return true;
        const joinDate = m.created_at.split("T")[0];
        return joinDate <= selectedDate;
      });
      const memberIds = memberList.map((m) => m.id);

      let logData: TrackerLog[] = [];
      if (memberIds.length > 0) {
        const { data: logs } = await supabase
          .from("tracker_logs")
          .select("*")
          .in("user_id", memberIds)
          .eq("log_date", selectedDate);
        logData = logs || [];
      }

      // Map progress per student
      const progressList: StudentProgress[] = memberList.map((student) => {
        const studentLogs = logData.filter((l) => l.user_id === student.id);
        const completedMap: Record<string, boolean> = {};
        let doneCount = 0;

        studentLogs.forEach((l) => {
          if (l.is_completed) {
            completedMap[l.item_id] = true;
            doneCount++;
          }
        });

        return {
          student,
          completedLogs: completedMap,
          completedCount: doneCount,
        };
      });

      setStudentProgressList(progressList);
    } else if (profile?.role === "mutarabbi") {
      // 3. Mutarabbi View: Fetch own logs for selectedDate
      const { data: logData } = await supabase
        .from("tracker_logs")
        .select("*")
        .eq("user_id", profile.id)
        .eq("log_date", selectedDate);

      const logMap: Record<string, boolean> = {};
      if (logData) {
        logData.forEach((log: TrackerLog) => {
          logMap[log.item_id] = log.is_completed;
        });
      }
      setMyLogs(logMap);
    }

    setLoading(false);
  };

  const toggleCheck = async (itemId: string, currentValue: boolean) => {
    if (!profile) return;
    const nextValue = !currentValue;

    setMyLogs((prev) => ({ ...prev, [itemId]: nextValue }));

    const { error } = await supabase.from("tracker_logs").upsert(
      {
        user_id: profile.id,
        item_id: itemId,
        log_date: selectedDate,
        is_completed: nextValue,
      },
      { onConflict: "user_id,item_id,log_date" }
    );

    if (error) {
      setMyLogs((prev) => ({ ...prev, [itemId]: currentValue }));
      Alert.alert("Error updating log", error.message);
    }
  };

  const handleAddTrackerItem = async () => {
    if (!newItemTitle.trim() || !profile) return;
    const targetGroupId = activeGroup?.id || profile?.group_id;

    if (!targetGroupId && profile.role !== "admin") {
      Alert.alert("No Group Selected", "You must belong to or select a group to add tracker items.");
      return;
    }

    const { error } = await supabase.from("tracker_items").insert({
      title: newItemTitle.trim(),
      created_by: profile.id,
      group_id: targetGroupId || null,
    });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setNewItemTitle("");
      fetchData();
    }
  };

  const changeDay = (daysOffset: number) => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + daysOffset);
    setSelectedDate(cur.toISOString().split("T")[0]);
  };

  const changeCalendarMonth = (offset: number) => {
    const next = new Date(
      currentCalendarMonth.getFullYear(),
      currentCalendarMonth.getMonth() + offset,
      1
    );
    setCurrentCalendarMonth(next);
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Mutabaah Tracker</Text>

      {/* Calendar & Date Picker Banner (Same UI as Mark Attendance) */}
      <View style={styles.dateBannerCard}>
        <Text style={styles.dateLabel}>Selected Log Date:</Text>

        <Pressable
          style={styles.calendarPickerBtn}
          onPress={() => setShowCalendarModal(true)}
        >
          <Text style={styles.calendarPickerIcon}>📅</Text>
          <Text style={styles.calendarPickerText}>{selectedDate}</Text>
          <Text style={styles.calendarPickerHint}>Tap to change</Text>
        </Pressable>

        <View style={styles.quickNavRow}>
          <Pressable style={styles.quickNavBtn} onPress={() => changeDay(-1)}>
            <Text style={styles.quickNavText}>‹ Prev Day</Text>
          </Pressable>
          <Pressable
            style={styles.quickNavBtnToday}
            onPress={() => setSelectedDate(todayStr)}
          >
            <Text style={styles.quickNavTextToday}>Today</Text>
          </Pressable>
          <Pressable style={styles.quickNavBtn} onPress={() => changeDay(1)}>
            <Text style={styles.quickNavText}>Next Day ›</Text>
          </Pressable>
        </View>
      </View>

      {/* Add New Item Box (For Murabbi / Admin) */}
      {isMurabbiOrAdmin && (
        <View style={styles.addBox}>
          <TextInput
            placeholder="Add new daily tracker item..."
            value={newItemTitle}
            onChangeText={setNewItemTitle}
            style={styles.input}
          />
          <Pressable style={styles.addButton} onPress={handleAddTrackerItem}>
            <Text style={styles.addButtonText}>+ Add Item</Text>
          </Pressable>
        </View>
      )}

      {/* MURABBI / ADMIN VIEW MODE TOGGLE & LIST */}
      {isMurabbiOrAdmin ? (
        <View style={styles.flex1}>
          <View style={styles.viewToggleRow}>
            <Text style={styles.sectionHeaderTitle}>Mutabaah Submissions</Text>
            <View style={styles.toggleBtnGroup}>
              <Pressable
                style={[
                  styles.toggleBtn,
                  viewMode === "student" && styles.toggleBtnActive,
                ]}
                onPress={() => setViewMode("student")}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    viewMode === "student" && styles.toggleBtnTextActive,
                  ]}
                >
                  By Student
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.toggleBtn,
                  viewMode === "item" && styles.toggleBtnActive,
                ]}
                onPress={() => setViewMode("item")}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    viewMode === "item" && styles.toggleBtnTextActive,
                  ]}
                >
                  By Item
                </Text>
              </Pressable>
            </View>
          </View>

          {viewMode === "student" ? (
            /* VIEW BY STUDENT */
            <FlatList
              data={studentProgressList}
              keyExtractor={(sp) => sp.student.id}
              refreshing={loading}
              onRefresh={fetchData}
              renderItem={({ item: sp }) => {
                const total = items.length;
                const isAllDone = total > 0 && sp.completedCount === total;
                return (
                  <View style={styles.studentCard}>
                    <View style={styles.studentCardHeader}>
                      <Text style={styles.studentName}>{sp.student.full_name}</Text>
                      <View
                        style={[
                          styles.progressBadge,
                          isAllDone ? styles.allDoneBadge : styles.partialBadge,
                        ]}
                      >
                        <Text style={styles.progressBadgeText}>
                          {sp.completedCount}/{total} Completed
                        </Text>
                      </View>
                    </View>

                    {/* Breakdown of items for this student */}
                    <View style={styles.itemListContainer}>
                      {items.map((tItem) => {
                        const done = !!sp.completedLogs[tItem.id];
                        return (
                          <View key={tItem.id} style={styles.studentItemRow}>
                            <Text
                              style={[
                                styles.studentItemText,
                                done && styles.studentItemTextDone,
                              ]}
                            >
                              {tItem.title}
                            </Text>
                            <Text
                              style={[
                                styles.statusIcon,
                                done ? styles.statusIconDone : styles.statusIconPending,
                              ]}
                            >
                              {done ? "✓ Done" : "✗ Undone"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No student progress found for {selectedDate}.
                </Text>
              }
            />
          ) : (
            /* VIEW BY ITEM */
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              refreshing={loading}
              onRefresh={fetchData}
              renderItem={({ item: tItem }) => {
                const completedStudents = studentProgressList.filter(
                  (sp) => sp.completedLogs[tItem.id]
                );
                return (
                  <View style={styles.itemSummaryCard}>
                    <View style={styles.itemSummaryHeader}>
                      <Text style={styles.itemSummaryTitle}>{tItem.title}</Text>
                      <Text style={styles.completedCountText}>
                        {completedStudents.length}/{studentProgressList.length} Completed
                      </Text>
                    </View>

                    {studentProgressList.length > 0 ? (
                      <View style={styles.studentTagList}>
                        {studentProgressList.map((sp) => {
                          const done = !!sp.completedLogs[tItem.id];
                          return (
                            <View
                              key={sp.student.id}
                              style={[
                                styles.studentTag,
                                done ? styles.studentTagDone : styles.studentTagPending,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.studentTagText,
                                  done
                                    ? styles.studentTagTextDone
                                    : styles.studentTagTextPending,
                                ]}
                              >
                                {done ? "✓ " : "✗ "}
                                {sp.student.full_name}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={styles.noStudentsText}>No students in group.</Text>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No tracker items created yet.</Text>
              }
            />
          )}
        </View>
      ) : (
        /* MUTARABBI (STUDENT) SELF-TRACKING VIEW */
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={fetchData}
          renderItem={({ item }) => {
            const isCompleted = !!myLogs[item.id];
            return (
              <View style={styles.itemRow}>
                <Text
                  style={[styles.itemText, isCompleted && styles.completedText]}
                >
                  {item.title}
                </Text>
                <Pressable
                  style={[
                    styles.checkButton,
                    isCompleted ? styles.completedBtn : styles.pendingBtn,
                  ]}
                  onPress={() => toggleCheck(item.id, isCompleted)}
                >
                  <Text
                    style={[
                      styles.checkButtonText,
                      isCompleted && styles.completedBtnText,
                    ]}
                  >
                    {isCompleted ? "✓ Done" : "Mark Done"}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No tracker items created yet.</Text>
          }
        />
      )}

      {/* Calendar Modal Picker */}
      <Modal
        visible={showCalendarModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalContent}>
            <Text style={styles.modalHeaderTitle}>Select Mutabaah Date</Text>

            {/* Month Navigation */}
            <View style={styles.monthNavRow}>
              <Pressable
                style={styles.monthNavArrow}
                onPress={() => changeCalendarMonth(-1)}
              >
                <Text style={styles.monthNavArrowText}>‹</Text>
              </Pressable>
              <Text style={styles.monthTitleText}>
                {currentCalendarMonth.toLocaleDateString("en-US", {
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

            {/* Weekday headers */}
            <View style={styles.weekdayRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <Text key={day} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>{renderCalendarDays()}</View>

            <Pressable
              style={styles.closeModalBtn}
              onPress={() => setShowCalendarModal(false)}
            >
              <Text style={styles.closeModalBtnText}>Close Calendar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  flex1: { flex: 1 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 12, color: "#2d3748" },

  /* Calendar Date Banner (Matching Attendance UI) */
  dateBannerCard: {
    backgroundColor: "#ebf8ff",
    borderWidth: 1,
    borderColor: "#bee3f8",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
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

  /* Add Item Box */
  addBox: { flexDirection: "row", marginBottom: 14, gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  addButton: {
    backgroundColor: "#2b6cb0",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "bold" },

  /* View Mode Toggle */
  viewToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionHeaderTitle: { fontSize: 15, fontWeight: "bold", color: "#2d3748" },
  toggleBtnGroup: {
    flexDirection: "row",
    backgroundColor: "#edf2f7",
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: "#2b6cb0",
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4a5568",
  },
  toggleBtnTextActive: {
    color: "#fff",
  },

  /* Student Card (By Student View) */
  studentCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  studentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
  },
  studentName: { fontSize: 16, fontWeight: "bold", color: "#2d3748" },
  progressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  allDoneBadge: { backgroundColor: "#c6f6d5" },
  partialBadge: { backgroundColor: "#feebc8" },
  progressBadgeText: { fontSize: 12, fontWeight: "bold", color: "#2d3748" },
  itemListContainer: { gap: 6 },
  studentItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  studentItemText: { fontSize: 14, color: "#4a5568" },
  studentItemTextDone: { color: "#2d3748", fontWeight: "500" },
  statusIcon: { fontSize: 12, fontWeight: "bold", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusIconDone: { color: "#22543d", backgroundColor: "#c6f6d5" },
  statusIconPending: { color: "#742a2a", backgroundColor: "#fed7d7" },

  /* Item Summary Card (By Item View) */
  itemSummaryCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  itemSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemSummaryTitle: { fontSize: 15, fontWeight: "bold", color: "#2d3748" },
  completedCountText: { fontSize: 12, fontWeight: "bold", color: "#2b6cb0" },
  studentTagList: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  studentTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  studentTagDone: { backgroundColor: "#f0fff4", borderColor: "#c6f6d5" },
  studentTagPending: { backgroundColor: "#fff5f5", borderColor: "#fed7d7" },
  studentTagText: { fontSize: 12, fontWeight: "600" },
  studentTagTextDone: { color: "#276749" },
  studentTagTextPending: { color: "#9b2c2c" },
  noStudentsText: { fontSize: 12, color: "#a0aec0", fontStyle: "italic" },

  /* Mutarabbi Item Row */
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "#f0f0f0",
  },
  itemText: { fontSize: 16, flex: 1, marginRight: 10, color: "#2d3748" },
  completedText: { textDecorationLine: "line-through", color: "#888" },
  checkButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
  },
  pendingBtn: { borderColor: "#cbd5e0", backgroundColor: "#edf2f7" },
  completedBtn: { borderColor: "#38a169", backgroundColor: "#38a169" },
  checkButtonText: { fontSize: 14, fontWeight: "600", color: "#4a5568" },
  completedBtnText: { color: "#fff" },

  /* Modal Calendar Styles */
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
  emptyText: { textAlign: "center", color: "#888", marginTop: 20 },
});
