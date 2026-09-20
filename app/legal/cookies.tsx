import { LegalDocumentScreen } from "@/components/legal/legal-document-screen";

export default function CookieNoticeScreen() {
  return (
    <LegalDocumentScreen
      title="쿠키 안내"
      intro="이 안내는 Hoop Hub의 웹 환경에 적용됩니다. 네이티브 iOS 앱의 Firebase 인증 저장 방식과 웹 쿠키는 서로 다른 기술입니다."
      sections={[
        {
          title: "필수 인증 세션",
          paragraphs: [
            "웹 서버 인증 경로가 사용되는 경우 app_session_id 쿠키가 로그인 세션을 유지하는 데 사용될 수 있습니다. 이 쿠키는 인증과 보안에 필요한 세션 정보이며 광고 목적의 쿠키가 아닙니다.",
            "현재 릴리스 범위에서는 광고·행동 추적을 위한 쿠키 또는 마케팅 쿠키를 의도적으로 사용하지 않습니다.",
          ],
        },
        {
          title: "비필수 쿠키가 추가되는 경우",
          paragraphs: [
            "향후 분석·광고 등 비필수 쿠키를 도입하면 실제 배포 동작을 다시 감사하고, 적용 법령에서 동의가 필요한 경우 사용 전에 선택권을 제공합니다. 현재 필수 인증 쿠키만을 이유로 불필요한 동의 배너를 표시하지 않습니다.",
          ],
        },
      ]}
    />
  );
}
