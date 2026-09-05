# 실기기(iPhone) 실영상 검증 runbook — P1.1

목표는 하나다. **동의된 본인 정면·슈팅사이드 영상**이 실제 iPhone에서
네이티브 MediaPipe → `LandmarkSequenceV2` → 위상 정렬 → 101×12 4D 추정 → 품질 판정을
통과하거나, 실패 이유를 **안정 reason code와 파생 지표**로 남기는 것.
한 쌍이 통과해도 그것은 E2E 스모크 테스트이지 3D 정확도 검증이 아니다. 결과 경계는
계속 `representative_phase_fused_4d_estimate_not_actual_3d`다.

## 0. 절대 규칙 (저장소가 public인 동안 특히)

| 절대 Git·PR·Issue·CI 로그·`HANDOFF.md`에 넣지 않는 것 | 유일하게 공유해도 되는 것 |
| --- | --- |
| 촬영 영상, 기기에서 나온 `LandmarkSequenceV2` 원본 JSON, 얼굴 랜드마크, native `z`, 프레임 timestamp | 앱이 만든 파생 리포트 JSON (`TwoViewEvaluationReportV1`) |
| 파일명, URI, 절대경로, macOS/Windows 사용자명, 이름·이메일·동의자 정보 | 파생 리포트의 지표 요약을 `HANDOFF.md`에 PR로 기록한 것 |
| Apple 인증서·provisioning profile·UDID, Firebase·EAS·Apple 토큰·자격증명 | 익명 동의 기록 id (예: `local-consent-20260902-001`) |

앱은 원본을 내보내는 기능이 없다. 리포트는 사용자가 버튼을 눌렀을 때만 앱 캐시에 임시
`.json` 파일로 생성되어 시스템 공유 시트로 전달된다. 공유 성공·취소·오류 뒤에는 임시 파일
삭제를 시도하며, 자동 업로드·Firestore 저장·HTTP 전송은 코드상 존재하지 않는다
(`tests/shooting-profile-real-video-evaluation*.test.ts`가 이를 고정한다).

## 1. 환경별 가능 범위

| 단계 | macOS + Xcode | Windows |
| --- | --- | --- |
| 의존성 설치, typecheck, lint, 유닛 테스트, web export | 가능 | 가능 (`corepack pnpm`) |
| Firestore Emulator (`pnpm test:rules`) | 가능 (Java 21 필요) | Java 없으면 불가 → PR CI로 대체 |
| `expo prebuild` + CocoaPods + iOS 빌드 | 가능 | **불가** |
| custom development build를 실제 iPhone에 설치 | 가능 (Xcode 또는 EAS) | 로컬 빌드 불가. EAS 클라우드 빌드 실행·설치 링크 확인은 가능 |
| 실영상 촬영·평가 리포트 생성·공유 | iPhone에서 | iPhone에서 |
| 파생 리포트 검토 및 `HANDOFF.md` 기록 | 가능 | 가능 |

## 2. custom development build (macOS/Xcode)

