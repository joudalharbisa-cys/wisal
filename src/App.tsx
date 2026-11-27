import { Navigate, Route, Routes } from 'react-router-dom'
import AdminReview from './pages/admin/AdminReview'
import AdminOverview from './pages/admin/AdminOverview'
import AdminOrgs from './pages/admin/AdminOrgs'
import AdminOrg from './pages/admin/AdminOrg'
import AdminRequests from './pages/admin/AdminRequests'
import AdminRequest from './pages/admin/AdminRequest'
import Home from './pages/app/Home'
import MyStock from './pages/app/MyStock'
import NewRequest from './pages/app/NewRequest'
import RequestDetails from './pages/app/RequestDetails'
import IncomingRequest from './pages/app/IncomingRequest'
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
        <Route path="/app" element={<Home />} />
        <Route path="/app/stock" element={<MyStock />} />
        <Route path="/app/requests/new" element={<NewRequest />} />
        <Route path="/app/requests/:id" element={<RequestDetails />} />
        <Route path="/app/incoming/:id" element={<IncomingRequest />} />
        <Route path="/app/warehouses/new" element={<WarehouseForm />} />
        <Route path="/app/warehouses/:id" element={<WarehouseForm />} />
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/orgs" element={<AdminOrgs />} />
        <Route path="/admin/orgs/:id" element={<AdminOrg />} />
        <Route path="/admin/requests" element={<AdminRequests />} />
        <Route path="/admin/requests/:id" element={<AdminRequest />} />
        <Route path="/admin/applications" element={<AdminReview />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Guard>
  )
}
