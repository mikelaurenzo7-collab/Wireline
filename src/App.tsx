import WirelineRoot from "./WirelineRoot";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden">
      <AuthProvider>
        <WirelineRoot />
      </AuthProvider>
    </div>
  );
}
