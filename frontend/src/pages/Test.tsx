import "../card.css";
import UntitledSvg from "../assets/Untitled.svg";

export default function Card() {
  return (
    <><div className="card">
          <div className="content">
              <h3>Jason L</h3>
              <p>“Velocity completely changed the game for us.”</p>
          </div>
      </div><div className="image">
              <img src={UntitledSvg} alt="card" />
          </div></>
  );
}
