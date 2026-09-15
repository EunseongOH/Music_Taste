/**
 * mTLS 인증서를 Vercel 에 넣기 전에 점검하고, base64 값을 파일로 뽑는다.
 *
 * **비밀값은 화면에 출력하지 않는다.** 개인키가 터미널 기록이나 스크롤백에
 * 남으면 그것만으로 유출이다. base64 는 파일로만 쓰고, 화면에는 길이만 알린다.
 *
 * 가장 흔한 설정 실수는 "인증서와 키가 서로 짝이 아닌 것" 인데, 이건 배포
 * 후에야 handshake 실패로 드러난다. 여기서 미리 맞춰 본다.
 *
 * 사용:
 *   node toss/mtls-setup.mjs <인증서.crt> <개인키.key> [개인키암호]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { basename, join } from 'node:path';

const [certPath, keyPath, passphrase] = process.argv.slice(2);

if (!certPath || !keyPath) {
  console.log('사용: node toss/mtls-setup.mjs <인증서.crt> <개인키.key> [개인키암호]');
  process.exit(1);
}

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '[O]' : '[X]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const certPem = readFileSync(certPath);
const keyPem = readFileSync(keyPath);

console.log('\n[1] 인증서');
let cert;
try {
  cert = new X509Certificate(certPem);
} catch (err) {
  check(false, '인증서를 읽지 못했습니다', err.message);
  process.exit(1);
}
check(true, '형식 정상 (PEM X.509)');
console.log(`      주체(subject) : ${cert.subject.replace(/\n/g, ', ')}`);
console.log(`      발급자(issuer) : ${cert.issuer.replace(/\n/g, ', ')}`);
console.log(`      유효기간       : ${cert.validFrom} ~ ${cert.validTo}`);

const now = Date.now();
check(new Date(cert.validFrom) <= now, '유효기간 시작됨');
const daysLeft = Math.floor((new Date(cert.validTo) - now) / 86400000);
check(daysLeft > 0, '아직 만료되지 않음', `${daysLeft}일 남음`);
if (daysLeft > 0 && daysLeft < 30) {
  console.log(`      ⚠️ 만료가 ${daysLeft}일 남았습니다. 갱신 일정을 잡아 두세요.`);
}

// 인증서 PEM 이 여러 장(체인) 인지 본다 — 체인이 붙어 있어도 보통 문제없다.
const certCount = (certPem.toString().match(/BEGIN CERTIFICATE/g) ?? []).length;
console.log(`      인증서 개수    : ${certCount}장${certCount > 1 ? ' (체인 포함)' : ''}`);

console.log('\n[2] 개인키');
const encrypted = /ENCRYPTED/.test(keyPem.toString());
console.log(`      암호화 여부    : ${encrypted ? '암호 걸림' : '암호 없음'}`);
if (encrypted && !passphrase) {
  check(false, '개인키에 암호가 걸려 있습니다', '세 번째 인자로 암호를 넘겨 주세요');
  process.exit(1);
}

let key;
try {
  key = createPrivateKey(passphrase ? { key: keyPem, passphrase } : keyPem);
  check(true, '개인키를 읽었습니다', key.asymmetricKeyType?.toUpperCase() ?? '');
} catch (err) {
  check(false, '개인키를 읽지 못했습니다', err.message);
  process.exit(1);
}

console.log('\n[3] 인증서와 개인키가 짝인지');
/*
 * 개인키로 서명한 것이 인증서의 공개키로 검증되는지 본다.
 * 여기서 어긋나면 배포 후 TLS handshake 가 실패하는데, 그때는 원인이
 * 잘 안 보인다 — 지금 잡는 게 훨씬 싸다.
 */
try {
  // Node 가 이 용도로 제공하는 메서드다. 직접 서명/검증할 필요가 없다.
  if (cert.checkPrivateKey(key)) {
    check(true, '짝이 맞습니다');
  } else {
    check(false, '짝이 맞지 않습니다', '다른 발급분의 파일이 섞였는지 확인하세요');
  }
} catch (err) {
  check(false, '짝을 확인하지 못했습니다', err.message);
}

console.log('\n[4] Vercel 에 넣을 값');
if (failed > 0) {
  console.log('  앞 단계에서 문제가 있어 값을 만들지 않았습니다.');
  process.exitCode = 1;
} else {
  const outDir = join(process.cwd(), 'toss', 'mtls-out');
  mkdirSync(outDir, { recursive: true });

  const write = (name, buf) => {
    const b64 = buf.toString('base64');
    const f = join(outDir, name);
    writeFileSync(f, b64, 'utf8');
    console.log(`  ${name.padEnd(24)} ${String(b64.length).padStart(6)}자 → ${f}`);
  };
  write('TOSS_MTLS_CERT_BASE64.txt', certPem);
  write('TOSS_MTLS_KEY_BASE64.txt', keyPem);

  console.log('\n  각 파일의 내용을 그대로 같은 이름의 Vercel 환경변수에 넣으세요.');
  console.log('  (Production + Preview 양쪽)');
  if (encrypted) console.log('  개인키 암호는 TOSS_MTLS_PASSPHRASE 에 넣으세요.');
  console.log('\n  ⚠️ toss/mtls-out/ 은 gitignore 되어 있습니다. 다 넣으신 뒤 지우세요:');
  console.log('     rm -rf toss/mtls-out');
  console.log(`\n결과: 통과 — ${daysLeft}일 후 만료`);
}
