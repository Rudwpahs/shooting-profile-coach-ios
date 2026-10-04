import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";

export type FilmShotSheetTarget = Readonly<{ id: string; title: string; onDevice: boolean; inCloud: boolean }>;
export type FilmShotSheetBusy = "keep" | "download" | "delete" | "delete-cloud" | null;

type FilmShotActionsSheetProps = Readonly<{
  target: FilmShotSheetTarget | null;
  /** False in a build that cannot keep footage in the cloud: no cloud action is ever shown. */
  cloudAvailable: boolean;
  canDownload: boolean;
  busy: FilmShotSheetBusy;
  error: string | null;
  onClose: () => void;
  onKeepInCloud: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onDeleteCloudOnly: () => void;
}>;

function whereLine(target: FilmShotSheetTarget): string {
  if (target.onDevice && target.inCloud) return "이 기기와 내 계정 전용 클라우드에 보관 중";
  if (target.inCloud) return "내 계정 전용 클라우드에만 있습니다";
  return "이 기기에만 보관 중 · 어디에도 올라가지 않았습니다";
}

function deleteWarning(target: FilmShotSheetTarget): string {
  if (target.onDevice && target.inCloud) return "이 기기와 클라우드에서 모두 지워지며 되돌릴 수 없습니다.";
  if (target.inCloud) return "클라우드에서 지워지며 되돌릴 수 없습니다.";
  return "이 기기에서 지워지며 되돌릴 수 없습니다.";
}

/**
 * The actions for one film shot, as an in-app sheet so they work in a browser
 * too. It always says where the footage is before offering anything, and a
 * delete takes two presses.
 */
export function FilmShotActionsSheet({
  target, cloudAvailable, canDownload, busy, error, onClose, onKeepInCloud, onDownload, onDelete, onDeleteCloudOnly,
}: FilmShotActionsSheetProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const targetId = target?.id ?? null;
  useEffect(() => { setConfirmingDelete(false); }, [targetId]);
  if (!target) return null;
  const locked = busy !== null;

  const action = (label: string, icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"], onPress: () => void, options: { disabled?: boolean; destructive?: boolean; running?: boolean } = {}) => {
    const disabled = locked || options.disabled === true;
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: options.running === true }}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.action, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
      >
        {options.running ? <ActivityIndicator color={tokens.foreground} size="small" /> : <MaterialCommunityIcons name={icon} size={22} color={options.destructive ? tokens.destructive : tokens.foreground} />}
        <Text style={[styles.actionText, options.destructive && styles.destructiveText]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Modal animationType="fade" onRequestClose={locked ? undefined : onClose} transparent visible>
      <View style={styles.host}>
        <Pressable
          accessibilityLabel="시트 닫기"
          accessibilityRole="button"
          accessibilityState={{ disabled: locked }}
          disabled={locked}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View accessibilityViewIsModal style={styles.sheet} testID="film-shot-actions">
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{target.title}</Text>
          <Text style={styles.where}>{whereLine(target)}</Text>
          {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}

          {cloudAvailable && target.onDevice && !target.inCloud
            ? action("클라우드에도 보관", "cloud-upload-outline", onKeepInCloud, { running: busy === "keep" })
            : null}
          {target.inCloud && !target.onDevice ? (
            <>
              {action("이 기기로 내려받기", "cloud-download-outline", onDownload, { disabled: !canDownload, running: busy === "download" })}
              {!canDownload ? <Text style={styles.note}>이 기기에서는 내려받을 수 없습니다. 브라우저에서 열어 내려받으세요.</Text> : null}
            </>
          ) : null}
          {target.inCloud && target.onDevice
            ? action("클라우드에서만 삭제", "cloud-off-outline", onDeleteCloudOnly, { running: busy === "delete-cloud" })
            : null}

          {confirmingDelete ? (
            <>
              <Text accessibilityLiveRegion="polite" style={styles.warning}>{deleteWarning(target)}</Text>
              {action("삭제 확인", "trash-can-outline", onDelete, { destructive: true, running: busy === "delete" })}
            </>
          ) : action("삭제", "trash-can-outline", () => setConfirmingDelete(true), { destructive: true })}
          {action("닫기", "close", onClose)}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: tokens.background, opacity: 0.65 },
  sheet: { alignSelf: "center", backgroundColor: tokens.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 6, maxWidth: 680, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 18, width: "100%" },
  title: { ...typography.headline, color: tokens.foreground },
  where: { ...typography.callout, color: tokens.mutedForeground, paddingBottom: 6 },
  error: { ...typography.caption, color: tokens.destructive, paddingBottom: 4 },
  warning: { ...typography.caption, color: tokens.warning, paddingTop: 4 },
  note: { ...typography.caption, color: tokens.mutedForeground },
  action: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 12, minHeight: 48, minWidth: 44, paddingHorizontal: 8 },
  actionText: { ...typography.body, color: tokens.foreground, flex: 1 },
  destructiveText: { color: tokens.destructive },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.72 },
});
