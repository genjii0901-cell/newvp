// 管理者2要素認証（TOTP）の秘密鍵を生成するスクリプト。
// 使い方: プロジェクトフォルダで `node scripts/gen-totp.mjs`
//
// 出力された ADMIN_TOTP_SECRET を：
//   1) Vercel の環境変数 ADMIN_TOTP_SECRET に設定（Production）
//   2) スマホの認証アプリ（Google Authenticator / Microsoft Authenticator 等）に
//      「手動入力」で同じ秘密を登録（または otpauth URL をQR化して登録）
// これで管理画面ログインに6桁コードが必要になります（＝2要素認証）。
//
// ※この秘密鍵は他人に教えないでください。

import crypto from "crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function toBase32(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

const secret = toBase32(crypto.randomBytes(20));
const label = encodeURIComponent("Vocab Print Pro (Admin)");
const issuer = encodeURIComponent("VocabPrintPro");
const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

console.log("");
console.log("=== 管理者2要素認証(TOTP)の設定 ===");
console.log("");
console.log("1) Vercel 環境変数に設定:");
console.log("   ADMIN_TOTP_SECRET=" + secret);
console.log("");
console.log("2) 認証アプリに登録（どちらか）:");
console.log("   ・手動入力: 上の秘密鍵をそのまま入力");
console.log("   ・QR: 次のURLをQRコード化して読み取り");
console.log("   " + otpauth);
console.log("");
console.log("設定後に再デプロイすると、管理画面ログインで6桁コードが必要になります。");
console.log("");
