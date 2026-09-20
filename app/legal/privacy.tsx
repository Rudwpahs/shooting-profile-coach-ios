import { LegalDocumentScreen } from "@/components/legal/legal-document-screen";
import { LEGAL_CONFIG, legalValue } from "@/lib/compliance/legal-config";

export default function PrivacyPolicyScreen() {
  const operator = legalValue(LEGAL_CONFIG.operatorName, "운영자명");
  const privacyContact = legalValue(LEGAL_CONFIG.privacyContact, "개인정보 문의 연락처");
  const firestoreRegion = legalValue(LEGAL_CONFIG.firestoreRegion, "Cloud Firestore 운영 리전");

  return (
    <LegalDocumentScreen
      title="개인정보 처리방침"
      intro="Hoop Hub는 농구 슈팅 분석에 필요한 정보만 처리하고, 촬영 원본과 파생 데이터를 구분해 다룹니다. 실제 운영자 정보와 공개 URL이 확정되지 않은 개발 빌드는 출시 준비가 완료된 것으로 간주하지 않습니다."
      sections={[
        {
          title: "1. 운영자와 처리 목적",
          paragraphs: [
            `운영자: ${operator}. 계정 인증, 사용자 본인의 비공개 슈팅 분석 저장·조회·삭제, 서비스 보안과 지원을 위해 필요한 범위에서 개인정보를 처리합니다.`,
          ],
        },
        {
          title: "2. 처리하는 정보",
          paragraphs: [
            "회원가입과 로그인에는 Firebase Authentication을 사용하며 이메일 주소와 Firebase 사용자 식별자가 처리됩니다.",
            "슈팅 영상을 분석할 때 현재 V2 경계에서는 원본 영상, 파일명, EXIF와 얼굴 랜드마크를 클라우드에 업로드하지 않습니다. 기기에서 추출한 허용 관절의 위상 정규화 2D 관측값과 실측 3D가 아닌 대표 추정값만 사용자 UID 아래 비공개 Cloud Firestore 영역에 저장할 수 있습니다.",
          ],
        },
        {
          title: "3. 국외 처리와 외부 서비스",
          paragraphs: [
            "Firebase Authentication은 Google/Firebase가 미국 데이터센터에서 처리합니다. Cloud Firestore의 실제 운영 리전은 배포 프로젝트 설정에 따르며 출시 전에 확정·공개해야 합니다.",
            `현재 빌드에 설정된 Cloud Firestore 리전: ${firestoreRegion}. 구체적인 수탁자·국가·처리 목적·보유기간 등 국외 처리 고지는 실제 운영 설정과 일치하도록 출시 전에 확정합니다.`,
          ],
        },
        {
          title: "4. 보유와 삭제",
          paragraphs: [
            "계정 및 사용자 소유 분석 데이터는 서비스 제공 목적에 필요한 동안 보유하며, 사용자는 앱 안의 삭제 기능으로 개별 슈팅 프로필을 지울 수 있습니다. 전체 계정 삭제 기능은 계정과 연결된 사용자 소유 클라우드 데이터를 정리한 뒤 Firebase Authentication 계정을 삭제하도록 설계됩니다.",
          ],
        },
        {
          title: "5. 만 14세 미만",
          paragraphs: [
            "현재 한국 출시 V1은 만 14세 이상을 대상으로 합니다. 만 14세 미만 사용자는 회원가입 단계에서 계정을 만들 수 없으며, 이 확인을 위해 생년월일 자체를 별도 저장하지 않습니다.",
          ],
        },
        {
          title: "6. 이용자의 권리와 문의",
          paragraphs: [
            `이용자는 자신의 정보 조회·정정·삭제와 처리 관련 문의를 할 수 있습니다. 개인정보 문의: ${privacyContact}. 계정 삭제는 앱 안에서 시작할 수 있도록 제공합니다.`,
          ],
        },
      ]}
    />
  );
}
