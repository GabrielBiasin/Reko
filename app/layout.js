import "./globals.css";

export const metadata = {
  title: "Reko",
  description: "Retención y recompra para pet shops",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
