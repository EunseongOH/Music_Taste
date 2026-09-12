import type { AnchorHTMLAttributes } from 'react';
import { nav } from '../router';

/**
 * `next/link` 대체. 호출처 4곳(app/page.tsx 푸터) 모두 `href` + `className` 뿐이다.
 * `<a>` 를 그대로 두는 이유: 기본 전체 리로드는 WebView 에서 번들 재다운로드가
 * 되므로 막고, 대신 pushState 로 넘긴다.
 */
export default function Link({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
        nav.push(href);
      }}
      {...rest}
    />
  );
}
