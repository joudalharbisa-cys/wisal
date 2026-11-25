import { Navigate, Route, Routes } from 'react-router-dom'
import AdminReview from './pages/admin/AdminReview'
import MyStock from './pages/app/MyStock'
import WarehouseForm from './pages/app/WarehouseForm'
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
        <Route path="/app" element={<MyStock />} />
        <Route path="/app/warehouses/new" element={<WarehouseForm />} />
        <Route path="/app/warehouses/:id" element={<WarehouseForm />} />
        <Route path="/admin" element={<AdminReview />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Guard>
  )
}
