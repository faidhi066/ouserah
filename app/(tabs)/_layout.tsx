import { HeaderTopBar } from "@/components/HeaderTopBar";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { View } from "react-native";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <View style={{ flex: 1 }}>
      {/* Top Header Bar with Usrah Group Selector, Notification Bell & Profile Avatar */}
      <HeaderTopBar />

      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme].tint,
          headerShown: false,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: "house.fill", android: "home", web: "home" }}
                tintColor={color}
                size={25}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="daily-tracker"
          options={{
            title: "Tracker",
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{
                  ios: "checkmark.square",
                  android: "check_box",
                  web: "check",
                }}
                tintColor={color}
                size={25}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="attendance"
          options={{
            title: "Attendance",
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{
                  ios: "calendar",
                  android: "calendar_today",
                  web: "link",
                }}
                tintColor={color}
                size={25}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="assignments"
          options={{
            title: "Assignments",
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: "book.fill", android: "book", web: "book" }}
                tintColor={color}
                size={25}
              />
            ),
          }}
        />
        {/* Hide Profile from bottom tab bar since it's now in the top bar right */}
        <Tabs.Screen
          name="profile"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </View>
  );
}
