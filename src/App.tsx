import FigmaOverhaul from "./FigmaOverhaul";
import PersonalWorkspace from "./PersonalWorkspace";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden">
      <AuthProvider>
        <FigmaOverhaul />
      </AuthProvider>
    </div>
  );
}
