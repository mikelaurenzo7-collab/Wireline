import FigmaOverhaul from "./FigmaOverhaul";
import PersonalWorkspace from "./PersonalWorkspace";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  const path = location.pathname;
  const PersonalOrMain = path.indexOf("/app/personal") === 0 ? PersonalWorkspace : FigmaOverhaul;

  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden">
      <AuthProvider>
        <PersonalOrMain />
      </AuthProvider>
    </div>
  );
}
