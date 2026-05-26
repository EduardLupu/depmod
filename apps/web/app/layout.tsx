import { Providers } from "@/components/providers";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "depmod",
  description: "Visualise the dependency graph of a JavaScript / TypeScript project.",
  applicationName: "depmod",
  manifest: "/site.webmanifest",
  icons: {
    // `apps/web/app/favicon.ico` and `apps/web/app/apple-icon.png` are picked
    // up automatically by Next's file-based metadata convention; the extra
    // PNG sizes for desktop favicons need explicit entries.
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
