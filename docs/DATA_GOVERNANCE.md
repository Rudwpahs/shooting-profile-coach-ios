# Reference Data Governance

## 감사 결과

기존 `shooting-form-analysis` 기본 브랜치 `27eada5`를 전수 감사했다. 16개 선수 프로필, 후보 영상 221개, canonical validation JSON 7개가 존재하지만, 각 선수 프로필에는 사람 검토 기반 identity·실제 슛·라이선스·frame-label provenance가 없다. 따라서 16개 프로필 모두 **`unverified_legacy`**로 분류하며, 상업 앱에서 선수 이름으로 매칭하거나 실제 3D 모델이라고 표시하지 않는다.

| 항목 | 감사 결과 | 앱 반영 |
|---|---:|---|
| 기존 프로필 | 16개 | 실명을 제거한 cohort aggregate로만 사용 |
| 후보 영상 | 221개 | source 후보이며, 자동 승인 데이터가 아님 |
| verified reference | 0개 | verified match 또는 verified 3D를 제공하지 않음 |
| legacy 3D validation | canonical source/원본 observation 부족 | 3D 모델 노출 금지 |

## 익명화 원칙

앱에는 선수 이름, 원본 URL, 신장, 팔 길이, 실루엣, 인식 가능한 player embedding을 포함하지 않는다. reference는 release elevation, arm extension, lower-body drive, rhythm의 네 가지 코칭 특성과 관절각 범위로만 표현한다. 이 범위는 legacy cohort의 백분위 분포로부터 만든 **provisional aggregate**이며, 개인의 정답 자세나 의료적 기준이 아니다.

## 상업 출시 전 data gate

reference archetype을 `verified`로 전환하려면 각 archetype에 기여하는 source clip에 실제 영상, 신원 검토, 슛 이벤트 검토, frame label, 사용 상태, 두 명의 reviewer 기록을 보관해야 한다. 같은 source를 중복해 수를 늘릴 수 없으며, 재검토에서 하나라도 실패하면 해당 reference는 `provisional`로 되돌린다. 이 원칙은 기존 provenance-gated pipeline의 clip contract와 동일하다.[1]

## 운영 결론

현재 앱의 자동 추천은 사용자가 선택한 **개선 목표와 본인의 로컬 슛 특성**을 우선 기준으로 사용한다. 익명 reference는 설명 가능한 코칭 language를 보조할 뿐, 특정 선수처럼 던져야 한다는 지시나 verified performance claim을 만들지 않는다. 데이터 검증이 완료될 때까지 앱의 data status 화면은 reference library가 provisional임을 항상 표시한다.

## References

[1]: https://github.com/Rudwpahs/shooting-form-analysis/pull/9 "Provenance-gated verified 3D analysis pipeline"
