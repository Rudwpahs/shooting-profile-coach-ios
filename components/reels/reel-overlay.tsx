import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GlassSurface } from "@/components/glass/glass-surface";
import { REEL_PROGRESS_HEIGHT, ReelProgress } from "@/components/reels/reel-progress";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { LiquidPressable } from "@/components/ui/liquid";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { useDeviceReactions } from "@/hooks/use-device-reactions";
import { SHOT_PHASES } from "@/lib/pose-motion";
import { reelLine, reelTitle, type ReelItem } from "@/lib/reels/reel-model";

/** The virtual display views, in menu order. Display yaw only; never the capture protocol. */
export const REEL_VIEWS: readonly { id: RepresentativeViewId; label: string }[] = [
  { id: "front", label: "정면" },
  { id: "oblique", label: "사선" },
  { id: "side", label: "측면" },
];

const CONTROL = 44;
const INDICATOR = 60;
/** Clearance under the top controls: the figure is fitted below the heading or back control and the camera menu. */
export const REEL_STAGE_TOP = CONTROL + 8;
/** Clearance above the bottom band: the rail, the caption, the phase line and its dots never meet the figure's feet. */
export const REEL_STAGE_BOTTOM = 148;
const RAIL_BOTTOM = 132;
const CAPTION_BOTTOM = 72;

export type ReelOverlayInsets = { top: number; bottom: number };

/** What a surface adds to 동작 정보: its own provenance body and, if any, one primary action. */
export type ReelInfo = Readonly<{
  body?: ReactNode;
  action?: Readonly<{ label: string; onPress: () => void }>;
}>;

type ReelOverlayProps = {
  item: ReelItem;
  /** Shows the small play indicator; the only playback chrome there is. */
  paused: boolean;
  view: RepresentativeViewId;
  onViewChange: (view: RepresentativeViewId) => void;
  /** `null` draws no close affordance: the feed lives inside a tab and the tab bar is the way out. */
  onClose: (() => void) | null;
  /** A screen title at the top left when there is no close control (참조 동작, 탐색). */
  heading?: string | null;
  /** `null` hides the analysis entry inside 동작 정보 (a reference or film shot has no analysis of its own). */
  onOpenAnalysis: (() => void) | null;
  info?: ReelInfo;
  /** Skeleton media: the shot phase the stage is at (0–4) and the seek; film media has neither. */
  activePhase: number | null;
  onSeekPhase: ((phase: number) => void) | null;
  /** Lets the item hold playback while a sheet covers the stage. */
  onSheetChange?: (open: boolean) => void;
  width: number;
  height: number;
  insets: ReelOverlayInsets;
  progress: Animated.Value;
};

function defaultInfoLines(item: ReelItem): string[] {
  if (item.kind === "reference") {
    const { reference } = item;
    return [
      reference.sourceAttribution,
      "광학 모션 캡처로 측정한 3D 참조 동작입니다. 화면의 움직임은 원본 단계 사이를 부드럽게 보간합니다.",
      `원본 C3D 프레임${reference.sourcePhaseFrames ? `: ${reference.sourcePhaseFrames.join(" · ")}` : " 정보 없음"}`,
    ];
  }
  if (item.kind === "film") {
    return [
      "내 영상 · 이 기기에만 보관 · 어디에도 업로드되지 않음",
      `${item.clips.length}개 클립 · 포즈 분석 없음`,
      "iPhone 앱에서 촬영하면 대표 슛폼 분석이 만들어집니다.",
    ];
  }
  return [
    reelLine(item),
    "위상 결합 4D 추정 · 실측 3D 아님 · 추천 사용 아님",
  ];
}

const GESTURE_HELP = "화면을 누르면 재생·정지합니다. 아래 점을 누르면 해당 단계로 이동하고, 시점은 오른쪽 위 아이콘에서 바꿉니다.";

/**
 * Everything drawn over a Reel besides the media, the 참조 동작 way: a heading
 * or back control top-left, the camera menu top-right, a heart · memo · info
 * rail on the right, the caption (name, source, current phase) bottom-left,
 * five phase dots on the progress line, and a play indicator only while
 * paused. The like and the memo stay on this device; 동작 정보 holds provenance and
 * the surface's one action. The centre stays clear unless paused.
 */
