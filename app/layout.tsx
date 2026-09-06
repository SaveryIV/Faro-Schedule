import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faro Schedule",
  description: "Book the office Hall and Meeting Room.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
