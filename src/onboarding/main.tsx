import { createRoot } from "react-dom/client";
import { Onboarding } from "./Onboarding.tsx";
import "../sidepanel/styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Root element not found");

createRoot(root).render(<Onboarding />);
