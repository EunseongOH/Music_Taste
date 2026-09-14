import { Clipboard, Device, File, Share } from '@apps-in-toss/web-framework';
import * as htmlToImage from 'html-to-image';

/**
 * `@/utils/platform` 대체 — **앱인토스 구현**.
 *
 * WebView 에는 `<a download>` 도, `window.open` 도, `navigator.share` 도 없거나
 * 막혀 있다. 같은 일을 앱인토스 SDK 로 한다. 시그니처는 웹 구현과 동일하므로
 * `app/taste/page.tsx` 는 한 글자도 다르게 동작하지 않는다.
 *
 * SDK 3.4.0 기준으로 독립 함수(`saveBase64Data` · `share` · `openURL` ·
 * `setClipboardText`)는 전부 deprecated 다. 네임스페이스 쪽(`File.saveBase64` ·
 * `Share.sendMessage` · `Device.openURL` · `Clipboard.setText`)을 쓴다.
 */

/**
 * `native` = OS 공유 시트(설치된 앱 목록). 유니온은 웹 구현
 * (`src/utils/platform.ts`)과 같아야 한다.
 */
export type ShareTarget = 'native' | 'link' | 'image' | 'x' | 'instagram' | 'kakao';

/** 사용자에게 그대로 보여도 되는 오류. (src/utils/platform.ts 와 같은 역할) */
export class PlatformError extends Error {}

/**
 * 토스 빌드에서 노출할 공유 수단.
 *
 * X·카카오·인스타그램 **개별 버튼**을 두지 않는 이유는 "외부 SNS 공유가
 * 금지되어서"가 아니다 — 그런 조항은 문서에 없다. 앱인토스가 제한하는 것은
 * "공유하기 링크가 자사 웹사이트로 랜딩되는 경우"다(intro/guide.md 2-2).
 * `native`(OS 공유 시트) 하나면 사용자가 카카오톡·인스타 등을 직접 고르므로
 * 개별 버튼이 필요 없고, 나가는 링크도 토스 공유 링크 하나로 고정된다.
 */
export const shareTargets: ShareTarget[] = ['native', 'link', 'image'];

/**
 * 공유·복사에 쓸 링크.
 *
 * 웹은 `https://sortify.kr/taste/<id>` 를 주지만, 토스에서는 그 주소로 나가는
 * 것 자체가 제한된다. `Share.createLink` 로 미니앱 안에서 열리는 딥링크를 만든다.
 * 정적 호스팅이라 `/taste/<uuid>` 같은 임의 경로에 파일을 둘 수 없어서
 * 쿼리 형태(`/shared?id=`)를 쓴다 — App.tsx 라우트 표와 짝이다.
 */
export async function shareUrl(savedId: string | null, ogImageUrl?: string): Promise<string> {
  // intoss://<appName> — apps-in-toss.config.ts 의 appName 과 같아야 한다.
  // 테스트 스킴(intoss-private://)을 여기에 쓰면 출시 체크리스트 위반이다.
  const path = savedId
    ? `intoss://sortify-musictaste/shared?id=${savedId}`
    : 'intoss://sortify-musictaste';
  try {
    // ogImageUrl 은 외부 플랫폼에 붙여넣었을 때의 미리보기 이미지다.
    // 구버전 토스앱에서는 SDK 가 알아서 무시하므로 버전 분기를 두지 않는다.
    return await Share.createLink({ path, ogImageUrl });
  } catch (err) {
    // 구버전 토스앱 등으로 링크 생성이 안 되면 딥링크 원문이라도 돌려준다.
    // 복사 자체는 되게 하는 편이 낫다.
    console.warn('[toss] Share.createLink 실패, 딥링크 원문 사용', err);
    return path;
  }
}

/**
 * 이미지 저장.
 *
 * `pixelRatio` 를 웹의 5 에서 3 으로 낮춘다. 5 는 2250×4000 짜리 비트맵이라
 * 저사양 안드로이드 WebView 에서 메모리 부족으로 조용히 실패한다
 * (사용자에게는 "저장 버튼이 안 먹는다" 로 보인다).
 * 그래도 실패하면 2 로 한 단계 더 낮춰 한 번 더 시도한다.
 */
