import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Room from "./pages/Room";
import RoleSelect from "./pages/RoleSelect";
import DevSpawn from "./pages/dev";
import InAppBrowserBlocker from "./components/InAppBrowserBlocker";

const isInsideMessengerOrSocialApp = () => {
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  return /FBAN|FBAV|Instagram|Messenger|FB_IAB|FB4A|FBIOS/i.test(ua);
};

function App() {
  const query = new URLSearchParams(window.location.search);
  const forceBlocker = query.get("forceBlocker") === "true";
  const bypass = query.get("bypass") === "true";

  const isBlocked = (isInsideMessengerOrSocialApp() && !bypass) || forceBlocker;

  if (isBlocked) {
    return <InAppBrowserBlocker />;
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/room" element={<Room />} />
        <Route path="/game" element={<Game />} />
        <Route path="/roleselect" element={<RoleSelect />} />
        <Route path="/dev-spawn" element={<DevSpawn />} />
      </Routes>
    </>
  );
}

export default App;
