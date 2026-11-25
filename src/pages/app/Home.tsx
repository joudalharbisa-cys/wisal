import { useCurrentSession } from '../../session/Guard'
import Incoming from './Incoming'
import MyRequests from './MyRequests'

/** /app: hospitals land on their requests, charities on their incoming requests. */
export default function Home() {
  const session = useCurrentSession()
  if (session.kind !== 'member' || !session.org) return null
  return session.org.role === 'hospital' ? <MyRequests /> : <Incoming />
}
