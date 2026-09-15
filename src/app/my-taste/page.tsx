"use client";

import ResultScreen from "@/components/result/ResultScreen";

/**
 * 저장해 둔 취향표를 다시 여는 화면(`/my-taste?id=<uuid>`).
 *
 * 월드컵 직후 결과 화면(`/taste`)과 모양은 같지만 별개 화면이다.
 * 이미 저장된 취향표라 자동 저장·저장 시트·1위 공개 연출이 없고,
 * 나갈 때 진행 중인 월드컵 기록을 지우지 않는다.
 * id 를 경로가 아니라 쿼리로 받는 이유: 토스 미니앱의 정적 호스팅에서도 같은 주소로 열려야 한다.
 */
export default function MyTastePage() {
  return <ResultScreen mode="saved" />;
}
