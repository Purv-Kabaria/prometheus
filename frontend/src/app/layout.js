import { Geist, Geist_Mono, Crimson_Pro } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AnomalyAlertBar from "@/components/AnomalyAlertBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const crimsonPro = Crimson_Pro({
  variable: "--font-serif",
  subsets: ["latin"],
});


export const metadata = {
  title: "Prometheus Grid Dashboard",
  description: "Advanced energy consumption monitoring and predictive analytics.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${crimsonPro.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)] m-0">
        <AnomalyAlertBar />
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar />
          <main style={{ flex: 1, minHeight: "100vh", overflow: "auto" }}>
            <div style={{ paddingTop: "80px", paddingLeft: "64px", paddingRight: "64px", paddingBottom: "64px" }}>
              <div style={{ width: "100%" }}>
                {children}
              </div>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
