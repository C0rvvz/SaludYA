import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PersonalProvider from "./context/PersonalProvider";
import RutaProtegida from "./components/RutaProtegida";
import RutaPersonal from "./components/admin/RutaPersonal";
import AdminLayout from "./components/admin/AdminLayout";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegistroPage from "./pages/RegistroPage";
import PanelPage from "./pages/PanelPage";
import MisCitasPage from "./pages/MisCitasPage";
import ConfirmarAsistenciaPage from "./pages/ConfirmarAsistenciaPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminCitasPage from "./pages/admin/AdminCitasPage";
import AdminCitaDetallePage from "./pages/admin/AdminCitaDetallePage";
import AdminAuditoriaPage from "./pages/admin/AdminAuditoriaPage";
import AdminUsuariosPage from "./pages/admin/AdminUsuariosPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PersonalProvider>
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

            {/* Apartado de administración: sesión del personal, aparte de la del paciente */}
            <Route path="/admin/ingresar" element={<AdminLoginPage />} />
            <Route
              path="/admin"
              element={
                <RutaPersonal>
                  <AdminLayout />
                </RutaPersonal>
              }
            >
              <Route index element={<Navigate to="citas" replace />} />
              <Route path="citas" element={<AdminCitasPage />} />
              <Route path="citas/:id" element={<AdminCitaDetallePage />} />
              <Route
                path="auditoria"
                element={
                  <RutaPersonal permiso="ver_auditoria">
                    <AdminAuditoriaPage />
                  </RutaPersonal>
                }
              />
              <Route
                path="usuarios"
                element={
                  <RutaPersonal permiso="gestionar_usuarios">
                    <AdminUsuariosPage />
                  </RutaPersonal>
                }
              />
            </Route>
          </Routes>
        </PersonalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
