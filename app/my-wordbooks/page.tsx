"use client";

import { useEffect } from "react";

export default function MyWordbooksRedirectPage() {
  useEffect(() => {
    window.location.replace("/wordbooks?tab=my");
  }, []);

  return <main className="mx-auto max-w-4xl px-5 py-16 text-sm text-slate-500">マイ単語帳へ移動しています...</main>;
}
