import { APP_NAME, formatInCenterTimeZone } from '@meguiars/core';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  const now = formatInCenterTimeZone(new Date(), 'America/Mexico_City');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.subtitle}>Plataforma de operación · móvil</Text>
      <Text style={styles.caption}>{now} (America/Mexico_City)</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { color: '#52525b' },
  caption: { fontSize: 12, color: '#71717a' },
});
