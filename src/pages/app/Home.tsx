import { useCurrentSession } from '../../session/Guard'
import MyRequests from './MyRequests'
import MyStock from './MyStock'

/** /app: hospitals land on their requests, charities on their stock. */
export default function Home() {
  const session = useCurrentSession()
  if (session.kind !== 'member' || !session.org) return null
  return session.org.role === 'hospital' ? <MyRequests /> : <MyStock />
}
