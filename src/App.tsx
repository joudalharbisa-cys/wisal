import { Navigate, Route, Routes } from 'react-router-dom'
import AdminReview from './pages/admin/AdminReview'
import MemberHome from './pages/app/MemberHome'
import Login from './pages/auth/Login'
import Pending from './pages/auth/Pending'
import Register from './pages/auth/Register'
import Identity from './pages/Identity'
import { Guard } from './session/Guard'

export default function App() {
  return (
    <Guard>
      <Routes>
        <Route path="/identity" element={<Identity />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pending" element={<Pending />} />
        <Route path="/app" element={<MemberHome />} />
        <Route path="/admin" element={<AdminReview />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Guard>
  )
}
