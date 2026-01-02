import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Room from "./pages/Room";
import RoleSelect from "./pages/RoleSelect";
import DevSpawn from "./pages/dev";
import ThemeToggle from "./components/ThemeToggle";

function App() {
  return (
    <>
      <ThemeToggle />
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
