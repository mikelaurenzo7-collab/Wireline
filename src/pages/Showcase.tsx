import { Navigate } from "react-router";
import { signupHrefForPlan } from "../lib/signup-intent";

const FREE_SIGNUP = signupHrefForPlan("personal");

export default function Showcase() {
  return <Navigate to={FREE_SIGNUP} replace />;
}