export async function saveImage(el: HTMLElement, fileName: string): Promise<void> {
  if (!File.saveBase64.isSupported()) {
    throw new PlatformError('이 버전의 토스 앱에서는 이미지 저장을 지원하지 않아요.');
  }

  let dataUrl: string | null = null;
  for (const pixelRatio of [3, 2]) {
    try {
      dataUrl = await htmlToImage.toPng(el, { cacheBust: true, pixelRatio });
      break;
    } catch (err) {
      if (pixelRatio === 2) throw err;
      console.warn(`[toss] pixelRatio ${pixelRatio} 실패, 낮춰서 재시도`, err);
    }
  }
  if (!dataUrl) throw new PlatformError('이미지를 만들지 못했어요.');

  await File.saveBase64({
    data: dataUrl.replace(/^data:image\/png;base64,/, ''),
    fileName,
    mimeType: 'image/png',
  });
}

/**
 * CSV 저장.
 *
 * 웹 구현은 `data:` URI 를 만들어 `<a download>` 에 물린다. 여기서는 같은
 * 본문에서 URI 접두사만 떼고 base64 로 바꿔 넘긴다. 본문을 만드는 규칙은
 * 페이지에 그대로 남아 있어 두 빌드의 CSV 내용이 같다.
 */
export async function saveCsv(csvContent: string, fileName: string): Promise<void> {
  if (!File.saveBase64.isSupported()) {
    throw new PlatformError('이 버전의 토스 앱에서는 파일 저장을 지원하지 않아요.');
  }
  const body = csvContent.replace(/^data:text\/csv;charset=utf-8,/, '');
  // 한글·BOM 이 들어 있으므로 UTF-8 바이트로 만든 뒤 base64 로 바꾼다.
  const bytes = new TextEncoder().encode(decodeURIComponent(body));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);

  await File.saveBase64({
    data: btoa(binary),
    fileName,
    mimeType: 'text/csv',
  });
}

/**
 * 클립보드에 텍스트를 넣는다.
 *
 * `Clipboard.setText` 는 권한 함수라, 아직 묻지 않은 상태(`notDetermined`)에서
 * 바로 부르면 던진다. 먼저 상태를 보고 필요하면 권한 안내를 띄운다.
 * apps-in-toss.config.ts 에 clipboard/write 를 선언해 두는 것만으로는 부족하다.
 */
export async function copyText(text: string): Promise<'copied' | 'sheet'> {
  // 진단용 기록. 실기기에서 권한 팝업을 허용한 뒤에도 setText 가
  // "Permission '클립보드' is not granted" 로 실패하는 사례가 있었다
  // (2026-09-15, Android). 원인이 확인되면 이 기록은 지운다.
  const trace: Record<string, unknown> = {};
  try {
    let status = await Clipboard.setText.getPermission();
    trace.permission = status;
    if (status === 'notDetermined') {
      status = await Clipboard.setText.openPermissionDialog();
      trace.dialog = status;
    }
    if (status !== 'denied') {
      await Clipboard.setText(text);
      return 'copied';
    }
  } catch (err) {
    trace.error = (err as Error)?.message ?? String(err);
  }
  console.warn('[toss] 클립보드 쓰기 실패 — 공유 시트로 대신 연다', trace);

  // 공유 시트에는 "복사" 항목이 있고, 이 경로는 권한이 필요 없다.
  // 사용자는 한 번 더 누르게 되지만, 아무것도 못 하는 것보다 낫다.
  try {
    await Share.sendMessage({ message: text });
    return 'sheet';
  } catch (err) {
    throw new PlatformError(`복사하지 못했어요. (${(err as Error)?.message ?? '알 수 없음'})`);
  }
}

/**
 * 네이티브 공유 시트.
 *
 * 토스의 `Share.sendMessage` 는 제목·URL 을 따로 받지 않고 메시지 한 덩어리만
 * 받는다. 웹과 같은 정보가 담기도록 본문 뒤에 링크를 붙인다.
 * 현재 `shareTargets` 에 'kakao' 가 없어 호출되지 않지만, 시그니처를 맞춰
 * 두어야 페이지 코드가 두 빌드에서 같을 수 있다.
 */
export async function share(params: {
  title: string;
  text: string;
  url: string;
}): Promise<boolean> {
  try {
    await Share.sendMessage({ message: `${params.text}\n${params.url}` });
    return true;
  } catch {
    return false;
  }
}

/** 외부 주소를 기기 기본 브라우저로 연다. */
export async function openExternal(url: string): Promise<void> {
  await Device.openURL(url);
}
