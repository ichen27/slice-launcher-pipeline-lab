import { createRoot } from "react-dom/client";
import Home from "../../app/page";
import Account from "../../app/account/page";
import "../../app/globals.css";
createRoot(document.getElementById("root")!).render(
  location.pathname === "/account" ? <Account /> : <Home />,
);
