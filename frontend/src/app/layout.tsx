import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JAM AI Analyzer - AI-Powered Just A Minute Speech Coach",
  description: "Record a 1-minute webcam speech on a random topic and get instant AI feedback on fluency, eye contact, posture, filler words, and communication skills.",
  keywords: ["Just A Minute", "JAM Speech", "AI Speech Coach", "Public Speaking", "Speech Evaluation", "Computer Vision Posture Analysis"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
