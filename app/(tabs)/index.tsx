import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import { Assignment, AttendanceRecord, TrackerLog } from "@/types/database";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function HomeScreen() {
  const { profile, activeGroup } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dashboard Stats State
  const [attendanceStats, setAttendanceStats] = useState<{
    presentCount: number;
    totalCount: number;
    percentage: number;
  }>({ presentCount: 0, totalCount: 0, percentage: 0 });

  const [nextAssignment, setNextAssignment] = useState<{
    assignment: Assignment | null;
    dueString: string;
    isOverdue: boolean;
    isSubmitted: boolean;
  }>({ assignment: null, dueString: "", isOverdue: false, isSubmitted: false });

  const [mutabaahStats, setMutabaahStats] = useState<{
    todayCompleted: number;
    todayTotal: number;
    todayPercentage: number;
    past7DaysAvgPercentage: number;
  }>({
    todayCompleted: 0,
    todayTotal: 0,
    todayPercentage: 0,
    past7DaysAvgPercentage: 0,
  });

  const roleTitle = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : "User";

  const isMurabbiOrAdmin =
    profile?.role === "murabbi" || profile?.role === "admin";

  const fetchDashboardData = async () => {
    if (!profile) return;
    try {
      const today = new Date().toISOString().split("T")[0];

      // -------------------------------------------------------------
      // 1. ATTENDANCE STATS
      // -------------------------------------------------------------
      let attendanceQuery = supabase.from("attendance_records").select("*");
      if (profile.role === "mutarabbi") {
        attendanceQuery = attendanceQuery.eq("mutarabbi_id", profile.id);
      } else {
        const targetGroupId = activeGroup?.id || profile.group_id;
        if (targetGroupId) {
          attendanceQuery = attendanceQuery.eq("group_id", targetGroupId);
        }
      }

      const { data: attendanceData } = await attendanceQuery;
      if (attendanceData && attendanceData.length > 0) {
        const present = attendanceData.filter(
          (r: AttendanceRecord) => r.is_present,
        ).length;
        const total = attendanceData.length;
        const pct = Math.round((present / total) * 100);
        setAttendanceStats({
          presentCount: present,
          totalCount: total,
          percentage: pct,
        });
      } else {
        setAttendanceStats({ presentCount: 0, totalCount: 0, percentage: 0 });
      }

      // -------------------------------------------------------------
      // 2. LAST / UPCOMING ASSIGNMENT DUE IN
      // -------------------------------------------------------------
      let assignQuery = supabase
        .from("assignments")
        .select("*")
        .order("due_date", { ascending: true });

      const targetGroupId = activeGroup?.id || profile.group_id;
      if (targetGroupId) {
        assignQuery = assignQuery.eq("group_id", targetGroupId);
      }

      const { data: assignData } = await assignQuery;

      if (assignData && assignData.length > 0) {
        const now = new Date();
        // Find first upcoming or latest assignment
        const upcoming =
          assignData.find((a: Assignment) => new Date(a.due_date) >= now) ||
          assignData[assignData.length - 1];

        let submitted = false;
        if (profile.role === "mutarabbi" && upcoming) {
          const { data: subData } = await supabase
            .from("submissions")
            .select("*")
            .eq("assignment_id", upcoming.id)
            .eq("mutarabbi_id", profile.id)
            .maybeSingle();
          if (subData) submitted = true;
        }

        const due = new Date(upcoming.due_date);
        const diffMs = due.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const overdue = diffMs < 0;

        let dueStr = "";
        if (overdue) {
          const absDays = Math.abs(diffDays);
          dueStr =
            absDays === 0
              ? "Overdue today"
              : `Overdue by ${absDays} day${absDays > 1 ? "s" : ""}`;
        } else if (diffDays === 0) {
          dueStr = "Due Today";
        } else if (diffDays === 1) {
          dueStr = "Due Tomorrow";
        } else {
          dueStr = `Due in ${diffDays} days`;
        }

        setNextAssignment({
          assignment: upcoming,
          dueString: dueStr,
          isOverdue: overdue,
          isSubmitted: submitted,
        });
      } else {
        setNextAssignment({
          assignment: null,
          dueString: "",
          isOverdue: false,
          isSubmitted: false,
        });
      }

      // -------------------------------------------------------------
      // 3. DAILY MUTABAAH TRACKER STATS
      // -------------------------------------------------------------
      const { data: trackerItems } = await supabase
        .from("tracker_items")
        .select("*");

      const totalItems = trackerItems ? trackerItems.length : 0;

      if (totalItems > 0) {
        // Today's logs
        const { data: todayLogs } = await supabase
          .from("tracker_logs")
          .select("*")
          .eq("user_id", profile.id)
          .eq("log_date", today);

        const todayDone = todayLogs
          ? todayLogs.filter((l: TrackerLog) => l.is_completed).length
          : 0;
        const todayPct = Math.round((todayDone / totalItems) * 100);

        // Past 7 days logs calculation
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const startDateStr = sevenDaysAgo.toISOString().split("T")[0];

        const { data: pastLogs } = await supabase
          .from("tracker_logs")
          .select("*")
          .eq("user_id", profile.id)
          .gte("log_date", startDateStr);

        let pastCompletedCount = 0;
        if (pastLogs) {
          pastCompletedCount = pastLogs.filter(
            (l: TrackerLog) => l.is_completed,
          ).length;
        }
        const totalPossible7Days = totalItems * 7;
        const avgPct = Math.round(
          (pastCompletedCount / totalPossible7Days) * 100,
        );

        setMutabaahStats({
          todayCompleted: todayDone,
          todayTotal: totalItems,
          todayPercentage: todayPct,
          past7DaysAvgPercentage: avgPct,
        });
      } else {
        setMutabaahStats({
          todayCompleted: 0,
          todayTotal: 0,
          todayPercentage: 0,
          past7DaysAvgPercentage: 0,
        });
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [profile, activeGroup]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  // Helper for gauge colors
  const getGaugeColor = (pct: number) => {
    if (pct >= 80) return "#38a169"; // Green
    if (pct >= 50) return "#dd6b20"; // Orange
    return "#e53e3e"; // Red
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header Card */}
        <View style={styles.headerCard}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.nameText}>{profile?.full_name || "Student"}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {roleTitle} {activeGroup ? `• ${activeGroup.name}` : ""}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2b6cb0" />
            <Text style={styles.loadingText}>Loading Dashboard Data...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Dashboard Overview</Text>

            {/* 1. ATTENDANCE RECORD GAUGE CARD */}
            <Link href="/(tabs)/attendance" asChild>
              <Pressable style={styles.dashboardCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardIcon}>📅</Text>
                    <Text style={styles.dashCardTitle}>
                      Usrah Attendance Record
                    </Text>
                  </View>
                  <Text style={styles.gaugeFraction}>
                    {attendanceStats.presentCount}/{attendanceStats.totalCount}
                  </Text>
                </View>

                {/* Progress Bar / Gauge */}
                <View style={styles.gaugeTrack}>
                  <View
                    style={[
                      styles.gaugeFill,
                      {
                        width: `${attendanceStats.percentage}%`,
                        backgroundColor: getGaugeColor(
                          attendanceStats.percentage,
                        ),
                      },
                    ]}
                  />
                </View>

                <View style={styles.cardFooterRow}>
                  <Text style={styles.cardSubText}>
                    {attendanceStats.totalCount > 0
                      ? `${attendanceStats.percentage}% attendance rate (${attendanceStats.presentCount} of ${attendanceStats.totalCount} attended)`
                      : "No attendance records recorded yet"}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            </Link>

            {/* 2. LAST / UPCOMING ASSIGNMENT CARD */}
            <Link href="/(tabs)/assignments" asChild>
              <Pressable style={styles.dashboardCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardIcon}>📝</Text>
                    <Text style={styles.dashCardTitle}>
                      Upcoming Assignment
                    </Text>
                  </View>
                  {nextAssignment.assignment && (
                    <View
                      style={[
                        styles.statusBadge,
                        nextAssignment.isSubmitted
                          ? styles.submittedBadge
                          : nextAssignment.isOverdue
                            ? styles.overdueBadge
                            : styles.dueBadge,
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {nextAssignment.isSubmitted
                          ? "Submitted ✅"
                          : nextAssignment.dueString}
                      </Text>
                    </View>
                  )}
                </View>

                {nextAssignment.assignment ? (
                  <View style={styles.assignmentDetails}>
                    <Text style={styles.assignmentTitleText} numberOfLines={1}>
                      {nextAssignment.assignment.title}
                    </Text>
                    <Text style={styles.assignmentDescText} numberOfLines={2}>
                      {nextAssignment.assignment.description ||
                        "No description provided"}
                    </Text>
                    <Text style={styles.dueDateLabel}>
                      Due Date:{" "}
                      {new Date(
                        nextAssignment.assignment.due_date,
                      ).toLocaleDateString()}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.cardSubText}>
                    No active assignments due.
                  </Text>
                )}

                <View style={styles.cardFooterRow}>
                  <Text style={styles.cardActionLink}>
                    View All Assignments
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            </Link>

            {/* 3. DAILY MUTABAAH TRACKER CARD */}
            <Link href="/(tabs)/daily-tracker" asChild>
              <Pressable style={styles.dashboardCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardIcon}>📋</Text>
                    <Text style={styles.dashCardTitle}>
                      Past & Daily Mutabaah
                    </Text>
                  </View>
                  <Text style={styles.gaugeFraction}>
                    {mutabaahStats.todayCompleted}/{mutabaahStats.todayTotal}
                  </Text>
                </View>

                <View style={styles.gaugeTrack}>
                  <View
                    style={[
                      styles.gaugeFill,
                      {
                        width: `${mutabaahStats.todayPercentage}%`,
                        backgroundColor: getGaugeColor(
                          mutabaahStats.todayPercentage,
                        ),
                      },
                    ]}
                  />
                </View>

                <View style={styles.mutabaahFooterStats}>
                  <View style={styles.statPill}>
                    <Text style={styles.statPillLabel}>Today's Done</Text>
                    <Text style={styles.statPillVal}>
                      {mutabaahStats.todayPercentage}%
                    </Text>
                  </View>
                  <View style={styles.statPill}>
                    <Text style={styles.statPillLabel}>7-Day Average</Text>
                    <Text style={styles.statPillVal}>
                      {mutabaahStats.past7DaysAvgPercentage}%
                    </Text>
                  </View>
                </View>

                <View style={styles.cardFooterRow}>
                  <Text style={styles.cardActionLink}>Open Daily Tracker</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            </Link>
          </>
        )}

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
  loadingBox: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: "#718096",
  },
  dashboardCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardIcon: { fontSize: 22 },
  dashCardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2d3748",
  },
  gaugeFraction: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2b6cb0",
  },
  gaugeTrack: {
    height: 10,
    backgroundColor: "#edf2f7",
    borderRadius: 5,
    overflow: "hidden",
    marginVertical: 8,
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 5,
  },
  cardSubText: {
    fontSize: 12,
    color: "#718096",
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f7fafc",
  },
  cardActionLink: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2b6cb0",
  },
  chevron: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#a0aec0",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  submittedBadge: {
    backgroundColor: "#c6f6d5",
  },
  dueBadge: {
    backgroundColor: "#feebc8",
  },
  overdueBadge: {
    backgroundColor: "#fed7d7",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#2d3748",
  },
  assignmentDetails: {
    marginVertical: 6,
    padding: 10,
    backgroundColor: "#f7fafc",
    borderRadius: 8,
  },
  assignmentTitleText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2d3748",
  },
  assignmentDescText: {
    fontSize: 12,
    color: "#4a5568",
    marginVertical: 4,
  },
  dueDateLabel: {
    fontSize: 11,
    color: "#718096",
    fontWeight: "600",
  },
  mutabaahFooterStats: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 8,
  },
  statPill: {
    flex: 1,
    backgroundColor: "#f7fafc",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  statPillLabel: {
    fontSize: 11,
    color: "#718096",
  },
  statPillVal: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2d3748",
    marginTop: 2,
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
