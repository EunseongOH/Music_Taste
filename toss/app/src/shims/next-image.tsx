import type { CSSProperties, ImgHTMLAttributes } from 'react';

/**
 * `next/image` 대체.
 *
 * 루트 next.config.ts 가 `images.unoptimized: true` 라서 Next 도 src 를 그대로
 * 내보낸다 → 소스 URL·srcSet 차이가 없고, 남는 차이는 인라인 스타일뿐이다.
 * 아래 스타일은 Next 실제 구현을 그대로 옮긴 것이다.
 * (node_modules/next/dist/shared/lib/get-img-props.js:503-515)
 *
 * src/ 에서 정적 이미지 import(`import x from './a.png'`)는 0건이라
 * StaticImageData 처리는 필요 없다.
 */

export type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  alt: string;
  fill?: boolean;
  /** Next 전용. 렌더에는 쓰이지 않고 버려진다. */
  sizes?: string;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
};

const FILL: CSSProperties = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
};

export default function Image({
  fill,
  src,
  alt,
  width,
  height,
  style,
  loading,
  // 이하는 Next 전용 props. <img> 로 새면 React DOM 경고가 난다.
  priority,
  sizes: _sizes,
  quality: _quality,
  unoptimized: _unoptimized,
  ...rest
}: ImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      // fill 일 때 Next 는 width/height 속성을 붙이지 않는다(스타일이 100%를 잡음).
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      // Next 는 fill 여부와 무관하게 color:transparent 를 넣는다.
      // 로딩 중·실패 시 alt 텍스트가 보이지 않게 하는 장치라 패리티에 영향이 있다.
      style={{ ...(fill ? FILL : null), color: 'transparent', ...style }}
      // Next 와 같은 규칙: priority 면 loading 속성을 아예 붙이지 않는다(브라우저 기본).
      // (get-img-props.js:269,550 — isLazy ? 'lazy' : loading)
      loading={!priority && (loading ?? 'lazy') === 'lazy' ? 'lazy' : loading}
      decoding="async"
      {...rest}
    />
  );
}
