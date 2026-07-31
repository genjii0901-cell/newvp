import type { Metadata } from "next";
import SystemEitangoNotePortal from "./portal";

export const metadata: Metadata = {
  title: "システム英単語 購入者用ポータル | Vocab Print Pro",
  robots: { index: false, follow: false },
};

export default function SystemEitangoNotePage() {
  return <SystemEitangoNotePortal />;
}
