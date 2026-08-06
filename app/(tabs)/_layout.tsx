import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { font, fontSize, labelType } from '../../src/theme';
import { useTheme } from '../../src/ui/theme';

export default function TabsLayout() {
  const { palette } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        // Der Bildschirmtitel im Schmalschnitt: dieselbe Schrift wie die
        // Uhrzeiten darunter, damit Kopf und Liste zusammengehören.
        headerTitleStyle: {
          color: palette.text,
          fontFamily: font.display,
          fontSize: fontSize.xxl,
        },
        headerShadowVisible: false,
        // Ohne das bleibt die Fläche hinter den Listen auf der Voreinstellung
        // der Navigation stehen — im dunklen Schema stand dann ein weißer
        // Untergrund hinter dunklen Karten. Der Stack darüber setzt seine
        // eigene Fläche; die Reiter brauchen ihre eigene Angabe.
        sceneStyle: { backgroundColor: palette.background },
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        // 10 Punkt: "Einstellungen" in Versalien ist das längste Wort der
        // Reiterleiste und muss auf schmalen Geräten in eine Zeile passen.
        //
        // **Vier Reiter sind das Maximum.** Am 6. August 2026 auf einem
        // iPhone 17 Pro nachgemessen: Mit einem fünften steht dort
        // "EINSTELLUN…" — abgeschnitten. Kleiner setzen hilft nicht, das
        // ist schon die Untergrenze für Lesbarkeit. Wer etwas hinzufügen
        // will, muss also etwas anderes herausnehmen; der naheliegende
        // Kandidat ist "Einstellungen" hinter einem Zahnrad im Kopf, weil
        // man dort einmal hingeht und nicht täglich.
        tabBarLabelStyle: { ...labelType, fontSize: 10 },
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Termine',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'Aktuelles',
          tabBarIcon: ({ color, size }) => <Ionicons name="newspaper-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="verein"
        options={{
          title: 'Verein',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="einstellungen"
        options={{
          title: 'Einstellungen',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
