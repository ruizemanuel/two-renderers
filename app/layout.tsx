import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Two renderers" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black">{children}</body>
    </html>
  );
}
