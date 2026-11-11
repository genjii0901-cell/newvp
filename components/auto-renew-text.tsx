import type { ReactNode } from "react";

// 「都度課金・都度購入・都度お支払い」を赤字にして、月額ではなく印刷のたびに払うことを目立たせる。
// （自動更新は赤字にしない。ファイル名は以前のまま）
const PATTERN = /(都度課金|都度購入|都度お支払い|都度決済)/;

export default function AutoRenewText({ text }: { text: string }) {
  const parts: ReactNode[] = text.split(PATTERN).map((part, index) =>
    index % 2 === 1 ? <span key={index} className="font-black text-red-600">{part}</span> : part,
  );
  return <>{parts}</>;
}