export function ReelOverlay({
  item, paused, view, onViewChange, onClose, heading = null, onOpenAnalysis, info, activePhase, onSeekPhase, onSheetChange,
  width, height, insets, progress,
}: ReelOverlayProps) {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<"note" | "info" | null>(null);
  const [draft, setDraft] = useState("");
  const reactions = useDeviceReactions(item.id);
  const skeleton = item.kind !== "film";
  const top = insets.top + 6;
  const progressBottom = insets.bottom + 8;

  useEffect(() => {
    onSheetChange?.(sheet !== null);
  }, [onSheetChange, sheet]);

  const openNote = () => {
    setDraft(reactions.note);
    reactions.clearError();
    setSheet("note");
  };
  const closeSheet = () => setSheet(null);
  const sheetTitle = sheet === "note" ? "동작 메모" : "동작 정보";

  return (
    <View style={[styles.layer, { width, height }]} testID="reel-overlay">
      {onClose || heading || skeleton ? (
        <GlassSurface variant="bar" style={[styles.topRow, { top, width }]}>
          {onClose ? (
            <LiquidPressable
              accessibilityLabel="릴 닫기"
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
              disabled={false}
              magnetic
              onPress={onClose}
              rippleColor={tokens.stageForeground}
              style={styles.control}
              surfaceStyle={styles.controlSurface}
              testID="reel-close"
            >
              <MaterialCommunityIcons name="arrow-left" size={26} color={tokens.stageForeground} />
            </LiquidPressable>
          ) : heading ? (
            <Text accessibilityRole="header" numberOfLines={1} style={styles.heading} testID="reel-heading">{heading}</Text>
          ) : <View style={styles.control} />}
          {skeleton ? (
            <LiquidPressable
              accessibilityLabel="시점 선택"
              accessibilityRole="button"
              accessibilityState={{ disabled: false, expanded: menu }}
              aria-expanded={menu}
              disabled={false}
              magnetic
              onPress={() => setMenu((value) => !value)}
              rippleColor={tokens.stageForeground}
              style={styles.control}
              surfaceStyle={styles.controlSurface}
              testID="reel-view-menu"
            >
              <MaterialCommunityIcons name="orbit" size={24} color={tokens.stageForeground} />
            </LiquidPressable>
          ) : <View style={styles.control} />}
        </GlassSurface>
      ) : null}

      {skeleton && menu ? (
        <GlassSurface variant="panel" style={[styles.menu, { top: top + CONTROL + 6 }]}>
          {REEL_VIEWS.map((candidate) => {
            const selected = candidate.id === view;
            return (
              <LiquidPressable
                key={candidate.id}
                accessibilityLabel={`${candidate.label} 시점`}
                accessibilityRole="button"
                accessibilityState={{ disabled: false, selected }}
                aria-pressed={selected}
                disabled={false}
                magnetic
                onPress={() => { onViewChange(candidate.id); setMenu(false); }}
                rippleColor={selected ? tokens.background : tokens.stageForeground}
                style={styles.menuHit}
                surfaceStyle={[styles.menuItem, selected && styles.menuItemSelected]}
                testID={`reel-view-${candidate.id}`}
              >
                <Text style={[styles.menuText, selected && styles.menuTextSelected]}>{candidate.label}</Text>
              </LiquidPressable>
            );
          })}
        </GlassSurface>
      ) : null}

      {paused ? (
        <View
          style={[styles.indicator, { left: Math.round((width - INDICATOR) / 2), top: Math.round((height - INDICATOR) / 2) }]}
          testID="reel-pause-indicator"
        >
          <MaterialCommunityIcons name="play" size={30} color={tokens.stageForeground} />
        </View>
      ) : null}

      <View style={[styles.rail, { bottom: insets.bottom + RAIL_BOTTOM }]} testID="reel-rail">
        <LiquidPressable
          accessibilityLabel={reactions.liked ? "좋아요 취소" : "좋아요"}
          accessibilityRole="button"
          accessibilityState={{ disabled: !reactions.ready || reactions.saving, selected: reactions.liked }}
          aria-pressed={reactions.liked}
          disabled={!reactions.ready || reactions.saving}
          magnetic
          onPress={() => void reactions.toggleLike()}
          rippleColor={tokens.stageForeground}
          style={styles.railControl}
          surfaceStyle={styles.railSurface}
          testID="reel-like"
        >
          <MaterialCommunityIcons name={reactions.liked ? "heart" : "heart-outline"} size={30} color={reactions.liked ? tokens.primary : tokens.stageForeground} />
        </LiquidPressable>
        <LiquidPressable
          accessibilityLabel="동작 메모"
          accessibilityRole="button"
          accessibilityState={{ disabled: !reactions.ready || reactions.saving }}
          disabled={!reactions.ready || reactions.saving}
          magnetic
          onPress={openNote}
          rippleColor={tokens.stageForeground}
          style={styles.railControl}
          surfaceStyle={styles.railSurface}
          testID="reel-note"
        >
          <MaterialCommunityIcons name="comment-outline" size={29} color={tokens.stageForeground} />
        </LiquidPressable>
        <LiquidPressable
          accessibilityLabel="동작 정보"
          accessibilityRole="button"
          accessibilityState={{ disabled: false, expanded: sheet === "info" }}
          aria-expanded={sheet === "info"}
          disabled={false}
          magnetic
          onPress={() => { reactions.clearError(); setSheet("info"); }}
          rippleColor={tokens.stageForeground}
          style={styles.railControl}
          surfaceStyle={styles.railSurface}
          testID="reel-info"
        >
          <MaterialCommunityIcons name="book-open-outline" size={30} color={tokens.stageForeground} />
        </LiquidPressable>
      </View>

      <View style={[styles.caption, { bottom: insets.bottom + CAPTION_BOTTOM, width }]} testID="reel-caption">
        <Text numberOfLines={2} style={styles.title}>{reelTitle(item)}</Text>
        <Text numberOfLines={1} style={styles.line}>{reelLine(item)}</Text>
        {skeleton && activePhase !== null ? (
          <Text style={styles.phase} testID="reel-phase-label">{SHOT_PHASES[activePhase] ?? ""}</Text>
        ) : null}
      </View>

      {reactions.error && sheet === null ? (
        <View style={[styles.error, { top: top + CONTROL + 10 }]}>
          <Text accessibilityRole="alert" style={styles.errorText}>{reactions.error}</Text>
          {!reactions.ready ? (
            <Pressable accessibilityLabel="저장소 다시 읽기" accessibilityRole="button" accessibilityState={{ disabled: false }} onPress={reactions.retryRead} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
              <Text style={styles.errorText}>다시 읽기</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ReelProgress bottom={progressBottom} progress={progress} width={width} />
      {skeleton && onSeekPhase ? (
        <View style={[styles.dots, { bottom: progressBottom + REEL_PROGRESS_HEIGHT / 2 - 24, width }]} testID="reel-phase-dots">
          {SHOT_PHASES.map((phase, index) => {
            const selected = index === activePhase;
            return (
              <Pressable
                key={phase}
                accessibilityLabel={`${phase} 단계 보기`}
                accessibilityRole="button"
                accessibilityState={{ disabled: false, selected }}
                aria-pressed={selected}
                onPress={() => onSeekPhase(index)}
                style={({ pressed }) => [styles.dotHit, pressed && styles.pressed]}
                testID={`reel-phase-${index}`}
              >
                <View style={[styles.dot, selected && styles.dotSelected]} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {sheet ? (
        <Modal animationType="none" onRequestClose={closeSheet} transparent visible>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modal}>
            <Pressable accessibilityLabel="패널 닫기" accessibilityRole="button" accessibilityState={{ disabled: false }} onPress={closeSheet} style={({ pressed }) => [styles.backdrop, pressed && styles.pressed]} />
            <View accessibilityViewIsModal style={[styles.sheet, { maxHeight: Math.round(height * 0.84) }]} testID="reel-sheet">
              <View style={styles.sheetHeading}>
                <Text accessibilityRole="header" style={styles.sheetTitle}>{sheetTitle}</Text>
                <Pressable accessibilityLabel={`${sheetTitle} 닫기`} accessibilityRole="button" accessibilityState={{ disabled: false }} onPress={closeSheet} style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}>
                  <MaterialCommunityIcons name="close" size={24} color={tokens.foreground} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
                {sheet === "info" ? (
                  <>
                    <Text style={styles.sheetName}>{reelTitle(item)}</Text>
                    {defaultInfoLines(item).map((line) => <Text key={line} style={styles.infoText}>{line}</Text>)}
                    {skeleton ? <Text style={styles.infoText}>{GESTURE_HELP}</Text> : null}
                    {info?.body ?? null}
                    {onOpenAnalysis ? (
                      <LiquidPressable
                        accessibilityLabel="이 슛폼 분석 열기"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: false }}
                        disabled={false}
                        magnetic
                        onPress={() => { closeSheet(); onOpenAnalysis(); }}
                        rippleColor={tokens.primaryForeground}
                        style={styles.actionHit}
                        surfaceStyle={styles.action}
                        testID="reel-analysis"
                      >
                        <MaterialCommunityIcons name="chart-timeline-variant" size={22} color={tokens.primaryForeground} />
                        <Text style={styles.actionText}>분석 열기</Text>
                      </LiquidPressable>
                    ) : null}
                    {info?.action ? (
                      <LiquidPressable
                        accessibilityLabel={info.action.label}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: false }}
                        disabled={false}
                        magnetic
                        onPress={() => { closeSheet(); info.action?.onPress(); }}
                        rippleColor={tokens.primaryForeground}
                        style={styles.actionHit}
                        surfaceStyle={styles.action}
                        testID="reel-info-action"
                      >
                        <Text style={styles.actionText}>{info.action.label}</Text>
                      </LiquidPressable>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={styles.infoText}>메모와 좋아요는 이 기기에만 저장됩니다.</Text>
                    <TextInput
                      accessibilityLabel="동작 메모 입력"
                      maxLength={2000}
                      multiline
                      onChangeText={setDraft}
                      placeholder="이 동작에서 참고할 점"
                      placeholderTextColor={tokens.mutedForeground}
                      style={styles.input}
                      value={draft}
                    />
                    <LiquidPressable
                      accessibilityLabel="메모 저장"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: reactions.saving, busy: reactions.saving }}
                      disabled={reactions.saving}
                      magnetic
                      onPress={() => { void reactions.saveNote(draft).then((saved) => { if (saved) closeSheet(); }); }}
                      rippleColor={tokens.primaryForeground}
                      style={styles.actionHit}
                      surfaceStyle={[styles.action, reactions.saving && styles.disabled]}
                      testID="reel-note-save"
                    >
                      <Text style={styles.actionText}>{reactions.saving ? "저장 중" : "메모 저장"}</Text>
                    </LiquidPressable>
                  </>
                )}
                {reactions.error ? <Text accessibilityRole="alert" style={styles.infoText}>{reactions.error}</Text> : null}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Pass-through containers and decorative layers declare pointerEvents in style
  // (react-native-web deprecates the prop); taps reach the stage beneath.
  layer: { left: 0, pointerEvents: "box-none", position: "absolute", top: 0 },
  topRow: { alignItems: "center", borderWidth: 0, flexDirection: "row", justifyContent: "space-between", left: 0, paddingHorizontal: 6, pointerEvents: "box-none", position: "absolute" },
  control: { height: CONTROL, minHeight: CONTROL, minWidth: CONTROL, width: CONTROL },
  controlSurface: { alignItems: "center", borderRadius: CONTROL / 2, justifyContent: "center" },
  heading: { ...typography.title, color: tokens.stageForeground, flex: 1, paddingLeft: 14 },
  menu: { borderRadius: 16, flexDirection: "row", gap: 4, padding: 4, position: "absolute", right: 8 },
  menuHit: { justifyContent: "center", minHeight: CONTROL, minWidth: 64 },
  menuItem: { alignItems: "center", borderRadius: 12, justifyContent: "center", minHeight: 40, paddingHorizontal: 12 },
  menuItemSelected: { backgroundColor: tokens.foreground },
  menuText: { ...typography.callout, color: tokens.foreground },
  menuTextSelected: { color: tokens.background },
  indicator: {
    pointerEvents: "none",
    alignItems: "center",
    backgroundColor: tokens.elevatedSurface,
    borderColor: tokens.border,
    borderRadius: INDICATOR / 2,
    borderWidth: 1,
    height: INDICATOR,
    justifyContent: "center",
    opacity: 0.94,
    paddingLeft: 4,
    position: "absolute",
    width: INDICATOR,
  },
  rail: { gap: 10, position: "absolute", right: 6 },
  railControl: { height: 48, minHeight: 48, minWidth: 48, width: 48 },
  railSurface: { alignItems: "center", borderRadius: 24, justifyContent: "center" },
  caption: { gap: 2, left: 0, paddingLeft: 20, paddingRight: 76, pointerEvents: "none", position: "absolute" },
  title: { ...typography.headline, color: tokens.stageForeground },
  line: { ...typography.caption, color: tokens.mutedForeground },
  phase: { ...typography.caption, color: tokens.stageForeground, paddingTop: 2 },
  error: { backgroundColor: tokens.surface, borderRadius: 12, left: 20, padding: 12, position: "absolute", right: 76 },
  errorText: { ...typography.caption, color: tokens.foreground },
  retry: { justifyContent: "center", minHeight: 48 },
  dots: { flexDirection: "row", left: 0, paddingHorizontal: 10, position: "absolute" },
  dotHit: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 48 },
  dot: { backgroundColor: tokens.border, borderRadius: 4, height: 8, width: 8 },
  dotSelected: { backgroundColor: tokens.primary, borderRadius: 6, height: 12, width: 12 },
  modal: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: tokens.background, opacity: 0.65 },
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 28 },
  sheetHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingLeft: 24, paddingRight: 12, paddingTop: 8 },
  sheetTitle: { ...typography.title, color: tokens.foreground },
  sheetClose: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
  sheetContent: { gap: 14, paddingBottom: 20, paddingHorizontal: 24, paddingTop: 12 },
  sheetName: { ...typography.headline, color: tokens.foreground },
  infoText: { ...typography.callout, color: tokens.mutedForeground },
  input: { ...typography.body, backgroundColor: tokens.background, borderRadius: 14, color: tokens.foreground, minHeight: 128, padding: 16, textAlignVertical: "top" },
  actionHit: { minHeight: 48 },
  action: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 48, padding: 12 },
  actionText: { ...typography.headline, color: tokens.primaryForeground },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
});
