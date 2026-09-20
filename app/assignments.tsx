import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/auth-context";
import { supabase } from "../lib/supabase";
import { Assignment, Submission } from "../types/database";

export default function AssignmentsScreen() {
  const { profile, activeGroup } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const fetchAssignments = async () => {
    setLoading(true);
    const targetGroupId = activeGroup?.id || profile?.group_id;
    let query = supabase
      .from("assignments")
      .select("*")
      .order("created_at", { ascending: false });

    if (targetGroupId) {
      query = query.eq("group_id", targetGroupId);
    }

    const { data: assignData, error } = await query;

    if (error) {
      console.error("Error fetching assignments:", error.message);
    } else if (assignData) {
      setAssignments(assignData);
    }

    if (profile?.role === "mutarabbi") {
      const { data: subData } = await supabase
        .from("submissions")
        .select("*")
        .eq("mutarabbi_id", profile.id);

      if (subData) {
        const subMap: Record<string, Submission> = {};
        subData.forEach((sub: Submission) => {
          subMap[sub.assignment_id] = sub;
        });
        setSubmissions(subMap);
      }
    }
    setLoading(false);
  };

  const [submissions, setSubmissions] = useState<Record<string, Submission>>(
    {}
  );
  const [loading, setLoading] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDueDate, setNewDueDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );

  const [submitModal, setSubmitModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] =
    useState<Assignment | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  const [viewSubmissionsModal, setViewSubmissionsModal] = useState(false);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<any[]>([]);

  const isMurabbiOrAdmin =
    profile?.role === "murabbi" || profile?.role === "admin";

  useEffect(() => {
    fetchAssignments();
  }, [profile, activeGroup]);

  const handleCreateAssignment = async () => {
    if (!newTitle.trim() || !newDesc.trim() || !profile) {
      Alert.alert("Error", "Please fill in title and description.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("assignments").insert({
      title: newTitle,
      description: newDesc,
      due_date: newDueDate,
      created_by: profile.id,
      group_id: activeGroup?.id || profile?.group_id || null,
    });

    setLoading(false);
    if (error) {
      Alert.alert("Error creating assignment", error.message);
    } else {
      Alert.alert("Success", "Assignment created.");
      setCreateModal(false);
      setNewTitle("");
      setNewDesc("");
      fetchAssignments();
    }
  };

  const openSubmitModal = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    const existing = submissions[assignment.id];
    setSubmissionText(existing?.submission_text || "");
    setFileUrl(existing?.file_url || "");
    setSubmitModal(true);
  };

  const handleSubmitAssignment = async () => {
    if (!selectedAssignment || !profile) return;
    if (!submissionText.trim() && !fileUrl.trim()) {
      Alert.alert("Error", "Please provide submission text or a file URL.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("submissions").upsert(
      {
        assignment_id: selectedAssignment.id,
        mutarabbi_id: profile.id,
        submission_text: submissionText,
        file_url: fileUrl || null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,mutarabbi_id" }
    );

    setLoading(false);
    if (error) {
      Alert.alert("Submission Error", error.message);
    } else {
      Alert.alert("Success", "Assignment submitted!");
      setSubmitModal(false);
      fetchAssignments();
    }
  };

  const openViewSubmissions = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setLoading(true);
    const assignmentDateStr = assignment.created_at
      ? assignment.created_at.split("T")[0]
      : assignment.due_date.split("T")[0];

    const { data, error } = await supabase
      .from("submissions")
      .select("*, profiles:mutarabbi_id(full_name, created_at)")
      .eq("assignment_id", assignment.id);

    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      const validSubmissions = (data || []).filter((sub: any) => {
        if (!sub.profiles?.created_at) return true;
        const studentJoinDate = sub.profiles.created_at.split("T")[0];
        return studentJoinDate <= assignmentDateStr;
      });
      setAssignmentSubmissions(validSubmissions);
      setViewSubmissionsModal(true);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Assignments</Text>
        {isMurabbiOrAdmin && (
          <Pressable
            style={styles.createButton}
            onPress={() => setCreateModal(true)}
          >
            <Text style={styles.createButtonText}>+ New Assignment</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={assignments}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={fetchAssignments}
        renderItem={({ item }) => {
          const submission = submissions[item.id];
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
              <Text style={styles.dueDate}>Due Date: {item.due_date}</Text>

              {profile?.role === "mutarabbi" && (
                <View style={styles.actionRow}>
                  {submission ? (
                    <View style={styles.submittedBadge}>
                      <Text style={styles.submittedText}>✓ Submitted</Text>
                    </View>
                  ) : (
                    <Text style={styles.pendingText}>Pending Submission</Text>
                  )}
                  <Pressable
                    style={styles.submitBtn}
                    onPress={() => openSubmitModal(item)}
                  >
                    <Text style={styles.submitBtnText}>
                      {submission ? "Edit Submission" : "Submit Work"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {isMurabbiOrAdmin && (
                <Pressable
                  style={styles.viewSubmissionsBtn}
                  onPress={() => openViewSubmissions(item)}
                >
                  <Text style={styles.viewSubmissionsText}>
                    View Submissions →
                  </Text>
                </Pressable>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No assignments available.</Text>
        }
      />

      <Modal visible={createModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Assignment</Text>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Hafazan Surah Al-Mulk"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Assignment details..."
              multiline
              numberOfLines={4}
              value={newDesc}
              onChangeText={setNewDesc}
            />

            <Text style={styles.label}>Due Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={newDueDate}
              onChangeText={setNewDueDate}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setCreateModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.saveBtn}
                onPress={handleCreateAssignment}
              >
                <Text style={styles.saveBtnText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={submitModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Submit: {selectedAssignment?.title}
            </Text>

            <Text style={styles.label}>Submission Answer / Notes</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Type your submission here..."
              multiline
              numberOfLines={4}
              value={submissionText}
              onChangeText={setSubmissionText}
            />

            <Text style={styles.label}>File Link (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="https://drive.google.com/..."
              value={fileUrl}
              onChangeText={setFileUrl}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setSubmitModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.saveBtn}
                onPress={handleSubmitAssignment}
              >
                <Text style={styles.saveBtnText}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={viewSubmissionsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Submissions for {selectedAssignment?.title}
            </Text>

            <FlatList
              data={assignmentSubmissions}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <View style={styles.subItemCard}>
                  <Text style={styles.studentName}>
                    {item.profiles?.full_name || "Student"}
                  </Text>
                  <Text style={styles.subText}>{item.submission_text}</Text>
                  {item.file_url && (
                    <Text style={styles.fileLinkText}>Link: {item.file_url}</Text>
                  )}
                  <Text style={styles.subDate}>
                    Submitted at: {new Date(item.submitted_at).toLocaleString()}
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No submissions received yet.</Text>
              }
            />

            <Pressable
              style={[styles.cancelBtn, { alignSelf: "flex-end", marginTop: 12 }]}
              onPress={() => setViewSubmissionsModal(false)}
            >
              <Text style={styles.cancelBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "bold", color: "#2d3748" },
  createButton: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  createButtonText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#f7fafc",
  },
  cardTitle: { fontSize: 18, fontWeight: "bold", color: "#2d3748" },
  cardDesc: { fontSize: 14, color: "#4a5568", marginTop: 4 },
  dueDate: { fontSize: 12, color: "#e53e3e", fontWeight: "600", marginTop: 8 },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    borderTopWidth: 1,
    borderColor: "#edf2f7",
    paddingTop: 8,
  },
  submittedBadge: {
    backgroundColor: "#c6f6d5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  submittedText: { color: "#22543d", fontWeight: "bold", fontSize: 12 },
  pendingText: { color: "#718096", fontSize: 12 },
  submitBtn: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  submitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  viewSubmissionsBtn: { marginTop: 10, alignSelf: "flex-end" },
  viewSubmissionsText: { color: "#2b6cb0", fontWeight: "bold", fontSize: 13 },
  emptyText: { textAlign: "center", color: "#888", marginTop: 20 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 10, color: "#2d3748" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    marginTop: 4,
  },
  multilineInput: { height: 80, textAlignVertical: "top" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  cancelBtnText: { color: "#718096", fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#2b6cb0",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  saveBtnText: { color: "#fff", fontWeight: "bold" },
  subItemCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  studentName: { fontWeight: "bold", fontSize: 14 },
  subText: { fontSize: 13, color: "#4a5568", marginTop: 2 },
  fileLinkText: { fontSize: 12, color: "#2b6cb0", marginTop: 2 },
  subDate: { fontSize: 10, color: "#718096", marginTop: 4 },
});
