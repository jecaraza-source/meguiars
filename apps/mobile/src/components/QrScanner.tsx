import { b2bCopy } from "@meguiars/domain";
import { colors, radius, space } from "@meguiars/ui-tokens";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/ui/controls";
import { textStyle } from "@/ui/theme";

/**
 * Escáner de QR a pantalla completa (expo-camera). Entrega el texto del primer
 * QR que lee y se cierra; pide permiso de cámara la primera vez.
 */
export function QrScanner({
  open,
  title,
  onClose,
  onScanned,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onScanned: (text: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <Text accessibilityRole="header" style={textStyle("heading")}>
          {title}
        </Text>
        {!permission ? null : permission.granted ? (
          open ? (
            <Camera onScanned={onScanned} />
          ) : null
        ) : (
          <View style={styles.stack}>
            <Text style={textStyle("body")}>{b2bCopy.qrCameraDenied}</Text>
            {permission.canAskAgain ? (
              <Button label="Permitir cámara" onPress={() => void requestPermission()} />
            ) : null}
          </View>
        )}
        <Button label="Cerrar" variant="secondary" onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

/** Se monta al abrir: entrega un solo QR por apertura (la cámara repite el mismo código). */
function Camera({ onScanned }: { onScanned: (text: string) => void }) {
  const done = useRef(false);
  return (
    <View style={styles.frame}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          done.current = true;
          onScanned(data);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: space.xl, gap: space.lg, backgroundColor: colors.background },
  stack: { gap: space.md },
  frame: { width: "100%", aspectRatio: 1, borderRadius: radius.lg, overflow: "hidden" },
  camera: { flex: 1 },
});
