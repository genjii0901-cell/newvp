import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "システム英単語 購入者用ポータル | Vocab Print Pro",
  robots: { index: false, follow: false },
};

export default function SystemEitangoNotePage() {
  // Keep the URL shared from Note, but use the server-validated license flow.
  redirect("/access/system-eitango");
}
