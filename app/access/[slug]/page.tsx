import type { Metadata } from "next";
import AccessPortal from "./portal";

export const metadata: Metadata = {
  title: "購入者用単語帳ポータル | Vocab Print Pro",
  robots: { index: false, follow: false },
};

export default function LicenseAccessPage() {
  return <AccessPortal />;
}
