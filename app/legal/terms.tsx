import { LegalDocumentScreen } from "@/components/legal/legal-document-screen";
import { LEGAL_CONFIG, legalValue } from "@/lib/compliance/legal-config";

export default function TermsScreen() {
  const operator = legalValue(LEGAL_CONFIG.operatorName, "운영자명");
  const supportEmail = legalValue(LEGAL_CONFIG.supportEmail, "고객지원 이메일");

  return (
    <LegalDocumentScreen
      title="이용약관"
      intro="이 약관은 Hoop Hub 계정과 농구 슈팅 분석 기능의 기본 이용 조건을 설명합니다."
      sections={[
        {
          title: "1. 서비스와 운영자",
          paragraphs: [
            `Hoop Hub 운영자: ${operator}. 서비스는 사용자가 자신의 농구 슈팅 동작을 기록·분석하고 비공개 파생 데이터를 관리할 수 있도록 돕습니다.`,
          ],
        },
        {
          title: "2. 이용 연령과 계정",
          paragraphs: [
            "한국 출시 V1은 만 14세 이상 사용자를 대상으로 합니다. 사용자는 본인이 관리할 수 있는 이메일 주소로 계정을 만들고 계정 자격정보를 안전하게 관리해야 합니다.",
          ],
        },
        {
          title: "3. 분석 결과의 성격",
          paragraphs: [
            "Hoop Hub의 코칭·포즈 결과는 운동 연습을 돕기 위한 정보이며 의료 진단, 치료, 부상 판정 또는 전문 의료 조언이 아닙니다.",
            "별도로 명시되지 않은 대표 동작 추정치는 동기화된 계측 3D나 신체 치수의 정밀 측정값으로 해석해서는 안 됩니다.",
          ],
        },
        {
          title: "4. 사용자가 제공하는 영상",
          paragraphs: [
            "사용자가 제공하는 영상에는 본인이 사용할 권한이 있거나 필요한 촬영·공유 동의를 확보한 콘텐츠만 사용해야 합니다. 타인의 권리, 사생활 또는 관련 법령을 침해하는 콘텐츠를 서비스에 사용해서는 안 됩니다.",
          ],
        },
        {
          title: "5. 금지되는 이용",
          paragraphs: [
            "서비스 보안을 우회하거나 다른 사용자의 비공개 데이터에 접근하려는 행위, 서비스나 분석 결과를 기만적으로 표현하는 행위, 불법적인 목적으로 서비스를 사용하는 행위를 금지합니다.",
          ],
        },
        {
          title: "6. 계정 종료와 문의",
          paragraphs: [
            `사용자는 앱에서 전체 계정 삭제를 시작할 수 있습니다. 서비스 이용 문의: ${supportEmail}. 약관 또는 핵심 데이터 처리 방식이 실질적으로 변경되면 적용 전에 필요한 방법으로 안내합니다.`,
          ],
        },
      ]}
    />
  );
}
