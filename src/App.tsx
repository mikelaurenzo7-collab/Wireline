import FigmaOverhaul from "./FigmaOverhaul";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <FigmaOverhaul />
    </AuthProvider>
  );
}
