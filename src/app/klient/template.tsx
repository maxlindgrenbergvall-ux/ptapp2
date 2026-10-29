/**
 * Sidbyte i klientappen: varje vy tonar in snabbt (220 ms, bara opacity och en
 * liten förflyttning – inget som ligger kvar och påverkar fixerade element).
 * Skalet (sidhuvud och bottenmeny) ligger i layouten och står still.
 */
export default function ClientTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
