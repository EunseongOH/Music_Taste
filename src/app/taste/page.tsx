"use client";

import ResultScreen from "@/components/result/ResultScreen";

/** 월드컵을 막 끝낸 결과 화면. 1위 공개 연출·자동 저장이 있다. */
export default function TastePage() {
  return <ResultScreen mode="fresh" />;
}
