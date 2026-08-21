# Curry·Paul George 2D Skeleton Review Audit

두 asset은 실제 local source video에서 MediaPipe 33-landmark를 추출해 만든 **single-view 2D skeleton review**다. 이 기록은 3D motion 또는 metric biomechanics claim이 아니다.

| 선수 | Source review asset | Visual audit | Quality | UI boundary |
| --- | --- | --- | --- | --- |
| Stephen Curry | `curry-source-skeleton-01` | 준비→딥→상승→릴리스→팔로우스루에서 전신·공·손목 상승이 연속적으로 overlay됨 | 59/59 detected, visibility 0.915 | fixed source-view 2D review only |
| Paul George | `paul-george-source-skeleton-01` | 0–742ms clip에서 ball lift·상승·릴리스·팔로우스루가 연속적으로 overlay됨 | 31/31 detected, visibility 0.837 | fixed source-view 2D review only |

## 확인된 제한

Curry source의 MediaPipe hand semantic은 source mirroring/camera orientation 때문에 athlete의 실제 shooting-hand identity와 다르게 보일 수 있다. UI는 `shootingHandEstimate`를 player fact로 노출하지 않고 source-view landmark review로 표시한다.

두 review asset 모두 depth (`z`)를 UI asset에서 제외한다. 2D skeleton에는 rotation, depth measurement, recommendation, product motion admission을 제공하지 않는다.

## Audit sheets

- `artifacts/visual-audits/curry-source-skeleton-review.png`
- `artifacts/visual-audits/paul-george-source-skeleton-review.png`

## UI integration check

2026-08-21 mobile web render에서 `/motion`과 `/library`는 TypeScript/build error 없이 기존 actual optical 3D card를 정상 표시했다. 실제 player source skeleton cards는 이 긴 3D viewer 뒤에 배치되어 첫 viewport에서 바로 확인되지 않으므로, UI 목적에 맞게 다음 수정에서 player skeleton section을 optical viewer보다 위로 이동한다. 이 순서 변경은 source boundary를 바꾸지 않는다.

상단 재배치 뒤 첫 mobile preview capture는 변경 전 static bundle을 보여 주었다. source는 최신 TypeScript로 갱신됐으나 preview service refresh가 필요하므로, restart 뒤 최신 `/motion`과 `/library`로 다시 검증한다.

재시작된 최신 mobile preview에서 두 화면은 Curry source skeleton을 first viewport에 표시했다. Paul George card는 바로 아래 scroll 영역에서 접근 가능하다. raw normalized landmark coordinate가 canvas 내부에서 작게 보이므로, source relative geometry는 유지한 채 viewer 안에서 fit-to-frame으로 확대하는 후속 보정을 적용한다.

fit-to-frame 보정 후 최신 mobile preview는 Curry의 준비 phase 전신 관절을 canvas에 크게 표시했다. Motion Studio와 Library는 둘 다 player source skeleton section을 first viewport에 두며, Paul George는 동일 section의 다음 card에서 five-phase control로 확인할 수 있다. viewer asset에는 z field가 없고 fixed 2D review boundary copy가 표시된다.
