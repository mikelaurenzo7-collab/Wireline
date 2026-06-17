import FigmaOverhaul from "./FigmaOverhaul";
import PersonalWorkspace from "./PersonalWorkspace";

export default function WirelineRoot() {
  const path = typeof window === "undefined" ? "/" : window.location.pathname;
  const personal = path.startsWith("/app/personal") || path === "/personal-home";
  return personal ? <PersonalWorkspace /> : <FigmaOverhaul />;
}
