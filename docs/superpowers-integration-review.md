# Superpowers 적용 검토

## 검토 대상

| 항목 | 확인 결과 |
| --- | --- |
| 저장소 | [obra/superpowers](https://github.com/obra/superpowers) |
| 설명 | Agentic skills framework 및 software development methodology |
| 라이선스 | MIT |
| 확인한 최신 release | v6.3.0 (2026-08-12) |
| 기본 언어 | Shell |

## 공식 README에서 확인한 workflow

Superpowers는 `brainstorming → using-git-worktrees → writing-plans → subagent-driven-development/executing-plans → test-driven-development → requesting-code-review → finishing-a-development-branch` 순서의 개발 방법론과 agent skill을 제공한다. README는 각 지원 harness에서 별도 plugin/extension 설치를 요구하며, Codex CLI는 공식 plugin marketplace의 `/plugins` UI를 통해 설치하도록 안내한다.

## FormPath 적용 결정

현재 sandbox agent harness에는 Superpowers가 지원하는 plugin manager나 Codex CLI plugin installation runtime이 노출되어 있지 않다. 따라서 이 repository를 앱의 Expo dependency로 설치하거나 project source에 무단 vendor하지 않는다. 대신 MIT 라이선스의 workflow를 **프로젝트 운영 규칙으로 채택**해 design·plan·test gate·review·checkpoint 단계를 project docs와 TODO에 명시한다. Superpowers 자체가 app runtime dependency가 아니므로 iOS/web bundle에 포함되지 않는다.

## Source

- [obra/superpowers README](https://github.com/obra/superpowers/blob/main/README.md)
- [obra/superpowers release v6.3.0](https://github.com/obra/superpowers/releases/tag/v6.3.0)
