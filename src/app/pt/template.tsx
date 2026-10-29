/** Sidbyte i PT-portalen: samma snabba intoning som i klientappen (skalet står still). */
export default function PtTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
