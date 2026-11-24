import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Identity from './pages/Identity'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/identity" element={<Identity />} />
    </Routes>
  )
}
