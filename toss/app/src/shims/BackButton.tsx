/**
 * `@/components/BackButton` 대체.
 *
 * 앱인토스 비게임 출시 가이드는 앱인토스 네비게이션 바를 쓰도록 하고,
 * 자체 뒤로가기 버튼을 같이 노출하는 것을 금지한다(검수 반려 사유).
 * 원본은 `w-10 h-10 shrink-0` 버튼이라 flex 행에서 자리를 차지한다.
 * 같은 크기의 빈 칸을 남겨야 옆 요소들의 정렬이 그대로 유지된다.
 */
export default function BackButton({
  className = '',
}: {
  className?: string;
  /**
   * 원본과 시그니처를 맞추기 위해 받기만 한다(4곳에서 넘긴다).
   * 버튼 자체가 없으니 호출될 일이 없다.
   */
  onClick?: (e: React.MouseEvent) => void;
}) {
  return <div aria-hidden className={`w-10 h-10 shrink-0 ${className}`} />;
}
