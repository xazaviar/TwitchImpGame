import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ViewerRoute } from "./routes/ViewerRoute.js";
import { OverlayRoute } from "./routes/OverlayRoute.js";
import { AdminRoute } from "./routes/AdminRoute.js";
import { NotificationToast } from "./components/NotificationToast.js";

export function App() {
  return (
    <BrowserRouter>
      <NotificationToast />
      <Routes>
        <Route path="/" element={<ViewerRoute />} />
        <Route path="/overlay" element={<OverlayRoute />} />
        <Route path="/admin" element={<AdminRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
