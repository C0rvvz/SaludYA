import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PersonalProvider from "./context/PersonalProvider";
import RutaProtegida from "./components/RutaProtegida";
import SubirAlCambiarDePagina from "./components/SubirAlCambiarDePagina";
import RutaPersonal from "./components/admin/RutaPersonal";
import AdminLayout from "./components/admin/AdminLayout";
import SinPermisoHistoria from "./components/admin/SinPermisoHistoria";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegistroPage from "./pages/RegistroPage";
import PanelPage from "./pages/PanelPage";
import MisCitasPage from "./pages/MisCitasPage";
import ConfirmarAsistenciaPage from "./pages/ConfirmarAsistenciaPage";
import ListaEsperaPage from "./pages/ListaEsperaPage";
import SolicitudesPage from "./pages/SolicitudesPage";
import PagarCitaPage from "./pages/PagarCitaPage";
import BancoPsePage from "./pages/BancoPsePage";
import ResultadoPagoPage from "./pages/ResultadoPagoPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminCitasPage from "./pages/admin/AdminCitasPage";
import AdminCitaDetallePage from "./pages/admin/AdminCitaDetallePage";
import AdminAuditoriaPage from "./pages/admin/AdminAuditoriaPage";
import AdminUsuariosPage from "./pages/admin/AdminUsuariosPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminEspecialistasPage from "./pages/admin/AdminEspecialistasPage";
import AdminSeguridadPage from "./pages/admin/AdminSeguridadPage";
import AdminReportesPage from "./pages/admin/AdminReportesPage";
import AdminRecordatoriosPage from "./pages/admin/AdminRecordatoriosPage";
import AdminListaEsperaPage from "./pages/admin/AdminListaEsperaPage";
import AdminSolicitudesPage from "./pages/admin/AdminSolicitudesPage";
import AdminRevisionPage from "./pages/admin/AdminRevisionPage";
import AdminHistoriaClinicaPage from "./pages/admin/AdminHistoriaClinicaPage";
import AdminHistoriaDetallePage from "./pages/admin/AdminHistoriaDetallePage";

export default function App() {
  return (
    <BrowserRouter>
      <SubirAlCambiarDePagina />
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
              path="/lista-espera"
              element={
                <RutaProtegida>
                  <ListaEsperaPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/solicitudes"
              element={
                <RutaProtegida>
                  <SolicitudesPage />
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
            {/* Pago en línea de una cita atendida (simulación de Wompi) */}
            <Route
              path="/pagar/:citaId"
              element={
                <RutaProtegida>
                  <PagarCitaPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/pagar/banco/:referencia"
              element={
                <RutaProtegida>
                  <BancoPsePage />
                </RutaProtegida>
              }
            />
            <Route
              path="/pagar/resultado/:referencia"
              element={
                <RutaProtegida>
                  <ResultadoPagoPage />
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
              <Route
                path="dashboard"
                element={
                  <RutaPersonal permiso="ver_reportes">
                    <AdminDashboardPage />
                  </RutaPersonal>
                }
              />
              <Route
                path="reportes"
                element={
                  <RutaPersonal permiso="ver_reportes">
                    <AdminReportesPage />
                  </RutaPersonal>
                }
              />
              <Route
                path="recordatorios"
                element={
                  <RutaPersonal permiso="recordatorios">
                    <AdminRecordatoriosPage />
                  </RutaPersonal>
                }
              />
              <Route
                path="lista-espera"
                element={
                  <RutaPersonal permiso={["lista_espera", "asignar_prioridad"]}>
                    <AdminListaEsperaPage />
                  </RutaPersonal>
                }
              />
              <Route
                path="solicitudes"
                element={
                  <RutaPersonal permiso="revisar_solicitudes">
                    <AdminSolicitudesPage />
                  </RutaPersonal>
                }
              />
              <Route
                path="solicitudes/:id"
                element={
                  <RutaPersonal permiso="revisar_solicitudes">
                    <AdminRevisionPage />
                  </RutaPersonal>
                }
              />
              {/* Información reservada: sin el permiso, "No tiene permiso para ver esta información" */}
              <Route
                path="historia-clinica"
                element={
                  <RutaPersonal permiso="historia_clinica" sinPermiso={<SinPermisoHistoria />}>
                    <AdminHistoriaClinicaPage />
                  </RutaPersonal>
                }
              />
              <Route path="historia-clinica/:citaId" element={<AdminHistoriaDetallePage />} />
              <Route
                path="especialistas"
                element={
                  <RutaPersonal permiso="gestionar_especialistas">
                    <AdminEspecialistasPage />
                  </RutaPersonal>
                }
              />
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
                path="seguridad"
                element={
                  <RutaPersonal permiso="seguridad">
                    <AdminSeguridadPage />
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
