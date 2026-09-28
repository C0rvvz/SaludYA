import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RutaProtegida from "./components/RutaProtegida";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegistroPage from "./pages/RegistroPage";
import PanelPage from "./pages/PanelPage";
import MisCitasPage from "./pages/MisCitasPage";
import ConfirmarAsistenciaPage from "./pages/ConfirmarAsistenciaPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/iniciar-sesion" element={<LoginPage />} />
          <Route path="/registrarse" element={<RegistroPage />} />
          {/* HU-23: pública, se entra desde el enlace del recordatorio */}
          <Route path="/confirmar-asistencia" element={<ConfirmarAsistenciaPage />} />
          <Route
            path="/panel"
            element={
              <RutaProtegida>
                <PanelPage />
              </RutaProtegida>
            }
          />
          <Route
            path="/mis-citas"
            element={
              <RutaProtegida>
                <MisCitasPage />
              </RutaProtegida>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
