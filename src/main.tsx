import { createRoot } from "react-dom/client";
import { DeepBlueGrid } from "../app/game/DeepBlueGrid.tsx";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) throw new Error("Game root element was not found.");

createRoot(root).render(<DeepBlueGrid />);
