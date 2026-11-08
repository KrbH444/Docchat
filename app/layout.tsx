import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocChat",
  description: "Chat with your documents in Arabic or English, with every answer cited.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
