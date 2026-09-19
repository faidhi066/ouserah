import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/auth-context";
import { supabase } from "../lib/supabase";
import { TrackerItem, TrackerLog } from "../types/database";

export default function DailyTrackerScreen() {
  const { profile } = useAuth();
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [logs, setLogs] = useState<Record<string, boolean>>({});
  const [newItemTitle, setNewItemTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchTrackerItems();
  }, [profile]);

  const fetchTrackerItems = async () => {
    setLoading(true);
    const { data: trackerData, error } = await supabase
      .from("tracker_items")
      .select("*")
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("Error loading tracker items:", error.message);
    } else if (trackerData) {
      setItems(trackerData);
    }

    if (profile) {
      const { data: logData } = await supabase
        .from("tracker_logs")
        .select("*")
        .eq("user_id", profile.id)
        .eq("log_date", today);

      if (logData) {
        const logMap: Record<string, boolean> = {};
        logData.forEach((log: TrackerLog) => {
          logMap[log.item_id] = log.is_completed;
        });
        setLogs(logMap);
      }
    }
    setLoading(false);
  };

  const toggleCheck = async (itemId: string, currentValue: boolean) => {
    if (!profile) return;
    const nextValue = !currentValue;

    setLogs((prev) => ({ ...prev, [itemId]: nextValue }));

    const { error } = await supabase.from("tracker_logs").upsert(
      {
        user_id: profile.id,
        item_id: itemId,
        log_date: today,
        is_completed: nextValue,
      },
      { onConflict: "user_id,item_id,log_date" }
    );

    if (error) {
      setLogs((prev) => ({ ...prev, [itemId]: currentValue }));
      Alert.alert("Error", error.message);
    }
  };

  const handleAddTrackerItem = async () => {
    if (!newItemTitle.trim() || !profile) return;
    const { error } = await supabase.from("tracker_items").insert({
      title: newItemTitle.trim(),
      created_by: profile.id,
    });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setNewItemTitle("");
      fetchTrackerItems();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Mutabaah ({today})</Text>

      {(profile?.role === "murabbi" || profile?.role === "admin") && (
        <View style={styles.addBox}>
          <TextInput
            placeholder="Add new daily tracker item..."
            value={newItemTitle}
            onChangeText={setNewItemTitle}
            style={styles.input}
          />
          <Pressable style={styles.addButton} onPress={handleAddTrackerItem}>
            <Text style={styles.addButtonText}>Add Item</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={fetchTrackerItems}
        renderItem={({ item }) => {
          const isCompleted = !!logs[item.id];
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 16, color: "#2d3748" },
  addBox: { flexDirection: "row", marginBottom: 16, gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: "#2b6cb0",
    borderRadius: 6,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "bold" },
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
  emptyText: { textAlign: "center", color: "#888", marginTop: 20 },
});
