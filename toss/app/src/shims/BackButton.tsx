/**
 * `@/components/BackButton` 대체.
 *
 * 앱인토스 비게임 출시 가이드는 앱인토스 네비게이션 바를 쓰도록 하고,
 * 자체 뒤로가기 버튼을 같이 노출하는 것을 금지한다(검수 반려 사유).
 *
 * 아무것도 그리지 않는다. 예전에는 원본과 같은 크기(40px)의 빈 칸을 남겼는데,
 * 그 칸과 gap 만큼 헤더 제목이 오른쪽으로 밀려 제목 왼쪽 여백(76px)이
 * 오른쪽 프로필 여백(24px)과 달랐다. 칸을 없애면 제목이 좌우 같은 여백에 선다.
 */
export default function BackButton(_props: {
  className?: string;
  /**
   * 원본과 시그니처를 맞추기 위해 받기만 한다(4곳에서 넘긴다).
   * 버튼 자체가 없으니 호출될 일이 없다.
   */
  onClick?: (e: React.MouseEvent) => void;
}) {
  return null;
}