사전 조건: 프로젝트 Expo SDK가 지원하는 Xcode, CocoaPods, Node 22, pnpm 9.12.0(Corepack),
개발용 Apple 계정에 등록된 iPhone. 자격증명은 Xcode/EAS의 대화형 로그인으로만 입력하고
문서·셸 히스토리·로그에 남기지 않는다.

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
CI=true pnpm install --frozen-lockfile
```

플래그는 `.env.local`(gitignored, `.env*.local`)에만 둔다. 세 개의 V2 플래그가 없으면 캡처 화면
자체가 열리지 않는다. 평가 플래그는 정확히 `1`이어야 하고, 개발 빌드(`__DEV__`)에서만 패널이
보인다.

```bash
cat > .env.local <<'EOF'
EXPO_PUBLIC_FORMPATH_CAPTURE_V2=1
EXPO_PUBLIC_FORMPATH_PROFILE_V2=1
EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D=1
EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL=1
EXPO_PUBLIC_FORMPATH_CONSENT_RECORD_ID=local-consent-20260902-001
EOF
git check-ignore .env.local   # 반드시 ".env.local"이 출력돼야 한다
```

`EXPO_PUBLIC_FORMPATH_CONSENT_RECORD_ID`는 **불투명한 로컬 기록 키**이며 형식이 정확히
`local-consent-YYYYMMDD-NNN` 하나로 고정되어 있다(`NNN`은 그날의 3자리 일련번호). 이 값은 리포트에
그대로 담겨 공유되므로, 이름이 섞일 여지를 없애려고 형식 자체를 고정했다. 다른 형식은
`consent_record_invalid`로 거부된다. 동의자 정보는 어디에도 기록하지 않는다.

빌드와 설치 (물리 기기 연결 후):

```bash
pnpm exec expo prebuild --platform ios --clean
(cd ios && pod install)            # MediaPipeTasksVision 0.10.21이 정확히 해석돼야 한다
pnpm exec expo run:ios --device    # 기기를 선택하고 Xcode 서명은 대화형으로 처리
```

`expo run:ios`가 Metro를 함께 띄운다. 별도 실행이 필요하면
`pnpm exec expo start --dev-client`를 같은 `.env.local`이 있는 디렉터리에서 실행한다.
`docs/iphone-custom-build-qa.md`의 model SHA-256·license gate는 **출시** 전 게이트이며,
이 스모크 테스트를 막지는 않지만 결과를 출시 근거로 쓰려면 먼저 통과해야 한다.

## 3. EAS를 쓰는 경우 (자격증명 무기록 절차)

저장소에는 `eas.json`이 없다. 소유자가 직접 다음을 **대화형으로** 실행한다. 어떤 값도
문서·로그·PR에 붙여넣지 않는다.

```bash
pnpm dlx eas-cli@latest login            # 브라우저/대화형 로그인만 사용
pnpm dlx eas-cli@latest build:configure  # eas.json 생성 후 내용 검토; 토큰은 절대 파일에 넣지 않음
pnpm dlx eas-cli@latest build --platform ios --profile development
```

- `EXPO_PUBLIC_*` 플래그는 EAS 프로필의 `env`에 두거나, 빌드 시 셸 환경에서만 넘긴다. `.env.local`은
  EAS에 업로드되지 않으므로 프로필 `env`에 위 네 값을 명시해야 한다.
- Apple 로그인·인증서 생성은 EAS의 대화형 프롬프트에서만 처리한다. `EXPO_TOKEN`,
  `EXPO_APPLE_APP_SPECIFIC_PASSWORD` 등을 셸 히스토리에 남기지 않는다(`HISTFILE` 비활성 권장).
- Windows에서도 위 명령은 가능하지만, 빌드 결과 설치와 이후 단계는 iPhone에서 진행한다.

## 4. 촬영 조건

- 정면 카메라: 슈터 정면, 림 방향에서 슈터를 바라보는 위치. 슈팅사이드 카메라: 슈팅 팔 쪽
  정확한 측면(오른손 슈터는 오른쪽). 두 카메라 모두 고정, 수평, 같은 거리감.
- 프레임 안에 **머리부터 발끝까지 전신**, **공**, 가능하면 **림**이 준비부터 팔로우스루까지
  계속 보이게 한다. 팔로우스루에서 손목이 프레임 위로 나가면 `phase_detection_failed`가 난다.
- 클립 길이 **5–20초**(앱은 2–20초만 받는다). 한 클립에 완결된 슛 1회, 시작·끝에 1초 이상 정지.
- 정면과 측면은 **다른 시간에 찍힌 별개의 슛**이다. 딥·상승·릴리스 리듬을 비슷하게 유지한다.
  리듬이 다르면 `cross_view_phase_mismatch`로 recapture된다. 이것은 결함이 아니라 설계된 판정이다.
- 밝은 조명, 단색 배경, 몸에 붙는 옷, 한 명만 화면에. 슬로모션·편집·필터 없음.

## 5. Basic 1+1 첫 스모크 테스트

1. 앱 → 개인 캡처 화면 → 모드 **Basic 1+1** → 슈팅 손 선택 → 정면 클립 → 측면 클립.
   **평가 증거로 쓰려면 두 클립 모두 슬롯의 "촬영" 버튼으로 앱 안에서 직접 찍어야 한다.**
   사진 라이브러리에서 고른 영상은 출처를 확인할 수 없어 평가에서 제외된다
   (`library_source_not_admissible`). 프로필 저장 자체는 라이브러리 영상으로도 되지만,
   이번 검증 증거로는 인정되지 않는다.
2. 슬롯이 거부되면(`native_build_required`, `person_roi_unavailable`, 품질 사유) 아래 8절 표대로 조치.
3. 두 클립이 모두 통과하면 앱이 자동으로 위상 정렬·추정을 실행한다. 결과는 둘 중 하나다.
   - **리뷰 화면**: 대표 슛폼 + confidence(Basic은 0.65 상한). **저장 버튼은 누르지 않아도 된다.**
     이 검증에는 Firestore 저장이 필요 없다.
   - **오류 화면 + reason code**: recapture. 이것도 유효한 검증 결과다.
4. 화면 하단의 **INTERNAL · DEV BUILD ONLY — 파생 평가 리포트** 패널에서 먼저
   **"본인이 촬영했고 사용에 동의한 영상입니다"** 체크박스를 누른다. 이 확인 없이는 생성
   버튼이 비활성 상태로 남는다.
5. `파생 리포트 생성`을 누른다. 생성 중에는 버튼이 `생성 중…`으로 바뀌고 진행 표시가 나오며
   연속으로 눌러도 한 번만 실행된다. 상태 줄에 `파생 리포트 준비됨 · complete` 또는
   `· recapture_required · <reason>`이 보여야 한다.
   `리포트를 만들지 못했습니다 · <reason>`이면 8절.
   리포트는 생성 시점의 두 클립에 대한 증거이므로, 어느 슬롯이든 다시 촬영하면 즉시 폐기되고
   상태가 초기로 돌아간다. 재촬영 뒤에는 새로 생성해야 한다.
6. `리포트 공유 · 저장`을 누른다. 공유 시트에
   `formpath-derived-evaluation-<opaque>.json` 파일이 표시되는지 확인한 뒤 **파일에 저장**을
   선택한다. JSON 내용이 메시지 본문으로만 보이면 실패다. 취소하면 상태가
   `공유를 취소했습니다`로 바뀌며 오류가 아니고, 메모리의 리포트로 새 임시 파일을 만들어
   다시 공유할 수 있다. VoiceOver를 켜두면 각 상태가 음성으로 안내된다.

## 6. High 3+3 반복성 테스트 (Basic 통과 후)

같은 조건으로 정면 3개, 측면 3개를 촬영해 **High accuracy 3+3**을 실행한다. 리포트의
`pipeline.selectedAttemptsByView`가 뷰당 2개 이상인지, `evidenceSummary.retainedAnchorDispersion`과
`maximumRetainedSpreadDegrees`가 Basic보다 어떻게 달라지는지 기록한다.
`no_complete_agreeing_subset`은 세 번의 슛이 서로 충분히 비슷하지 않았다는 뜻이다.

## 7. 파생 리포트 기록

파일 앱에 저장된 JSON을 Mac/PC로 옮긴 뒤(AirDrop/USB), 다음만 `HANDOFF.md`에 PR로 기록한다.

| 항목 | JSON 경로 |
| --- | --- |
| pipeline status / stable reason code / detail | `pipeline.status`, `pipeline.reason`, `pipeline.detail` |
| phase anchor detection 결과 | `attempts[].phaseDetection` |
| cross-view anchor delta / interval RMSE / confidence | `crossViewAlignment.maximumIntermediateAnchorDelta`, `.phaseIntervalRmse`, `.confidence` |
| representative confidence | `pipeline.confidence` |
| cone·covariance 분포 | `reconstruction.uncertainty.coneDegrees`, `.covarianceTrace` |
| bone-length drift / discontinuity count | `reconstruction.boneLengthDriftMax`, `.discontinuityCount` |
| runtime | `runtime.processingMs`, `runtime.peakHeapBytes` |
| schema·raw-evidence guard 통과 여부 | 앱이 리포트를 만들었다는 사실 자체가 두 가드 통과를 뜻한다 (`buildRealVideoEvaluation`) |

기록 전에 JSON을 눈으로 훑어 `consentRecordId` 외에 식별 정보가 없는지 확인한다. 리포트는
설계상 파일명·경로·타임스탬프·랜드마크를 담지 않지만, 검토는 소유자의 책임이다.
필요하면 워크스테이션에서 `corepack pnpm eval:two-view`(Node CLI)로 같은 스키마를 다시
검증할 수 있다. 단, 그 CLI는 원본 `LandmarkSequenceV2` JSON을 입력으로 받으므로 실기기
경로에서는 사용하지 않는다(원본 반출 금지).

## 8. reason code별 다음 조치

| 위치 | code | 뜻 | 다음 조치 |
| --- | --- | --- | --- |
| 슬롯 | `native_build_required` | 네이티브 모듈이 없는 빌드(Expo Go/시뮬레이터) | 2절의 custom development build로 다시 설치 |
| 슬롯 | `model_missing` | `pose_landmarker_full.task` 리소스 번들 누락 | `pod install` 재실행, 빌드 산출물의 `FormpathPose.bundle` 확인 |
| 슬롯 | `person_roi_unavailable` | 한 사람의 전신 영역을 안정적으로 못 잡음 | 한 명만, 전신 상시 노출, 카메라 고정 |
| 슬롯 | `too_few_detected_frames`, `low_detection_ratio` | 프레임 대부분에서 포즈 실패 | 조명·거리·고정, 2–20초 재촬영 |
| 슬롯 | `low_critical_joint_coverage` | 어깨·손목·골반·무릎·발목 가시성 부족 | 전신·슈팅 팔 가림 제거 |
| 슬롯 | `critical_phase_gap` | 릴리스 전후 포즈 끊김 | 릴리스 구간이 프레임 안에서 이어지게 |
| 세션 | `phase_detection_failed` + detail `missing_dip` / `missing_rise` / `missing_release_proxy` / `missing_follow_through` / `insufficient_total_motion` / `degenerate_body_scale` / `critical_phase_gap` | 준비→딥→상승→릴리스→팔로우스루 중 하나를 못 찾음 | detail이 가리키는 구간이 확실히 보이게 한 번의 완결된 슛으로 재촬영; 팔로우스루 후 0.5초 이상 유지 |
| 세션 | `cross_view_phase_mismatch` | 정면·측면 슛 리듬 차이 > 0.10 (앵커 간격 RMSE > 0.08) | 리듬을 맞춰 한 뷰만 재촬영. 임계값을 낮추지 않는다 |
| 세션 | `uncertainty_exceeds_limit` (+ `affectedBones`) | 해당 뼈의 콘이 25°를 넘음 (대개 수평에 가까운 어깨선·두 뷰 타이밍 불일치의 결합) | 카메라를 정면·정측면에 더 정확히 배치, 리듬 일치 |
| 세션 | `no_complete_agreeing_subset` (High) | 3회 슛이 서로 불일치 | 같은 슛 종류·리듬으로 재촬영 |
| 세션 | `vertical_sign_disagreement`, `both_views_horizontal`, `ill_conditioned_projection_constraints`, `collapsed_front_projection`, `collapsed_side_projection` | 두 뷰의 뼈 방향이 기하학적으로 양립 불가 | 뷰 라벨(정면/측면)과 슈팅 손 설정 확인, 카메라 각도 교정 |
| 세션 | `inconsistent_skeleton_closure`, `perturbation_scenario_shortfall` | 어깨 폐합 또는 섭동 시나리오 실패 | 상체가 가려지지 않게, 카메라 고정 |
| 세션 | `attempt_set_invalid`, `invalid_attempt`, `view_mismatch`, `shooting_hand_mismatch` | 세션 구성 오류 | 모드·손·슬롯을 처음부터 다시 설정 |
| 리포트 | `session_not_ready` | 리뷰/오류 상태가 아니거나 슬롯 시퀀스가 없음 | 두 클립이 모두 통과한 뒤 다시 시도 |
| 리포트 | `library_source_not_admissible` | 클립을 사진 라이브러리에서 골랐음 | 슬롯의 "촬영"으로 앱 안에서 직접 다시 촬영 |
| 리포트 | `unknown_capture_source` | 슬롯의 촬영 출처 기록이 없음(이전 세션 잔여 등) | 해당 슬롯을 재촬영 |
| 리포트 | `consent_not_confirmed` | 동의 체크박스를 누르지 않음 | 패널의 동의 확인을 누른 뒤 다시 생성 |
| 리포트 | `consent_record_invalid` | `EXPO_PUBLIC_FORMPATH_CONSENT_RECORD_ID`가 없거나 `local-consent-YYYYMMDD-NNN` 형식이 아님 | 2절 형식대로 `.env.local`을 고치고 앱을 다시 시작 |
| 리포트 | `duplicate_view_projection` | 두 뷰가 사실상 같은 투영(같은 각도 재촬영, 재표기) | 정면과 슈팅 측면을 실제로 다른 각도에서 촬영 |
| 리포트 | `mirrored_view_projection` | 한 클립이 다른 클립의 좌우 반전본 | 미러링된 영상을 쓰지 말고 두 각도를 각각 촬영 |
| 리포트 | `report_build_failed`, `schema_invalid`, `raw_evidence_detected` | 리포트 생성·가드 실패 | 코드 결함 가능성. reason만 기록하고 리포트를 공유하지 말 것 |

## 9. 사용 후 정리

- iPhone: 사진 앱에서 촬영 클립 삭제 → **최근 삭제된 항목**에서도 삭제. 파일 앱의 리포트는 옮긴 뒤 삭제.
- 앱 캐시: 파생 리포트 임시 파일은 공유 시트가 끝난 뒤 자동 삭제를 시도한다. 개발 빌드 앱을
  삭제하면 picker 캐시 사본과 정리 실패로 남은 앱 캐시도 함께 사라진다.
- Mac/PC: `.env.local` 삭제, `ios/` 프리빌드 디렉터리(gitignored)와 임시 리포트 삭제,
  `git status --short`와 `git ls-files | grep -iE "\.(mp4|mov|json)$"`로 추적 파일 확인.
- 기록: `HANDOFF.md`에는 8절 표의 파생 지표와 동의 기록 id만 남긴다.

## 10. 검증 완료 판정

- 한 쌍이 `complete`로 끝났거나 안정 reason code로 recapture됐고 리포트가 스키마·raw-evidence
  가드를 통과했으면 **P1.1 E2E 스모크 완료**다. 상태 문구는
  `real_video_smoke_completed_not_accuracy_validated`까지만 쓴다.
- `real_video_validated`, `product_ready`, `accuracy_verified`는 `docs/representative-4d-validation-protocol.md`의
  독립 ground-truth 검증 없이는 쓰지 않는다.
- 실기기가 없으면 상태는 `code_complete_but_real_video_validation_blocked` /
  `real_video_fixture_unavailable`로 유지한다.
